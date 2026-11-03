import assert from "node:assert/strict";
import test from "node:test";
import { isRecentLiveMeeting, LIVE_RECORDING_REGISTRATION_WINDOW_MS } from "./meeting-duration";

test("a full-length call remains eligible for recording registration", () => {
  const now = Date.now();
  assert.equal(isRecentLiveMeeting({ status: "recording", createdAt: new Date(now - 12 * 60 * 60 * 1000) }), true);
  assert.equal(isRecentLiveMeeting({ status: "recorded", createdAt: new Date(now - 7 * 60 * 60 * 1000) }), true);
  assert.equal(isRecentLiveMeeting({ status: "recorded", createdAt: new Date(now - LIVE_RECORDING_REGISTRATION_WINDOW_MS - 1000) }), false);
  assert.equal(isRecentLiveMeeting({ status: "summarized", createdAt: new Date(now - 12 * 60 * 60 * 1000) }), true);
  assert.equal(isRecentLiveMeeting({ status: "draft", createdAt: new Date(now) }), false);
});
