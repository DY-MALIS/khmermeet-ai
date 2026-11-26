import { readFile } from "node:fs/promises";

function editDistance(a, b) {
  const previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let row = 1; row <= a.length; row += 1) {
    let diagonal = previous[0];
    previous[0] = row;
    for (let col = 1; col <= b.length; col += 1) {
      const above = previous[col];
      previous[col] = Math.min(previous[col] + 1, previous[col - 1] + 1, diagonal + (a[row - 1] === b[col - 1] ? 0 : 1));
      diagonal = above;
    }
  }
  return previous[b.length];
}

function ratio(numerator, denominator) {
  return denominator ? Number((numerator / denominator).toFixed(4)) : null;
}

function scoreCounts(counts) {
  if (!counts) return null;
  const { tp, fp, fn } = counts;
  if (![tp, fp, fn].every((value) => Number.isSafeInteger(value) && value >= 0)) throw new Error("Annotation counts must be non-negative integers.");
  return { precision: ratio(tp, tp + fp), recall: ratio(tp, tp + fn) };
}

const filename = process.argv[2];
if (!filename) throw new Error("Usage: node scripts/evaluate-meeting-quality.mjs <consented-evaluation.json>");
const samples = JSON.parse((await readFile(filename, "utf8")).replace(/^\uFEFF/u, ""));
if (!Array.isArray(samples)) throw new Error("Evaluation file must contain an array of samples.");
const segmenter = new Intl.Segmenter("und", { granularity: "grapheme" });
const graphemes = (value) => [...segmenter.segment(value.normalize("NFC").replace(/\s+/gu, " ").trim())].map((part) => part.segment);
const results = samples.map((sample) => {
  if (typeof sample.id !== "string" || typeof sample.referenceTranscript !== "string" || typeof sample.generatedTranscript !== "string") {
    throw new Error("Each sample needs id, referenceTranscript, and generatedTranscript strings.");
  }
  const reference = graphemes(sample.referenceTranscript);
  const generated = graphemes(sample.generatedTranscript);
  const englishOnly = !/[\u1780-\u17ff]/u.test(sample.referenceTranscript + sample.generatedTranscript);
  const referenceWords = sample.referenceTranscript.trim().split(/\s+/u).filter(Boolean);
  const generatedWords = sample.generatedTranscript.trim().split(/\s+/u).filter(Boolean);
  const claims = sample.summaryClaims;
  if (claims && (![claims.supported, claims.total, claims.missing].every((value) => Number.isSafeInteger(value) && value >= 0) || claims.supported > claims.total)) {
    throw new Error("Summary claim counts are invalid.");
  }
  return {
    id: sample.id,
    category: sample.category ?? null,
    characterErrorRate: ratio(editDistance(reference, generated), reference.length),
    englishWhitespaceWordErrorRate: englishOnly ? ratio(editDistance(referenceWords, generatedWords), referenceWords.length) : null,
    summaryFactualAccuracy: claims ? ratio(claims.supported, claims.total) : null,
    unsupportedClaims: claims ? claims.total - claims.supported : null,
    missingInformation: claims?.missing ?? null,
    decision: scoreCounts(sample.decisions),
    actionItems: scoreCounts(sample.actionItems)
  };
});
process.stdout.write(`${JSON.stringify(results, null, 2)}\n`);
