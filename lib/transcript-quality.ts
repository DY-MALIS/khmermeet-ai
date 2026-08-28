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

// Multimodal models occasionally answer with a restatement of the system/user
// instructions instead of listening to the audio. That output is fluent and
// long, so the normal low-speech checks consider it valid unless we identify
// the characteristic meta-language explicitly.
export function hasTranscriptionPromptLeakage(text: string) {
  const compact = text.replace(/\s+/g, " ").trim();
  const directLeak = /\bi need to follow (?:these|the) rules\b/i.test(text) ||
    /\bthe user has provided (?:a list of )?(?:known )?participants\b/i.test(text) ||
    /\bverbatim transcript of (?:the )?(?:khmer|english|audio|meeting)/i.test(text) ||
    /\btranscript of (?:the )?(?:khmer|english|audio|meeting|provided audio)\b/i.test(text) ||
    /\b(?:audio|recording) (?:contains|appears to contain|is in)\b/i.test(text) ||
    /^\s*(?:probe|test|diagnostic|analysis)\s*[:：]/im.test(text) ||
    /^(?:[^:\n]{1,60}\s*[:：]\s*)?(?:verbatim\s+)?transcript of\b/i.test(compact) ||
    /^\s*(?:[^:\n]{1,60}\s*:\s*)?(?:here is|here's)\s+(?:the\s+)?(?:verbatim\s+)?transcript\b/im;
  if (directLeak) return true;

  const signals = [
    /\bverbatim transcription\b/i,
    /\blanguage preservation\b/i,
    /\bspeaker identification\b/i,
    /\baccuracy over fluency\b/i,
    /\bno paraphrasing or summarizing\b/i,
    /\bstart each turn with (?:the|a) speaker label\b/i,
    /\buse [`'"]?(?:unknown speaker|speaker 1)[`'"]?\b/i,
    /\btranscribe everything exactly as spoken\b/i
  ];
  return signals.filter((pattern) => pattern.test(text)).length >= 2;
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
  if (hasTranscriptionPromptLeakage(clean)) return false;
  if (isTimestampOnlyTranscript(clean)) return false;
  if (hasLowSpeechSignal(clean)) return false;
  return true;
}

