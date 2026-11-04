import assert from "node:assert/strict";
import test from "node:test";
import { normalizeTranscriptDigits } from "./transcript-quality";

test("clear spoken Khmer quantities become their exact numeric values", () => {
  assert.equal(normalizeTranscriptDigits("ថ្ងៃទីម្ភៃបី"), "ថ្ងៃទី23");
  assert.equal(normalizeTranscriptDigits("តម្លៃមួយរយហាសិបដុល្លារ"), "តម្លៃ150ដុល្លារ");
  assert.equal(normalizeTranscriptDigits("ឆ្នាំពីរពាន់ម្ភៃប្រាំមួយ"), "ឆ្នាំ2026");
  assert.equal(normalizeTranscriptDigits("សរុបប្រាំមួយរយដប់ពីរ"), "សរុប612");
});

test("non-numeric uses of one and existing digits keep their meaning", () => {
  assert.equal(normalizeTranscriptDigits("ខ្ញុំមានមួយគម្រោង"), "ខ្ញុំមានមួយគម្រោង");
  assert.equal(normalizeTranscriptDigits("តម្លៃ ១៥០ ដុល្លារ និង 25 សេន"), "តម្លៃ 150 ដុល្លារ និង 25 សេន");
});
