import fetch from "node-fetch";
import FormData from "form-data";
import { ELEVENLABS_KEY } from "../config/env.js";
import { transcribeAudioWithOpenAI } from "./openai.js";

let mockChunkCounter = 0;
const IGNORED_TRANSCRIPTION_TEXTS = new Set([
    "No audio data available",
    "Audio too short for transcription",
    "Invalid WebM container - only complete containers are supported",
    "WebM container too small",
    "Audio quality issue - please try again",
    "Audio quality issue - WebM container may be incomplete",
    "Transcription temporarily unavailable",
    "No transcription available",
    "Transcription failed"
]);

function isMockAiServicesEnabled() {
    return process.env.MOCK_AI_SERVICES === "true" && process.env.ALLOW_DEV_TEST === "true";
}

function createMockTranscription(text) {
    const words = String(text || "")
        .split(/\s+/)
        .filter(Boolean)
        .map((word, index) => ({
            word,
            start: index * 0.42,
            end: (index + 1) * 0.42
        }));

    return {
        text,
        words
    };
}

export function extractMime(mime) {
    if (!mime) return 'audio/webm';
    return mime.split(';')[0].trim().toLowerCase();
}

function resolveAudioUploadMetadata(format) {
    const baseMime = extractMime(format);
    let audioMime = baseMime;
    let filename = 'audio.webm';

    switch (baseMime) {
        case 'audio/wav':
        case 'audio/x-wav':
        case 'audio/wave':
        case 'audio/pcm':
            audioMime = 'audio/wav';
            filename = 'audio.wav';
            break;

        case 'audio/mp4':
        case 'audio/m4a':
            audioMime = 'audio/mp4';
            filename = 'audio.mp4';
            break;

        case 'audio/ogg':
        case 'audio/opus':
            audioMime = 'audio/ogg';
            filename = 'audio.ogg';
            break;

        default:
            audioMime = 'audio/webm';
            filename = 'audio.webm';
    }

    return { audioMime, filename };
}

export function isIgnorableTranscriptionText(text) {
    return IGNORED_TRANSCRIPTION_TEXTS.has(String(text || "").trim());
}

export async function transcribe(buf, format = 'audio/webm') {
    try {
        if (isMockAiServicesEnabled()) {
            mockChunkCounter += 1;
            return createMockTranscription(
                `Mock transcript chunk ${mockChunkCounter}. Testing one two three. Summary updates should continue while recording.`
            );
        }

        // Additional validation
        if (!buf || buf.length === 0) {
            return { text: "No audio data available", words: [] };
        }

        if (buf.length < 1000) {
            return { text: "Audio too short for transcription", words: [] };
        }

        const formData = new FormData();
        const { audioMime, filename } = resolveAudioUploadMetadata(format);

        // Validate audio headers based on format
        const header = buf.slice(0, 4).toString('hex');

        // Additional validation for WebM containers
        if (audioMime === 'audio/webm') {
            if (header !== '1a45dfa3') {
                return { text: "Invalid WebM container - only complete containers are supported", words: [] };
            }

            // Check for minimum WebM container size
            if (buf.length < 1000) {
                return { text: "WebM container too small", words: [] };
            }
        }

        // Add the audio buffer as a file
        formData.append('file', buf, {
            filename: filename,
            contentType: audioMime
        });
        formData.append('model_id', 'scribe_v1');
        formData.append('timestamps_granularity', 'word');

        if (ELEVENLABS_KEY) {
            try {
                const response = await fetch('https://api.elevenlabs.io/v1/speech-to-text', {
                    method: 'POST',
                    headers: {
                        'xi-api-key': ELEVENLABS_KEY,
                        ...formData.getHeaders()
                    },
                    body: formData
                });

                if (!response.ok) {
                    const errorText = await response.text();
                    console.error(`❌ ElevenLabs API error: ${response.status} ${response.statusText}`);
                    console.error('Error response:', errorText);

                    if (response.status === 400) {
                        try {
                            const errorJson = JSON.parse(errorText);
                            if (errorJson.detail?.message?.includes('corrupted')) {
                                return { text: "Audio quality issue - WebM container may be incomplete", words: [] };
                            }
                        } catch {
                            // Ignore JSON parse issues and fall through to provider fallback.
                        }
                    }

                    const error = new Error(`API error: ${response.status} ${response.statusText}`);
                    error.status = response.status;
                    throw error;
                }

                const result = await response.json();
                return {
                    text: result.text || "No transcription available",
                    words: result.words || []
                };
            } catch (err) {
                console.warn("⚠️ ElevenLabs transcription failed, falling back to OpenAI:", err.message);
            }
        } else {
            console.warn("⚠️ ELEVENLABS_KEY not configured; using OpenAI transcription fallback");
        }

        return await transcribeAudioWithOpenAI(buf, {
            mimeType: audioMime,
            filename
        });

    } catch (err) {
        console.error("❌ Transcription error:", err);
        console.error("Error details:", err.message);

        // Return a more user-friendly error message
        if (err.message.includes('corrupted') || err.message.includes('invalid_content')) {
            return { text: "Audio quality issue - please try again", words: [] };
        }

        return { text: "Transcription temporarily unavailable", words: [] };
    }
}
