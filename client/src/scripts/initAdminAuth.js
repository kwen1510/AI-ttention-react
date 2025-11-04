import { getSupabaseClient, getSupabaseConfig } from '../config/supabaseClient.js';

function normalizeDomainList(input) {
  if (Array.isArray(input)) return input;
  if (typeof input === 'string' && input.trim()) return [input];
  return [];
}

function toAbsoluteUrl(value) {
  try {
    return new URL(value, window.location.origin).href;
  } catch {
    return new URL('/admin', window.location.origin).href;
  }
}

function isApiRequest(input) {
  if (!input) return false;
  const resolveUrl = (value) => {
    if (typeof value === 'string') return value;
    if (typeof Request !== 'undefined' && value instanceof Request) return value.url;
    return null;
  };

  const value = resolveUrl(input);
  if (!value) return false;
  try {
    const url = new URL(value, window.location.href);
    return url.origin === window.location.origin && url.pathname.startsWith('/api/');
  } catch {
    return false;
  }
}

export function initAdminAuth() {
  const cleanupFns = [];
  const config = getSupabaseConfig();
  const supabase = getSupabaseClient();

  const allowedDomains = Array.from(
    new Set(
      [
        ...normalizeDomainList(config.allowedDomains),
        config.domain,
        'ri.edu.sg',
        'schools.gov.sg',
        'ufinity.com',
      ]
        .map((domain) => String(domain || '').trim().toLowerCase())
        .filter(Boolean)
    )
  );

  const defaultDomainLabel = allowedDomains.join(', ');

  const $ = (id) => document.getElementById(id);
  const emailEl = $('email');
  const sendBtn = $('sendCodeBtn');
  const otpSection = $('otpSection');
  const otpEl = $('otp');
  const verifyBtn = $('verifyBtn');
  const resendBtn = $('resendBtn');
  const signOutBtn = $('signOutBtn');
  const msg = $('msg');
  const error = $('error');
  const ok = $('ok');
  const cooldownSecDefault = 30;
  let cooldownTimer = null;
  let currentSession = null;

  if (!emailEl || !sendBtn) {
    console.warn('Login form not found, skipping admin auth initialisation');
    return () => {};
  }

  const emailRedirectTarget = config.emailRedirect || config.firstLoginRedirect || '/admin';
  const emailRedirectTo = toAbsoluteUrl(emailRedirectTarget);
  const searchParams = new URLSearchParams(window.location.search);
  const redirectTo = searchParams.get('redirect') || '/admin';

  function setStatus({ message = '', err = '', success = '' } = {}) {
    if (msg) msg.textContent = message;
    if (error) error.textContent = err;
    if (ok) ok.textContent = success;
  }

  function isAllowed(email) {
    const value = String(email || '').trim().toLowerCase();
    return allowedDomains.some((domain) => value.endsWith(`@${domain}`));
  }

  function startCooldown(sec = cooldownSecDefault) {
    let remaining = sec;
    if (!resendBtn) return;
    resendBtn.disabled = true;
    resendBtn.classList.remove('hidden');
    resendBtn.textContent = `Resend in ${remaining}s`;
    clearInterval(cooldownTimer);
    cooldownTimer = setInterval(() => {
      remaining -= 1;
      if (remaining <= 0) {
        clearInterval(cooldownTimer);
        resendBtn.disabled = false;
        resendBtn.textContent = 'Resend OTP';
      } else {
        resendBtn.textContent = `Resend in ${remaining}s`;
      }
    }, 1000);
  }

  function stopCooldown() {
    clearInterval(cooldownTimer);
    if (!resendBtn) return;
    resendBtn.textContent = 'Resend OTP';
    resendBtn.disabled = false;
  }

  async function refreshSessionUI() {
    const { data } = await supabase.auth.getSession();
    currentSession = data.session ?? null;
    if (!sendBtn || !otpSection || !signOutBtn) return;

    if (data.session?.user) {
      otpSection.classList.add('hidden');
      sendBtn.classList.add('hidden');
      signOutBtn.classList.remove('hidden');
      if (emailEl) emailEl.value = data.session.user.email || '';
      setStatus({ success: `Signed in as ${data.session.user.email}` });
    } else {
      signOutBtn.classList.add('hidden');
      sendBtn.classList.remove('hidden');
    }
  }

  async function recordLogin(session) {
    try {
      const user = session?.user;
      if (!user) return;
      await supabase.from('user_logins').insert({
        user_id: user.id,
        email: user.email,
        user_agent: navigator.userAgent || null,
      });
    } catch (err) {
      console.warn('Login logging failed (non-blocking):', err?.message || err);
    }
  }

  function resolvePostSignInDestination(session) {
    const user = session?.user;
    if (!user) return redirectTo;
    const createdAt = user.created_at;
    const lastSignInAt = user.last_sign_in_at;
    const firstLoginRedirect = config.firstLoginRedirect || null;
    const isFirstLogin = Boolean(
      firstLoginRedirect && (!lastSignInAt || (createdAt && createdAt === lastSignInAt))
    );
    return isFirstLogin ? firstLoginRedirect : redirectTo;
  }

  async function sendOtp() {
    setStatus({ message: 'Sending code…' });
    const email = emailEl.value;
    if (!isAllowed(email)) {
      setStatus({ err: `Only ${defaultDomainLabel} emails are allowed.` });
      return;
    }

    try {
      const { error: err } = await supabase.auth.signInWithOtp({
        email,
        options: {
          shouldCreateUser: true,
          emailRedirectTo,
        },
      });
      if (err) throw err;
      setStatus({ success: 'OTP sent. Check your inbox.' });
      otpSection.classList.remove('hidden');
      startCooldown();
    } catch (err) {
      console.error('Failed to send OTP', err);
      setStatus({ err: err?.message || 'Failed to send OTP. Please try again.' });
    }
  }

  async function resendOtp() {
    if (!resendBtn || resendBtn.disabled) return;
    resendBtn.disabled = true;
    await sendOtp();
  }

  async function verifyOtp() {
    if (!otpEl || !otpEl.value) return;
    setStatus({ message: 'Verifying…' });
    try {
      const { data, error: err } = await supabase.auth.verifyOtp({
        email: emailEl.value,
        token: otpEl.value,
        type: 'email',
      });
      if (err) throw err;
      if (!data.session) throw new Error('Invalid OTP response');
      await recordLogin(data.session);
      const destination = resolvePostSignInDestination(data.session);
      window.location.replace(destination);
    } catch (err) {
      console.error('Failed to verify OTP', err);
      setStatus({ err: err?.message || 'Verification failed. Please try again.' });
    }
  }

  function bindEvent(target, event, handler) {
    if (!target) return;
    target.addEventListener(event, handler);
    cleanupFns.push(() => target.removeEventListener(event, handler));
  }

  bindEvent(sendBtn, 'click', sendOtp);
  bindEvent(resendBtn, 'click', resendOtp);
  bindEvent(verifyBtn, 'click', verifyOtp);
  bindEvent(signOutBtn, 'click', () => {
    supabase.auth.signOut();
    stopCooldown();
    setStatus({ success: 'Signed out.' });
    otpSection.classList.add('hidden');
    sendBtn.classList.remove('hidden');
  });
  bindEvent(otpEl, 'keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      verifyOtp();
    }
  });

  const originalFetch = window.fetch.bind(window);
  window.fetch = async (input, init = {}) => {
    if (isApiRequest(input)) {
      try {
        const session = currentSession || (await supabase.auth.getSession()).data.session;
        if (session?.access_token) {
          const headers = new Headers(
            init.headers || (typeof Request !== 'undefined' && input instanceof Request ? input.headers : undefined) || {}
          );
          headers.set('Authorization', `Bearer ${session.access_token}`);
          init = { ...init, headers };
        }
      } catch (err) {
        console.warn('⚠️ Failed to attach Supabase auth header:', err?.message || err);
      }
    }
    return originalFetch(input, init);
  };
  cleanupFns.push(() => {
    window.fetch = originalFetch;
  });

  supabase.auth.onAuthStateChange(async (event, session) => {
    currentSession = session || null;
    await refreshSessionUI();
    if (event === 'SIGNED_IN' && session) {
      await recordLogin(session);
      const destination = resolvePostSignInDestination(session);
      window.location.replace(destination);
    }
  });

  refreshSessionUI();

  return () => {
    cleanupFns.forEach((fn) => {
      try {
        fn();
      } catch (err) {
        console.warn('Auth cleanup error', err);
      }
    });
    stopCooldown();
  };
}
