export type SourcedItem = { sourceText?: string | null };

// An extracted decision or task is only shown when the model supplies a
// verbatim excerpt that can be found in the original transcript. This does
// not prove the interpretation, but it makes unsupported output reviewable.
export function keepItemsWithTranscriptSource<T extends SourcedItem>(items: T[], transcript: string): T[] {
  const normalize = (value: string) => value.normalize("NFC").replace(/\s+/gu, " ").trim();
  const source = normalize(transcript);
  return items.filter((item) => {
    const excerpt = normalize(item.sourceText ?? "");
    return excerpt.length >= 4 && source.includes(excerpt);
  });
}

export function keepNewExtractedTasks<T extends SourcedItem & { title: string }>(
  items: T[], existing: Array<{ title: string; sourceText: string | null }>
): T[] {
  const key = (item: { title: string; sourceText?: string | null }) =>
    `${item.title.normalize("NFC").trim().toLocaleLowerCase()}\u0000${(item.sourceText ?? "").normalize("NFC").replace(/\s+/gu, " ").trim()}`;
  const seen = new Set(existing.map(key));
  return items.filter((item) => {
    const value = key(item);
    if (seen.has(value)) return false;
    seen.add(value);
    return true;
  });
}
