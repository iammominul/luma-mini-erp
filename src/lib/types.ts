import type { Money } from './money';

export type PartyType = 'customer' | 'subcontractor';
export type PaymentMode = 'cash' | 'cheque' | 'bank_transfer';

export const PAYMENT_MODES: { value: PaymentMode; label: string }[] = [
  { value: 'cash', label: 'Cash' },
  { value: 'cheque', label: 'Cheque' },
  { value: 'bank_transfer', label: 'Bank Transfer' },
];

export function paymentModeLabel(mode: string): string {
  return PAYMENT_MODES.find((m) => m.value === mode)?.label ?? mode;
}

export type Party = {
  id: string;
  name: string;
  type: PartyType;
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
  /** Opening balance plus billed minus settled, in the party's own direction. */
  balance: Money;
  billCount: number;
  lastActivity: string | null;
};

export type BillLine = {
  id: string;
  lineNo: number;
  description: string;
  /** kg as text, up to three decimals */
  qtyKg: string;
  rate: string;
  amount: Money;
};

export type BillSummary = {
  id: string;
  billNo: string;
  /** 'YYYY-MM-DD' */
  billDate: string;
  reference: string | null;
  notes: string | null;
  total: Money;
  partyId: string;
  partyName: string;
  partyType: PartyType;
};

export type Bill = BillSummary & {
  party: Party;
  lines: BillLine[];
};

export type Payment = {
  id: string;
  partyId: string;
  partyName: string;
  partyType: PartyType;
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

export function partyTypeLabel(type: PartyType, plural = false): string {
  const word = type === 'customer' ? 'Customer' : 'Subcontractor';
  return plural ? `${word}s` : word;
}

/** What a bill is called on each side, in trade terms. */
export function billLabel(type: PartyType): string {
  return type === 'customer' ? 'Customer Bill' : 'Bill Received';
}

export function settlementLabel(type: PartyType): string {
  return type === 'customer' ? 'Receipt' : 'Payment';
}
