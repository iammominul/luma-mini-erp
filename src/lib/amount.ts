import { Money } from './money';

/**
 * Bill line arithmetic: weight in kg times rate per kg.
 *
 * Kept pure and exact, the same way the real ERP's domain package is. Weight is
 * held as whole grams and rate as whole micro-taka, so the product is integer
 * arithmetic and the only rounding is the single documented step at the end.
 * When M5 (Customer Billing) lands in the real ERP, this belongs in
 * packages/domain rather than being copied.
 *
 * A rate carries six decimals, not two, because a bill keyed from the bill book
 * often has no rate on the paper at all: the book records a weight and an
 * amount, and the rate has to be worked back out of them. Rounded to the poisha
 * that back-computed rate no longer reproduces the amount the customer was
 * shown. 5141 kg billed at 643,800.00 needs 125.228555, and 125.23 comes to
 * 643,807.43. Six decimals is what closes that gap at the weights LUMA bills.
 *
 * Money itself is unchanged: an amount is still exact poisha in NUMERIC(14,2).
 * The extra places live on the rate, which is a measurement, not a sum of money.
 */

const QTY_PATTERN = /^\d+(\.\d{1,3})?$/;
const RATE_PATTERN = /^\d+(\.\d{1,6})?$/;
const RATE_PLACES = 6;

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

/**
 * Whole micro-taka from a rate string with up to six decimals, where one
 * micro-taka is a millionth of a Taka ("45.5" -> 45500000).
 */
export function parseRate(value: string): bigint {
  const text = value.trim();
  if (!RATE_PATTERN.test(text)) {
    throw new RangeError(`Invalid rate "${value}". Use up to 6 decimals.`);
  }
  const [whole = '0', frac = ''] = text.split('.');
  return (
    BigInt(whole) * 1_000_000n +
    BigInt((frac + '000000').slice(0, RATE_PLACES))
  );
}

/**
 * Line amount = weight times rate, rounded half up to the poisha.
 * Both inputs are non-negative, so half up needs no sign handling.
 *
 * Grams are kg x 1e3 and micro-taka are Taka x 1e6, so the product is Taka x
 * 1e9 and the poisha it becomes is that over 1e7. The single rounding step in
 * the whole calculation is this one.
 */
export function lineAmount(qtyKg: string, ratePerKg: string): Money {
  const grams = parseQtyKg(qtyKg);
  const microTakaPerKg = parseRate(ratePerKg);
  const scaled = grams * microTakaPerKg; // taka x 1e9
  const rounded = (scaled + 5_000_000n) / 10_000_000n;
  return Money.fromPoisha(rounded);
}

export function sumMoney(values: readonly Money[]): Money {
  return values.reduce((total, value) => total.add(value), Money.ZERO);
}

export function sumGrams(values: readonly bigint[]): bigint {
  return values.reduce((total, value) => total + value, 0n);
}

/**
 * A rate as it should be read, from whatever NUMERIC(12,6) hands back.
 *
 * Always at least two decimals, because that is how a rate is quoted, and never
 * a trailing zero past the second, because "30.000000" on a bill line reads as
 * false precision to the party holding it. A rate that genuinely needs its
 * finer places keeps every one of them: "125.228555" prints in full.
 */
export function formatRate(value: string): string {
  const text = value.trim();
  if (!RATE_PATTERN.test(text)) return text;
  const [whole = '0', frac = ''] = text.split('.');
  const padded = (frac + '000000').slice(0, RATE_PLACES);
  const trimmed = padded.replace(/0+$/, '');
  return `${whole}.${trimmed.padEnd(2, '0')}`;
}

/** Grams back to a kg string for display: 125500 -> "125.500". */
export function formatQtyKg(grams: bigint): string {
  const negative = grams < 0n;
  const abs = negative ? -grams : grams;
  const whole = (abs / 1000n).toString();
  const frac = (abs % 1000n).toString().padStart(3, '0');
  return `${negative ? '-' : ''}${whole}.${frac}`;
}
