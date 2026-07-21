import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { assertEs256Jwks, readJwtHeader } from './lib/jwt-inspection.mjs';

const url = process.env.SUPABASE_URL;
const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY;
const secretKey = process.env.SUPABASE_SECRET_KEY;
if (!url || !publishableKey || !secretKey) {
  throw new Error('SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, and SUPABASE_SECRET_KEY are required');
}

const student = createClient(url, publishableKey, {
  auth: { persistSession: false, autoRefreshToken: false }
});
const admin = createClient(url, secretKey, {
  auth: { persistSession: false, autoRefreshToken: false }
});

let syntheticUserId;
let verificationError;
const result = {
  freshTokenUsesEs256: false,
  tokenKidMatchesPublicJwks: false,
  publicJwksContainsNoPrivateKey: false,
  syntheticUserDeleted: false
};

try {
  const { data, error } = await student.auth.signInAnonymously();
  if (error) throw error;
  syntheticUserId = data.user?.id;
  if (!syntheticUserId || !data.session?.access_token) {
    throw new Error('Anonymous sign-in returned an incomplete session');
  }

  const response = await fetch(`${url}/auth/v1/.well-known/jwks.json`, {
    signal: AbortSignal.timeout(10_000)
  });
  if (!response.ok) throw new Error(`JWKS request failed (${response.status})`);
  const jwks = await response.json();
  const header = readJwtHeader(data.session.access_token);
  assertEs256Jwks({ header, jwks });
  result.freshTokenUsesEs256 = true;
  result.tokenKidMatchesPublicJwks = true;
  result.publicJwksContainsNoPrivateKey = true;
} catch (error) {
  verificationError = error;
} finally {
  await student.realtime.disconnect();
  if (syntheticUserId) {
    const { error } = await admin.auth.admin.deleteUser(syntheticUserId);
    if (error) verificationError ??= error;
    else result.syntheticUserDeleted = true;
  }
}

if (verificationError) throw verificationError;
console.log(JSON.stringify(result, null, 2));
