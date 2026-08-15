import Link from 'next/link';
import { notFound } from 'next/navigation';
import { formatTaka } from '@/lib/format';
import { formatQtyKg, parseQtyKg } from '@/lib/amount';
import type { Column } from '@/components/DataTable';
import { DataTable } from '@/components/DataTable';
import { Card, DownloadIcon, PageTitle } from '@/components/ui';
import { formatDate } from '@/lib/dates';
import {
  type BillSort,
  isBillSort,
  listBills,
  listParties,
  type SortDirection,
} from '@/lib/queries';
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
  sort?: string;
  dir?: string;
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

  // The register opens on the last bill written, which is the one being looked
  // for. Anything else is asked for in the URL, so a sorted list can be sent to
  // someone the same way a filtered one can.
  const sort: BillSort = isBillSort(filters.sort ?? '')
    ? (filters.sort as BillSort)
    : 'date';
  const dir: SortDirection = filters.dir === 'asc' ? 'asc' : 'desc';

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
      sort,
      dir,
      limit: PAGE_SIZE,
      offset: (page - 1) * PAGE_SIZE,
    }),
  ]);

  const { bills, matched, totalAmount, totalGreyKg, totalFinishedKg } = result;
  const pages = Math.max(1, Math.ceil(matched / PAGE_SIZE));
  const firstOnPage = matched === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const lastOnPage = Math.min(page * PAGE_SIZE, matched);

  /** Everything the list is currently showing, so one control never drops another. */
  const query = () => {
    const q = new URLSearchParams();
    if (filters.party) q.set('party', filters.party);
    if (filters.work) q.set('work', filters.work);
    if (filters.q) q.set('q', filters.q);
    if (filters.status) q.set('status', filters.status);
    if (filters.from) q.set('from', filters.from);
    if (filters.to) q.set('to', filters.to);
    return q;
  };

  const href = (q: URLSearchParams) =>
    `/${side}/bills${q.size > 0 ? `?${q}` : ''}`;

  /** Keeps the current filter and order when only the page changes. */
  const pageHref = (target: number) => {
    const q = query();
    if (sort !== 'date') q.set('sort', sort);
    if (dir !== 'desc') q.set('dir', dir);
    if (target > 1) q.set('page', String(target));
    return href(q);
  };

  /**
   * Sorting on a column that is already sorted turns it around; sorting on a
   * new one starts at the biggest, which for a date is the most recent and for
   * a bill number is the last one written. Paging starts again either way,
   * because page four of the old order means nothing in the new one.
   *
   * Only the bill number offers this now. Date is the order the register opens
   * in and the only other order it had, so its heading was a control that could
   * do one thing: turn the default upside down. `?sort=date` is still honored,
   * because it was a link somebody could have sent, and `pageHref` still writes
   * it through.
   */
  const sortHref = (target: BillSort) => {
    const q = query();
    const next: SortDirection = sort === target && dir === 'desc' ? 'asc' : 'desc';
    if (target !== 'date') q.set('sort', target);
    if (next !== 'desc') q.set('dir', next);
    return href(q);
  };

  /** How a sortable column reports itself, for the heading mark and aria-sort. */
  const sortedAs = (target: BillSort) =>
    sort === target ? (dir === 'asc' ? 'ascending' : 'descending') : 'none';

  type Bill = (typeof bills)[number];

  // SL, Date, System Bill No, Party, Bill No, Status, Nature of Work, the two
  // weights, Amount and the actions. The system's own number is customer side
  // only, because a bill received does not have one.
  //
  // The system number leads the two identifiers and the hand-written number
  // follows the party, because that is the order somebody reads them in: the
  // register's own serial, then who the bill is against, then the number
  // written on the paper they are holding.
  const columns: Column<Bill>[] = [
    {
      key: 'sl',
      head: 'SL',
      headClassName: 'w-12',
      cellClassName: 'text-[var(--color-muted)]',
      // Numbered across the whole filter, so page two carries on from 50
      // rather than starting again at one. It is the register's own count and
      // means nothing away from the register, so a phone does without it.
      phone: 'off',
      cell: (_bill, index) => firstOnPage + index,
    },
    {
      key: 'date',
      head: 'Date',
      headClassName: 'w-28',
      cellClassName: 'whitespace-nowrap',
      phone: 'meta',
      cell: (bill) => formatDate(bill.billDate),
    },
    ...(copy.billNoIsOurs
      ? ([
          {
            key: 'docNo',
            head: 'System Bill No',
            headClassName: 'w-28',
            cellClassName: 'text-[var(--color-muted)]',
            phone: 'meta',
            cell: (bill) => bill.docNo ?? '',
          },
        ] as Column<Bill>[])
      : []),
    {
      key: 'party',
      head: copy.partyWord,
      phone: 'title',
      cell: (bill) => bill.partyName,
    },
    {
      key: 'billNo',
      head: 'Bill No',
      headClassName: 'w-24',
      cellClassName: 'font-medium',
      sortHref: sortHref('billNo'),
      sorted: sortedAs('billNo'),
      // The party names the bill on the title line; the number identifies it
      // on the line under, beside the date it was written.
      phone: 'meta',
      phoneClassName: 'font-medium text-[var(--color-ink)]',
      cell: (bill) => bill.billNo,
    },
    {
      key: 'status',
      head: 'Status',
      headClassName: 'w-28',
      // Costs a phone nothing on a bill that is posted and complete, because
      // that is exactly when this cell has nothing to say.
      phone: 'meta',
      cell: (bill) =>
        bill.status === 'draft' ? (
          <span className="rounded border border-[var(--color-line)] bg-[var(--color-canvas)] px-1.5 py-0.5 text-xs font-medium">
            Draft
          </span>
        ) : bill.needsDetail ? (
          <span className="text-xs text-[var(--color-muted)]">Needs detail</span>
        ) : (
          ''
        ),
    },
    {
      key: 'work',
      head: 'Nature of Work',
      headClassName: 'w-40',
      // Both of these are on the bill, one tap away. A register on a phone is
      // for finding the bill, and what it is worth; the rest is the bill.
      phone: 'off',
      cell: (bill) => natureOfWorkLabel(bill.natureOfWork),
    },
    {
      key: 'greyKg',
      head: 'G/Weight',
      numeric: true,
      headClassName: 'w-28',
      phone: 'off',
      cell: (bill) => bill.greyKg ?? '',
    },
    {
      key: 'finishedKg',
      head: 'F/Weight',
      numeric: true,
      headClassName: 'w-28',
      phone: 'off',
      cell: (bill) => bill.finishedKg ?? '',
    },
    {
      key: 'amount',
      head: 'Amount',
      numeric: true,
      phone: 'amount',
      cell: (bill) => formatTaka(bill.total),
    },
    {
      key: 'actions',
      head: '',
      headClassName: 'w-24',
      // The desktop's pair of controls. On a phone the row itself opens the
      // bill and the download sits beside it, through rowHref and rowAction.
      phone: 'off',
      cell: (bill) => (
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
      ),
    },
  ];

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
            className="inline-flex min-h-11 items-center justify-center rounded bg-[var(--color-navy)] px-4 py-2.5 text-sm font-medium text-white hover:bg-[var(--color-navy-600)] md:min-h-0 md:px-3 md:py-1.5"
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
        <DataTable
          sticky
          columns={columns}
          rows={bills}
          rowKey={(bill) => bill.id}
          rowClassName="hover:bg-[var(--color-canvas)]"
          // On a phone the whole row opens the bill, so a thumb has the row to
          // aim at rather than the word Open inside it. The download stays a
          // control of its own beside it.
          rowHref={(bill) => `/${side}/bills/${bill.docNo ?? bill.id}`}
          rowAction={(bill) => (
            <DownloadIcon
              href={`/${side}/bills/${bill.docNo ?? bill.id}/pdf`}
              label={`Download ${copy.billSingular} ${bill.billNo}`}
            />
          )}
          empty="No bills recorded for this filter"
          // The whole filtered set, not the page on screen: adding up pages by
          // hand is what a register is meant to save anyone.
          total={{
            label: `${matched} ${matched === 1 ? 'bill' : 'bills'}`,
            cells: {
              greyKg: formatQtyKg(parseQtyKg(totalGreyKg)),
              // Blank rather than 0.000 when nothing in the filter has a
              // finished weight, because a zero here reads as a weighed zero.
              finishedKg:
                parseQtyKg(totalFinishedKg) > 0n
                  ? formatQtyKg(parseQtyKg(totalFinishedKg))
                  : '',
              amount: formatTaka(totalAmount),
            },
          }}
        />
      </Card>

      {pages > 1 ? (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm">
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
