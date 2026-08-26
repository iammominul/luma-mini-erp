import Link from 'next/link';
import type { Column } from '@/components/DataTable';
import { DataTable } from '@/components/DataTable';
import { Card, LinkButton, PageTitle } from '@/components/ui';
import { sumMoney } from '@/lib/amount';
import { formatDate } from '@/lib/dates';
import { formatTaka } from '@/lib/format';
import { listAdvances } from '@/lib/queries';
import { paymentModeLabel } from '@/lib/types';

type Advance = Awaited<ReturnType<typeof listAdvances>>[number];

const columns: Column<Advance>[] = [
  {
    key: 'voucher',
    head: 'Voucher',
    cellClassName: 'whitespace-nowrap font-medium',
    phone: 'title',
    cell: (advance) => advance.docNo ?? '',
  },
  {
    key: 'paidOn',
    head: 'Date Paid',
    cellClassName: 'whitespace-nowrap',
    phone: 'meta',
    cell: (advance) => formatDate(advance.paidOn),
  },
  {
    key: 'employee',
    head: 'Employee',
    phone: 'title',
    cell: (advance) => (
      <Link
        href={`/employees/${advance.employeeCode ?? advance.employeeId}`}
        className="underline"
      >
        {advance.employeeName}
      </Link>
    ),
  },
  {
    key: 'mode',
    head: 'Mode',
    cellClassName: 'whitespace-nowrap',
    cell: (advance) => paymentModeLabel(advance.mode),
  },
  {
    key: 'reference',
    head: 'Reference',
    cell: (advance) => advance.reference ?? '',
  },
  {
    key: 'amount',
    head: 'Amount',
    numeric: true,
    cell: (advance) => formatTaka(advance.amount),
  },
  {
    key: 'actions',
    head: '',
    cellClassName: 'whitespace-nowrap',
    phone: 'full',
    cell: (advance) => (
      <Link href={`/payroll/advances/${advance.id}/edit`} className="underline">
        Edit
      </Link>
    ),
  },
];

export default async function AdvancesPage() {
  const advances = await listAdvances({});
  const total = sumMoney(advances.map((advance) => advance.amount));

  return (
    <>
      <PageTitle
        title="Salary Advances"
        action={
          <LinkButton href="/payroll/advances/new" icon="plus">
            New Advance
          </LinkButton>
        }
      />

      <Card>
        <DataTable
          sticky
          columns={columns}
          rows={advances}
          rowKey={(advance) => advance.id}
          rowClassName="hover:bg-gray-50"
          empty={
            <>
              No advances recorded yet.{' '}
              <Link href="/payroll/advances/new" className="underline">
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
