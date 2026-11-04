const digitWords = new Map([
  ["ប្រាំបួន", 9], ["ប្រាំបី", 8], ["ប្រាំពីរ", 7], ["ប្រាំមួយ", 6],
  ["ប្រាំ", 5], ["បួន", 4], ["បី", 3], ["ពីរ", 2], ["មួយ", 1]
]);

const tensWords = new Map([
  ["កៅសិប", 90], ["ប៉ែតសិប", 80], ["ចិតសិប", 70], ["ហុកសិប", 60],
  ["ហាសិប", 50], ["សែសិប", 40], ["សាមសិប", 30], ["ម្ភៃ", 20], ["ដប់", 10]
]);

const scaleWords = new Map([
  ["លាន", 1_000_000], ["ម៉ឺន", 10_000], ["ពាន់", 1_000], ["រយ", 100]
]);

const orderedDigits = [...digitWords.keys()].sort((a, b) => b.length - a.length);
const orderedTens = [...tensWords.keys()].sort((a, b) => b.length - a.length);
const orderedScales = [...scaleWords.keys()].sort((a, b) => b.length - a.length);
const digitPattern = `(?:${orderedDigits.join("|")})`;
const tensPattern = `(?:${orderedTens.join("|")})`;
const scalePattern = `(?:${orderedScales.join("|")})`;
// A bare "មួយ" can mean "a" in an ordinary phrase. Only expressions with a
// tens word or an explicit scale are unambiguous enough to change here.
const numberPattern = new RegExp(
  `(?:${digitPattern}${scalePattern})+(?:(?:${tensPattern})${digitPattern}?|${digitPattern})?|${tensPattern}${digitPattern}?`,
  "g"
);
const tokens = [...orderedDigits, ...orderedTens, ...orderedScales].sort((a, b) => b.length - a.length);

function valueOfKhmerNumber(phrase: string): number | null {
  let total = 0;
  let pending = 0;
  for (let index = 0; index < phrase.length;) {
    const token = tokens.find((word) => phrase.startsWith(word, index));
    if (!token) return null;
    const digit = digitWords.get(token);
    const tens = tensWords.get(token);
    const scale = scaleWords.get(token);
    if (digit !== undefined) pending += digit;
    else if (tens !== undefined) {
      total += tens;
      pending = 0;
    } else if (scale !== undefined) {
      total += (pending || 1) * scale;
      pending = 0;
    }
    index += token.length;
  }
  return total + pending;
}

export function normalizeSpokenKhmerNumbers(text: string) {
  return text.replace(numberPattern, (phrase) => {
    const value = valueOfKhmerNumber(phrase);
    return value === null ? phrase : String(value);
  });
}
