import {
  cashDirection,
  type CashDirection,
  type CashMovement,
  type CashSource,
} from './cashbook';
import { Money } from './money';

/**
 * Where the money went, grouped, for a period.
 *
 * The Cash Book answers "what happened, in order", which is what a person
 * reconciling against a bank statement needs and what nobody can read three
 * hundred rows of. This answers "how much flowed, and to what", which is the
 * question actually being asked when somebody opens the app to see how the
 * business is doing.
 *
 * Two groups, and only two, because there is no third kind of movement in this
 * book. Trading is the business running: money in from customers, money out to
 * subcontractors, staff and suppliers. Funding is how the business is financed:
 * capital, drawings, and a loan drawn and repaid. A cash flow statement's third
 * group is investing, and there is nothing to put in it, because fixed assets
 * are deliberately out of scope.
 *
 * Pure: no database, no framework. The running balance is tested on its own.
 */

export type CashFlowLine = {
  source: CashSource;
  label: string;
  direction: CashDirection;
  amount: Money;
};

export type CashFlowGroupKey = 'trading' | 'funding';

export type CashFlowGroup = {
  key: CashFlowGroupKey;
  label: string;
  lines: CashFlowLine[];
  /** Money in less money out for this group alone. */
  net: Money;
};

export type CashFlow = {
  /** 'YYYY-MM-DD' */
  from: string;
  to: string;
  opening: Money;
  groups: CashFlowGroup[];
  totalIn: Money;
  totalOut: Money;
  netMovement: Money;
  closing: Money;
};

/**
 * Which group a source belongs to, and the order its line prints in.
 *
 * The order is fixed rather than sorted by amount, so the statement reads the
 * same way every month and a figure stays where the reader last found it.
 * `opening` is deliberately not here: it is the balance carried in, not a
 * movement, and counting it would double the opening.
 */
const LAYOUT: {
  source: CashSource;
  group: CashFlowGroupKey;
  /**
   * What the line is called here. The Cash Book names a row by the document it
   * came off, "Money Receipt", because that is what the reader is looking at.
   * A statement line names the flow, "Received from Customers", because that is
   * what the figure is. Same source, two jobs, two labels.
   */
  label: string;
}[] = [
  { source: 'receipt', group: 'trading', label: 'Received from Customers' },
  { source: 'payment', group: 'trading', label: 'Paid to Subcontractors' },
  // Yarn, kept apart from processing so what was spent on material reads on
  // its own line (2026-10-06).
  {
    source: 'supplier_payment',
    group: 'trading',
    label: 'Paid to Suppliers',
  },
  { source: 'expense', group: 'trading', label: 'Expenses Paid' },
  { source: 'salary', group: 'trading', label: 'Salaries Paid' },
  { source: 'advance', group: 'trading', label: 'Salary Advances' },

  { source: 'capital', group: 'funding', label: 'Capital Introduced' },
  { source: 'loan_received', group: 'funding', label: 'Loans Received' },
  {
    source: 'loan_repayment',
    group: 'funding',
    label: 'Loan Principal Repaid',
  },
  // Interest sits with the loan it was paid on rather than under trading. Both
  // are defensible and this is the one a reader can follow: the whole cost of
  // the borrowing reads in one place, under the borrowing.
  { source: 'loan_interest', group: 'funding', label: 'Loan Interest Paid' },
  { source: 'drawing', group: 'funding', label: 'Drawings' },
];

const GROUP_LABEL: Record<CashFlowGroupKey, string> = {
  trading: 'Trading',
  funding: 'Funding',
};

/** True where the source is a real movement rather than the balance carried in. */
export function isFlow(source: CashSource): boolean {
  return LAYOUT.some((entry) => entry.source === source);
}

/** Which group a source prints under, or null where it is not a flow. */
export function groupOf(source: CashSource): CashFlowGroupKey | null {
  return LAYOUT.find((entry) => entry.source === source)?.group ?? null;
}

export function buildCashFlow({
  movements,
  from,
  to,
}: {
  movements: readonly CashMovement[];
  /** 'YYYY-MM-DD', both inclusive. */
  from: string;
  to: string;
}): CashFlow {
  // Everything before the period folds into the opening, so this figure agrees
  // with the Cash Book's opening over the same range.
  let opening = Money.ZERO;
  const totals = new Map<CashSource, Money>();

  for (const movement of movements) {
    if (movement.date > to) continue;

    // Anything before the period is carried in. So is the opening balance
    // wherever it is dated: it is the balance the book starts from, not a
    // movement, so a book opened inside the range being reported still opens
    // rather than being counted as money arriving. Without the second half of
    // this the opening simply vanished from the statement while the Cash Book
    // still counted it, and the two closed on different figures.
    if (movement.date < from || movement.source === 'opening') {
      opening =
        cashDirection(movement.source) === 'in'
          ? opening.add(movement.amount)
          : opening.subtract(movement.amount);
      continue;
    }
    if (!isFlow(movement.source)) continue;

    const running = totals.get(movement.source) ?? Money.ZERO;
    totals.set(movement.source, running.add(movement.amount));
  }

  let totalIn = Money.ZERO;
  let totalOut = Money.ZERO;

  const groups: CashFlowGroup[] = (
    ['trading', 'funding'] as CashFlowGroupKey[]
  ).map((key) => {
    const lines: CashFlowLine[] = [];
    let net = Money.ZERO;

    for (const entry of LAYOUT) {
      if (entry.group !== key) continue;
      const amount = totals.get(entry.source);
      // A source with nothing against it is not printed. A statement of ten
      // lines that are all zero says less than one of four that are not.
      if (!amount || amount.isZero()) continue;

      const direction = cashDirection(entry.source);
      lines.push({
        source: entry.source,
        label: entry.label,
        direction,
        amount,
      });

      if (direction === 'in') {
        net = net.add(amount);
        totalIn = totalIn.add(amount);
      } else {
        net = net.subtract(amount);
        totalOut = totalOut.add(amount);
      }
    }

    return { key, label: GROUP_LABEL[key], lines, net };
  });

  const netMovement = totalIn.subtract(totalOut);

  return {
    from,
    to,
    opening,
    groups,
    totalIn,
    totalOut,
    netMovement,
    closing: opening.add(netMovement),
  };
}
