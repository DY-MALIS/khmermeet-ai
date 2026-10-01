import assert from "node:assert/strict";
import test from "node:test";
import { createLiveActivity } from "./live-activity";

test("keeps a two-part question together across a 600 ms pause", () => {
  const sent: Record<string, unknown>[] = [];
  const activity = createLiveActivity((input) => sent.push(input));
  const frames = (count: number, level: number) => {
    for (let i = 0; i < count; i++) activity.push("pcm", level, 100);
  };
  frames(10, 0);
  assert.equal(sent.length, 0);
  frames(5, 0.1);
  frames(6, 0);
  assert.equal(sent.filter((item) => item.activityEnd).length, 0);
  frames(5, 0.1);
  frames(11, 0);
  assert.equal(sent.filter((item) => item.activityStart).length, 1);
  assert.equal(sent.filter((item) => item.activityEnd).length, 1);
  assert.ok(sent[0].activityStart);
  assert.ok(sent.at(-1)?.activityEnd);
  frames(20, 0);
  assert.equal(sent.filter((item) => item.activityEnd).length, 1);
  frames(5, 0.1);
  frames(11, 0);
  assert.equal(sent.filter((item) => item.activityStart).length, 2);
  assert.equal(sent.filter((item) => item.activityEnd).length, 2);
});

test("rejects isolated noise and clears buffered audio on playback", () => {
  const sent: Record<string, unknown>[] = [];
  const activity = createLiveActivity((input) => sent.push(input));
  activity.push("click", 0.1, 100);
  activity.push("silence", 0, 100);
  assert.equal(sent.length, 0);
  activity.reset();
  activity.push("speech1", 0.1, 100);
  activity.push("speech2", 0.1, 100);
  assert.deepEqual(sent.slice(1).map((item) => (item.audio as { data: string }).data), ["speech1", "speech2"]);
  activity.reset();
  activity.reset();
  assert.equal(sent.filter((item) => item.activityEnd).length, 1);
});
