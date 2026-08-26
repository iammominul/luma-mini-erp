import { describe, expect, it } from 'vitest';
import { buildLoanLedger } from './loan';
import { Money } from './money';
import { fundDirection, type FundCategory, type FundMovement } from './types';

/**
 * A loan's outstanding is a figure somebody repays against and an auditor
 * confirms with the lender, so it is tested the way a balance is.
 */

const tk = (value: string) => Money.fromDecimal(value);

let sequence = 0;

function movement(
  category: FundCategory,
  movedOn: string,
  amount: string,
  interestAmount = '0.00',
  docNo: string | null = null,
): FundMovement {
  sequence += 1;
  return {
    id: `fm-${sequence}`,
    docNo,
    movedOn,
    category,
    direction: fundDirection(category),
    loanId: 'loan-1',
    loanCode: 'LOAN-0001',
    lender: 'Islami Bank',
    description: 'Working capital',
    amount: tk(amount),
    interestAmount: tk(interestAmount),
    mode: 'bank_transfer',
    reference: null,
    notes: null,
  };
}

describe('a loan ledger', () => {
  it('owes received less principal repaid, and interest never touches it', () => {
    const ledger = buildLoanLedger({
      movements: [
        movement('loan_received', '2026-03-01', '1000000.00'),
        movement('loan_repayment', '2026-04-05', '250000.00', '12500.00'),
        movement('loan_repayment', '2026-05-05', '250000.00', '11000.00'),
      ],
    });

    expect(ledger.closing.toDecimalString()).toBe('500000.00');
    expect(ledger.totalInterest.toDecimalString()).toBe('23500.00');
    // Which is the whole rule: 23,500 was paid and none of it reduced the debt,
    // and none of it increased it either.
    expect(ledger.totalIn.toDecimalString()).toBe('1000000.00');
    expect(ledger.totalOut.toDecimalString()).toBe('500000.00');
  });

  it('accumulates a facility drawn in tranches', () => {
    const ledger = buildLoanLedger({
      movements: [
        movement('loan_received', '2026-03-01', '400000.00'),
        movement('loan_received', '2026-03-20', '300000.00'),
        movement('loan_received', '2026-04-11', '300000.00'),
        movement('loan_repayment', '2026-05-05', '150000.00'),
      ],
    });

    // Never derived from what was sanctioned. An overdraft is drawn in pieces
    // and the outstanding is only ever what was taken less what went back.
    expect(ledger.closing.toDecimalString()).toBe('850000.00');
  });

  it('shows a negative outstanding rather than clamping it at zero', () => {
    const ledger = buildLoanLedger({
      movements: [
        movement('loan_received', '2026-03-01', '100000.00'),
        movement('loan_repayment', '2026-04-05', '120000.00'),
      ],
    });

    // More repaid than was ever drawn is a keying error, and hiding it behind a
    // zero hides the error.
    expect(ledger.closing.toDecimalString()).toBe('-20000.00');
  });

  it('folds everything before the period into the opening', () => {
    const ledger = buildLoanLedger({
      movements: [
        movement('loan_received', '2026-03-01', '1000000.00'),
        movement('loan_repayment', '2026-04-05', '250000.00', '12500.00'),
        movement('loan_repayment', '2026-05-05', '250000.00', '11000.00'),
      ],
      from: '2026-05-01',
      to: '2026-05-31',
    });

    expect(ledger.opening.toDecimalString()).toBe('750000.00');
    expect(ledger.rows).toHaveLength(1);
    expect(ledger.closing.toDecimalString()).toBe('500000.00');
    // The interest paid in April is behind the period and is not in this total.
    expect(ledger.totalInterest.toDecimalString()).toBe('11000.00');
  });

  it('draws before it repays on the same date', () => {
    const ledger = buildLoanLedger({
      movements: [
        movement('loan_repayment', '2026-03-01', '40000.00'),
        movement('loan_received', '2026-03-01', '100000.00'),
      ],
    });

    expect(ledger.rows[0]!.movement.category).toBe('loan_received');
    expect(ledger.rows[0]!.balance.toDecimalString()).toBe('100000.00');
  });

  it('orders two vouchers on one date by their serial', () => {
    const ledger = buildLoanLedger({
      movements: [
        movement(
          'loan_received',
          '2026-03-01',
          '20000.00',
          '0.00',
          'FM-26-0007',
        ),
        movement(
          'loan_received',
          '2026-03-01',
          '10000.00',
          '0.00',
          'FM-26-0003',
        ),
      ],
    });

    expect(ledger.rows.map((r) => r.movement.docNo)).toEqual([
      'FM-26-0003',
      'FM-26-0007',
    ]);
  });

  it('answers a loan with no movements with zero', () => {
    const ledger = buildLoanLedger({ movements: [] });
    expect(ledger.opening.toDecimalString()).toBe('0.00');
    expect(ledger.closing.toDecimalString()).toBe('0.00');
    expect(ledger.rows).toHaveLength(0);
  });

  it('loses no poisha over a hundred movements', () => {
    const movements = Array.from({ length: 100 }, () =>
      movement('loan_received', '2026-03-01', '0.01'),
    );
    expect(buildLoanLedger({ movements }).closing.toDecimalString()).toBe(
      '1.00',
    );
  });
});
