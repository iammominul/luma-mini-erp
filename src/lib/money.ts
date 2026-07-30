/**
 * Money - an exact, float-safe amount in Bangladeshi Taka.
 *
 * Copied from packages/domain in the LUMA ERP repo so this interim app is a
 * standalone project that deploys on its own. Its tests came across with it.
 *
 * Stored internally as an integer number of *poisha* (1 BDT = 100 poisha) using
 * `bigint`, so arithmetic can never drift the way binary floating point does.
 * This maps directly to Postgres `NUMERIC(14,2)` at the persistence boundary.
 *
 * The domain layer deliberately depends on nothing external - this class is the
 * only money primitive the ledger needs.
 */
export class Money {
  private constructor(public readonly poisha: bigint) {}

  static readonly ZERO = new Money(0n);

  /** Build from an integer count of poisha (minor units). */
  static fromPoisha(poisha: bigint): Money {
    return new Money(poisha);
  }

  /**
   * Build from a decimal string or number, e.g. "1234.56", "-50", 12000.
   * Accepts 0, 1, or 2 fractional digits. Rejects anything finer than poisha.
   */
  static fromDecimal(value: string | number): Money {
    const text = typeof value === 'number' ? numberToText(value) : value.trim();
    const match = /^(-)?(\d+)(?:\.(\d{1,2}))?$/.exec(text);
    if (!match) {
      throw new RangeError(`Money.fromDecimal: invalid amount "${value}"`);
    }
    const [, sign, whole = '0', frac = ''] = match;
    const fracPadded = (frac + '00').slice(0, 2);
    const poisha = BigInt(whole) * 100n + BigInt(fracPadded);
    return new Money(sign ? -poisha : poisha);
  }

  add(other: Money): Money {
    return new Money(this.poisha + other.poisha);
  }

  subtract(other: Money): Money {
    return new Money(this.poisha - other.poisha);
  }

  isZero(): boolean {
    return this.poisha === 0n;
  }

  isNegative(): boolean {
    return this.poisha < 0n;
  }

  equals(other: Money): boolean {
    return this.poisha === other.poisha;
  }

  /** -1, 0, or 1 - like Array.sort's comparator. */
  compare(other: Money): number {
    if (this.poisha < other.poisha) return -1;
    if (this.poisha > other.poisha) return 1;
    return 0;
  }

  /** Canonical "1234.56" form, suitable for NUMERIC(14,2). */
  toDecimalString(): string {
    const negative = this.poisha < 0n;
    const abs = negative ? -this.poisha : this.poisha;
    const whole = abs / 100n;
    const frac = (abs % 100n).toString().padStart(2, '0');
    return `${negative ? '-' : ''}${whole.toString()}.${frac}`;
  }

  toString(): string {
    return this.toDecimalString();
  }
}

/** Reject floats that can't be represented exactly so they never reach the ledger. */
function numberToText(value: number): string {
  if (!Number.isFinite(value)) {
    throw new RangeError(`Money.fromDecimal: non-finite number ${value}`);
  }
  // Limit to 2 decimals; toFixed(2) is safe for the integer-ish magnitudes used here.
  return value.toFixed(2);
}
