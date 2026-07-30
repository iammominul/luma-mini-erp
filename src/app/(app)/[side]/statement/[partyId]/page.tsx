import Link from 'next/link';
import { notFound } from 'next/navigation';
import { amountInWords, formatTaka } from '@/lib/format';
import { Letterhead, SignatureBlock } from '@/components/Letterhead';
import { PrintButton } from '@/components/PrintButton';
import { Card, Table, Td, Th } from '@/components/ui';
import { formatDate, todayInDhaka } from '@/lib/dates';
import { getParty, listMovements } from '@/lib/queries';
import { copyFor, isSide } from '@/lib/side';
import { buildStatement } from '@/lib/statement';
import { paymentModeLabel, settlementLabel } from '@/lib/types';

type Search = { from?: string; to?: string };

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const clean = (value: string | undefined): string | null =>
  value && DATE_PATTERN.test(value) ? value : null;

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

  const [party, movements, filters] = await Promise.all([
    getParty(partyId),
    listMovements(partyId),
    searchParams,
  ]);
  if (!party || party.type !== side) notFound();

  const from = clean(filters.from);
  const to = clean(filters.to);
  const statement = buildStatement({
    openingBalance: party.openingBalance,
    movements,
    from,
    to,
  });

  const period =
    from && to
      ? `${formatDate(from)} to ${formatDate(to)}`
      : from
        ? `From ${formatDate(from)}`
        : to
          ? `Up to ${formatDate(to)}`
          : 'All entries to date';

  return (
    <>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3 print:hidden">
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
            href={`/${side}/statement/${party.id}`}
            className="rounded border border-[var(--color-line)] bg-white px-3 py-1.5 text-sm hover:bg-gray-50"
          >
            All Entries
          </Link>
        </form>
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
          <PrintButton label="Print Statement" />
        </div>
      </div>

      <Card className="mx-auto max-w-5xl p-8 print:max-w-none print:border-0 print:p-0">
        <Letterhead
          documentTitle="Statement of Account"
          meta={[
            { label: 'Period', value: period },
            { label: 'Printed On', value: formatDate(todayInDhaka()) },
          ]}
        />

        <div className="mt-4 text-sm">
          <div className="text-xs uppercase tracking-wide text-[var(--color-muted)]">
            {copy.partyWord}
          </div>
          <div className="font-semibold">{party.name}</div>
          {party.address ? <div>{party.address}</div> : null}
          {party.phone ? <div>Phone: {party.phone}</div> : null}
        </div>

        <div className="mt-4 border border-[var(--color-line)]">
          <Table>
            <thead>
              <tr>
                <Th className="w-28">Date</Th>
                <Th>Particulars</Th>
                <Th>Reference</Th>
                <Th numeric className="w-32">
                  Bill Amount
                </Th>
                <Th numeric className="w-32">
                  {copy.settlementColumn}
                </Th>
                <Th numeric className="w-36">
                  {copy.balanceWord}
                </Th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <Td className="whitespace-nowrap">
                  {formatDate(from) || formatDate(party.openingAsOf)}
                </Td>
                <Td className="font-medium">Opening Balance</Td>
                <Td />
                <Td />
                <Td />
                <Td numeric className="font-medium">
                  {formatTaka(statement.opening)}
                </Td>
              </tr>
              {statement.rows.map((row) => (
                <tr key={`${row.kind}-${row.id}`}>
                  <Td className="whitespace-nowrap">{formatDate(row.date)}</Td>
                  <Td>
                    {row.kind === 'bill'
                      ? `${copy.billSingular} ${row.particulars}`
                      : `${settlementLabel(side)} by ${paymentModeLabel(row.particulars)}`}
                  </Td>
                  <Td className="text-[var(--color-muted)]">
                    {row.reference ?? ''}
                  </Td>
                  <Td numeric>{row.billed ? formatTaka(row.billed) : ''}</Td>
                  <Td numeric>{row.settled ? formatTaka(row.settled) : ''}</Td>
                  <Td numeric>{formatTaka(row.balance)}</Td>
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
                <Td colSpan={3}>Period Total</Td>
                <Td numeric>{formatTaka(statement.totalBilled)}</Td>
                <Td numeric>{formatTaka(statement.totalSettled)}</Td>
                <Td numeric>{formatTaka(statement.closing)}</Td>
              </tr>
            </tfoot>
          </Table>
        </div>

        <div className="mt-4 flex flex-wrap items-start justify-between gap-4 text-sm">
          <div className="max-w-xl">
            <span className="font-medium">In Words: </span>
            {amountInWords(statement.closing)}
          </div>
          <div className="border border-[var(--color-navy)] px-4 py-2 text-right">
            <div className="text-xs uppercase tracking-wide text-[var(--color-muted)]">
              {copy.balanceWord}
            </div>
            <div className="text-lg font-semibold">
              {formatTaka(statement.closing)}
            </div>
          </div>
        </div>

        {statement.closing.isNegative() ? (
          <p className="mt-2 text-xs text-[var(--color-muted)]">
            A negative balance means an advance is held{' '}
            {side === 'customer'
              ? 'from the customer'
              : 'with the subcontractor'}
            .
          </p>
        ) : null}

        <SignatureBlock left="Prepared By" right="Received and Accepted" />
      </Card>
    </>
  );
}
