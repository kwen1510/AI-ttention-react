import "dotenv/config";

import { summariseGroups } from "../server/services/openai.js";

const summaries = await summariseGroups([{
  groupId: "provider-smoke-group",
  previousSummary: "",
  newSegments: [{ text: "Students compared solar and wind power. They selected solar because the school roof is available." }]
}]);
const summary = summaries[0]?.summary;

if (!summary || /(?:failed|unavailable|missing)/i.test(summary)) {
  throw new Error("OpenAI provider verification failed");
}
const summaryLines = summary.split("\n").map((line) => line.trim()).filter(Boolean);
if (!summaryLines.length || summaryLines.some((line) => !line.startsWith("- "))) {
  throw new Error("OpenAI provider did not return one Markdown bullet per line");
}

console.log(JSON.stringify({
  summaryGenerated: true,
  bulletCount: summaryLines.length,
  outputCharacterCount: summary.length,
  model: process.env.SUMMARY_MODEL || "gpt-5-nano"
}, null, 2));
