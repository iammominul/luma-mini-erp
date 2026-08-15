import { Money } from './money';

/**
 * The payroll arithmetic, kept pure so it can be tested without a database.
 *
 * Every figure is exact poisha. The one place a division happens is the per day
 * rate behind an absence deduction, and that rounds half up to the poisha, the
 * same single rounding step a bill line takes in amount.ts.
 */

/** Raised when the figures on a salary cannot produce a payment. */
export class PayrollError extends Error {}

/**
 * How one day of pay is worked out from a monthly salary.
 *
 * This is an open question in the full ERP's spec (`[open D70]`) because the
 * three conventions are all in use in Dhaka and they pay differently. It is
 * stored on each salary row rather than held as a global setting, so a change
 * of policy leaves what was already paid exactly as it was paid.
 *
 * 'thirty' is the default: a monthly rated employee is paid for the whole
 * calendar month including the weekly holiday, so a day is the salary over 30.
 * 'twenty_six' treats the month as working days only and makes a day cost more.
 * 'actual' uses the real length of the month, so a day in February is dearer
 * than a day in March.
 */
export type PerDayBasis = 'thirty' | 'twenty_six' | 'actual';

export const PER_DAY_BASES: { value: PerDayBasis; label: string }[] = [
  { value: 'thirty', label: 'Divide by 30' },
  { value: 'twenty_six', label: 'Divide by 26' },
  { value: 'actual', label: 'Divide by Days in the Month' },
];

export function perDayBasisLabel(value: string): string {
  return PER_DAY_BASES.find((b) => b.value === value)?.label ?? value;
}

/** Days in the calendar month of a 'YYYY-MM' period. */
export function daysInPeriod(period: string): number {
  const [year, month] = period.split('-').map(Number);
  if (!year || !month || month < 1 || month > 12) return 30;
  // Day zero of the next month is the last day of this one.
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** The number a month's salary is divided by to get one day of pay. */
export function divisorFor(basis: PerDayBasis, period: string): number {
  if (basis === 'twenty_six') return 26;
  if (basis === 'actual') return daysInPeriod(period);
  return 30;
}

/**
 * Absent days as tenths of a day, so a half day is expressible and the
 * arithmetic still runs on integers. Anything finer than a tenth is refused
 * rather than rounded, because a silently rounded absence is a silently wrong
 * salary.
 */
export function parseAbsentDays(value: string): bigint {
  const text = value.trim();
  if (text === '') return 0n;
  if (!/^\d+(\.\d)?$/.test(text)) {
    throw new PayrollError('Enter absent days as a number, to one decimal');
  }
  const [whole = '0', frac = '0'] = text.split('.');
  return BigInt(whole) * 10n + BigInt(frac);
}

/**
 * What an absence costs: the monthly gross, over the divisor, times the days.
 *
 * Rounded half up to the poisha, and rounded once at the end rather than at the
 * per day rate, so ten separate absent days deduct the same as one absence of
 * ten days. Rounding the daily rate first would drift by up to a poisha a day.
 */
export function absenceDeduction(
  gross: Money,
  absentDays: string,
  basis: PerDayBasis,
  period: string,
): Money {
  const tenths = parseAbsentDays(absentDays);
  if (tenths === 0n) return Money.ZERO;

  const divisor = BigInt(divisorFor(basis, period)) * 10n;
  const scaled = gross.poisha * tenths;
  // Half up. The divisor always ends in a zero, so its half is exact.
  const rounded = (scaled + divisor / 2n) / divisor;
  return Money.fromPoisha(rounded);
}

/** The six parts a monthly salary is made of. */
export type SalaryComponents = {
  basic: Money;
  houseRent: Money;
  medical: Money;
  conveyance: Money;
  mobileAllowance: Money;
  otherAllowance: Money;
};

/**
 * Gross is the sum of the parts, never a figure of its own.
 *
 * The database says the same thing with a generated column, so the two can
 * never disagree; this is here so a form can show the total while it is being
 * typed, before anything is saved.
 */
export function grossOf(components: SalaryComponents): Money {
  return [
    components.basic,
    components.houseRent,
    components.medical,
    components.conveyance,
    components.mobileAllowance,
    components.otherAllowance,
  ].reduce((total, part) => total.add(part), Money.ZERO);
}

/**
 * What actually leaves the cash box.
 *
 * Gross, less the unpaid absence, less the advance being taken back this month,
 * less anything else withheld, plus a bonus and any additional allowance. That
 * is the order the payslip prints it in and the order the owner stated it.
 *
 * Computed on the server and never accepted from the browser, the same rule a
 * bill total follows. A negative result is refused rather than clamped to zero:
 * it means more is being taken off than the salary can carry, and quietly
 * paying zero would leave the rest of an advance looking recovered when no
 * money moved.
 *
 * The arguments are named rather than positional because there are six of them
 * and five are money coming off the same figure. Positionally, transposing two
 * would still typecheck and would quietly pay somebody the wrong amount.
 */
export function netPay(parts: {
  gross: Money;
  absence?: Money;
  advanceDeduction?: Money;
  otherDeduction?: Money;
  bonus?: Money;
  additionalAllowance?: Money;
}): Money {
  const net = parts.gross
    .subtract(parts.absence ?? Money.ZERO)
    .subtract(parts.advanceDeduction ?? Money.ZERO)
    .subtract(parts.otherDeduction ?? Money.ZERO)
    .add(parts.bonus ?? Money.ZERO)
    .add(parts.additionalAllowance ?? Money.ZERO);
  if (net.isNegative()) {
    throw new PayrollError(
      'Absence, advance and deductions come to more than the salary can carry',
    );
  }
  return net;
}

/**
 * What is still to come back out of a future salary.
 *
 * Computed on read from the two sides, never stored, the same rule a party
 * balance follows. It can go negative only if a recovery was recorded without
 * the advance behind it, which is worth seeing rather than hiding.
 */
export function advanceOutstanding(paid: Money, recovered: Money): Money {
  return paid.subtract(recovered);
}

/**
 * Caps a proposed recovery at what the employee actually owes.
 *
 * The salary form offers to recover the outstanding advance, but never more
 * than the salary can absorb, so the figure it suggests is always one the
 * employee can be paid on.
 */
export function suggestedRecovery(outstanding: Money, payable: Money): Money {
  if (outstanding.isNegative()) return Money.ZERO;
  return outstanding.compare(payable) > 0 ? payable : outstanding;
}

/**
 * How an advance was agreed to come back.
 *
 * Set on the advance when the cash is handed over, because that is when it is
 * agreed and it does not change month to month. There is no 'partial': a
 * partial recovery is a decision taken in one particular month, so it is made
 * by editing that month's figure rather than by storing a mode that expires.
 */
export type RecoveryMode = 'manual' | 'full' | 'installment';

export const RECOVERY_MODES: { value: RecoveryMode; label: string }[] = [
  { value: 'manual', label: 'Decide Each Month' },
  { value: 'full', label: 'Full Recovery Next Payroll' },
  { value: 'installment', label: 'Fixed Installment' },
];

export function recoveryModeLabel(value: string): string {
  return RECOVERY_MODES.find((m) => m.value === value)?.label ?? value;
}

/** One advance, as the recovery arithmetic needs to see it. */
export type RecoverableAdvance = {
  id: string;
  /** 'YYYY-MM-DD'. Oldest is recovered first, so this is the sort key. */
  paidOn: string;
  amount: Money;
  recoveryMode: RecoveryMode;
  installmentAmount: Money | null;
  /** 'YYYY-MM', or null for "from the next run onwards". */
  recoverFrom: string | null;
};

/**
 * What is left of each advance, given the total recovered from every payroll.
 *
 * A payroll line carries one advance figure for the whole employee, not one per
 * advance, so when somebody holds two the recoveries have to be apportioned to
 * know what remains of each. Oldest first: it is the ordinary convention, and
 * it is the one that can be explained to the person being deducted.
 *
 * Apportioning on read rather than recording it keeps to the same rule a party
 * balance follows. Nothing here is stored.
 */
export function apportionRecovered(
  advances: RecoverableAdvance[],
  recoveredToDate: Money,
): { advance: RecoverableAdvance; outstanding: Money }[] {
  const oldestFirst = [...advances].sort((a, b) =>
    a.paidOn === b.paidOn ? a.id.localeCompare(b.id) : a.paidOn < b.paidOn ? -1 : 1,
  );

  // A negative total would mean a recovery was recorded with no advance behind
  // it. That is worth seeing on the outstanding figure rather than smeared
  // across the advances, so nothing is applied here.
  let left = recoveredToDate.isNegative() ? Money.ZERO : recoveredToDate;

  return oldestFirst.map((advance) => {
    const applied = left.compare(advance.amount) > 0 ? advance.amount : left;
    left = left.subtract(applied);
    return { advance, outstanding: advance.amount.subtract(applied) };
  });
}

/**
 * What this month's payroll should take back, before anyone overrides it.
 *
 * Every advance is asked what it wants under its own agreement, the answers are
 * added up, and the total is capped at what the salary can actually carry. The
 * cap matters: netPay refuses a negative net, and an amount this function
 * proposed must never be the thing that makes a whole month fail to generate.
 *
 * This is a proposal. The figure lands in an editable cell and HR can change or
 * zero it, which is the point: an automatic deduction nobody can stop is a
 * payroll waiting to pay somebody the wrong amount.
 */
export function plannedRecovery(
  advances: RecoverableAdvance[],
  recoveredToDate: Money,
  period: string,
  payable: Money,
): Money {
  const wanted = apportionRecovered(advances, recoveredToDate).reduce(
    (total, { advance, outstanding }) => {
      if (advance.recoveryMode === 'manual') return total;
      if (outstanding.compare(Money.ZERO) <= 0) return total;
      // An agreement that starts in October takes nothing in September.
      if (advance.recoverFrom && advance.recoverFrom > period) return total;

      if (advance.recoveryMode === 'full') return total.add(outstanding);

      const installment = advance.installmentAmount;
      // An installment agreement with no figure recovers nothing rather than
      // quietly taking the lot. The database refuses to hold one, so this is
      // the belt to that constraint's braces.
      if (!installment || installment.compare(Money.ZERO) <= 0) return total;
      // The last installment is the remainder, never an overshoot.
      return total.add(
        installment.compare(outstanding) > 0 ? outstanding : installment,
      );
    },
    Money.ZERO,
  );

  return suggestedRecovery(wanted, payable);
}

/**
 * Leave, which is deliberately not wired to any of the arithmetic above.
 *
 * Casual, sick and earned leave are paid under the Bangladesh Labour Act, so
 * recording a leave day must never move money. HR decides the unpaid absence
 * figure for the month and keys that on the payroll line instead. Connecting
 * the two is how a paid sick day silently becomes an unpaid one.
 *
 * The entitlements are the Act's figures for an establishment of this size and
 * are constants rather than a table, because nobody in a business with a dozen
 * staff wants a screen for maintaining them. Earned leave accrues with days
 * worked rather than being granted up front, so it has no fixed annual figure
 * and is recorded as it is taken.
 */
export type LeaveType = 'casual' | 'sick' | 'earned';

export const LEAVE_TYPES: {
  value: LeaveType;
  label: string;
  /** Days a year, or null where the Act accrues it instead of granting it. */
  entitlement: number | null;
}[] = [
  { value: 'casual', label: 'Casual Leave', entitlement: 10 },
  { value: 'sick', label: 'Sick Leave', entitlement: 14 },
  { value: 'earned', label: 'Earned Leave', entitlement: null },
];

export function leaveTypeLabel(value: string): string {
  return LEAVE_TYPES.find((l) => l.value === value)?.label ?? value;
}

export function leaveEntitlement(value: LeaveType): number | null {
  return LEAVE_TYPES.find((l) => l.value === value)?.entitlement ?? null;
}
