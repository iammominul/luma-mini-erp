import Link from 'next/link';
import { notFound } from 'next/navigation';
import { formatTaka } from '@/lib/format';
import { sumMoney } from '@/lib/amount';
import {
  Card,
  DownloadIcon,
  EmptyRow,
  PageTitle,
  Table,
  Td,
  Th,
} from '@/components/ui';
import { formatDate } from '@/lib/dates';
import { listParties, listPayments } from '@/lib/queries';
import { copyFor, isSide } from '@/lib/side';
import { paymentModeLabel } from '@/lib/types';

type Search = { party?: string; from?: string; to?: string };

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
            className="rounded bg-[var(--color-navy)] px-3 py-1.5 text-sm font-medium text-white hover:bg-[var(--color-navy-600)]"
          >
            New {copy.settlementSingular}
          </Link>
        }
      />

      <Card className="mb-4 p-3">
        <form className="flex flex-wrap items-end gap-3">
          <label className="block">
            <span className="mb-1 block text-xs font-medium">
              {copy.partyWord}
            </span>
            <select
              name="party"
              defaultValue={filters.party ?? ''}
              className="rounded border border-[var(--color-line)] bg-white px-2.5 py-1.5 text-sm"
            >
              <option value="">All</option>
              {parties.map((party) => (
                <option key={party.id} value={party.id}>
                  {party.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium">From</span>
            <input
              type="date"
              name="from"
              defaultValue={filters.from ?? ''}
              className="rounded border border-[var(--color-line)] bg-white px-2.5 py-1.5 text-sm"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium">To</span>
            <input
              type="date"
              name="to"
              defaultValue={filters.to ?? ''}
              className="rounded border border-[var(--color-line)] bg-white px-2.5 py-1.5 text-sm"
            />
          </label>
          <button className="rounded bg-[var(--color-navy)] px-3 py-1.5 text-sm font-medium text-white hover:bg-[var(--color-navy-600)]">
            Apply
          </button>
          <Link
            href={`/${side}/settlements`}
            className="rounded border border-[var(--color-line)] bg-white px-3 py-1.5 text-sm hover:bg-gray-50"
          >
            Clear
          </Link>
        </form>
      </Card>

      <Card>
        <Table>
          <thead>
            <tr>
              <Th>Date</Th>
              <Th>{copy.partyWord}</Th>
              <Th>Mode</Th>
              <Th>Reference</Th>
              <Th numeric>Amount</Th>
              <Th />
            </tr>
          </thead>
          <tbody>
            {payments.length === 0 ? (
              <EmptyRow columns={6}>
                No {copy.settlementTitle.toLowerCase()} recorded for this filter
              </EmptyRow>
            ) : (
              payments.map((payment) => (
                <tr key={payment.id}>
                  <Td className="whitespace-nowrap">
                    {formatDate(payment.paidOn)}
                  </Td>
                  <Td>{payment.partyName}</Td>
                  <Td>{paymentModeLabel(payment.mode)}</Td>
                  <Td className="text-[var(--color-muted)]">
                    {payment.reference ?? ''}
                  </Td>
                  <Td numeric>{formatTaka(payment.amount)}</Td>
                  <Td>
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
                  </Td>
                </tr>
              ))
            )}
          </tbody>
          {payments.length > 0 ? (
            <tfoot>
              <tr className="bg-[var(--color-canvas)] font-semibold">
                <Td colSpan={4}>{payments.length} entries</Td>
                <Td numeric>{formatTaka(total)}</Td>
                <Td />
              </tr>
            </tfoot>
          ) : null}
        </Table>
      </Card>
    </>
  );
}
