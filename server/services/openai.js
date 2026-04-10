import fetch from "node-fetch";
import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";
import { ELEVENLABS_KEY } from "../config/env.js";

// Initialize ElevenLabs client
export const elevenlabs = new ElevenLabsClient({
    apiKey: ELEVENLABS_KEY,
});

export async function callOpenAIChat(apiKey, {
    model = "gpt-4o-mini",
    messages = [],
    temperature = 0,
    maxTokens = 800,
    responseFormat = null
}) {
    const endpoint = "https://api.openai.com/v1/chat/completions";
    const payload = {
        model,
        messages,
        temperature,
        max_tokens: maxTokens
    };
    if (responseFormat) {
        payload.response_format = responseFormat;
    }

    const res = await fetch(endpoint, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
    });

    if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`OpenAI chat error ${res.status} ${res.statusText}: ${errorText}`);
    }

    return res.json();
}

export function parseJsonFromText(text) {
    if (!text || typeof text !== 'string') return null;
    let trimmed = text.trim();
    const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fenced) {
        trimmed = fenced[1].trim();
    } else {
        trimmed = trimmed.replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();
    }
    try {
        return JSON.parse(trimmed);
    } catch (_) {
        const firstBrace = trimmed.indexOf('{');
        const lastBrace = trimmed.lastIndexOf('}');
        if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
            const candidate = trimmed.slice(firstBrace, lastBrace + 1);
            try {
                return JSON.parse(candidate);
            } catch (__) {
                return null;
            }
        }
        return null;
    }
}

export async function summarise(text, customPrompt) {
    try {
        if (process.env.MOCK_AI_SERVICES === "true" && process.env.ALLOW_DEV_TEST === "true") {
            const sentences = String(text || "")
                .split(/[.!?]/)
                .map((part) => part.trim())
                .filter(Boolean)
                .slice(-6);

            if (sentences.length === 0) {
                return "Summarization unavailable";
            }

            return sentences.map((sentence) => `- ${sentence}`).join("\n");
        }

        const basePrompt = customPrompt || "Summarise the following classroom discussion in ≤6 clear bullet points:";
        const apiKey = process.env.OPENAI_API_KEY || process.env.OPENAI_KEY;
        if (!apiKey) {
            console.warn('⚠️ OpenAI API key not configured; skipping summarisation');
            return "Summarization unavailable (missing OpenAI key)";
        }

        const response = await callOpenAIChat(apiKey, {
            model: "gpt-4o-mini",
            maxTokens: 800,
            temperature: 0,
            messages: [
                {
                    role: "user",
                    content: `${basePrompt}\n\n${text}`
                }
            ]
        });
        const summaryText = response.choices?.[0]?.message?.content?.trim();
        return summaryText ?? "(no summary)";
    } catch (err) {
        console.error("❌ Summarization error:", err);
        return "Summarization failed";
    }
}
