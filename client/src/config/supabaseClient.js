import { createClient } from '@supabase/supabase-js';
import { createPersistentAuthStorage } from '../lib/authSession.js';

let supabaseInstance = null;

function readWindowConfig(key) {
  if (typeof window === 'undefined') return undefined;
  return window[key];
}

function readArrayConfig(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  return String(value)
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

export function getSupabaseConfig() {
  const url = import.meta.env.VITE_SUPABASE_URL || readWindowConfig('SUPABASE_URL');
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || readWindowConfig('SUPABASE_ANON_KEY');
  const allowedDomains = readArrayConfig(
    import.meta.env.VITE_ADMIN_ALLOWED_DOMAINS || readWindowConfig('ADMIN_ALLOWED_DOMAINS')
  );
  const allowedEmails = readArrayConfig(
    import.meta.env.VITE_ADMIN_ALLOWED_EMAILS || readWindowConfig('ADMIN_ALLOWED_EMAILS')
  );
  const domain = import.meta.env.VITE_ADMIN_DOMAIN || readWindowConfig('ADMIN_DOMAIN');
  const firstLoginRedirect =
    import.meta.env.VITE_ADMIN_FIRST_LOGIN_REDIRECT || readWindowConfig('ADMIN_FIRST_LOGIN_REDIRECT');
  const emailRedirect =
    import.meta.env.VITE_ADMIN_EMAIL_REDIRECT_TO || readWindowConfig('ADMIN_EMAIL_REDIRECT_TO');

  return {
    url,
    anonKey,
    allowedDomains,
    allowedEmails,
    domain,
    firstLoginRedirect,
    emailRedirect,
  };
}

export function getSupabaseClient() {
  if (!supabaseInstance) {
    const { url, anonKey } = getSupabaseConfig();
    if (!url || !anonKey) {
      throw new Error('Supabase client requires SUPABASE_URL and SUPABASE_ANON_KEY');
    }
    supabaseInstance = createClient(url, anonKey, {
      auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true,
        storage: createPersistentAuthStorage(),
      },
    });
  }
  return supabaseInstance;
}
