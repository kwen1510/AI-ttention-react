import 'dotenv/config';

export const PORT = process.env.PORT || 10000;
export const NODE_ENV = process.env.NODE_ENV || 'development';
export const OPENAI_API_KEY = process.env.OPENAI_API_KEY || process.env.OPENAI_KEY;
export const ELEVENLABS_KEY = process.env.ELEVENLABS_KEY;
export const TRANSCRIPTION_LANGUAGE = process.env.TRANSCRIPTION_LANGUAGE || "en";
export const SUPABASE_URL = process.env.SUPABASE_URL;
export const SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY;
export const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY;

if (!OPENAI_API_KEY) {
    console.warn("⚠️ OPENAI_API_KEY not set; AI features will be limited.");
}
