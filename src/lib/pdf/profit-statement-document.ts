import type {
  ContentTable,
  TableCell,
  TDocumentDefinitions,
} from 'pdfmake/interfaces';
import { formatDate } from '../dates';
import type { Company } from '../env';
import type { ProfitStatement } from '../costing';
import { formatTaka } from '../format';
import { buildDocument, ledgerLayout, rule } from './document';
import { describedFileName } from './file-name';

/**
 * The Profit Statement for a period, on the company letterhead.
 *
 * It is an internal document, not one a party is sent, so it carries no
 * confirmation slip and its party block names the company itself. It is still
 * built on the same letterhead as every other document here, because a figure
 * handed to an owner or a banker should look like it came from the same office
 * as the bills.
 *
 * No arithmetic happens in this file, which is the rule for everything in this
 * directory. Every figure arrives already computed as Money by profitStatement()
 * in costing.ts and is only formatted here, so the paper and the screen cannot
 * disagree.
 *
 * The basis is printed under the figures rather than assumed. This is not an
 * accounting profit and the document says so itself, because a page of numbers
 * on a letterhead is exactly the kind of thing that gets read as one.
 */
export function buildProfitStatementDocument({
  statement,
  company,
  from,
  to,
}: {
  statement: ProfitStatement;
  company: Company;
  /** 'YYYY-MM-DD' */
  from: string;
  to: string;
}): TDocumentDefinitions {
  const rows: TableCell[][] = [
    [
      { text: 'Particulars', style: 'tableHead' },
      { text: 'Amount (Tk)', style: 'tableHead', alignment: 'right' },
    ],
    [
      { text: 'Billed to Customers', bold: true },
      { text: formatTaka(statement.revenue), alignment: 'right', bold: true },
    ],
  ];

  const tier = (label: string, lines: ProfitStatement['directLines']): void => {
    if (lines.length === 0) return;
    rows.push([
      { text: label, italics: true, margin: [0, 4, 0, 0] },
      { text: '' },
    ]);
    for (const line of lines) {
      rows.push([
        { text: `    ${line.label}`, margin: [8, 0, 0, 0] },
        { text: `(${formatTaka(line.amount)})`, alignment: 'right' },
      ]);
    }
  };

  const subtotal = (
    label: string,
    amount: string,
    share: string | null,
  ): void => {
    rows.push([
      {
        text: share ? `${label}  (${share} of billing)` : label,
        bold: true,
        margin: [0, 3, 0, 3],
      },
      { text: amount, alignment: 'right', bold: true, margin: [0, 3, 0, 3] },
    ]);
  };

  tier('Less: Direct Cost', statement.directLines);
  subtotal(
    'Gross Margin',
    formatTaka(statement.grossMargin),
    statement.grossMarginPercent,
  );

  tier('Less: Selling Cost', statement.sellingLines);
  subtotal(
    'Contribution',
    formatTaka(statement.contribution),
    statement.contributionPercent,
  );

  tier('Less: Operating Cost', statement.operatingLines);
  subtotal(
    statement.netResult.isNegative() ? 'Net Loss' : 'Net Result',
    formatTaka(statement.netResult),
    statement.netResultPercent,
  );

  const body: ContentTable = {
    table: {
      headerRows: 1,
      widths: ['*', 100],
      body: rows,
    },
    layout: ledgerLayout,
  };

  return buildDocument({
    company,
    title: 'Profit Statement',
    partyHeading: 'For',
    party: {
      name: company.name,
      address: company.address,
      phone: null,
    },
    meta: [
      { label: 'From', value: formatDate(from) },
      { label: 'To', value: formatDate(to) },
    ],
    body,
    afterBody: [
      rule(10, 4),
      {
        text: 'Basis of these figures',
        fontSize: 8,
        bold: true,
        margin: [0, 0, 0, 2],
      },
      {
        text: 'Bills count in the period they are raised. Expenses, salary and loan interest count when they are paid. A customer bill and the subcontract bill behind it can fall in different periods, so a short period moves around while a longer one settles. Repaying a loan is not a cost and is not in these figures: only the interest paid on it is, because the principal settles a liability. Capital introduced and drawings are not here either, for the same reason. This is a trading result computed from the bills and payments recorded, not an audited profit, and it carries no opening or closing stock.',
        fontSize: 7.5,
        alignment: 'justify',
      },
    ],
    signatories: ['Prepared By', 'Approved By'],
  });
}

export function profitStatementFileName(from: string, to: string): string {
  return describedFileName(['Profit Statement', from, 'to', to]);
}
