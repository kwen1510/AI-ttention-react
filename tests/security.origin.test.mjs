import test from "node:test";
import assert from "node:assert/strict";

import {
  assertProductionRequestBoundary,
  createUnsafeRequestOriginGuard,
  isRequestHostAllowed,
  isRequestOriginAllowed,
  isUnsafeHttpMethod
} from "../server/middleware/originGuard.js";

test("production request boundary requires exact HTTPS origins", () => {
  assert.doesNotThrow(() => assertProductionRequestBoundary({
    nodeEnv: "production",
    allowedOrigins: new Set(["https://app.example"])
  }));
  assert.throws(() => assertProductionRequestBoundary({
    nodeEnv: "production",
    allowedOrigins: new Set()
  }), /required/i);
  assert.throws(() => assertProductionRequestBoundary({
    nodeEnv: "production",
    allowedOrigins: new Set(["http://app.example"])
  }), /https/i);
  assert.throws(() => assertProductionRequestBoundary({
    nodeEnv: "production",
    allowedOrigins: new Set(["https://app.example/path"])
  }), /exact/i);
});

test("origin guard allows same-origin unsafe requests and blocks cross-site browser posts", () => {
  const allowedOrigins = new Set(["https://app.example"]);

  assert.equal(isUnsafeHttpMethod("POST"), true);
  assert.equal(isUnsafeHttpMethod("GET"), false);

  assert.equal(isRequestOriginAllowed({
    origin: "https://app.example",
    host: "api.example",
    allowedOrigins
  }), true);

  assert.equal(isRequestOriginAllowed({
    origin: "https://app.example",
    host: "app.example",
    allowedOrigins: new Set()
  }), true);

  assert.equal(isRequestOriginAllowed({
    origin: "https://evil.example",
    host: "app.example",
    allowedOrigins
  }), false);

  assert.equal(isRequestHostAllowed({
    host: "app.example",
    allowedOrigins
  }), true);

  assert.equal(isRequestHostAllowed({
    host: "evil.example",
    allowedOrigins
  }), false);

  assert.equal(isRequestHostAllowed({
    host: "internal.example",
    forwardedHost: "app.example",
    allowedOrigins
  }), true);
});

test("unsafe origin guard rejects cross-site fetch metadata before route handlers", async () => {
  const guard = createUnsafeRequestOriginGuard(new Set(["https://app.example"]));
  const req = {
    method: "POST",
    get(name) {
      return {
        "sec-fetch-site": "cross-site",
        origin: "https://evil.example",
        host: "app.example"
      }[String(name).toLowerCase()];
    }
  };

  const res = {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    }
  };
  let nextCalled = false;

  guard(req, res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 403);
  assert.match(res.body.error, /cross-site/i);
});

test("unsafe origin guard rejects a forged host even when origin and host agree", () => {
  const guard = createUnsafeRequestOriginGuard(new Set(["https://app.example"]));
  const req = {
    method: "POST",
    get(name) {
      return {
        origin: "https://evil.example",
        host: "evil.example"
      }[String(name).toLowerCase()];
    }
  };
  const res = {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    }
  };
  let nextCalled = false;

  guard(req, res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 403);
  assert.match(res.body.error, /host/i);
});
