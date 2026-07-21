import assert from "node:assert/strict";
import test from "node:test";

import { buildFallbackSummary } from "../server/services/openai.js";

test("summary provider failure keeps a bounded extractive classroom summary", () => {
  const summary = buildFallbackSummary([
    "First idea.",
    "Second idea.",
    "Third idea.",
    "Fourth idea.",
    "Fifth idea.",
    "Sixth idea.",
    "Final decision."
  ].join(" "));

  assert.equal(summary.split("\n").length, 6);
  assert.doesNotMatch(summary, /First idea/);
  assert.match(summary, /Final decision/);
});

test("empty transcript has a stable non-provider fallback", () => {
  assert.equal(buildFallbackSummary("  "), "Summary unavailable");
});
