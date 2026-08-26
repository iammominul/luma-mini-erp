import Link from 'next/link';
import { CategoryBarChart } from '@/components/charts/CategoryBarChart';
import { GroupedMonthChart } from '@/components/charts/GroupedMonthChart';
import { DataTable } from '@/components/DataTable';
import {
  Band,
  Button,
  Card,
  CardHeader,
  FigureRows,
  PageTitle,
  type StatDelta,
  StatTile,
} from '@/components/ui';
import { marginPercent } from '@/lib/costing';
import {
  DASHBOARD_RANGES,
  type DashboardRange,
  datum,
  foldToTop,
  isDashboardRange,
  monthsBetween,
  previousRange,
  rangeFor,
  shortMonth,
} from '@/lib/dashboard';
import { formatDate, todayInDhaka } from '@/lib/dates';
import { formatTaka } from '@/lib/format';
import { Money } from '@/lib/money';
import { statementFor } from '@/lib/profit';
import {
  bookSpan,
  cashMovements,
  listPartyBalances,
  monthlyMovement,
  monthlyTrading,
  receivableAgeing,
} from '@/lib/queries';
import { buildCashBook } from '@/lib/cashbook';
import { buildCashFlow } from '@/lib/cashflow';
import { can } from '@/lib/permissions';
import { requireUser } from '@/lib/session';
import { copyFor, type Side } from '@/lib/side';
import { type PartyBalance } from '@/lib/types';

function outstanding(balances: PartyBalance[]): PartyBalance[] {
  return balances
    .filter((row) => !row.balance.isZero())
    .sort((a, b) => b.balance.compare(a.balance));
}

function total(balances: PartyBalance[]): Money {
  return balances.reduce((sum, row) => sum.add(row.balance), Money.ZERO);
}

/**
 * How a period figure moved against the same length of time before it.
 *
 * A figure on its own does not say whether it is good, and this is the cheapest
 * thing that does. The change is worked out as Money and the share through
 * marginPercent, which already rounds at the tenth and stays off the floats.
 *
 * Nothing is shown unless the previous period is a positive figure. A share of
 * zero has no meaning, and a share of a previous loss comes back with its sign
 * turned around, so a recovery from a loss would print as a fall. Saying
 * nothing is the answer that cannot mislead.
 *
 * `tone` is the caller's answer to "is up good here". A cost is neutral: paint
 * it green because the number rose and the screen is lying quietly.
 */
function deltaOf(
  current: Money,
  previous: Money,
  tone: StatDelta['tone'] = 'good-up',
): StatDelta | undefined {
  if (previous.isZero() || previous.isNegative()) return undefined;
  const change = current.subtract(previous);
  if (change.isZero()) {
    return { text: '0.0%', label: 'vs previous period', tone: 'neutral' };
  }
  const share = marginPercent(change, previous);
  if (!share) return undefined;
  return {
    text: change.isNegative() ? share : `+${share}`,
    label: 'vs previous period',
    tone,
  };
}

/** The link out of a section, to the report that owns the figures in it. */
function SectionLink({ href }: { href: string }) {
  return (
    <Link
      href={href}
      className="text-[11px] font-medium uppercase tracking-[0.06em] text-[var(--color-navy)] hover:underline"
    >
      Open Report
    </Link>
  );
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

  // Two dates beat a preset when both are given and readable. Keyed backwards
  // is a typo, not an empty dashboard, so they swap rather than showing zeroes.
  const askedFrom =
    params.from && DATE_PATTERN.test(params.from) ? params.from : null;
  const askedTo = params.to && DATE_PATTERN.test(params.to) ? params.to : null;
  const custom = Boolean(askedFrom && askedTo);

  // All Dates is the one preset that cannot be worked out from the calendar, so
  // it costs a round trip to ask the book how far back it goes. Only that view
  // pays it, and it has to be paid before the rest: every query below is read
  // over the range this settles.
  const span = range === 'allDates' && !custom ? await bookSpan() : null;
  const preset = rangeFor(range, today, span);

  const from = custom
    ? askedFrom! <= askedTo!
      ? askedFrom!
      : askedTo!
    : preset.from;
  const to = custom
    ? askedFrom! <= askedTo!
      ? askedTo!
      : askedFrom!
    : preset.to;

  const rangeLabel = custom
    ? `${formatDate(from)} to ${formatDate(to)}`
    : (DASHBOARD_RANGES.find((r) => r.value === range)?.label ?? '');

  // The period before this one, the same number of days long, for the change
  // shown against each period figure. It is read in the same batch, so it costs
  // no extra wait.
  const before = previousRange(from, to);

  const [
    customers,
    subcontractors,
    movement,
    ageing,
    result,
    priorResult,
    tradingByMonth,
  ] = await Promise.all([
    listPartyBalances('customer'),
    listPartyBalances('subcontractor'),
    monthlyMovement('customer', from, to),
    receivableAgeing(today),
    // The statement is assembled in profit.ts and nowhere else, so this screen,
    // the Profit Statement report and the PDF cannot disagree about what a cost
    // is or which tier it belongs to.
    statementFor(from, to),
    statementFor(before.from, before.to),
    monthlyTrading(from, to),
  ]);

  // The cash position, and only for a role entitled to it. It is a balance as
  // of today over the whole book rather than a figure for the range, so the
  // Cash Book is read with no bounds and everything folds into the opening.
  const user = await requireUser();
  const mayReadFunds = can(user.role, 'fund:read');
  const cash = mayReadFunds ? await cashMovements() : [];
  const cashPosition = buildCashBook({ movements: cash, to: today }).closing;
  // Grouped over the range, which is a different question from the position
  // above: what moved in the period against what is held right now.
  const flow = mayReadFunds
    ? buildCashFlow({ movements: cash, from, to })
    : null;

  // The statement already sorted every cost into its tier. Put them back in one
  // list for the charts that draw all of them together.
  const costs = [
    ...result.directLines,
    ...result.sellingLines,
    ...result.operatingLines,
  ];

  const receivable = total(customers);
  const payable = total(subcontractors);

  /**
   * The oldest of the receivable, as the composition line on that tile.
   *
   * It says "over 60 days" and never "overdue". Nothing in this book records a
   * payment term, so it can say how old money is and cannot say that it is
   * late. The share is of what the ageing itself covers, which is the posted
   * bills, and not of the tile's own figure: a party's opening balance is in
   * the balance and is not aged, so the two are the same only while every
   * opening balance is zero.
   */
  const unpaidBills = ageing.reduce(
    (sum, row) => sum.add(row.amount),
    Money.ZERO,
  );
  const overSixtyDays = ageing
    .filter(
      (row) => row.bucket === '61 to 90 Days' || row.bucket === 'Over 90 Days',
    )
    .reduce((sum, row) => sum.add(row.amount), Money.ZERO);
  const overSixtyShare = marginPercent(overSixtyDays, unpaidBills);
  const ageingNote = overSixtyDays.isZero()
    ? 'Nothing over 60 days'
    : `Over 60 days: ${formatTaka(overSixtyDays)}${
        overSixtyShare ? ` (${overSixtyShare} of unpaid bills)` : ''
      }`;

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

  // Revenue, what it cost, and what was left, a month at a time. The cost is
  // the whole direct tier, the same one the tile above takes off, so the months
  // add up to the gross margin beside them. The margin is subtracted as Money
  // and only then handed over as a bar length.
  const tradingByPeriod = new Map(
    tradingByMonth.map((row) => [row.period, row]),
  );
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

  // Every cost in the period regardless of tier, the dyeing bought in included:
  // leaving any of it off would make the chart say the wrong thing about what
  // the period cost.
  const costByCategory = foldToTop(
    costs.map((line) => ({ label: line.label, amount: line.amount })),
  );

  const ageingPoints = ageing.map((row) => datum(row.bucket, row.amount));

  return (
    <>
      <PageTitle
        title="Dashboard"
        asOf={`As at ${formatDate(today)}`}
        controls={
          <RangeFilter active={range} from={from} to={to} custom={custom} />
        }
      />

      {/* Four figures lead, and they are the four a person opens this screen
          for: what is owed to us, what we owe, what we are holding, and whether
          the trading made anything. Everything else is a section under them
          with its own heading and its own way through to the report that owns
          it. Net Position is not up here: it is Receivable minus Payable, both
          of which are already in the row, so a tile for it repeats two figures
          the eye has just read. */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label="Receivable"
          value={formatTaka(receivable)}
          note={`${outstanding(customers).length} customers | ${ageingNote}`}
        />
        <StatTile
          label="Payable"
          value={formatTaka(payable)}
          note={`${outstanding(subcontractors).length} subcontractors`}
        />
        {mayReadFunds ? (
          <StatTile
            label="Cash and Bank"
            value={formatTaka(cashPosition)}
            note="Cash and bank, as keyed"
          />
        ) : (
          <StatTile
            label="Net Position"
            value={formatTaka(receivable.subtract(payable))}
            note="Receivable less payable"
          />
        )}
        <StatTile
          label={result.netResult.isNegative() ? 'Net Loss' : 'Net Result'}
          value={formatTaka(result.netResult)}
          note={rangeLabel}
          delta={deltaOf(result.netResult, priorResult.netResult)}
        />
      </div>

      <div className="mt-2">
        <Band title="Trading" action={<SectionLink href="/reports" />}>
          <div className="grid gap-4 lg:grid-cols-2">
            <FigureRows
              rows={[
                { label: 'Billed', value: formatTaka(result.revenue) },
                {
                  label: 'Cost of Sales',
                  value: formatTaka(result.directCost),
                },
                {
                  label: 'Gross Margin',
                  value: formatTaka(result.grossMargin),
                  note: result.grossMarginPercent ?? undefined,
                },
                {
                  label: 'Operating Cost',
                  value: formatTaka(
                    result.sellingCost.add(result.operatingCost),
                  ),
                },
                {
                  label: result.netResult.isNegative()
                    ? 'Net Loss'
                    : 'Net Result',
                  value: formatTaka(result.netResult),
                  note: result.netResultPercent ?? undefined,
                  strong: true,
                },
              ]}
            />
            <GroupedMonthChart
              title="Margin by Month"
              series={[
                { key: 'revenue', label: 'Billed Out' },
                { key: 'directCost', label: 'Cost of Sales' },
                { key: 'margin', label: 'Gross Margin' },
              ]}
              points={marginPoints}
            />
          </div>
        </Band>

        {mayReadFunds && flow ? (
          <Band
            title="Money Movement"
            action={<SectionLink href="/reports/cash-flow" />}
          >
            <div className="grid gap-4 lg:grid-cols-2">
              <FigureRows
                rows={[
                  {
                    label: 'Opening',
                    value: formatTaka(flow.opening),
                    muted: true,
                  },
                  { label: 'Money In', value: formatTaka(flow.totalIn) },
                  { label: 'Money Out', value: formatTaka(flow.totalOut) },
                  {
                    label: 'Net from Trading',
                    value: formatTaka(flow.groups[0]!.net),
                  },
                  {
                    label: 'Net from Funding',
                    value: formatTaka(flow.groups[1]!.net),
                  },
                  {
                    label: 'Closing',
                    value: formatTaka(flow.closing),
                    strong: true,
                  },
                ]}
              />
              <GroupedMonthChart
                title="Billed and Received"
                series={[
                  { key: 'billed', label: 'Billed' },
                  { key: 'settled', label: 'Received' },
                ]}
                points={movementPoints}
              />
            </div>
          </Band>
        ) : null}

        <Band
          title="Cost by Category"
          action={<SectionLink href="/reports/expenses" />}
        >
          <CategoryBarChart
            title="Every Cost in the Period"
            columnLabel="Category"
            valueLabel="Amount"
            points={costByCategory}
          />
        </Band>

        <Band title="Outstanding">
          <div className="mb-4">
            <CategoryBarChart
              title="Receivable Ageing"
              columnLabel="Age"
              valueLabel="Receivable"
              points={ageingPoints}
              singleColor
              emptyMessage="Nothing outstanding"
            />
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <OutstandingCard side="customers" balances={customers} />
            <OutstandingCard side="subcontractors" balances={subcontractors} />
          </div>
        </Band>
      </div>
    </>
  );
}
