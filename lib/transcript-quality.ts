export function isTimestampOnlyTranscript(text: string) {
  const compact = text
    .replace(/\b(?:speaker|អ្នកនិយាយ)\s*\d*\s*:/giu, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!compact) return true;

  const withoutTimestamps = compact
    .replace(/\b\d{1,2}:\d{2}(?::\d{2})?\b/g, "")
    .replace(/[.,;:()[\]\-_/\\|]+/g, "")
    .trim();

  const letterMatches = compact.match(/\p{L}/gu) ?? [];
  const timestampMatches = compact.match(/\b\d{1,2}:\d{2}(?::\d{2})?\b/g) ?? [];

  return timestampMatches.length >= 3 && (withoutTimestamps.length === 0 || letterMatches.length < 8);
}

export function hasUsableTranscript(text: string) {
  const clean = text.trim();
  if (!clean) return false;
  if (isTimestampOnlyTranscript(clean)) return false;
  return (clean.match(/\p{L}/gu) ?? []).length >= 3;
}
