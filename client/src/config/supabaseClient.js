import { createClient } from '@supabase/supabase-js';

let supabaseInstance = null;

export function getSupabaseConfig() {
  return {
    url: import.meta.env.VITE_SUPABASE_URL,
    publishableKey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
    turnstileSiteKey: String(import.meta.env.VITE_TURNSTILE_SITE_KEY || '').trim(),
  };
}

export function getSupabaseClient() {
  if (!supabaseInstance) {
    const { url, publishableKey } = getSupabaseConfig();
    if (!url || !publishableKey) {
      throw new Error('Supabase client requires VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY');
    }
    supabaseInstance = createClient(url, publishableKey, {
      auth: {
        autoRefreshToken: true,
        persistSession: false,
        detectSessionInUrl: false,
      },
    });
  }
  return supabaseInstance;
}
