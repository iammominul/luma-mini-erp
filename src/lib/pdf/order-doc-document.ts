import type {
  ContentTable,
  TableCell,
  TDocumentDefinitions,
} from 'pdfmake/interfaces';
import { formatQtyKg, formatRate, parseQtyKg, sumGrams } from '../amount';
import { formatDate } from '../dates';
import type { Company } from '../env';
import { amountInWords, formatTaka } from '../format';
import type { Party, PurchaseOrder, WorkOrder } from '../types';
import { workProcessLabel } from '../types';
import {
  buildDocument,
  inWordsLine,
  type MetaPair,
  tableLayout,
} from './document';
import { numberedFileName } from './file-name';

/**
 * The Purchase Order and the Work Order, as the A4 documents LUMA sends to a
 * spinner, a knitter and a dye house (2026-10-06).
 *
 * The letterhead, margins and signature block are document.ts's, the same as
 * every other document here. The order the lines serve is printed by the
 * customer's own reference where there is one, because that is what the mill
 * or the dye house will see on the fabric's paperwork; the SO number beside it
 * is LUMA's. No party code is printed.
 *
 * Figures arrive already worked out on the document; nothing is recalculated.
 */
export function buildOrderDocDocument(input: {
  doc: PurchaseOrder | WorkOrder;
  kind: 'po' | 'wo';
  party: Party;
  /** SO number to the customer's own reference, for the Order column. */
  customerRefs: Map<string, string | null>;
  company: Company;
}): TDocumentDefinitions {
  const { doc, kind, party, company } = input;
  const isWo = kind === 'wo';
  const wo = isWo ? (doc as WorkOrder) : null;
  const totalKg = sumGrams(doc.lines.map((line) => parseQtyKg(line.quantityKg)));

  const orderRef = (soNo: string) => {
    const ref = input.customerRefs.get(soNo);
    return ref ? `${ref} (${soNo})` : soNo;
  };

  const head: TableCell[] = [
    { text: 'SL', style: 'tableHead', alignment: 'center' },
    { text: 'Description', style: 'tableHead' },
    { text: 'For Order', style: 'tableHead' },
    ...(isWo
      ? [
          { text: 'Color', style: 'tableHead' },
          { text: 'GSM / Dia', style: 'tableHead' },
        ]
      : []),
    { text: isWo ? 'Grey (Kg)' : 'Yarn (Kg)', style: 'tableHead', alignment: 'right' },
    { text: 'Rate (Tk)', style: 'tableHead', alignment: 'right' },
    { text: 'Amount (Tk)', style: 'tableHead', alignment: 'right' },
  ] as TableCell[];

  const rows = isWo
    ? wo!.lines.map((line): TableCell[] => [
        { text: String(line.lineNo), alignment: 'center' },
        { text: line.description },
        { text: orderRef(line.orderDocNo) },
        { text: line.color ?? '' },
        { text: [line.gsm, line.dia].filter(Boolean).join(' / ') },
        { text: line.quantityKg, alignment: 'right' },
        { text: formatRate(line.rate), alignment: 'right' },
        { text: formatTaka(line.amount), alignment: 'right' },
      ])
    : doc.lines.map((line): TableCell[] => [
        { text: String(line.lineNo), alignment: 'center' },
        { text: line.description },
        { text: orderRef(line.orderDocNo) },
        { text: line.quantityKg, alignment: 'right' },
        { text: formatRate(line.rate), alignment: 'right' },
        { text: formatTaka(line.amount), alignment: 'right' },
      ]);

  const span = isWo ? 5 : 3;
  const totalRow: TableCell[] = [
    { text: 'Total', colSpan: span, style: 'totalRow', alignment: 'right' },
    ...Array.from({ length: span - 1 }, () => ({ text: '' })),
    { text: formatQtyKg(totalKg), alignment: 'right', bold: true },
    { text: '' },
    { text: formatTaka(doc.total), alignment: 'right', bold: true },
  ];

  const body: ContentTable = {
    table: {
      headerRows: 1,
      widths: isWo
        ? [18, '*', 74, 50, 54, 50, 42, 64]
        : [18, '*', 96, 56, 46, 70],
      body: [head, ...rows, totalRow],
    },
    layout: tableLayout,
  };

  const meta: MetaPair[] = [
    { label: isWo ? 'WO No' : 'PO No', value: doc.docNo },
    { label: 'Date', value: formatDate(doc.orderDate) },
    ...(wo ? [{ label: 'Process', value: workProcessLabel(wo.process) }] : []),
    ...(doc.deliveryBy
      ? [{ label: 'Delivery By', value: formatDate(doc.deliveryBy) }]
      : []),
    { label: 'Deliver To', value: doc.deliverToName ?? company.name },
  ];

  const note = (text: string, bold?: string) => ({
    text: bold ? [{ text: `${bold}: `, bold: true }, text] : text,
    margin: [0, 5, 0, 0] as [number, number, number, number],
    fontSize: 8.5,
  });

  return buildDocument({
    company,
    title: isWo ? 'Work Order' : 'Purchase Order',
    partyHeading: 'To',
    party: { name: party.name, address: party.address, phone: party.phone },
    meta,
    body,
    afterBody: [
      inWordsLine(amountInWords(doc.total)),
      ...(doc.terms ? [note(doc.terms, 'Terms')] : []),
      ...(doc.notes ? [note(doc.notes, 'Remarks')] : []),
      {
        text: 'Rate is per kilogram. Please quote this number on your challan and bill.',
        style: 'note',
        margin: [0, 5, 0, 0] as [number, number, number, number],
      },
    ],
    signatories: ['Prepared By', 'Checked By', 'Authorized Signature'],
  });
}

/** The download filename: the number printed on it. */
export function orderDocFileName(doc: { docNo: string }): string {
  return numberedFileName(doc.docNo);
}
