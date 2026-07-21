import assert from 'node:assert/strict';
import test from 'node:test';
import { buildAnonymousSignInCredentials } from '../client/src/lib/realtimeClient.js';

test('anonymous Auth forwards a completed CAPTCHA token to Supabase', () => {
  assert.deepEqual(buildAnonymousSignInCredentials(' turnstile-token '), {
    options: { captchaToken: 'turnstile-token' }
  });
});

test('anonymous Auth remains compatible until CAPTCHA is configured', () => {
  assert.equal(buildAnonymousSignInCredentials(''), undefined);
  assert.equal(buildAnonymousSignInCredentials(null), undefined);
});
