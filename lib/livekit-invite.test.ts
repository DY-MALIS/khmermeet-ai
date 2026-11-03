import assert from "node:assert/strict";
import test from "node:test";
import { createInviteToken, verifyMeetingInviteToken } from "./livekit-invite";

test("a guest invite only authorizes its own meeting room", () => {
  const inviteForA = createInviteToken("ROOM_A");
  assert.equal(verifyMeetingInviteToken({ liveRoom: "ROOM_A" }, "ROOM_A", inviteForA), true);
  assert.equal(verifyMeetingInviteToken({ liveRoom: "ROOM_B" }, "ROOM_A", inviteForA), false);
  assert.equal(verifyMeetingInviteToken({ liveRoom: "ROOM_A" }, "ROOM_B", inviteForA), false);
  assert.equal(verifyMeetingInviteToken(null, "ROOM_A", inviteForA), false);
});
