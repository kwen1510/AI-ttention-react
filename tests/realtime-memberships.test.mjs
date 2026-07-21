import test from "node:test";
import assert from "node:assert/strict";

test("Realtime membership grants are identity, session, and topic scoped", async () => {
  process.env.NODE_ENV = "test";
  process.env.SUPABASE_URL ||= "https://example.supabase.co";
  process.env.SUPABASE_SECRET_KEY ||= "sb_secret_test";
  process.env.SUPABASE_PUBLISHABLE_KEY ||= "sb_publishable_test";
  const service = await import(`../server/services/realtimeMemberships.js?test=${Date.now()}`);
  let granted;
  service.__setRealtimeMembershipTestOverride({ grant(rows) { granted = rows; return rows; } });
  try {
    await service.grantRealtimeTopics({
      userId: "00000000-0000-4000-8000-000000000002",
      sessionCode: "room42",
      topics: ["classroom:cap:students", "classroom:cap:group:2"],
      audience: "student",
      groupNumber: 2,
      expiresAt: "2030-01-01T00:00:00.000Z"
    });
    assert.deepEqual(granted.map((row) => row.topic), [
      "classroom:cap:students",
      "classroom:cap:group:2"
    ]);
    assert.equal(granted.every((row) => row.session_code === "ROOM42"), true);
    assert.equal(granted.some((row) => row.topic.endsWith(":teacher")), false);
  } finally {
    service.__setRealtimeMembershipTestOverride(null);
  }
});

test("Realtime membership lifecycle can be extended or deleted by session", async () => {
  process.env.NODE_ENV = "test";
  process.env.SUPABASE_URL ||= "https://example.supabase.co";
  process.env.SUPABASE_SECRET_KEY ||= "sb_secret_test";
  process.env.SUPABASE_PUBLISHABLE_KEY ||= "sb_publishable_test";
  const service = await import(`../server/services/realtimeMemberships.js?lifecycle=${Date.now()}`);
  const calls = [];
  service.__setRealtimeMembershipTestOverride({
    extend(code, expiresAt) { calls.push(["extend", code, expiresAt]); },
    delete(code) { calls.push(["delete", code]); }
  });
  try {
    await service.extendSessionRealtimeMemberships("room42", "2030-01-01T00:00:00.000Z");
    await service.deleteSessionRealtimeMemberships("room42");
    assert.deepEqual(calls, [
      ["extend", "ROOM42", "2030-01-01T00:00:00.000Z"],
      ["delete", "ROOM42"]
    ]);
  } finally {
    service.__setRealtimeMembershipTestOverride(null);
  }
});
