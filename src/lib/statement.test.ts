import { describe, expect, it } from 'vitest';
import { Money } from './money';
import {
  balanceSide,
  buildStatement,
  closingLabel,
  formatBalance,
  type Movement,
  statementLabels,
} from './statement';

const tk = (value: string) => Money.fromDecimal(value);

function bill(
  id: string,
  date: string,
  amount: string,
  reference: string | null = null,
  side: Movement['side'] = 'debit',
  /** The system's own serial, which orders two bills on one date. */
  seq: number | null = null,
): Movement {
  return {
    id,
    kind: 'bill',
    side,
    date,
    particulars: `Dyeing Bill ${id}`,
    reference,
    seq,
    recordedAt: `2026-01-01T00:00:00.000000`,
    amount: tk(amount),
  };
}

function payment(
  id: string,
  date: string,
  amount: string,
  side: Movement['side'] = 'credit',
): Movement {
  return {
    id,
    kind: 'payment',
    side,
    date,
    particulars: `Money Received ${id}`,
    reference: null,
    seq: null,
    recordedAt: `2026-01-01T00:00:00.000000`,
    amount: tk(amount),
  };
}

/** Movements carry their own side, so nothing here needs a party. */
function statementOf(input: Parameters<typeof buildStatement>[0]) {
  return buildStatement(input);
}

describe('buildStatement', () => {
  it('runs a balance forward from the opening balance', () => {
    const statement = statementOf({
      openingBalance: tk('50000.00'),
      movements: [
        bill('b1', '2026-07-05', '125000.50'),
        payment('p1', '2026-07-12', '100000.00'),
        bill('b2', '2026-07-20', '78250.25'),
      ],
    });

    expect(statement.opening.toDecimalString()).toBe('50000.00');
    expect(statement.rows.map((r) => r.balance.toDecimalString())).toEqual([
      '175000.50',
      '75000.50',
      '153250.75',
    ]);
    expect(statement.totalBilled.toDecimalString()).toBe('203250.75');
    expect(statement.totalSettled.toDecimalString()).toBe('100000.00');
    expect(statement.closing.toDecimalString()).toBe('153250.75');
  });

  it('closes at opening plus billed minus settled', () => {
    const statement = statementOf({
      openingBalance: tk('1234.56'),
      movements: [
        bill('b1', '2026-01-31', '9999.99'),
        payment('p1', '2026-02-01', '4321.00'),
      ],
    });

    const expected = tk('1234.56')
      .add(statement.totalBilled)
      .subtract(statement.totalSettled);
    expect(statement.closing.equals(expected)).toBe(true);
  });

  it('folds everything before the period into the opening balance', () => {
    const statement = statementOf({
      openingBalance: tk('10000.00'),
      movements: [
        bill('b1', '2026-05-10', '40000.00'),
        payment('p1', '2026-05-25', '15000.00'),
        bill('b2', '2026-07-02', '20000.00'),
      ],
      from: '2026-07-01',
      to: '2026-07-31',
    });

    // 10000 + 40000 - 15000 = 35000 carried in; only the July bill is listed.
    expect(statement.opening.toDecimalString()).toBe('35000.00');
    expect(statement.rows).toHaveLength(1);
    expect(statement.rows[0]?.id).toBe('b2');
    expect(statement.closing.toDecimalString()).toBe('55000.00');
  });

  it('includes both boundary dates and drops anything after the period', () => {
    const statement = statementOf({
      openingBalance: Money.ZERO,
      movements: [
        bill('b1', '2026-07-01', '100.00'),
        bill('b2', '2026-07-31', '200.00'),
        bill('b3', '2026-08-01', '400.00'),
      ],
      from: '2026-07-01',
      to: '2026-07-31',
    });

    expect(statement.rows.map((r) => r.id)).toEqual(['b1', 'b2']);
    expect(statement.closing.toDecimalString()).toBe('300.00');
  });

  it('lists a bill before a settlement made the same day', () => {
    const statement = statementOf({
      openingBalance: Money.ZERO,
      movements: [
        payment('p1', '2026-07-15', '500.00'),
        bill('b1', '2026-07-15', '900.00'),
      ],
    });

    expect(statement.rows.map((r) => r.id)).toEqual(['b1', 'p1']);
    expect(statement.rows.map((r) => r.balance.toDecimalString())).toEqual([
      '900.00',
      '400.00',
    ]);
  });

  // LUMA ran several bill books at once, so a hand-written number says nothing
  // about sequence. Two bills on one date are ordered by the system's own
  // number, whatever the paper says and whatever order the rows arrive in.
  it('orders two bills on one date by the system number', () => {
    const statement = statementOf({
      openingBalance: Money.ZERO,
      movements: [
        bill('zz', '2026-07-15', '300.00', 'Bill No. 93', 'debit', 121),
        bill('aa', '2026-07-15', '200.00', 'Bill No. 92', 'debit', 120),
      ],
    });

    expect(statement.rows.map((r) => r.reference)).toEqual([
      'Bill No. 92',
      'Bill No. 93',
    ]);
    expect(statement.rows.map((r) => r.balance.toDecimalString())).toEqual([
      '200.00',
      '500.00',
    ]);
  });

  // A bill received has no system number of its own, so that side falls back
  // to when it was recorded rather than to a random id.
  it('falls back to the recorded time where there is no system number', () => {
    const first = bill('zz', '2026-07-15', '300.00', 'RD-889', 'credit');
    const second = bill('aa', '2026-07-15', '200.00', 'RD-890', 'credit');
    const statement = statementOf({
      openingBalance: Money.ZERO,
      movements: [
        { ...second, recordedAt: '2026-07-16T11:00:00.000000' },
        { ...first, recordedAt: '2026-07-16T09:00:00.000000' },
      ],
    });

    expect(statement.rows.map((r) => r.reference)).toEqual([
      'RD-889',
      'RD-890',
    ]);
  });

  it('carries an advance as a negative balance', () => {
    const statement = statementOf({
      openingBalance: Money.ZERO,
      movements: [
        payment('p1', '2026-07-01', '50000.00'),
        bill('b1', '2026-07-10', '20000.00'),
      ],
    });

    expect(statement.rows[0]?.balance.toDecimalString()).toBe('-50000.00');
    expect(statement.closing.toDecimalString()).toBe('-30000.00');
  });

  it('is an opening-only statement when there is no activity', () => {
    const statement = statementOf({
      openingBalance: tk('700.00'),
      movements: [],
    });

    expect(statement.rows).toEqual([]);
    expect(statement.closing.toDecimalString()).toBe('700.00');
    expect(statement.totalBilled.toDecimalString()).toBe('0.00');
    expect(statement.totalDebit.toDecimalString()).toBe('0.00');
    expect(statement.totalCredit.toDecimalString()).toBe('0.00');
  });
});

describe('debit and credit columns', () => {
  const movements = [
    bill('b1', '2026-07-01', '100.00'),
    payment('p1', '2026-07-02', '40.00'),
  ];

  it('marks each row in exactly one column', () => {
    const statement = statementOf({ openingBalance: Money.ZERO, movements });

    expect(statement.rows[0]?.debit?.toDecimalString()).toBe('100.00');
    expect(statement.rows[0]?.credit).toBeNull();
    expect(statement.rows[1]?.debit).toBeNull();
    expect(statement.rows[1]?.credit?.toDecimalString()).toBe('40.00');
  });

  it('debits a bill we issued and credits money in', () => {
    const statement = statementOf({ openingBalance: Money.ZERO, movements });

    expect(statement.totalDebit.toDecimalString()).toBe('100.00');
    expect(statement.totalCredit.toDecimalString()).toBe('40.00');
    expect(statement.closing.toDecimalString()).toBe('60.00');
  });

  it('credits a bill we received and debits money out', () => {
    const statement = statementOf({
      openingBalance: Money.ZERO,
      movements: [
        bill('b1', '2026-07-01', '100.00', null, 'credit'),
        payment('p1', '2026-07-02', '40.00', 'debit'),
      ],
    });

    expect(statement.rows[0]?.credit?.toDecimalString()).toBe('100.00');
    expect(statement.rows[1]?.debit?.toDecimalString()).toBe('40.00');
    // Owed by us, so the balance runs negative.
    expect(statement.closing.toDecimalString()).toBe('-60.00');
  });

  /**
   * The whole reason direction lives on the document: one party can be billed
   * by us and bill us back, and the two net off in a single ledger.
   */
  it('nets both directions in one ledger for a party wearing two hats', () => {
    const statement = statementOf({
      openingBalance: Money.ZERO,
      movements: [
        // We dyed fabric for them.
        bill('b1', '2026-07-01', '300000.00', null, 'debit'),
        // They sold us yarn.
        bill('b2', '2026-07-05', '120000.00', null, 'credit'),
        // They paid us.
        payment('p1', '2026-07-10', '300000.00', 'credit'),
      ],
    });

    expect(statement.totalDebit.toDecimalString()).toBe('300000.00');
    expect(statement.totalCredit.toDecimalString()).toBe('420000.00');
    // Net: we owe them for the yarn.
    expect(statement.closing.toDecimalString()).toBe('-120000.00');
    expect(balanceSide(statement.closing)).toBe('Cr');
  });

  it('totals the columns to the same figures it billed and settled', () => {
    const statement = statementOf({ openingBalance: Money.ZERO, movements });

    expect(statement.totalDebit.equals(statement.totalBilled)).toBe(true);
    expect(statement.totalCredit.equals(statement.totalSettled)).toBe(true);
  });
});

describe('balanceSide', () => {
  it('reads straight off the sign, with no party to consult', () => {
    expect(balanceSide(tk('100.00'))).toBe('Dr');
    expect(balanceSide(tk('-100.00'))).toBe('Cr');
  });

  it('has no side when the account is settled', () => {
    expect(balanceSide(Money.ZERO)).toBe('');
  });
});

describe('formatBalance', () => {
  it('carries the sign as Dr or Cr, never as a minus', () => {
    expect(formatBalance(tk('427230.00'))).toBe('4,27,230.00 Dr');
    expect(formatBalance(tk('-50000.00'))).toBe('50,000.00 Cr');
  });

  it('states a settled account without a side', () => {
    expect(formatBalance(Money.ZERO)).toBe('0.00');
  });
});

describe('closingLabel', () => {
  it('names the balance for which way it runs, not for the view', () => {
    expect(closingLabel(tk('100.00'))).toBe('Closing Balance Receivable');
    expect(closingLabel(tk('-100.00'))).toBe('Closing Balance Payable');
    expect(closingLabel(Money.ZERO)).toBe('Closing Balance');
  });
});

describe('statementLabels', () => {
  it('words the settlement for the view it is read through', () => {
    expect(statementLabels('customer').totalSettled).toBe('Total Received');
    expect(statementLabels('subcontractor').totalSettled).toBe('Total Paid');
  });

  it('names the ledger columns the same whichever view is open', () => {
    expect(statementLabels('customer').debit).toBe('Debit');
    expect(statementLabels('subcontractor').debit).toBe('Debit');
  });
});
