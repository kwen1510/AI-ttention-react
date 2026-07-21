import assert from "node:assert/strict";
import test from "node:test";

import { applyBaseTestEnv } from "./_helpers.mjs";

test("ElevenLabs uses Scribe v2 and ignores classified non-speech without dropping short speech", async () => {
  applyBaseTestEnv(10001);
  process.env.ELEVENLABS_KEY = "test-elevenlabs-key";
  const originalFetch = globalThis.fetch;
  const responses = [
    {
      text: "[applause]",
      words: [{ text: "[applause]", start: 0, end: 1, type: "audio_event" }]
    },
    {
      text: "Yes.",
      words: [{ text: "Yes.", start: 0, end: 0.4, type: "word" }]
    },
    ...Array.from({ length: 4 }, () => ({
      text: "Format works.",
      words: [{ text: "Format", start: 0, end: 0.4, type: "word" }]
    }))
  ];
  const requestedModels = [];
  const requestedFiles = [];

  globalThis.fetch = async (_url, options) => {
    requestedModels.push(options.body.get("model_id"));
    const file = options.body.get("file");
    requestedFiles.push({ name: file.name, type: file.type });
    return {
      ok: true,
      json: async () => responses.shift()
    };
  };

  try {
    const service = await import(`../server/services/elevenlabs.js?test=${Date.now()}`);
    const wav = Buffer.alloc(1_200);
    wav.write("RIFF", 0, "ascii");
    wav.write("WAVE", 8, "ascii");

    const quiet = await service.transcribe(wav, "audio/wav");
    const shortSpeech = await service.transcribe(wav, "audio/wav");
    await service.transcribe(wav, "audio/mpeg");
    await service.transcribe(wav, "audio/aac");
    await service.transcribe(wav, "audio/flac");
    await service.transcribe(wav, "audio/x-m4a");

    assert.equal(quiet.text, "");
    assert.deepEqual(quiet.words, []);
    assert.equal(shortSpeech.text, "Yes.");
    assert.equal(shortSpeech.words.length, 1);
    assert.equal(requestedModels.every((model) => model === "scribe_v2"), true);
    assert.deepEqual(requestedFiles.slice(2), [
      { name: "audio.mp3", type: "audio/mpeg" },
      { name: "audio.aac", type: "audio/aac" },
      { name: "audio.flac", type: "audio/flac" },
      { name: "audio.mp4", type: "audio/mp4" }
    ]);
    assert.equal(service.isIgnorableTranscriptionText("[Music]"), true);
    assert.equal(service.isIgnorableTranscriptionText("I disagree"), false);
  } finally {
    globalThis.fetch = originalFetch;
    delete process.env.ELEVENLABS_KEY;
  }
});
