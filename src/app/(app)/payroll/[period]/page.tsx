import Link from 'next/link';
import { notFound, permanentRedirect } from 'next/navigation';
import { PayrollGrid } from '@/components/PayrollGrid';
import { PayrollWorkflow } from '@/components/PayrollWorkflow';
import {
  Card,
  CardHeader,
  EmptyRow,
  PageTitle,
  StatTile,
  Table,
  Td,
  Th,
} from '@/components/ui';
import { sumMoney } from '@/lib/amount';
import { todayInDhaka } from '@/lib/dates';
import { formatTaka } from '@/lib/format';
import { isUuid } from '@/lib/ids';
import { perDayBasisLabel } from '@/lib/payroll';
import {
  employeesMissingFromRun,
  findPayrollRun,
  listEmployeeBalances,
  listPayrollLines,
} from '@/lib/queries';
import { can } from '@/lib/permissions';
import { requirePermission } from '@/lib/session';
import { payrollStatusLabel, periodLabel } from '@/lib/types';
import {
  approvePayrollRunAction,
  markPayrollRunPaidAction,
  reopenPayrollRunAction,
  savePayrollLinesAction,
} from '../actions';

export default async function PayrollRunPage({
  params,
}: {
  params: Promise<{ period: string }>;
}) {
  const me = await requirePermission('payroll:read');
  const { period } = await params;
  const run = await findPayrollRun(period);
  if (!run) notFound();

  // A run is named by its month, so a uuid answers with that address instead.
  if (isUuid(period)) permanentRedirect(`/payroll/${run.period}`);

  const [lines, balances, missing] = await Promise.all([
    listPayrollLines(run.id),
    listEmployeeBalances(),
    employeesMissingFromRun(run.id),
  ]);

  const outstanding = new Map(
    balances.map((b) => [b.id, b.advanceOutstanding.toDecimalString()]),
  );

  const gross = sumMoney(lines.map((l) => l.gross));
  const net = sumMoney(lines.map((l) => l.netPaid));
  const deductions = sumMoney(
    lines.map((l) =>
      l.absenceDeduction.add(l.advanceDeduction).add(l.otherDeduction),
    ),
  );
  const additions = sumMoney(
    lines.map((l) => l.bonus.add(l.additionalAllowance)),
  );

  const readOnly = run.status !== 'draft';
  // Only worth offering the refill when somebody on this run still owes.
  const anyOutstanding = lines.some(
    (line) => (outstanding.get(line.employeeId) ?? '0.00') !== '0.00',
  );

  return (
    <>
      <PageTitle
        title={`Payroll, ${periodLabel(run.period)}`}
        subtitle={`${run.docNo ?? ''} ${payrollStatusLabel(run.status)}. Per day pay is ${perDayBasisLabel(run.perDayBasis).toLowerCase()}.`}
        action={
          <Link href="/payroll" className="text-sm underline">
            All Payroll Runs
          </Link>
        }
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label="Employees"
          value={String(lines.length)}
          note={payrollStatusLabel(run.status)}
        />
        <StatTile label="Gross" value={formatTaka(gross)} />
        <StatTile
          label="Deductions"
          value={formatTaka(deductions)}
          note="Absence, advance and other"
        />
        <StatTile
          label="Net Payable"
          value={formatTaka(net)}
          note={additions.isZero() ? undefined : `Includes ${formatTaka(additions)} added`}
        />
      </div>

      <PayrollWorkflow
        runId={run.id}
        period={run.period}
        status={run.status}
        approvedBy={run.approvedBy}
        paidBy={run.paidBy}
        approverName={me.name}
        canApprove={can(me.role, 'payroll:approve')}
        today={todayInDhaka()}
        approve={approvePayrollRunAction}
        markPaid={markPayrollRunPaidAction}
        reopen={reopenPayrollRunAction}
      />

      {/* The way back to the recovery agreements after Generate: an advance
          agreed later in the month, a run reopened, or a month generated with
          recovery switched off. It overwrites the column, so it is a button
          somebody presses and never something that runs on its own. */}
      {!readOnly && anyOutstanding ? (
        <form action={fillRecoveries} className="mb-3">
          <input type="hidden" name="runId" value={run.id} />
          <input type="hidden" name="period" value={run.period} />
          <button
            type="submit"
            className="inline-flex min-h-11 items-center justify-center rounded border border-[var(--color-line)] bg-white px-4 py-2.5 text-sm font-medium hover:bg-gray-50 md:min-h-0 md:px-3 md:py-1.5"
          >
            Fill Advance Recoveries
          </button>
          <span className="ml-2 text-xs text-[var(--color-muted)]">
            Sets the Advance column from each employee&rsquo;s recovery
            agreement, replacing what is in it now.
          </span>
        </form>
      ) : null}

      {lines.length === 0 ? (
        <Card>
          <Table>
            <tbody>
              <EmptyRow columns={1}>
                This run has no employees on it.
              </EmptyRow>
            </tbody>
          </Table>
        </Card>
      ) : (
        <PayrollGrid
          runId={run.id}
          period={run.period}
          perDayBasis={run.perDayBasis}
          readOnly={readOnly}
          action={savePayrollLinesAction}
          lines={lines.map((line) => ({
            id: line.id,
            employeeName: line.employeeName,
            employeeCode: line.employeeCode,
            designation: line.designation,
            gross: line.gross.toDecimalString(),
            absentDays: line.absentDays,
            bonus: line.bonus.toDecimalString(),
            additionalAllowance: line.additionalAllowance.toDecimalString(),
            advanceDeduction: line.advanceDeduction.toDecimalString(),
            otherDeduction: line.otherDeduction.toDecimalString(),
            remarks: line.remarks ?? '',
            advanceOutstanding: outstanding.get(line.employeeId) ?? '0.00',
          }))}
        />
      )}

      {/* Somebody hired after the month was generated has no line. Adding them
          one at a time is better than regenerating, which would throw away
          everything already keyed against the others. */}
      {!readOnly && missing.length > 0 ? (
        <Card className="mt-4">
          <CardHeader title="Not on This Payroll" />
          <Table>
            <thead>
              <tr>
                <Th>Employee</Th>
                <Th numeric>Gross</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {missing.map((employee) => (
                <tr key={employee.id}>
                  <Td>
                    {employee.name}
                    <span className="ml-2 text-xs text-[var(--color-muted)]">
                      {employee.code}
                    </span>
                  </Td>
                  <Td numeric>{formatTaka(employee.gross)}</Td>
                  <Td className="whitespace-nowrap">
                    <AddToRun
                      runId={run.id}
                      period={run.period}
                      employeeId={employee.id}
                    />
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
      ) : null}

      {lines.length > 0 ? (
        <Card className="mt-4">
          <CardHeader title="Payslips" />
          <Table>
            <thead>
              <tr>
                <Th>Employee</Th>
                <Th numeric>Net Paid</Th>
                <Th>Paid On</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {lines.map((line) => (
                <tr key={line.id} className="hover:bg-gray-50">
                  <Td>{line.employeeName}</Td>
                  <Td numeric>{formatTaka(line.netPaid)}</Td>
                  <Td>{line.paidOn ?? ''}</Td>
                  <Td className="whitespace-nowrap">
                    <a
                      href={`/payroll/${run.period}/payslip/${line.id}`}
                      className="underline"
                    >
                      Download Payslip
                    </a>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
      ) : null}
    </>
  );
}

/** A one button form, so adding somebody is a post and not a link. */
function AddToRun({
  runId,
  period,
  employeeId,
}: {
  runId: string;
  period: string;
  employeeId: string;
}) {
  return (
    <form action={addEmployee}>
      <input type="hidden" name="runId" value={runId} />
      <input type="hidden" name="period" value={period} />
      <input type="hidden" name="employeeId" value={employeeId} />
      <button type="submit" className="underline">
        Add to Payroll
      </button>
    </form>
  );
}

async function addEmployee(formData: FormData) {
  'use server';
  const { addEmployeeToRunAction } = await import('../actions');
  await addEmployeeToRunAction({}, formData);
}

async function fillRecoveries(formData: FormData) {
  'use server';
  const { fillAdvanceRecoveriesAction } = await import('../actions');
  await fillAdvanceRecoveriesAction({}, formData);
}
