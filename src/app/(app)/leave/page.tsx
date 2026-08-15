import Link from 'next/link';
import type { Column } from '@/components/DataTable';
import { DataTable } from '@/components/DataTable';
import {
  FILTER_CONTROL,
  FilterBar,
  FilterField,
} from '@/components/FilterBar';
import { Button, Card, PageTitle } from '@/components/ui';
import { formatDate, todayInDhaka } from '@/lib/dates';
import { leaveTypeLabel } from '@/lib/payroll';
import { listLeaveRecords } from '@/lib/queries';

type LeaveRecord = Awaited<ReturnType<typeof listLeaveRecords>>[number];

const columns: Column<LeaveRecord>[] = [
  {
    key: 'employee',
    head: 'Employee',
    phone: 'title',
    cell: (record) => (
      <Link
        href={`/employees/${record.employeeCode ?? record.employeeId}`}
        className="underline"
      >
        {record.employeeName}
      </Link>
    ),
  },
  {
    key: 'type',
    head: 'Type',
    cellClassName: 'whitespace-nowrap',
    phone: 'meta',
    cell: (record) => leaveTypeLabel(record.leaveType),
  },
  {
    key: 'from',
    head: 'First Day',
    cellClassName: 'whitespace-nowrap',
    cell: (record) => formatDate(record.fromDate),
  },
  {
    key: 'to',
    head: 'Last Day',
    cellClassName: 'whitespace-nowrap',
    cell: (record) => formatDate(record.toDate),
  },
  {
    key: 'days',
    head: 'Days',
    numeric: true,
    cell: (record) => record.days,
  },
  {
    key: 'reason',
    head: 'Reason',
    phone: 'full',
    cell: (record) => record.reason ?? '',
  },
];

export default async function LeavePage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string }>;
}) {
  const { year } = await searchParams;
  const thisYear = todayInDhaka().slice(0, 4);
  const shown = year && /^\d{4}$/.test(year) ? year : thisYear;
  const records = await listLeaveRecords({ year: shown });

  // Leave is filed under the Labour Act year by year, so the choice is a list
  // of years rather than two dates. Five back covers anything this app holds.
  const years = Array.from({ length: 5 }, (_, i) =>
    String(Number(thisYear) - i),
  );

  return (
    <>
      <PageTitle
        title="Leave"
        subtitle="Casual, sick and earned leave, recorded for the register. Paid leave never reduces a salary."
        action={
          <Link href="/leave/new">
            <Button>Record Leave</Button>
          </Link>
        }
      />

      {/* The year has always been read from the URL; nothing rendered a way to
          change it, so the register only ever showed the current one. */}
      <FilterBar clearHref="/leave" applyLabel="Show Year">
        <FilterField label="Year">
          <select name="year" defaultValue={shown} className={FILTER_CONTROL}>
            {years.map((year) => (
              <option key={year} value={year}>
                {year}
              </option>
            ))}
          </select>
        </FilterField>
      </FilterBar>

      <Card>
        <DataTable
          sticky
          columns={columns}
          rows={records}
          rowKey={(record) => record.id}
          rowClassName="hover:bg-gray-50"
          empty={
            <>
              No leave recorded in {shown}.{' '}
              <Link href="/leave/new" className="underline">
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
