import { LIVE_AUDIO_MAX_CONCURRENCY } from "../config/env.js";

let active = 0;
const metrics = {
    accepted: 0,
    rejectedCapacity: 0,
    bytes: 0,
    providerErrors: 0,
    providerLatencyMs: 0,
    providerCalls: 0,
    summaryBatches: 0,
    summaryGroups: 0,
    summaryInputTokens: 0,
    summaryOutputTokens: 0,
    summaryErrors: 0
};

export function acquireLiveAudioCapacity() {
    if (active >= LIVE_AUDIO_MAX_CONCURRENCY) {
        metrics.rejectedCapacity += 1;
        return null;
    }
    active += 1;
    metrics.accepted += 1;
    let released = false;
    return () => {
        if (released) return;
        released = true;
        active = Math.max(0, active - 1);
    };
}

export function recordSummaryBatchMetrics({ groups = 0, inputTokens = 0, outputTokens = 0, error = false } = {}) {
    metrics.summaryBatches += 1;
    metrics.summaryGroups += Math.max(0, Number(groups) || 0);
    metrics.summaryInputTokens += Math.max(0, Number(inputTokens) || 0);
    metrics.summaryOutputTokens += Math.max(0, Number(outputTokens) || 0);
    if (error) metrics.summaryErrors += 1;
}

export function recordLiveAudioResult({ bytes = 0, providerLatencyMs = 0, providerError = false } = {}) {
    metrics.bytes += Math.max(0, Number(bytes) || 0);
    metrics.providerLatencyMs += Math.max(0, Number(providerLatencyMs) || 0);
    metrics.providerCalls += 1;
    if (providerError) metrics.providerErrors += 1;
}

export function getLiveAudioMetrics() {
    return {
        active,
        capacity: LIVE_AUDIO_MAX_CONCURRENCY,
        ...metrics,
        averageProviderLatencyMs: metrics.providerCalls
            ? Math.round(metrics.providerLatencyMs / metrics.providerCalls)
            : 0
    };
}

export function __resetLiveAudioCapacityForTests() {
    active = 0;
    Object.keys(metrics).forEach((key) => { metrics[key] = 0; });
}
