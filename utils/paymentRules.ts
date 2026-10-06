// Checks for the sandbox payment page, the same as the backend's SimulatedGateway,
// so each field can say what's wrong while it's typed. The backend checks again.

export type CardBrand = "VISA" | "MASTERCARD" | "AMEX" | "";

export const digitsOf = (v: string) => v.replace(/\D/g, "");

export function cardBrand(digits: string): CardBrand {
  if (digits.startsWith("4")) return "VISA";
  const two = Number(digits.slice(0, 2));
  const four = Number(digits.slice(0, 4));
  if ((two >= 51 && two <= 55) || (four >= 2221 && four <= 2720)) return "MASTERCARD";
  if (two === 34 || two === 37) return "AMEX";
  return "";
}

// Card numbers that are allowed for each scheme.
const LENGTHS: Record<Exclude<CardBrand, "">, number[]> = { VISA: [13, 16, 19], MASTERCARD: [16], AMEX: [15] };
export const maxCardLength = (brand: CardBrand) => (brand ? Math.max(...LENGTHS[brand]) : 19);
export const cvcLength = (brand: CardBrand) => (brand === "AMEX" ? 4 : 3);

// The checksum every real card number passes (the Luhn check).
export function luhn(digits: string): boolean {
  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = Number(digits[i]);
    if (double) { d *= 2; if (d > 9) d -= 9; }
    sum += d;
    double = !double;
  }
  return sum % 10 === 0;
}

// Each returns a message describing what's wrong, or null if the value is fine.

export const BRAND_NAME: Record<Exclude<CardBrand, "">, string> = { VISA: "Visa", MASTERCARD: "Mastercard", AMEX: "Amex" };

// `chosen` is the card type picked before typing; the number has to be one of those.
export function cardNumberProblem(raw: string, chosen?: CardBrand): string | null {
  const d = digitsOf(raw);
  if (!d) return "Enter the card number.";
  const brand = cardBrand(d);
  if (!brand) return "We accept Visa, Mastercard and Amex — check the first digits.";
  if (chosen && brand !== chosen)
    return `This looks like ${brand === "AMEX" ? "an" : "a"} ${BRAND_NAME[brand]} number, but you chose ${BRAND_NAME[chosen]}. Pick ${BRAND_NAME[brand]} above or check the number.`;
  if (!LENGTHS[brand].includes(d.length)) {
    const want = LENGTHS[brand];
    return d.length < Math.min(...want)
      ? `${brand === "AMEX" ? "An" : "A"} ${BRAND_NAME[brand]} number has ${want.length > 1 ? `${want.slice(0, -1).join(", ")} or ${want[want.length - 1]}` : want[0]} digits.`
      : "This card number is too long.";
  }
  if (!luhn(d)) return "This card number isn't valid — check for a mistyped digit.";
  return null;
}

export function expiryProblem(raw: string, now = new Date()): string | null {
  if (!raw) return "Enter the expiry date.";
  const m = /^(\d{2})\/(\d{2})$/.exec(raw);
  if (!m) return "Enter the expiry as MM/YY.";
  const month = Number(m[1]);
  const year = 2000 + Number(m[2]);
  if (month < 1 || month > 12) return "The month must be 01 to 12.";
  const thisMonth = now.getFullYear() * 12 + now.getMonth();
  const expires = year * 12 + (month - 1);
  if (expires < thisMonth) return "This card has expired.";
  if (expires > thisMonth + 20 * 12) return "That expiry date is too far ahead.";
  return null;
}

export function cvcProblem(raw: string, brand: CardBrand): string | null {
  const n = cvcLength(brand);
  if (!raw) return "Enter the security code.";
  if (!new RegExp(`^\\d{${n}}$`).test(raw)) return brand === "AMEX" ? "Amex codes have 4 digits (front of the card)." : "The security code has 3 digits (back of the card).";
  return null;
}

// Letters, spaces, dots, apostrophes and hyphens, as printed on a card or passbook.
const HOLDER = /^\p{L}[\p{L} .'-]*$/u;
export function holderNameProblem(raw: string, what: "card" | "account"): string | null {
  const v = raw.trim().replace(/\s+/g, " ");
  if (!v) return what === "card" ? "Enter the name as printed on the card." : "Enter the account holder's name.";
  if (v.length < 2) return "The name is too short.";
  if (v.length > 50) return "The name is too long.";
  if (!HOLDER.test(v)) return "Use letters only (spaces, dots, apostrophes and hyphens are fine).";
  return null;
}

export function accountNumberProblem(raw: string): string | null {
  if (!raw) return "Enter your account number.";
  if (!/^\d+$/.test(raw)) return "Account numbers contain digits only.";
  if (raw.length < 8) return `Account numbers have 8 to 16 digits — ${8 - raw.length} more to go.`;
  if (raw.length > 16) return "Account numbers have at most 16 digits.";
  if (/^0+$/.test(raw)) return "That isn't a valid account number.";
  return null;
}

// Sri Lankan mobile numbers: 070, 071, 072, 074, 075, 076, 077 or 078, then 7 digits.
export function mobileProblem(raw: string): string | null {
  if (!raw) return "Enter your mobile number.";
  if (!raw.startsWith("07")) return "Mobile numbers start with 07.";
  if (raw.length >= 3 && !/^07[0-24-8]/.test(raw)) return "That isn't a Sri Lankan mobile prefix (070–078).";
  if (raw.length < 10) return `Mobile numbers have 10 digits — ${10 - raw.length} more to go.`;
  if (!/^07[0-24-8]\d{7}$/.test(raw)) return "Enter the mobile number as 07XXXXXXXX.";
  return null;
}

export function otpProblem(raw: string): string | null {
  if (!raw) return "Enter the 6-digit code.";
  if (raw.length < 6) return `The code has 6 digits — ${6 - raw.length} more to go.`;
  return null;
}
