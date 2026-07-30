import type { PartyType } from './types';

/**
 * The app has two mirror-image sides: what customers owe us, and what we owe
 * subcontractors. The arithmetic is identical, so the pages are shared and only
 * the wording changes. All of that wording lives here.
 */

export type Side = PartyType;

export type SideCopy = {
  side: Side;
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
