import { randomBytes } from "node:crypto";
import { OPENAI_API_KEY } from "../config/env.js";
import { callOpenAIChat, parseJsonFromText, summarise } from "./openai.js";

const DEFAULT_PROCESS = Object.freeze({
    ideasFormed: [],
    ideasRejected: [],
    decisions: [],
    openQuestions: [],
    evidenceTimeline: []
});

export function generateAsyncShareId() {
    return randomBytes(18).toString("base64url");
}

export function normalizeAsyncShareId(value) {
    const normalized = String(value || "").trim();
    return /^[A-Za-z0-9_-]{20,96}$/.test(normalized) ? normalized : null;
}

export function buildAsyncJoinUrl(origin, shareId) {
    return new URL(`/async/j/${encodeURIComponent(shareId)}`, origin).toString();
}

export function normalizeAsyncGroupNumber(value, maxGroupNumber = 99) {
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > maxGroupNumber) {
        return null;
    }
    return parsed;
}

export function isAsyncSessionOpen(session, now = Date.now()) {
    if (!session || session.status !== "open") {
        return false;
    }

    if (session.expires_at && Number(session.expires_at) < now) {
        return false;
    }

    return true;
}

function emptyProcess() {
    return structuredClone(DEFAULT_PROCESS);
}

function stripSentencePunctuation(value) {
    let end = value.length;
    while (end > 0 && ".!?".includes(value[end - 1])) end -= 1;
    return value.slice(0, end);
}

function normalizeProcessItem(item, fallback = {}) {
    if (!item || typeof item !== "object") {
        return null;
    }

    const text = String(item.text || item.idea || item.decision || item.question || "").trim();
    if (!text) {
        return null;
    }

    return {
        text,
        timestamp: item.timestamp || fallback.timestamp || null,
        evidence: String(item.evidence || fallback.evidence || "").trim() || null,
        confidence: item.confidence || fallback.confidence || "medium"
    };
}

export function normalizeAsyncProcess(process = {}) {
    const normalized = emptyProcess();
    const fields = ["ideasFormed", "ideasRejected", "decisions", "openQuestions", "evidenceTimeline"];

    for (const field of fields) {
        const rawItems = Array.isArray(process?.[field]) ? process[field] : [];
        normalized[field] = rawItems
            .map((item) => normalizeProcessItem(item))
            .filter(Boolean)
            .slice(0, 20);
    }

    return normalized;
}

function splitSentences(text) {
    return String(text || "")
        .split(/(?<=[.!?])\s+/)
        .map((part) => part.trim())
        .filter(Boolean);
}

function segmentTimestamp(segment) {
    return segment?.created_at || segment?.createdAt || null;
}

function buildMockProcess(segments = []) {
    const process = emptyProcess();

    for (const segment of segments) {
        const timestamp = segmentTimestamp(segment);
        const sentences = splitSentences(segment.text);
        for (const sentence of sentences) {
            const lower = sentence.toLowerCase();
            const item = {
                text: stripSentencePunctuation(sentence),
                timestamp,
                evidence: sentence,
                confidence: "medium"
            };

            if (/(reject|not viable|not useful|too costly|unreliable|doesn't work|does not work|concern|tradeoff)/i.test(sentence)) {
                process.ideasRejected.push(item);
            } else if (/(decide|agree|choose|settle on|conclude)/i.test(sentence)) {
                process.decisions.push(item);
            } else if (sentence.includes("?") || /(ask|wonder|question)/i.test(sentence)) {
                process.openQuestions.push(item);
            } else if (/(suggest|propose|explain|argue|idea|say|think|because|so that|therefore)/i.test(lower)) {
                process.ideasFormed.push(item);
            }

            process.evidenceTimeline.push(item);
        }
    }

    return normalizeAsyncProcess(process);
}

function normalizeAnalysisPayload(payload, fallbackSummary, fallbackFeedback, fallbackProcess) {
    const summary = String(payload?.summary || fallbackSummary || "").trim();
    const feedback = String(payload?.feedback || fallbackFeedback || "").trim();
    const process = normalizeAsyncProcess(payload?.process || fallbackProcess);

    return {
        summary,
        feedback,
        process
    };
}

export async function analyzeAsyncDiscussion({
    transcriptText,
    segments = [],
    instructions = "",
    feedbackPrompt = ""
} = {}) {
    const fallbackSummary = await summarise(
        transcriptText,
        feedbackPrompt || "Summarise this asynchronous student group discussion in concise bullets:"
    );
    const fallbackProcess = buildMockProcess(segments);
    const fallbackFeedback = [
        "Use the summary to refine the strongest ideas.",
        "Look for rejected alternatives and unresolved questions before finalising the group's answer."
    ].join(" ");

    if (process.env.MOCK_AI_SERVICES === "true" && process.env.ALLOW_DEV_TEST === "true") {
        return normalizeAnalysisPayload(null, fallbackSummary, fallbackFeedback, fallbackProcess);
    }

    if (!OPENAI_API_KEY) {
        return normalizeAnalysisPayload(null, fallbackSummary, fallbackFeedback, fallbackProcess);
    }

    try {
        const response = await callOpenAIChat(OPENAI_API_KEY, {
            model: "gpt-4o-mini",
            temperature: 0,
            maxTokens: 1300,
            responseFormat: { type: "json_object" },
            messages: [
                {
                    role: "system",
                    content: [
                        "You analyse asynchronous student group discussions for a teacher.",
                        "Return JSON only with keys summary, feedback, and process.",
                        "The process object must contain arrays: ideasFormed, ideasRejected, decisions, openQuestions, evidenceTimeline.",
                        "Each process item must include text, timestamp, evidence, and confidence.",
                        "Use timestamps from transcript segments when possible.",
                        "Do not invent claims that are not grounded in the transcript."
                    ].join(" ")
                },
                {
                    role: "user",
                    content: JSON.stringify({
                        instructions,
                        feedbackPrompt,
                        transcriptText,
                        segments: segments.map((segment, index) => ({
                            index: index + 1,
                            timestamp: segmentTimestamp(segment),
                            text: segment.text
                        }))
                    })
                }
            ]
        });

        const content = response.choices?.[0]?.message?.content || "";
        const parsed = parseJsonFromText(content);
        return normalizeAnalysisPayload(parsed, fallbackSummary, fallbackFeedback, fallbackProcess);
    } catch (error) {
        console.warn("⚠️ Async discussion analysis failed, using fallback:", error.message);
        return normalizeAnalysisPayload(null, fallbackSummary, fallbackFeedback, fallbackProcess);
    }
}
