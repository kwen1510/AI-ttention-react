import { ELEVENLABS_KEY, PROVIDER_TIMEOUT_MS, TRANSCRIPTION_LANGUAGE } from "../config/env.js";
import { transcribeAudioWithOpenAI } from "./openai.js";

let mockChunkCounter = 0;
const IGNORED_TRANSCRIPTION_TEXTS = new Set([
    "no audio data available",
    "audio too short for transcription",
    "invalid webm container - only complete containers are supported",
    "webm container too small",
    "audio quality issue - please try again",
    "audio quality issue - webm container may be incomplete",
    "transcription temporarily unavailable",
    "no transcription available",
    "transcription failed"
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

function extractMockTranscriptFromBuffer(buf) {
    const raw = Buffer.isBuffer(buf) ? buf.toString("utf8") : "";
    const match = raw.match(/MOCK_TRANSCRIPT:\s*([\s\S]+)/);
    return match ? match[1].trim() : "";
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
        case 'audio/x-m4a':
            audioMime = 'audio/mp4';
            filename = 'audio.mp4';
            break;

        case 'audio/ogg':
        case 'audio/opus':
            audioMime = 'audio/ogg';
            filename = 'audio.ogg';
            break;

        case 'audio/mpeg':
        case 'audio/mp3':
            audioMime = 'audio/mpeg';
            filename = 'audio.mp3';
            break;

        case 'audio/aac':
            audioMime = 'audio/aac';
            filename = 'audio.aac';
            break;

        case 'audio/flac':
        case 'audio/x-flac':
            audioMime = 'audio/flac';
            filename = 'audio.flac';
            break;

        default:
            audioMime = 'audio/webm';
            filename = 'audio.webm';
    }

    return { audioMime, filename };
}

export function isIgnorableTranscriptionText(text) {
    const normalized = String(text || "").trim().toLowerCase();
    return IGNORED_TRANSCRIPTION_TEXTS.has(normalized)
        || /^(?:\[(?:silence|music|applause|laughter|noise)\]|\((?:silence|music|applause|laughter|noise)\))[.!]?$/.test(normalized);
}

export function normalizeElevenLabsTranscription(result) {
    const text = String(result?.text || "").trim();
    const words = Array.isArray(result?.words) ? result.words : [];
    const classifiedWords = words.filter((word) => typeof word?.type === "string");
    const hasClassifiedSpeech = classifiedWords.some((word) => (
        word.type === "word" && /[\p{L}\p{N}]/u.test(String(word.text || word.word || ""))
    ));
    const onlyNonSpeechEvents = classifiedWords.length > 0 && !hasClassifiedSpeech;

    return {
        text: onlyNonSpeechEvents ? "" : text,
        words: onlyNonSpeechEvents ? [] : words.filter((word) => word?.type !== "audio_event")
    };
}

export async function transcribe(buf, format = 'audio/webm', { signal = null } = {}) {
    try {
        if (isMockAiServicesEnabled()) {
            mockChunkCounter += 1;
            const suppliedTranscript = extractMockTranscriptFromBuffer(buf);
            if (suppliedTranscript) {
                return createMockTranscription(suppliedTranscript);
            }

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
        formData.append('file', new Blob([buf], { type: audioMime }), filename);
        formData.append('model_id', 'scribe_v2');
        formData.append('language_code', TRANSCRIPTION_LANGUAGE);
        formData.append('timestamps_granularity', 'word');

        if (ELEVENLABS_KEY) {
            try {
                const response = await fetch('https://api.elevenlabs.io/v1/speech-to-text', {
                    method: 'POST',
                    headers: {
                        'xi-api-key': ELEVENLABS_KEY
                    },
                    body: formData,
                    signal: signal
                        ? AbortSignal.any([signal, AbortSignal.timeout(PROVIDER_TIMEOUT_MS)])
                        : AbortSignal.timeout(PROVIDER_TIMEOUT_MS)
                });

                if (!response.ok) {
                    const errorText = await response.text();
                    console.error(`❌ ElevenLabs API error: ${response.status} ${response.statusText}`);

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
                return normalizeElevenLabsTranscription(result);
            } catch (err) {
                if (signal?.aborted) throw err;
                console.warn("⚠️ ElevenLabs transcription failed, falling back to OpenAI:", err.message);
            }
        } else {
            console.warn("⚠️ ELEVENLABS_KEY not configured; using OpenAI transcription fallback");
        }

        return await transcribeAudioWithOpenAI(buf, {
            mimeType: audioMime,
            filename,
            language: TRANSCRIPTION_LANGUAGE,
            signal
        });

    } catch (err) {
        console.error("❌ Transcription error:", err);
        console.error("Error details:", err.message);

        const audioError = err.message.includes('corrupted') || err.message.includes('invalid_content');
        const publicError = new Error(audioError
            ? "The audio chunk could not be decoded. Please retry the recording."
            : "The transcription service is temporarily unavailable. The audio chunk was not saved.");
        publicError.status = audioError ? 422 : 503;
        publicError.code = audioError ? "AUDIO_DECODE_FAILED" : "TRANSCRIPTION_PROVIDER_FAILED";
        publicError.expose = true;
        publicError.cause = err;
        throw publicError;
    }
}
