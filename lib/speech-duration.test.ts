import assert from "node:assert/strict";
import { test } from "node:test";
import { spokenSecondsFromFfmpegLog } from "./speech-duration";

test("charges two spoken hours in a three-hour recording", () => {
  const log = "silence_start: 3600\nsilence_end: 7200 | silence_duration: 3600";
  assert.equal(spokenSecondsFromFfmpegLog(log, 10800), 7200);
});

test("charges no time for an entirely silent recording", () => {
  assert.equal(spokenSecondsFromFfmpegLog("silence_start: 0\nsilence_end: 60", 60), 0);
  assert.equal(spokenSecondsFromFfmpegLog("silence_start: 0", 60), 0);
});

test("keeps short pauses and rounds fractional speech up once", () => {
  assert.equal(spokenSecondsFromFfmpegLog("silence_start: 1.2\nsilence_end: 3.2", 5.1), 4);
  assert.equal(spokenSecondsFromFfmpegLog("", 5.1), 6);
});
