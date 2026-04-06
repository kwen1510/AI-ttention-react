import { callOpenAIChat, parseJsonFromText } from "./openai.js";
import { createSupabaseDb } from "../db/db.js";

const db = createSupabaseDb();

export function resolveCriterionId(criterion) {
    if (!criterion) return null;
    const candidates = [
        criterion._id,
        criterion.dbId,
        criterion.db_id,
        criterion.criteria_id,
        criterion.criterion_id,
        criterion.id
    ];
    for (const candidate of candidates) {
        if (typeof candidate === 'string' && candidate.trim().length >= 8) {
            return candidate.trim();
        }
    }
    return null;
}

export function normalizeCriteriaRecords(rawCriteria = []) {
    return (rawCriteria || [])
        .map((input, index) => {
            const criterionId = resolveCriterionId(input);
            if (!criterionId) return null;
            const orderIndex = typeof input.order_index === 'number'
                ? input.order_index
                : (typeof input.originalIndex === 'number' ? input.originalIndex : index);
            const weightValue = Number(input.weight ?? 1);
            return {
                _id: criterionId,
                description: (input.description || '').toString(),
                rubric: (input.rubric || '').toString(),
                weight: Number.isFinite(weightValue) && weightValue > 0 ? weightValue : 1,
                order_index: orderIndex,
                originalIndex: typeof input.originalIndex === 'number' ? input.originalIndex : orderIndex
            };
        })
        .filter(Boolean)
        .sort((a, b) => {
            if (a.order_index === b.order_index) {
                return a.originalIndex - b.originalIndex;
            }
            return a.order_index - b.order_index;
        });
}

export function createEmptyProgressEntry(timestamp) {
    return {
        status: 'grey',
        completed: false,
        quote: null,
        history: [],
        updated_at: timestamp,
        completed_at: null
    };
}

export function normalizeProgressEntry(entry, timestamp) {
    if (!entry) {
        return createEmptyProgressEntry(timestamp);
    }
    const status = typeof entry.status === 'string' ? entry.status : 'grey';
    const normalized = {
        status,
        completed: status === 'green' ? true : Boolean(entry.completed),
        quote: entry.quote ?? null,
        history: Array.isArray(entry.history) ? entry.history.slice() : [],
        updated_at: typeof entry.updated_at === 'number' ? entry.updated_at : timestamp,
        completed_at: entry.completed_at ?? (status === 'green' ? (typeof entry.updated_at === 'number' ? entry.updated_at : timestamp) : null)
    };
    if (normalized.status !== 'green') {
        normalized.completed = normalized.status === 'green';
        if (normalized.completed === false) {
            normalized.completed_at = null;
        }
    }
    return normalized;
}

export function mergeProgressMap(existingMap, criteriaRecords, timestamp) {
    const merged = {};
    if (existingMap && typeof existingMap === 'object') {
        for (const [criterionId, entry] of Object.entries(existingMap)) {
            merged[criterionId] = normalizeProgressEntry(entry, timestamp);
        }
    }
    for (const criterion of criteriaRecords) {
        if (!criterion?._id) continue;
        const criterionId = String(criterion._id);
        if (!merged[criterionId]) {
            merged[criterionId] = createEmptyProgressEntry(timestamp);
        }
    }
    return merged;
}

export async function ensureGroupProgressDoc(sessionId, groupNumber, criteriaRecords = []) {
    const timestamp = Date.now();
    const progressCollection = db.collection("checkbox_progress");
    const existing = await progressCollection.findOne({
        session_id: sessionId,
        group_number: groupNumber
    });
    const mergedProgress = mergeProgressMap(existing?.progress, criteriaRecords, timestamp);
    const createdAt = existing?.created_at ?? timestamp;
    const existingKeys = existing?.progress && typeof existing.progress === 'object'
        ? Object.keys(existing.progress)
        : [];
    const mergedKeys = Object.keys(mergedProgress);
    const keysChanged = mergedKeys.length !== existingKeys.length ||
        mergedKeys.some((key) => !existingKeys.includes(key));

    if (!existing || keysChanged) {
        const updated = await progressCollection.findOneAndUpdate(
            { session_id: sessionId, group_number: groupNumber },
            {
                $set: {
                    session_id: sessionId,
                    group_number: groupNumber,
                    progress: mergedProgress,
                    created_at: createdAt,
                    updated_at: timestamp
                }
            },
            { upsert: true }
        );
        return updated;
    }

    return {
        ...existing,
        progress: mergedProgress
    };
}

export function extractExistingProgress(criteriaRecords, progressMap = {}) {
    return criteriaRecords.map((criterion) => {
        const key = String(criterion._id);
        const entry = progressMap[key];
        if (!entry) {
            return null;
        }
        return {
            status: entry.status ?? 'grey',
            quote: entry.quote ?? null,
            completed: entry.completed === true || entry.status === 'green'
        };
    });
}

export function applyMatchToProgressEntry(existingEntry, status, quote, timestamp) {
    const newStatus = status;
    const newQuote = newStatus === 'grey' ? null : (quote ?? null);
    const baseline = existingEntry ? { ...existingEntry } : createEmptyProgressEntry(timestamp);
    const currentStatus = baseline.status ?? 'grey';

    let shouldUpdate = false;
    if (!existingEntry) {
        shouldUpdate = true;
    } else if (currentStatus === 'green') {
        shouldUpdate = false;
    } else if (currentStatus === 'grey') {
        shouldUpdate = newStatus === 'red' || newStatus === 'green';
    } else if (currentStatus === 'red') {
        shouldUpdate = newStatus === 'green';
    } else {
        shouldUpdate = newStatus !== currentStatus;
    }

    if (!shouldUpdate) {
        return { updated: false, entry: existingEntry ?? baseline };
    }

    const history = Array.isArray(baseline.history) ? baseline.history.slice() : [];
    history.push({
        status: newStatus,
        quote: newQuote,
        timestamp
    });

    const completedAt = baseline.completed_at ?? (newStatus === 'green' ? timestamp : null);

    return {
        updated: true,
        entry: {
            status: newStatus,
            quote: newQuote,
            completed: newStatus === 'green',
            updated_at: timestamp,
            completed_at: newStatus === 'green' ? completedAt : baseline.completed_at ?? null,
            history
        }
    };
}

export function buildChecklistCriteria(criteriaRecords, progressMap = {}) {
    return criteriaRecords.map((criterion, index) => {
        const key = String(criterion._id);
        const entry = progressMap[key];
        return {
            id: index,
            dbId: criterion._id,
            description: criterion.description,
            rubric: criterion.rubric || '',
            status: entry?.status || 'grey',
            completed: entry?.completed === true || entry?.status === 'green' || false,
            quote: entry?.quote ?? null
        };
    });
}

export async function processCheckboxTranscript(text, criteria, scenario = "", strictness = 2, existingProgress = []) {
    try {
        // Check if API key is available
        const apiKey = process.env.OPENAI_API_KEY || process.env.OPENAI_KEY;
        if (!apiKey) {
            // Return mock matches for testing when API key is not available
            const mockMatches = [];

            // Check for some obvious matches in the text for demonstration
            if (text.toLowerCase().includes('back titration') && text.toLowerCase().includes('not soluble')) {
                mockMatches.push({
                    criteria_index: 0,
                    quote: "back titration is used because CaCO3 is not soluble",
                    status: "green"
                });
            }

            // Include existing GREEN criteria in the response
            existingProgress.forEach((progress, index) => {
                if (progress && progress.status === 'green') {
                    mockMatches.push({
                        criteria_index: index,
                        quote: progress.quote,
                        status: "green"
                    });
                }
            });

            return {
                matches: mockMatches
            };
        }

        // Filter out already GREEN criteria from evaluation
        const criteriaToEvaluate = [];
        const greenCriteria = [];

        criteria.forEach((c, i) => {
            const progress = existingProgress[i];
            if (progress && progress.status === 'green') {
                // This criterion is already GREEN - don't re-evaluate
                greenCriteria.push({
                    criteria_index: i,
                    quote: progress.quote,
                    status: "green"
                });
            } else {
                // This criterion needs evaluation
                criteriaToEvaluate.push({ ...c, originalIndex: i });
            }
        });

        // If all criteria are already GREEN, just return them
        if (criteriaToEvaluate.length === 0) {
            return {
                matches: greenCriteria
            };
        }

        // Create detailed criteria text with rubrics for evaluation
        const criteriaText = criteriaToEvaluate.map((c, i) => {
            return `${c.originalIndex}. ${c.description}\n   RUBRIC: ${c.rubric}`;
        }).join('\n\n');

        const scenarioContext = scenario ? `\nDiscussion Context/Scenario: ${scenario}\n` : '';

        // Adjust evaluation framework based on strictness level
        let evaluationFramework = '';

        if (strictness === 1) { // Lenient
            evaluationFramework = `
🟢 GREEN STATUS - Award when:
• Student demonstrates general understanding of the concept
• The main idea is correct, even if some details are missing
• Accept partial explanations that show conceptual grasp
• Be generous with interpretations - if they're on the right track, it's GREEN
• Accept different ways of expressing the same concept

🔴 RED STATUS - Award when:
• Student mentions the topic but shows fundamental misunderstanding
• Major conceptual errors are present
• The core idea is wrong, even if they tried

⚪ GREY STATUS - Award when:
• The topic is NOT discussed at all
• No evidence exists that the student engaged with this concept
• Set quote to null for grey items`;
        } else if (strictness === 3) { // Strict
            evaluationFramework = `
🟢 GREEN STATUS - Award ONLY when:
• Student demonstrates COMPLETE and PRECISE understanding
• ALL rubric requirements must be explicitly addressed
• The explanation must be thorough and accurate
• Every detail specified in the rubric must be present
• No partial credit - it's either fully correct or not

🔴 RED STATUS - Award when:
• Student attempts the topic but ANY rubric requirement is missing
• Even minor inaccuracies or omissions result in RED
• Partial understanding is still RED if not complete

⚪ GREY STATUS - Award when:
• The topic is NOT discussed at all
• No evidence exists that the student engaged with this concept
• Set quote to null for grey items`;
        } else { // Moderate (default)
            evaluationFramework = `
🟢 GREEN STATUS - Award ONLY when:
• Student demonstrates understanding of BOTH the label concept AND the rubric requirements
• The RUBRIC requirements (in parentheses) MUST be addressed (even if expressed differently)
• Accept different ways of expressing the same concept:
  - "0.1 cm³", "0.10 cm cube", "0.1 cubic centimeters" all mean the same thing
  - "2 consistent results" = "two consistent results" = "after 2 consistent titrations"
  - Numbers can be expressed as digits or words
• Their explanation must align with BOTH the label AND the specific rubric details
• Accept phonetic variations (e.g., "metal orange" = "methyl orange") but require conceptual accuracy

🔴 RED STATUS - Award when:
• Student mentions the topic/label but FAILS to address the rubric requirements
• Student attempts the concept but misses key rubric details
• Student shows partial understanding but lacks the specific rubric content
• They demonstrate engagement but don't meet the rubric criteria
• IMPORTANT: If they mention WRONG information (e.g., "10 consistent results" instead of "2"), mark as RED

⚪ GREY STATUS - Award when:
• The topic is NOT discussed at all
• No evidence exists that the student engaged with this concept
• Set quote to null for grey items`;
        }

        const prompt = `You are an expert educational evaluator analyzing student discussion transcripts against specific learning objectives. Your task is to provide precise, consistent evaluations using a 3-state system.

${strictness === 1 ? 'EVALUATION MODE: LENIENT - Be generous and focus on conceptual understanding' :
                strictness === 3 ? 'EVALUATION MODE: STRICT - Require complete and precise answers with all details' :
                    'EVALUATION MODE: MODERATE - Balance conceptual understanding with important details'}

INDEXED OBJECTIVES (use the IDX numbers exactly as shown):
${criteriaToEvaluate.map(c => `IDX ${c.originalIndex}: ${c.description}\nRUBRIC: ${c.rubric}`).join('\n\n')}

IMPORTANT: When you output matches, the "criteria_index" value MUST be one of the IDX numbers shown above. Do not invent or shift indices. If multiple objectives seem possible, choose the single best match by rubric alignment.

STUDENT DISCUSSION TRANSCRIPT:
"${text}"

${scenarioContext}

EVALUATION FRAMEWORK:
${evaluationFramework}

CRITICAL EVALUATION RULES:

1. ${strictness === 1 ? 'FLEXIBLE MATCHING' : strictness === 3 ? 'EXACT MATCHING' : 'INTELLIGENT MATCHING'}:
   ${strictness === 1 ?
                `- Accept any reasonable interpretation of the concept
   - Partial understanding is often sufficient for GREEN
   - Focus on whether they grasp the main idea` :
                strictness === 3 ?
                    `- Require precise and complete answers
   - All rubric details must be explicitly stated
   - No assumptions or generous interpretations` :
                    `- The rubric content is important but can be expressed differently
   - Accept equivalent expressions and terminology
   - Look for the MEANING, not exact wording`}

2. TRANSCRIPTION ERROR TOLERANCE AND SYNONYMS:
   - Accept phonetically similar terms (metal orange ≈ methyl orange)
   - Units/expressions equivalence: cm³ = cm3 = cm cubed = cubic centimeters
   - Chemical/name equivalence: HCl = hydrochloric acid; CaCO3 = calcium carbonate; insoluble ≈ not soluble
   - Common ASR artifacts: "title volume" ≈ "titre volume"; "titer" ≈ "titre"
   - Accept digit/word variations (2 = two, 0.1 = 0.10)
   - Focus on conceptual understanding over exact pronunciation

3. SPECIFICITY:
   - Map each quote to ONE best objective (do not duplicate a quote across objectives)
   - Prefer the objective whose rubric terms most closely appear in the quote

4. QUOTE SELECTION:
   - For GREEN/RED, include a short exact quote that demonstrates why
   - For GREY, set quote to null

RESPONSE FORMAT (JSON ONLY):
{
  "matches": [ { "criteria_index": <IDX>, "quote": <string|null>, "status": "green|red|grey", "why": <string|null> } ]
}

QUALITY CHECK:
- Use only the provided IDX values
- No explanations outside JSON
- Prefer the objective with the strongest rubric term overlap with the quote

Begin evaluation now:`;

        let response;
        try {
            response = await callOpenAIChat(apiKey, {
                model: "gpt-4o-mini",
                maxTokens: 2000, // Increased for comprehensive prompt and detailed analysis
                temperature: 0,
                messages: [
                    {
                        role: "user",
                        content: prompt
                    }
                ],
                responseFormat: {
                    type: "json_schema",
                    json_schema: {
                        name: "checkbox_progress_evaluation",
                        schema: {
                            type: "object",
                            additionalProperties: false,
                            required: ["matches"],
                            properties: {
                                matches: {
                                    type: "array",
                                    items: {
                                        type: "object",
                                        additionalProperties: false,
                                        required: ["criteria_index", "status"],
                                        properties: {
                                            criteria_index: { type: "integer", minimum: 0 },
                                            status: { type: "string", enum: ["green", "red", "grey"] },
                                            quote: { type: ["string", "null"] },
                                            why: { type: ["string", "null"] }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            });
        } catch (apiErr) {
            console.error(`❌ Checkbox processing API error: ${apiErr.message}`);
            return { matches: [] };
        }
        const responseText = response.choices?.[0]?.message?.content?.trim();

        let result = parseJsonFromText(responseText) || { matches: [] };

        // Validate the result structure
        if (!result || typeof result !== 'object') {
            console.warn("⚠️ Invalid response structure (not an object), creating default structure");
            result = { matches: [] };
        }

        if (!result.matches || !Array.isArray(result.matches)) {
            console.warn("⚠️ Missing or invalid matches array, creating empty array");
            result.matches = [];
        }

        // Validate each match object with 'why' rationale
        result.matches = result.matches.filter(match => {
            // Coerce criteria_index if OpenAI returns string like 'IDX 6' or '6'
            if (typeof match?.criteria_index === 'string') {
                const m = match.criteria_index.match(/(\d+)/);
                if (m) {
                    match.criteria_index = Number(m[1]);
                }
            }
            if (typeof match !== 'object' ||
                typeof match.criteria_index !== 'number' ||
                typeof match.status !== 'string') {
                console.warn("⚠️ Invalid match object structure:", match);
                return false;
            }

            // Validate quote based on status: grey should have null, others should have string
            if (match.status === 'grey') {
                if (match.quote !== null && match.quote !== undefined) {
                    console.warn(`⚠️ Grey status should have null quote, got: ${match.quote}`);
                    match.quote = null; // Fix it rather than reject
                }
                if (match.why === undefined) match.why = null;
            } else {
                if (typeof match.quote !== 'string' || match.quote.trim() === '') {
                    console.warn(`⚠️ ${match.status} status must have non-empty string quote, got:`, match.quote);
                    return false;
                }
                if (typeof match.why !== 'string' || match.why.trim() === '') {
                    // Fill a concise default if missing
                    match.why = 'Quote aligns with rubric terms for this objective.';
                }
                if (match.why.length > 180) {
                    match.why = match.why.slice(0, 180);
                }
            }

            // Validate criteria_index is within valid range
            if (match.criteria_index < 0 || match.criteria_index >= criteria.length) {
                console.warn(`⚠️ Invalid criteria_index ${match.criteria_index}. Valid range: 0-${criteria.length - 1}`);
                return false;
            }

            // Validate status is one of the allowed values
            if (!['green', 'red', 'grey'].includes(match.status)) {
                console.warn(`⚠️ Invalid status "${match.status}". Must be green, red, or grey`);
                return false;
            }

            return true;
        });

        // Detect and fix duplicate or near-duplicate quotes across criteria
        const normalizeQuote = (q) => (q || '')
            .toLowerCase()
            .replace(/[^a-z0-9\s]/g, ' ') // strip punctuation
            .replace(/\s+/g, ' ') // collapse whitespace
            .trim();

        const nonGrey = result.matches.filter(m => m.status !== 'grey' && typeof m.quote === 'string');
        const seen = new Map(); // normQuote -> {index, score}
        const toGrey = new Set();

        // token overlap scorer reused later; define here for selection
        const scoreOverlapFast = (quote, idx) => {
            if (!quote) return 0;
            const qt = (quote || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean);
            const dict = new Set((`${criteria[idx]?.description || ''} ${criteria[idx]?.rubric || ''}`).toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean));
            let s = 0; for (const t of qt) if (dict.has(t)) s++;
            return s;
        };

        for (const m of nonGrey) {
            const norm = normalizeQuote(m.quote);
            if (!norm) { continue; }
            // Consider substring duplicates too
            let duplicateKey = null;
            for (const key of seen.keys()) {
                if (key.includes(norm) || norm.includes(key)) { duplicateKey = key; break; }
            }
            const keyToUse = duplicateKey || norm;
            if (!seen.has(keyToUse)) {
                seen.set(keyToUse, { index: m.criteria_index, score: scoreOverlapFast(m.quote, m.criteria_index) });
            } else {
                const prev = seen.get(keyToUse);
                const currentScore = scoreOverlapFast(m.quote, m.criteria_index);
                // Keep the better-scoring mapping; grey out the other
                if (currentScore > prev.score) {
                    // grey the previous winner
                    toGrey.add(prev.index);
                    seen.set(keyToUse, { index: m.criteria_index, score: currentScore });
                } else {
                    toGrey.add(m.criteria_index);
                }
            }
        }

        if (toGrey.size > 0) {
            console.warn(`🔧 Resolving duplicate quotes across criteria. Greying: [${Array.from(toGrey).join(', ')}]`);
            result.matches.forEach(m => {
                if (toGrey.has(m.criteria_index)) {
                    m.status = 'grey';
                    m.quote = null;
                }
            });
        }

        // Dynamic rerouting based on rubric-driven token overlap (no hardcoded categories)
        const norm = (s) => (s || '').toLowerCase()
            .replace(/title volume/g, 'titre volume')
            .replace(/titer/g, 'titre')
            .replace(/cm\^?3|cubic\s*cent(imetre|imeter)s?|cm\s*cubed/g, 'cm3')
            .replace(/hcl/g, 'hydrochloric acid');

        const STOPWORDS = new Set(['the', 'and', 'for', 'that', 'this', 'with', 'will', 'must', 'have', 'has', 'are', 'was', 'were', 'can', 'could', 'should', 'would', 'to', 'of', 'in', 'on', 'at', 'by', 'from', 'or', 'as', 'be', 'is', 'a', 'an', 'it', 'we', 'you', 'they', 'between']);
        const tokenize = (s) => norm(s)
            .replace(/[^a-z0-9\.\s]/g, ' ')
            .split(/\s+/)
            .filter(w => w && !STOPWORDS.has(w) && w.length > 2);

        const criterionTokens = criteria.map(c => new Set(tokenize(`${c.description} ${c.rubric}`)));

        const scoreOverlap = (quote, idx) => {
            if (!quote) return 0;
            const qt = tokenize(quote);
            const dict = criterionTokens[idx];
            let score = 0;
            for (const t of qt) if (dict.has(t)) score++;
            return score;
        };

        result.matches = result.matches.map(m => {
            if (!m.quote || m.status === 'grey') return m;
            const current = m.criteria_index;
            let bestIdx = current;
            let bestScore = scoreOverlap(m.quote, current);
            for (let i = 0; i < criteria.length; i++) {
                const sc = scoreOverlap(m.quote, i);
                if (sc > bestScore) { bestScore = sc; bestIdx = i; }
            }
            // Reroute only when there is a clear improvement and current match is weak
            if (bestIdx !== current && bestScore >= Math.max(2, bestScore - 0) && bestScore >= (scoreOverlap(m.quote, current) + 2)) {
                // console.log(`🔀 Re-routing match from idx=${current} to idx=${bestIdx} based on token overlap (old=${scoreOverlap(m.quote, current)}, new=${bestScore})`);
                return { ...m, criteria_index: bestIdx };
            }
            return m;
        });

        // Cleanup duplicate quotes after rerouting
        (function cleanupDuplicates() {
            const seen = new Map();
            result.matches.forEach(m => {
                if (!m.quote || m.status === 'grey') return;
                const key = m.quote.trim();
                if (!seen.has(key)) { seen.set(key, m.criteria_index); return; }
                if (seen.get(key) !== m.criteria_index) {
                    console.warn(`🔧 Removing duplicate quote after reroute from idx=${m.criteria_index}`);
                    m.status = 'grey';
                    m.quote = null;
                }
            });
        })();

        // Build complete matches array for ALL criteria
        const allMatches = [];

        // Process each criterion to ensure we have a match for every one
        criteria.forEach((criterion, index) => {
            // Check if this criterion was in greenCriteria (preserved)
            const greenMatch = greenCriteria.find(m => m.criteria_index === index);
            if (greenMatch) {
                allMatches.push(greenMatch);
                return;
            }

            // Check if this criterion was in the AI evaluation results
            const aiMatch = result.matches.find(m => m.criteria_index === index);
            if (aiMatch) {
                allMatches.push(aiMatch);
                return;
            }

            // If not found in either, preserve the existing status or default to grey
            const existingProg = existingProgress[index];
            if (existingProg) {
                // Preserve existing RED or GREY status that wasn't re-evaluated
                allMatches.push({
                    criteria_index: index,
                    quote: existingProg.quote || null,
                    status: existingProg.status || 'grey'
                });
            } else {
                // No existing progress, default to grey
                allMatches.push({
                    criteria_index: index,
                    quote: null,
                    status: 'grey'
                });
            }
        });

        // Sort by criteria_index for consistent ordering
        allMatches.sort((a, b) => a.criteria_index - b.criteria_index);

        return { matches: allMatches };
    } catch (err) {
        console.error("❌ Checkbox processing error:", err);
        return { matches: [] };
    }
}

export async function cleanupOldSessionData(sessionCode) {
    try {
        // console.log(`🧹 Cleaning up old data for session: ${sessionCode}`);

        // Get the session document
        const session = await db.collection("sessions").findOne({ code: sessionCode });
        if (!session) {
            // console.log(`📋 No session found with code: ${sessionCode}`);
            return;
        }

        // Delete old checkbox progress
        const progressResult = await db.collection("checkbox_progress").deleteMany({ session_id: session._id });
        // console.log(`🗑️ Deleted ${progressResult.deletedCount} old progress records`);

        // Delete old checkbox criteria
        const criteriaResult = await db.collection("checkbox_criteria").deleteMany({ session_id: session._id });
        // console.log(`🗑️ Deleted ${criteriaResult.deletedCount} old criteria records`);

        // Delete old checkbox session
        const sessionResult = await db.collection("checkbox_sessions").deleteMany({ session_id: session._id });
        // console.log(`🗑️ Deleted ${sessionResult.deletedCount} old checkbox session records`);

        // console.log(`✅ Session ${sessionCode} cleaned up successfully`);
    } catch (err) {
        console.error(`❌ Error cleaning up session ${sessionCode}:`, err);
    }
}
