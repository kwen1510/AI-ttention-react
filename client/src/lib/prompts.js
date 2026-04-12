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

export function parseCheckboxPromptContent(text = "", fallbackScenario = "") {
  const lines = String(text || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  let scenario = String(fallbackScenario || "").trim();
  const criteria = [];

  for (const line of lines) {
    const scenarioMatch = line.match(/^scenario\s*[:\-]\s*(.+)$/i);
    if (!scenario && scenarioMatch) {
      scenario = scenarioMatch[1].trim();
      continue;
    }
    criteria.push(line);
  }

  if (!scenario && criteria.length > 0) {
    scenario = criteria.shift();
  }

  return {
    scenario,
    criteria,
    criteriaText: criteria.join("\n"),
  };
}
