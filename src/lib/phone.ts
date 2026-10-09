/**
 * Whether a visitor's phone number looks like one.
 *
 * The original's Elementor form held its phone field to "numbers and phone
 * characters" with a pattern; the port kept `type="tel"`, which validates
 * nothing, so "abc" went through as a lead nobody could call back. Shared by
 * the form's own check and /api/quote, so neither accepts what the other
 * refuses.
 *
 * Any written form of a number, local or international, is accepted: digits
 * with spaces, dots, dashes or brackets, an optional leading "+", and an
 * optional extension ("ext. 12", "x12", "#12"). Between 7 and 15 digits before
 * the extension -- a local number at the short end, E.164's limit at the long.
 */
const PHONE = /^\+?[\d\s().\-]+?(?:\s*(?:ext\.?|x|#)\s*\d{1,6})?$/i;

export function isPhone(value: string): boolean {
  const v = value.trim();
  if (!PHONE.test(v)) return false;
  const main = v.replace(/\s*(?:ext\.?|x|#)\s*\d{1,6}$/i, '');
  const digits = main.replace(/\D/g, '').length;
  return digits >= 7 && digits <= 15;
}
