import Link from 'next/link';
import type { Column } from '@/components/DataTable';
import { DataTable } from '@/components/DataTable';
import {
  DateRangeFields,
  FILTER_CONTROL,
  FilterBar,
  FilterField,
} from '@/components/FilterBar';
import { Card, LinkButton, PageTitle, StatTile } from '@/components/ui';
import { formatDate } from '@/lib/dates';
import { formatTaka } from '@/lib/format';
import { sumMoney } from '@/lib/amount';
import { expenseTotalsByCategory, listExpenses } from '@/lib/queries';
import {
  EXPENSE_CATEGORIES,
  expenseCategoryLabel,
  paymentModeLabel,
} from '@/lib/types';

type Expense = Awaited<ReturnType<typeof listExpenses>>[number];

const columns: Column<Expense>[] = [
  {
    key: 'voucher',
    head: 'Voucher',
    cellClassName: 'whitespace-nowrap font-medium',
    phone: 'title',
    cell: (expense) => expense.docNo ?? '',
  },
  {
    key: 'date',
    head: 'Date',
    cellClassName: 'whitespace-nowrap',
    phone: 'meta',
    cell: (expense) => formatDate(expense.spentOn),
  },
  {
    key: 'category',
    head: 'Category',
    cell: (expense) => expenseCategoryLabel(expense.category),
  },
  {
    key: 'description',
    head: 'Description',
    phone: 'full',
    cell: (expense) => expense.description,
  },
  {
    key: 'payee',
    head: 'Paid To',
    cell: (expense) => expense.payee ?? '',
  },
  {
    key: 'mode',
    head: 'Mode',
    cellClassName: 'whitespace-nowrap',
    cell: (expense) => paymentModeLabel(expense.mode),
  },
  {
    key: 'amount',
    head: 'Amount',
    numeric: true,
    cell: (expense) => formatTaka(expense.amount),
  },
  {
    key: 'actions',
    head: '',
    cellClassName: 'whitespace-nowrap',
    phone: 'full',
    cell: (expense) => (
      <Link
        href={`/expenses/${expense.docNo ?? expense.id}/edit`}
        className="underline"
      >
        Edit
      </Link>
    ),
  },
];

export default async function ExpensesPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string; from?: string; to?: string }>;
}) {
  const { category, from, to } = await searchParams;
  const [expenses, byCategory] = await Promise.all([
    listExpenses({
      category: category ?? null,
      from: from ?? null,
      to: to ?? null,
    }),
    expenseTotalsByCategory({ from: from ?? null, to: to ?? null }),
  ]);

  // Totalled here from the rows on the page, never stored.
  const total = sumMoney(expenses.map((expense) => expense.amount));

  return (
    <>
      <PageTitle
        title="Expenses"
        action={
          <LinkButton href="/expenses/new" icon="plus">
            New Expense
          </LinkButton>
        }
      />

      {/* The server has read these three since this page was written; until now
          nothing rendered a control for them, so the only way to filter was to
          key the search params by hand. */}
      <FilterBar clearHref="/expenses">
        <FilterField label="Category">
          <select
            name="category"
            defaultValue={category ?? ''}
            className={FILTER_CONTROL}
          >
            <option value="">All</option>
            {EXPENSE_CATEGORIES.map((one) => (
              <option key={one.value} value={one.value}>
                {one.label}
              </option>
            ))}
          </select>
        </FilterField>
        <DateRangeFields from={from} to={to} />
      </FilterBar>

      {byCategory.length > 0 ? (
        <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatTile
            label="Total Paid Out"
            value={formatTaka(total)}
            note={`${expenses.length} voucher${expenses.length === 1 ? '' : 's'}`}
          />
          {byCategory.slice(0, 3).map((row) => (
            <StatTile
              key={row.category}
              label={expenseCategoryLabel(row.category)}
              value={formatTaka(row.total)}
              note={`${row.count} entr${row.count === 1 ? 'y' : 'ies'}`}
            />
          ))}
        </div>
      ) : null}

      <Card>
        <DataTable
          sticky
          columns={columns}
          rows={expenses}
          rowKey={(expense) => expense.id}
          rowClassName="hover:bg-gray-50"
          empty={
            <>
              No expenses recorded yet.{' '}
              <Link href="/expenses/new" className="underline">
                Record the first one
              </Link>
              .
            </>
          }
          total={{ label: 'Total', cells: { amount: formatTaka(total) } }}
        />
      </Card>
    </>
  );
}
