import assert from "node:assert/strict";
import test from "node:test";
import { liveSeconds, usageSessionFromMetadata } from "./livekit-metering";

test("only a valid session identifier in LiveKit metadata is accepted", () => {
  const id = "ec5d2042-5f0d-4d90-8847-f9d67a46f740";
  assert.equal(usageSessionFromMetadata(JSON.stringify({ usageSessionId: id })), id);
  assert.equal(usageSessionFromMetadata("not json"), null);
  assert.equal(usageSessionFromMetadata(JSON.stringify({ usageSessionId: "other" })), null);
});

test("live seconds accumulate across reconnects and cap at twelve hours", () => {
  const start = new Date("2026-11-26T00:00:00Z");
  assert.equal(liveSeconds(90, start, new Date("2026-11-26T00:00:10.2Z")), 101);
  assert.equal(liveSeconds(90, start, new Date("2026-11-25T23:59:59Z")), 90);
  assert.equal(liveSeconds(90, start, new Date("2026-11-27T00:00:00Z")), 43200);
});
