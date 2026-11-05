const KHMER_DIGITS = "០១២៣៤៥៦៧៨៩";
const KHMER_ONES = ["សូន្យ", "មួយ", "ពីរ", "បី", "បួន", "ប្រាំ", "ប្រាំមួយ", "ប្រាំពីរ", "ប្រាំបី", "ប្រាំបួន"];
const KHMER_TENS = ["", "ដប់", "ម្ភៃ", "សាមសិប", "សែសិប", "ហាសិប", "ហុកសិប", "ចិតសិប", "ប៉ែតសិប", "កៅសិប"];
const KHMER_GROUPS = ["", "ពាន់", "លាន", "ប៊ីលាន", "ទ្រីលាន", "ក្វាទ្រីលាន", "គ្វីនទីលាន"];
const ENGLISH_ONES = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"];
const ENGLISH_TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];
const ENGLISH_GROUPS = ["", "thousand", "million", "billion", "trillion", "quadrillion", "quintillion"];

function khmerUnderThousand(value: number): string {
  if (value >= 100) {
    const rest = value % 100;
    return `${KHMER_ONES[Math.floor(value / 100)]}រយ${rest ? khmerUnderThousand(rest) : ""}`;
  }
  if (value >= 10) {
    const rest = value % 10;
    return `${KHMER_TENS[Math.floor(value / 10)]}${rest ? KHMER_ONES[rest] : ""}`;
  }
  return KHMER_ONES[value];
}

function englishUnderThousand(value: number): string {
  if (value >= 100) {
    const rest = value % 100;
    return `${ENGLISH_ONES[Math.floor(value / 100)]} hundred${rest ? ` ${englishUnderThousand(rest)}` : ""}`;
  }
  if (value >= 20) {
    const rest = value % 10;
    return `${ENGLISH_TENS[Math.floor(value / 10)]}${rest ? ` ${ENGLISH_ONES[rest]}` : ""}`;
  }
  return ENGLISH_ONES[value];
}

function spellDigitsIndividually(digits: string, khmer: boolean): string {
  return [...digits].map((digit) => khmer ? KHMER_ONES[Number(digit)] : ENGLISH_ONES[Number(digit)]).join(" ");
}

function spellInteger(digits: string, khmer: boolean): string {
  if (digits.length > 1 && digits.startsWith("0")) return spellDigitsIndividually(digits, khmer);
  const groups = digits.replace(/^0+(?=\d)/, "").match(/\d{1,3}(?=(?:\d{3})*$)/g) ?? [];
  if (groups.length > KHMER_GROUPS.length) return spellDigitsIndividually(digits, khmer);
  const parts: string[] = [];
  for (let index = 0; index < groups.length; index += 1) {
    const value = Number(groups[index]);
    if (!value) continue;
    const unit = khmer ? KHMER_GROUPS[groups.length - index - 1] : ENGLISH_GROUPS[groups.length - index - 1];
    const spoken = khmer ? khmerUnderThousand(value) : englishUnderThousand(value);
    parts.push(khmer ? `${spoken}${unit}` : `${spoken}${unit ? ` ${unit}` : ""}`);
  }
  return parts.length ? parts.join(khmer ? "" : " ") : (khmer ? KHMER_ONES[0] : ENGLISH_ONES[0]);
}

function spellNumericToken(token: string, khmer: boolean): string {
  const ascii = token.replace(/[០-៩]/g, (digit) => String(KHMER_DIGITS.indexOf(digit)));
  const [integer, decimal] = ascii.split(".");
  const digits = integer.replace(/,/g, "");
  const whole = /^\d{1,3}(,\d{3})+$/.test(integer) || !integer.includes(",")
    ? spellInteger(digits, khmer)
    : spellDigitsIndividually(digits, khmer);
  if (!decimal) return whole;
  return `${whole}${khmer ? "ចុច" : " point "}${spellDigitsIndividually(decimal, khmer)}`;
}

// The audio model is asked to write the words it heard. This is only a
// display fallback for explicit digit sequences it returned anyway; it never
// guesses a value from context. Speaker IDs and URLs are metadata, not speech.
export function spellTranscriptNumberWords(text: string): string {
  return text.split(/(\r?\n)/).map((line) => {
    if (/^\r?\n$/.test(line)) return line;
    const label = line.match(/^\s*[^:\n]{1,60}[:：]\s*/u)?.[0] ?? "";
    const spoken = line.slice(label.length);
    const khmer = /[ក-៿]/u.test(spoken) || !/[A-Za-z]/.test(spoken);
    return label + spoken.split(/(https?:\/\/\S+|www\.\S+|\S+@\S+|[A-Za-z][A-Za-z0-9]*-\d+[A-Za-z0-9]*)/giu).map((segment) => {
      if (/^(?:https?:\/\/|www\.|\S+@|[A-Za-z][A-Za-z0-9]*-\d)/iu.test(segment)) return segment;
      const withoutShorthand = segment.replace(/(?<![A-Za-z0-9])[0-9០-៩]+(?:[.,][0-9០-៩]+)?[KMBT](?![A-Za-z])/giu,
        khmer ? "[លេខមិនច្បាស់]" : "[unclear number]");
      return withoutShorthand.replace(/(?<![A-Za-z0-9])([0-9០-៩][0-9០-៩,]*(?:\.[0-9០-៩]+)?)(?![A-Za-z0-9])/gu,
        (token) => spellNumericToken(token, khmer));
    }).join("");
  }).join("");
}
