/** Strip non-digits, then format as XXX-XXX-XXX XX */
export function formatSnils(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 11);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  if (digits.length <= 9) return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6, 9)} ${digits.slice(9)}`;
}

export function isValidSnils(value: string): boolean {
  return value.replace(/\D/g, "").length === 11;
}

/**
 * Validates SNILS checksum per official FRDO algorithm.
 * Last 2 digits = sum(digit_i * (10 - position_i)) mod 101 (with 100 → 00).
 */
export function isValidSnilsChecksum(value: string): boolean {
  const digits = value.replace(/\D/g, "");
  if (digits.length !== 11) return false;
  const body = digits.slice(0, 9);
  const checksum = parseInt(digits.slice(9), 10);
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    sum += parseInt(body[i], 10) * (9 - i);
  }
  let expected = sum % 101;
  if (expected === 100) expected = 0;
  return expected === checksum;
}
