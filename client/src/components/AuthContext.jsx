import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import {
  createStagingBypassHeaders,
  createStagingBypassTeacherProfile,
  isStagingBypassPath,
} from '../lib/stagingBypass.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const location = useLocation();
  const isStagingBypass = isStagingBypassPath(location.pathname);
  const isPublicStudentPath = location.pathname === '/student'
    || location.pathname === '/s'
    || location.pathname.startsWith('/async/j/');
  const [teacherProfile, setTeacherProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  const applyTeacherResponse = useCallback((data) => {
    const resolvedRole = data?.user?.role || 'teacher';
    const profile = data?.user
      ? {
          ...data.user,
          role: resolvedRole,
          isAdmin: Boolean(data.isAdmin || data.user?.isAdmin || resolvedRole === 'admin'),
        }
      : null;
    setTeacherProfile(profile);
    return profile;
  }, []);

  const refreshAuth = useCallback(async () => {
    if (isPublicStudentPath) {
      setTeacherProfile(null);
      setLoading(false);
      return null;
    }
    if (isStagingBypass) {
      const profile = { ...createStagingBypassTeacherProfile(), isAdmin: false };
      setTeacherProfile(profile);
      setLoading(false);
      return profile;
    }

    setLoading(true);
    try {
      const response = await fetch('/api/auth/me', {
        method: 'GET',
        credentials: 'same-origin',
        headers: { Accept: 'application/json' },
      });
      if (!response.ok) {
        setTeacherProfile(null);
        return null;
      }
      return applyTeacherResponse(await response.json());
    } catch (error) {
      console.warn('Unable to restore teacher login', error);
      setTeacherProfile(null);
      return null;
    } finally {
      setLoading(false);
    }
  }, [applyTeacherResponse, isPublicStudentPath, isStagingBypass]);

  useEffect(() => {
    void refreshAuth();
  }, [refreshAuth]);

  useEffect(() => {
    if (!isStagingBypass || typeof window === 'undefined') return undefined;
    const originalFetch = window.fetch.bind(window);
    window.fetch = (input, init = {}) => {
      const inputHeaders = init.headers || (typeof Request !== 'undefined' && input instanceof Request ? input.headers : undefined);
      return originalFetch(input, {
        ...init,
        headers: createStagingBypassHeaders(inputHeaders),
      });
    };
    return () => {
      window.fetch = originalFetch;
    };
  }, [isStagingBypass]);

  const signOut = useCallback(async () => {
    if (!isStagingBypass) {
      await fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'same-origin',
      }).catch(() => null);
    }
    setTeacherProfile(null);
    if (typeof window !== 'undefined') window.location.assign('/login');
  }, [isStagingBypass]);

  const value = useMemo(() => ({
    session: null,
    user: teacherProfile,
    loading,
    isTeacher: Boolean(teacherProfile),
    role: teacherProfile?.role || null,
    isAdmin: Boolean(teacherProfile?.isAdmin || teacherProfile?.role === 'admin'),
    isStagingBypass,
    teacherLoading: loading,
    teacherProfile,
    refreshAuth,
    signOut,
  }), [isStagingBypass, loading, refreshAuth, signOut, teacherProfile]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
}
