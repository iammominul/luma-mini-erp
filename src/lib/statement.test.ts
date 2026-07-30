import { describe, expect, it } from 'vitest';
import { Money } from './money';
import { buildStatement, statementLabels, type Movement } from './statement';

const tk = (value: string) => Money.fromDecimal(value);

function bill(
  id: string,
  date: string,
  amount: string,
  reference: string | null = null,
): Movement {
  return {
    id,
    kind: 'bill',
    date,
    particulars: `Bill ${id}`,
    reference,
    amount: tk(amount),
  };
}

function payment(id: string, date: string, amount: string): Movement {
  return {
    id,
    kind: 'payment',
    date,
    particulars: `Receipt ${id}`,
    reference: null,
    amount: tk(amount),
  };
}

describe('buildStatement', () => {
  it('runs a balance forward from the opening balance', () => {
    const statement = buildStatement({
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
    const statement = buildStatement({
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
    const statement = buildStatement({
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
    const statement = buildStatement({
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
    const statement = buildStatement({
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

  it('marks each row in exactly one amount column', () => {
    const statement = buildStatement({
      openingBalance: Money.ZERO,
      movements: [
        bill('b1', '2026-07-01', '100.00'),
        payment('p1', '2026-07-02', '40.00'),
      ],
    });

    expect(statement.rows[0]?.billed?.toDecimalString()).toBe('100.00');
    expect(statement.rows[0]?.settled).toBeNull();
    expect(statement.rows[1]?.billed).toBeNull();
    expect(statement.rows[1]?.settled?.toDecimalString()).toBe('40.00');
  });

  it('carries an advance as a negative balance', () => {
    const statement = buildStatement({
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
    const statement = buildStatement({
      openingBalance: tk('700.00'),
      movements: [],
    });

    expect(statement.rows).toEqual([]);
    expect(statement.closing.toDecimalString()).toBe('700.00');
    expect(statement.totalBilled.toDecimalString()).toBe('0.00');
  });
});

describe('statementLabels', () => {
  it('states the direction each side reads', () => {
    expect(statementLabels('customer').settled).toBe('Amount Received');
    expect(statementLabels('customer').balance).toBe('Balance Due');
    expect(statementLabels('subcontractor').settled).toBe('Amount Paid');
    expect(statementLabels('subcontractor').balance).toBe('Balance Payable');
  });
});
