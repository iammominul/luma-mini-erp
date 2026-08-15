import { company } from '@/lib/env';
import {
  buildPayslipDocument,
  payslipFileName,
} from '@/lib/pdf/payslip-document';
import { renderPdf } from '@/lib/pdf/render';
import {
  employeeAdvanceOutstanding,
  getEmployee,
  getPayrollLine,
} from '@/lib/queries';

/** One employee's payslip for one month, as a real A4 PDF, downloaded. */
export const dynamic = 'force-dynamic';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ period: string; lineId: string }> },
) {
  const { period, lineId } = await params;

  const line = await getPayrollLine(lineId);
  if (!line || line.period !== period) {
    return new Response('Not found', { status: 404 });
  }

  const employee = await getEmployee(line.employeeId);
  if (!employee) return new Response('Not found', { status: 404 });

  // What is left of the advances after this slip. The outstanding figure counts
  // approved and paid runs only, so a draft's own deduction is not in it yet
  // and has to come off here, or a slip printed before approval would overstate
  // what the employee still owes.
  const outstanding = await employeeAdvanceOutstanding(line.employeeId);
  const advanceRemaining =
    line.status === 'draft'
      ? outstanding.subtract(line.advanceDeduction)
      : outstanding;

  const pdf = await renderPdf(
    buildPayslipDocument({
      line,
      employee,
      company: company(),
      advanceRemaining,
    }),
  );

  return new Response(new Uint8Array(pdf), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${payslipFileName(line, employee, company())}"`,
      'Content-Length': String(pdf.byteLength),
      'Cache-Control': 'no-store',
    },
  });
}
