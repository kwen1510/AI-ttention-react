import fetch from "node-fetch";
import FormData from "form-data";
import { ELEVENLABS_KEY } from "../config/env.js";

export function extractMime(mime) {
    if (!mime) return 'audio/webm';
    return mime.split(';')[0].trim().toLowerCase();
}

export async function transcribe(buf, format = 'audio/webm') {
    try {
        // Additional validation
        if (!buf || buf.length === 0) {
            return { text: "No audio data available", words: [] };
        }

        if (buf.length < 1000) {
            return { text: "Audio too short for transcription", words: [] };
        }

        const formData = new FormData();

        // Extract base MIME type and map formats correctly
        const baseMime = extractMime(format);
        let audioMime = baseMime;
        let filename = 'audio.webm';

        // Map formats using base MIME, not the whole string
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
                // Keep WebM as WebM (default case)
                audioMime = 'audio/webm';
                filename = 'audio.webm';
        }

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

        // Make direct API call instead of using SDK
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

            // Handle specific error cases
            if (response.status === 400) {
                try {
                    const errorJson = JSON.parse(errorText);
                    if (errorJson.detail?.message?.includes('corrupted')) {
                        return { text: "Audio quality issue - WebM container may be incomplete", words: [] };
                    }
                } catch (e) {
                    // If we can't parse the error, continue with generic error
                }
            }

            throw new Error(`API error: ${response.status} ${response.statusText}`);
        }

        const result = await response.json();

        // Return both text and word-level data
        return {
            text: result.text || "No transcription available",
            words: result.words || []
        };

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
