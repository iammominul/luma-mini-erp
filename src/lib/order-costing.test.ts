import { describe, expect, it } from 'vitest';
import { Money } from './money';
import {
  type OrderLineInput,
  orderCosting,
  orderStage,
} from './order-costing';

const tk = (value: string) => Money.fromDecimal(value);
const ZERO = Money.ZERO;

function line(patch: Partial<OrderLineInput> = {}): OrderLineInput {
  return {
    lineId: 'l1',
    lineNo: 1,
    category: 'fabric',
    description: 'S/J 30/1 CVC',
    color: 'Navy',
    quantity: '1000',
    rate: '520',
    billed: ZERO,
    billedQty: '0',
    yarnOrdered: ZERO,
    yarnBilled: ZERO,
    knittingOrdered: ZERO,
    knittingBilled: ZERO,
    dyeingOrdered: ZERO,
    dyeingBilled: ZERO,
    transport: ZERO,
    otherDirect: ZERO,
    selling: ZERO,
    ...patch,
  };
}

const noOrderLevel = { transport: ZERO, otherDirect: ZERO, selling: ZERO };

describe('orderCosting', () => {
  it('works out a fabric line from yarn to the customer bill', () => {
    // 1000 kg booked at 520. Yarn 3,00,000, knitting 12,000, dyeing
    // 1,10,000, transport 3,500. Billed 5,20,000.
    const result = orderCosting({
      lines: [
        line({
          billed: tk('520000'),
          billedQty: '1000',
          yarnOrdered: tk('300000'),
          yarnBilled: tk('300000'),
          knittingOrdered: tk('12000'),
          knittingBilled: tk('12000'),
          dyeingOrdered: tk('110000'),
          dyeingBilled: tk('110000'),
          transport: tk('3500'),
        }),
      ],
      orderLevel: noOrderLevel,
    });
    const [only] = result.lines;
    expect(only!.bookedValue.toDecimalString()).toBe('520000.00');
    expect(only!.directCost.toDecimalString()).toBe('425500.00');
    expect(only!.contribution.toDecimalString()).toBe('94500.00');
    expect(only!.contributionPercent).toBe('18.2%');
    expect(only!.unbilledCommitment.isZero()).toBe(true);
    expect(result.contribution.toDecimalString()).toBe('94500.00');
  });

  it('keeps a cost filed against the whole order off every line', () => {
    const result = orderCosting({
      lines: [
        line({ lineId: 'a', billed: tk('100000') }),
        line({ lineId: 'b', lineNo: 2, billed: tk('50000') }),
      ],
      orderLevel: { transport: tk('6000'), otherDirect: tk('1500'), selling: ZERO },
    });
    expect(result.lines.every((l) => l.directCost.isZero())).toBe(true);
    expect(result.orderLevel.directCost.toDecimalString()).toBe('7500.00');
    expect(result.directCost.toDecimalString()).toBe('7500.00');
    expect(result.contribution.toDecimalString()).toBe('142500.00');
  });

  it('takes commission off below the direct cost, as the profit statement does', () => {
    const result = orderCosting({
      lines: [line({ billed: tk('100000'), dyeingBilled: tk('60000'), selling: tk('2000') })],
      orderLevel: { transport: ZERO, otherDirect: ZERO, selling: tk('1000') },
    });
    expect(result.directCost.toDecimalString()).toBe('60000.00');
    expect(result.sellingCost.toDecimalString()).toBe('3000.00');
    expect(result.contribution.toDecimalString()).toBe('37000.00');
  });

  it('shows work ordered and not yet billed rather than letting the order look cheap', () => {
    const result = orderCosting({
      lines: [
        line({
          billed: tk('100000'),
          knittingOrdered: tk('12000'),
          knittingBilled: tk('5000'),
          dyeingOrdered: tk('40000'),
        }),
      ],
      orderLevel: noOrderLevel,
    });
    expect(result.unbilledCommitment.toDecimalString()).toBe('47000.00');
    // A subcontractor that billed more than the WO said does not make the
    // commitment negative.
    const over = orderCosting({
      lines: [line({ knittingOrdered: tk('100'), knittingBilled: tk('150') })],
      orderLevel: noOrderLevel,
    });
    expect(over.unbilledCommitment.isZero()).toBe(true);
  });

  it('gives no percentage for a line with nothing billed yet', () => {
    const result = orderCosting({
      lines: [line({ yarnBilled: tk('40000') })],
      orderLevel: noOrderLevel,
    });
    expect(result.lines[0]!.contribution.toDecimalString()).toBe('-40000.00');
    expect(result.lines[0]!.contributionPercent).toBeNull();
    expect(result.contributionPercent).toBeNull();
  });

  it('works the booked value out exactly, with a six decimal rate', () => {
    // The bill book case from CLAUDE.md: 5141 kg at 125.228166 is 643,798.00.
    const result = orderCosting({
      lines: [line({ quantity: '5141', rate: '125.228166' })],
      orderLevel: noOrderLevel,
    });
    expect(result.bookedValue.toDecimalString()).toBe('643798.00');
  });
});

describe('orderStage', () => {
  const blank = {
    hasPurchaseOrder: false,
    hasKnittingOrder: false,
    hasDyeingOrder: false,
    billedToCustomer: false,
  };

  it('reads the furthest document reached', () => {
    expect(orderStage({ status: 'open', lines: [blank] })).toBe('booked');
    expect(
      orderStage({ status: 'open', lines: [{ ...blank, hasPurchaseOrder: true }] }),
    ).toBe('yarn_ordered');
    expect(
      orderStage({
        status: 'open',
        lines: [{ ...blank, hasPurchaseOrder: true, hasKnittingOrder: true }],
      }),
    ).toBe('in_knitting');
    expect(
      orderStage({
        status: 'open',
        lines: [blank, { ...blank, hasDyeingOrder: true }],
      }),
    ).toBe('in_dyeing');
  });

  it('calls an order billed only when every line is', () => {
    expect(
      orderStage({
        status: 'open',
        lines: [
          { ...blank, hasDyeingOrder: true, billedToCustomer: true },
          { ...blank, hasDyeingOrder: true },
        ],
      }),
    ).toBe('in_dyeing');
    expect(
      orderStage({
        status: 'open',
        lines: [
          { ...blank, billedToCustomer: true },
          { ...blank, billedToCustomer: true },
        ],
      }),
    ).toBe('billed');
  });

  it('lets a person close or cancel an order whatever its documents say', () => {
    expect(orderStage({ status: 'closed', lines: [blank] })).toBe('closed');
    expect(
      orderStage({
        status: 'cancelled',
        lines: [{ ...blank, billedToCustomer: true }],
      }),
    ).toBe('cancelled');
  });

  it('treats an order with no lines as booked, not billed', () => {
    expect(orderStage({ status: 'open', lines: [] })).toBe('booked');
  });
});
