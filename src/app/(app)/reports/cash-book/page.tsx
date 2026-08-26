import Link from 'next/link';
import {
  Card,
  CardHeader,
  EmptyRow,
  PageTitle,
  StatTile,
  Table,
  Td,
  Th,
} from '@/components/ui';
import { buildCashBook, CASH_SOURCES, type CashSource } from '@/lib/cashbook';
import { formatDate } from '@/lib/dates';
import { formatTaka } from '@/lib/format';
import { cashMovements, openingBalance } from '@/lib/queries';
import { requirePermission } from '@/lib/session';
import { paymentModeLabel } from '@/lib/types';
import { todayInDhaka } from '@/lib/dates';
import { MoneyEntryForm } from '@/components/MoneyEntryForm';
import { setOpeningBalanceAction } from './actions';
import { RangePicker, rangeLabel, resolveRange } from '../range';

export const dynamic = 'force-dynamic';

/**
 * Every movement of cash in the book, in date order, with a running balance.
 *
 * The full ERP calls this the Day Book and opens it every evening. This is the
 * drill-down behind Cash Flow: that screen groups the figures, this one lists
 * the rows, and a line there links to this filtered by source.
 *
 * The whole book is read and the module folds everything before the range into
 * the opening, which is why the query takes no dates. Bounding them in SQL
 * would give a wrong opening rather than a short list.
 */

export default async function CashBookPage({
  searchParams,
}: {
  searchParams: Promise<{
    from?: string;
    to?: string;
    range?: string;
    source?: string;
  }>;
}) {
  await requirePermission('fund:read');
  const params = await searchParams;
  const range = await resolveRange(params);
  const [all, opening] = await Promise.all([
    cashMovements(),
    openingBalance(),
  ]);

  // One line of the Cash Flow, opened. The filter is applied before the book is
  // built, so the running balance is the running total of what is listed rather
  // than of rows that are not on the screen.
  const source =
    params.source && params.source in CASH_SOURCES
      ? (params.source as CashSource)
      : null;
  const movements = source
    ? all.filter((movement) => movement.source === source)
    : all;

  const book = buildCashBook({
    movements,
    from: range.from,
    to: range.to,
  });

  const label = rangeLabel(range);
  const base = `from=${range.from}&to=${range.to}`;

  return (
    <>
      <PageTitle
        title="Cash Book"
        asOf={label}
        controls={<RangePicker basePath="/reports/cash-book" range={range} />}
      />

      {source ? (
        <div className="mb-4">
          <Link
            href={`/reports/cash-book?${base}`}
            className="inline-block rounded border border-[var(--color-line)] bg-[var(--color-canvas)] px-3 py-1 text-sm hover:bg-white"
          >
            {CASH_SOURCES[source].label} only, clear
          </Link>
        </div>
      ) : null}

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Opening" value={formatTaka(book.opening)} />
        <StatTile label="Money In" value={formatTaka(book.totalIn)} />
        <StatTile label="Money Out" value={formatTaka(book.totalOut)} />
        <StatTile
          label="Closing"
          value={formatTaka(book.closing)}
        />
      </div>

      <Card>
        <CardHeader
          title="Cash and Bank"
          action={
            <span className="text-sm text-[var(--color-muted)]">
              {book.rows.length} {book.rows.length === 1 ? 'entry' : 'entries'}
            </span>
          }
        />
        <Table>
          <thead>
            <tr>
              <Th>Date</Th>
              <Th>Particulars</Th>
              <Th>Reference</Th>
              <Th>Method</Th>
              <Th numeric>In</Th>
              <Th numeric>Out</Th>
              <Th numeric>Balance</Th>
            </tr>
          </thead>
          <tbody>
            <tr className="font-medium">
              <Td colSpan={6}>Opening Balance</Td>
              <Td numeric>{formatTaka(book.opening)}</Td>
            </tr>
            {book.rows.length === 0 ? (
              <EmptyRow columns={7}>Nothing moved in this range</EmptyRow>
            ) : (
              book.rows.map((row) => (
                <tr key={row.id}>
                  <Td className="whitespace-nowrap">{formatDate(row.date)}</Td>
                  <Td>
                    <span className="text-[var(--color-muted)]">
                      {CASH_SOURCES[row.source].label}
                    </span>
                    {row.particulars ? `, ${row.particulars}` : ''}
                  </Td>
                  <Td className="whitespace-nowrap">
                    {row.href ? (
                      <Link href={row.href} className="underline">
                        {row.reference ?? 'Open'}
                      </Link>
                    ) : (
                      (row.reference ?? '')
                    )}
                  </Td>
                  <Td className="whitespace-nowrap text-[var(--color-muted)]">
                    {paymentModeLabel(row.mode)}
                  </Td>
                  <Td numeric>{row.moneyIn ? formatTaka(row.moneyIn) : ''}</Td>
                  <Td numeric>
                    {row.moneyOut ? formatTaka(row.moneyOut) : ''}
                  </Td>
                  <Td numeric>{formatTaka(row.balance)}</Td>
                </tr>
              ))
            )}
            <tr className="font-semibold">
              <Td colSpan={4}>Closing Balance</Td>
              <Td numeric>{formatTaka(book.totalIn)}</Td>
              <Td numeric>{formatTaka(book.totalOut)}</Td>
              <Td numeric>{formatTaka(book.closing)}</Td>
            </tr>
          </tbody>
        </Table>
        <p className="border-t border-[var(--color-rule-soft)] px-4 py-2 text-[11px] text-[var(--color-ink-3)]">
          As keyed. Not a bank reconciliation.
        </p>
      </Card>

      {/* Until the book is told what it opened on, every balance above is
          short by whatever was in hand on day one. It is set once, so the form
          goes away rather than sitting on the screen for years. */}
      {opening ? null : (
        <Card className="mt-4 max-w-xl">
          <CardHeader title="Set the Opening Balance" />
          <div className="p-4 pt-3">
            <MoneyEntryForm
              action={setOpeningBalanceAction}
              submitLabel="Save Opening Balance"
              today={todayInDhaka()}
            />
          </div>
        </Card>
      )}
    </>
  );
}
