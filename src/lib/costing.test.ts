import { describe, expect, it } from 'vitest';
import { Money } from './money';
import {
  type CostLine,
  coverage,
  marginPercent,
  orderMargin,
  profitStatement,
} from './costing';
import {
  EXPENSE_CATEGORIES,
  EXPENSE_CLAIM_CATEGORIES,
  expenseCategoryTier,
} from './types';

const tk = (value: string) => Money.fromDecimal(value);

const line = (
  label: string,
  amount: string,
  tier: CostLine['tier'],
): CostLine => ({ label, amount: tk(amount), tier });

/**
 * The tier lives on the category, so the two must never drift apart. A category
 * added without one would silently land in overhead and quietly flatter the
 * gross margin, which is exactly the bug this whole split exists to fix.
 */
describe('every category carries a tier', () => {
  it('has one on each expense category', () => {
    for (const category of EXPENSE_CATEGORIES) {
      expect(
        ['direct', 'selling', 'operating'].includes(category.tier),
        `${category.value} has no valid tier`,
      ).toBe(true);
    }
  });

  it('has one on each claim category', () => {
    for (const category of EXPENSE_CLAIM_CATEGORIES) {
      expect(category.tier).toBe('operating');
    }
  });

  it('puts the costs of doing the work in the direct tier', () => {
    expect(expenseCategoryTier('freight_inward')).toBe('direct');
    expect(expenseCategoryTier('freight_outward')).toBe('direct');
    expect(expenseCategoryTier('lab_test')).toBe('direct');
  });

  it('puts commission in the selling tier, not in the direct one', () => {
    expect(expenseCategoryTier('commission')).toBe('selling');
  });

  it('leaves staff transport in overhead', () => {
    expect(expenseCategoryTier('transport')).toBe('operating');
  });

  // An unknown category is one this build does not know about. Counting it as
  // overhead cannot overstate the margin, which is the safe way to be wrong.
  it('treats an unknown category as overhead', () => {
    expect(expenseCategoryTier('something_new')).toBe('operating');
  });
});

describe('the profit statement', () => {
  const costs = [
    line('Dyeing & Finishing', '48000', 'direct'),
    line('Knitting', '12000', 'direct'),
    line('Freight, Fabric Inward', '2100', 'direct'),
    line('Lab Testing', '450', 'direct'),
    line('Commission on Orders', '3400', 'selling'),
    line('Salary', '8000', 'operating'),
    line('Rent', '4200', 'operating'),
  ];
  const statement = profitStatement({ revenue: tk('100000'), costs });

  it('takes only the direct tier off for the gross margin', () => {
    expect(statement.directCost.toDecimalString()).toBe('62550.00');
    expect(statement.grossMargin.toDecimalString()).toBe('37450.00');
    expect(statement.grossMarginPercent).toBe('37.4%');
  });

  it('keeps commission out of the gross margin and off its own line', () => {
    expect(statement.sellingCost.toDecimalString()).toBe('3400.00');
    expect(statement.contribution.toDecimalString()).toBe('34050.00');
    expect(statement.contributionPercent).toBe('34.0%');
  });

  it('takes overhead off last for the net result', () => {
    expect(statement.operatingCost.toDecimalString()).toBe('12200.00');
    expect(statement.netResult.toDecimalString()).toBe('21850.00');
    expect(statement.netResultPercent).toBe('21.8%');
  });

  it('keeps the lines of each tier for the statement to print', () => {
    expect(statement.directLines).toHaveLength(4);
    expect(statement.sellingLines).toHaveLength(1);
    expect(statement.operatingLines).toHaveLength(2);
  });

  it('reports a loss at any tier rather than clamping it', () => {
    const loss = profitStatement({ revenue: tk('50000'), costs });
    expect(loss.grossMargin.toDecimalString()).toBe('-12550.00');
    expect(loss.netResult.toDecimalString()).toBe('-28150.00');
    expect(loss.grossMarginPercent).toBe('-25.1%');
  });

  it('has no percentages in a period with nothing billed', () => {
    const quiet = profitStatement({ revenue: Money.ZERO, costs });
    expect(quiet.grossMarginPercent).toBeNull();
    expect(quiet.netResultPercent).toBeNull();
    expect(quiet.netResult.toDecimalString()).toBe('-78150.00');
  });

  it('is all revenue when nothing was spent', () => {
    const clean = profitStatement({ revenue: tk('1000'), costs: [] });
    expect(clean.netResult.toDecimalString()).toBe('1000.00');
    expect(clean.netResultPercent).toBe('100.0%');
  });

  it('keeps every figure exact to the poisha', () => {
    const exact = profitStatement({
      revenue: tk('643798.00'),
      costs: [
        line('Dyeing', '520000.55', 'direct'),
        line('Commission', '0.45', 'selling'),
      ],
    });
    expect(exact.grossMargin.toDecimalString()).toBe('123797.45');
    expect(exact.contribution.toDecimalString()).toBe('123797.00');
  });
});

describe('a percentage of revenue', () => {
  it('stays off the floats, to one decimal', () => {
    expect(marginPercent(tk('100000'), tk('300000'))).toBe('33.3%');
  });

  it('is null when there is no revenue to take a share of', () => {
    expect(marginPercent(tk('-5000'), Money.ZERO)).toBeNull();
  });
});

describe('the margin on one order', () => {
  it('stops at contribution, because overhead is never apportioned', () => {
    const order = orderMargin({
      orderNo: 'ORD-2026-114',
      revenue: tk('420000'),
      directCost: tk('341000'),
      sellingCost: tk('16800'),
    });
    expect(order.contribution.toDecimalString()).toBe('62200.00');
    expect(order.contributionPercent).toBe('14.8%');
  });

  it('shows an order that lost money as losing money', () => {
    const order = orderMargin({
      orderNo: 'ORD-2026-115',
      revenue: tk('100000'),
      directCost: tk('120000'),
      sellingCost: Money.ZERO,
    });
    expect(order.contribution.toDecimalString()).toBe('-20000.00');
  });
});

describe('how much of the cost is pinned to an order', () => {
  it('says what share carries a reference and what is left over', () => {
    const result = coverage(tk('75000'), tk('100000'));
    expect(result.percent).toBe('75.0%');
    expect(result.unattributed.toDecimalString()).toBe('25000.00');
  });

  it('says nothing rather than everything when there is no cost at all', () => {
    expect(coverage(Money.ZERO, Money.ZERO).percent).toBeNull();
  });
});
