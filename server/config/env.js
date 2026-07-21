import 'dotenv/config';

export const PORT = process.env.PORT || 10000;
export const NODE_ENV = process.env.NODE_ENV || 'development';
export const OPENAI_API_KEY = process.env.OPENAI_API_KEY || process.env.OPENAI_KEY;
export const ELEVENLABS_KEY = process.env.ELEVENLABS_KEY;
export const TRANSCRIPTION_LANGUAGE = process.env.TRANSCRIPTION_LANGUAGE || "en";
export const SUPABASE_URL = process.env.SUPABASE_URL;
export const SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY;
export const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY;

function boundedInteger(value, fallback, minimum, maximum) {
    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed >= minimum && parsed <= maximum ? parsed : fallback;
}

export const LIVE_AUDIO_MAX_BYTES = boundedInteger(
    process.env.LIVE_AUDIO_MAX_BYTES,
    2 * 1024 * 1024,
    64 * 1024,
    10 * 1024 * 1024
);
export const LIVE_AUDIO_MAX_CONCURRENCY = boundedInteger(
    process.env.LIVE_AUDIO_MAX_CONCURRENCY,
    4,
    1,
    32
);
export const LIVE_AUDIO_CHUNK_MS = boundedInteger(
    process.env.LIVE_AUDIO_CHUNK_MS,
    30_000,
    10_000,
    60_000
);
export const SUMMARY_INTERVAL_DEFAULT_MS = 30_000;
export const SUMMARY_INTERVAL_MIN_MS = 15_000;
export const SUMMARY_INTERVAL_MAX_MS = 300_000;
export const SUMMARY_GRACE_MS = boundedInteger(
    process.env.SUMMARY_GRACE_MS,
    3_000,
    0,
    15_000
);
export const SUMMARY_RECONCILE_EVERY = boundedInteger(
    process.env.SUMMARY_RECONCILE_EVERY,
    20,
    5,
    100
);
export const PROVIDER_TIMEOUT_MS = boundedInteger(
    process.env.PROVIDER_TIMEOUT_MS,
    60_000,
    10_000,
    120_000
);

if (!OPENAI_API_KEY) {
    console.warn("⚠️ OPENAI_API_KEY not set; AI features will be limited.");
}
