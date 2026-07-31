import Link from 'next/link';
import { notFound } from 'next/navigation';
import { formatTaka } from '@/lib/format';
import {
  Card,
  CardHeader,
  DownloadButton,
  StatTile,
  Table,
  Td,
  Th,
} from '@/components/ui';
import { formatDate, todayInDhaka } from '@/lib/dates';
import { findParty, listMovements } from '@/lib/queries';
import { copyFor, isSide } from '@/lib/side';
import {
  buildStatement,
  closingLabel,
  formatBalance,
  statementLabels,
} from '@/lib/statement';

type Search = { from?: string; to?: string };

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const clean = (value: string | undefined): string | null =>
  value && DATE_PATTERN.test(value) ? value : null;

/**
 * The Party Ledger: a running statement, computed on read. It reads the way the
 * people who receive it expect a ledger to read, Debit and Credit with a running
 * balance carrying Dr or Cr, and the official copy is the PDF download rather
 * than a print of this screen.
 */
export default async function StatementPage({
  params,
  searchParams,
}: {
  params: Promise<{ side: string; partyId: string }>;
  searchParams: Promise<Search>;
}) {
  const { side, partyId } = await params;
  if (!isSide(side)) notFound();
  const copy = copyFor(side);

  const [party, filters] = await Promise.all([
    findParty(partyId),
    searchParams,
  ]);
  if (!party || !party.roles[copy.role]) notFound();
  const movements = await listMovements(party.id);

  const from = clean(filters.from);
  const to = clean(filters.to);
  const statement = buildStatement({
    openingBalance: party.openingBalance,
    movements,
    from,
    to,
  });
  const labels = statementLabels(side);

  const period =
    from && to
      ? `${formatDate(from)} to ${formatDate(to)}`
      : from
        ? `From ${formatDate(from)}`
        : to
          ? `Up to ${formatDate(to)}`
          : 'All entries to date';

  const query = new URLSearchParams();
  if (from) query.set('from', from);
  if (to) query.set('to', to);
  // Links stay on the handle the URL already carries, so the address bar does
  // not change under the person using it.
  const handle = party.code ?? party.id;
  const pdfHref = `/${side}/statement/${handle}/pdf${
    query.size > 0 ? `?${query}` : ''
  }`;

  const billCount = statement.rows.filter((r) => r.kind === 'bill').length;
  const settlementCount = statement.rows.length - billCount;

  return (
    <>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold">Party Ledger: {party.name}</h1>
          <p className="mt-0.5 text-sm text-[var(--color-muted)]">
            {copy.partyWord} | {period} | As of {formatDate(todayInDhaka())}{' '}
            (Asia/Dhaka)
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={`/${side}/bills/new?party=${party.id}`}
            className="rounded border border-[var(--color-line)] bg-white px-3 py-1.5 text-sm font-medium hover:bg-gray-50"
          >
            New {copy.billSingular}
          </Link>
          <Link
            href={`/${side}/settlements/new?party=${party.id}`}
            className="rounded border border-[var(--color-line)] bg-white px-3 py-1.5 text-sm font-medium hover:bg-gray-50"
          >
            New {copy.settlementSingular}
          </Link>
          <DownloadButton href={pdfHref}>Party Ledger PDF</DownloadButton>
        </div>
      </div>

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label={closingLabel(statement.closing)}
          value={formatBalance(statement.closing)}
          note={
            statement.closing.isNegative() ? 'we owe them' : 'they owe us'
          }
        />
        <StatTile
          label={labels.billed}
          value={formatTaka(statement.totalBilled)}
          note={`${billCount} ${billCount === 1 ? 'bill' : 'bills'}`}
        />
        <StatTile
          label={labels.settled}
          value={formatTaka(statement.totalSettled)}
          note={`${settlementCount} ${
            settlementCount === 1
              ? copy.settlementSingular.toLowerCase()
              : copy.settlementTitle.toLowerCase()
          }`}
        />
        <StatTile
          label={labels.opening}
          value={formatBalance(statement.opening)}
          note={
            from
              ? `carried into ${formatDate(from)}`
              : party.openingAsOf
                ? `as of ${formatDate(party.openingAsOf)}`
                : 'brought forward'
          }
        />
      </div>

      <Card className="mb-4 p-3">
        <form className="flex flex-wrap items-end gap-3">
          <label className="block">
            <span className="mb-1 block text-xs font-medium">From</span>
            <input
              type="date"
              name="from"
              defaultValue={from ?? ''}
              className="rounded border border-[var(--color-line)] bg-white px-2.5 py-1.5 text-sm"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium">To</span>
            <input
              type="date"
              name="to"
              defaultValue={to ?? ''}
              className="rounded border border-[var(--color-line)] bg-white px-2.5 py-1.5 text-sm"
            />
          </label>
          <button className="rounded bg-[var(--color-navy)] px-3 py-1.5 text-sm font-medium text-white hover:bg-[var(--color-navy-600)]">
            Apply
          </button>
          <Link
            href={`/${side}/statement/${handle}`}
            className="rounded border border-[var(--color-line)] bg-white px-3 py-1.5 text-sm hover:bg-gray-50"
          >
            All Entries
          </Link>
        </form>
      </Card>

      <Card>
        <CardHeader title="Ledger Account" />
        <Table>
          <thead>
            <tr>
              <Th className="w-28">Date</Th>
              <Th className="w-32">Reference</Th>
              <Th>Particulars</Th>
              <Th numeric className="w-32">
                {labels.debit}
              </Th>
              <Th numeric className="w-32">
                {labels.credit}
              </Th>
              <Th numeric className="w-36">
                {labels.balance}
              </Th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <Td className="whitespace-nowrap">
                {formatDate(from) || formatDate(party.openingAsOf)}
              </Td>
              <Td />
              <Td className="font-medium">{labels.opening}</Td>
              <Td />
              <Td />
              <Td numeric className="font-medium">
                {formatBalance(statement.opening)}
              </Td>
            </tr>
            {statement.rows.map((row) => (
              <tr key={`${row.kind}-${row.id}`}>
                <Td className="whitespace-nowrap">{formatDate(row.date)}</Td>
                <Td className="text-[var(--color-muted)]">
                  {row.reference ?? ''}
                </Td>
                <Td>{row.particulars}</Td>
                <Td numeric>{row.debit ? formatTaka(row.debit) : ''}</Td>
                <Td numeric>{row.credit ? formatTaka(row.credit) : ''}</Td>
                <Td numeric>{formatBalance(row.balance)}</Td>
              </tr>
            ))}
            {statement.rows.length === 0 ? (
              <tr>
                <Td
                  colSpan={6}
                  className="text-center text-[var(--color-muted)]"
                >
                  No entries in this period
                </Td>
              </tr>
            ) : null}
          </tbody>
          <tfoot>
            <tr className="bg-[var(--color-canvas)] font-semibold">
              <Td colSpan={3}>Total</Td>
              <Td numeric>{formatTaka(statement.totalDebit)}</Td>
              <Td numeric>{formatTaka(statement.totalCredit)}</Td>
              <Td numeric>{formatBalance(statement.closing)}</Td>
            </tr>
          </tfoot>
        </Table>
        {statement.closing.isNegative() ? (
          <p className="border-t border-[var(--color-line)] px-4 py-2 text-xs text-[var(--color-muted)]">
            This closing balance is an advance held{' '}
            {side === 'customer'
              ? 'from the customer'
              : 'with the subcontractor'}
            .
          </p>
        ) : null}
      </Card>
    </>
  );
}
