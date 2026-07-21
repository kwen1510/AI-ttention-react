import { createSupabaseDb } from "../db/db.js";
import { supabase } from "../db/supabaseClient.js";
import { SUMMARY_GRACE_MS, SUMMARY_INTERVAL_DEFAULT_MS, SUMMARY_RECONCILE_EVERY } from "../config/env.js";
import { summariseGroups } from "./openai.js";
import { createSummaryUpdateFields, getTranscriptBundle, persistSummarySnapshot } from "./transcript.js";
import { isSummaryReleased } from "./summaryRelease.js";
import { publishRealtimeEvent, REALTIME_EVENTS } from "./realtime.js";
import { recordSummaryBatchMetrics } from "./liveAudioCapacity.js";

const db = createSupabaseDb();
const timers = new Map();
const running = new Set();
const PROMPT_VERSION = "rolling-v1";

function summaryJobs() {
    return db.collection("rolling_summary_jobs");
}

function timerKey(sessionId) {
    return String(sessionId || "");
}

async function commitState({ sessionId, groupId, targetCursor, summaryText }) {
    if (process.env.NODE_ENV !== "test") {
        const { data, error } = await supabase.rpc("commit_rolling_summary", {
            p_session_id: sessionId,
            p_group_id: groupId,
            p_target_cursor: targetCursor,
            p_prompt_version: PROMPT_VERSION,
            p_summary_text: summaryText
        });
        if (error) throw error;
        return Boolean(Array.isArray(data) ? data[0]?.committed : data?.committed);
    }

    const existing = await db.collection("rolling_summary_states").findOne({ group_id: groupId });
    if (Number(existing?.target_cursor || 0) >= targetCursor) return false;
    await db.collection("rolling_summary_states").findOneAndUpdate(
        { group_id: groupId },
        { $set: {
            session_id: sessionId,
            group_id: groupId,
            target_cursor: targetCursor,
            prompt_version: PROMPT_VERSION,
            summary_text: summaryText,
            version: Number(existing?.version || 0) + 1,
            updated_at: Date.now()
        } },
        { upsert: true }
    );
    return true;
}

export async function runRollingSummary({ sessionCode, sessionId, final = false } = {}) {
    const key = timerKey(sessionId);
    if (!key || running.has(key)) return { skipped: true, reason: "already-running" };
    running.add(key);
    try {
        if (process.env.NODE_ENV !== "test") {
            const { data, error } = await supabase.rpc("claim_rolling_summary_job", {
                p_session_id: sessionId
            });
            if (error) throw error;
            if (!data) return { skipped: true, reason: "claimed-by-another-instance" };
        }
        await summaryJobs().updateOne(
            { session_id: sessionId },
            { $set: { status: "running", updated_at: Date.now() } }
        ).catch(() => {});
        const groups = await db.collection("groups").find({ session_id: sessionId }).sort({ number: 1 }).toArray();
        const candidates = [];
        for (const group of groups) {
            const [{ segments }, state] = await Promise.all([
                getTranscriptBundle(sessionId, group._id),
                db.collection("rolling_summary_states").findOne({ group_id: group._id })
            ]);
            const cursor = Number(state?.target_cursor || 0);
            if (segments.length <= cursor) continue;
            const reconcile = Number(state?.version || 0) > 0
                && Number(state.version) % SUMMARY_RECONCILE_EVERY === 0;
            candidates.push({
                groupId: group._id,
                groupNumber: group.number,
                previousSummary: reconcile ? "" : (state?.summary_text || ""),
                newSegments: reconcile ? segments : segments.slice(cursor),
                segments,
                targetCursor: segments.length,
                reconcile
            });
        }
        if (!candidates.length) {
            await summaryJobs().deleteOne({ session_id: sessionId }).catch(() => {});
            return { skipped: true, reason: "no-deltas" };
        }

        const sessionPrompt = await db.collection("session_prompts").findOne({ session_id: sessionId });
        let results;
        try {
            results = await summariseGroups(candidates, sessionPrompt?.prompt || null);
            recordSummaryBatchMetrics({
                groups: candidates.length,
                inputTokens: results.usage?.prompt_tokens,
                outputTokens: results.usage?.completion_tokens
            });
        } catch (error) {
            recordSummaryBatchMetrics({ groups: candidates.length, error: true });
            throw error;
        }
        const byGroup = new Map(results.map((result) => [result.groupId, result.summary]));
        let committed = 0;
        for (const candidate of candidates) {
            const summary = byGroup.get(String(candidate.groupId));
            if (!summary) continue;
            const didCommit = await commitState({
                sessionId,
                groupId: candidate.groupId,
                targetCursor: candidate.targetCursor,
                summaryText: summary
            });
            if (!didCommit) continue;
            const now = Date.now();
            await db.collection("summaries").findOneAndUpdate(
                { group_id: candidate.groupId },
                { $set: createSummaryUpdateFields({ sessionId, text: summary, timestamp: now }) },
                { upsert: true }
            );
            await persistSummarySnapshot({
                sessionId,
                groupId: candidate.groupId,
                segments: candidate.segments,
                summaryText: summary,
                timestamp: now
            });
            const released = await isSummaryReleased({ sessionCode, sessionId, groupNumber: candidate.groupNumber });
            await publishRealtimeEvent({
                sessionCode,
                groupNumber: candidate.groupNumber,
                event: REALTIME_EVENTS.SUMMARY_STATE,
                audience: "both",
                payload: {
                    groupNumber: candidate.groupNumber,
                    summary: released ? summary : null,
                    isReleased: released,
                    final,
                    cursor: candidate.targetCursor
                }
            });
            committed += 1;
        }
        if (committed === candidates.length) {
            await summaryJobs().deleteOne({ session_id: sessionId }).catch(() => {});
        } else {
            await summaryJobs().updateOne(
                { session_id: sessionId },
                { $set: { status: "pending", due_at: Date.now() + 5_000, updated_at: Date.now() } }
            ).catch(() => {});
        }
        return { committed, requested: candidates.length };
    } catch (error) {
        const existing = await summaryJobs().findOne({ session_id: sessionId }).catch(() => null);
        await summaryJobs().updateOne(
            { session_id: sessionId },
            { $set: {
                status: "pending",
                attempts: Math.min(1000, Number(existing?.attempts || 0) + 1),
                due_at: Date.now() + 15_000,
                last_error_code: String(error?.code || error?.status || "summary_failed").slice(0, 80),
                updated_at: Date.now()
            } }
        ).catch(() => {});
        throw error;
    } finally {
        running.delete(key);
    }
}

export async function scheduleRollingSummary({ sessionCode, sessionId, intervalMs = SUMMARY_INTERVAL_DEFAULT_MS } = {}) {
    const key = timerKey(sessionId);
    if (!key) return;
    const delay = Math.max(0, Number(intervalMs) || SUMMARY_INTERVAL_DEFAULT_MS) + SUMMARY_GRACE_MS;
    const existing = await summaryJobs().findOne({ session_id: sessionId });
    if (!existing) {
        await summaryJobs().insertOne({
            session_id: sessionId,
            session_code: sessionCode,
            due_at: Date.now() + delay,
            status: "pending",
            attempts: 0,
            created_at: Date.now(),
            updated_at: Date.now()
        }).catch((error) => {
            if (String(error?.code || "") !== "23505" && !/duplicate key/i.test(String(error?.message || ""))) throw error;
        });
    }
    if (timers.has(key)) return;
    const timer = setTimeout(() => {
        timers.delete(key);
        void runRollingSummary({ sessionCode, sessionId }).catch((error) => {
            console.warn("Rolling summary batch failed:", error.message);
        });
    }, delay);
    timer.unref?.();
    timers.set(key, timer);
}

export async function flushRollingSummary(options) {
    const key = timerKey(options?.sessionId);
    const timer = timers.get(key);
    if (timer) clearTimeout(timer);
    timers.delete(key);
    const existing = await summaryJobs().findOne({ session_id: options?.sessionId });
    if (existing) {
        await summaryJobs().updateOne(
            { session_id: options.sessionId },
            { $set: { status: "pending", due_at: Date.now(), updated_at: Date.now() } }
        );
    } else if (options?.sessionId && options?.sessionCode) {
        await summaryJobs().insertOne({
            session_id: options.sessionId,
            session_code: options.sessionCode,
            due_at: Date.now(),
            status: "pending",
            attempts: 0,
            created_at: Date.now(),
            updated_at: Date.now()
        });
    }
    return runRollingSummary({ ...options, final: true });
}

export function __resetRollingSummaryForTests() {
    timers.forEach((timer) => clearTimeout(timer));
    timers.clear();
    running.clear();
}

async function recoverDueSummaryJobs() {
    const pending = await summaryJobs().find({}).limit(50).toArray();
    const now = Date.now();
    for (const job of pending) {
        const staleRunning = job.status === "running" && Number(job.updated_at || 0) < now - 135_000;
        if ((job.status !== "pending" && !staleRunning)
            || Number(job.due_at || 0) > now
            || timers.has(timerKey(job.session_id))) continue;
        const timer = setTimeout(() => {
            timers.delete(timerKey(job.session_id));
            void runRollingSummary({ sessionCode: job.session_code, sessionId: job.session_id }).catch(() => {});
        }, 0);
        timer.unref?.();
        timers.set(timerKey(job.session_id), timer);
    }
}

if (process.env.NODE_ENV !== "test") {
    const recoveryPoll = setInterval(() => {
        void recoverDueSummaryJobs().catch((error) => {
            console.warn("Rolling summary job recovery failed:", error.message);
        });
    }, 5_000);
    recoveryPoll.unref?.();
}
