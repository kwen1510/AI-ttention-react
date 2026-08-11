import test from "node:test";
import assert from "node:assert/strict";

import { normalizeSummaryMarkdown } from "../client/src/lib/summaryFormatting.js";

test("summary formatting turns inline separators into readable Markdown bullets", () => {
  assert.equal(
    normalizeSummaryMarkdown("First point. - Second point. - Third point."),
    "- First point.\n- Second point.\n- Third point."
  );
  assert.equal(
    normalizeSummaryMarkdown("First point • Second point"),
    "- First point\n- Second point"
  );
});

test("summary formatting preserves existing lists and ordinary hyphenated text", () => {
  assert.equal(normalizeSummaryMarkdown("- First\n- Second"), "- First\n- Second");
  assert.equal(normalizeSummaryMarkdown("A timing-free test"), "A timing-free test");
  assert.equal(normalizeSummaryMarkdown(""), "");
});
