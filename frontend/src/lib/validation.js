/**
 * Shared phone + email validation/formatting helpers.
 * Phone accepts Australian numbers (+61 / 0X landline / mobile) and, for
 * multi-region support, Indian 10-digit mobiles — mirroring the backend
 * auth.validation regex so client and server agree.
 */

// +61 followed by 9 digits | 0X (landline, area 2-9) + 8 digits | 10-digit mobile (6-9 start)
export const PHONE_REGEX = /^(\+?61[0-9]{9}|0[2-9][0-9]{8}|[6-9][0-9]{9})$/;

// Max characters allowed in a phone input. "+61 412 345 678" => 15 with spaces.
export const PHONE_MAXLEN = 15;

/** Strip spaces, dashes, brackets so the regex sees only +digits. */
export function normalisePhone(v) {
  return String(v || '').replace(/[\s()\-.]/g, '');
}

/** True when the value is a valid AU (or IN) phone number. */
export function isValidPhone(v) {
  return PHONE_REGEX.test(normalisePhone(v));
}

/** Region-appropriate placeholder for a phone input. */
export function phonePlaceholder(region) {
  return region === 'AU' ? '+61 412 345 678' : '+91 98765 43210';
}

// Pragmatic email check: a@b.c with no spaces. Mirrors common server-side email validation.
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** True when the value is a syntactically valid email. */
export function isValidEmail(v) {
  return EMAIL_REGEX.test(String(v || '').trim());
}
