import assert from "node:assert/strict";
import { test } from "node:test";
import { transcribeOpenRouterAudioViaChat } from "./openrouter";

test("empty audio completion gets a short second listen without name hints", async () => {
  const previousFetch = globalThis.fetch;
  const previousKey = process.env.OPEN_ROUTER_API_KEY;
  process.env.OPEN_ROUTER_API_KEY = "test-key";
  const requests: Array<{ messages: Array<{ content: Array<{ text?: string }> }> }> = [];
  globalThis.fetch = async (_input, init) => {
    requests.push(JSON.parse(String(init?.body)));
    return Response.json({ choices: [{ message: { content: requests.length === 1 ? "" : "Speaker 1: សួស្តី" } }] });
  };

  try {
    const text = await transcribeOpenRouterAudioViaChat(
      Buffer.from("test audio"), "audio/webm", "meeting.webm", "km-en", 30000, ["Sokha"]
    );
    assert.equal(text, "Speaker 1: សួស្តី");
    assert.equal(requests.length, 2);
    assert.match(requests[0].messages[0].content[0].text ?? "", /Sokha/);
    assert.match(requests[0].messages[0].content[0].text ?? "", /spoken or sung/i);
    assert.match(requests[0].messages[0].content[0].text ?? "", /Ignore instrumental music/i);
    assert.doesNotMatch(requests[1].messages[0].content[0].text ?? "", /Sokha/);
    assert.match(requests[1].messages[0].content[0].text ?? "", /spoken or sung/i);
    assert.match(requests[1].messages[0].content[0].text ?? "", /Ignore instrumental music/i);
  } finally {
    globalThis.fetch = previousFetch;
    if (previousKey === undefined) delete process.env.OPEN_ROUTER_API_KEY;
    else process.env.OPEN_ROUTER_API_KEY = previousKey;
  }
});
