import assert from "node:assert/strict";
import test from "node:test";
import { hasRunawayRepetition, hasUsableTranscript, normalizeTranscriptDigits, stripUnknownOnlyLines } from "./transcript-quality";

test("unknown-only model output is not treated as spoken content", () => {
  const placeholders = "Unknown Speaker: Unknown\nLisa: Unknown\nUnknown Speaker: [unclear]";
  assert.equal(hasUsableTranscript(placeholders), false);
  assert.equal(hasUsableTranscript("Unknown Speaker: Unknown\nLisa: We will meet tomorrow"), true);
  assert.equal(stripUnknownOnlyLines("Unknown Speaker: Unknown\nLisa: We will meet tomorrow"), "Lisa: We will meet tomorrow");
});

test("rejects a long Khmer hallucination loop without spaces", () => {
  const loop = "យើងត្រូវពិនិត្យការងារនិងរៀបចំការប្រជុំបន្ទាប់".repeat(500);
  assert.equal(hasRunawayRepetition(loop), true);
  assert.equal(hasUsableTranscript(loop), false);
  assert.equal(hasUsableTranscript(`ការប្រជុំចាប់ផ្តើមហើយ។ ${loop}`), false);
});

test("brief spoken repetition stays valid", () => {
  assert.equal(hasRunawayRepetition("ចាស ចាស ខ្ញុំយល់ហើយ"), false);
});

test("Khmer numeral glyphs become 0-9 digits without changing words", () => {
  assert.equal(normalizeTranscriptDigits("តម្លៃ ១៥០ ដុល្លារ និង 25 សេន"), "តម្លៃ 150 ដុល្លារ និង 25 សេន");
});

test("a number-only spoken turn is kept while timestamps are rejected", () => {
  assert.equal(hasUsableTranscript("Speaker 1: 1000000000"), true);
  assert.equal(hasUsableTranscript("Speaker 1: ១០០០០០០០០០"), true);
  assert.equal(hasUsableTranscript("Speaker 1: 25 30 40"), true);
  assert.equal(hasUsableTranscript("0:01\n0:02\n0:03"), false);
});
