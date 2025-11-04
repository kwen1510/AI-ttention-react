import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { getSupabaseClient, getSupabaseConfig } from '../config/supabaseClient.js';

const AuthContext = createContext({
  supabase: null,
  session: null,
  user: null,
  loading: true,
  allowedDomains: [],
  signOut: async () => {},
});

function needsAuth(input) {
  if (!input) return false;
  const resolveUrl = (value) => {
    if (typeof value === 'string') return value;
    if (typeof Request !== 'undefined' && value instanceof Request) return value.url;
    return null;
  };

  const urlValue = resolveUrl(input);
  if (!urlValue) return false;
  try {
    const url = new URL(urlValue, typeof window !== 'undefined' ? window.location.href : 'http://localhost');
    return url.origin === (typeof window !== 'undefined' ? window.location.origin : url.origin) && url.pathname.startsWith('/api/');
  } catch {
    return false;
  }
}

export function AuthProvider({ children }) {
  const supabase = useMemo(() => getSupabaseClient(), []);
  const config = useMemo(() => getSupabaseConfig(), []);
  const [session, setSession] = useState(null);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    async function loadSession() {
      try {
        const { data } = await supabase.auth.getSession();
        if (!isMounted) return;
        setSession(data.session ?? null);
        setUser(data.session?.user ?? null);
      } catch (error) {
        console.error('Failed to load Supabase session', error);
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    loadSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!isMounted) return;
      setSession(nextSession ?? null);
      setUser(nextSession?.user ?? null);
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [supabase]);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const originalFetch = window.fetch.bind(window);

    window.fetch = async (input, init = {}) => {
      if (needsAuth(input)) {
        try {
          const currentSession = session ?? (await supabase.auth.getSession()).data.session;
          if (currentSession?.access_token) {
            const headers = new Headers(
              init.headers || (typeof Request !== 'undefined' && input instanceof Request ? input.headers : undefined) || {}
            );
            headers.set('Authorization', `Bearer ${currentSession.access_token}`);
            init = { ...init, headers };
          }
        } catch (error) {
          console.warn('Failed to attach Supabase auth header', error);
        }
      }
      return originalFetch(input, init);
    };

    return () => {
      window.fetch = originalFetch;
    };
  }, [session, supabase]);

  const value = useMemo(
    () => ({
      supabase,
      config,
      session,
      user,
      loading,
      allowedDomains: config.allowedDomains?.length ? config.allowedDomains : [],
      signOut: () => supabase.auth.signOut(),
    }),
    [config, loading, session, supabase, user]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
