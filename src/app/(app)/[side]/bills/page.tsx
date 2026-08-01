import Link from 'next/link';
import { notFound } from 'next/navigation';
import { formatTaka } from '@/lib/format';
import { formatQtyKg, parseQtyKg } from '@/lib/amount';
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
import { listBills, listParties } from '@/lib/queries';
import { copyFor, isSide } from '@/lib/side';
import { natureOfWorkLabel } from '@/lib/types';
import { BillFilters } from '@/components/BillFilters';

type Search = {
  party?: string;
  work?: string;
  q?: string;
  from?: string;
  to?: string;
  status?: string;
  page?: string;
};

/** Enough to scan without scrolling forever, and few enough to render fast. */
const PAGE_SIZE = 50;

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

  const page = Math.max(1, Number(filters.page ?? '1') || 1);

  const [parties, result] = await Promise.all([
    listParties({ role: copy.role, includeInactive: true }),
    listBills({
      direction: copy.billDirection,
      partyId: filters.party || null,
      natureOfWork: filters.work || null,
      search: filters.q || null,
      status: filters.status || null,
      from: filters.from || null,
      to: filters.to || null,
      limit: PAGE_SIZE,
      offset: (page - 1) * PAGE_SIZE,
    }),
  ]);

  const { bills, matched, totalAmount, totalGreyKg } = result;
  const pages = Math.max(1, Math.ceil(matched / PAGE_SIZE));
  const firstOnPage = matched === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const lastOnPage = Math.min(page * PAGE_SIZE, matched);

  // SL, Date, Party, Bill No, Nature of Work, G/Weight, Amount and the actions,
  // plus the bill book and the system's own number on the customer side, which
  // a bill received does not have. Finished weight is deliberately absent: its
  // use is per-lot process loss, which a bill-level sum does not answer.
  const columns = copy.billNoIsOurs ? 10 : 8;

  /** Keeps the current filter when only the page changes. */
  const pageHref = (target: number) => {
    const query = new URLSearchParams();
    if (filters.party) query.set('party', filters.party);
    if (filters.work) query.set('work', filters.work);
    if (filters.q) query.set('q', filters.q);
    if (filters.status) query.set('status', filters.status);
    if (filters.from) query.set('from', filters.from);
    if (filters.to) query.set('to', filters.to);
    if (target > 1) query.set('page', String(target));
    return `/${side}/bills${query.size > 0 ? `?${query}` : ''}`;
  };

  return (
    <>
      <PageTitle
        title={copy.billTitle}
        subtitle={
          copy.billNoIsOurs
            ? 'Bills raised on customers, under the number written in the bill book.'
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
        <BillFilters
          partyWord={copy.partyWord}
          parties={parties.map((party) => ({
            id: party.id,
            name: party.name,
          }))}
        />
      </Card>

      <Card>
        <Table sticky>
          <thead>
            <tr>
              <Th className="w-12">SL</Th>
              <Th className="w-28">Date</Th>
              <Th>{copy.partyWord}</Th>
              <Th className="w-24">Bill No</Th>
              {copy.billNoIsOurs ? <Th className="w-20">Book No</Th> : null}
              {copy.billNoIsOurs ? (
                <Th className="w-28">System Bill No</Th>
              ) : null}
              <Th className="w-28">Status</Th>
              <Th className="w-40">Nature of Work</Th>
              <Th numeric className="w-28">
                G/Weight
              </Th>
              <Th numeric>Amount</Th>
              <Th className="w-24" />
            </tr>
          </thead>
          <tbody>
            {bills.length === 0 ? (
              <EmptyRow columns={columns}>
                No bills recorded for this filter
              </EmptyRow>
            ) : (
              bills.map((bill, index) => (
                <tr key={bill.id} className="hover:bg-[var(--color-canvas)]">
                  {/* Numbered across the whole filter, so page two carries on
                      from 50 rather than starting again at one. */}
                  <Td className="text-[var(--color-muted)]">
                    {firstOnPage + index}
                  </Td>
                  <Td className="whitespace-nowrap">
                    {formatDate(bill.billDate)}
                  </Td>
                  <Td>{bill.partyName}</Td>
                  <Td className="font-medium">{bill.billNo}</Td>
                  {copy.billNoIsOurs ? (
                    <Td className="text-[var(--color-muted)]">
                      {bill.bookNo ?? ''}
                    </Td>
                  ) : null}
                  {copy.billNoIsOurs ? (
                    <Td className="text-[var(--color-muted)]">
                      {bill.docNo ?? ''}
                    </Td>
                  ) : null}
                  <Td>
                    {bill.status === 'draft' ? (
                      <span className="rounded border border-[var(--color-line)] bg-[var(--color-canvas)] px-1.5 py-0.5 text-xs font-medium">
                        Draft
                      </span>
                    ) : bill.needsDetail ? (
                      <span className="text-xs text-[var(--color-muted)]">
                        Needs detail
                      </span>
                    ) : (
                      ''
                    )}
                  </Td>
                  <Td>{natureOfWorkLabel(bill.natureOfWork)}</Td>
                  <Td numeric>{bill.greyKg ?? ''}</Td>
                  <Td numeric>{formatTaka(bill.total)}</Td>
                  <Td>
                    <div className="flex items-center gap-1.5">
                      <Link
                        href={`/${side}/bills/${bill.docNo ?? bill.id}`}
                        className="rounded border border-[var(--color-line)] bg-white px-2 py-1 text-xs font-medium hover:bg-gray-50"
                      >
                        Open
                      </Link>
                      <DownloadIcon
                        href={`/${side}/bills/${bill.docNo ?? bill.id}/pdf`}
                        label={`Download ${copy.billSingular} ${bill.billNo}`}
                      />
                    </div>
                  </Td>
                </tr>
              ))
            )}
          </tbody>
          {matched > 0 ? (
            <tfoot>
              <tr className="bg-[var(--color-canvas)] font-semibold">
                {/* The whole filtered set, not the page on screen: adding up
                    pages by hand is what a register is meant to save anyone. */}
                <Td colSpan={columns - 3}>
                  {matched} {matched === 1 ? 'bill' : 'bills'}
                </Td>
                <Td numeric>{formatQtyKg(parseQtyKg(totalGreyKg))}</Td>
                <Td numeric>{formatTaka(totalAmount)}</Td>
                <Td />
              </tr>
            </tfoot>
          ) : null}
        </Table>
      </Card>

      {pages > 1 ? (
        <div className="mt-3 flex items-center justify-between text-sm">
          <span className="text-[var(--color-muted)]">
            Showing {firstOnPage} to {lastOnPage} of {matched}
          </span>
          <div className="flex items-center gap-2">
            {page > 1 ? (
              <Link
                href={pageHref(page - 1)}
                className="rounded border border-[var(--color-line)] bg-white px-3 py-1.5 font-medium hover:bg-gray-50"
              >
                Previous
              </Link>
            ) : null}
            <span className="text-[var(--color-muted)]">
              Page {page} of {pages}
            </span>
            {page < pages ? (
              <Link
                href={pageHref(page + 1)}
                className="rounded border border-[var(--color-line)] bg-white px-3 py-1.5 font-medium hover:bg-gray-50"
              >
                Next
              </Link>
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  );
}
