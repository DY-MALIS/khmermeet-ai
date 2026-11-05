import assert from "node:assert/strict";
import test from "node:test";
import { normalizeTranscriptionLanguageMode, refineSavedTranscript } from "./storage";

test("an omitted transcript mode keeps words in their spoken languages", () => {
  assert.equal(normalizeTranscriptionLanguageMode(undefined), "km-en");
  assert.equal(normalizeTranscriptionLanguageMode("unexpected"), "km-en");
  assert.equal(normalizeTranscriptionLanguageMode("km"), "km");
  assert.equal(normalizeTranscriptionLanguageMode("en"), "en");
});

test("original-language transcript spells digits without asking a text model to rewrite speech", async () => {
  const previousFetch = globalThis.fetch;
  const previousKey = process.env.OPEN_ROUTER_API_KEY;
  let fetchCalls = 0;
  globalThis.fetch = async () => {
    fetchCalls += 1;
    throw new Error("Text-only AI should not be called for original-language speech");
  };
  process.env.OPEN_ROUTER_API_KEY = "test-key";

  try {
    const raw = "Speaker 1: We will meet at 10 tomorrow.\nSpeaker 2: Yes, at 10.";
    const result = await refineSavedTranscript(raw, "km-en", []);
    assert.equal(result, "Speaker 1: We will meet at ten tomorrow.\nSpeaker 2: Yes, at ten.");
    assert.equal(fetchCalls, 0);
  } finally {
    globalThis.fetch = previousFetch;
    if (previousKey === undefined) delete process.env.OPEN_ROUTER_API_KEY;
    else process.env.OPEN_ROUTER_API_KEY = previousKey;
  }
});
