import assert from "node:assert/strict";
import test from "node:test";
import { extractMeetingTasks, generateMeetingSummary } from "./openrouter";
import { summaryHeadings } from "./prompts/summaryPrompt";

test("missing provider credentials never fabricate a summary or task", async () => {
  const prior = process.env.OPEN_ROUTER_API_KEY;
  const alias = process.env.OPENROUTER_API_KEY;
  delete process.env.OPEN_ROUTER_API_KEY;
  delete process.env.OPENROUTER_API_KEY;
  try {
    await assert.rejects(generateMeetingSummary("We discussed options.", "en"), /missing/);
    await assert.rejects(extractMeetingTasks("We discussed options.", "en"), /missing/);
  } finally {
    if (prior !== undefined) process.env.OPEN_ROUTER_API_KEY = prior;
    if (alias !== undefined) process.env.OPENROUTER_API_KEY = alias;
  }
});

test("truncated summaries are rejected instead of being saved as complete", async () => {
  const priorFetch = globalThis.fetch;
  const priorKey = process.env.OPEN_ROUTER_API_KEY;
  process.env.OPEN_ROUTER_API_KEY = "synthetic-test-key";
  globalThis.fetch = async () => Response.json({ choices: [{ finish_reason: "length", message: { content: "Meeting overview\npartial" } }] });
  try {
    await assert.rejects(generateMeetingSummary("We discussed options.", "en"), /stopped before finishing/);
  } finally {
    globalThis.fetch = priorFetch;
    if (priorKey === undefined) delete process.env.OPEN_ROUTER_API_KEY;
    else process.env.OPEN_ROUTER_API_KEY = priorKey;
  }
});

test("complete structured summary is accepted", async () => {
  const priorFetch = globalThis.fetch;
  const priorKey = process.env.OPEN_ROUTER_API_KEY;
  process.env.OPEN_ROUTER_API_KEY = "synthetic-test-key";
  const summary = Object.values(summaryHeadings.en).join("\nNo clear information available.\n");
  globalThis.fetch = async () => Response.json({ choices: [{ finish_reason: "stop", message: { content: summary } }] });
  try {
    assert.equal(await generateMeetingSummary("We discussed options.", "en"), summary);
  } finally {
    globalThis.fetch = priorFetch;
    if (priorKey === undefined) delete process.env.OPEN_ROUTER_API_KEY;
    else process.env.OPEN_ROUTER_API_KEY = priorKey;
  }
});
