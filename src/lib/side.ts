import type { BillDirection, PartyRole, PaymentDirection } from './types';

/**
 * The two lenses the app is read through, and what each one means.
 *
 * A lens is not a property of a party any more. It is a view: which role we are
 * looking at, and therefore which way a bill or a payment created here runs. A
 * party who is both a customer and a subcontractor appears under both lenses,
 * with the documents raised in each keeping their own direction, and one ledger
 * adding them all up.
 *
 * A supplier lens will slot in here when there is a supplier to trade with. It
 * behaves exactly as the subcontractor lens does: bills received, money out.
 */

export type Side = 'customer' | 'subcontractor';

export type SideCopy = {
  side: Side;
  /** The party role this lens looks at. */
  role: PartyRole;
  /** Which way a bill raised under this lens runs. */
  billDirection: BillDirection;
  /** Which way money moves under this lens. */
  paymentDirection: PaymentDirection;
  partyWord: string;
  partyPlural: string;
  billTitle: string;
  billSingular: string;
  settlementTitle: string;
  settlementSingular: string;
  /** Column heading for the settlement amount on a statement. */
  settlementColumn: string;
  balanceWord: string;
  outstandingWord: string;
  /** Money received "from" a customer, paid "to" a subcontractor. */
  direction: string;
  /** Whether the bill number is ours to issue or theirs to quote. */
  billNoIsOurs: boolean;
};

const COPY: Record<Side, SideCopy> = {
  customer: {
    side: 'customer',
    role: 'customer',
    billDirection: 'issued',
    paymentDirection: 'in',
    partyWord: 'Customer',
    partyPlural: 'Customers',
    billTitle: 'Customer Bills',
    billSingular: 'Customer Bill',
    settlementTitle: 'Receipts',
    settlementSingular: 'Receipt',
    settlementColumn: 'Amount Received',
    balanceWord: 'Balance Due',
    outstandingWord: 'Receivable',
    direction: 'from',
    billNoIsOurs: true,
  },
  subcontractor: {
    side: 'subcontractor',
    role: 'subcontractor',
    billDirection: 'received',
    paymentDirection: 'out',
    partyWord: 'Subcontractor',
    partyPlural: 'Subcontractors',
    billTitle: 'Bills Received',
    billSingular: 'Bill Received',
    settlementTitle: 'Payments',
    settlementSingular: 'Payment',
    settlementColumn: 'Amount Paid',
    balanceWord: 'Balance Payable',
    outstandingWord: 'Payable',
    direction: 'to',
    billNoIsOurs: false,
  },
};

export function isSide(value: string): value is Side {
  return value === 'customer' || value === 'subcontractor';
}

export function copyFor(side: Side): SideCopy {
  return COPY[side];
}
