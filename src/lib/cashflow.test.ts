import { describe, expect, it } from 'vitest';
import { CASH_SOURCES, type CashMovement, type CashSource } from './cashbook';
import { buildCashFlow, groupOf, isFlow } from './cashflow';
import { Money } from './money';

/**
 * The Cash Flow is the screen somebody opens to ask how the business is doing,
 * so its figures are tested the way a balance is.
 */

const tk = (value: string) => Money.fromDecimal(value);

let sequence = 0;

function row(source: CashSource, date: string, amount: string): CashMovement {
  sequence += 1;
  return {
    id: `row-${sequence}`,
    source,
    date,
    particulars: CASH_SOURCES[source].label,
    mode: 'bank_transfer',
    reference: null,
    href: null,
    seq: null,
    recordedAt: '2026-01-01T00:00:00.000000',
    amount: tk(amount),
  };
}

const BOOK: CashMovement[] = [
  row('opening', '2026-06-01', '620000.00'),
  row('receipt', '2026-07-02', '500000.00'),
  row('receipt', '2026-07-19', '300000.00'),
  row('payment', '2026-07-06', '310000.00'),
  row('expense', '2026-07-08', '245000.00'),
  row('salary', '2026-07-31', '180000.00'),
  row('capital', '2026-07-03', '50000.00'),
  row('loan_received', '2026-07-04', '200000.00'),
  row('loan_repayment', '2026-07-25', '150000.00'),
  row('loan_interest', '2026-07-25', '12500.00'),
  row('drawing', '2026-07-28', '100000.00'),
];

const JULY = { from: '2026-07-01', to: '2026-07-31' };

describe('the cash flow', () => {
  it('carries everything before the period into the opening', () => {
    const flow = buildCashFlow({ movements: BOOK, ...JULY });
    expect(flow.opening.toDecimalString()).toBe('620000.00');
  });

  it('splits the movements into trading and funding', () => {
    const flow = buildCashFlow({ movements: BOOK, ...JULY });
    const [trading, funding] = flow.groups;

    expect(trading!.label).toBe('Trading');
    expect(trading!.lines.map((line) => line.label)).toEqual([
      'Received from Customers',
      'Paid to Subcontractors',
      'Expenses Paid',
      'Salaries Paid',
    ]);
    // 8,00,000 in less 3,10,000, 2,45,000 and 1,80,000 out.
    expect(trading!.net.toDecimalString()).toBe('65000.00');

    expect(funding!.lines.map((line) => line.label)).toEqual([
      'Capital Introduced',
      'Loans Received',
      'Loan Principal Repaid',
      'Loan Interest Paid',
      'Drawings',
    ]);
    // 2,50,000 in less 1,50,000, 12,500 and 1,00,000 out.
    expect(funding!.net.toDecimalString()).toBe('-12500.00');
  });

  it('closes at opening plus the net movement, exactly', () => {
    const flow = buildCashFlow({ movements: BOOK, ...JULY });

    expect(flow.totalIn.toDecimalString()).toBe('1050000.00');
    expect(flow.totalOut.toDecimalString()).toBe('997500.00');
    expect(flow.netMovement.toDecimalString()).toBe('52500.00');
    expect(flow.closing.toDecimalString()).toBe('672500.00');

    // And the two group nets have to account for all of it, or a reader adding
    // the statement up by hand gets a different answer from the total on it.
    const summed = flow.groups.reduce(
      (total, group) => total.add(group.net),
      Money.ZERO,
    );
    expect(summed.toDecimalString()).toBe(flow.netMovement.toDecimalString());
  });

  it('adds up two receipts on the same line rather than listing them twice', () => {
    const flow = buildCashFlow({ movements: BOOK, ...JULY });
    const received = flow.groups[0]!.lines.find(
      (line) => line.source === 'receipt',
    );
    expect(received?.amount.toDecimalString()).toBe('800000.00');
  });

  it('opens on a balance dated inside the period, rather than dropping it', async () => {
    // The opening is the balance the book starts from wherever it is dated, so
    // a book opened inside the range still opens rather than counting as money
    // arriving. This closed on a different figure from the Cash Book until the
    // second half of the fold was added.
    const { buildCashBook } = await import('./cashbook');
    const movements = [
      row('opening', '2026-07-01', '620000.00'),
      row('receipt', '2026-07-10', '100000.00'),
    ];
    const flow = buildCashFlow({ movements, ...JULY });

    expect(flow.opening.toDecimalString()).toBe('620000.00');
    expect(flow.totalIn.toDecimalString()).toBe('100000.00');
    expect(flow.closing.toDecimalString()).toBe('720000.00');
    expect(flow.closing.toDecimalString()).toBe(
      buildCashBook({ movements, ...JULY }).closing.toDecimalString(),
    );
  });

  it('agrees with the cash book it is grouped from', async () => {
    const { buildCashBook } = await import('./cashbook');
    const book = buildCashBook({ movements: BOOK, ...JULY });
    const flow = buildCashFlow({ movements: BOOK, ...JULY });

    // The same opening and the same closing, or one screen contradicts the
    // other about what the business is holding.
    expect(flow.opening.toDecimalString()).toBe(book.opening.toDecimalString());
    expect(flow.closing.toDecimalString()).toBe(book.closing.toDecimalString());
  });

  it('drops a line with nothing against it', () => {
    const flow = buildCashFlow({
      movements: [row('receipt', '2026-07-02', '1000.00')],
      ...JULY,
    });
    expect(flow.groups[0]!.lines).toHaveLength(1);
    // A funding group with no funding in it prints no lines and a zero net.
    expect(flow.groups[1]!.lines).toHaveLength(0);
    expect(flow.groups[1]!.net.toDecimalString()).toBe('0.00');
  });

  it('answers an empty book with zero throughout', () => {
    const flow = buildCashFlow({ movements: [], ...JULY });
    expect(flow.opening.toDecimalString()).toBe('0.00');
    expect(flow.netMovement.toDecimalString()).toBe('0.00');
    expect(flow.closing.toDecimalString()).toBe('0.00');
  });

  it('loses no poisha over a hundred rows', () => {
    const movements = Array.from({ length: 100 }, () =>
      row('expense', '2026-07-10', '0.01'),
    );
    const flow = buildCashFlow({ movements, ...JULY });
    expect(flow.totalOut.toDecimalString()).toBe('1.00');
    expect(flow.closing.toDecimalString()).toBe('-1.00');
  });
});

describe('what counts as a flow', () => {
  it('places every cash source except the opening', () => {
    const unplaced = (Object.keys(CASH_SOURCES) as CashSource[]).filter(
      (source) => !isFlow(source),
    );
    // If a new source is added and never given a group, it would silently drop
    // out of the statement while still moving the Cash Book. This is the test
    // that catches that.
    expect(unplaced.sort()).toEqual(['opening']);
  });

  it('gives every flow a group', () => {
    for (const source of Object.keys(CASH_SOURCES) as CashSource[]) {
      if (!isFlow(source)) {
        expect(groupOf(source), source).toBeNull();
        continue;
      }
      expect(['trading', 'funding'], source).toContain(groupOf(source));
    }
  });
});
