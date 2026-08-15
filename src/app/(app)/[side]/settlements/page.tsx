import Link from 'next/link';
import { notFound } from 'next/navigation';
import { formatTaka } from '@/lib/format';
import { sumMoney } from '@/lib/amount';
import type { Column } from '@/components/DataTable';
import { DataTable } from '@/components/DataTable';
import { Card, DownloadIcon, PageTitle } from '@/components/ui';
import { formatDate } from '@/lib/dates';
import { listParties, listPayments } from '@/lib/queries';
import { copyFor, isSide } from '@/lib/side';
import { paymentModeLabel } from '@/lib/types';

type Search = { party?: string; from?: string; to?: string };

type Payment = Awaited<ReturnType<typeof listPayments>>[number];

// Built per side, because the headings and the download label are the side's
// words for the same thing.
function columnsFor(
  side: string,
  copy: ReturnType<typeof copyFor>,
): Column<Payment>[] {
  return [
    {
      key: 'date',
      head: 'Date',
      cellClassName: 'whitespace-nowrap',
      phone: 'meta',
      cell: (payment) => formatDate(payment.paidOn),
    },
    {
      key: 'party',
      head: copy.partyWord,
      phone: 'title',
      cell: (payment) => payment.partyName,
    },
    {
      key: 'mode',
      head: 'Mode',
      cell: (payment) => paymentModeLabel(payment.mode),
    },
    {
      key: 'reference',
      head: 'Reference',
      cellClassName: 'text-[var(--color-muted)]',
      cell: (payment) => payment.reference ?? '',
    },
    {
      key: 'amount',
      head: 'Amount',
      numeric: true,
      cell: (payment) => formatTaka(payment.amount),
    },
    {
      key: 'actions',
      head: '',
      phone: 'full',
      cell: (payment) => (
        <div className="flex items-center gap-1.5">
          <Link
            href={`/${side}/settlements/${payment.id}`}
            className="rounded border border-[var(--color-line)] bg-white px-2 py-1 text-xs font-medium hover:bg-gray-50"
          >
            Open
          </Link>
          <DownloadIcon
            href={`/${side}/settlements/${payment.id}/pdf`}
            label={`Download ${copy.settlementSingular} ${formatDate(payment.paidOn)}`}
          />
        </div>
      ),
    },
  ];
}

export default async function SettlementsPage({
  params,
  searchParams,
}: {
  params: Promise<{ side: string }>;
  searchParams: Promise<Search>;
}) {
  const { side } = await params;
  if (!isSide(side)) notFound();
  const copy = copyFor(side);
  const filters = await searchParams;

  const [parties, payments] = await Promise.all([
    listParties({ role: copy.role, includeInactive: true }),
    listPayments({
      direction: copy.paymentDirection,
      partyId: filters.party || null,
      from: filters.from || null,
      to: filters.to || null,
    }),
  ]);

  const total = sumMoney(payments.map((payment) => payment.amount));

  return (
    <>
      <PageTitle
        title={copy.settlementTitle}
        subtitle={
          copy.role === 'customer'
            ? 'Money received from customers against their bills.'
            : 'Money paid to subcontractors against their bills.'
        }
        action={
          <Link
            href={`/${side}/settlements/new`}
            className="inline-flex min-h-11 w-full items-center justify-center rounded bg-[var(--color-navy)] px-4 py-2.5 text-sm font-medium text-white hover:bg-[var(--color-navy-600)] sm:w-auto md:min-h-0 md:px-3 md:py-1.5"
          >
            New {copy.settlementSingular}
          </Link>
        }
      />

      <Card className="mb-4 p-3">
        <form className="flex flex-wrap items-end gap-3">
          <label className="block w-full sm:w-auto">
            <span className="mb-1 block text-xs font-medium">
              {copy.partyWord}
            </span>
            <select
              name="party"
              defaultValue={filters.party ?? ''}
              className="min-h-11 w-full rounded border border-[var(--color-line)] bg-white px-3 py-2.5 text-base sm:w-auto md:min-h-0 md:px-2.5 md:py-1.5 md:text-sm"
            >
              <option value="">All</option>
              {parties.map((party) => (
                <option key={party.id} value={party.id}>
                  {party.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block w-full sm:w-auto">
            <span className="mb-1 block text-xs font-medium">From</span>
            <input
              type="date"
              name="from"
              defaultValue={filters.from ?? ''}
              className="min-h-11 w-full rounded border border-[var(--color-line)] bg-white px-3 py-2.5 text-base sm:w-auto md:min-h-0 md:px-2.5 md:py-1.5 md:text-sm"
            />
          </label>
          <label className="block w-full sm:w-auto">
            <span className="mb-1 block text-xs font-medium">To</span>
            <input
              type="date"
              name="to"
              defaultValue={filters.to ?? ''}
              className="min-h-11 w-full rounded border border-[var(--color-line)] bg-white px-3 py-2.5 text-base sm:w-auto md:min-h-0 md:px-2.5 md:py-1.5 md:text-sm"
            />
          </label>
          <button className="inline-flex min-h-11 w-full items-center justify-center rounded bg-[var(--color-navy)] px-4 py-2.5 text-sm font-medium text-white hover:bg-[var(--color-navy-600)] sm:w-auto md:min-h-0 md:px-3 md:py-1.5">
            Apply
          </button>
          <Link
            href={`/${side}/settlements`}
            className="inline-flex min-h-11 w-full items-center justify-center rounded border border-[var(--color-line)] bg-white px-4 py-2.5 text-sm hover:bg-gray-50 sm:w-auto md:min-h-0 md:px-3 md:py-1.5"
          >
            Clear
          </Link>
        </form>
      </Card>

      <Card>
        <DataTable
          columns={columnsFor(side, copy)}
          rows={payments}
          rowKey={(payment) => payment.id}
          empty={`No ${copy.settlementTitle.toLowerCase()} recorded for this filter`}
          total={{
            label: `${payments.length} entries`,
            cells: { amount: formatTaka(total) },
          }}
        />
      </Card>
    </>
  );
}
