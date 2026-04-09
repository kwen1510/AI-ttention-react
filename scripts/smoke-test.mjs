process.env.NODE_ENV = process.env.NODE_ENV || "test";
process.env.PORT = process.env.PORT || "0";
process.env.HOST = process.env.HOST || "127.0.0.1";
process.env.SKIP_SUPABASE_BOOTSTRAP = "true";
process.env.APP_ORIGINS = process.env.APP_ORIGINS || "http://127.0.0.1,http://localhost";
process.env.SUPABASE_URL = process.env.SUPABASE_URL || "https://example.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "test-service-role-key";
process.env.SESSION_JOIN_SECRET = process.env.SESSION_JOIN_SECRET || "smoke-test-session-secret";

const { http, startServer } = await import("../index.js");

async function ensureOk(pathname, matcher) {
  const response = await fetch(`${getBaseUrl()}${pathname}`);
  if (!response.ok) {
    throw new Error(`${pathname} returned ${response.status}`);
  }

  const body = await response.text();
  if (matcher && !matcher.test(body)) {
    throw new Error(`${pathname} returned an unexpected body`);
  }
}

async function ensureStatus(pathname, options, expectedStatus, matcher) {
  const response = await fetch(`${getBaseUrl()}${pathname}`, options);
  if (response.status !== expectedStatus) {
    throw new Error(`${pathname} returned ${response.status}, expected ${expectedStatus}`);
  }

  const body = await response.text();
  if (matcher && !matcher.test(body)) {
    throw new Error(`${pathname} returned an unexpected body`);
  }
}

function getBaseUrl() {
  const address = http.address();
  if (!address || typeof address === "string" || !address.port) {
    throw new Error("Smoke test server did not expose a TCP port");
  }

  return `http://127.0.0.1:${address.port}`;
}

function extractAssetPaths(html) {
  const matches = html.matchAll(/(?:src|href)=["']([^"']+)["']/g);
  return [...new Set(
    Array.from(matches, (match) => match[1])
      .filter((value) => value.startsWith("/"))
      .filter((value) => value !== "/")
  )];
}

async function ensureHeaderIncludes(pathname, headerName, expectedFragment) {
  const response = await fetch(`${getBaseUrl()}${pathname}`);
  if (!response.ok) {
    throw new Error(`${pathname} returned ${response.status}`);
  }

  const headerValue = response.headers.get(headerName);
  if (!headerValue || !headerValue.includes(expectedFragment)) {
    throw new Error(`${pathname} missing ${headerName}=${expectedFragment}`);
  }

  return response;
}

async function ensureAsset(pathname, { expectedStatus = 200, expectedContentType, expectedCacheControl } = {}) {
  const response = await fetch(`${getBaseUrl()}${pathname}`);
  if (response.status !== expectedStatus) {
    throw new Error(`${pathname} returned ${response.status}, expected ${expectedStatus}`);
  }

  if (expectedContentType) {
    const contentType = response.headers.get("content-type") || "";
    if (!contentType.includes(expectedContentType)) {
      throw new Error(`${pathname} returned unexpected content-type ${contentType}`);
    }
  }

  if (expectedCacheControl) {
    const cacheControl = response.headers.get("cache-control") || "";
    if (!cacheControl.includes(expectedCacheControl)) {
      throw new Error(`${pathname} returned unexpected cache-control ${cacheControl}`);
    }
  }
}

try {
  await startServer({ exitOnFailure: false });

  await ensureStatus("/health", {}, 200, /\{"ok":true\}/);
  const homeResponse = await ensureHeaderIncludes("/", "cache-control", "no-store");
  const homeHtml = await homeResponse.text();
  if (!/<!doctype html>/i.test(homeHtml)) {
    throw new Error("/ returned an unexpected body");
  }

  const assetPaths = extractAssetPaths(homeHtml);
  if (assetPaths.length === 0) {
    throw new Error("No static assets were discovered in the built index.html");
  }

  await ensureHeaderIncludes("/student", "cache-control", "no-store");
  await ensureHeaderIncludes("/admin", "cache-control", "no-store");
  await ensureHeaderIncludes("/history", "cache-control", "no-store");
  await ensureHeaderIncludes("/data", "cache-control", "no-store");
  await ensureOk("/login", /<html/i);

  for (const assetPath of assetPaths) {
    const expectedContentType = assetPath.endsWith(".css")
      ? "text/css"
      : assetPath.endsWith(".js")
        ? "javascript"
        : assetPath.endsWith(".svg")
          ? "image/svg+xml"
          : null;

    const expectedCacheControl = assetPath.startsWith("/assets/")
      ? "immutable"
      : null;

    await ensureAsset(assetPath, { expectedContentType, expectedCacheControl });
  }

  await ensureAsset("/assets/does-not-exist.css", {
    expectedStatus: 404,
    expectedContentType: "text/css"
  });
  await ensureAsset("/assets/does-not-exist.js", {
    expectedStatus: 404,
    expectedContentType: "javascript"
  });
  await ensureStatus(
    "/api/auth/me",
    {},
    401,
    /"error":"Unauthorized"/
  );

  console.log("Smoke test passed.");
} finally {
  if (http.listening) {
    await new Promise((resolve, reject) => {
      http.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
  }
}
