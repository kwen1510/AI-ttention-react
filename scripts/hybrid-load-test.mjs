import assert from "node:assert/strict";
import { setTimeout as wait } from "node:timers/promises";

const { acquireLiveAudioCapacity, getLiveAudioMetrics, __resetLiveAudioCapacityForTests } = await import(
  "../server/services/liveAudioCapacity.js"
);

const recorders = 60;
const chunksPerRecorder = 2;
const chunkBytes = Number(process.env.LOAD_CHUNK_BYTES) || 240_000;
const providerLatencyMs = Number(process.env.LOAD_PROVIDER_LATENCY_MS) || 250;
const staggerWindowMs = Number(process.env.LOAD_STAGGER_WINDOW_MS) || 3_000;
const baselineRss = process.memoryUsage().rss;
let peakRss = baselineRss;
let active = 0;
let maxActive = 0;
let capacityRetries = 0;

async function runChunk(recorder, sequence) {
  const scheduledAt = Date.now();
  await wait(((recorder * 797) + sequence * 1499) % staggerWindowMs);
  let release = acquireLiveAudioCapacity();
  while (!release) {
    capacityRetries += 1;
    await wait(20 + ((recorder * 13) % 31));
    release = acquireLiveAudioCapacity();
  }

  active += 1;
  maxActive = Math.max(maxActive, active);
  let audio = Buffer.alloc(chunkBytes, recorder % 251);
  peakRss = Math.max(peakRss, process.memoryUsage().rss);
  try {
    await wait(providerLatencyMs);
  } finally {
    audio = null;
    active -= 1;
    release();
  }
  return Date.now() - scheduledAt;
}

__resetLiveAudioCapacityForTests();
const startedAt = Date.now();
const latencies = await Promise.all(
  Array.from({ length: recorders }, (_, recorder) => (
    Array.from({ length: chunksPerRecorder }, (_, sequence) => runChunk(recorder + 1, sequence))
  )).flat()
);
latencies.sort((left, right) => left - right);
const percentile = (ratio) => latencies[Math.min(latencies.length - 1, Math.floor(latencies.length * ratio))];
const result = {
  recorders,
  chunks: latencies.length,
  chunkBytes,
  simulatedProviderLatencyMs: providerLatencyMs,
  acceleratedStaggerWindowMs: staggerWindowMs,
  elapsedMs: Date.now() - startedAt,
  latencyMs: { p50: percentile(0.5), p95: percentile(0.95), max: latencies.at(-1) },
  maxActive,
  configuredCapacity: getLiveAudioMetrics().capacity,
  capacityRetries,
  rssGrowthBytes: Math.max(0, peakRss - baselineRss),
  errors: 0
};

assert.equal(result.chunks, 120);
assert.equal(result.maxActive <= result.configuredCapacity, true);
console.log(JSON.stringify(result, null, 2));
