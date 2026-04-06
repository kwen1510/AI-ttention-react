import { v4 as uuid } from "uuid";
import { callOpenAIChat, parseJsonFromText } from "./openai.js";
import { createSupabaseDb } from "../db/db.js";
import { transcribe } from "./elevenlabs.js";
import { addToTranscriptHistory, getContextualTranscript } from "./transcript.js";

const db = createSupabaseDb();

// Helper: Generate a unique ID for a mindmap node
export function generateMindmapNodeId() {
    return uuid();
}

// Helper: Ensure every node in the mindmap tree has a unique ID
export function ensureMindmapNodeIds(node) {
    if (!node) return;
    if (!node.id) {
        node.id = generateMindmapNodeId();
    }
    if (Array.isArray(node.children)) {
        node.children.forEach(child => ensureMindmapNodeIds(child));
    }
}

// Helper: Merge a new mindmap tree into an existing one (legacy format)
export function mergeLegacyMindmapTrees(newTree, existingTree) {
    if (!existingTree) return newTree;
    if (!newTree) return existingTree;

    // Basic merge strategy: keep existing structure, append new children if they don't exist
    // This is a simplified version; a real merge would be more complex
    // For now, we'll assume the new tree is an expansion of the existing one
    // or just return the new tree if it's a complete replacement

    // TODO: Implement proper merging logic if needed. 
    // Based on usage, it seems to be used when expanding.

    return newTree;
}

// Helper: Get mindmap data for a session
export async function getMindmapData(sessionCode) {
    const session = await db.collection("sessions").findOne({ code: sessionCode });
    if (!session) return null;

    // Check mindmap_sessions first
    const mindmapSession = await db.collection("mindmap_sessions").findOne({ session_id: session._id });
    if (mindmapSession && mindmapSession.current_mindmap) {
        return mindmapSession.current_mindmap;
    }

    // Fallback to session.mindmap_data
    return session.mindmap_data || null;
}

export async function generateInitialMindmap(contextualText, mainTopic) {
    const apiKey = process.env.OPENAI_API_KEY || process.env.OPENAI_KEY;
    if (!apiKey) {
        throw new Error("Mindmap generation unavailable: OPENAI_API_KEY not configured.");
    }

    try {
        // console.log(`🧠 OpenAI Mindmap: Generating initial academic mindmap for topic: "${mainTopic}"`);

        const completion = await callOpenAIChat(apiKey, {
            model: "gpt-4o-mini", // Updated model name
            temperature: 0.1,
            maxTokens: 2000,
            responseFormat: { type: "json_object" },
            messages: [
                {
                    role: "system",
                    content: "You transform noisy classroom transcripts into structured JSON mindmaps. Always respond with valid JSON."
                },
                {
                    role: "user",
                    content: `
Create an academic mindmap based on the classroom transcript below.

TOPIC: ${mainTopic}

TRANSCRIPT:
${contextualText}

Return JSON with this exact shape:
{
  "topic": "${mainTopic}",
  "version": "${new Date().toISOString()}",
  "nodes": [
    { "id": "uuid", "parent_id": null, "label": "main point", "type": "main" },
    { "id": "uuid", "parent_id": "uuid", "label": "supporting detail", "type": "sub" },
    { "id": "uuid", "parent_id": "uuid", "label": "example or evidence", "type": "example" }
  ],
  "message": "optional note when no content"
}

Rules:
- Depth ≤ 3.
- Remove filler/noise.
- Preserve technical terms; paraphrase general phrasing.
- Use valid UUIDs for every id.
- If there is no meaningful content, return an empty "nodes" array and add a helpful "message".
`
                }
            ]
        });

        const responseText = completion?.choices?.[0]?.message?.content?.trim() || "{}";
        const parsed = parseJsonFromText(responseText) || {};

        if (!Array.isArray(parsed.nodes) || parsed.nodes.length === 0) {
            // console.log("⚠️ OpenAI Mindmap: No meaningful academic content detected, falling back to outline generation");
            return await generateFallbackMindmap(mainTopic);
        }

        const convertedResult = convertMaestroToLegacy(parsed, mainTopic);
        ensureMindmapNodeIds(convertedResult);
        if (!convertedResult.children || convertedResult.children.length === 0) {
            // console.log("⚠️ OpenAI Mindmap: Converted mindmap has no branches, invoking fallback outline");
            return await generateFallbackMindmap(mainTopic);
        }
        return convertedResult;
    } catch (error) {
        console.error("❌ Failed to generate mindmap via OpenAI:", error);
        throw error;
    }
}

export async function generateFallbackMindmap(mainTopic) {
    const apiKey = process.env.OPENAI_API_KEY || process.env.OPENAI_KEY;
    // console.log(`✨ Mindmap fallback: creating generic outline for "${mainTopic}"`);
    if (!apiKey) {
        const fallback = {
            id: generateMindmapNodeId(),
            name: mainTopic,
            children: []
        };
        ensureMindmapNodeIds(fallback);
        return fallback;
    }

    try {
        const completion = await callOpenAIChat(apiKey, {
            model: "gpt-4o-mini", // Updated model name
            temperature: 0.3,
            maxTokens: 1200,
            responseFormat: { type: "json_object" },
            messages: [
                {
                    role: "system",
                    content: "You create academic mindmap outlines as JSON. Always include multiple top-level concepts."
                },
                {
                    role: "user",
                    content: `
Topic: ${mainTopic}

Task: Generate a mindmap outline with at least 3 primary branches and relevant supporting details (depth up to 3). Use the same JSON schema as before:
{
  "topic": "${mainTopic}",
  "version": "${new Date().toISOString()}",
  "nodes": [
    { "id": "uuid", "parent_id": "uuid", "label": "primary concept", "type": "main" },
    { "id": "uuid", "parent_id": "uuid", "label": "supporting idea", "type": "sub" },
    { "id": "uuid", "parent_id": "uuid", "label": "example or evidence", "type": "example" }
  ]
}

Constraints:
- Produce at least 3 distinct main concepts related to the topic.
- Include supporting sub-ideas when appropriate.
- Return valid JSON only.`
                }
            ]
        });

        const fallbackText = completion?.choices?.[0]?.message?.content?.trim() || "{}";
        const parsedFallback = parseJsonFromText(fallbackText);
        if (parsedFallback?.nodes && parsedFallback.nodes.length > 0) {
            return convertMaestroToLegacy(parsedFallback, mainTopic);
        }
    } catch (err) {
        console.warn("⚠️ Mindmap fallback via OpenAI failed:", err.message);
    }

    const fallback = {
        id: generateMindmapNodeId(),
        name: mainTopic,
        children: []
    };
    ensureMindmapNodeIds(fallback);
    return fallback;
}

export function convertMaestroToLegacy(maestroData, mainTopic) {
    const legacy = {
        id: generateMindmapNodeId(),
        name: mainTopic,
        children: []
    };

    const nodeMap = new Map();
    const idMap = new Map();

    (maestroData.nodes || []).forEach((node, index) => {
        const resolvedId = node.id || generateMindmapNodeId();
        idMap.set(node.id ?? `idx:${index}`, resolvedId);
        nodeMap.set(resolvedId, {
            name: node.label,
            children: [],
            type: node.type,
            id: resolvedId
        });
    });

    const rootNodes = [];

    (maestroData.nodes || []).forEach((node, index) => {
        const resolvedId = idMap.get(node.id ?? `idx:${index}`);
        const entry = nodeMap.get(resolvedId);
        const parentResolvedId = node.parent_id == null ? null : idMap.get(node.parent_id);

        if (parentResolvedId && nodeMap.has(parentResolvedId)) {
            nodeMap.get(parentResolvedId).children.push(entry);
        } else {
            rootNodes.push(entry);
        }
    });

    legacy.children = rootNodes;
    ensureMindmapNodeIds(legacy);

    // console.log(`✅ Mind-Map Maestro: Converted ${maestroData.nodes?.length || 0} nodes to legacy format`);
    return legacy;
}

export async function expandMindmap(contextualText, currentMindmap, mainTopic) {
    const apiKey = process.env.OPENAI_API_KEY || process.env.OPENAI_KEY;
    if (!apiKey) {
        throw new Error("Mindmap expansion unavailable: OPENAI_API_KEY not configured.");
    }

    try {
        // console.log(`🧠 OpenAI Mindmap: Expanding mindmap for topic "${mainTopic}"`);

        // Convert current mindmap to Maestro format for processing
        const currentMaestroFormat = convertLegacyToMaestro(currentMindmap, mainTopic);

        const completion = await callOpenAIChat(apiKey, {
            model: "gpt-4o-mini", // Updated model name
            temperature: 0.1,
            maxTokens: 2000,
            responseFormat: { type: "json_object" },
            messages: [
                {
                    role: "system",
                    content: "You expand classroom mindmaps. Append new nodes without deleting existing ones. Reply with JSON only."
                },
                {
                    role: "user",
                    content: `
TOPIC: ${mainTopic}

CURRENT MINDMAP (JSON):
${JSON.stringify(currentMaestroFormat, null, 2)}

NEW TRANSCRIPT CHUNK:
${contextualText}

Task: Add only genuinely new academic ideas to the existing mindmap. Never delete or rename existing nodes.

Return JSON:
{
  "action": "ignore|expand",
  "topic": "${mainTopic}",
  "version": "${new Date().toISOString()}",
  "nodes": [ ...all existing nodes plus any new ones... ],
  "explanation": "brief natural language summary"
}

Rules:
- Deduplicate ideas already present.
- Depth ≤ 3.
- Use UUIDs for new nodes.
- If no useful content, set "action": "ignore" and keep nodes unchanged.
`
                }
            ]
        });

        const responseText = completion?.choices?.[0]?.message?.content?.trim() || "{}";
        const result = parseJsonFromText(responseText) || {};

        if (result.action === "ignore") {
            // console.log("⚠️ OpenAI Mindmap: Current chunk contained no new academic content");
            ensureMindmapNodeIds(currentMindmap);
            return {
                updatedMindmap: currentMindmap, // Return unchanged mindmap
                explanation: result.explanation || 'Content filtered out: no academic value',
                rawResponse: responseText,
                filtered: true
            };
        }

        // Convert result back to legacy format
        const updatedLegacyFormat = convertMaestroToLegacy(result, mainTopic);
        ensureMindmapNodeIds(updatedLegacyFormat);

        // console.log(`✅ OpenAI Mindmap: Expansion processed with ${result.nodes?.length || 0} total nodes`);

        return {
            updatedMindmap: updatedLegacyFormat,
            explanation: result.explanation || 'Academic mindmap updated successfully',
            rawResponse: responseText,
            filtered: false
        };

    } catch (error) {
        console.error("❌ Failed to expand mindmap via OpenAI:", error);
        throw error;
    }
}

export function convertLegacyToMaestro(legacyData, mainTopic) {
    const source = structuredClone(legacyData);
    ensureMindmapNodeIds(source);

    const maestro = {
        topic: mainTopic,
        version: new Date().toISOString(),
        nodes: []
    };

    function addNode(node, parentId = null, depth = 0) {
        const nodeId = node.id || generateMindmapNodeId();
        let nodeType = 'main';

        if (depth === 1) nodeType = 'main';
        else if (depth === 2) nodeType = 'sub';
        else if (depth >= 3) nodeType = 'example';

        if (depth > 0) {
            maestro.nodes.push({
                id: nodeId,
                parent_id: parentId,
                label: node.name,
                type: node.type || nodeType
            });
        }

        (node.children || []).forEach(child => addNode(child, nodeId, depth + 1));
    }

    addNode(source);
    return maestro;
}

export function countMindmapNodes(mindmapData) {
    if (!mindmapData) return 0;
    let count = 0;
    function traverse(node) {
        count++;
        if (node.children) {
            node.children.forEach(traverse);
        }
    }
    traverse(mindmapData);
    return count;
}

export function convertGraphToText(mindmapData) {
    if (!mindmapData) return "";
    let text = "";
    function traverse(node, depth = 0) {
        const indent = "  ".repeat(depth);
        text += `${indent}- ${node.name}\n`;
        if (node.children) {
            node.children.forEach(child => traverse(child, depth + 1));
        }
    }
    traverse(mindmapData);
    return text;
}

export async function processMindmapTranscript(sessionCode, fileBuffer, fileMimetype) {
    const startTime = Date.now();

    // Get session data
    const session = await db.collection("sessions").findOne({ code: sessionCode });
    if (!session) {
        throw new Error("Session not found");
    }

    // Transcribe the audio chunk
    const transcriptionResult = await transcribe(fileBuffer, fileMimetype);

    let transcript = '';
    if (typeof transcriptionResult === 'string') {
        transcript = transcriptionResult;
    } else if (transcriptionResult && transcriptionResult.text) {
        transcript = transcriptionResult.text;
    } else if (transcriptionResult) {
        transcript = String(transcriptionResult);
    }

    // Ensure we have a valid string
    transcript = String(transcript || '').trim();

    if (!transcript || transcript.length === 0) {
        return {
            success: true,
            transcript: '',
            message: 'No speech detected in audio chunk',
            mindmapData: null
        };
    }

    // Add to transcript history for context
    addToTranscriptHistory(sessionCode, transcript);

    // Get contextual transcript (current + previous 2 chunks)
    const contextualTranscript = getContextualTranscript(sessionCode);

    // Get current mindmap state
    const currentMindmapData = await getMindmapData(sessionCode);

    let result;
    let mindmapData = null;

    if (!currentMindmapData || !currentMindmapData.children || currentMindmapData.children.length === 0) {
        // Generate initial mindmap with contextual transcript
        mindmapData = await generateInitialMindmap(contextualTranscript, session.main_topic);
        ensureMindmapNodeIds(mindmapData);

        if (mindmapData) {
            // Store the initial mindmap
            await db.collection("sessions").updateOne(
                { code: sessionCode },
                {
                    $set: {
                        mindmap_data: mindmapData,
                        last_updated: new Date()
                    }
                }
            );
            await db.collection("mindmap_sessions").updateOne(
                { session_id: session._id },
                {
                    $set: {
                        current_mindmap: mindmapData,
                        main_topic: session.main_topic,
                        updated_at: Date.now()
                    },
                    $push: {
                        chat_history: {
                            type: 'user',
                            content: transcript,
                            timestamp: Date.now()
                        }
                    }
                },
                { upsert: true }
            );

            result = {
                success: true,
                transcript: transcript,
                mindmapData: mindmapData,
                message: `Initial mindmap created with contextual analysis`,
                // rawAiResponse: `Generated from ${sessionTranscriptHistory.get(sessionCode)?.length || 1} chunks of context` // sessionTranscriptHistory is not available here directly, removed for now
            };
        } else {
            // No meaningful content found
            result = {
                success: true,
                transcript: transcript,
                mindmapData: currentMindmapData,
                message: 'No academic content detected in speech',
                filtered: true
            };
        }
    } else {
        // Expand existing mindmap with contextual transcript
        const expansionResult = await expandMindmap(contextualTranscript, currentMindmapData, session.main_topic);

        if (!expansionResult.filtered) {
            let mergedMindmap = expansionResult.updatedMindmap;
            const latestStoredMindmap = await getMindmapData(sessionCode);
            if (latestStoredMindmap) {
                mergedMindmap = mergeLegacyMindmapTrees(mergedMindmap, latestStoredMindmap);
            }
            ensureMindmapNodeIds(mergedMindmap);

            await db.collection("sessions").updateOne(
                { code: sessionCode },
                {
                    $set: {
                        mindmap_data: mergedMindmap,
                        last_updated: new Date()
                    }
                }
            );

            mindmapData = mergedMindmap;
        } else {
            const latestStoredMindmap = await getMindmapData(sessionCode);
            mindmapData = latestStoredMindmap || currentMindmapData; // Keep existing mindmap unchanged
        }

        await db.collection("mindmap_sessions").updateOne(
            { session_id: session._id },
            {
                $set: {
                    current_mindmap: mindmapData,
                    main_topic: session.main_topic,
                    updated_at: Date.now()
                },
                $push: {
                    chat_history: {
                        type: 'user',
                        content: transcript,
                        timestamp: Date.now()
                    }
                }
            },
            { upsert: true }
        );

        result = {
            success: true,
            transcript: transcript,
            mindmapData: mindmapData,
            message: expansionResult.explanation,
            rawAiResponse: expansionResult.rawResponse,
            filtered: expansionResult.filtered
        };
    }

    // const processingTime = Date.now() - startTime;
    // console.log(`✅ Mindmap chunk processed successfully in ${processingTime}ms`);

    return result;
}

export async function updateMindmapManually(sessionCode, reason, metadata) {
    const session = await db.collection("sessions").findOne({ code: sessionCode });
    if (!session) {
        throw new Error("Session not found");
    }

    const mindmapData = await getMindmapData(sessionCode);
    if (!mindmapData) {
        throw new Error("No mindmap found for this session");
    }

    const now = Date.now();
    const topicToPersist = session.main_topic;
    const normalizedMindmap = structuredClone(mindmapData);
    ensureMindmapNodeIds(normalizedMindmap);

    await db.collection("sessions").updateOne(
        { _id: session._id },
        {
            $set: {
                mindmap_data: normalizedMindmap,
                main_topic: topicToPersist,
                last_updated: new Date()
            }
        }
    );

    await db.collection("mindmap_sessions").updateOne(
        { session_id: session._id },
        {
            $set: {
                current_mindmap: normalizedMindmap,
                main_topic: topicToPersist,
                updated_at: now
            },
            $push: {
                manual_updates: {
                    timestamp: now,
                    reason,
                    metadata
                }
            }
        },
        { upsert: true }
    );

    await db.collection("session_logs").insertOne({
        _id: uuid(),
        session_id: session._id,
        type: "mindmap_manual_update",
        content: reason,
        ai_response: { action: "manual_update", metadata },
        created_at: now
    });

    return normalizedMindmap;
}

export async function generateMindmapExamples(topic, nodeLabel, siblingIdeas = [], childIdeas = []) {
    const apiKey = process.env.OPENAI_API_KEY || process.env.OPENAI_KEY;
    if (!apiKey) {
        throw new Error("OpenAI key not configured");
    }

    const sanitizedSiblings = Array.isArray(siblingIdeas) ? siblingIdeas.filter(Boolean) : [];
    const sanitizedChildren = Array.isArray(childIdeas) ? childIdeas.filter(Boolean) : [];

    const prompt = `
You are an instructional design assistant expanding a classroom mindmap.

Main topic: ${topic || 'Unknown Topic'}
Current node: ${nodeLabel}
Sibling ideas: ${sanitizedSiblings.length ? sanitizedSiblings.join('; ') : 'None'}
Existing child ideas: ${sanitizedChildren.length ? sanitizedChildren.join('; ') : 'None'}

Produce 3 to 5 fresh, concrete child ideas (max 12 words each) that extend "${nodeLabel}".
Return JSON only: {"examples":["idea 1","idea 2",...]}.
Avoid duplicates, vague phrases, or repeating sibling/child ideas.
`.trim();

    const completion = await callOpenAIChat(apiKey, {
        model: 'gpt-4o-mini',
        temperature: 0.55,
        maxTokens: 500,
        responseFormat: { type: 'json_object' },
        messages: [
            {
                role: 'system',
                content: 'You suggest concise, classroom-ready mindmap examples. Always respond with valid JSON containing an "examples" array.'
            },
            {
                role: 'user',
                content: prompt
            }
        ]
    });

    const raw = completion?.choices?.[0]?.message?.content?.trim() || '{}';
    const parsed = parseJsonFromText(raw) || {};
    const initial = Array.isArray(parsed.examples) ? parsed.examples : [];

    const seen = new Set();
    const examples = [];
    for (const example of initial) {
        if (typeof example !== 'string') continue;
        const trimmed = example.trim();
        if (!trimmed) continue;
        const key = trimmed.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        examples.push(trimmed);
        if (examples.length === 5) break;
    }

    if (!examples.length) {
        const fallbackTemplates = [
            'Mini case study on {{node}}',
            'Hands-on practice task for {{node}}',
            'Student reflection prompt about {{node}}',
            'Real-world application of {{node}}',
            'Quick assessment checklist for {{node}}'
        ];
        fallbackTemplates.forEach(template => {
            if (examples.length < 3) {
                examples.push(template.replace('{{node}}', nodeLabel));
            }
        });
    }

    return { examples, raw };
}

export async function generatePlaygroundExamples(topic, count = 2, strand = []) {
    const apiKey = process.env.OPENAI_API_KEY || process.env.OPENAI_KEY;
    if (!apiKey) {
        throw new Error("OpenAI key not configured");
    }

    const targetCount = Math.max(1, Math.min(Number(count) || 2, 6));
    const branch = Array.isArray(strand) ? strand.filter(Boolean) : [];
    const focusNode = branch[branch.length - 1] || topic;
    const branchSummary = branch.length
        ? branch.map((item, idx) => `${idx + 1}. ${item}`).join('\n')
        : 'No existing branch context.';

    const instructions = `
You are helping a teacher extend a classroom mindmap.

Mindmap branch so far:
${branchSummary}

Requirements:
- Produce EXACTLY ${targetCount} unique child ideas that extend the node "${focusNode}".
- Each idea must be actionable, classroom-ready, and 12 words or fewer.
- Avoid repeating existing ideas or vague placeholders.
- If there are sibling ideas, ensure the new ones are clearly distinct.

Return JSON only:
{"examples":["idea 1","idea 2", "..."]}

Do not include explanations or extra keys.
`.trim();

    const completion = await callOpenAIChat(apiKey, {
        model: 'gpt-4o-mini',
        temperature: 0.65,
        maxTokens: 400,
        responseFormat: { type: 'json_object' },
        messages: [
            {
                role: 'system',
                content: 'You generate concise, classroom-ready mindmap ideas. Always return valid JSON.'
            },
            {
                role: 'user',
                content: instructions
            }
        ]
    });

    const raw = completion?.choices?.[0]?.message?.content ?? '{}';
    const parsed = parseJsonFromText(raw) || {};
    const initial = Array.isArray(parsed.examples) ? parsed.examples : [];

    const seen = new Set();
    const examples = [];
    for (const item of initial) {
        if (typeof item !== 'string') continue;
        const trimmed = item.trim();
        if (!trimmed) continue;
        const key = trimmed.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        examples.push(trimmed);
    }

    if (examples.length < targetCount) {
        const fallbackTemplates = [
            'Classroom activity exploring {{focus}}',
            'Real-world case linking {{focus}}',
            'Student reflection on {{focus}}',
            'Hands-on project centred on {{focus}}',
            'Mini assessment covering {{focus}}',
            'Peer discussion prompt: {{focus}}'
        ];
        let idx = 0;
        while (examples.length < targetCount && idx < fallbackTemplates.length * 2) {
            const template = fallbackTemplates[idx % fallbackTemplates.length];
            const candidate = template.replace('{{focus}}', focusNode);
            const key = candidate.toLowerCase();
            if (!seen.has(key)) {
                seen.add(key);
                examples.push(candidate);
            }
            idx += 1;
        }
    }

    return examples.slice(0, targetCount);
}

export async function generatePlaygroundPoint(topic) {
    const apiKey = process.env.OPENAI_API_KEY || process.env.OPENAI_KEY;
    if (!apiKey) {
        throw new Error("OpenAI key not configured");
    }

    const prompt = `Generate a single, concise point or idea related to "${topic}". It should be a short phrase (max 8 words) that could be a sub-topic or supporting detail. Return just the phrase, no quotes or extra text.`;

    const completion = await callOpenAIChat(apiKey, {
        model: 'gpt-4o-mini',
        temperature: 0.7,
        maxTokens: 60,
        messages: [
            {
                role: 'system',
                content: 'You generate concise educational points. Return only the phrase, no quotes or explanations.'
            },
            {
                role: 'user',
                content: prompt
            }
        ]
    });

    return completion?.choices?.[0]?.message?.content?.trim() || `Point about ${topic}`;
}

export async function generateContextualPoint(graphData, selectedNode) {
    const apiKey = process.env.OPENAI_API_KEY || process.env.OPENAI_KEY;
    if (!apiKey) {
        throw new Error("OpenAI key not configured");
    }

    const graphContext = convertGraphToText(graphData);

    const prompt = `Based on this mindmap structure:
${graphContext}

Current selected node: "${selectedNode}"

Generate a single, relevant point that would logically extend this node. Consider the existing structure and relationships. Return just a concise phrase (max 8 words) that fits naturally with the current mindmap.`;

    const completion = await callOpenAIChat(apiKey, {
        model: 'gpt-4o-mini',
        temperature: 0.7,
        maxTokens: 60,
        messages: [
            {
                role: 'system',
                content: 'You generate contextually relevant mindmap points. Return only the phrase, no quotes or explanations.'
            },
            {
                role: 'user',
                content: prompt
            }
        ]
    });

    return completion?.choices?.[0]?.message?.content?.trim() || `Point about ${selectedNode}`;
}

export async function askMindmapQuestion(question, graphData, selectedNode, strandPath = []) {
    const apiKey = process.env.OPENAI_API_KEY || process.env.OPENAI_KEY;
    if (!apiKey) {
        throw new Error("OpenAI key not configured");
    }

    const graphContext = convertGraphToText(graphData);

    const strandList = Array.isArray(strandPath) ? strandPath.filter(name => typeof name === 'string' && name.trim().length > 0) : [];
    const strandText = strandList.length
        ? strandList.map((name, idx) => `${'  '.repeat(idx)}- ${name.trim()}`).join('\n')
        : '(No strand provided; use overall context)';

    const prompt = `Based on this mindmap structure:
${graphContext}

Active strand from root to current node:
${strandText}

Current selected node: "${selectedNode}"

User question: "${question}"

Generate between 1 and 4 concise child ideas that extend this node. Each idea should be short (max 10 words) and directly relevant to the strand above.

Respond ONLY with valid JSON following this schema:
{
  "nodes": [
    {
      "text": "Label for the new node",
      "note": "Optional extra context for the teacher (max 20 words)"
    }
  ]
}

Do not include any other keys or commentary.`;

    const completion = await callOpenAIChat(apiKey, {
        model: 'gpt-4o-mini',
        temperature: 0.6,
        maxTokens: 200,
        responseFormat: { type: 'json_object' },
        messages: [
            {
                role: 'system',
                content: 'You provide concise answers that fit naturally into mindmap structures. Always respond with JSON that includes a "nodes" array.'
            },
            {
                role: 'user',
                content: prompt
            }
        ]
    });

    const raw = completion?.choices?.[0]?.message?.content?.trim() || '{}';
    const parsed = parseJsonFromText(raw);
    const parsedData = parsed ?? raw;

    let nodes = [];
    if (parsedData && Array.isArray(parsedData.nodes)) {
        nodes = parsedData.nodes;
    } else if (Array.isArray(parsedData)) {
        nodes = parsedData.map(entry => (typeof entry === 'string' ? { text: entry } : entry));
    } else if (typeof parsedData === 'string' && parsedData.length > 0) {
        nodes = [{ text: parsedData }];
    }

    nodes = nodes
        .map(entry => {
            if (!entry) return null;
            if (typeof entry === 'string') {
                return { text: entry.trim() };
            }
            const text = typeof entry.text === 'string' ? entry.text.trim() : '';
            const note = typeof entry.note === 'string' ? entry.note.trim() : '';
            if (!text) return null;
            return note ? { text, note } : { text };
        })
        .filter(Boolean);

    if (nodes.length === 0) {
        nodes = [{ text: `New idea about ${selectedNode}` }];
    }

    return nodes;
}
