import { Money } from './money';

/**
 * Bill line arithmetic: weight in kg times rate per kg.
 *
 * Kept pure and exact, the same way the real ERP's domain package is. Weight is
 * held as whole grams and rate as whole poisha, so the product is integer
 * arithmetic and the only rounding is the single documented step at the end.
 * When M5 (Customer Billing) lands in the real ERP, this belongs in
 * packages/domain rather than being copied.
 */

const QTY_PATTERN = /^\d+(\.\d{1,3})?$/;
const RATE_PATTERN = /^\d+(\.\d{1,2})?$/;

/** Whole grams from a kg string with up to three decimals ("125.5" -> 125500). */
export function parseQtyKg(value: string): bigint {
  const text = value.trim();
  if (!QTY_PATTERN.test(text)) {
    throw new RangeError(
      `Invalid weight "${value}". Use kg, up to 3 decimals.`,
    );
  }
  const [whole = '0', frac = ''] = text.split('.');
  return BigInt(whole) * 1000n + BigInt((frac + '000').slice(0, 3));
}

/** Whole poisha from a rate string with up to two decimals ("45.5" -> 4550). */
export function parseRate(value: string): bigint {
  const text = value.trim();
  if (!RATE_PATTERN.test(text)) {
    throw new RangeError(`Invalid rate "${value}". Use up to 2 decimals.`);
  }
  const [whole = '0', frac = ''] = text.split('.');
  return BigInt(whole) * 100n + BigInt((frac + '00').slice(0, 2));
}

/**
 * Line amount = weight times rate, rounded half up to the poisha.
 * Both inputs are non-negative, so half up needs no sign handling.
 */
export function lineAmount(qtyKg: string, ratePerKg: string): Money {
  const grams = parseQtyKg(qtyKg);
  const poishaPerKg = parseRate(ratePerKg);
  const scaled = grams * poishaPerKg; // poisha x 1000
  const rounded = (scaled + 500n) / 1000n;
  return Money.fromPoisha(rounded);
}

export function sumMoney(values: readonly Money[]): Money {
  return values.reduce((total, value) => total.add(value), Money.ZERO);
}

export function sumGrams(values: readonly bigint[]): bigint {
  return values.reduce((total, value) => total + value, 0n);
}

/** Grams back to a kg string for display: 125500 -> "125.500". */
export function formatQtyKg(grams: bigint): string {
  const negative = grams < 0n;
  const abs = negative ? -grams : grams;
  const whole = (abs / 1000n).toString();
  const frac = (abs % 1000n).toString().padStart(3, '0');
  return `${negative ? '-' : ''}${whole}.${frac}`;
}
