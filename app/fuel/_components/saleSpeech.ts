// Turns what the speech recogniser heard into candidate values for the pump sale
// form. Values are anchored to a keyword by position, and anything that can't be
// pinned down stays undefined, so the attendant taps it in instead of a guess
// appearing in the form. The one inference — a single leftover number taken as
// the amount — is flagged as assumed.

export type SpokenPayment = "CASH" | "CARD" | "QR";

export interface SaleSpeech {
  pumpNumber?: number;
  fuelType?: string;
  // At most one of the two: a sale is asked for by litres or by rupees.
  liters?: number;
  rupees?: number;
  // The amount was said without "litres" or "rupees" and its unit was inferred
  // from its size; the caller says so, so the attendant checks it.
  amountAssumed?: boolean;
  paymentMethod?: SpokenPayment;
  // The phrase was nothing but a go-ahead ("confirm", "හරි"). Never set together
  // with sale values: a sale can't be filled in and confirmed in one breath.
  confirm?: boolean;
}

interface Token {
  word: string;
  num?: number;
  // Already taken by another field; a number is never used twice.
  used?: boolean;
  sinhala?: boolean;
  // Came from number words ("five", "five hundred"), not digits.
  spoken?: boolean;
}

const UNITS: Record<string, number> = { zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9 };
const TEENS: Record<string, number> = { ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19 };
const TENS: Record<string, number> = { twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };

// Sinhala words as the recogniser spells them (joiners stripped), matched by
// stem because the endings inflect.
const SINHALA_STEMS: [string, string][] = [
  ["පොම්ප", "pump"], ["අංක", "number"], ["පෙට්රල්", "petrol"], ["ඩීසල්", "diesel"],
  ["ඕටෝ", "auto"], ["සුපර්", "super"], ["ලීටර්", "litre"], ["රුපියල්", "rupees"],
  ["කාඩ්", "card"], ["කෑෂ්", "cash"], ["මුදල්", "cash"],
  ["තහවුරු", "confirm"], ["හරි", "confirm"], ["ඔව්", "confirm"],
];

// Sinhala number words. A number is built as [thousands][hundreds][under 100], in
// one word ("එක්දහස්පන්සීය") or several ("එක්දහස් පන්සීය"), usually ending in the
// indefinite -ක / -ක් ("දෙදහසක්", "විස්සක්").
const SI_UNDER_100 = new Map<string, number>();
{
  const units = ["එක", "දෙක", "තුන", "හතර", "පහ", "හය", "හත", "අට", "නවය"];
  units.forEach((w, i) => SI_UNDER_100.set(w, i + 1));
  SI_UNDER_100.set("නමය", 9).set("දහය", 10);
  ["එකොළහ", "දොළහ", "දහතුන", "දහහතර", "පහළොව", "දහසය", "දහහත", "දහඅට", "දහනවය"].forEach((w, i) => SI_UNDER_100.set(w, 11 + i));
  SI_UNDER_100.set("පහලොව", 15).set("දහනමය", 19);
  // [said alone, joined to a unit]: විස්ස = 20, විසිපහ = 25
  const tens: [string, string][] = [["විස්ස", "විසි"], ["තිහ", "තිස්"], ["හතළිහ", "හතළිස්"], ["පනහ", "පනස්"], ["හැට", "හැට"], ["හැත්තෑව", "හැත්තෑ"], ["අසූව", "අසූ"], ["අනූව", "අනූ"]];
  tens.forEach(([alone, stem], i) => {
    const value = (i + 2) * 10;
    SI_UNDER_100.set(alone, value).set(stem, value);
    units.forEach((u, j) => SI_UNDER_100.set(stem + u, value + j + 1));
    SI_UNDER_100.set(stem + "නමය", value + 9);
  });
  SI_UNDER_100.set("හතලිහ", 40).set("හතලිස්", 40);
}
// How 1–9 are said in front of "hundred" / "thousand": දෙසීය = 200, පන්දහස = 5000.
const SI_COUNT_STEMS: [string, number][] = [
  ["එක්", 1], ["එක", 1], ["දෙ", 2], ["තුන්", 3], ["හාර", 4], ["හතර", 4], ["පන්", 5], ["පස්", 5],
  ["හය", 6], ["හත්", 7], ["අට", 8], ["නව", 9], ["නම", 9], ["දස", 10], ["දහ", 10],
];
const SI_HUNDRED = ["සියය", "සීය", "සිය"];
const SI_THOUSAND = ["දහස්", "දහස", "දාහ", "දාස්"];

// Takes "<count><scale word>" off the front of a word: its value and what is left.
function sinhalaScale(word: string, scaleWords: string[], scale: number): [number, string] | undefined {
  for (const [stem, count] of [...SI_COUNT_STEMS, ["", 1] as [string, number]]) {
    if (!word.startsWith(stem)) continue;
    const scaleWord = scaleWords.find((s) => word.startsWith(s, stem.length));
    if (scaleWord) return [count * scale, word.slice(stem.length + scaleWord.length)];
  }
  return undefined;
}

function sinhalaNumber(word: string): number | undefined {
  const parse = (w: string) => {
    let total = 0;
    let rest = w;
    for (const [scaleWords, scale] of [[SI_THOUSAND, 1000], [SI_HUNDRED, 100]] as const) {
      const part = sinhalaScale(rest, scaleWords, scale);
      if (part) [total, rest] = [total + part[0], part[1]];
    }
    if (rest === "") return total > 0 ? total : undefined;
    const small = SI_UNDER_100.get(rest);
    return small === undefined ? undefined : total + small;
  };
  // Whole word first: the -ක of දෙක (2) is part of the number, not an ending.
  for (const ending of ["", "ක්", "ක", "යි"]) {
    if (!word.endsWith(ending)) continue;
    const value = parse(ending ? word.slice(0, -ending.length) : word);
    if (value !== undefined) return value;
  }
  return undefined;
}

const LITRE_WORDS = new Set(["litre", "litres", "liter", "liters", "ltr", "ltrs", "l"]);
const RUPEE_WORDS = new Set(["rupees", "rupee", "rs", "lkr"]);
const PAYMENT_WORDS: Record<string, SpokenPayment> = { cash: "CASH", card: "CARD", qr: "QR" };
// Said between "pump" and its number.
const PUMP_FILLERS = new Set(["number", "no"]);
// What the recogniser writes for a lone "two" / "four"; only trusted straight after "pump".
const PUMP_HOMOPHONES: Record<string, number> = { to: 2, too: 2, for: 4 };
const CONFIRM_WORDS = new Set(["confirm", "confirmed", "record", "submit", "ok", "okay"]);
const CONFIRM_FILLERS = new Set(["please", "it", "the", "sale", "that", "yes", "කරන්න"]);
const MAX_LITERS = 1000;
// A bare number is litres below this and rupees from it up: nobody buys under
// Rs. 100 of fuel, and a sale of 100 L or more is rare enough to say "litres".
const BARE_NUMBER_IS_RUPEES_FROM = 100;

function tokenize(text: string): Token[] {
  const words = text
    .normalize("NFC")
    .toLowerCase()
    .replace(/[‌‍]/g, "")
    // The recogniser writes "2000 rupees" as "₹2,000".
    .replace(/₹/g, " rupees ")
    .replace(/(\d),(?=\d)/g, "$1")
    // "20l" → "20 l", "pump2" → "pump 2"
    .replace(/(\d)([^\d\s.,])/g, "$1 $2")
    .replace(/([^\d\s.,])(\d)/g, "$1 $2")
    .replace(/[^\p{L}\p{M}\p{N}.]+/gu, " ")
    // A dot only survives inside a decimal.
    .replace(/\.(?!\d)|(?<!\d)\./g, " ")
    .split(/\s+/)
    .filter((w) => w && w !== "octane");

  const tokens: Token[] = [];
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    const stem = SINHALA_STEMS.find(([s]) => w.startsWith(s));
    if (stem) {
      tokens.push({ word: stem[1], sinhala: true });
    } else if (/^\d+(\.\d+)?$/.test(w)) {
      tokens.push({ word: w, num: Number(w) });
    } else if (w in TENS && words[i + 1] in UNITS && UNITS[words[i + 1]] > 0) {
      // "ninety two" → 92. "two twenty" is NOT joined: it stays 2 and 20.
      tokens.push({ word: `${w} ${words[i + 1]}`, num: TENS[w] + UNITS[words[i + 1]], spoken: true });
      i++;
    } else if (w in UNITS || w in TEENS || w in TENS) {
      tokens.push({ word: w, num: UNITS[w] ?? TEENS[w] ?? TENS[w], spoken: true });
    } else {
      const sinhala = sinhalaNumber(w);
      tokens.push(sinhala === undefined ? { word: w } : { word: String(sinhala), num: sinhala, spoken: true, sinhala: true });
    }
  }

  // Sinhala numbers said as several words, biggest part first:
  // "එක්දහස් පන්සීය" → 1500, "දෙසිය පනහ" → 250, "අනූ දෙක" → 92.
  for (let i = tokens.length - 2; i >= 0; i--) {
    const [big, small] = [tokens[i], tokens[i + 1]];
    if (!big.sinhala || !small.sinhala || big.num === undefined || small.num === undefined) continue;
    const room = big.num % 1000 === 0 ? 1000 : big.num % 100 === 0 ? 100 : big.num % 10 === 0 && big.num < 100 ? 10 : 0;
    if (big.num > 0 && small.num > 0 && small.num < room) tokens.splice(i, 2, { word: String(big.num + small.num), num: big.num + small.num, spoken: true, sinhala: true });
  }

  // "twenty point five" → 20.5
  for (let i = 1; i < tokens.length - 1; i++) {
    const [whole, point, frac] = [tokens[i - 1], tokens[i], tokens[i + 1]];
    if (point.word === "point" && Number.isInteger(whole.num) && Number.isInteger(frac.num) && frac.num! < 10) {
      tokens.splice(i - 1, 3, { word: `${whole.num}.${frac.num}`, num: Number(`${whole.num}.${frac.num}`) });
    }
  }

  // Prices said in words: "five hundred" → 500, "fifteen hundred" → 1500,
  // "two thousand five hundred" → 2500. Hundreds are joined first so the thousands
  // can take them as their remainder; only a remainder said in words is added.
  for (const [scaleWord, scale] of [["hundred", 100], ["thousand", 1000]] as const) {
    for (let i = 1; i < tokens.length; i++) {
      const head = tokens[i - 1];
      if (tokens[i].word !== scaleWord || !Number.isInteger(head.num) || head.num! <= 0 || head.num! >= (scale === 100 ? 100 : 1000)) continue;
      const rest = tokens[i + 1]?.word === "and" ? tokens[i + 2] : tokens[i + 1];
      const hasRest = !!rest?.spoken && rest.num! < scale;
      const total = head.num! * scale + (hasRest ? rest!.num! : 0);
      tokens.splice(i - 1, hasRest ? tokens.indexOf(rest!) - i + 2 : 2, { word: String(total), num: total, spoken: true });
    }
  }
  return tokens;
}

// One distinct value, or nothing: two different candidates for a field is a guess.
function only<T>(candidates: T[]): T | undefined {
  const distinct = [...new Set(candidates)];
  return distinct.length === 1 ? distinct[0] : undefined;
}

const sameToken = (a: Token, b: Token) => (a.num !== undefined || b.num !== undefined ? a.num === b.num : a.word === b.word);

export function parseSaleSpeech(transcript: string, known: { pumps: number[]; fuelTypes: string[] }): SaleSpeech {
  const tokens = tokenize(transcript);

  // A go-ahead counts only when it is the whole phrase.
  if (tokens.some((t) => CONFIRM_WORDS.has(t.word)) && tokens.every((t) => CONFIRM_WORDS.has(t.word) || CONFIRM_FILLERS.has(t.word))) {
    return { confirm: true };
  }

  // PUMP: the number straight after "pump" (one filler allowed). It is claimed even
  // when it isn't an open pump — "pump two twenty litres" heard as "pump 220 litres"
  // must not hand 220 on to the litres field.
  const pumpCandidates: number[] = [];
  tokens.forEach((t, i) => {
    if (t.word !== "pump") return;
    let next = tokens[i + 1];
    if (next && PUMP_FILLERS.has(next.word)) next = tokens[i + 2];
    if (!next) return;
    const n = next.num ?? PUMP_HOMOPHONES[next.word];
    if (n === undefined) return;
    next.used = true;
    pumpCandidates.push(n);
  });
  const pump = only(pumpCandidates);
  const pumpNumber = pump !== undefined && known.pumps.includes(pump) ? pump : undefined;

  // "petrol 95, 20" often comes back run together as "petrol 9520". Next to a word
  // from a tank's name, a number that starts with that tank's grade is split back
  // into the grade and the rest.
  for (const fuelType of known.fuelTypes) {
    const name = tokenize(fuelType);
    const grade = name.find((n) => n.num !== undefined)?.word;
    if (!grade) continue;
    for (let i = 0; i < tokens.length; i++) {
      const t = tokens[i];
      const rest = t.word.slice(grade.length);
      const besideName = [tokens[i - 1], tokens[i + 1]].some((x) => x && x.num === undefined && name.some((n) => n.word === x.word));
      if (t.used || !besideName || !/^\d+$/.test(t.word) || !t.word.startsWith(grade) || !/^[1-9]\d*$/.test(rest)) continue;
      tokens.splice(i, 1, { word: grade, num: Number(grade) }, { word: rest, num: Number(rest) });
    }
  }

  // FUEL: every word of a tank's name said together, in either order
  // ("petrol 92" / "92 petrol", "auto diesel"). "Petrol" or "diesel" alone is not enough.
  const fuelCandidates: string[] = [];
  for (const fuelType of known.fuelTypes) {
    const name = tokenize(fuelType);
    if (name.length === 0) continue;
    for (let i = 0; i + name.length <= tokens.length; i++) {
      const window = tokens.slice(i, i + name.length);
      if (window.some((t) => t.used)) continue;
      const rest = [...window];
      const matches = name.every((n) => {
        const at = rest.findIndex((t) => sameToken(t, n));
        if (at < 0) return false;
        rest.splice(at, 1);
        return true;
      });
      if (matches) {
        fuelCandidates.push(fuelType);
        window.forEach((t) => { t.used = true; });
      }
    }
  }
  const fuelType = only(fuelCandidates);

  // LITRES: the number straight before "litres". Sinhala puts the number after
  // the word, so there the number straight after is accepted too.
  const free = (x?: Token) => (x && x.num !== undefined && !x.used ? x : undefined);
  const literCandidates: number[] = [];
  tokens.forEach((t, i) => {
    if (!LITRE_WORDS.has(t.word)) return;
    const amount = free(tokens[i - 1]) ?? (t.sinhala ? free(tokens[i + 1]) : undefined);
    if (!amount) return;
    amount.used = true;
    literCandidates.push(amount.num!);
  });
  const volume = only(literCandidates);
  const liters = volume !== undefined && volume > 0 && volume <= MAX_LITERS ? volume : undefined;

  // RUPEES: the number beside "rupees", either side ("2000 rupees", "Rs. 2000").
  const rupeeCandidates: number[] = [];
  tokens.forEach((t, i) => {
    if (!RUPEE_WORDS.has(t.word)) return;
    const amount = free(tokens[i - 1]) ?? free(tokens[i + 1]);
    if (!amount) return;
    amount.used = true;
    rupeeCandidates.push(amount.num!);
  });
  const money = only(rupeeCandidates);
  const rupees = money !== undefined && money > 0 ? money : undefined;

  const paymentMethod = only(tokens.filter((t) => t.word in PAYMENT_WORDS).map((t) => PAYMENT_WORDS[t.word]));

  // Attendants rarely say the unit ("petrol 95, 20"). When neither unit was said and
  // exactly one number is left that no other field claimed, that number is the
  // amount. Two or more leftovers stay a guess and fill nothing.
  if (literCandidates.length === 0 && rupeeCandidates.length === 0) {
    const leftover = tokens.filter((t) => t.num !== undefined && !t.used);
    const bare = leftover.length === 1 ? leftover[0].num! : 0;
    if (bare > 0) {
      const asRupees = bare >= BARE_NUMBER_IS_RUPEES_FROM;
      return { pumpNumber, fuelType, liters: asRupees ? undefined : bare, rupees: asRupees ? bare : undefined, amountAssumed: true, paymentMethod };
    }
  }

  // Litres and rupees in one phrase: which one was meant is a guess, so neither is kept.
  const both = liters !== undefined && rupees !== undefined;
  return { pumpNumber, fuelType, liters: both ? undefined : liters, rupees: both ? undefined : rupees, paymentMethod };
}
