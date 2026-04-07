import test from "node:test";
import assert from "node:assert/strict";

import { MAX_AUDIO_UPLOAD_BYTES, isSupportedAudioUploadMimeType } from "../server/middleware/upload.js";
import { applyBaseTestEnv } from "./_helpers.mjs";

test("upload validation accepts supported audio types and rejects other mime types", () => {
  assert.equal(isSupportedAudioUploadMimeType("audio/webm"), true);
  assert.equal(isSupportedAudioUploadMimeType("audio/mpeg"), true);
  assert.equal(isSupportedAudioUploadMimeType("text/plain"), false);
});

test("student upload validation requires a session reference and positive group numbers", async () => {
  applyBaseTestEnv(10000);
  const { validateStudentUploadRequest } = await import("../server/routes/api.js");

  assert.throws(
    () => validateStudentUploadRequest({ file: null, sessionCode: "", groupNumber: 1 }),
    /missing file, session code, or group number/i
  );

  assert.throws(
    () => validateStudentUploadRequest({ file: { size: 1 }, sessionCode: "ROOM42", groupNumber: 0 }),
    /missing file, session code, or group number/i
  );

  assert.doesNotThrow(() => validateStudentUploadRequest({
    file: { size: 128 },
    sessionCode: "ROOM42",
    groupNumber: 2
  }));

  assert.doesNotThrow(() => validateStudentUploadRequest({
    file: { size: 128 },
    joinToken: "token",
    groupNumber: 2
  }));
});

test("audio upload size cap stays at 10 MB", () => {
  assert.equal(MAX_AUDIO_UPLOAD_BYTES, 10 * 1024 * 1024);
});
