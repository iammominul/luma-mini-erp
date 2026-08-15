import { describe, expect, it } from 'vitest';
import { Money } from './money';
import {
  PayrollError,
  type RecoverableAdvance,
  absenceDeduction,
  advanceOutstanding,
  apportionRecovered,
  daysInPeriod,
  divisorFor,
  grossOf,
  netPay,
  parseAbsentDays,
  plannedRecovery,
  suggestedRecovery,
} from './payroll';

const tk = (value: string) => Money.fromDecimal(value);

function advance(
  id: string,
  paidOn: string,
  amount: string,
  extra: Partial<RecoverableAdvance> = {},
): RecoverableAdvance {
  return {
    id,
    paidOn,
    amount: tk(amount),
    recoveryMode: 'manual',
    installmentAmount: null,
    recoverFrom: null,
    ...extra,
  };
}

describe('gross', () => {
  it('is the sum of the six components', () => {
    expect(
      grossOf({
        basic: tk('18000'),
        houseRent: tk('7200'),
        medical: tk('1500'),
        conveyance: tk('1000'),
        mobileAllowance: tk('500'),
        otherAllowance: tk('800'),
      }).toDecimalString(),
    ).toBe('29000.00');
  });

  it('is zero when nothing has been set up yet', () => {
    expect(
      grossOf({
        basic: Money.ZERO,
        houseRent: Money.ZERO,
        medical: Money.ZERO,
        conveyance: Money.ZERO,
        mobileAllowance: Money.ZERO,
        otherAllowance: Money.ZERO,
      }).isZero(),
    ).toBe(true);
  });
});

describe('net pay', () => {
  it('is gross when nothing is withheld', () => {
    expect(netPay({ gross: tk('18000') }).toDecimalString()).toBe('18000.00');
  });

  it('takes off the other deduction and the advance', () => {
    expect(
      netPay({
        gross: tk('18000'),
        otherDeduction: tk('500'),
        advanceDeduction: tk('4000'),
      }).toDecimalString(),
    ).toBe('13500.00');
  });

  /** The worked example the owner gave: 30,000 - 2,000 - 3,000 + 5,000. */
  it('adds the bonus back after taking the deductions off', () => {
    const absence = absenceDeduction(tk('30000'), '2', 'thirty', '2026-08');
    expect(absence.toDecimalString()).toBe('2000.00');
    expect(
      netPay({
        gross: tk('30000'),
        absence,
        advanceDeduction: tk('3000'),
        bonus: tk('5000'),
      }).toDecimalString(),
    ).toBe('30000.00');
  });

  it('adds an additional allowance too', () => {
    expect(
      netPay({
        gross: tk('20000'),
        bonus: tk('1000'),
        additionalAllowance: tk('750'),
      }).toDecimalString(),
    ).toBe('21750.00');
  });

  it('keeps the poisha exact', () => {
    expect(
      netPay({
        gross: tk('18000.55'),
        otherDeduction: tk('0.30'),
        advanceDeduction: tk('1000.20'),
      }).toDecimalString(),
    ).toBe('17000.05');
  });

  it('is zero when the advance takes the whole salary', () => {
    const net = netPay({ gross: tk('12000'), advanceDeduction: tk('12000') });
    expect(net.isZero()).toBe(true);
    expect(net.toDecimalString()).toBe('0.00');
  });

  it('refuses to go negative rather than paying zero', () => {
    expect(() =>
      netPay({ gross: tk('10000'), advanceDeduction: tk('12000') }),
    ).toThrow(PayrollError);
  });

  it('counts every deduction together before refusing', () => {
    expect(() =>
      netPay({
        gross: tk('10000'),
        otherDeduction: tk('6000'),
        advanceDeduction: tk('5000'),
      }),
    ).toThrow(PayrollError);
  });

  // A bonus can rescue a salary the deductions would otherwise sink, so the
  // refusal has to be judged on the final figure and not on the way there.
  it('does not refuse when a bonus covers the deductions', () => {
    expect(
      netPay({
        gross: tk('10000'),
        advanceDeduction: tk('12000'),
        bonus: tk('5000'),
      }).toDecimalString(),
    ).toBe('3000.00');
  });
});

describe('the per day basis', () => {
  it('divides by 30 by default', () => {
    expect(divisorFor('thirty', '2026-02')).toBe(30);
  });

  it('divides by 26 when the month is counted in working days', () => {
    expect(divisorFor('twenty_six', '2026-02')).toBe(26);
  });

  it('uses the real length of the month when asked to', () => {
    expect(divisorFor('actual', '2026-02')).toBe(28);
    expect(divisorFor('actual', '2026-08')).toBe(31);
    expect(divisorFor('actual', '2026-04')).toBe(30);
  });

  it('knows a leap February', () => {
    expect(daysInPeriod('2028-02')).toBe(29);
  });
});

describe('absent days', () => {
  it('reads a whole day and a half day', () => {
    expect(parseAbsentDays('3')).toBe(30n);
    expect(parseAbsentDays('0.5')).toBe(5n);
    expect(parseAbsentDays('')).toBe(0n);
  });

  it('refuses anything finer than a tenth rather than rounding it', () => {
    expect(() => parseAbsentDays('1.25')).toThrow(PayrollError);
  });
});

describe('absence deduction', () => {
  it('is nothing when nobody was absent', () => {
    expect(
      absenceDeduction(tk('30000'), '0', 'thirty', '2026-08').isZero(),
    ).toBe(true);
  });

  // The three conventions on the same salary, which is the whole reason the
  // basis is a stored choice and not a constant.
  it('divides by 30', () => {
    expect(
      absenceDeduction(tk('30000'), '3', 'thirty', '2026-08').toDecimalString(),
    ).toBe('3000.00');
  });

  it('divides by 26', () => {
    expect(
      absenceDeduction(tk('30000'), '3', 'twenty_six', '2026-08').toDecimalString(),
    ).toBe('3461.54');
  });

  it('divides by the real length of the month', () => {
    expect(
      absenceDeduction(tk('30000'), '3', 'actual', '2026-08').toDecimalString(),
    ).toBe('2903.23');
  });

  it('handles a half day', () => {
    expect(
      absenceDeduction(tk('30000'), '0.5', 'thirty', '2026-08').toDecimalString(),
    ).toBe('500.00');
  });

  /**
   * Rounding once at the end, not per day. Ten single absent days must cost
   * exactly what one ten day absence costs, or a salary depends on how the
   * absence was keyed.
   */
  it('rounds once, so ten single days equal one ten day absence', () => {
    const together = absenceDeduction(tk('18000'), '10', 'twenty_six', '2026-08');
    const separately = Array.from({ length: 10 }).reduce<Money>(
      (total) =>
        total.add(absenceDeduction(tk('18000'), '1', 'twenty_six', '2026-08')),
      Money.ZERO,
    );
    expect(together.toDecimalString()).toBe('6923.08');
    // Rounded per day this drifts: 692.31 x 10 is 6923.10, two poisha adrift.
    expect(separately.toDecimalString()).toBe('6923.10');
    expect(together.equals(separately)).toBe(false);
  });

  it('rounds half up at the poisha', () => {
    // 1000.00 over 3 days worth: 333.333..., which rounds down.
    expect(
      absenceDeduction(tk('1000'), '1', 'actual', '2026-04').toDecimalString(),
    ).toBe('33.33');
  });
});

describe('net pay with an absence', () => {
  it('takes the absence off before the advance', () => {
    const absence = absenceDeduction(tk('30000'), '3', 'thirty', '2026-08');
    expect(
      netPay({
        gross: tk('30000'),
        absence,
        advanceDeduction: tk('2000'),
      }).toDecimalString(),
    ).toBe('25000.00');
  });

  it('refuses when the absence pushes the net below zero', () => {
    const absence = absenceDeduction(tk('30000'), '30', 'thirty', '2026-08');
    expect(() =>
      netPay({ gross: tk('30000'), absence, advanceDeduction: tk('1') }),
    ).toThrow(PayrollError);
  });
});

describe('advance outstanding', () => {
  it('is what was paid less what came back', () => {
    expect(
      advanceOutstanding(tk('10000'), tk('4000')).toDecimalString(),
    ).toBe('6000.00');
  });

  it('is zero once the advance is fully recovered', () => {
    expect(advanceOutstanding(tk('10000'), tk('10000')).isZero()).toBe(true);
  });

  it('shows a negative rather than hiding an over-recovery', () => {
    expect(advanceOutstanding(tk('1000'), tk('1500')).toDecimalString()).toBe(
      '-500.00',
    );
  });
});

describe('suggested recovery', () => {
  it('offers the whole outstanding advance when the salary covers it', () => {
    expect(
      suggestedRecovery(tk('4000'), tk('18000')).toDecimalString(),
    ).toBe('4000.00');
  });

  it('caps at what the salary can absorb', () => {
    expect(
      suggestedRecovery(tk('20000'), tk('18000')).toDecimalString(),
    ).toBe('18000.00');
  });

  it('offers nothing when the employee owes nothing', () => {
    expect(suggestedRecovery(Money.ZERO, tk('18000')).isZero()).toBe(true);
  });

  it('offers nothing on a negative outstanding', () => {
    expect(suggestedRecovery(tk('-500'), tk('18000')).isZero()).toBe(true);
  });
});

describe('apportionRecovered', () => {
  it('clears the oldest advance before it touches the next', () => {
    const result = apportionRecovered(
      [advance('b', '2026-07-10', '8000'), advance('a', '2026-05-02', '5000')],
      tk('6000'),
    );
    expect(result.map((r) => [r.advance.id, r.outstanding.toDecimalString()])).toEqual([
      ['a', '0.00'],
      ['b', '7000.00'],
    ]);
  });

  it('leaves a part paid advance carrying its remainder', () => {
    const result = apportionRecovered([advance('a', '2026-05-02', '5000')], tk('2000'));
    expect(result[0]?.outstanding.toDecimalString()).toBe('3000.00');
  });

  it('never applies more than the advances between them hold', () => {
    const result = apportionRecovered([advance('a', '2026-05-02', '5000')], tk('9000'));
    expect(result[0]?.outstanding.toDecimalString()).toBe('0.00');
  });

  it('applies nothing when the recovered total is negative', () => {
    const result = apportionRecovered([advance('a', '2026-05-02', '5000')], tk('-400'));
    expect(result[0]?.outstanding.toDecimalString()).toBe('5000.00');
  });
});

describe('plannedRecovery', () => {
  const payable = tk('29000');

  it('takes nothing for an advance left on manual', () => {
    const advances = [advance('a', '2026-08-01', '20000')];
    expect(plannedRecovery(advances, Money.ZERO, '2026-09', payable).isZero()).toBe(true);
  });

  it('takes the fixed installment', () => {
    const advances = [
      advance('a', '2026-08-01', '20000', {
        recoveryMode: 'installment',
        installmentAmount: tk('5000'),
      }),
    ];
    expect(
      plannedRecovery(advances, Money.ZERO, '2026-09', payable).toDecimalString(),
    ).toBe('5000.00');
  });

  it('takes the remainder as the last installment, never an overshoot', () => {
    const advances = [
      advance('a', '2026-08-01', '20000', {
        recoveryMode: 'installment',
        installmentAmount: tk('5000'),
      }),
    ];
    expect(
      plannedRecovery(advances, tk('18000'), '2026-09', payable).toDecimalString(),
    ).toBe('2000.00');
  });

  it('takes the whole outstanding on full recovery', () => {
    const advances = [
      advance('a', '2026-08-01', '20000', { recoveryMode: 'full' }),
    ];
    expect(
      plannedRecovery(advances, tk('4000'), '2026-09', payable).toDecimalString(),
    ).toBe('16000.00');
  });

  it('waits for the month the recovery was agreed to start', () => {
    const advances = [
      advance('a', '2026-08-01', '20000', {
        recoveryMode: 'installment',
        installmentAmount: tk('5000'),
        recoverFrom: '2026-10',
      }),
    ];
    expect(plannedRecovery(advances, Money.ZERO, '2026-09', payable).isZero()).toBe(true);
    expect(
      plannedRecovery(advances, Money.ZERO, '2026-10', payable).toDecimalString(),
    ).toBe('5000.00');
  });

  it('takes nothing once the advance is cleared', () => {
    const advances = [
      advance('a', '2026-08-01', '20000', {
        recoveryMode: 'installment',
        installmentAmount: tk('5000'),
      }),
    ];
    expect(plannedRecovery(advances, tk('20000'), '2026-09', payable).isZero()).toBe(true);
  });

  it('adds up two agreements running at once', () => {
    const advances = [
      advance('a', '2026-05-02', '5000', { recoveryMode: 'full' }),
      advance('b', '2026-07-10', '12000', {
        recoveryMode: 'installment',
        installmentAmount: tk('3000'),
      }),
    ];
    expect(
      plannedRecovery(advances, Money.ZERO, '2026-09', payable).toDecimalString(),
    ).toBe('8000.00');
  });

  it('caps at what the salary can carry, so generating a month cannot fail', () => {
    const advances = [
      advance('a', '2026-08-01', '60000', { recoveryMode: 'full' }),
    ];
    const planned = plannedRecovery(advances, Money.ZERO, '2026-09', payable);
    expect(planned.toDecimalString()).toBe('29000.00');
    expect(netPay({ gross: payable, advanceDeduction: planned }).isZero()).toBe(true);
  });

  it('recovers nothing for an installment agreement carrying no figure', () => {
    const advances = [
      advance('a', '2026-08-01', '20000', {
        recoveryMode: 'installment',
        installmentAmount: null,
      }),
    ];
    expect(plannedRecovery(advances, Money.ZERO, '2026-09', payable).isZero()).toBe(true);
  });
});
