import test from "node:test";
import assert from "node:assert/strict";

import { applyBaseTestEnv } from "./_helpers.mjs";

test("transcript cleanup context keeps only the recent bounded tail", async () => {
  applyBaseTestEnv(10000);
  const { buildTranscriptCleanupContext } = await import(`../server/services/transcript.js?test=context-${Date.now()}`);

  const segments = [
    { text: "Alpha beta gamma delta epsilon zeta eta theta iota kappa lambda mu." },
    { text: "This second chunk should be dropped because only the latest bounded tail should remain in the cleanup context." },
    { text: "Recent context one mentions the classroom discussion and the presentation rubric." },
    { text: "Recent context two mentions evidence, collaboration, and clear communication." }
  ];

  const context = buildTranscriptCleanupContext(segments, {
    maxSegments: 2,
    maxWords: 18,
    maxChars: 200
  });

  assert.match(context, /presentation rubric/);
  assert.match(context, /clear communication/);
  assert.doesNotMatch(context, /Alpha beta gamma/);
  assert.ok(context.split(/\s+/).length <= 18);
  assert.ok(context.length <= 200);
});

test("boundary overlap trimming removes repeated seam text", async () => {
  applyBaseTestEnv(10000);
  const { trimTranscriptBoundaryOverlap } = await import(`../server/services/transcript.js?test=overlap-${Date.now()}`);

  const previous = "Students should explain their reasoning clearly and provide one example from the text";
  const next = "their reasoning clearly and provide one example from the text before discussing the conclusion";

  assert.equal(
    trimTranscriptBoundaryOverlap(previous, next),
    "before discussing the conclusion"
  );
});

test("boundary overlap trimming leaves unrelated text unchanged", async () => {
  applyBaseTestEnv(10000);
  const { trimTranscriptBoundaryOverlap } = await import(`../server/services/transcript.js?test=no-overlap-${Date.now()}`);

  const next = "A completely new idea starts here without any repeated boundary words.";
  assert.equal(
    trimTranscriptBoundaryOverlap("Earlier chunk about introductions only", next),
    next
  );
});
