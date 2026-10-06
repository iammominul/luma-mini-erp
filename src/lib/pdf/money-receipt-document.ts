import type {
  ContentTable,
  TableCell,
  TDocumentDefinitions,
} from 'pdfmake/interfaces';
import { formatDate } from '../dates';
import type { Company } from '../env';
import { amountInWords, formatTaka } from '../format';
import type { Party, Payment } from '../types';
import { paymentModeLabel } from '../types';
import {
  buildDocument,
  inWordsLine,
  type MetaPair,
  tableLayout,
} from './document';
import { describedFileName, numberedFileName } from './file-name';

/**
 * The document that acknowledges a settlement.
 *
 * Money in is a Money Receipt, the paper a customer expects back when they pay.
 * Money out is a Payment Voucher, which is the same document read the other way
 * and is what a subcontractor signs against. One builder, because the letterhead,
 * the table and the signature block are identical and only the wording turns.
 *
 * There is no separate receipt serial in the book. The reference field is where
 * the Money Receipt serial is written when there is one, alongside a cheque
 * number or a bank reference, so that is what prints as the document reference.
 */
export function buildMoneyReceiptDocument({
  payment,
  party,
  company,
}: {
  payment: Payment;
  party: Party;
  company: Company;
}): TDocumentDefinitions {
  const isReceipt = payment.direction === 'in';
  const mode = paymentModeLabel(payment.mode);

  const particulars =
    payment.narration ??
    `Being amount ${isReceipt ? 'received from' : 'paid to'} ${party.name} against outstanding bills.`;

  const body: ContentTable = {
    table: {
      headerRows: 1,
      widths: [20, '*', 96],
      body: [
        [
          { text: 'SL', style: 'tableHead', alignment: 'center' },
          { text: 'Particulars', style: 'tableHead' },
          { text: 'Amount (Tk)', style: 'tableHead', alignment: 'right' },
        ] as TableCell[],
        [
          { text: '1', alignment: 'center' },
          { text: particulars },
          { text: formatTaka(payment.amount), alignment: 'right' },
        ] as TableCell[],
        [
          { text: 'Total', colSpan: 2, style: 'totalRow', alignment: 'right' },
          { text: '' },
          { text: formatTaka(payment.amount), alignment: 'right', bold: true },
        ] as TableCell[],
      ],
    },
    layout: tableLayout,
  };

  // The voucher number leads: MR on a receipt, PV on a payment (2026-10-06).
  // The paper receipt book's serial, or the cheque or bank reference, follows.
  const meta: MetaPair[] = [
    ...(payment.docNo
      ? [{ label: isReceipt ? 'Receipt No' : 'Voucher No', value: payment.docNo }]
      : []),
    { label: 'Date', value: formatDate(payment.paidOn) },
    { label: 'Mode', value: mode },
  ];
  if (payment.reference) {
    meta.push({ label: 'Reference', value: payment.reference });
  }

  // A cheque is not money until it clears, and a receipt that does not say so
  // has settled a balance the bank may yet refuse.
  const conditional =
    payment.mode === 'cheque'
      ? 'Received subject to realization of the instrument.'
      : null;

  return buildDocument({
    company,
    title: isReceipt ? 'Money Receipt' : 'Payment Voucher',
    partyHeading: isReceipt ? 'Received From' : 'Paid To',
    party: {
      name: party.name,
      address: party.address,
      phone: party.phone,
    },
    meta,
    body,
    afterBody: [
      inWordsLine(amountInWords(payment.amount)),
      ...(payment.notes
        ? [
            {
              text: [{ text: 'Remarks: ', bold: true }, payment.notes],
              margin: [0, 5, 0, 0] as [number, number, number, number],
              fontSize: 8.5,
            },
          ]
        : []),
      ...(conditional
        ? [
            {
              text: conditional,
              style: 'note',
              margin: [0, 5, 0, 0] as [number, number, number, number],
            },
          ]
        : []),
    ],
    signatories: [
      isReceipt ? 'Received By' : 'Paid By',
      'Checked By',
      'Authorized Signature',
    ],
  });
}

/**
 * The download filename: the voucher number printed on it. A row older than
 * the numbering has none until the next schema apply, and is named for what it
 * is, who it was with and the day.
 */
export function moneyReceiptFileName(payment: Payment, party: Party): string {
  if (payment.docNo) return numberedFileName(payment.docNo);
  return describedFileName([
    payment.direction === 'in' ? 'Money Receipt' : 'Payment Voucher',
    party.name,
    payment.paidOn,
  ]);
}
