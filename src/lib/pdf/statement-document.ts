import type {
  Content,
  ContentTable,
  TableCell,
  TDocumentDefinitions,
} from 'pdfmake/interfaces';
import { formatDate, todayInDhaka } from '../dates';
import type { Company } from '../env';
import { amountInWords, formatTaka, formatTakaPrefixed } from '../format';
import {
  balanceSide,
  formatBalance,
  type Statement,
  statementLabels,
} from '../statement';
import type { Party, PartyRole } from '../types';
import { rolesLabel } from '../types';
import {
  buildDocument,
  inWordsLine,
  labelledPairs,
  ledgerLayout,
  type MetaPair,
  rule,
  sectionLabel,
} from './document';
import { documentFileName } from './file-name';

/**
 * The Statement of Account: the document a party is shown when balances are
 * discussed. It reads as a ledger, which is what the people receiving it expect:
 * Date, Particulars, Reference, Debit, Credit, and a running Balance carrying Dr
 * or Cr.
 *
 * The shape borrows a bank statement's discipline, because that is the document
 * every party already knows how to read: a ruled activity table, a summary band,
 * an explicit end marker. The language and the ending are the trade's, not a
 * bank's. It states what was billed and what came in rather than withdrawals and
 * deposits, and where a bank's statement declares it needs no signature, this
 * one carries a slip for the party to confirm the balance and send back. That
 * confirmation is the reason the document gets sent at all.
 *
 * Every figure is read back from the statement already built by
 * buildStatement(), so the paper cannot disagree with the screen.
 */
export function buildStatementDocument({
  party,
  statement,
  company,
  from,
  to,
  coversFrom,
  lens,
}: {
  party: Party;
  statement: Statement;
  company: Company;
  from: string | null;
  to: string | null;
  /** Which view the ledger is read through. Wording only: the sums do not differ. */
  lens: PartyRole;
  /**
   * The party's earliest activity, used to state the real span an unbounded
   * statement covers. A statement that calls its period "all entries to date"
   * means something different every time it is printed.
   */
  coversFrom: string | null;
}): TDocumentDefinitions {
  const labels = statementLabels(lens);
  const asOf = to ?? todayInDhaka();

  const head: TableCell[] = [
    { text: 'Date', style: 'tableHead' },
    { text: 'Particulars', style: 'tableHead' },
    { text: 'Reference', style: 'tableHead' },
    { text: labels.debit, style: 'tableHead', alignment: 'right' },
    { text: labels.credit, style: 'tableHead', alignment: 'right' },
    { text: labels.balance, style: 'tableHead', alignment: 'right' },
  ];

  // The opening row states what was carried in, so the first balance in the
  // table is arrived at rather than asserted.
  const openingRow: TableCell[] = [
    { text: formatDate(from) || formatDate(party.openingAsOf) || '' },
    { text: labels.opening, bold: true },
    { text: '' },
    { text: '' },
    { text: '' },
    {
      text: formatBalance(statement.opening),
      alignment: 'right',
      bold: true,
    },
  ];

  const rows = statement.rows.map((row): TableCell[] => [
    { text: formatDate(row.date) },
    { text: row.particulars },
    { text: row.reference ?? '' },
    { text: row.debit ? formatTaka(row.debit) : '', alignment: 'right' },
    { text: row.credit ? formatTaka(row.credit) : '', alignment: 'right' },
    { text: formatBalance(row.balance), alignment: 'right' },
  ]);

  const emptyRow: TableCell[] = [
    { text: '' },
    { text: 'No entries in this period.', colSpan: 5, style: 'note' },
    { text: '' },
    { text: '' },
    { text: '' },
    { text: '' },
  ];

  const totalRow: TableCell[] = [
    { text: 'Total', colSpan: 3, style: 'totalRow' },
    { text: '' },
    { text: '' },
    { text: formatTaka(statement.totalDebit), alignment: 'right', bold: true },
    { text: formatTaka(statement.totalCredit), alignment: 'right', bold: true },
    {
      text: formatBalance(statement.closing),
      alignment: 'right',
      bold: true,
    },
  ];

  const body: ContentTable = {
    table: {
      headerRows: 1,
      // The heading row repeats when a statement runs past one page, so a
      // second page of figures is still readable on its own.
      dontBreakRows: true,
      widths: [54, '*', 78, 64, 64, 78],
      body: [
        head,
        openingRow,
        ...(rows.length > 0 ? rows : [emptyRow]),
        totalRow,
      ],
    },
    layout: ledgerLayout,
  };

  const meta: MetaPair[] = [
    ...(party.code ? [{ label: 'Party Code', value: party.code }] : []),
    { label: 'Print Date', value: formatDate(todayInDhaka()) },
    { label: 'Period', value: periodText(from, to, coversFrom, asOf) },
    { label: 'Party Type', value: rolesLabel(party.roles) },
    { label: 'Currency', value: 'BDT' },
  ];

  return buildDocument({
    company,
    title: 'Statement of Account',
    partyHeading: 'Ledger Of',
    party: {
      name: party.name,
      address: party.address,
      phone: party.phone,
    },
    meta,
    // The rule closes the details block off, so the letterhead rule above and
    // this one bracket it and the table below reads as its own band.
    beforeBody: [rule(4, 2), sectionLabel('TRANSACTION DETAILS')],
    body,
    afterBody: [
      summaryBand(statement, labels),
      inWordsLine(amountInWords(statement.closing)),
      ...advanceNote(party, statement),
      // A terminator, not a heading: it belongs to the figures above it, and
      // needs air on both sides so it reads as closing them off rather than
      // crowding the last line of words.
      {
        text: 'End of Statement',
        alignment: 'center' as const,
        fontSize: 7.5,
        characterSpacing: 0.8,
        margin: [0, 24, 0, 0] as [number, number, number, number],
      },
    ],
    signatories: ['Prepared By', 'Checked By', 'Authorized By'],
  });
}

/**
 * The same four figures the table already carries, said the way the trade says
 * them. An accounts clerk reads Debit and Credit fluently; an owner and a
 * purchase manager read "Total Billed" faster, and the statement goes to both.
 *
 * Stacked rather than set beside the words, because both grow: a book running
 * into crores widens every figure here, and a long amount in words wraps to
 * three lines. Side by side they squeezed each other.
 */
function summaryBand(
  statement: Statement,
  labels: ReturnType<typeof statementLabels>,
): Content {
  return {
    columns: [
      { width: '*', text: '' },
      {
        width: 'auto',
        ...labelledPairs([
          {
            label: labels.openingCarried,
            value: formatBalance(statement.opening),
          },
          {
            label: labels.totalBilled,
            value: formatTakaPrefixed(statement.totalBilled),
          },
          {
            label: labels.totalSettled,
            value: formatTakaPrefixed(statement.totalSettled),
          },
          {
            label: labels.closingCarried,
            value: formatBalance(statement.closing),
          },
        ]),
      },
    ],
    margin: [0, 9, 0, 0],
  };
}

/** A balance the other way round is an advance, and it is worth saying so. */
function advanceNote(party: Party, statement: Statement): Content[] {
  const side = balanceSide(statement.closing);
  // An advance runs the other way from what the party's role would suggest.
  const isAdvance = party.roles.customer ? side === 'Cr' : side === 'Dr';
  if (!isAdvance) return [];

  return [
    {
      text:
        party.roles.customer
          ? 'This closing balance is an advance held from the customer.'
          : 'This closing balance is an advance held with the subcontractor.',
      style: 'note',
      margin: [0, 5, 0, 0] as [number, number, number, number],
    },
  ];
}

/**
 * The span the statement actually covers. With no dates chosen it runs over the
 * party's whole history, and it says so by naming the real dates rather than
 * calling itself open ended: a period has to mean the same thing next month as
 * it does today.
 */
function periodText(
  from: string | null,
  to: string | null,
  coversFrom: string | null,
  asOf: string,
): string {
  const start = from ?? coversFrom;
  const end = to ?? asOf;
  if (!start) return `Up to ${formatDate(end)}`;
  return `${formatDate(start)} to ${formatDate(end)}`;
}

export function statementFileName(
  party: Party,
  company: Company,
  from: string | null,
  to: string | null,
): string {
  return documentFileName({
    company: company.name,
    documentType: 'Statement-of-Account',
    party: party.code ?? party.name,
    identifiers: from && to ? [from, 'to', to] : [to ?? todayInDhaka()],
  });
}
