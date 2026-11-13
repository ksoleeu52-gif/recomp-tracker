/**
 * Number parsing and formatting.
 * Display uses Irish English formatting ("2,400"); input accepts both
 * decimal points and EU-style decimal commas ("12,5").
 */
const intFormat = new Intl.NumberFormat('en-IE', { maximumFractionDigits: 0 });
const oneDecimal = new Intl.NumberFormat('en-IE', { maximumFractionDigits: 1 });

/** 2400.4 -> "2,400". `|| 0` turns -0 into 0 so we never show "-0". */
export function fmtInt(n) {
  return intFormat.format(Math.round(Number(n) || 0) || 0);
}

/** 12.345 -> "12.3", 12 -> "12". */
export function fmtDecimal(n) {
  return oneDecimal.format(Math.round((Number(n) || 0) * 10) / 10 || 0);
}

/**
 * Parses user-typed numbers. Returns NaN if the input isn't a number.
 *   "2400" "2,400" "2 400"  -> 2400
 *   "12.5" "12,5"           -> 12.5   (EU decimal comma)
 *   "2,400.5"               -> 2400.5
 */
export function parseNumber(input) {
  if (typeof input === 'number') return Number.isFinite(input) ? input : NaN;
  let s = String(input ?? '').replace(/\s/g, '');
  if (!s) return NaN;

  if (s.includes(',') && s.includes('.')) s = s.replace(/,/g, ''); // "2,400.5": comma = thousands
  else if (/^\d{1,3}(,\d{3})+$/.test(s)) s = s.replace(/,/g, ''); // "2,400": comma = thousands
  else s = s.replace(',', '.'); // "12,5": comma = decimal

  return /^-?(\d+\.?\d*|\.\d+)$/.test(s) ? Number(s) : NaN;
}
