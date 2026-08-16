import Link from 'next/link';
import { CategoryBarChart } from '@/components/charts/CategoryBarChart';
import { CostSplitDonut } from '@/components/charts/CostSplitDonut';
import { TradingSummary } from '@/components/TradingSummary';
import { GroupedMonthChart } from '@/components/charts/GroupedMonthChart';
import { DataTable } from '@/components/DataTable';
import { Button, Card, CardHeader, PageTitle, StatTile } from '@/components/ui';
import {
  DASHBOARD_RANGES,
  type DashboardRange,
  datum,
  foldToTop,
  isDashboardRange,
  monthsBetween,
  rangeFor,
  shortMonth,
} from '@/lib/dashboard';
import { profitStatement, type CostLine } from '@/lib/costing';
import { formatDate, todayInDhaka } from '@/lib/dates';
import { formatTaka } from '@/lib/format';
import { Money } from '@/lib/money';
import {
  listEmployeeBalances,
  listPartyBalances,
  monthlyMovement,
  monthlyTrading,
  receivableAgeing,
  profitFigures,
} from '@/lib/queries';
import { copyFor, type Side } from '@/lib/side';
import {
  expenseCategoryLabel,
  expenseCategoryTier,
  natureOfWorkLabel,
  type PartyBalance,
} from '@/lib/types';

function outstanding(balances: PartyBalance[]): PartyBalance[] {
  return balances
    .filter((row) => !row.balance.isZero())
    .sort((a, b) => b.balance.compare(a.balance));
}

function total(balances: PartyBalance[]): Money {
  return balances.reduce((sum, row) => sum.add(row.balance), Money.ZERO);
}

function OutstandingCard({
  side,
  balances,
}: {
  side: Side;
  balances: PartyBalance[];
}) {
  const copy = copyFor(side);
  const rows = outstanding(balances).slice(0, 8);

  return (
    <Card>
      <CardHeader
        title={`${copy.partyPlural} ${copy.outstandingWord}`}
        action={
          <Link
            href={`/${side}`}
            className="text-sm text-[var(--color-navy)] hover:underline"
          >
            View All
          </Link>
        }
      />
      <DataTable
        columns={[
          {
            key: 'party',
            head: copy.partyWord,
            phone: 'title',
            cell: (row) => (
              <Link
                href={`/${side}/statement/${row.party.code ?? row.party.id}`}
                className="text-[var(--color-navy)] hover:underline"
              >
                {row.party.name}
              </Link>
            ),
          },
          {
            key: 'lastActivity',
            head: 'Last Entry',
            cellClassName: 'text-[var(--color-muted)]',
            phone: 'meta',
            cell: (row) => formatDate(row.lastActivity) || 'No entries',
          },
          {
            key: 'balance',
            head: copy.balanceWord,
            numeric: true,
            cell: (row) => formatTaka(row.balance),
          },
        ]}
        rows={rows}
        rowKey={(row) => row.party.id}
        empty="Nothing outstanding"
      />
    </Card>
  );
}

/**
 * The period filter: the three periods actually asked for, and any two dates.
 *
 * The presets are plain links carrying a search param rather than a client
 * component, so the page stays a server component: the choice survives a
 * reload, it can be bookmarked, and no chart data is fetched from the browser.
 * The custom range is a GET form for the same reason.
 *
 * It is drawn to sit in the screen head, which is pinned, so the labels are
 * dropped at md and the two dates carry their own meaning through the pair and
 * the button beside them. A head that has to stay short cannot afford a caption
 * over every field.
 */
function RangeFilter({
  active,
  from,
  to,
  custom,
}: {
  active: DashboardRange;
  from: string;
  to: string;
  custom: boolean;
}) {
  const CONTROL =
    'min-h-11 w-full rounded border border-[var(--color-rule)] bg-white px-3 py-2.5 text-base sm:w-auto md:min-h-0 md:h-[26px] md:px-2 md:py-0 md:text-[12.5px]';

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
      <div className="flex flex-wrap items-center gap-1">
        {DASHBOARD_RANGES.map((range) => (
          <Link
            key={range.value}
            href={range.value === 'last12' ? '/' : `/?range=${range.value}`}
            className={`inline-flex min-h-11 items-center rounded border px-3 text-sm md:h-[26px] md:min-h-0 md:px-2.5 md:text-[12px] ${
              !custom && range.value === active
                ? 'border-[var(--color-navy)] bg-[var(--color-navy)] text-white'
                : 'border-[var(--color-rule)] bg-white hover:bg-[var(--color-surface-2)]'
            }`}
          >
            {range.label}
          </Link>
        ))}
      </div>

      <form className="flex flex-wrap items-center gap-1.5">
        <label className="block w-full sm:w-auto">
          <span className="mb-1 block text-xs font-medium md:hidden">From</span>
          <input
            type="date"
            name="from"
            defaultValue={from}
            aria-label="From"
            className={CONTROL}
          />
        </label>
        <span className="hidden text-[12px] text-[var(--color-ink-3)] md:inline">
          to
        </span>
        <label className="block w-full sm:w-auto">
          <span className="mb-1 block text-xs font-medium md:hidden">To</span>
          <input
            type="date"
            name="to"
            defaultValue={to}
            aria-label="To"
            className={CONTROL}
          />
        </label>
        {/* The standard size, not `filter`: this row's CONTROL is already the
            26px one, so the button lines up with the two date fields as is. */}
        <Button variant="secondary" block>
          Apply
        </Button>
      </form>
    </div>
  );
}

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string; from?: string; to?: string }>;
}) {
  const params = await searchParams;
  const requested = params.range;
  const range: DashboardRange =
    requested && isDashboardRange(requested) ? requested : 'last12';

  const today = todayInDhaka();
  const preset = rangeFor(range, today);

  // Two dates beat a preset when both are given and readable. Keyed backwards
  // is a typo, not an empty dashboard, so they swap rather than showing zeroes.
  const askedFrom =
    params.from && DATE_PATTERN.test(params.from) ? params.from : null;
  const askedTo = params.to && DATE_PATTERN.test(params.to) ? params.to : null;
  const custom = Boolean(askedFrom && askedTo);
  const from = custom
    ? askedFrom! <= askedTo!
      ? askedFrom!
      : askedTo!
    : preset.from;
  const to = custom ? (askedFrom! <= askedTo! ? askedTo! : askedFrom!) : preset.to;

  const rangeLabel = custom
    ? `${formatDate(from)} to ${formatDate(to)}`
    : (DASHBOARD_RANGES.find((r) => r.value === range)?.label ?? '');

  const [
    customers,
    subcontractors,
    movement,
    ageing,
    employees,
    figures,
    tradingByMonth,
  ] = await Promise.all([
    listPartyBalances('customer'),
    listPartyBalances('subcontractor'),
    monthlyMovement('customer', from, to),
    receivableAgeing(today),
    listEmployeeBalances(),
    profitFigures(from, to),
    monthlyTrading(from, to),
  ]);

  // Every cost arrives with the tier its category carries, and the statement
  // only sorts them. Nothing here decides what kind of cost something is.
  const costs: CostLine[] = [
    ...figures.subcontract.map((row) => ({
      label: natureOfWorkLabel(row.natureOfWork),
      amount: row.amount,
      tier: 'direct' as const,
    })),
    ...figures.expenses.map((row) => ({
      label: expenseCategoryLabel(row.category),
      amount: row.amount,
      tier: expenseCategoryTier(row.category),
    })),
    { label: 'Salary', amount: figures.salary, tier: 'operating' as const },
    // Reimbursed claims are money out of the business like any other. For a
    // while nothing counted them and the net result was too high by the lot.
    {
      label: 'Reimbursed Claims',
      amount: figures.claims,
      tier: 'operating' as const,
    },
  ].filter((line) => !line.amount.isZero());

  const result = profitStatement({ revenue: figures.revenue, costs });

  // The three tiers the categories already sort themselves into, which is what
  // makes this a part to whole worth drawing as a ring. Nothing here decides
  // what kind of cost something is: costing.ts did that from the category.
  const costOut = result.directCost
    .add(result.sellingCost)
    .add(result.operatingCost);
  const costSplit = [
    datum('Cost of Sales', result.directCost),
    datum('Selling Cost', result.sellingCost),
    datum('Overhead', result.operatingCost),
  ].filter((point) => point.value > 0);

  const receivable = total(customers);
  const payable = total(subcontractors);
  const advances = employees.reduce(
    (sum, employee) => sum.add(employee.advanceOutstanding),
    Money.ZERO,
  );

  // Every month in the range, so a quiet month is a gap rather than a column
  // the axis quietly leaves out.
  const months = monthsBetween(from, to);
  const byPeriod = new Map(movement.map((row) => [row.period, row]));
  const movementPoints = months.map((period) => {
    const row = byPeriod.get(period);
    const billed = row?.billed ?? Money.ZERO;
    const settled = row?.settled ?? Money.ZERO;
    return {
      label: shortMonth(period),
      billed: datum(period, billed).value,
      billedDisplay: formatTaka(billed),
      settled: datum(period, settled).value,
      settledDisplay: formatTaka(settled),
    };
  });

  // Revenue, what it cost, and what was left, a month at a time. The margin is
  // subtracted as Money and only then handed over as a bar length.
  const tradingByPeriod = new Map(tradingByMonth.map((row) => [row.period, row]));
  const marginPoints = months.map((period) => {
    const row = tradingByPeriod.get(period);
    const revenue = row?.revenue ?? Money.ZERO;
    const directCost = row?.directCost ?? Money.ZERO;
    const margin = revenue.subtract(directCost);
    return {
      label: shortMonth(period),
      revenue: datum(period, revenue).value,
      revenueDisplay: formatTaka(revenue),
      directCost: datum(period, directCost).value,
      directCostDisplay: formatTaka(directCost),
      margin: datum(period, margin).value,
      marginDisplay: formatTaka(margin),
    };
  });

  // Where the money went, which is every cost regardless of tier: salary and
  // reimbursed claims included, because leaving either off would make the chart
  // say the wrong thing about where the money actually goes.
  const cashOut = foldToTop(
    costs.map((line) => ({ label: line.label, amount: line.amount })),
  );
  const cashOutTotal = result.directCost
    .add(result.sellingCost)
    .add(result.operatingCost);

  const topParties = outstanding(customers)
    .slice(0, 6)
    .map((row) => datum(row.party.name, row.balance));

  const ageingPoints = ageing.map((row) => datum(row.bucket, row.amount));

  return (
    <>
      {/* The period sits in the head, beside the title, and pins with it. It is
          what every figure below is computed over, so scrolling to a chart and
          not being able to see which months it covers is the one thing this
          screen must not do. */}
      <PageTitle
        title="Dashboard"
        subtitle="Outstanding on both sides, and where the money went, computed from the entries made."
        controls={
          <RangeFilter active={range} from={from} to={to} custom={custom} />
        }
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label="Receivable from Customers"
          value={formatTaka(receivable)}
          note={`${outstanding(customers).length} of ${customers.length} customers`}
        />
        <StatTile
          label="Payable to Subcontractors"
          value={formatTaka(payable)}
          note={`${outstanding(subcontractors).length} of ${subcontractors.length} subcontractors`}
        />
        <StatTile
          label="Gross Margin"
          value={formatTaka(result.grossMargin)}
          note={
            result.grossMarginPercent
              ? `${result.grossMarginPercent} of billing, ${rangeLabel.toLowerCase()}`
              : `Nothing billed, ${rangeLabel.toLowerCase()}`
          }
        />
        <StatTile
          label={result.netResult.isNegative() ? 'Net Loss' : 'Net Result'}
          value={formatTaka(result.netResult)}
          note="After commission, expenses and salary"
        />
        <StatTile
          label="Net Position"
          value={formatTaka(receivable.subtract(payable))}
          note="Receivable less payable"
        />
        <StatTile
          label="Cash Out"
          value={formatTaka(cashOutTotal)}
          note={`Expenses and salary, ${rangeLabel.toLowerCase()}`}
        />
        <StatTile
          label="Advances Outstanding"
          value={formatTaka(advances)}
          note="Still to come back out of a salary"
        />
      </div>

      <div className="mb-4 grid gap-4 lg:grid-cols-2">
        <TradingSummary result={result} rangeLabel={rangeLabel} />

        <GroupedMonthChart
          title="Margin by Month"
          note="What was billed out, what the subcontractors billed for it, and what was left. One month moves around because the two bills can fall in different months; the trend is what to read."
          series={[
            { key: 'revenue', label: 'Billed Out' },
            { key: 'directCost', label: 'Subcontract Cost' },
            { key: 'margin', label: 'Gross Margin' },
          ]}
          points={marginPoints}
        />

        <GroupedMonthChart
          title="Billed and Received"
          note={`Customer bills raised against money received, ${rangeLabel.toLowerCase()}. Axis figures are in lakh; the exact amount is in the tooltip and the table.`}
          series={[
            { key: 'billed', label: 'Billed' },
            { key: 'settled', label: 'Received' },
          ]}
          points={movementPoints}
        />

        <CostSplitDonut
          title="Where the Money Went"
          note={`Every cost in the period by the tier its category carries, ${rangeLabel.toLowerCase()}. Cost of sales is the dyeing bought in; overhead is never split across orders.`}
          points={costSplit}
          total={formatTaka(costOut)}
        />

        <CategoryBarChart
          title="Cash Out by Category"
          note={`Operating expenses and salary paid, ${rangeLabel.toLowerCase()}.`}
          columnLabel="Category"
          valueLabel="Amount"
          points={cashOut}
        />

        <CategoryBarChart
          title="Receivable Ageing"
          note={`How old the money owed is, counted from the bill date as at ${formatDate(today)}. Receipts are applied to the oldest bill first.`}
          columnLabel="Age"
          valueLabel="Receivable"
          points={ageingPoints}
          singleColor
          emptyMessage="Nothing outstanding"
        />

        <CategoryBarChart
          title="Customers by Balance"
          note="The largest amounts owed, whatever period is selected above."
          columnLabel="Customer"
          valueLabel="Receivable"
          points={topParties}
          singleColor
          emptyMessage="Nothing outstanding"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <OutstandingCard side="customers" balances={customers} />
        <OutstandingCard side="subcontractors" balances={subcontractors} />
      </div>
    </>
  );
}
