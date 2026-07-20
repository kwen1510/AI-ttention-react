// Copy this file to public/supabase-config.js and fill in your values.
// The publishable key is safe to expose in the browser. Never put an
// sb_secret key, service-role key, or signing key in this file.

window.SUPABASE_URL = 'https://gjpnneuindwpkpsdaiyu.supabase.co';
window.SUPABASE_PUBLISHABLE_KEY = 'REPLACE_WITH_SB_PUBLISHABLE_KEY';

// Restrict client-side to teacher/admin users only (UX guard).
// Server-side checks still enforce teacher access and ownership.
window.ADMIN_ALLOWED_DOMAINS = ['ri.edu.sg', 'schools.gov.sg', 'ufinity.com'];
window.ADMIN_ALLOWED_EMAILS = [];
window.ADMIN_DOMAIN = window.ADMIN_ALLOWED_DOMAINS[0];
window.ADMIN_FIRST_LOGIN_REDIRECT = `${window.location.origin}/admin`;
window.ADMIN_EMAIL_REDIRECT_TO = window.ADMIN_FIRST_LOGIN_REDIRECT;
