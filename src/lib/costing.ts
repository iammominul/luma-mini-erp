import { Money } from './money';
import type { CostTier } from './types';

/**
 * The profit statement and the per order margin. Pure: no database, no
 * framework.
 *
 * LUMA is a trader. It takes the order, subcontracts the knitting and the
 * dyeing, and bills the customer, so a subcontractor's bill is its cost of
 * sales. That is what makes a real margin computable from figures already in
 * the book, and it is why this module exists at all.
 *
 * The statement has three tiers, and the order they come off in is the point:
 *
 *   Billed to Customers
 *     less Direct Cost      knitting, dyeing, freight, lab testing
 *   = Gross Margin          how well the work was bought and sold
 *     less Selling Cost     commission paid to win the order
 *   = Contribution          what an order leaves toward the overhead
 *     less Operating Cost   salary, rent, staff travel, office
 *   = Net Result
 *
 * Gross margin is kept clear of commission on purpose. Commission varies with
 * revenue but says nothing about whether the dyeing was bought well, and mixing
 * the two hides the number that tells you how the trade itself is doing.
 */

/**
 * A cost line on the statement, already tiered.
 *
 * `note` says which book the figure came out of, which is what the Expense
 * Register prints beside each line. It is carried here so the register can read
 * the same list profit.ts builds instead of assembling a second one that drifts
 * from it.
 */
export type CostLine = {
  label: string;
  amount: Money;
  tier: CostTier;
  note?: string;
};

export type ProfitStatement = {
  revenue: Money;
  directCost: Money;
  directLines: CostLine[];
  grossMargin: Money;
  grossMarginPercent: string | null;
  sellingCost: Money;
  sellingLines: CostLine[];
  contribution: Money;
  contributionPercent: string | null;
  operatingCost: Money;
  operatingLines: CostLine[];
  netResult: Money;
  netResultPercent: string | null;
};

/**
 * A share of revenue as a percentage, to one decimal.
 *
 * Worked out on the integer poisha and never on a float: the division happens
 * once, scaled up by a thousand, and comes back down as text. A percentage is
 * not money, so it is a string for display and nothing computes from it.
 *
 * The last digit is rounded, not cut off. Integer division truncates, and a
 * margin of 25,00,511.00 on 98,24,508.00 billed is 25.45%, which was reading as
 * 25.4% while anybody checking it on a calculator got 25.5%. The half goes up on
 * the magnitude, so a loss rounds the same way a profit does and the sign is
 * carried separately.
 *
 * Null when there is no revenue to take a share of. Zero revenue with a cost
 * against it is not a minus infinity percent margin, it is a period with
 * nothing sold in it, and the screen should say so rather than print a figure.
 */
export function marginPercent(margin: Money, revenue: Money): string | null {
  if (revenue.isZero()) return null;
  const negative = margin.isNegative();
  const magnitude = negative ? -margin.poisha : margin.poisha;
  // Tenths of a percent, rounded half up: (m * 1000 / r) with half a tenth
  // added before the division, both sides doubled so the half stays an integer.
  const tenths = (magnitude * 2000n + revenue.poisha) / (revenue.poisha * 2n);
  const whole = tenths / 10n;
  const tenth = tenths % 10n;
  return `${negative ? '-' : ''}${whole}.${tenth}%`;
}

const sum = (lines: CostLine[]): Money =>
  lines.reduce((total, line) => total.add(line.amount), Money.ZERO);

/**
 * The whole statement, worked out once so the tiles, the table, the chart and
 * the PDF cannot disagree with each other.
 *
 * Every cost arrives already tiered and is only sorted here. Nothing in this
 * function decides what kind of cost something is: that belongs to the category
 * it was recorded under, in EXPENSE_CATEGORIES.
 */
export function profitStatement(input: {
  revenue: Money;
  costs: CostLine[];
}): ProfitStatement {
  const directLines = input.costs.filter((line) => line.tier === 'direct');
  const sellingLines = input.costs.filter((line) => line.tier === 'selling');
  const operatingLines = input.costs.filter(
    (line) => line.tier === 'operating',
  );

  const directCost = sum(directLines);
  const sellingCost = sum(sellingLines);
  const operatingCost = sum(operatingLines);

  const grossMargin = input.revenue.subtract(directCost);
  const contribution = grossMargin.subtract(sellingCost);
  const netResult = contribution.subtract(operatingCost);

  return {
    revenue: input.revenue,
    directCost,
    directLines,
    grossMargin,
    grossMarginPercent: marginPercent(grossMargin, input.revenue),
    sellingCost,
    sellingLines,
    contribution,
    contributionPercent: marginPercent(contribution, input.revenue),
    operatingCost,
    operatingLines,
    netResult,
    netResultPercent: marginPercent(netResult, input.revenue),
  };
}

/**
 * What one order earned, as far as this app can honestly say.
 *
 * It stops at contribution. Splitting rent and salary across orders needs an
 * absorption basis nothing here can choose, and a made up basis produces a made
 * up per order profit that somebody would then quote a customer from. An order
 * that covers its own direct and selling cost is contributing to the overhead,
 * and that is the true statement available.
 */
export type OrderMargin = {
  orderNo: string;
  revenue: Money;
  directCost: Money;
  sellingCost: Money;
  contribution: Money;
  contributionPercent: string | null;
};

export function orderMargin(input: {
  orderNo: string;
  revenue: Money;
  directCost: Money;
  sellingCost: Money;
}): OrderMargin {
  const contribution = input.revenue
    .subtract(input.directCost)
    .subtract(input.sellingCost);
  return {
    ...input,
    contribution,
    contributionPercent: marginPercent(contribution, input.revenue),
  };
}

/**
 * How much of a period's cost is actually pinned to an order.
 *
 * Per order costing is only as good as the keying: a freight bill entered with
 * no order reference does not make an order look cheaper, it makes it look
 * complete when it is not. So the order report states its own coverage, and a
 * reader can judge how much of the picture is there instead of trusting it.
 */
export function coverage(
  attributed: Money,
  total: Money,
): { percent: string | null; unattributed: Money } {
  return {
    percent: marginPercent(attributed, total),
    unattributed: total.subtract(attributed),
  };
}
