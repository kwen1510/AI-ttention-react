import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import {
  liveAudioUpload,
  MAX_AUDIO_UPLOAD_BYTES,
  isLikelySupportedAudioBuffer,
  isSupportedAudioUploadMimeType
} from "../server/middleware/upload.js";
import { applyBaseTestEnv } from "./_helpers.mjs";

test("upload validation accepts supported audio types and rejects other mime types", () => {
  assert.equal(isSupportedAudioUploadMimeType("audio/webm;codecs=opus"), true);
  assert.equal(isSupportedAudioUploadMimeType("audio/mpeg"), true);
  assert.equal(isSupportedAudioUploadMimeType("audio/not-real"), false);
  assert.equal(isSupportedAudioUploadMimeType("text/plain"), false);
});

test("audio payload validation checks file signatures outside mock mode", async () => {
  applyBaseTestEnv(10001);
  const previousAllowDevTest = process.env.ALLOW_DEV_TEST;
  const previousMockAiServices = process.env.MOCK_AI_SERVICES;

  try {
    process.env.ALLOW_DEV_TEST = "false";
    process.env.MOCK_AI_SERVICES = "false";
    const { validateAudioUploadPayload } = await import("../server/routes/api.js");

    assert.equal(isLikelySupportedAudioBuffer(Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0x01]), "audio/webm"), true);
    assert.equal(isLikelySupportedAudioBuffer(Buffer.from("not really audio"), "audio/webm"), false);

    assert.throws(
      () => validateAudioUploadPayload({
        buffer: Buffer.from("not really audio"),
        mimetype: "audio/webm"
      }),
      /invalid or unsupported audio file/i
    );

    process.env.ALLOW_DEV_TEST = "true";
    process.env.MOCK_AI_SERVICES = "true";
    assert.doesNotThrow(() => validateAudioUploadPayload({
      buffer: Buffer.from("MOCK_TRANSCRIPT: testing"),
      mimetype: "audio/webm"
    }));
  } finally {
    if (previousAllowDevTest === undefined) {
      delete process.env.ALLOW_DEV_TEST;
    } else {
      process.env.ALLOW_DEV_TEST = previousAllowDevTest;
    }
    if (previousMockAiServices === undefined) {
      delete process.env.MOCK_AI_SERVICES;
    } else {
      process.env.MOCK_AI_SERVICES = previousMockAiServices;
    }
  }
});

test("audio upload size cap stays at 10 MB", () => {
  assert.equal(MAX_AUDIO_UPLOAD_BYTES, 10 * 1024 * 1024);
});

test("live audio uses a separate bounded parser", () => {
  assert.ok(liveAudioUpload);
});

test("all API audio upload handlers validate the file payload signature", () => {
  const source = fs.readFileSync(new URL("../server/routes/api.js", import.meta.url), "utf8");
  const lines = source.split("\n");
  const uploadRoutes = ["/transcribe-chunk", "/async/join/:shareId/upload"].map((path) => {
    const index = lines.findIndex((line) => line.includes(`router.post("${path}"`));
    assert.notEqual(index, -1, `${path} route should exist`);
    let body = "";
    for (let bodyIndex = index; bodyIndex < lines.length; bodyIndex += 1) {
      if (bodyIndex > index && lines[bodyIndex].startsWith("router.")) {
        break;
      }
      body += `${lines[bodyIndex]}\n`;
    }
    return { path, body };
  });

  assert.equal(uploadRoutes.length, 2, "only the live and asynchronous upload handlers should remain");

  for (const route of uploadRoutes) {
    assert.match(
      route.body,
      /validateAudioUploadPayload\(/,
      `${route.path} must validate uploaded audio payloads`
    );
  }
});
