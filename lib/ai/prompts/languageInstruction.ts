export type DocumentLanguageMode = "km" | "en" | "km-en";

export function buildLanguageInstruction(language: DocumentLanguageMode) {
  if (language === "km") {
    return "Write the entire output in Khmer script only, including every section heading and structural label (e.g. translate things like \"Subject:\" or \"Background\" into Khmer too). If the source material contains English, translate its meaning into natural Khmer. Keep proper names, product names, URLs, and well-known acronyms in their original form.";
  }
  if (language === "en") {
    return "Write the entire output in English only, including every section heading and structural label. If the source material contains Khmer, translate its meaning into natural English. Keep proper names, product names, URLs, and well-known acronyms in their original form.";
  }
  return "The source material mixes Khmer and English. Write the output in whichever language dominates the source material, and keep every section heading and structural label in that same language - do not leave headings in English when the content is Khmer, or vice versa.";
}
