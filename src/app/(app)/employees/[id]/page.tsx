import Link from 'next/link';
import { notFound, permanentRedirect } from 'next/navigation';
import {
  Card,
  CardHeader,
  EmptyRow,
  LinkButton,
  PageTitle,
  StatTile,
  Table,
  Td,
  Th,
} from '@/components/ui';
import { formatDate, todayInDhaka } from '@/lib/dates';
import { formatTaka } from '@/lib/format';
import { isUuid } from '@/lib/ids';
import { LEAVE_TYPES } from '@/lib/payroll';
import {
  findEmployee,
  listAdvances,
  listEmployeeBalances,
  listExpenseClaims,
  listLeaveRecords,
  listPayrollRuns,
} from '@/lib/queries';
import {
  paymentMethodLabel,
  paymentModeLabel,
  periodLabel,
} from '@/lib/types';

export default async function EmployeePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const employee = await findEmployee(id);
  if (!employee) notFound();

  if (isUuid(id) && employee.code) {
    permanentRedirect(`/employees/${employee.code}`);
  }

  const year = todayInDhaka().slice(0, 4);
  const [advances, balances, leave, claims, runs] = await Promise.all([
    listAdvances({ employeeId: employee.id }),
    listEmployeeBalances(),
    listLeaveRecords({ employeeId: employee.id, year }),
    listExpenseClaims({ employeeId: employee.id }),
    listPayrollRuns(),
  ]);
  const balance = balances.find((b) => b.id === employee.id);

  // Leave taken this year, by type, against the Labour Act entitlement.
  const takenByType = new Map<string, number>();
  for (const record of leave) {
    takenByType.set(
      record.leaveType,
      (takenByType.get(record.leaveType) ?? 0) + Number(record.days),
    );
  }

  return (
    <>
      <PageTitle
        title={employee.name}
        subtitle={[employee.code, employee.designation]
          .filter(Boolean)
          .join(' - ')}
        action={
          <div className="flex gap-2">
            <LinkButton
              href={`/payroll/advances/new?employee=${employee.id}`}
              icon="plus"
            >
              New Advance
            </LinkButton>
            <LinkButton
              href={`/employees/${employee.code ?? employee.id}/edit`}
              variant="secondary"
              icon="edit"
            >
              Edit
            </LinkButton>
          </div>
        }
      />

      {balance ? (
        <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatTile
            label="Gross Salary"
            value={formatTaka(employee.gross)}
            note={
              employee.joinedOn
                ? `Joined ${formatDate(employee.joinedOn)}`
                : undefined
            }
          />
          <StatTile
            label="Advance Outstanding"
            value={formatTaka(balance.advanceOutstanding)}
            note="Comes out of a future salary"
          />
          <StatTile
            label="Salary Paid"
            value={formatTaka(balance.salaryPaid)}
            note={
              balance.lastPaidPeriod
                ? `To ${periodLabel(balance.lastPaidPeriod)}`
                : 'Nothing paid yet'
            }
          />
          <StatTile
            label="Paid By"
            value={paymentMethodLabel(employee.paymentMethod)}
            note={employee.accountNo ?? employee.mfsNumber ?? undefined}
          />
        </div>
      ) : null}

      <Card className="mb-4">
        <CardHeader title="Salary Structure" />
        <Table>
          <thead>
            <tr>
              <Th>Component</Th>
              <Th numeric>Amount</Th>
            </tr>
          </thead>
          <tbody>
            {(
              [
                ['Basic Salary', employee.basic],
                ['House Rent', employee.houseRent],
                ['Medical', employee.medical],
                ['Conveyance', employee.conveyance],
                ['Mobile', employee.mobileAllowance],
                ['Other Allowance', employee.otherAllowance],
              ] as const
            ).map(([label, amount]) => (
              <tr key={label}>
                <Td>{label}</Td>
                <Td numeric>{formatTaka(amount)}</Td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <Td className="font-semibold">Gross</Td>
              <Td numeric className="font-semibold">
                {formatTaka(employee.gross)}
              </Td>
            </tr>
          </tfoot>
        </Table>
      </Card>

      <Card className="mb-4">
        <CardHeader title={`Leave Taken in ${year}`} />
        <Table>
          <thead>
            <tr>
              <Th>Type</Th>
              <Th numeric>Taken</Th>
              <Th numeric>Entitlement</Th>
              <Th numeric>Left</Th>
            </tr>
          </thead>
          <tbody>
            {LEAVE_TYPES.map((type) => {
              const taken = takenByType.get(type.value) ?? 0;
              return (
                <tr key={type.value}>
                  <Td>{type.label}</Td>
                  <Td numeric>{taken === 0 ? '' : taken}</Td>
                  <Td numeric>{type.entitlement ?? 'As earned'}</Td>
                  <Td numeric>
                    {type.entitlement === null ? '' : type.entitlement - taken}
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </Table>
        <p className="border-t border-[var(--color-line)] px-4 py-2 text-xs text-[var(--color-muted)]">
          Leave is paid and never reduces a salary. Unpaid absence is keyed on
          the payroll for the month.
        </p>
      </Card>

      <Card className="mb-4">
        <CardHeader title="Payslips" />
        <Table>
          <thead>
            <tr>
              <Th>Month</Th>
              <Th>Run</Th>
              <Th>Status</Th>
              <Th />
            </tr>
          </thead>
          <tbody>
            {runs.length === 0 ? (
              <EmptyRow columns={4}>No payroll has been run yet.</EmptyRow>
            ) : (
              runs.map((run) => (
                <tr key={run.id} className="hover:bg-gray-50">
                  <Td className="whitespace-nowrap">
                    {periodLabel(run.period)}
                  </Td>
                  <Td>{run.docNo ?? ''}</Td>
                  <Td>{run.status}</Td>
                  <Td>
                    <Link href={`/payroll/${run.period}`} className="underline">
                      Open Payroll
                    </Link>
                  </Td>
                </tr>
              ))
            )}
          </tbody>
        </Table>
      </Card>

      <Card className="mb-4">
        <CardHeader title="Advances" />
        <Table>
          <thead>
            <tr>
              <Th>Voucher</Th>
              <Th>Date Paid</Th>
              <Th>Mode</Th>
              <Th>Reason</Th>
              <Th numeric>Amount</Th>
              <Th />
            </tr>
          </thead>
          <tbody>
            {advances.length === 0 ? (
              <EmptyRow columns={6}>No advance taken.</EmptyRow>
            ) : (
              advances.map((advance) => (
                <tr key={advance.id} className="hover:bg-gray-50">
                  <Td className="whitespace-nowrap font-medium">
                    {advance.docNo ?? ''}
                  </Td>
                  <Td className="whitespace-nowrap">
                    {formatDate(advance.paidOn)}
                  </Td>
                  <Td className="whitespace-nowrap">
                    {paymentModeLabel(advance.mode)}
                  </Td>
                  <Td>{advance.reason ?? ''}</Td>
                  <Td numeric>{formatTaka(advance.amount)}</Td>
                  <Td className="whitespace-nowrap">
                    <Link
                      href={`/payroll/advances/${advance.id}/edit`}
                      className="underline"
                    >
                      Edit
                    </Link>
                  </Td>
                </tr>
              ))
            )}
          </tbody>
        </Table>
      </Card>

      <Card>
        <CardHeader title="Expense Claims" />
        <Table>
          <thead>
            <tr>
              <Th>Claim</Th>
              <Th>Date</Th>
              <Th>Category</Th>
              <Th>Status</Th>
              <Th numeric>Amount</Th>
            </tr>
          </thead>
          <tbody>
            {claims.length === 0 ? (
              <EmptyRow columns={5}>No claims made.</EmptyRow>
            ) : (
              claims.map((claim) => (
                <tr key={claim.id} className="hover:bg-gray-50">
                  <Td className="whitespace-nowrap font-medium">
                    {claim.docNo ?? ''}
                  </Td>
                  <Td className="whitespace-nowrap">
                    {formatDate(claim.claimedOn)}
                  </Td>
                  <Td>{claim.category}</Td>
                  <Td>{claim.status}</Td>
                  <Td numeric>{formatTaka(claim.amount)}</Td>
                </tr>
              ))
            )}
          </tbody>
        </Table>
      </Card>
    </>
  );
}
