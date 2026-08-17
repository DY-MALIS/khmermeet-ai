export function normalizeAuthEmail(value: unknown) {
  if (typeof value !== "string") return "";

  return value
    .normalize("NFKC")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/\s+/g, "")
    .toLowerCase();
}

export function normalizeAuthPassword(value: unknown) {
  if (typeof value !== "string") return "";

  return value.normalize("NFKC").replace(/[\u200B-\u200D\uFEFF]/g, "").trim();
}
