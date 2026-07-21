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

console.log(JSON.stringify({
  summaryGenerated: true,
  outputCharacterCount: summary.length,
  model: process.env.SUMMARY_MODEL || "gpt-5-nano"
}, null, 2));
