# Meeting quality evaluation

Use only synthetic or explicitly consented recordings. Keep source audio and
reference text in a private test location; never commit them. Do not use
customer recordings without consent.

For transcription, collect: clear Khmer, fast Khmer, Khmer–English, two
speakers, background noise, long silence, and a long meeting. A bilingual
reviewer corrects a reference transcript while listening to the audio. Run
the same app version on each recording, save the generated transcript, and
record model configuration and duration. Keep original and generated text
unchanged for scoring.

For summaries, include short and long meetings, Khmer, English and mixed
language, meetings without actions or deadlines, conflicting proposals, and
unclear speaker attribution. A reviewer labels each generated claim as
supported or unsupported by an exact transcript span, counts important facts
omitted, and matches decisions and action items against manually verified
references. Record true positives (`tp`), false positives (`fp`), and false
negatives (`fn`) for each type. Two reviewers should resolve disagreements
before using a score to choose a model or release.

Create a private JSON array like this (the sample below is synthetic):

```json
[
  {
    "id": "synthetic-english-1",
    "category": "short English meeting",
    "referenceTranscript": "We will review the draft.",
    "generatedTranscript": "We will review draft.",
    "summaryClaims": { "supported": 1, "total": 1, "missing": 0 },
    "decisions": { "tp": 0, "fp": 0, "fn": 0 },
    "actionItems": { "tp": 1, "fp": 0, "fn": 0 }
  }
]
```

Run `node scripts/evaluate-meeting-quality.mjs path/to/private-samples.json`.
The script emits per-sample Unicode grapheme character error rate (CER),
English whitespace word error rate (WER), manually annotated summary factual
accuracy, unsupported and missing claim counts, and decision/action precision
and recall. Empty denominators produce `null`, not a fabricated perfect score.
Khmer does not consistently separate words with spaces, so whitespace WER is
omitted whenever Khmer script appears. CER is a useful but incomplete proxy:
punctuation, spelling variants, and semantically equivalent phrasing still
need human review. No accuracy score is reported until a verified dataset is
provided and evaluated.
