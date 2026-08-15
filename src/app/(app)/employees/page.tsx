import Link from 'next/link';
import type { Column } from '@/components/DataTable';
import { DataTable } from '@/components/DataTable';
import { Button, Card, PageTitle, StatTile } from '@/components/ui';
import { sumMoney } from '@/lib/amount';
import { formatTaka } from '@/lib/format';
import { listEmployeeBalances } from '@/lib/queries';
import { periodLabel } from '@/lib/types';

type Employee = Awaited<ReturnType<typeof listEmployeeBalances>>[number];

const columns: Column<Employee>[] = [
  {
    key: 'code',
    head: 'Code',
    cellClassName: 'whitespace-nowrap font-medium',
    phone: 'meta',
    cell: (employee) => employee.code ?? '',
  },
  {
    key: 'name',
    head: 'Name',
    phone: 'title',
    cell: (employee) => (
      <>
        <Link
          href={`/employees/${employee.code ?? employee.id}`}
          className="underline"
        >
          {employee.name}
        </Link>
        {employee.active ? null : (
          <span className="ml-2 text-xs text-[var(--color-muted)]">
            Inactive
          </span>
        )}
      </>
    ),
  },
  {
    key: 'designation',
    head: 'Designation',
    phone: 'meta',
    cell: (employee) => employee.designation ?? '',
  },
  {
    key: 'gross',
    head: 'Gross',
    numeric: true,
    cell: (employee) => formatTaka(employee.gross),
  },
  {
    key: 'advanceOut',
    head: 'Advance Out',
    numeric: true,
    cell: (employee) =>
      employee.advanceOutstanding.isZero()
        ? ''
        : formatTaka(employee.advanceOutstanding),
  },
  {
    key: 'salaryPaid',
    head: 'Salary Paid',
    numeric: true,
    cell: (employee) => formatTaka(employee.salaryPaid),
  },
  {
    key: 'lastPaid',
    head: 'Last Paid',
    cellClassName: 'whitespace-nowrap',
    cell: (employee) =>
      employee.lastPaidPeriod ? periodLabel(employee.lastPaidPeriod) : '',
  },
  {
    key: 'actions',
    head: '',
    cellClassName: 'whitespace-nowrap',
    phone: 'full',
    cell: (employee) => (
      <Link
        href={`/employees/${employee.code ?? employee.id}/edit`}
        className="underline"
      >
        Edit
      </Link>
    ),
  },
];

export default async function EmployeesPage() {
  const employees = await listEmployeeBalances();

  // Every figure below is computed on read. Nothing caches a total.
  const outstanding = sumMoney(employees.map((e) => e.advanceOutstanding));
  const paid = sumMoney(employees.map((e) => e.salaryPaid));
  const active = employees.filter((e) => e.active).length;

  return (
    <>
      <PageTitle
        title="Employees"
        subtitle="The people on payroll, with what each still owes against an advance."
        action={
          <Link href="/employees/new">
            <Button>New Employee</Button>
          </Link>
        }
      />

      {employees.length > 0 ? (
        <div className="mb-4 grid gap-3 sm:grid-cols-3">
          <StatTile
            label="On Payroll"
            value={String(active)}
            note={
              employees.length > active
                ? `${employees.length - active} inactive`
                : 'All active'
            }
          />
          <StatTile
            label="Advances Outstanding"
            value={formatTaka(outstanding)}
            note="Still to come out of a future salary"
          />
          <StatTile label="Salaries Paid" value={formatTaka(paid)} note="To date" />
        </div>
      ) : null}

      <Card>
        <DataTable
          sticky
          columns={columns}
          rows={employees}
          rowKey={(employee) => employee.id}
          rowClassName="hover:bg-gray-50"
          empty={
            <>
              No employees yet.{' '}
              <Link href="/employees/new" className="underline">
                Add the first one
              </Link>
              .
            </>
          }
        />
      </Card>
    </>
  );
}
