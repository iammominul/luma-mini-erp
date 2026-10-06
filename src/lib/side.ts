import type { BillDirection, PartyRole, PaymentDirection } from './types';

/**
 * The three lenses the app is read through, and what each one means.
 *
 * A lens is not a property of a party any more. It is a view: which role we are
 * looking at, and therefore which way a bill or a payment created here runs. A
 * party who is both a customer and a subcontractor appears under both lenses,
 * with the documents raised in each keeping their own direction, and one ledger
 * adding them all up.
 *
 * The supplier lens (2026-10-06) runs the way the subcontractor lens does,
 * bills received and money out, which is exactly why a document records its
 * party_role: direction alone cannot tell a yarn bill from a knitting bill.
 *
 * The lens is plural because it names a collection in a URL, the same as
 * `/parties` does: `/customers/bills`, `/subcontractors/settlements`. The role it
 * looks at stays singular, because that describes one party. Keeping the two
 * apart is what stops the URL vocabulary drifting from the domain vocabulary.
 */

export type Side = 'customers' | 'subcontractors' | 'suppliers';

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
    // Named for the party since suppliers arrived, so the two payable lenses
    // never share a title (2026-10-06).
    billTitle: 'Subcontractor Bills',
    billSingular: 'Subcontractor Bill',
    settlementTitle: 'Subcontractor Payments',
    settlementSingular: 'Payment',
    settlementColumn: 'Amount Paid',
    balanceWord: 'Balance Payable',
    outstandingWord: 'Payable',
    direction: 'to',
    billNoIsOurs: false,
  },
  suppliers: {
    side: 'suppliers',
    role: 'supplier',
    billDirection: 'received',
    paymentDirection: 'out',
    partyWord: 'Supplier',
    partyPlural: 'Suppliers',
    billTitle: 'Supplier Bills',
    billSingular: 'Supplier Bill',
    settlementTitle: 'Supplier Payments',
    settlementSingular: 'Payment',
    settlementColumn: 'Amount Paid',
    balanceWord: 'Balance Payable',
    outstandingWord: 'Payable',
    direction: 'to',
    billNoIsOurs: false,
  },
};

export const SIDES: readonly Side[] = ['customers', 'subcontractors', 'suppliers'];

export function isSide(value: string): value is Side {
  return (SIDES as readonly string[]).includes(value);
}

export function copyFor(side: Side): SideCopy {
  return COPY[side];
}

/** The lens a party role is read through. */
export function sideForRole(role: PartyRole): Side {
  return role === 'customer'
    ? 'customers'
    : role === 'supplier'
      ? 'suppliers'
      : 'subcontractors';
}
