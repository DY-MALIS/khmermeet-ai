const ZERO_WIDTH_CHARS = new RegExp("[\\u200B-\\u200D\\uFEFF]", "g");

export function normalizeAuthEmail(value: unknown) {
  if (typeof value !== "string") return "";

  return value
    .normalize("NFKC")
    .replace(ZERO_WIDTH_CHARS, "")
    .replace(/\s+/g, "")
    .toLowerCase()
    .replace(/[\\/]+(?=@)/g, "");
}

export function hasEmailSeparatorTypo(value: string) {
  return /[\\/]+@/.test(value);
}

export function normalizeAuthPassword(value: unknown) {
  if (typeof value !== "string") return "";

  return value.normalize("NFKC").replace(ZERO_WIDTH_CHARS, "").trim();
}
