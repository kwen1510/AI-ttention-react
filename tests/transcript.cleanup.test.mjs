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

test("transcript segment ids identify retried chunks", async () => {
  applyBaseTestEnv(10000);
  const { hasTranscriptSegment } = await import(`../server/services/transcript.js?test=segment-id-${Date.now()}`);
  assert.equal(hasTranscriptSegment([{ id: "chunk-one" }], "chunk-one"), true);
  assert.equal(hasTranscriptSegment([{ id: "chunk-one" }], "chunk-two"), false);
});

test("summary snapshots tolerate legacy non-UUID chunk ids", async () => {
  applyBaseTestEnv(10000);
  const { snapshotSegmentId } = await import(`../server/services/transcript.js?test=snapshot-id-${Date.now()}`);
  assert.equal(snapshotSegmentId("12d68f25-0ae5-47a7-8a76-9b642f609c8e"), "12d68f25-0ae5-47a7-8a76-9b642f609c8e");
  assert.equal(snapshotSegmentId("summaryspeech1784603042001"), null);
  assert.equal(snapshotSegmentId("abababababababababababababababab"), null);
});
