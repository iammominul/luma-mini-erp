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
 *
 * The lens is plural because it names a collection in a URL, the same as
 * `/parties` does: `/customers/bills`, `/subcontractors/settlements`. The role it
 * looks at stays singular, because that describes one party. Keeping the two
 * apart is what stops the URL vocabulary drifting from the domain vocabulary.
 */

export type Side = 'customers' | 'subcontractors';

/**
 * What the old singular URLs map to. They were live before the plural ones, so
 * they still resolve and redirect rather than 404: someone has bookmarked a
 * statement by now, and a bill number in an email outlives a refactor.
 */
export const LEGACY_SIDES: Record<string, Side> = {
  customer: 'customers',
  subcontractor: 'subcontractors',
};

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
  customers: {
    side: 'customers',
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
  subcontractors: {
    side: 'subcontractors',
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
  return value === 'customers' || value === 'subcontractors';
}

export function copyFor(side: Side): SideCopy {
  return COPY[side];
}
