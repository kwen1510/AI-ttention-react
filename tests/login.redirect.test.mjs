import test from "node:test";
import assert from "node:assert/strict";

import { DEFAULT_REDIRECT_PATH, sanitizeRedirect } from "../client/src/lib/sanitizeRedirect.js";

test("sanitizeRedirect allows safe in-app paths", () => {
  assert.equal(sanitizeRedirect("/admin"), "/admin");
  assert.equal(sanitizeRedirect("/checkbox?mode=live#group-1"), "/checkbox?mode=live#group-1");
});

test("sanitizeRedirect falls back for unsafe or malformed values", () => {
  assert.equal(sanitizeRedirect(""), DEFAULT_REDIRECT_PATH);
  assert.equal(sanitizeRedirect("https://evil.example"), DEFAULT_REDIRECT_PATH);
  assert.equal(sanitizeRedirect("//evil.example"), DEFAULT_REDIRECT_PATH);
  assert.equal(sanitizeRedirect("/\\evil"), DEFAULT_REDIRECT_PATH);
  assert.equal(sanitizeRedirect("not-a-path"), DEFAULT_REDIRECT_PATH);
});
