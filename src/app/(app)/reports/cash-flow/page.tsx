import { Fragment } from 'react';
import Link from 'next/link';
import { Card, PageTitle, StatTile } from '@/components/ui';
import { buildCashFlow } from '@/lib/cashflow';
import { formatTaka } from '@/lib/format';
import { cashMovements } from '@/lib/queries';
import { requirePermission } from '@/lib/session';
import { RangePicker, rangeLabel, resolveRange } from '../range';

export const dynamic = 'force-dynamic';

/**
 * Where the money went, in one page.
 *
 * The Cash Book answers what happened in order, which nobody reads three
 * hundred rows of. This answers how much flowed and to what, which is the
 * question somebody actually opens the app with. Every line links through to
 * the Cash Book rows behind it.
 */
export default async function CashFlowPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; range?: string }>;
}) {
  await requirePermission('fund:read');
  const range = await resolveRange(await searchParams);
  const flow = buildCashFlow({
    movements: await cashMovements(),
    from: range.from,
    to: range.to,
  });
  const label = rangeLabel(range);

  const drill = (source: string) =>
    `/reports/cash-book?from=${range.from}&to=${range.to}&source=${source}`;

  return (
    <>
      <PageTitle
        title="Cash Flow"
        controls={<RangePicker basePath="/reports/cash-flow" range={range} />}
        asOf={label}
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Opening" value={formatTaka(flow.opening)} />
        <StatTile label="Money In" value={formatTaka(flow.totalIn)} />
        <StatTile label="Money Out" value={formatTaka(flow.totalOut)} />
        <StatTile label="Closing" value={formatTaka(flow.closing)} />
      </div>

      <Card className="max-w-3xl">
        <table className="w-full border-collapse text-sm md:text-[12.5px]">
          <tbody>
            <tr className="border-b border-[var(--color-rule)]">
              <td className="px-4 py-2 font-medium">Opening Cash and Bank</td>
              <td className="numeric px-4 py-2 text-right font-medium">
                {formatTaka(flow.opening)}
              </td>
            </tr>

            {flow.groups.map((group) => (
              <Fragment key={group.key}>
                <tr>
                  <td
                    colSpan={2}
                    className="px-4 pb-1 pt-4 text-[11px] font-semibold uppercase tracking-[0.09em] text-[var(--color-ink-3)]"
                  >
                    {group.label}
                  </td>
                </tr>

                {group.lines.length === 0 ? (
                  <tr>
                    <td
                      colSpan={2}
                      className="px-4 py-2 text-[var(--color-ink-3)]"
                    >
                      Nothing in this range
                    </td>
                  </tr>
                ) : (
                  group.lines.map((line) => (
                    <tr
                      key={line.source}
                      className="border-b border-[var(--color-rule-soft)]"
                    >
                      <td className="px-4 py-1.5">
                        <Link
                          href={drill(line.source)}
                          className="hover:underline"
                        >
                          {line.label}
                        </Link>
                      </td>
                      <td className="numeric px-4 py-1.5 text-right">
                        {line.direction === 'in' ? '' : '('}
                        {formatTaka(line.amount)}
                        {line.direction === 'in' ? '' : ')'}
                      </td>
                    </tr>
                  ))
                )}

                <tr className="border-b border-[var(--color-rule)]">
                  <td className="px-4 py-1.5 font-medium">
                    Net from {group.label}
                  </td>
                  <td className="numeric px-4 py-1.5 text-right font-medium">
                    {formatTaka(group.net)}
                  </td>
                </tr>
              </Fragment>
            ))}

            <tr className="border-b border-[var(--color-rule)]">
              <td className="px-4 py-2 font-medium">Net Movement</td>
              <td className="numeric px-4 py-2 text-right font-medium">
                {formatTaka(flow.netMovement)}
              </td>
            </tr>
            <tr>
              <td className="px-4 py-2 font-semibold">Closing Cash and Bank</td>
              <td className="numeric px-4 py-2 text-right font-semibold">
                {formatTaka(flow.closing)}
              </td>
            </tr>
          </tbody>
        </table>

        <p className="border-t border-[var(--color-rule-soft)] px-4 py-2 text-[11px] text-[var(--color-ink-3)]">
          Figures in brackets are money out. A transfer between cash and the
          bank is not a flow and is not counted. Cash Book has the rows.
        </p>
      </Card>
    </>
  );
}
