// Same rules and messages as the backend's SignupRules and PasswordPolicy, so a
// form (sign-up, walk-in customer details) can point out a mistake while the
// user types. The backend still checks everything again on submit.

const USERNAME = /^[A-Za-z][A-Za-z0-9._]*$/;
const FULL_NAME = /^\p{L}[\p{L} .'-]*$/u;
const EMAIL = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}$/;

export const tidyName = (v: string) => v.trim().replace(/\s+/g, " ");
export const tidyEmail = (v: string) => v.trim().toLowerCase();

// Each returns a message describing what's wrong, or null if the value is acceptable.

export function usernameProblem(v: string): string | null {
  if (!v) return "Username is required.";
  if (/\s/.test(v)) return "Username cannot contain spaces.";
  if (v.length < 3) return "Username must be at least 3 characters.";
  if (v.length > 20) return "Username must be at most 20 characters.";
  if (!USERNAME.test(v)) return "Username must start with a letter and use only letters, numbers, dots or underscores.";
  if (v.endsWith(".") || v.endsWith("_")) return "Username cannot end with a dot or underscore.";
  if (v.includes("..") || v.includes("__")) return "Username cannot have two dots or underscores in a row.";
  return null;
}

export function fullNameProblem(raw: string): string | null {
  const v = tidyName(raw);
  if (!v) return "Full name is required.";
  if (v.length < 2) return "Full name must be at least 2 characters.";
  if (v.length > 60) return "Full name must be at most 60 characters.";
  if (!FULL_NAME.test(v)) return "Full name can only contain letters, spaces, dots, apostrophes and hyphens.";
  return null;
}

export function emailProblem(raw: string): string | null {
  const v = tidyEmail(raw);
  if (!v) return "Email address is required.";
  if (v.length > 100) return "Email address must be at most 100 characters.";
  if (!EMAIL.test(v)) return "Please enter a valid email address.";
  return null;
}

// "077 123-4567" -> "0771234567". Sri Lankan numbers: 0 or +94, then 9 digits.
export const tidyPhone = (v: string) => v.replace(/[\s()-]/g, "");
export function phoneProblem(raw: string): string | null {
  const v = tidyPhone(raw);
  if (!v) return null; // optional
  if (!/^(\+94|0)\d{9}$/.test(v)) return "Enter a valid phone number, e.g. 0771234567.";
  return null;
}

export function passwordProblem(v: string): string | null {
  if (v.length < 8) return "Password must be at least 8 characters.";
  if (v.length > 72) return "Password must be at most 72 characters.";
  if (!/\p{L}/u.test(v)) return "Password must contain at least one letter.";
  if (!/[0-9]/.test(v)) return "Password must contain at least one number.";
  return null;
}

// A suggestion for a username that broke a rule, e.g. "sunimal b" -> "sunimal_b".
export function suggestUsername(v: string): string | null {
  let s = v.trim().replace(/\s+/g, "_").replace(/[^A-Za-z0-9._]/g, "").replace(/([._])[._]+/g, "$1");
  s = s.replace(/^[^A-Za-z]+/, "").replace(/[._]+$/, "").slice(0, 20).replace(/[._]+$/, "");
  return s !== v && usernameProblem(s) === null ? s : null;
}

// 0–4, for the strength bar. Only the first three checks are required.
export function passwordStrength(v: string): number {
  if (!v) return 0;
  let score = 0;
  if (v.length >= 8) score++;
  if (/\p{L}/u.test(v) && /[0-9]/.test(v)) score++;
  if (/[a-z]/.test(v) && /[A-Z]/.test(v)) score++;
  if (/[^A-Za-z0-9]/.test(v) || v.length >= 12) score++;
  return passwordProblem(v) ? Math.min(score, 1) : score;
}
