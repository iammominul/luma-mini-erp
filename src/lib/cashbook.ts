import { Money } from './money';

/**
 * The Cash Book: every movement of cash in the book, in date order, with a
 * running balance.
 *
 * This is the full ERP's Day Book, "a chronological list of everything posted on
 * a date, in the order it happened, with running cash", over the movements this
 * app actually records.
 *
 * It is not statement.ts and it deliberately reuses none of its vocabulary. A
 * party ledger is signed from the party's side, where a bill issued is a debit;
 * a cash book is signed from the cash account's own side, and a bill moves no
 * cash at all. Same three jobs, different meaning, so borrowing the type would
 * only invite a bill into the cash book.
 *
 * One combined balance, cash and bank together. The book used to split the two
 * and carry a transfer voucher between them; it does not, because there is one
 * drawer and one set of accounts and nobody here reconciles them separately.
 * Every row still records how the money moved, and the Method column says so.
 *
 * Pure: dates are 'YYYY-MM-DD' text and figures are Money, so the running
 * balance can be tested without a database.
 *
 * **It is as complete as what was keyed, and it is not a bank reconciliation.**
 * The screen says so, and so does this comment, because somebody will one day
 * read the closing figure as the balance the bank holds.
 */

export type CashDirection = 'in' | 'out';

/** Where a row came from, so it can be read back to the record behind it. */
export type CashSource =
  | 'opening'
  | 'receipt'
  | 'payment'
  | 'expense'
  | 'salary'
  | 'advance'
  | 'capital'
  | 'drawing'
  | 'loan_received'
  | 'loan_repayment'
  | 'loan_interest';

export const CASH_SOURCES: Record<
  CashSource,
  { label: string; direction: CashDirection }
> = {
  opening: { label: 'Opening Balance', direction: 'in' },
  receipt: { label: 'Money Receipt', direction: 'in' },
  payment: { label: 'Payment Made', direction: 'out' },
  expense: { label: 'Expense Voucher', direction: 'out' },
  salary: { label: 'Salary Paid', direction: 'out' },
  advance: { label: 'Salary Advance', direction: 'out' },
  capital: { label: 'Capital Introduced', direction: 'in' },
  drawing: { label: 'Drawings', direction: 'out' },
  loan_received: { label: 'Loan Received', direction: 'in' },
  loan_repayment: { label: 'Loan Repayment', direction: 'out' },
  loan_interest: { label: 'Interest and Charges', direction: 'out' },
};

export function cashSourceLabel(source: CashSource): string {
  return CASH_SOURCES[source].label;
}

export type CashMovement = {
  /** Unique across the whole book. A voucher that emits two rows suffixes it. */
  id: string;
  source: CashSource;
  /** 'YYYY-MM-DD' */
  date: string;
  particulars: string;
  /**
   * How the money moved. The book shows one combined balance and this decides
   * nothing about it, but it is on the row because it is a fact a clerk reads,
   * and because the ERP's posting rules name the other leg as 1000 Cash or 1100
   * Bank and this is the only thing that says which.
   */
  mode: string;
  /** The document: a voucher number, a receipt reference, a run number. */
  reference: string | null;
  /** Where the record lives, so a row on the screen is a link. */
  href: string | null;
  /** The serial out of a system document number, which orders one date. */
  seq: number | null;
  recordedAt: string;
  amount: Money;
};

export type CashBookRow = CashMovement & {
  moneyIn: Money | null;
  moneyOut: Money | null;
  balance: Money;
};

export type CashBook = {
  /** The balance carried in, folded from everything before the period. */
  opening: Money;
  rows: CashBookRow[];
  totalIn: Money;
  totalOut: Money;
  closing: Money;
};

export function cashDirection(source: CashSource): CashDirection {
  return CASH_SOURCES[source].direction;
}

/**
 * Date first. Then an opening row ahead of anything else on its date, because
 * a balance is carried in before it is moved. Then money in before money out,
 * so a balance rises before it is drawn down: the same reasoning statement.ts
 * uses to put a bill before a settlement.
 *
 * Then the serial out of the system document number, then when it was recorded,
 * then the id, so the book reprints identically over a shuffled input.
 */
function compare(a: CashMovement, b: CashMovement): number {
  if (a.date !== b.date) return a.date < b.date ? -1 : 1;

  const openingA = a.source === 'opening' ? 0 : 1;
  const openingB = b.source === 'opening' ? 0 : 1;
  if (openingA !== openingB) return openingA - openingB;

  const dirA = cashDirection(a.source) === 'in' ? 0 : 1;
  const dirB = cashDirection(b.source) === 'in' ? 0 : 1;
  if (dirA !== dirB) return dirA - dirB;

  if (a.seq !== null && b.seq !== null && a.seq !== b.seq) return a.seq - b.seq;
  if (a.recordedAt !== b.recordedAt)
    return a.recordedAt < b.recordedAt ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

function signed(movement: CashMovement): Money {
  return cashDirection(movement.source) === 'in'
    ? movement.amount
    : Money.ZERO.subtract(movement.amount);
}

export function buildCashBook({
  movements,
  from = null,
  to = null,
}: {
  movements: readonly CashMovement[];
  /** 'YYYY-MM-DD'. Anything before this is folded into the opening. */
  from?: string | null;
  to?: string | null;
}): CashBook {
  const ordered = [...movements].sort(compare);

  let opening = Money.ZERO;
  const inPeriod: CashMovement[] = [];

  for (const movement of ordered) {
    if (from && movement.date < from) {
      opening = opening.add(signed(movement));
      continue;
    }
    if (to && movement.date > to) continue;
    inPeriod.push(movement);
  }

  let balance = opening;
  let totalIn = Money.ZERO;
  let totalOut = Money.ZERO;

  const rows = inPeriod.map((movement): CashBookRow => {
    balance = balance.add(signed(movement));

    if (cashDirection(movement.source) === 'in') {
      totalIn = totalIn.add(movement.amount);
      return { ...movement, moneyIn: movement.amount, moneyOut: null, balance };
    }
    totalOut = totalOut.add(movement.amount);
    return { ...movement, moneyIn: null, moneyOut: movement.amount, balance };
  });

  return { opening, rows, totalIn, totalOut, closing: balance };
}
