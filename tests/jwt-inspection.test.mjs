import assert from 'node:assert/strict';
import test from 'node:test';
import { assertEs256Jwks, readJwtHeader } from '../scripts/lib/jwt-inspection.mjs';

function tokenWithHeader(header) {
  const encoded = Buffer.from(JSON.stringify(header)).toString('base64url');
  return `${encoded}.payload.signature`;
}

test('ES256 verifier matches a fresh token to a public P-256 JWKS key', () => {
  const header = readJwtHeader(tokenWithHeader({ alg: 'ES256', kid: 'current-key' }));
  assert.equal(assertEs256Jwks({
    header,
    jwks: { keys: [{ kid: 'current-key', alg: 'ES256', kty: 'EC', crv: 'P-256', x: 'x', y: 'y' }] }
  }), true);
});

test('ES256 verifier rejects legacy, mismatched, and private JWKS material', () => {
  assert.throws(() => assertEs256Jwks({
    header: { alg: 'HS256' },
    jwks: { keys: [] }
  }), /not signed with ES256/);
  assert.throws(() => assertEs256Jwks({
    header: { alg: 'ES256', kid: 'missing' },
    jwks: { keys: [] }
  }), /does not match/);
  assert.throws(() => assertEs256Jwks({
    header: { alg: 'ES256', kid: 'key' },
    jwks: { keys: [{ kid: 'key', alg: 'ES256', kty: 'EC', crv: 'P-256', x: 'x', y: 'y', d: 'private' }] }
  }), /private key material/);
});
