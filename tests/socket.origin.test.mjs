import test from "node:test";
import assert from "node:assert/strict";

import { applyBaseTestEnv } from "./_helpers.mjs";

test("socket origin validator accepts configured and same-host origins", async () => {
  applyBaseTestEnv(10000);
  process.env.APP_ORIGINS = "https://allowed.example";

  const { isSocketOriginAllowed } = await import(`../index.js?test=socket-origin-${Date.now()}`);
  const allowedOrigins = new Set(["https://allowed.example"]);

  assert.equal(
    isSocketOriginAllowed("https://allowed.example", allowedOrigins, { host: "api.example" }),
    true
  );

  assert.equal(
    isSocketOriginAllowed("https://ai-ttention-4lawq.ondigitalocean.app", allowedOrigins, {
      host: "ai-ttention-4lawq.ondigitalocean.app"
    }),
    true
  );

  assert.equal(
    isSocketOriginAllowed("https://ai-ttention-4lawq.ondigitalocean.app", allowedOrigins, {
      "x-forwarded-host": "ai-ttention-4lawq.ondigitalocean.app"
    }),
    true
  );

  assert.equal(
    isSocketOriginAllowed("https://evil.example", allowedOrigins, {
      host: "ai-ttention-4lawq.ondigitalocean.app"
    }),
    false
  );
});
