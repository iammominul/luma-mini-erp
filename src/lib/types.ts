import type { Money } from './money';

/**
 * The roles a party can hold. A company can hold more than one: a dye house
 * that processes our fabric and also sells us yarn is one party, not two.
 */
export type PartyRole = 'customer' | 'subcontractor' | 'supplier';

export type PartyRoles = {
  customer: boolean;
  subcontractor: boolean;
  supplier: boolean;
};

export const PARTY_ROLES: { value: PartyRole; label: string }[] = [
  { value: 'customer', label: 'Customer' },
  { value: 'subcontractor', label: 'Subcontractor' },
  { value: 'supplier', label: 'Supplier' },
];

/** Which way a document moves the balance. */
export type BillDirection = 'issued' | 'received';

/**
 * A draft is entered but not part of the book: out of every balance, off every
 * statement, and holding no system number until it is posted. Posting is what
 * makes a bill real, and it is the point at which its number is issued.
 */
export type BillStatus = 'draft' | 'posted';
export type PaymentDirection = 'in' | 'out';

/** The methods the full ERP records, so a payment exports without translation. */
export type PaymentMode =
  | 'cash'
  | 'mobile_banking'
  | 'bank_transfer'
  | 'cheque'
  | 'rtgs'
  | 'lc'
  | 'other';

export const PAYMENT_MODES: { value: PaymentMode; label: string }[] = [
  { value: 'cash', label: 'Cash' },
  { value: 'mobile_banking', label: 'Mobile Banking' },
  { value: 'bank_transfer', label: 'Bank Transfer' },
  { value: 'cheque', label: 'Cheque' },
  { value: 'rtgs', label: 'RTGS' },
  { value: 'lc', label: 'LC' },
  { value: 'other', label: 'Other' },
];

export function paymentModeLabel(mode: string): string {
  return PAYMENT_MODES.find((m) => m.value === mode)?.label ?? mode;
}

/**
 * What the work was. LUMA mainly dyes and finishes fabric a customer sends, but
 * also knits, and sometimes supplies finished fabric from yarn as a full
 * package. The bill and the ledger both have to say which.
 *
 * "Nature of Work" is how a bill in this trade words it. Not "process", which
 * in the full ERP already means a per-line add-on charge (Enzyme, Compacting),
 * and not "process loss", which is a different figure again.
 */
export type NatureOfWork =
  | 'dyeing_finishing'
  | 'knitting'
  | 'knitting_dyeing_finishing'
  | 'full_package'
  | 'other';

export const NATURE_OF_WORK: { value: NatureOfWork; label: string }[] = [
  { value: 'dyeing_finishing', label: 'Dyeing & Finishing' },
  { value: 'knitting', label: 'Knitting' },
  { value: 'knitting_dyeing_finishing', label: 'Knitting, Dyeing & Finishing' },
  { value: 'full_package', label: 'Full Package, Yarn to Finished Fabric' },
  { value: 'other', label: 'Processing' },
];

export function natureOfWorkLabel(value: string): string {
  return (
    NATURE_OF_WORK.find((s) => s.value === value)?.label ?? 'Dyeing & Finishing'
  );
}

export type Party = {
  id: string;
  /** The human-readable key: CUS-0001, SUB-0001. */
  code: string | null;
  name: string;
  roles: PartyRoles;
  contactPerson: string | null;
  phone: string | null;
  address: string | null;
  openingBalance: Money;
  /** 'YYYY-MM-DD' */
  openingAsOf: string | null;
  active: boolean;
};

export type PartyBalance = {
  party: Party;
  billed: Money;
  settled: Money;
  /** Positive is receivable, negative payable. One convention, both ways. */
  balance: Money;
  billCount: number;
  lastActivity: string | null;
};

export type BillLine = {
  id: string;
  lineNo: number;
  description: string;
  /** S/J, 1x1 Rib, Interlock, Lycra: what the fabric is. */
  fabricType: string | null;
  color: string | null;
  /** Hand-written challan serial this lot went out on. */
  challanNo: string | null;
  /** The customer's own order number. */
  orderNo: string | null;
  /** Grey weight in kg as text, up to three decimals. The billing basis. */
  greyKg: string;
  /** Finished weight in kg as text, recorded from the paper bill. */
  finishedKg: string | null;
  rate: string;
  amount: Money;
};

export type BillSummary = {
  id: string;
  status: BillStatus;
  /** Posted, but its lines still have no fabric type or color recorded. */
  needsDetail: boolean;
  /** Weights totalled from the lines, so a list can show them without loading each. */
  greyKg: string | null;
  finishedKg: string | null;
  /** Which service this bill is for. */
  natureOfWork: NatureOfWork;
  /** Overrides the Particulars the ledger would compose. */
  narration: string | null;
  /** The hand-written number, from LUMA's bill book or the subcontractor's bill. */
  billNo: string;
  /** Which bill book the number was written in. Null on a bill received. */
  bookNo: string | null;
  /** The system's own gapless number, 'CB-26-0001'. Null on a bill received. */
  docNo: string | null;
  /** 'YYYY-MM-DD' */
  billDate: string;
  reference: string | null;
  notes: string | null;
  total: Money;
  partyId: string;
  partyName: string;
  /** Which way this bill runs: issued by us, or received from them. */
  direction: BillDirection;
};

export type Bill = BillSummary & {
  party: Party;
  lines: BillLine[];
};

export type Payment = {
  id: string;
  /** Overrides the Particulars the ledger would compose. */
  narration: string | null;
  partyId: string;
  partyName: string;
  /** Which way this payment runs: money in, or money out. */
  direction: PaymentDirection;
  /** 'YYYY-MM-DD' */
  paidOn: string;
  amount: Money;
  mode: PaymentMode;
  reference: string | null;
  notes: string | null;
};

export type ActivityEntry = {
  id: string;
  /** Already formatted in Asia/Dhaka by the query. */
  at: string;
  action: 'create' | 'update' | 'delete';
  entity: string;
  summary: string;
  reason: string | null;
};

export function partyRoleLabel(role: PartyRole, plural = false): string {
  const word = PARTY_ROLES.find((r) => r.value === role)?.label ?? role;
  return plural ? `${word}s` : word;
}

/** Every role a party holds, for a screen that has to show them all. */
export function rolesOf(roles: PartyRoles): PartyRole[] {
  return PARTY_ROLES.map((r) => r.value).filter((role) => roles[role]);
}

export function rolesLabel(roles: PartyRoles): string {
  const held = rolesOf(roles);
  return held.length > 0 ? held.map((r) => partyRoleLabel(r)).join(', ') : '';
}

/** What a bill is called, which follows the document and not the party. */
export function billLabel(direction: BillDirection): string {
  return direction === 'issued' ? 'Customer Bill' : 'Bill Received';
}

export function settlementLabel(direction: PaymentDirection): string {
  return direction === 'in' ? 'Receipt' : 'Payment';
}
