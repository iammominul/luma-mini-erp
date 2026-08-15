import Link from 'next/link';
import { GeneratePayrollForm } from '@/components/GeneratePayrollForm';
import type { Column } from '@/components/DataTable';
import { DataTable } from '@/components/DataTable';
import { Card, CardHeader, PageTitle } from '@/components/ui';
import { todayInDhaka } from '@/lib/dates';
import { formatTaka } from '@/lib/format';
import { listPayrollRuns } from '@/lib/queries';
import { payrollStatusLabel, periodLabel } from '@/lib/types';
import { generatePayrollRunAction } from './actions';

/** The color a status reads in, kept plain: this is an accounts screen. */
function statusClass(status: string): string {
  if (status === 'paid') return 'text-green-800';
  if (status === 'approved') return 'text-[var(--color-navy)]';
  return 'text-[var(--color-muted)]';
}

type Run = Awaited<ReturnType<typeof listPayrollRuns>>[number];

const deductionsOf = (run: Run) =>
  run.absenceDeduction.add(run.advanceDeduction).add(run.otherDeduction);
const additionsOf = (run: Run) => run.bonus.add(run.additionalAllowance);

const columns: Column<Run>[] = [
  {
    key: 'run',
    head: 'Run',
    cellClassName: 'whitespace-nowrap font-medium',
    phone: 'meta',
    cell: (run) => (
      <Link href={`/payroll/${run.period}`} className="underline">
        {run.docNo ?? run.period}
      </Link>
    ),
  },
  {
    key: 'month',
    head: 'Month',
    cellClassName: 'whitespace-nowrap',
    phone: 'title',
    cell: (run) => periodLabel(run.period),
  },
  {
    key: 'status',
    head: 'Status',
    cellClassName: 'whitespace-nowrap',
    phone: 'meta',
    cell: (run) => (
      <span className={statusClass(run.status)}>
        {payrollStatusLabel(run.status)}
      </span>
    ),
  },
  {
    key: 'employees',
    head: 'Employees',
    numeric: true,
    cell: (run) => run.employees,
  },
  {
    key: 'gross',
    head: 'Gross',
    numeric: true,
    cell: (run) => formatTaka(run.gross),
  },
  {
    key: 'deductions',
    head: 'Deductions',
    numeric: true,
    cell: (run) =>
      deductionsOf(run).isZero() ? '' : formatTaka(deductionsOf(run)),
  },
  {
    key: 'additions',
    head: 'Additions',
    numeric: true,
    cell: (run) =>
      additionsOf(run).isZero() ? '' : formatTaka(additionsOf(run)),
  },
  {
    key: 'net',
    head: 'Net',
    numeric: true,
    cellClassName: 'font-semibold',
    phone: 'full',
    phoneClassName:
      'border-t border-[var(--color-line)] pt-2 text-base font-semibold',
    cell: (run) => formatTaka(run.netPaid),
  },
  {
    key: 'approvedBy',
    head: 'Approved By',
    cell: (run) => run.approvedBy ?? '',
  },
];

export default async function PayrollPage() {
  const runs = await listPayrollRuns();
  const today = todayInDhaka();

  // The month just gone is the one somebody is here to run, not this one.
  const [year, month] = today.split('-').map(Number);
  const previous = new Date(Date.UTC(year!, month! - 1, 1));
  previous.setUTCMonth(previous.getUTCMonth() - 1);
  const suggested = `${previous.getUTCFullYear()}-${String(
    previous.getUTCMonth() + 1,
  ).padStart(2, '0')}`;

  const alreadyRun = new Set(runs.map((run) => run.period));

  return (
    <>
      <PageTitle
        title="Payroll"
        subtitle="Run a month, key what varies, approve it, then pay it."
      />

      <Card className="mb-4">
        <CardHeader title="Generate a Month" />
        <div className="p-4">
          <GeneratePayrollForm
            action={generatePayrollRunAction}
            defaultPeriod={alreadyRun.has(suggested) ? '' : suggested}
          />
        </div>
      </Card>

      <Card>
        <DataTable
          sticky
          columns={columns}
          rows={runs}
          rowKey={(run) => run.id}
          rowClassName="hover:bg-gray-50"
          empty="No payroll has been run yet. Generate a month above."
        />
      </Card>
    </>
  );
}
