function stripSpeakerLabels(text: string) {
  return text
    .replace(/\b(?:speaker|participant|user)\s*\d*\s*:/giu, " ")
    .replace(/\b(?:អ្នកនិយាយ|អ្នកចូលរួម)\s*\d*\s*:/giu, " ");
}

export function isTimestampOnlyTranscript(text: string) {
  const compact = stripSpeakerLabels(text).replace(/\s+/g, " ").trim();
  if (!compact) return true;

  const withoutTimestamps = compact
    .replace(/\b\d{1,2}:\d{2}(?::\d{2})?\b/g, "")
    .replace(/[.,;:()[\]\-_/\\|]+/g, "")
    .trim();

  const letterMatches = compact.match(/\p{L}/gu) ?? [];
  const timestampMatches = compact.match(/\b\d{1,2}:\d{2}(?::\d{2})?\b/g) ?? [];

  return timestampMatches.length >= 3 && (withoutTimestamps.length === 0 || letterMatches.length < 8);
}

export function hasCorruptedEncoding(text: string) {
  return /(?:áž|áŸ|Â·|â€¢|Ã|�)/.test(text);
}

export function hasLowSpeechSignal(text: string) {
  const timestampMatches = text.match(/\b\d{1,2}:\d{2}(?::\d{2})?\b/g) ?? [];
  const compact = stripSpeakerLabels(text)
    .replace(/\b\d{1,2}:\d{2}(?::\d{2})?\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!compact) return true;

  const letters = compact.match(/\p{L}/gu) ?? [];
  if (letters.length < 1) return true;
  if (letters.length < 8 && timestampMatches.length >= 2) return true;

  const tokens = compact.split(/\s+/).filter(Boolean);
  // A short transcript that is mostly one word repeated (e.g. a model
  // hallucinating "Sanyasu Sanyasu Sanyasu..." on unrecognized audio) is
  // caught here even below the length gate used for the ratio checks below,
  // which need more tokens to avoid flagging real short Khmer utterances.
  if (tokens.length >= 3) {
    const repetitionRatio = new Set(tokens.map((token) => token.toLowerCase())).size / tokens.length;
    if (repetitionRatio < 0.34) return true;
  }

  if (tokens.length >= 8) {
    const uniqueTokenRatio = new Set(tokens.map((token) => token.toLowerCase())).size / tokens.length;
    const veryShortTokenRatio = tokens.filter((token) => [...token].length <= 2).length / tokens.length;

    if (uniqueTokenRatio < 0.25) return true;
    if (veryShortTokenRatio > 0.75) return true;
  }

  return false;
}

export function hasUsableTranscript(text: string) {
  const clean = text.trim();
  if (!clean) return false;
  if (hasCorruptedEncoding(clean)) return false;
  if (isTimestampOnlyTranscript(clean)) return false;
  if (hasLowSpeechSignal(clean)) return false;
  return true;
}
