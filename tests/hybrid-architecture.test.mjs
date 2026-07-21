import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import { createDbOverrides } from "./api.integration.helpers.mjs";
import { applyBaseTestEnv } from "./_helpers.mjs";

test("summary intervals default to 30 seconds and enforce 15–300 second boundaries", async () => {
  applyBaseTestEnv(0);
  const { normalizeSummaryIntervalMs } = await import("../server/routes/api.js");
  assert.equal(normalizeSummaryIntervalMs(undefined), 30_000);
  assert.equal(normalizeSummaryIntervalMs(15_000), 15_000);
  assert.equal(normalizeSummaryIntervalMs(300_000), 300_000);
  assert.equal(normalizeSummaryIntervalMs(14_999, null), null);
  assert.equal(normalizeSummaryIntervalMs(300_001, null), null);
  assert.equal(normalizeSummaryIntervalMs("not-a-number", null), null);
});

test("live audio capacity rejects before buffering once the configured boundary is full", async () => {
  const capacity = await import("../server/services/liveAudioCapacity.js");
  capacity.__resetLiveAudioCapacityForTests();
  const releases = [];
  const configured = capacity.getLiveAudioMetrics().capacity;
  for (let index = 0; index < configured; index += 1) releases.push(capacity.acquireLiveAudioCapacity());
  assert.ok(releases.every(Boolean));
  assert.equal(capacity.acquireLiveAudioCapacity(), null);
  releases[0]();
  const replacement = capacity.acquireLiveAudioCapacity();
  assert.equal(typeof replacement, "function");
  replacement();
  releases.slice(1).forEach((release) => release());
  assert.equal(capacity.getLiveAudioMetrics().active, 0);
});

test("stable live chunk IDs claim once and completed chunks become replay-safe", async () => {
  applyBaseTestEnv(0);
  const dbModule = await import("../server/db/db.js");
  const chunks = await import("../server/services/liveAudioChunks.js");
  const overrides = createDbOverrides({ live_audio_chunks: [] });
  dbModule.__setDbTestOverrides(overrides);
  try {
    const input = {
      sessionId: "session-1",
      groupId: "group-1",
      clientChunkId: "stable-chunk-id-0001",
      byteSize: 240_000,
      mimeType: "audio/webm"
    };
    const first = await chunks.claimLiveAudioChunk(input);
    assert.equal(first.claimed, true);
    const inFlightReplay = await chunks.claimLiveAudioChunk(input);
    assert.equal(inFlightReplay.processing, true);
    await chunks.completeLiveAudioChunk(first.record._id, { status: "complete", transcriptSegmentId: "segment-1" });
    const completedReplay = await chunks.claimLiveAudioChunk(input);
    assert.equal(completedReplay.duplicate, true);
    assert.equal(overrides.dump("live_audio_chunks").length, 1);
  } finally {
    dbModule.__setDbTestOverrides(null);
  }
});

test("hybrid migration pins definer search paths and denies all browser table access", () => {
  const sql = fs.readFileSync(new URL(
    "../server/db/migrations/20260728_hybrid_live_audio_and_rolling_summaries.sql",
    import.meta.url
  ), "utf8");
  assert.match(sql, /unique \(session_id, group_id, client_chunk_id\)/i);
  assert.match(sql, /enable row level security/gi);
  assert.match(sql, /revoke all on public\.live_audio_chunks[\s\S]+from public, anon, authenticated/i);
  assert.match(sql, /security definer\s+set search_path = ''/i);
  assert.match(sql, /where excluded\.target_cursor > public\.rolling_summary_states\.target_cursor/i);
});
