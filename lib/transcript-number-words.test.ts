import assert from "node:assert/strict";
import test from "node:test";
import { spellTranscriptNumberWords } from "./transcript-number-words";

test("Khmer speech uses words for small and very large digit values", () => {
  assert.equal(spellTranscriptNumberWords("Lisa: តម្លៃ ១៥០ ដុល្លារ និង 25 សេន"),
    "Lisa: តម្លៃ មួយរយហាសិប ដុល្លារ និង ម្ភៃប្រាំ សេន");
  assert.equal(spellTranscriptNumberWords("Speaker 1: សរុប 500000000066 ដុល្លារ"),
    "Speaker 1: សរុប ប្រាំរយប៊ីលានហុកសិបប្រាំមួយ ដុល្លារ");
  assert.equal(spellTranscriptNumberWords("ដប់ប៊ីលានប្រាំមួយពាន់ប្រាំមួយរយប៉ែតសិបមួយ"),
    "ដប់ប៊ីលានប្រាំមួយពាន់ប្រាំមួយរយប៉ែតសិបមួយ");
});

test("leading zeroes are spelled digit by digit and metadata stays intact", () => {
  assert.equal(spellTranscriptNumberWords("Speaker 2: លេខ ០១២៣"), "Speaker 2: លេខ សូន្យ មួយ ពីរ បី");
  assert.equal(spellTranscriptNumberWords("Speaker 1: 10B 600 ហុក 681M"),
    "Speaker 1: [លេខមិនច្បាស់] ប្រាំមួយរយ ហុក [លេខមិនច្បាស់]");
  assert.equal(spellTranscriptNumberWords("Lisa: https://example.com/2026 និង 2"),
    "Lisa: https://example.com/2026 និង ពីរ");
  assert.equal(spellTranscriptNumberWords("Lisa: GPT-4 និង 2"), "Lisa: GPT-4 និង ពីរ");
});

test("English speech keeps its language while spelling numbers", () => {
  assert.equal(spellTranscriptNumberWords("Speaker 1: We need 23 units and 1000000000 more"),
    "Speaker 1: We need twenty three units and one billion more");
});
