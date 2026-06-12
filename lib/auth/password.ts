// Shared password policy — used by every password-entry surface (invite,
// recovery, in-app change). Pragmatic middle ground between NIST 800-63B
// (length-first) and compliance expectations (some complexity):
//   • ≥ 12 characters
//   • at least 3 of 4 character classes (lower / upper / digit / symbol)
//   • must not contain the account's email name (local part)
//   • not an obviously common / breached password
//
// NOTE: client-side checks are UX only. Mirror the floor in Supabase
// (Auth → Policies: min length 12 + enable Leaked Password Protection / HIBP)
// so it's enforced server-side too.

export const MIN_PASSWORD_LENGTH = 12;

// Small embedded denylist of the most common offenders (case-insensitive).
const COMMON_PASSWORDS = [
  "password", "passw0rd", "password1", "qwerty", "letmein", "welcome",
  "admin", "iloveyou", "abc123", "111111", "123123", "monkey", "dragon",
  "123456789012", "qwertyuiop", "1q2w3e4r5t6y", "changeme",
];

export interface PasswordCheck {
  id: string;
  label: string;
  ok: boolean;
}

export function checkPassword(pw: string, email?: string): PasswordCheck[] {
  const classes =
    (/[a-z]/.test(pw) ? 1 : 0) +
    (/[A-Z]/.test(pw) ? 1 : 0) +
    (/[0-9]/.test(pw) ? 1 : 0) +
    (/[^A-Za-z0-9]/.test(pw) ? 1 : 0);

  const local = (email?.split("@")[0] ?? "").toLowerCase();
  const containsEmail = local.length >= 4 && pw.toLowerCase().includes(local);
  const isCommon = COMMON_PASSWORDS.includes(pw.toLowerCase());

  return [
    { id: "length", label: `At least ${MIN_PASSWORD_LENGTH} characters`, ok: pw.length >= MIN_PASSWORD_LENGTH },
    { id: "classes", label: "3 of: lowercase, uppercase, number, symbol", ok: classes >= 3 },
    { id: "email", label: "Doesn’t contain your email name", ok: !containsEmail },
    { id: "common", label: "Not a common/guessable password", ok: !isCommon },
  ];
}

// Returns an error message for the first failing rule, or null when valid.
export function validatePassword(pw: string, email?: string): string | null {
  const failed = checkPassword(pw, email).find((c) => !c.ok);
  if (!failed) return null;
  switch (failed.id) {
    case "length":  return `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
    case "classes": return "Use at least 3 of: lowercase, uppercase, number, symbol.";
    case "email":   return "Password must not contain your email name.";
    case "common":  return "That password is too common — choose something less guessable.";
    default:        return "Password doesn’t meet the requirements.";
  }
}
