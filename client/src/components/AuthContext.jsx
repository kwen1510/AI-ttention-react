import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { getSupabaseClient, getSupabaseConfig } from '../config/supabaseClient.js';
import {
  createStagingBypassHeaders,
  createStagingBypassTeacherProfile,
  isStagingBypassPath,
} from '../lib/stagingBypass.js';

const AuthContext = createContext({
  supabase: null,
  session: null,
  user: null,
  loading: true,
  isTeacher: false,
  isStagingBypass: false,
  teacherLoading: true,
  teacherProfile: null,
  signOut: async () => {},
});

function needsAuth(input) {
  if (!input) return false;
  const resolveUrl = (value) => {
    if (typeof value === 'string') return value;
    if (typeof URL !== 'undefined' && value instanceof URL) return value.toString();
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
  const location = useLocation();
  const isStagingBypass = isStagingBypassPath(location.pathname);
  const supabase = useMemo(() => (isStagingBypass ? null : getSupabaseClient()), [isStagingBypass]);
  const config = useMemo(() => (isStagingBypass ? null : getSupabaseConfig()), [isStagingBypass]);
  const [session, setSession] = useState(null);
  const [user, setUser] = useState(null);
  const [sessionLoading, setSessionLoading] = useState(true);
  const [teacherLoading, setTeacherLoading] = useState(true);
  const [isTeacher, setIsTeacher] = useState(false);
  const [teacherProfile, setTeacherProfile] = useState(null);
  const [fetchReady, setFetchReady] = useState(typeof window === 'undefined');

  useEffect(() => {
    if (isStagingBypass) {
      const teacherProfile = createStagingBypassTeacherProfile();
      setSession(null);
      setUser(teacherProfile);
      setTeacherProfile(teacherProfile);
      setIsTeacher(true);
      setSessionLoading(false);
      setTeacherLoading(false);
      return undefined;
    }

    let isMounted = true;

    async function loadSession() {
      try {
        const { data } = await supabase.auth.getSession();
        if (!isMounted) return;
        setSession(data.session ?? null);
        setUser(data.session?.user ?? null);
        if (data.session) {
          console.log('✅ Supabase session loaded:', data.session.user?.email);
        } else {
          console.warn('⚠️ No Supabase session found - user may need to log in');
        }
      } catch (error) {
        console.error('Failed to load Supabase session', error);
      } finally {
        if (isMounted) setSessionLoading(false);
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
  }, [isStagingBypass, supabase]);

  useEffect(() => {
    if (isStagingBypass) {
      const teacherProfile = createStagingBypassTeacherProfile();
      setTeacherProfile(teacherProfile);
      setIsTeacher(true);
      setTeacherLoading(false);
      return undefined;
    }

    let isMounted = true;

    async function loadTeacherAccess() {
      if (!session?.access_token) {
        if (!isMounted) return;
        setTeacherProfile(null);
        setIsTeacher(false);
        setTeacherLoading(false);
        return;
      }

      setTeacherLoading(true);

      try {
        const response = await fetch('/api/auth/me', {
          headers: {
            Authorization: `Bearer ${session.access_token}`
          }
        });

        if (!isMounted) return;

        if (response.ok) {
          const data = await response.json();
          setIsTeacher(Boolean(data.teacher));
          setTeacherProfile(data.user ?? null);
          return;
        }

        if (response.status === 401 || response.status === 403) {
          setIsTeacher(false);
          setTeacherProfile(null);
          return;
        }

        console.warn('Unexpected /api/auth/me response:', response.status);
        setIsTeacher(false);
        setTeacherProfile(null);
      } catch (error) {
        if (!isMounted) return;
        console.warn('Failed to load teacher access status', error);
        setIsTeacher(false);
        setTeacherProfile(null);
      } finally {
        if (isMounted) {
          setTeacherLoading(false);
        }
      }
    }

    loadTeacherAccess();

    return () => {
      isMounted = false;
    };
  }, [isStagingBypass, session?.access_token]);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const originalFetch = window.fetch.bind(window);
    setFetchReady(false);

    window.fetch = async (input, init = {}) => {
      if (needsAuth(input)) {
        if (isStagingBypass) {
          const headers = createStagingBypassHeaders(
            init.headers || (typeof Request !== 'undefined' && input instanceof Request ? input.headers : undefined)
          );
          init = { ...init, headers };
          console.log('🧪 Staging bypass attached to request:', typeof input === 'string' ? input : input?.url);
        } else {
          try {
            const currentSession = session ?? (await supabase.auth.getSession()).data.session;
            if (currentSession?.access_token) {
              const headers = new Headers(
                init.headers || (typeof Request !== 'undefined' && input instanceof Request ? input.headers : undefined) || {}
              );
              headers.set('Authorization', `Bearer ${currentSession.access_token}`);
              init = { ...init, headers };
              console.log('✅ Auth token attached to request:', typeof input === 'string' ? input : input?.url);
            } else {
              console.warn('⚠️ No session available for authenticated request:', typeof input === 'string' ? input : input?.url);
            }
          } catch (error) {
            console.warn('Failed to attach Supabase auth header', error);
          }
        }
      }
      return originalFetch(input, init);
    };

    setFetchReady(true);

    return () => {
      window.fetch = originalFetch;
      setFetchReady(false);
    };
  }, [isStagingBypass, session, supabase]);

  const value = useMemo(
    () => ({
      supabase,
      config,
      session,
      user,
      loading: sessionLoading || teacherLoading || !fetchReady,
      isTeacher,
      isStagingBypass,
      teacherLoading,
      teacherProfile,
      signOut: () => {
        if (supabase) {
          return supabase.auth.signOut();
        }

        if (typeof window !== 'undefined') {
          window.location.assign('/student?blocked=teacher');
        }

        return Promise.resolve();
      },
    }),
    [config, fetchReady, isStagingBypass, isTeacher, session, sessionLoading, supabase, teacherLoading, teacherProfile, user]
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
