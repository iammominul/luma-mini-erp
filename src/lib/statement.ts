import { Money } from './money';

/**
 * Statement assembly. Pure: dates are 'YYYY-MM-DD' text and amounts are Money,
 * so this file has no database, no timezone, and no framework in it, and the
 * running balance can be tested on its own.
 *
 * Balance is always in the party's natural direction. A bill raises it, a
 * settlement lowers it. For a customer, a positive closing balance is what the
 * customer still owes; for a subcontractor, it is what we still owe them.
 */

export type MovementKind = 'bill' | 'payment';

export type Movement = {
  id: string;
  kind: MovementKind;
  /** 'YYYY-MM-DD' */
  date: string;
  particulars: string;
  reference: string | null;
  amount: Money;
};

export type StatementRow = Movement & {
  billed: Money | null;
  settled: Money | null;
  balance: Money;
};

export type Statement = {
  /** Balance carried into the period, opening balance plus everything before it. */
  opening: Money;
  rows: StatementRow[];
  totalBilled: Money;
  totalSettled: Money;
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
 * Same day: a bill is listed before a settlement, then by id so the order is
 * stable across renders and matches what a printed statement showed before.
 */
function compare(a: Movement, b: Movement): number {
  if (a.date !== b.date) return a.date < b.date ? -1 : 1;
  if (a.kind !== b.kind) return a.kind === 'bill' ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

function signed(movement: Movement): Money {
  return movement.kind === 'bill'
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
  const rows: StatementRow[] = [];
  let totalBilled = Money.ZERO;
  let totalSettled = Money.ZERO;

  for (const movement of ordered) {
    if (from && movement.date < from) {
      opening = opening.add(signed(movement));
      continue;
    }
    if (to && movement.date > to) continue;
    rows.push({
      ...movement,
      billed: null,
      settled: null,
      balance: Money.ZERO,
    });
  }

  let balance = opening;
  const withBalance = rows.map((row) => {
    balance = balance.add(signed(row));
    if (row.kind === 'bill') {
      totalBilled = totalBilled.add(row.amount);
      return { ...row, billed: row.amount, settled: null, balance };
    }
    totalSettled = totalSettled.add(row.amount);
    return { ...row, billed: null, settled: row.amount, balance };
  });

  return {
    opening,
    rows: withBalance,
    totalBilled,
    totalSettled,
    closing: balance,
  };
}

/** Column headings and wording differ by side; the arithmetic does not. */
export function statementLabels(partyType: 'customer' | 'subcontractor') {
  return partyType === 'customer'
    ? {
        billed: 'Bill Amount',
        settled: 'Amount Received',
        balance: 'Balance Due',
        closing: 'Closing Balance Receivable',
        settlementWord: 'Receipt',
        opening: 'Opening Balance',
      }
    : {
        billed: 'Bill Amount',
        settled: 'Amount Paid',
        balance: 'Balance Payable',
        closing: 'Closing Balance Payable',
        settlementWord: 'Payment',
        opening: 'Opening Balance',
      };
}
