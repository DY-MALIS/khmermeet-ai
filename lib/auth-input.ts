export function normalizeAuthEmail(value: unknown) {
  if (typeof value !== "string") return "";

  return normalizeLegacyAuthEmail(value).replace(/[\\/]+(?=@)/g, "");
}

export function normalizeLegacyAuthEmail(value: unknown) {
  if (typeof value !== "string") return "";

  return value
    .normalize("NFKC")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/\s+/g, "")
    .toLowerCase();
}

export function authEmailLookupCandidates(value: unknown) {
  return Array.from(new Set([normalizeAuthEmail(value), normalizeLegacyAuthEmail(value)].filter(Boolean)));
}

export function hasEmailSeparatorTypo(value: string) {
  return /[\\/]+@/.test(value);
}

export function normalizeAuthPassword(value: unknown) {
  if (typeof value !== "string") return "";

  return value.normalize("NFKC").replace(/[\u200B-\u200D\uFEFF]/g, "").trim();
}
