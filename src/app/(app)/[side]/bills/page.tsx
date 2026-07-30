import Link from 'next/link';
import { notFound } from 'next/navigation';
import { formatTaka } from '@/lib/format';
import { sumMoney } from '@/lib/amount';
import { Card, EmptyRow, PageTitle, Table, Td, Th } from '@/components/ui';
import { formatDate } from '@/lib/dates';
import { listBills, listParties } from '@/lib/queries';
import { copyFor, isSide } from '@/lib/side';

type Search = { party?: string; from?: string; to?: string };

export default async function BillsPage({
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

  const [parties, bills] = await Promise.all([
    listParties({ type: side, includeInactive: true }),
    listBills({
      type: side,
      partyId: filters.party || null,
      from: filters.from || null,
      to: filters.to || null,
    }),
  ]);

  const total = sumMoney(bills.map((bill) => bill.total));

  return (
    <>
      <PageTitle
        title={copy.billTitle}
        subtitle={
          copy.billNoIsOurs
            ? 'Bills raised on customers, numbered by the system.'
            : 'Bills received from subcontractors, recorded under their own number.'
        }
        action={
          <Link
            href={`/${side}/bills/new`}
            className="rounded bg-[var(--color-navy)] px-3 py-1.5 text-sm font-medium text-white hover:bg-[var(--color-navy-600)]"
          >
            New {copy.billSingular}
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
            href={`/${side}/bills`}
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
              <Th>Bill No</Th>
              <Th>Date</Th>
              <Th>{copy.partyWord}</Th>
              <Th>Reference</Th>
              <Th numeric>Amount</Th>
              <Th />
            </tr>
          </thead>
          <tbody>
            {bills.length === 0 ? (
              <EmptyRow columns={6}>No bills recorded for this filter</EmptyRow>
            ) : (
              bills.map((bill) => (
                <tr key={bill.id}>
                  <Td>
                    <Link
                      href={`/${side}/bills/${bill.id}`}
                      className="font-medium text-[var(--color-navy)] hover:underline"
                    >
                      {bill.billNo}
                    </Link>
                  </Td>
                  <Td className="whitespace-nowrap">
                    {formatDate(bill.billDate)}
                  </Td>
                  <Td>{bill.partyName}</Td>
                  <Td className="text-[var(--color-muted)]">
                    {bill.reference ?? ''}
                  </Td>
                  <Td numeric>{formatTaka(bill.total)}</Td>
                  <Td>
                    <Link
                      href={`/${side}/bills/${bill.id}`}
                      className="text-sm text-[var(--color-navy)] hover:underline"
                    >
                      Open
                    </Link>
                  </Td>
                </tr>
              ))
            )}
          </tbody>
          {bills.length > 0 ? (
            <tfoot>
              <tr className="bg-[var(--color-canvas)] font-semibold">
                <Td colSpan={4}>{bills.length} bills</Td>
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
