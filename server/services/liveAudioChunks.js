import { randomUUID } from "node:crypto";
import { createSupabaseDb } from "../db/db.js";

const db = createSupabaseDb();

function duplicateResult(record) {
    return {
        claimed: false,
        duplicate: ["complete", "no_speech"].includes(record?.status),
        processing: record?.status === "processing",
        record
    };
}

export async function claimLiveAudioChunk({ sessionId, groupId, clientChunkId, byteSize, mimeType }) {
    const chunks = db.collection("live_audio_chunks");
    const key = { session_id: sessionId, group_id: groupId, client_chunk_id: clientChunkId };
    const existing = await chunks.findOne(key);
    if (existing?.status !== "failed") return existing ? duplicateResult(existing) : insertClaim();

    const claimed = await chunks.findOneAndUpdate(
        { ...key, status: "failed" },
        { $set: {
            status: "processing",
            byte_size: byteSize,
            mime_type: mimeType,
            error_code: null,
            updated_at: Date.now()
        } }
    );
    return claimed ? { claimed: true, duplicate: false, processing: false, record: claimed } : duplicateResult(await chunks.findOne(key));

    async function insertClaim() {
        try {
            const inserted = await chunks.insertOne({
                _id: randomUUID(),
                ...key,
                status: "processing",
                byte_size: byteSize,
                mime_type: mimeType,
                created_at: Date.now(),
                updated_at: Date.now()
            });
            return { claimed: true, duplicate: false, processing: false, record: inserted.inserted };
        } catch (error) {
            if (String(error?.code || "") !== "23505" && !/duplicate key/i.test(String(error?.message || ""))) throw error;
            return duplicateResult(await chunks.findOne(key));
        }
    }
}

export async function completeLiveAudioChunk(recordId, {
    status = "complete",
    durationSeconds = null,
    transcriptSegmentId = null,
    errorCode = null
} = {}) {
    return db.collection("live_audio_chunks").updateOne(
        { _id: recordId },
        { $set: {
            status,
            duration_seconds: durationSeconds,
            transcript_segment_id: transcriptSegmentId,
            error_code: errorCode,
            completed_at: ["complete", "no_speech"].includes(status) ? Date.now() : null,
            updated_at: Date.now()
        } }
    );
}
