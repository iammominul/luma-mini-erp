import { TradingSummary } from '@/components/TradingSummary';
import { DownloadButton, PageTitle, StatTile } from '@/components/ui';
import { formatTaka } from '@/lib/format';
import { statementFor } from '@/lib/profit';
import { RangePicker, rangeLabel, readRange } from './range';

export const dynamic = 'force-dynamic';

export default async function ProfitStatementPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const range = readRange(await searchParams);
  const statement = await statementFor(range.from, range.to);
  const label = rangeLabel(range);

  return (
    <>
      <PageTitle
        title="Profit Statement"
        subtitle="What was billed, what it cost, and what is left, for any range of dates."
        action={
          <DownloadButton
            href={`/reports/pdf?from=${range.from}&to=${range.to}`}
            variant="secondary"
          >
            Download PDF
          </DownloadButton>
        }
      />

      <RangePicker basePath="/reports" range={range} />

      <div className="mb-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Billed" value={formatTaka(statement.revenue)} note={label} />
        <StatTile
          label="Gross Margin"
          value={formatTaka(statement.grossMargin)}
          note={
            statement.grossMarginPercent
              ? `${statement.grossMarginPercent} of billing`
              : 'Nothing billed in this range'
          }
        />
        <StatTile
          label="Contribution"
          value={formatTaka(statement.contribution)}
          note="After commission"
        />
        <StatTile
          label={statement.netResult.isNegative() ? 'Net Loss' : 'Net Result'}
          value={formatTaka(statement.netResult)}
          note="After every cost recorded"
        />
      </div>

      <div className="max-w-3xl">
        <TradingSummary result={statement} rangeLabel={label} />
      </div>
    </>
  );
}
