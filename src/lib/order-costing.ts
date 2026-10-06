import { lineAmount, sumMoney } from './amount';
import { marginPercent } from './costing';
import { Money } from './money';
import type { OrderCategory, OrderStatus } from './types';

/**
 * What one Sales Order earned and cost, line by line. Pure: no database, no
 * framework, and every figure is Money.
 *
 * The figures come from documents already in the book and are only added up
 * here: what the customer was billed, what the supplier billed for the yarn,
 * what the knitter and the dye house billed, and the expenses filed against
 * the order. Nothing is apportioned. A cost filed against the whole order
 * (freight, a lab test) stays on the order and is not split across its lines,
 * because there is no basis here to split it on, and a made up basis would
 * produce a made up line margin (CLAUDE.md section 7, limit 3).
 *
 * Overhead never reaches an order at all, for the same reason. The result
 * stops at contribution, as orderMargin in costing.ts does.
 *
 * Alongside each cost the amount ordered on a PO or WO is carried. An order
 * whose knitting is done and not yet billed would otherwise look cheap; seeing
 * Ordered beside Billed shows it is incomplete instead.
 */

export type OrderLineInput = {
  lineId: string;
  lineNo: number;
  category: OrderCategory;
  description: string;
  color: string | null;
  /** Booked quantity, kg text for fabric and dyeing. */
  quantity: string;
  /** Rate per unit, NUMERIC(12,6) text. */
  rate: string;
  /** Billed to the customer against this line. */
  billed: Money;
  /** Quantity billed to the customer, kg text. */
  billedQty: string;
  yarnOrdered: Money;
  yarnBilled: Money;
  knittingOrdered: Money;
  knittingBilled: Money;
  dyeingOrdered: Money;
  dyeingBilled: Money;
  /** Expenses filed against this line, by tier. */
  transport: Money;
  otherDirect: Money;
  selling: Money;
};

/** Costs filed against the order as a whole, not one of its lines. */
export type OrderLevelInput = {
  transport: Money;
  otherDirect: Money;
  selling: Money;
};

export type OrderLineResult = OrderLineInput & {
  bookedValue: Money;
  /** Every direct cost billed or paid against the line. */
  directCost: Money;
  contribution: Money;
  contributionPercent: string | null;
  /** Ordered on a PO or WO and not yet billed by the supplier or subcontractor. */
  unbilledCommitment: Money;
};

export type OrderResult = {
  lines: OrderLineResult[];
  orderLevel: OrderLevelInput & { directCost: Money };
  bookedValue: Money;
  billed: Money;
  directCost: Money;
  sellingCost: Money;
  contribution: Money;
  contributionPercent: string | null;
  unbilledCommitment: Money;
};

/** What was ordered and not yet billed, never below zero. */
function outstanding(ordered: Money, billed: Money): Money {
  const gap = ordered.subtract(billed);
  return gap.isNegative() ? Money.ZERO : gap;
}

export function orderCosting(input: {
  lines: OrderLineInput[];
  orderLevel: OrderLevelInput;
}): OrderResult {
  const lines = input.lines.map((line): OrderLineResult => {
    const bookedValue = lineAmount(line.quantity, line.rate);
    const directCost = sumMoney([
      line.yarnBilled,
      line.knittingBilled,
      line.dyeingBilled,
      line.transport,
      line.otherDirect,
    ]);
    const contribution = line.billed.subtract(directCost).subtract(line.selling);
    return {
      ...line,
      bookedValue,
      directCost,
      contribution,
      contributionPercent: marginPercent(contribution, line.billed),
      unbilledCommitment: sumMoney([
        outstanding(line.yarnOrdered, line.yarnBilled),
        outstanding(line.knittingOrdered, line.knittingBilled),
        outstanding(line.dyeingOrdered, line.dyeingBilled),
      ]),
    };
  });

  const orderLevelDirect = input.orderLevel.transport.add(
    input.orderLevel.otherDirect,
  );
  const billed = sumMoney(lines.map((line) => line.billed));
  const directCost = sumMoney(lines.map((line) => line.directCost)).add(
    orderLevelDirect,
  );
  const sellingCost = sumMoney(lines.map((line) => line.selling)).add(
    input.orderLevel.selling,
  );
  const contribution = billed.subtract(directCost).subtract(sellingCost);

  return {
    lines,
    orderLevel: { ...input.orderLevel, directCost: orderLevelDirect },
    bookedValue: sumMoney(lines.map((line) => line.bookedValue)),
    billed,
    directCost,
    sellingCost,
    contribution,
    contributionPercent: marginPercent(contribution, billed),
    unbilledCommitment: sumMoney(lines.map((line) => line.unbilledCommitment)),
  };
}

/**
 * Where an order has got to, read off its documents and never typed.
 *
 * A status somebody keys goes stale the first time they forget to change it,
 * and a pipeline built on it disagrees with the book. This one cannot: an order
 * is In Dyeing because a dyeing Work Order exists for it, and Billed because
 * every line has been billed to the customer.
 *
 * The order is at the furthest stage any of its documents has reached, except
 * Billed, which needs every line billed: a bill for one fabric of three does
 * not finish the order.
 */
export type OrderStage =
  | 'booked'
  | 'yarn_ordered'
  | 'in_knitting'
  | 'in_dyeing'
  | 'billed'
  | 'closed'
  | 'cancelled';

export const ORDER_STAGES: { value: OrderStage; label: string }[] = [
  { value: 'booked', label: 'Booked' },
  { value: 'yarn_ordered', label: 'Yarn Ordered' },
  { value: 'in_knitting', label: 'In Knitting' },
  { value: 'in_dyeing', label: 'In Dyeing' },
  { value: 'billed', label: 'Billed' },
  { value: 'closed', label: 'Closed' },
  { value: 'cancelled', label: 'Cancelled' },
];

export function orderStageLabel(stage: OrderStage): string {
  return ORDER_STAGES.find((s) => s.value === stage)?.label ?? stage;
}

export type OrderStageInput = {
  status: OrderStatus;
  lines: {
    hasPurchaseOrder: boolean;
    hasKnittingOrder: boolean;
    hasDyeingOrder: boolean;
    billedToCustomer: boolean;
  }[];
};

export function orderStage(input: OrderStageInput): OrderStage {
  if (input.status === 'cancelled') return 'cancelled';
  if (input.status === 'closed') return 'closed';
  const { lines } = input;
  if (lines.length > 0 && lines.every((line) => line.billedToCustomer)) {
    return 'billed';
  }
  if (lines.some((line) => line.hasDyeingOrder)) return 'in_dyeing';
  if (lines.some((line) => line.hasKnittingOrder)) return 'in_knitting';
  if (lines.some((line) => line.hasPurchaseOrder)) return 'yarn_ordered';
  return 'booked';
}
