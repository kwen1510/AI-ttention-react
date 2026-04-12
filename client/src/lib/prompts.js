export const DEFAULT_SUMMARY_PROMPT =
  "Summarise the following classroom discussion in ≤6 clear bullet points:";

export function normalizePromptText(text = "") {
  return String(text || "").trim();
}

export function isDefaultSummaryPrompt(text = "") {
  return normalizePromptText(text) === DEFAULT_SUMMARY_PROMPT;
}

export function getSummaryPromptPreview(text = "", limit = 140) {
  const normalized = normalizePromptText(text) || DEFAULT_SUMMARY_PROMPT;
  if (normalized.length <= limit) {
    return normalized;
  }

  return `${normalized.slice(0, limit).trimEnd()}…`;
}
