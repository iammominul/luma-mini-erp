import Link from 'next/link';
import { ReimburseForm } from '@/components/ReimburseForm';
import type { Column } from '@/components/DataTable';
import { DataTable } from '@/components/DataTable';
import {
  DateRangeFields,
  FILTER_CONTROL,
  FilterBar,
  FilterField,
} from '@/components/FilterBar';
import { Card, LinkButton, PageTitle, StatTile } from '@/components/ui';
import { sumMoney } from '@/lib/amount';
import { formatDate, todayInDhaka } from '@/lib/dates';
import { formatTaka } from '@/lib/format';
import { listExpenseClaims } from '@/lib/queries';
import { expenseClaimCategoryLabel, paymentModeLabel } from '@/lib/types';
import { reimburseClaimAction } from './actions';

type Claim = Awaited<ReturnType<typeof listExpenseClaims>>[number];

function columnsFor(today: string): Column<Claim>[] {
  return [
    {
      key: 'claim',
      head: 'Claim',
      cellClassName: 'whitespace-nowrap font-medium',
      phone: 'title',
      cell: (claim) => claim.docNo ?? '',
    },
    {
      key: 'date',
      head: 'Date',
      cellClassName: 'whitespace-nowrap',
      phone: 'meta',
      cell: (claim) => formatDate(claim.claimedOn),
    },
    {
      key: 'employee',
      head: 'Employee',
      phone: 'title',
      cell: (claim) => (
        <Link
          href={`/employees/${claim.employeeCode ?? claim.employeeId}`}
          className="underline"
        >
          {claim.employeeName}
        </Link>
      ),
    },
    {
      key: 'category',
      head: 'Category',
      cellClassName: 'whitespace-nowrap',
      cell: (claim) => expenseClaimCategoryLabel(claim.category),
    },
    {
      key: 'description',
      head: 'Description',
      phone: 'full',
      cell: (claim) => claim.description,
    },
    {
      key: 'amount',
      head: 'Amount',
      numeric: true,
      cell: (claim) => formatTaka(claim.amount),
    },
    {
      key: 'status',
      head: 'Status',
      cellClassName: 'whitespace-nowrap',
      cell: (claim) =>
        claim.status === 'reimbursed' ? (
          <span className="text-green-800">
            Paid {claim.reimbursedOn ? formatDate(claim.reimbursedOn) : ''}
            {claim.mode ? `, ${paymentModeLabel(claim.mode)}` : ''}
          </span>
        ) : (
          <span className="text-[var(--color-muted)]">Submitted</span>
        ),
    },
    {
      // A form of its own, so the copy in the other layout posts only itself.
      key: 'reimburse',
      head: '',
      phone: 'full',
      cell: (claim) =>
        claim.status === 'submitted' ? (
          <ReimburseForm
            claimId={claim.id}
            today={today}
            action={reimburseClaimAction}
          />
        ) : null,
    },
  ];
}

export default async function ClaimsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; from?: string; to?: string }>;
}) {
  const filters = await searchParams;
  const claims = await listExpenseClaims({
    status: filters.status || null,
    from: filters.from || null,
    to: filters.to || null,
  });
  const today = todayInDhaka();

  const owed = sumMoney(
    claims.filter((c) => c.status === 'submitted').map((c) => c.amount),
  );
  const reimbursed = sumMoney(
    claims.filter((c) => c.status === 'reimbursed').map((c) => c.amount),
  );

  return (
    <>
      <PageTitle
        title="Expense Claims"
        subtitle="Money staff spent and are owed back. Reimbursed on its own, never through payroll."
        action={
          <LinkButton href="/claims/new" icon="plus">
            New Claim
          </LinkButton>
        }
      />

      <FilterBar clearHref="/claims">
        <FilterField label="Status">
          <select
            name="status"
            defaultValue={filters.status ?? ''}
            className={FILTER_CONTROL}
          >
            <option value="">All</option>
            <option value="submitted">Submitted</option>
            <option value="reimbursed">Reimbursed</option>
          </select>
        </FilterField>
        <DateRangeFields from={filters.from} to={filters.to} />
      </FilterBar>

      {claims.length > 0 ? (
        <div className="mb-4 grid gap-3 sm:grid-cols-2">
          <StatTile
            label="Owed to Staff"
            value={formatTaka(owed)}
            note="Submitted and not yet paid back"
          />
          <StatTile label="Reimbursed" value={formatTaka(reimbursed)} />
        </div>
      ) : null}

      <Card>
        <DataTable
          sticky
          columns={columnsFor(today)}
          rows={claims}
          rowKey={(claim) => claim.id}
          rowClassName="hover:bg-gray-50"
          empty={
            <>
              No claims yet.{' '}
              <Link href="/claims/new" className="underline">
                Record the first
              </Link>
              .
            </>
          }
        />
      </Card>
    </>
  );
}
