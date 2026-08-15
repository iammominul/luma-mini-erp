import type {
  ContentTable,
  TableCell,
  TDocumentDefinitions,
} from 'pdfmake/interfaces';
import { formatDate } from '../dates';
import type { Company } from '../env';
import { amountInWords, formatTaka } from '../format';
import { Money } from '../money';
import { divisorFor, perDayBasisLabel } from '../payroll';
import type { Employee, PayrollLineWithRun } from '../types';
import { paymentMethodLabel, periodLabel } from '../types';
import {
  buildDocument,
  inWordsLine,
  type MetaPair,
  tableLayout,
} from './document';
import { documentFileName } from './file-name';

/**
 * The payslip an employee is handed when they are paid.
 *
 * Earnings broken into their parts first, then what was taken off and what was
 * added, then the net. Every adjustment is its own line with the reason on it:
 * a payslip that states one lump sum is the thing people come back to the
 * office about, and an absence line that names the days and the basis answers
 * the question before it is asked.
 *
 * No arithmetic happens here. Every figure arrives already computed on the
 * payroll line, which is the same rule every builder in this folder follows.
 */
export function buildPayslipDocument({
  line,
  employee,
  company,
  advanceRemaining,
}: {
  line: PayrollLineWithRun;
  employee: Employee;
  company: Company;
  /**
   * What is left of the employee's advances once this payslip is taken into
   * account, worked out by the caller. It prints beside the deduction so the
   * person handed the slip can see where the advance stands without asking.
   */
  advanceRemaining?: Money;
}): TDocumentDefinitions {
  const rows: TableCell[][] = [
    [
      { text: 'Earnings', style: 'tableHead' },
      { text: 'Amount (Tk)', style: 'tableHead', alignment: 'right' },
    ],
  ];

  // Only the components that carry a figure. A payslip listing six lines where
  // four are zero reads as a form somebody forgot to fill in.
  const components: [string, Money][] = [
    ['Basic Salary', line.basic],
    ['House Rent', line.houseRent],
    ['Medical Allowance', line.medical],
    ['Conveyance', line.conveyance],
    ['Mobile Allowance', line.mobileAllowance],
    ['Other Allowance', line.otherAllowance],
  ];
  for (const [label, amount] of components) {
    if (amount.isZero()) continue;
    rows.push([{ text: label }, { text: formatTaka(amount), alignment: 'right' }]);
  }

  rows.push([
    { text: 'Gross Salary', style: 'totalRow', alignment: 'right' },
    { text: formatTaka(line.gross), alignment: 'right', bold: true },
  ]);

  const adjustments: TableCell[][] = [];

  if (!line.bonus.isZero()) {
    adjustments.push([
      { text: 'Add: Bonus' },
      { text: formatTaka(line.bonus), alignment: 'right' },
    ]);
  }
  if (!line.additionalAllowance.isZero()) {
    adjustments.push([
      { text: 'Add: Additional Allowance' },
      { text: formatTaka(line.additionalAllowance), alignment: 'right' },
    ]);
  }
  if (!line.absenceDeduction.isZero()) {
    const days = Number(line.absentDays);
    const divisor = divisorFor(line.perDayBasis, line.period);
    adjustments.push([
      {
        text: `Less: Unpaid Absence, ${line.absentDays} day${days === 1 ? '' : 's'} (gross / ${divisor})`,
      },
      { text: `(${formatTaka(line.absenceDeduction)})`, alignment: 'right' },
    ]);
  }
  if (!line.advanceDeduction.isZero()) {
    adjustments.push([
      {
        text: advanceRemaining
          ? `Less: Advance Recovered (balance ${formatTaka(advanceRemaining)})`
          : 'Less: Advance Recovered',
      },
      { text: `(${formatTaka(line.advanceDeduction)})`, alignment: 'right' },
    ]);
  }
  if (!line.otherDeduction.isZero()) {
    adjustments.push([
      { text: 'Less: Other Deduction' },
      { text: `(${formatTaka(line.otherDeduction)})`, alignment: 'right' },
    ]);
  }

  if (adjustments.length > 0) {
    rows.push([
      { text: 'Adjustments', style: 'tableHead' },
      { text: '', style: 'tableHead' },
    ]);
    rows.push(...adjustments);
  }

  rows.push([
    { text: 'Net Paid', style: 'totalRow', alignment: 'right' },
    { text: formatTaka(line.netPaid), alignment: 'right', bold: true },
  ]);

  const body: ContentTable = {
    table: { headerRows: 1, widths: ['*', 110], body: rows },
    layout: tableLayout,
  };

  const meta: MetaPair[] = [
    { label: 'Payslip No', value: line.docNo ?? '' },
    { label: 'Salary Month', value: periodLabel(line.period) },
    { label: 'Payment Method', value: paymentMethodLabel(employee.paymentMethod) },
  ];
  if (line.paidOn) {
    meta.push({ label: 'Date Paid', value: formatDate(line.paidOn) });
  }
  if (employee.paymentMethod === 'bank' && employee.accountNo) {
    meta.push({
      label: 'Account',
      value: [employee.bankName, employee.accountNo].filter(Boolean).join(' '),
    });
  }
  if (employee.paymentMethod === 'mfs' && employee.mfsNumber) {
    meta.push({ label: 'MFS Number', value: employee.mfsNumber });
  }

  return buildDocument({
    company,
    title: 'Payslip',
    partyHeading: 'Paid To',
    party: {
      name: employee.name,
      // The code and the designation stand where a party address goes: on a
      // payslip that is what identifies the person. The designation is the one
      // copied onto the line, so a change of role does not restate old slips.
      address: [employee.code, line.designation].filter(Boolean).join(', '),
      phone: employee.phone,
    },
    meta,
    body,
    afterBody: [
      inWordsLine(amountInWords(line.netPaid)),
      ...(line.remarks
        ? [
            {
              text: [{ text: 'Remarks: ', bold: true }, line.remarks],
              margin: [0, 5, 0, 0] as [number, number, number, number],
              fontSize: 8.5,
            },
          ]
        : []),
      {
        text: `Per day pay is worked out as ${perDayBasisLabel(line.perDayBasis).toLowerCase()}. Paid leave is not deducted.`,
        style: 'note',
        margin: [0, 5, 0, 0] as [number, number, number, number],
      },
    ],
    signatories: [
      'Employee Signature',
      'Prepared By',
      line.approvedBy ? `Approved By: ${line.approvedBy}` : 'Approved By',
    ],
  });
}

/** The download filename, which is what the person filing it will see. */
export function payslipFileName(
  line: PayrollLineWithRun,
  employee: Employee,
  company: Company,
): string {
  return documentFileName({
    company: company.name,
    documentType: 'Payslip',
    party: employee.code ?? employee.name,
    identifiers: [line.period, line.docNo ?? ''].filter(Boolean),
  });
}
