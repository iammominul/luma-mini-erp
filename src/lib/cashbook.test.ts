import { describe, expect, it } from 'vitest';
import {
  buildCashBook,
  CASH_SOURCES,
  cashDirection,
  type CashMovement,
  type CashSource,
} from './cashbook';
import { Money } from './money';
import { FUND_CATEGORIES, fundDirection, fundNeedsLoan } from './types';

/**
 * The Cash Book decides what the business believes it is holding, so it is
 * tested the way a balance is. A change to the ordering, to a direction or to
 * how a voucher is split into rows is a change to a figure somebody reads as
 * money in the account: add the case.
 */

const tk = (value: string) => Money.fromDecimal(value);

let sequence = 0;

function row(
  source: CashSource,
  date: string,
  amount: string,
  seq: number | null = null,
): CashMovement {
  sequence += 1;
  return {
    id: `row-${sequence}`,
    source,
    date,
    particulars: CASH_SOURCES[source].label,
    mode: 'bank_transfer',
    reference: null,
    href: null,
    seq,
    recordedAt: '2026-01-01T00:00:00.000000',
    amount: tk(amount),
  };
}

describe('the cash book', () => {
  it('folds everything before the period into the opening balance', () => {
    const book = buildCashBook({
      movements: [
        row('opening', '2026-01-01', '100000.00'),
        row('receipt', '2026-02-10', '50000.00'),
        row('expense', '2026-03-05', '20000.00'),
      ],
      from: '2026-03-01',
      to: '2026-03-31',
    });

    // The opening and the February receipt are behind the period, so they are
    // carried in rather than listed.
    expect(book.opening.toDecimalString()).toBe('150000.00');
    expect(book.rows).toHaveLength(1);
    expect(book.closing.toDecimalString()).toBe('130000.00');
  });

  it('drops anything after the period without touching the closing', () => {
    const book = buildCashBook({
      movements: [
        row('receipt', '2026-03-10', '50000.00'),
        row('expense', '2026-04-02', '9000.00'),
      ],
      from: '2026-03-01',
      to: '2026-03-31',
    });

    expect(book.rows).toHaveLength(1);
    expect(book.closing.toDecimalString()).toBe('50000.00');
  });

  it('closes at opening plus money in less money out, exactly', () => {
    const book = buildCashBook({
      movements: [
        row('opening', '2026-03-01', '420000.00'),
        row('receipt', '2026-03-02', '800000.50'),
        row('payment', '2026-03-04', '310000.25'),
        row('expense', '2026-03-08', '45000.75'),
        row('salary', '2026-03-31', '180000.00'),
      ],
      from: '2026-03-01',
      to: '2026-03-31',
    });

    // The opening row is inside the period here, so it is a row and it counts
    // toward money in rather than into the carried-forward opening.
    expect(book.opening.toDecimalString()).toBe('0.00');
    expect(book.totalIn.toDecimalString()).toBe('1220000.50');
    expect(book.totalOut.toDecimalString()).toBe('535001.00');
    expect(book.closing.toDecimalString()).toBe('684999.50');
    expect(
      book.opening.add(book.totalIn).subtract(book.totalOut).toDecimalString(),
    ).toBe(book.closing.toDecimalString());
  });

  it('puts money in before money out on the same date', () => {
    const book = buildCashBook({
      movements: [
        row('expense', '2026-03-10', '5000.00'),
        row('receipt', '2026-03-10', '9000.00'),
      ],
    });

    expect(book.rows.map((r) => r.source)).toEqual(['receipt', 'expense']);
    // Which is the point: the balance rises and is then drawn down, rather
    // than dipping through a figure the account never actually stood at.
    expect(book.rows[0]!.balance.toDecimalString()).toBe('9000.00');
  });

  it('puts the opening ahead of anything else on its date', () => {
    const book = buildCashBook({
      movements: [
        row('receipt', '2026-03-01', '9000.00'),
        row('opening', '2026-03-01', '100000.00'),
      ],
    });

    expect(book.rows[0]!.source).toBe('opening');
  });

  it('reprints identically whatever order the rows arrive in', () => {
    const movements = [
      row('opening', '2026-03-01', '100000.00'),
      row('receipt', '2026-03-04', '9000.00', 2),
      row('receipt', '2026-03-04', '4000.00', 1),
      row('expense', '2026-03-04', '2500.00', 3),
      row('payment', '2026-03-09', '15000.00'),
    ];

    const forward = buildCashBook({ movements });
    const backward = buildCashBook({ movements: [...movements].reverse() });

    expect(backward.rows.map((r) => r.id)).toEqual(
      forward.rows.map((r) => r.id),
    );
    // The two receipts on one date are ordered by their voucher serial.
    expect(forward.rows[1]!.amount.toDecimalString()).toBe('4000.00');
    expect(backward.closing.toDecimalString()).toBe(
      forward.closing.toDecimalString(),
    );
  });

  it('runs notes and a cheque into one balance', () => {
    // The book used to keep cash in hand apart from the bank and needed a
    // transfer voucher between them. It does not: one drawer, one set of
    // accounts, one figure. How the money moved is still on the row, and the
    // Cash Book prints it, but it decides nothing about the total.
    const book = buildCashBook({
      movements: [
        row('opening', '2026-03-01', '100000.00'),
        row('receipt', '2026-03-05', '500000.00'),
        row('expense', '2026-03-06', '20000.00'),
      ],
    });

    expect(book.closing.toDecimalString()).toBe('580000.00');
  });

  it('takes a repayment and its interest as two rows that both reduce cash', () => {
    // One cheque of 2,62,500: the principal comes off the loan, the interest is
    // a cost. Splitting them here is what stops a reader having to add them.
    const book = buildCashBook({
      movements: [
        row('opening', '2026-03-01', '1000000.00'),
        row('loan_repayment', '2026-04-05', '250000.00'),
        row('loan_interest', '2026-04-05', '12500.00'),
      ],
    });

    expect(book.rows).toHaveLength(3);
    expect(book.totalOut.toDecimalString()).toBe('262500.00');
    expect(book.closing.toDecimalString()).toBe('737500.00');
  });

  it('answers an empty book with zero and no rows', () => {
    const book = buildCashBook({ movements: [] });
    expect(book.opening.toDecimalString()).toBe('0.00');
    expect(book.rows).toHaveLength(0);
    expect(book.closing.toDecimalString()).toBe('0.00');
  });

  it('loses no poisha over a hundred rows', () => {
    const movements = Array.from({ length: 100 }, (_unused, index) =>
      row(
        'receipt',
        `2026-03-${String((index % 28) + 1).padStart(2, '0')}`,
        '0.01',
      ),
    );
    const book = buildCashBook({ movements });
    expect(book.closing.toDecimalString()).toBe('1.00');
  });
});

describe('a cash source', () => {
  it('carries a direction and a label for every one of them', () => {
    for (const [source, meta] of Object.entries(CASH_SOURCES)) {
      expect(meta.label.length, source).toBeGreaterThan(0);
      expect(['in', 'out']).toContain(meta.direction);
      expect(cashDirection(source as CashSource)).toBe(meta.direction);
    }
  });

  it('counts the four ways money arrives as money in', () => {
    expect(cashDirection('opening')).toBe('in');
    expect(cashDirection('receipt')).toBe('in');
    expect(cashDirection('capital')).toBe('in');
    expect(cashDirection('loan_received')).toBe('in');
  });

  it('counts a drawing and a repayment as money out', () => {
    expect(cashDirection('drawing')).toBe('out');
    expect(cashDirection('loan_repayment')).toBe('out');
    expect(cashDirection('loan_interest')).toBe('out');
  });
});

describe('a fund category', () => {
  // The expense equivalent of this block lives in costing.test.ts, which holds
  // the rule that every category carries the tier it is costed under.
  it('carries a direction and a loan rule for every one of them', () => {
    for (const category of FUND_CATEGORIES) {
      expect(['in', 'out'], category.value).toContain(category.direction);
      expect(category.label.length, category.value).toBeGreaterThan(0);
      expect(fundDirection(category.value)).toBe(category.direction);
      expect(fundNeedsLoan(category.value)).toBe(category.needsLoan);
    }
  });

  it('is the five the schema allows, and no more', () => {
    // The list is the CHECK constraint on fund_movement.category. A sixth added
    // here without one there is refused by the database at the moment somebody
    // tries to use it.
    expect(FUND_CATEGORIES.map((c) => c.value)).toEqual([
      'opening_cash',
      'capital_introduced',
      'owner_drawing',
      'loan_received',
      'loan_repayment',
    ]);
  });

  it('asks a loan movement to name its loan, and nothing else', () => {
    expect(fundNeedsLoan('loan_received')).toBe(true);
    expect(fundNeedsLoan('loan_repayment')).toBe(true);
    expect(fundNeedsLoan('capital_introduced')).toBe(false);
    expect(fundNeedsLoan('owner_drawing')).toBe(false);
    expect(fundNeedsLoan('opening_cash')).toBe(false);
  });

  it('names the ERP account each one posts to on handover', () => {
    for (const category of FUND_CATEGORIES) {
      // The opening is a balance carried in, not a posting, so it names none.
      if (category.value === 'opening_cash') continue;
      expect(category.erpAccount, category.value).toBeTruthy();
    }
  });

  it('counts an unknown category as money out', () => {
    // The way of being wrong that cannot overstate the cash in hand, which is
    // the same reasoning that makes an unknown expense category overhead.
    expect(fundDirection('something_else')).toBe('out');
    expect(fundDirection('')).toBe('out');
  });
});
