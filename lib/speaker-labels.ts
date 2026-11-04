// AI may invent a person's name as a speaker label even when nobody supplied
// that name. Keep only names that came from a call participant or the user.
export function keepTrustedSpeakerLabels(transcript: string, trustedNames: string[]) {
  const trusted = new Set(trustedNames.map((name) => name.trim().toLowerCase()).filter(Boolean));
  const generic = /^(?:Speaker\s+\d+|Unknown\s+Speaker|Unknown|Participant\s+\d+)$/i;
  const usedNumbers = new Set(
    [...transcript.matchAll(/^\s*Speaker\s+(\d+)\s*[:：]/gim)].map((match) => Number(match[1]))
  );
  const replacements = new Map<string, string>();
  let nextNumber = 1;

  return transcript.split(/\r?\n/).map((line) => {
    const match = line.match(/^(\s*)([^:：\n]{1,60})([:：]\s+)(\S.*)$/u);
    if (!match) return line;
    const [, leading, rawLabel, separator, speech] = match;
    const label = rawLabel.trim();
    if (generic.test(label) || trusted.has(label.toLowerCase())) return line;

    const key = label.toLowerCase();
    if (!replacements.has(key)) {
      while (usedNumbers.has(nextNumber)) nextNumber += 1;
      replacements.set(key, `Speaker ${nextNumber}`);
      usedNumbers.add(nextNumber);
      nextNumber += 1;
    }
    return `${leading}${replacements.get(key)}${separator}${speech}`;
  }).join("\n");
}
