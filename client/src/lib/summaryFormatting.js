export function normalizeSummaryMarkdown(content) {
  const source = String(content || "").trim();
  if (!source) return "";

  const normalized = source
    .replace(/\s+•\s+(?=\S)/g, "\n- ")
    .replace(/\s+-\s+(?=\S)/g, "\n- ");

  if (normalized === source || /^(?:[-*+]|\d+[.)])\s/.test(normalized)) {
    return normalized;
  }

  return `- ${normalized}`;
}
