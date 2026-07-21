function decodeBase64UrlJson(value) {
  const normalized = String(value || '').replace(/-/g, '+').replace(/_/g, '/');
  const padding = normalized.length % 4 === 0 ? '' : '='.repeat(4 - (normalized.length % 4));
  return JSON.parse(Buffer.from(`${normalized}${padding}`, 'base64').toString('utf8'));
}

export function readJwtHeader(token) {
  const [encodedHeader] = String(token || '').split('.');
  if (!encodedHeader) throw new Error('Access token has no JWT header');
  return decodeBase64UrlJson(encodedHeader);
}

export function assertEs256Jwks({ header, jwks }) {
  if (header?.alg !== 'ES256' || typeof header?.kid !== 'string' || !header.kid) {
    throw new Error('Fresh Supabase access token is not signed with ES256 and a key ID');
  }
  const keys = Array.isArray(jwks?.keys) ? jwks.keys : [];
  const signingKey = keys.find((key) => key?.kid === header.kid);
  if (!signingKey
    || signingKey.alg !== 'ES256'
    || signingKey.kty !== 'EC'
    || signingKey.crv !== 'P-256'
    || typeof signingKey.x !== 'string'
    || typeof signingKey.y !== 'string') {
    throw new Error('Fresh token key ID does not match a public P-256/ES256 JWKS key');
  }
  if (keys.some((key) => Object.prototype.hasOwnProperty.call(key, 'd'))) {
    throw new Error('JWKS unexpectedly exposes private key material');
  }
  return true;
}
