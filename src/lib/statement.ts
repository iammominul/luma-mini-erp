import { Money } from './money';
import { formatTaka } from './format';
import type { PartyRole } from './types';

/**
 * Party ledger assembly. Pure: dates are 'YYYY-MM-DD' text and amounts are
 * Money, so this file has no database, no timezone, and no framework in it, and
 * the running balance can be tested on its own.
 *
 * One sign convention, everywhere: a positive balance is receivable, money the
 * party owes us, and shows as Dr. A negative balance is payable, money we owe
 * them, and shows as Cr.
 *
 * Which way a movement pushes that balance belongs to the movement, not to the
 * party. A bill we issued is a debit; a bill we received is a credit; money in
 * is a credit; money out is a debit. That is what lets one party hold more than
 * one role: a dye house that processes our fabric and also sells us yarn has one
 * ledger and one net balance, and every row in it still knows its own direction.
 */

export type MovementKind = 'bill' | 'payment';

/** Which column a movement lands in, and therefore which way it moves the balance. */
export type MovementSide = 'debit' | 'credit';

export type Movement = {
  id: string;
  kind: MovementKind;
  side: MovementSide;
  /** 'YYYY-MM-DD' */
  date: string;
  /** What the row is, in words: "Dyeing & Finishing Bill / Order 75-T". */
  particulars: string;
  /** The document it points at: a bill number, a money receipt serial. */
  reference: string | null;
  /**
   * The serial out of the system's own document number, which is what orders
   * two documents on one date. Null where there is no system number: a bill
   * received carries the subcontractor's own paper number, and a settlement has
   * never had one.
   */
  seq: number | null;
  /** When the row was recorded, for ordering what has no system number. */
  recordedAt: string;
  amount: Money;
};

export type StatementRow = Movement & {
  debit: Money | null;
  credit: Money | null;
  /** Running balance: positive receivable, negative payable. */
  balance: Money;
};

export type Statement = {
  /** Balance carried into the period, opening balance plus everything before it. */
  opening: Money;
  rows: StatementRow[];
  /** Everything billed and everything settled in the period, either direction. */
  totalBilled: Money;
  totalSettled: Money;
  /** The two ledger columns. */
  totalDebit: Money;
  totalCredit: Money;
  closing: Money;
};

export type StatementInput = {
  openingBalance: Money;
  movements: readonly Movement[];
  /** Inclusive 'YYYY-MM-DD' bounds; null means unbounded. */
  from?: string | null;
  to?: string | null;
};

/**
 * The order a ledger reads in, and the order the running balance accumulates.
 *
 * Date first, because a ledger is a chronology. Then a bill before a settlement
 * on the same day, so a balance rises and is then paid down rather than a
 * receipt appearing to settle a bill that has not been raised yet.
 *
 * Then the system's own document number. Not the hand-written bill number: LUMA
 * ran several bill books at once and those numbers do not follow the dates, so
 * they say what the customer recognizes and nothing about sequence. Anything
 * with no system number, which is a settlement or a bill received, falls to
 * when it was recorded, and the id settles the last tie so a statement reprints
 * identically.
 */
function compare(a: Movement, b: Movement): number {
  if (a.date !== b.date) return a.date < b.date ? -1 : 1;
  if (a.kind !== b.kind) return a.kind === 'bill' ? -1 : 1;
  if (a.seq !== null && b.seq !== null && a.seq !== b.seq) return a.seq - b.seq;
  if (a.recordedAt !== b.recordedAt) return a.recordedAt < b.recordedAt ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

function signed(movement: Movement): Money {
  return movement.side === 'debit'
    ? movement.amount
    : Money.ZERO.subtract(movement.amount);
}

export function buildStatement({
  openingBalance,
  movements,
  from = null,
  to = null,
}: StatementInput): Statement {
  const ordered = [...movements].sort(compare);

  let opening = openingBalance;
  const inPeriod: Movement[] = [];

  for (const movement of ordered) {
    if (from && movement.date < from) {
      opening = opening.add(signed(movement));
      continue;
    }
    if (to && movement.date > to) continue;
    inPeriod.push(movement);
  }

  let balance = opening;
  let totalBilled = Money.ZERO;
  let totalSettled = Money.ZERO;
  let totalDebit = Money.ZERO;
  let totalCredit = Money.ZERO;

  const rows = inPeriod.map((movement): StatementRow => {
    balance = balance.add(signed(movement));

    if (movement.kind === 'bill') {
      totalBilled = totalBilled.add(movement.amount);
    } else {
      totalSettled = totalSettled.add(movement.amount);
    }

    if (movement.side === 'debit') {
      totalDebit = totalDebit.add(movement.amount);
      return { ...movement, debit: movement.amount, credit: null, balance };
    }
    totalCredit = totalCredit.add(movement.amount);
    return { ...movement, debit: null, credit: movement.amount, balance };
  });

  return {
    opening,
    rows,
    totalBilled,
    totalSettled,
    totalDebit,
    totalCredit,
    closing: balance,
  };
}

/**
 * Which side of the ledger a balance sits on. Straight from the sign now that
 * there is one convention: owed to us is a debit balance, owed by us a credit.
 */
export function balanceSide(balance: Money): 'Dr' | 'Cr' | '' {
  if (balance.isZero()) return '';
  return balance.isNegative() ? 'Cr' : 'Dr';
}

/**
 * "4,27,230.00 Dr", the way a ledger states a balance. The sign is carried by
 * the Dr or Cr, never by a minus, which is what an accounts person expects.
 */
export function formatBalance(balance: Money): string {
  const magnitude = balance.isNegative()
    ? Money.ZERO.subtract(balance)
    : balance;
  const side = balanceSide(balance);
  const figure = formatTaka(magnitude);
  return side ? `${figure} ${side}` : figure;
}

/**
 * Wording for the view a ledger is being read through. The arithmetic no longer
 * differs by side, only what the money is called: a customer pays us, we pay a
 * subcontractor, and the closing label follows the balance rather than the view.
 *
 * A supplier reads as a subcontractor does: we owe them, so we pay.
 */
export function statementLabels(lens: PartyRole) {
  return {
    debit: 'Debit',
    credit: 'Credit',
    balance: 'Balance',
    opening: 'Opening Balance',
    openingCarried: 'Opening Balance (B/F)',
    closingCarried: 'Closing Balance (C/F)',
    totalBilled: 'Total Billed',
    totalSettled: lens === 'customer' ? 'Total Received' : 'Total Paid',
    billed: 'Billed in Period',
    settled: lens === 'customer' ? 'Received in Period' : 'Paid in Period',
    settlementWord: lens === 'customer' ? 'Receipt' : 'Payment',
  };
}

/** What a closing balance is called, which follows the sign and not the view. */
export function closingLabel(balance: Money): string {
  if (balance.isZero()) return 'Closing Balance';
  return balance.isNegative()
    ? 'Closing Balance Payable'
    : 'Closing Balance Receivable';
}

/** The outstanding figure, named for which way it runs. */
export function netLabel(balance: Money): string {
  return balance.isNegative() ? 'Net Payable' : 'Net Receivable';
}
