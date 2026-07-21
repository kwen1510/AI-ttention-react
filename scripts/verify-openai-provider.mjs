import "dotenv/config";

import { summarise } from "../server/services/openai.js";

const summary = await summarise(
  "Students compared solar and wind power. They selected solar because the school roof is available."
);

if (!summary || /(?:failed|unavailable|missing)/i.test(summary)) {
  throw new Error("OpenAI provider verification failed");
}

console.log(JSON.stringify({
  summaryGenerated: true,
  outputCharacterCount: summary.length
}, null, 2));
