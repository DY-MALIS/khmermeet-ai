const digitWords = new Map([
  ["ប្រាំបួន", BigInt("9")], ["ប្រាំបី", BigInt("8")], ["ប្រាំពីរ", BigInt("7")], ["ប្រាំមួយ", BigInt("6")],
  ["ប្រាំ", BigInt("5")], ["បួន", BigInt("4")], ["បី", BigInt("3")], ["ពីរ", BigInt("2")], ["មួយ", BigInt("1")]
]);

const tensWords = new Map([
  ["កៅសិប", BigInt("90")], ["ប៉ែតសិប", BigInt("80")], ["ចិតសិប", BigInt("70")], ["ហុកសិប", BigInt("60")],
  ["ហាសិប", BigInt("50")], ["សែសិប", BigInt("40")], ["សាមសិប", BigInt("30")], ["ម្ភៃ", BigInt("20")], ["ដប់", BigInt("10")]
]);

const scaleWords = new Map([
  ["ពាន់ក្វាទ្រីលាន", BigInt("1000000000000000000")],
  ["ក្វាទ្រីលាន", BigInt("1000000000000000")],
  ["ពាន់ទ្រីលាន", BigInt("1000000000000000")],
  ["ទ្រីលាន", BigInt("1000000000000")],
  ["ពាន់ប៊ីលាន", BigInt("1000000000000")],
  ["លានលាន", BigInt("1000000000000")],
  ["ពាន់លាន", BigInt("1000000000")], ["ប៊ីលាន", BigInt("1000000000")],
  ["រយលាន", BigInt("100000000")], ["លាន", BigInt("1000000")],
  ["ម៉ឺន", BigInt("10000")], ["ពាន់", BigInt("1000")], ["រយ", BigInt("100")]
]);

const orderedDigits = [...digitWords.keys()].sort((a, b) => b.length - a.length);
const orderedTens = [...tensWords.keys()].sort((a, b) => b.length - a.length);
const orderedScales = [...scaleWords.keys()].sort((a, b) => b.length - a.length);
const tokenPattern = `(?:${[...orderedDigits, ...orderedTens, ...orderedScales].sort((a, b) => b.length - a.length).join("|")})`;
// A bare "មួយ" can mean "a" in an ordinary phrase. Only expressions with a
// tens word or an explicit scale are unambiguous enough to change here.
const numberPattern = new RegExp(`${tokenPattern}(?:[ \t]*${tokenPattern})*`, "g");
const tokens = [...orderedDigits, ...orderedTens, ...orderedScales].sort((a, b) => b.length - a.length);

function valueOfKhmerNumber(phrase: string): string | null {
  let total = BigInt("0");
  let group = BigInt("0");
  let pending = BigInt("0");
  let hasClearNumberMarker = false;
  let hasCoefficient = false;
  const compact = phrase.replace(/[ \t]/g, "");
  for (let index = 0; index < compact.length;) {
    const token = tokens.find((word) => compact.startsWith(word, index));
    if (!token) return null;
    const digit = digitWords.get(token);
    const tens = tensWords.get(token);
    const scale = scaleWords.get(token);
    if (digit !== undefined) {
      pending += digit;
      hasCoefficient = true;
    }
    else if (tens !== undefined) {
      group += tens;
      pending = BigInt("0");
      hasClearNumberMarker = true;
      hasCoefficient = true;
    } else if (scale !== undefined) {
      hasClearNumberMarker = true;
      if (scale === BigInt("100")) group += (pending || BigInt("1")) * scale;
      else {
        total += (group + pending || BigInt("1")) * scale;
        group = BigInt("0");
      }
      pending = BigInt("0");
    }
    index += token.length;
  }
  return hasClearNumberMarker && hasCoefficient ? String(total + group + pending) : null;
}

export function normalizeSpokenKhmerNumbers(text: string) {
  return text.replace(numberPattern, (phrase) => {
    const value = valueOfKhmerNumber(phrase);
    return value ?? phrase;
  });
}
