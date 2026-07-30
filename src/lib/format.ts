/**
 * Money formatting: lakh/crore grouping and amount in words.
 *
 * Copied from packages/shared in the LUMA ERP repo so that this interim app
 * stays a standalone project with its own deployment. The two copies must print
 * the same figures, so the tests came across with the code. When the full ERP
 * takes over, this app is retired rather than kept in step.
 */
import { Money } from './money';

/**
 * Group an integer's digits in the South Asian (lakh/crore) style: the last
 * three digits together, then the rest in pairs. "1234567" becomes "12,34,567".
 * Input is the unsigned integer part only (digits, no sign, no decimals).
 */
export function groupLakhCrore(intDigits: string): string {
  if (intDigits.length <= 3) return intDigits;
  const last3 = intDigits.slice(-3);
  const rest = intDigits.slice(0, -3);
  const groupedRest = rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',');
  return `${groupedRest},${last3}`;
}

/**
 * Format an amount for display: lakh/crore grouped, always two decimals.
 * "1234567.5" prints as "12,34,567.50"; negatives keep a leading minus.
 * No currency symbol, so it drops straight into a table cell.
 */
export function formatTaka(money: Money): string {
  const decimal = money.toDecimalString();
  const negative = decimal.startsWith('-');
  const unsigned = negative ? decimal.slice(1) : decimal;
  const [whole = '0', frac = '00'] = unsigned.split('.');
  return `${negative ? '-' : ''}${groupLakhCrore(whole)}.${frac}`;
}

/**
 * Same as {@link formatTaka} with a currency prefix, e.g. "Tk 12,34,567.50".
 * Uses "Tk" rather than the Taka sign, which is a Bengali glyph the PDF font
 * does not carry.
 */
export function formatTakaPrefixed(money: Money, prefix = 'Tk'): string {
  return `${prefix} ${formatTaka(money)}`;
}

const ONES = [
  'Zero',
  'One',
  'Two',
  'Three',
  'Four',
  'Five',
  'Six',
  'Seven',
  'Eight',
  'Nine',
  'Ten',
  'Eleven',
  'Twelve',
  'Thirteen',
  'Fourteen',
  'Fifteen',
  'Sixteen',
  'Seventeen',
  'Eighteen',
  'Nineteen',
] as const;

const TENS = [
  '',
  '',
  'Twenty',
  'Thirty',
  'Forty',
  'Fifty',
  'Sixty',
  'Seventy',
  'Eighty',
  'Ninety',
] as const;

// Callers below always pass indices that are in range by construction, so the
// non-null assertions cannot fail; they keep the branch count honest.
function twoDigitWords(n: number): string {
  if (n < 20) return ONES[n]!;
  const tens = Math.floor(n / 10);
  const units = n % 10;
  return units === 0 ? TENS[tens]! : `${TENS[tens]!} ${ONES[units]!}`;
}

function belowThousandWords(n: number): string {
  const hundreds = Math.floor(n / 100);
  const rest = n % 100;
  const parts: string[] = [];
  if (hundreds > 0) parts.push(`${ONES[hundreds]!} Hundred`);
  if (rest > 0) parts.push(twoDigitWords(rest));
  return parts.join(' ');
}

/**
 * Spell a non-negative integer in the South Asian scale (thousand, lakh, crore).
 * Recurses on the crore count, so values above ninety-nine crore read naturally
 * ("One Lakh Crore"). Zero returns "Zero".
 */
function integerToWords(n: bigint): string {
  if (n === 0n) return 'Zero';
  const parts: string[] = [];
  const crore = n / 10_000_000n;
  const below = n % 10_000_000n;
  if (crore > 0n) parts.push(`${integerToWords(crore)} Crore`);
  const lakh = Number((below / 100_000n) % 100n);
  if (lakh > 0) parts.push(`${twoDigitWords(lakh)} Lakh`);
  const thousand = Number((below / 1_000n) % 100n);
  if (thousand > 0) parts.push(`${twoDigitWords(thousand)} Thousand`);
  const belowThousand = Number(below % 1_000n);
  if (belowThousand > 0) parts.push(belowThousandWords(belowThousand));
  return parts.join(' ');
}

/**
 * Spell a money amount for the "amount in words" line on bills and statements,
 * e.g. "Taka One Lakh Twenty Three Thousand and Fifty Six Poisha Only". This is
 * the single source of the words: screen and PDF both call it, so the two can
 * never disagree.
 */
export function amountInWords(money: Money): string {
  const negative = money.isNegative();
  const totalPoisha = negative ? -money.poisha : money.poisha;
  const taka = totalPoisha / 100n;
  const poisha = Number(totalPoisha % 100n);

  const takaWords = integerToWords(taka);
  const core =
    poisha > 0
      ? `Taka ${takaWords} and ${twoDigitWords(poisha)} Poisha Only`
      : `Taka ${takaWords} Only`;

  return negative ? `Minus ${core}` : core;
}
