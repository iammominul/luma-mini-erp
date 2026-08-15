import Link from 'next/link';
import { DataTable } from '@/components/DataTable';
import { Card, PageTitle } from '@/components/ui';
import { activityFilterOptions, listActivity } from '@/lib/queries';
import { requirePermission } from '@/lib/session';

export const dynamic = 'force-dynamic';

/** Enough to scan in one go, and few enough to render fast. */
const PAGE_SIZE = 50;

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const clean = (value: string | undefined) =>
  value && DATE.test(value) ? value : null;

/** The plural of an entity name, as a heading rather than a column value. */
const ENTITY_LABEL: Record<string, string> = {
  bill: 'Bill',
  payment: 'Settlement',
  party: 'Party',
  expense: 'Expense',
  expense_claim: 'Expense Claim',
  employee: 'Employee',
  advance: 'Advance',
  payroll_run: 'Payroll Run',
  salary: 'Salary',
  leave_record: 'Leave',
  user: 'User',
};

const entityLabel = (entity: string) => ENTITY_LABEL[entity] ?? entity;

/**
 * The append only log, read by record, by person and by date.
 *
 * This used to sit at the foot of the dashboard as a list of the last twelve
 * entries, where it was the longest thing on the screen and answered the least.
 * It belongs on its own page, filterable, with the top bar carrying a peek at
 * the newest few for the "what changed since I looked" question.
 */
export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<{
    entity?: string;
    actor?: string;
    action?: string;
    from?: string;
    to?: string;
    page?: string;
  }>;
}) {
  // A Viewer does not read the log: it carries who did what, which is a
  // different question from what the book says.
  await requirePermission('activity:read');

  const filters = await searchParams;
  const page = Math.max(1, Number(filters.page ?? '1') || 1);

  const [{ entries, matched }, options] = await Promise.all([
    listActivity({
      entity: filters.entity || null,
      actorUserId: filters.actor || null,
      action: filters.action || null,
      from: clean(filters.from),
      to: clean(filters.to),
      limit: PAGE_SIZE,
      offset: (page - 1) * PAGE_SIZE,
    }),
    activityFilterOptions(),
  ]);

  const pages = Math.max(1, Math.ceil(matched / PAGE_SIZE));
  const firstOnPage = matched === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const lastOnPage = Math.min(page * PAGE_SIZE, matched);

  const pageHref = (target: number) => {
    const q = new URLSearchParams();
    if (filters.entity) q.set('entity', filters.entity);
    if (filters.actor) q.set('actor', filters.actor);
    if (filters.action) q.set('action', filters.action);
    if (filters.from) q.set('from', filters.from);
    if (filters.to) q.set('to', filters.to);
    if (target > 1) q.set('page', String(target));
    return `/audit${q.size > 0 ? `?${q}` : ''}`;
  };

  const CONTROL =
    'min-h-11 w-full rounded border border-[var(--color-line)] bg-white px-3 py-2.5 text-base sm:w-auto md:min-h-0 md:px-2.5 md:py-1.5 md:text-sm';

  return (
    <>
      <PageTitle
        title="Audit Trail"
        subtitle="Every change to the book, with who made it and why. Append only: nothing here is edited or removed."
      />

      <Card className="mb-4 p-3">
        {/* A plain GET form, so a filtered trail has an address that can be
            reloaded or sent to somebody, the same as every other list here. */}
        <form className="flex flex-wrap items-end gap-3">
          <label className="block w-full sm:w-auto">
            <span className="mb-1 block text-xs font-medium">Record</span>
            <select
              name="entity"
              defaultValue={filters.entity ?? ''}
              className={CONTROL}
            >
              <option value="">All</option>
              {options.entities.map((entity) => (
                <option key={entity} value={entity}>
                  {entityLabel(entity)}
                </option>
              ))}
            </select>
          </label>

          <label className="block w-full sm:w-auto">
            <span className="mb-1 block text-xs font-medium">Person</span>
            <select
              name="actor"
              defaultValue={filters.actor ?? ''}
              className={CONTROL}
            >
              <option value="">Anyone</option>
              {options.actors.map((actor) => (
                <option key={actor.id} value={actor.id}>
                  {actor.name}
                </option>
              ))}
            </select>
          </label>

          <label className="block w-full sm:w-auto">
            <span className="mb-1 block text-xs font-medium">Action</span>
            <select
              name="action"
              defaultValue={filters.action ?? ''}
              className={CONTROL}
            >
              <option value="">All</option>
              <option value="create">Created</option>
              <option value="update">Edited</option>
              <option value="delete">Removed</option>
            </select>
          </label>

          <label className="block w-full sm:w-auto">
            <span className="mb-1 block text-xs font-medium">From</span>
            <input
              type="date"
              name="from"
              defaultValue={filters.from ?? ''}
              className={CONTROL}
            />
          </label>

          <label className="block w-full sm:w-auto">
            <span className="mb-1 block text-xs font-medium">To</span>
            <input
              type="date"
              name="to"
              defaultValue={filters.to ?? ''}
              className={CONTROL}
            />
          </label>

          <button className="inline-flex min-h-11 w-full items-center justify-center rounded bg-[var(--color-navy)] px-4 py-2.5 text-sm font-medium text-white hover:bg-[var(--color-navy-600)] sm:w-auto md:min-h-0 md:px-3 md:py-1.5">
            Apply
          </button>
          <Link
            href="/audit"
            className="inline-flex min-h-11 w-full items-center justify-center rounded border border-[var(--color-line)] bg-white px-4 py-2.5 text-sm hover:bg-gray-50 sm:w-auto md:min-h-0 md:px-3 md:py-1.5"
          >
            Clear
          </Link>
        </form>
      </Card>

      <Card>
        <DataTable
          sticky
          columns={[
            {
              key: 'at',
              head: 'When',
              headClassName: 'w-40',
              cellClassName: 'whitespace-nowrap text-[var(--color-muted)]',
              phone: 'meta',
              cell: (entry) => entry.at,
            },
            {
              key: 'record',
              head: 'Record',
              headClassName: 'w-32',
              phone: 'meta',
              cell: (entry) => entityLabel(entry.entity),
            },
            {
              key: 'action',
              head: 'Action',
              headClassName: 'w-24',
              cellClassName: 'capitalize',
              phone: 'meta',
              phoneClassName: 'capitalize',
              cell: (entry) => entry.action,
            },
            {
              key: 'summary',
              head: 'Entry',
              phone: 'title',
              cell: (entry) => entry.summary,
            },
            {
              key: 'reason',
              head: 'Reason',
              phone: 'full',
              cellClassName: 'text-[var(--color-muted)]',
              phoneClassName: 'text-[var(--color-muted)]',
              cell: (entry) => entry.reason ?? '',
            },
            {
              // Blank before named users arrived, when one shared password
              // meant there was no who to record. Saying so is better than
              // naming somebody who may not have done it.
              key: 'by',
              head: 'By',
              headClassName: 'w-40',
              cellClassName: 'whitespace-nowrap',
              cell: (entry) =>
                entry.actorName ?? (
                  <span className="text-[var(--color-muted)]">
                    Not recorded
                  </span>
                ),
            },
          ]}
          rows={entries}
          rowKey={(entry) => entry.id}
          empty="No changes recorded for this filter"
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
                className="inline-flex min-h-11 items-center justify-center rounded border border-[var(--color-line)] bg-white px-4 py-2.5 font-medium hover:bg-gray-50 md:min-h-0 md:px-3 md:py-1.5"
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
                className="inline-flex min-h-11 items-center justify-center rounded border border-[var(--color-line)] bg-white px-4 py-2.5 font-medium hover:bg-gray-50 md:min-h-0 md:px-3 md:py-1.5"
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
