import { describe, expect, it } from 'vitest';
import type { Company } from '../env';
import { Money } from '../money';
import { buildStatement } from '../statement';
import type { Bill, Party, Payment } from '../types';
import { billFileName, buildBillDocument } from './bill-document';
import { flattenDocumentText } from './document';
import {
  buildMoneyReceiptDocument,
  moneyReceiptFileName,
} from './money-receipt-document';
import { letterheadLogo } from './letterhead-logo';
import { renderPdf } from './render';
import {
  buildStatementDocument,
  statementFileName,
} from './statement-document';

/**
 * Golden tests for the documents. Two things are checked: that the definition
 * carries every block a signed document must have, and that it renders to real
 * PDF bytes with the bundled fonts. The second one is what catches a missing
 * font file, which is otherwise a deploy-time surprise.
 */

const company: Company = {
  name: 'LUMA TEXTILE',
  address:
    'H12, Road NS-01, Block K, Eastern Housing, Pallabi, Dhaka-1216, Bangladesh',
  phone: '+880 1778-661144, +880 1711-659155',
  email: 'info@lumatextile.com',
  web: 'www.lumatextile.com',
};

const customer: Party = {
  id: '11111111-1111-4111-8111-111111111111',
  code: 'CUS-0004',
  name: 'Bangla Japan Trading Ltd.',
  roles: { customer: true, subcontractor: false, supplier: false },
  contactPerson: 'Karim',
  phone: '+880 1800 000000',
  address: 'Narayanganj',
  openingBalance: Money.fromDecimal('120000.00'),
  openingAsOf: '2026-07-01',
  active: true,
};

const bill: Bill = {
  id: '22222222-2222-4222-8222-222222222222',
  status: 'posted',
  needsDetail: false,
  greyKg: '2130.000',
  finishedKg: '2069.500',
  natureOfWork: 'dyeing_finishing',
  narration: null,
  billNo: '889',
  bookNo: '3',
  docNo: 'CB-26-0042',
  billDate: '2026-07-28',
  reference: null,
  notes: 'Shade approved against lab dip 214.',
  total: Money.fromDecimal('302180.00'),
  partyId: customer.id,
  partyName: customer.name,
  direction: 'issued',
  party: customer,
  lines: [
    {
      id: 'l1',
      lineNo: 1,
      description: 'S/J 100% Cotton, Lot 12',
      fabricType: 'S/J',
      color: 'Black',
      challanNo: '1050',
      orderNo: '75-T',
      greyKg: '1240.000',
      finishedKg: '1198.500',
      rate: '159.00',
      amount: Money.fromDecimal('197160.00'),
    },
    {
      id: 'l2',
      lineNo: 2,
      description: '1x1 Rib, Lot 15',
      fabricType: '1x1 Rib',
      color: 'White',
      challanNo: '1051',
      orderNo: '75-T',
      greyKg: '890.000',
      finishedKg: '871.000',
      rate: '118.00',
      amount: Money.fromDecimal('105020.00'),
    },
  ],
};

describe('the letterhead logo', () => {
  const logo = letterheadLogo();

  it('is bundled and found', () => {
    expect(logo).not.toBeNull();
  });

  // pdfmake renders a string SVG with useCSS false and has no access to the
  // design font, so a class-driven fill would print black and a <text> element
  // would fail. Both are caught here rather than on a customer's bill.
  it('carries its fills on the elements, not in a stylesheet', () => {
    expect(logo).toContain('fill="#142b40"');
    expect(logo).not.toContain('<style');
    expect(logo).not.toContain('class="st');
  });

  it('has no text element needing a font this renderer lacks', () => {
    expect(logo).not.toContain('<text');
  });

  it('is cropped to the artwork so it does not scale to nothing', () => {
    expect(logo).toContain('viewBox="134 500 864 146"');
  });
});

describe('customer bill document', () => {
  const text = flattenDocumentText(buildBillDocument(bill, company));

  it('prints the letterhead from settings, not a hard-coded company', () => {
    expect(text).toContain('Eastern Housing, Pallabi, Dhaka-1216');
    expect(text).toContain('Mobile: +880 1778-661144, +880 1711-659155');
    expect(text).toContain('Email: info@lumatextile.com');
    expect(text).toContain('Web: www.lumatextile.com');
  });

  it('is titled BILL', () => {
    expect(text).toContain('BILL');
  });

  it('states the hand-written bill number, the order, and the date', () => {
    expect(text).toContain('Bill No');
    expect(text).toContain('889');
    expect(text).toContain('Order No');
    expect(text).toContain('75-T');
    expect(text).toContain('Date');
    expect(text).toContain('28/07/2026');
  });

  // Both are recorded, and both stay off the paper until billing moves fully
  // into the ERP and the bill book retires.
  it('keeps the book number and our own reference off the document', () => {
    expect(text).not.toContain('Book No');
    expect(text).not.toContain('CB-26-0042');
  });

  it('carries the columns a dyeing bill is read by', () => {
    for (const heading of [
      'SL',
      'Particulars',
      'F/T',
      'Color',
      'F/W (Kg)',
      'G/W (Kg)',
      'Rate (Tk)',
      'Amount (Tk)',
    ]) {
      expect(text).toContain(heading);
    }
  });

  it('prints the fabric type, color, and both weights on every line', () => {
    expect(text).toContain('S/J');
    expect(text).toContain('Black');
    expect(text).toContain('1x1 Rib');
    expect(text).toContain('White');
    expect(text).toContain('1240.000');
    expect(text).toContain('1198.500');
  });

  it('totals both weights and the money', () => {
    expect(text).toContain('2130.000');
    expect(text).toContain('2069.500');
    expect(text).toContain('3,02,180.00');
  });

  it('states the amount in words, as a signed document must', () => {
    expect(text).toContain('In Words: ');
    expect(text).toContain('Three Lakh Two Thousand One Hundred Eighty');
  });

  it('has the three signatories a bill is signed off by', () => {
    expect(text).toContain('Prepared By');
    expect(text).toContain('Checked By');
    expect(text).toContain('Authorized Signature');
  });

  it('states what the work was', () => {
    expect(text).toContain('Nature of Work');
    expect(text).toContain('Dyeing & Finishing');
  });

  it('names the file so a folder of them sorts usefully', () => {
    expect(billFileName(bill, company)).toBe(
      'LUMA-TEXTILE_Bill_CUS-0004_889_2026-07-28.pdf',
    );
  });

  it('renders to A4 with the bundled fonts', async () => {
    const bytes = await renderPdf(buildBillDocument(bill, company));
    expect(bytes.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    expect(bytes.byteLength).toBeGreaterThan(2000);
  });
});

describe('statement of account document', () => {
  const statement = buildStatement({
    openingBalance: customer.openingBalance,
    movements: [
      {
        id: 'b1',
        kind: 'bill',
        side: 'debit',
        date: '2026-07-28',
        particulars: 'Dyeing Bill, Order 75-T, Challan 1050',
        reference: 'Bill 889',
        amount: Money.fromDecimal('302180.00'),
      },
      {
        id: 'p1',
        kind: 'payment',
        side: 'credit',
        date: '2026-07-29',
        particulars: 'Money Received by Bank Transfer, EBL',
        reference: 'MR 512',
        amount: Money.fromDecimal('200000.00'),
      },
    ],
    from: '2026-07-01',
    to: '2026-07-31',
  });

  const text = flattenDocumentText(
    buildStatementDocument({
      party: customer,
      statement,
      company,
      from: '2026-07-01',
      to: '2026-07-31',
      coversFrom: '2026-07-01',
      lens: 'customer' as const,
    }),
  );

  // The document goes to a party's accounts department, and Statement of
  // Account is the name that department expects. Party Ledger stays the
  // internal name, on the screen and in the ERP's M8.
  it('is titled the way the party receiving it expects', () => {
    expect(text).toContain('STATEMENT OF ACCOUNT');
    expect(text).toContain('Ledger Of');
    expect(text).toContain('End of Statement');
  });

  // A statement is identified by the party and the period, the way a ledger
  // always has been. The party code is what tells two similar names apart and
  // what a customer's accounts department reconciles against.
  it('identifies the party by code, not the statement by number', () => {
    expect(text).toContain('Party Code');
    expect(text).toContain('CUS-0004');
    expect(text).not.toContain('Statement No');
  });

  it('states the currency, leaving nothing to be inferred', () => {
    expect(text).toContain('Currency');
    expect(text).toContain('BDT');
  });

  it('reads as a ledger, with the currency declared once in the details', () => {
    expect(text).toContain('TRANSACTION DETAILS');
    for (const heading of [
      'Date',
      'Particulars',
      'Reference',
      'Debit',
      'Credit',
      'Balance',
    ]) {
      expect(text).toContain(heading);
    }
  });

  // Lakh and crore grouping, so the digits agree with the words describing the
  // same figure. Western grouping would print 222,180.00 beside words that say
  // Two Lakh, and the document would contradict itself.
  it('groups figures the way the amount in words says them', () => {
    expect(text).toContain('2,22,180.00 Dr');
    expect(text).toContain('Two Lakh Twenty Two Thousand One Hundred Eighty');
    expect(text).not.toContain('222,180.00');
  });

  // The table speaks Debit and Credit; the summary says it in trade terms, for
  // the reader who does not think in those.
  it('restates the four figures in trade language', () => {
    expect(text).toContain('Opening Balance (B/F)');
    expect(text).toContain('Total Billed');
    expect(text).toContain('Total Received');
    expect(text).toContain('Closing Balance (C/F)');
  });

  it('frames the period the way a statement is read', () => {
    expect(text).toContain('Print Date');
    expect(text).toContain('Period');
    expect(text).toContain('01/07/2026 to 31/07/2026');
    expect(text).toContain('Party Type');
    expect(text).toContain('Customer');
  });

  // A ledger totals inside its own table, which is where an accounts person
  // looks for the figure, and states the outstanding amount underneath it.
  it('totals inside the table and closes on the outstanding figure', () => {
    expect(text).toContain('Total');
    expect(text).toContain('3,02,180.00');
    expect(text).toContain('2,00,000.00');
    expect(text).toContain('2,22,180.00 Dr');
  });

  it('uses no bank vocabulary', () => {
    expect(text).not.toContain('Total Withdrawal');
    expect(text).not.toContain('Total Deposit');
    expect(text).not.toContain('Available Balance');
  });

  it('opens with the balance carried in', () => {
    expect(text).toContain('Opening Balance');
    expect(text).toContain('1,20,000.00 Dr');
  });

  it('shows a bill as a debit and money received as a credit', () => {
    expect(text).toContain('Dyeing Bill, Order 75-T, Challan 1050');
    expect(text).toContain('Bill 889');
    expect(text).toContain('Money Received by Bank Transfer, EBL');
    expect(text).toContain('MR 512');
  });

  it('closes on the running balance with its side stated', () => {
    expect(text).toContain('2,22,180.00 Dr');
  });

  it('is signed off the way an issued document is', () => {
    expect(text).toContain('Prepared By');
    expect(text).toContain('Checked By');
    expect(text).toContain('Authorized By');
    expect(text).not.toContain('This is a computer generated statement.');
  });

  // The Total row inside the table already states the closing balance, so
  // restating it below would say the same figure twice. Only the words follow.
  it('states the closing balance once, in the table, then its words', () => {
    expect(text).toContain('2,22,180.00 Dr');
    expect(text).toContain('In Words: ');
    expect(text).toContain('Two Lakh Twenty Two Thousand One Hundred Eighty');
    expect(text).not.toContain('Net Receivable as on');
  });

  it('renders to real PDF bytes', async () => {
    const bytes = await renderPdf(
      buildStatementDocument({
        party: customer,
        statement,
        company,
        from: '2026-07-01',
        to: '2026-07-31',
        coversFrom: '2026-07-01',
        lens: 'customer' as const,
      }),
    );
    expect(bytes.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    expect(bytes.byteLength).toBeGreaterThan(2000);
  });

  it('names the file with the party and the period', () => {
    expect(
      statementFileName(customer, company, '2026-07-01', '2026-07-31'),
    ).toBe(
      'LUMA-TEXTILE_Statement-of-Account_CUS-0004_2026-07-01_to_2026-07-31.pdf',
    );
  });
});

const receipt: Payment = {
  id: '33333333-3333-4333-8333-333333333333',
  narration: null,
  partyId: customer.id,
  partyName: customer.name,
  direction: 'in',
  paidOn: '2026-07-30',
  amount: Money.fromDecimal('250000.00'),
  mode: 'cheque',
  reference: 'MR-114',
  notes: null,
};

describe('money receipt document', () => {
  const text = flattenDocumentText(
    buildMoneyReceiptDocument({ payment: receipt, party: customer, company }),
  );

  it('is titled MONEY RECEIPT and names who paid', () => {
    expect(text).toContain('MONEY RECEIPT');
    expect(text).toContain('Received From');
    expect(text).toContain('Bangla Japan Trading Ltd.');
  });

  it('states the date, the mode and the reference', () => {
    expect(text).toContain('30/07/2026');
    expect(text).toContain('Cheque');
    expect(text).toContain('MR-114');
  });

  it('carries the amount as figures and as words', () => {
    expect(text).toContain('2,50,000.00');
    expect(text).toContain('Two Lakh Fifty Thousand');
  });

  // A cheque is not money until it clears. A receipt that settles a balance
  // without saying so has acknowledged payment the bank may yet refuse.
  it('qualifies a cheque as subject to realization', () => {
    expect(text).toContain('subject to realization');
  });

  it('turns into a payment voucher when the money goes out', () => {
    const voucher = flattenDocumentText(
      buildMoneyReceiptDocument({
        payment: { ...receipt, direction: 'out', mode: 'bank_transfer' },
        party: customer,
        company,
      }),
    );
    expect(voucher).toContain('PAYMENT VOUCHER');
    expect(voucher).toContain('Paid To');
    expect(voucher).not.toContain('subject to realization');
  });

  it('renders to real PDF bytes', async () => {
    const bytes = await renderPdf(
      buildMoneyReceiptDocument({ payment: receipt, party: customer, company }),
    );
    expect(bytes.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    expect(bytes.byteLength).toBeGreaterThan(2000);
  });

  it('names the file with the party and the reference', () => {
    expect(moneyReceiptFileName(receipt, customer, company)).toBe(
      'LUMA-TEXTILE_Money-Receipt_CUS-0004_MR-114_2026-07-30.pdf',
    );
  });
});
