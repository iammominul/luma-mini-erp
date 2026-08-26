import { Money } from './money';
import type { FundMovement } from './types';

/**
 * One loan's own ledger, with the outstanding accumulated on read.
 *
 * Received less principal repaid, and nothing else. Interest is a cost and is
 * carried beside the ledger, never inside the balance, because a loan does not
 * become more owed because interest was paid on it.
 *
 * An outstanding that goes negative is shown as it is rather than clamped at
 * zero. It means more was repaid than was ever drawn, which is a keying error,
 * and hiding it hides the error.
 *
 * The Owner's Account deliberately does not come through here. It needs three
 * totals and no running balance, no ordering guarantee and no interest column,
 * and reusing this would put the account kind straight back into the model.
 *
 * Pure: dates are 'YYYY-MM-DD' text and figures are Money, so there is no
 * database, no timezone and no framework in this file.
 */

export type LoanLedgerRow = {
  movement: FundMovement;
  /** Set on the side the movement lands on, null on the other. */
  moneyIn: Money | null;
  moneyOut: Money | null;
  /** Interest paid alongside, on a repayment. Outside the balance. */
  interest: Money | null;
  /** Running: what is still owed on this loan. */
  balance: Money;
};

export type LoanLedger = {
  /** The balance carried into the period, folded from everything before it. */
  opening: Money;
  rows: LoanLedgerRow[];
  totalIn: Money;
  totalOut: Money;
  totalInterest: Money;
  closing: Money;
};

/**
 * Date first, then money in before money out on the same day, so a balance
 * rises before it is drawn down rather than a repayment appearing to settle a
 * loan that has not been drawn yet. That is the same reasoning statement.ts
 * uses to put a bill before a settlement.
 *
 * Then the serial out of the voucher number, then when it was recorded, then
 * the id, so a ledger reprints identically.
 */
function compare(a: FundMovement, b: FundMovement): number {
  if (a.movedOn !== b.movedOn) return a.movedOn < b.movedOn ? -1 : 1;
  if (a.direction !== b.direction) return a.direction === 'in' ? -1 : 1;
  const seqA = serialOf(a.docNo);
  const seqB = serialOf(b.docNo);
  if (seqA !== null && seqB !== null && seqA !== seqB) return seqA - seqB;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/** The trailing serial out of 'FM-26-0113'. Null where there is no number. */
function serialOf(docNo: string | null): number | null {
  if (!docNo) return null;
  const tail = docNo.split('-').at(-1);
  return tail && /^\d+$/.test(tail) ? Number(tail) : null;
}

function signed(movement: FundMovement): Money {
  return movement.direction === 'in'
    ? movement.amount
    : Money.ZERO.subtract(movement.amount);
}

export function buildLoanLedger({
  movements,
  from = null,
  to = null,
}: {
  movements: readonly FundMovement[];
  /** 'YYYY-MM-DD'. Anything before this is folded into the opening. */
  from?: string | null;
  to?: string | null;
}): LoanLedger {
  const ordered = [...movements].sort(compare);

  let opening = Money.ZERO;
  const inPeriod: FundMovement[] = [];

  for (const movement of ordered) {
    if (from && movement.movedOn < from) {
      opening = opening.add(signed(movement));
      continue;
    }
    if (to && movement.movedOn > to) continue;
    inPeriod.push(movement);
  }

  let balance = opening;
  let totalIn = Money.ZERO;
  let totalOut = Money.ZERO;
  let totalInterest = Money.ZERO;

  const rows = inPeriod.map((movement): LoanLedgerRow => {
    balance = balance.add(signed(movement));

    if (!movement.interestAmount.isZero()) {
      totalInterest = totalInterest.add(movement.interestAmount);
    }
    const interest = movement.interestAmount.isZero()
      ? null
      : movement.interestAmount;

    if (movement.direction === 'in') {
      totalIn = totalIn.add(movement.amount);
      return {
        movement,
        moneyIn: movement.amount,
        moneyOut: null,
        interest,
        balance,
      };
    }
    totalOut = totalOut.add(movement.amount);
    return {
      movement,
      moneyIn: null,
      moneyOut: movement.amount,
      interest,
      balance,
    };
  });

  return {
    opening,
    rows,
    totalIn,
    totalOut,
    totalInterest,
    closing: balance,
  };
}
