import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY;
const SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY;

if (!SUPABASE_URL) {
  throw new Error('SUPABASE_URL is not set in environment variables.');
}

if (!SUPABASE_SECRET_KEY) {
  throw new Error('SUPABASE_SECRET_KEY is not set in environment variables.');
}

if (!SUPABASE_PUBLISHABLE_KEY) {
  throw new Error('SUPABASE_PUBLISHABLE_KEY is not set in environment variables.');
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_SECRET_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false
  }
});

export function createSupabaseAuthClient() {
  return createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false
    }
  });
}
