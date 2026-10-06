import type {
  ContentTable,
  TableCell,
  TDocumentDefinitions,
} from 'pdfmake/interfaces';
import { formatQtyKg, formatRate, parseQtyKg, sumGrams } from '../amount';
import { formatDate } from '../dates';
import type { Company } from '../env';
import { amountInWords, formatTaka } from '../format';
import type { Bill } from '../types';
import { natureOfWorkLabel } from '../types';
import {
  buildDocument,
  inWordsLine,
  type MetaPair,
  tableLayout,
} from './document';
import { describedFileName, numberedFileName } from './file-name';

/**
 * The Bill, as an A4 document, for either side of the business.
 *
 * The bill LUMA sends is still hand-written, so the number on this document is
 * that hand-written number: paper and PDF have to agree when a customer holds
 * both. The system's own number is recorded but deliberately not printed. When
 * billing moves fully into the ERP the hand-written bill retires, and the system
 * number becomes the number on this line without anything else about the
 * document changing.
 *
 * Figures come off the saved bill, computed once at posting. Nothing is
 * recalculated here.
 */
export function buildBillDocument(
  bill: Bill,
  company: Company,
): TDocumentDefinitions {
  const isCustomer = bill.direction === 'issued';
  const totalGrey = sumGrams(bill.lines.map((l) => parseQtyKg(l.greyKg)));
  const totalFinished = sumGrams(
    bill.lines.map((l) => (l.finishedKg ? parseQtyKg(l.finishedKg) : 0n)),
  );
  const anyFinished = bill.lines.some((line) => line.finishedKg !== null);

  const head: TableCell[] = [
    { text: 'SL', style: 'tableHead', alignment: 'center' },
    { text: 'Description', style: 'tableHead' },
    { text: 'LOT No', style: 'tableHead' },
    { text: 'Color', style: 'tableHead' },
    // Grey weight leads: it is what the amount is billed on, and the finished
    // weight sits beside it as the figure it is read against.
    { text: 'G/W (Kg)', style: 'tableHead', alignment: 'right' },
    { text: 'F/W (Kg)', style: 'tableHead', alignment: 'right' },
    { text: 'Rate (Tk)', style: 'tableHead', alignment: 'right' },
    { text: 'Amount (Tk)', style: 'tableHead', alignment: 'right' },
  ];

  const totalRow: TableCell[] = [
    { text: 'Total', colSpan: 4, style: 'totalRow', alignment: 'right' },
    { text: '' },
    { text: '' },
    { text: '' },
    { text: formatQtyKg(totalGrey), alignment: 'right', bold: true },
    {
      text: anyFinished ? formatQtyKg(totalFinished) : '',
      alignment: 'right',
      bold: true,
    },
    { text: '' },
    { text: formatTaka(bill.total), alignment: 'right', bold: true },
  ];

  const body: ContentTable = {
    table: {
      headerRows: 1,
      widths: [18, '*', 52, 56, 52, 52, 44, 68],
      body: [
        head,
        ...bill.lines.map((line): TableCell[] => [
          { text: String(line.lineNo), alignment: 'center' },
          { text: line.description },
          { text: line.lotNo ?? '' },
          { text: line.color ?? '' },
          { text: line.greyKg, alignment: 'right' },
          { text: line.finishedKg ?? '', alignment: 'right' },
          { text: formatRate(line.rate), alignment: 'right' },
          { text: formatTaka(line.amount), alignment: 'right' },
        ]),
        totalRow,
      ],
    },
    layout: tableLayout,
  };

  // One bill usually covers one order, but it can cover several, so the distinct
  // order numbers off the lines are what gets stated rather than a single one.
  const orderNos = [
    ...new Set(
      bill.lines
        .map((line) => line.orderNo)
        .filter((no): no is string => Boolean(no)),
    ),
  ];

  // The number printed is the system's on a customer bill (2026-10-06): its CB
  // number, or DRAFT until it is posted. The paper book's number rides beside
  // it as Paper Ref. A bill received is the party's document, so it leads with
  // their own number; this copy is LUMA's record of it and carries the BR
  // number it is filed under.
  const meta: MetaPair[] = isCustomer
    ? [
        { label: 'Bill No', value: bill.docNo ?? 'DRAFT' },
        ...(bill.billNo ? [{ label: 'Paper Ref', value: bill.billNo }] : []),
      ]
    : [
        { label: 'Bill No', value: bill.billNo ?? '' },
        ...(bill.docNo ? [{ label: 'Filed As', value: bill.docNo }] : []),
      ];
  meta.push({
    label: 'Nature of Work',
    value: natureOfWorkLabel(bill.natureOfWork),
  });
  if (orderNos.length > 0) {
    meta.push({
      label: orderNos.length > 1 ? 'Order Nos' : 'Order No',
      value: orderNos.join(', '),
    });
  }
  meta.push({ label: 'Date', value: formatDate(bill.billDate) });

  return buildDocument({
    company,
    title: 'Bill',
    partyHeading: isCustomer ? 'To' : 'From',
    party: {
      name: bill.party.name,
      address: bill.party.address,
      phone: bill.party.phone,
    },
    meta,
    body,
    afterBody: [
      inWordsLine(amountInWords(bill.total)),
      ...(bill.notes
        ? [
            {
              text: [{ text: 'Remarks: ', bold: true }, bill.notes],
              margin: [0, 5, 0, 0] as [number, number, number, number],
              fontSize: 8.5,
            },
          ]
        : []),
      {
        text:
          bill.natureOfWork === 'yarn'
            ? 'Rate is per kilogram of yarn.'
            : 'Rate is per kilogram on the gross (greige) weight.',
        style: 'note',
        margin: [0, 5, 0, 0] as [number, number, number, number],
      },
    ],
    signatories: [
      isCustomer ? 'Prepared By' : 'Recorded By',
      'Checked By',
      'Authorized Signature',
    ],
  });
}

/**
 * The download filename: the number printed on the bill. A customer draft has
 * none yet, so it is named for what it is and its date.
 */
export function billFileName(bill: Bill): string {
  if (bill.docNo) return numberedFileName(bill.docNo);
  return describedFileName(['CB', 'DRAFT', bill.billDate]);
}
