/**
 * Barcode helpers (pure).
 *
 * Food packets use GTIN barcodes: EAN-13 (Europe), UPC-A (12 digits, North America),
 * EAN-8 (small packs). The last digit is a check digit, which lets us catch most
 * typos when a barcode is typed in by hand.
 */

/** Keeps only digits: " 5 000159 484695 " -> "5000159484695". */
export function normaliseBarcode(raw) {
  return String(raw ?? '').replace(/\D/g, '');
}

/**
 * True if `code` is an 8, 12, 13 or 14-digit GTIN with a correct check digit.
 * Check digit: from the right (excluding the check digit), weights alternate 3,1,3,1…
 */
export function isValidBarcode(code) {
  if (!/^(\d{8}|\d{12,14})$/.test(code)) return false;
  const digits = [...code].map(Number);
  const check = digits.pop();
  const sum = digits.reverse().reduce((total, digit, i) => total + digit * (i % 2 === 0 ? 3 : 1), 0);
  return (10 - (sum % 10)) % 10 === check;
}
