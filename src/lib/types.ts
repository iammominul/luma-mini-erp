import type { Money } from './money';
import type { LeaveType, PerDayBasis, RecoveryMode } from './payroll';
import type { Role } from './permissions';

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
  /** What the line is, in trade terms: S/J, 1x1 Rib, Fleece (2x1) LY. */
  description: string;
  color: string | null;
  /** Hand-written challan serial this lot went out on. */
  challanNo: string | null;
  /** The customer's own order number. */
  orderNo: string | null;
  /** The dye lot this line was run as, as written on the paper. */
  lotNo: string | null;
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
  /** Posted, but its lines still have no color recorded. */
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
  /** The system's own gapless number, 'CB-26-0001'. Null on a bill received. */
  docNo: string | null;
  /** 'YYYY-MM-DD' */
  billDate: string;
  /** Free text about the bill. Prints on the document under Remarks. */
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
  /**
   * The name copied at the time of the write. Null on anything written before
   * named users arrived (2026-08-14), when one shared password meant there was
   * no who to record. A screen shows those as "Not recorded" rather than
   * inventing somebody.
   */
  actorName: string | null;
};

/**
 * Who performed a write. Passed into every mutation and copied onto the row it
 * writes to activity_log. It lives here rather than in session.ts so that
 * mutations.ts, which the integration tests drive directly, does not have to
 * reach into anything that needs a request behind it.
 */
export type Actor = { id: string; name: string };

/** An account that can sign in. The password never leaves the auth tables. */
export type AppUser = {
  id: string;
  name: string;
  email: string;
  role: Role;
  status: 'active' | 'disabled';
  /** Already formatted in Asia/Dhaka by the query. */
  createdAt: string;
  /**
   * When the account was last signed in, formatted in Asia/Dhaka. Null means it
   * has never been used, which is a different thing from dormant: a new account
   * whose password was never collected reads as "Never", not as a stale one.
   */
  lastSignedInAt: string | null;
  /** Whether a session for this account is open somewhere right now. */
  hasLiveSession: boolean;
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

// Expenses and payroll ---------------------------------------------------------
//
// Money out that is not a party settlement. Cash basis: a row exists because
// money moved. See CLAUDE.md section 7 for why these live here at all.

/**
 * What an expense was for. Kept close to the account names the full ERP's chart
 * uses, so a voucher recorded here maps to one of its expense accounts when the
 * ERP takes over rather than having to be reclassified by hand.
 */
export type ExpenseCategory =
  | 'freight_inward'
  | 'freight_outward'
  | 'lab_test'
  | 'direct_other'
  | 'commission'
  | 'rent'
  | 'utilities'
  | 'salary_related'
  | 'transport'
  | 'repairs'
  | 'office'
  | 'entertainment'
  | 'government_fees'
  | 'bank_charges'
  | 'other';

/**
 * Which tier of the profit statement a cost falls in.
 *
 * 'direct' is cost of sales: it exists because the goods exist, so it comes off
 * before the gross margin. Freight carrying fabric and a lab test on a customer's
 * order are as direct as the dyeing itself.
 * 'selling' is what it costs to win the work. It varies with revenue but says
 * nothing about how well the dyeing was bought, so it sits below the gross
 * margin on its own line rather than muddling it.
 * 'operating' is the overhead that would be there whether or not a given order
 * was taken: rent, salary, staff travel, office.
 *
 * The tier belongs to the category rather than to the row, so there is one
 * choice at entry and no way to record a row whose category and tier disagree.
 */
export type CostTier = 'direct' | 'selling' | 'operating';

export const COST_TIERS: { value: CostTier; label: string }[] = [
  { value: 'direct', label: 'Direct Cost' },
  { value: 'selling', label: 'Selling Cost' },
  { value: 'operating', label: 'Operating Cost' },
];

export function costTierLabel(value: string): string {
  return COST_TIERS.find((t) => t.value === value)?.label ?? value;
}

export const EXPENSE_CATEGORIES: {
  value: ExpenseCategory;
  label: string;
  tier: CostTier;
}[] = [
  { value: 'freight_inward', label: 'Freight, Fabric Inward', tier: 'direct' },
  {
    value: 'freight_outward',
    label: 'Freight, Delivery to Customer',
    tier: 'direct',
  },
  { value: 'lab_test', label: 'Lab Testing', tier: 'direct' },
  { value: 'direct_other', label: 'Other Direct Cost', tier: 'direct' },

  { value: 'commission', label: 'Commission on Orders', tier: 'selling' },

  { value: 'rent', label: 'Rent', tier: 'operating' },
  { value: 'utilities', label: 'Utilities', tier: 'operating' },
  { value: 'salary_related', label: 'Salary Related', tier: 'operating' },
  // Was "Transport and Freight", which covered both a staff bus fare and a
  // truck carrying fabric. Freight now has its own direct categories and this
  // one means staff movement only. Rows recorded before the split were left
  // where they are, because nothing can tell which of the two they were.
  { value: 'transport', label: 'Staff Transport and Travel', tier: 'operating' },
  { value: 'repairs', label: 'Repairs and Maintenance', tier: 'operating' },
  { value: 'office', label: 'Office and Stationery', tier: 'operating' },
  { value: 'entertainment', label: 'Entertainment', tier: 'operating' },
  { value: 'government_fees', label: 'Government Fees', tier: 'operating' },
  { value: 'bank_charges', label: 'Bank Charges', tier: 'operating' },
  { value: 'other', label: 'Other', tier: 'operating' },
];

export function expenseCategoryLabel(value: string): string {
  return EXPENSE_CATEGORIES.find((c) => c.value === value)?.label ?? value;
}

/**
 * The tier a category falls in. An unknown category counts as operating, which
 * is the answer that cannot flatter the gross margin.
 */
export function expenseCategoryTier(value: string): CostTier {
  return EXPENSE_CATEGORIES.find((c) => c.value === value)?.tier ?? 'operating';
}

/** How an employee is paid, so Accounts does not have to ask. */
export type PaymentMethod = 'cash' | 'bank' | 'mfs';

export const PAYMENT_METHODS: { value: PaymentMethod; label: string }[] = [
  { value: 'cash', label: 'Cash' },
  { value: 'bank', label: 'Bank Transfer' },
  { value: 'mfs', label: 'Mobile Financial Service' },
];

export function paymentMethodLabel(value: string): string {
  return PAYMENT_METHODS.find((m) => m.value === value)?.label ?? value;
}

/**
 * The personnel file and the salary structure in one row.
 *
 * The structure here is the current one and carries no history of its own: a
 * payroll line copies it when the month is generated, so a raise cannot restate
 * a payslip already handed out.
 */
export type Employee = {
  id: string;
  /** The human-readable key: EMP-0001. */
  code: string | null;
  name: string;
  designation: string | null;
  phone: string | null;
  nid: string | null;
  address: string | null;
  joinedOn: string | null;
  active: boolean;

  basic: Money;
  houseRent: Money;
  medical: Money;
  conveyance: Money;
  mobileAllowance: Money;
  otherAllowance: Money;
  /** The sum of the six, generated by the database and never written here. */
  gross: Money;

  paymentMethod: PaymentMethod;
  bankName: string | null;
  accountNo: string | null;
  mfsNumber: string | null;
};

/**
 * An employee with the figures that are computed on read, never stored:
 * advances paid less what salary rows have recovered.
 */
export type EmployeeBalance = Employee & {
  advancePaid: Money;
  advanceRecovered: Money;
  /** Still to come back out of a future salary. */
  advanceOutstanding: Money;
  salaryPaid: Money;
  lastPaidPeriod: string | null;
};

export type Expense = {
  id: string;
  docNo: string | null;
  spentOn: string;
  category: ExpenseCategory;
  payee: string | null;
  description: string;
  amount: Money;
  mode: PaymentMode;
  reference: string | null;
  /** The order this cost belongs to, when it belongs to one. */
  orderNo: string | null;
  notes: string | null;
};

export type Advance = {
  id: string;
  docNo: string | null;
  employeeId: string;
  employeeName: string;
  employeeCode: string | null;
  paidOn: string;
  amount: Money;
  mode: PaymentMode;
  reference: string | null;
  /** Why it was given, so a deduction a year later can still be explained. */
  reason: string | null;
  notes: string | null;

  /** How it was agreed to come back. See RecoveryMode in payroll.ts. */
  recoveryMode: RecoveryMode;
  /** The monthly figure, on an installment agreement only. */
  installmentAmount: Money | null;
  /** 'YYYY-MM' the recovery may start from, or null for the next run. */
  recoverFrom: string | null;
};

/**
 * Where a month's payroll has got to.
 *
 * Approving freezes the figures and paying locks them. With one shared login
 * this is discipline and a record rather than access control: see the note in
 * CLAUDE.md section 7.
 */
export type PayrollStatus = 'draft' | 'approved' | 'paid';

export const PAYROLL_STATUSES: { value: PayrollStatus; label: string }[] = [
  { value: 'draft', label: 'Draft' },
  { value: 'approved', label: 'Approved' },
  { value: 'paid', label: 'Paid' },
];

export function payrollStatusLabel(value: string): string {
  return PAYROLL_STATUSES.find((s) => s.value === value)?.label ?? value;
}

export type PayrollRun = {
  id: string;
  docNo: string | null;
  /** The month being paid, as 'YYYY-MM'. */
  period: string;
  status: PayrollStatus;
  perDayBasis: PerDayBasis;
  /** Whether this month took advances back at all. */
  recoverAdvances: boolean;
  notes: string | null;
  /** Typed at the step. Attribution, not authentication. */
  approvedBy: string | null;
  approvedAt: string | null;
  paidBy: string | null;
  paidAt: string | null;
};

/** A run with the totals worked out on read from its lines. */
export type PayrollRunSummary = PayrollRun & {
  employees: number;
  gross: Money;
  absenceDeduction: Money;
  advanceDeduction: Money;
  otherDeduction: Money;
  bonus: Money;
  additionalAllowance: Money;
  netPaid: Money;
  /** How many lines Accounts has marked paid. */
  linesPaid: number;
};

export type PayrollLine = {
  id: string;
  runId: string;
  employeeId: string;
  employeeName: string;
  employeeCode: string | null;

  /** Copied from the employee when the month was generated. */
  basic: Money;
  houseRent: Money;
  medical: Money;
  conveyance: Money;
  mobileAllowance: Money;
  otherAllowance: Money;
  gross: Money;
  designation: string | null;

  /** Leave without pay and unauthorized absence only, in tenths of a day. */
  absentDays: string;
  bonus: Money;
  additionalAllowance: Money;
  advanceDeduction: Money;
  otherDeduction: Money;
  remarks: string | null;

  absenceDeduction: Money;
  netPaid: Money;
  paidOn: string | null;
};

/** A line with the run's own fields alongside, for a payslip. */
export type PayrollLineWithRun = PayrollLine & {
  period: string;
  status: PayrollStatus;
  perDayBasis: PerDayBasis;
  docNo: string | null;
  approvedBy: string | null;
};

export type LeaveRecord = {
  id: string;
  employeeId: string;
  employeeName: string;
  employeeCode: string | null;
  leaveType: LeaveType;
  fromDate: string;
  toDate: string;
  /** Days taken, to one decimal so a half day works. */
  days: string;
  reason: string | null;
};

export type ExpenseClaimCategory =
  | 'transport'
  | 'courier'
  | 'fuel'
  | 'parking'
  | 'other';

/**
 * A claim is money somebody spent out of their own pocket and is owed back, so
 * every one of these is overhead: staff moving between factories, a courier, a
 * tank of fuel. Freight that belongs to the goods is an expense against the
 * company with its own direct category, not a claim, because putting the same
 * cost in both places is how it gets counted twice.
 */
export const EXPENSE_CLAIM_CATEGORIES: {
  value: ExpenseClaimCategory;
  label: string;
  tier: CostTier;
}[] = [
  { value: 'transport', label: 'Transport', tier: 'operating' },
  { value: 'courier', label: 'Courier', tier: 'operating' },
  { value: 'fuel', label: 'Fuel', tier: 'operating' },
  { value: 'parking', label: 'Parking', tier: 'operating' },
  { value: 'other', label: 'Other', tier: 'operating' },
];

export function expenseClaimCategoryLabel(value: string): string {
  return (
    EXPENSE_CLAIM_CATEGORIES.find((c) => c.value === value)?.label ?? value
  );
}

/** Money a member of staff spent and is owed back. Never a payslip line. */
export type ExpenseClaim = {
  id: string;
  docNo: string | null;
  employeeId: string;
  employeeName: string;
  employeeCode: string | null;
  claimedOn: string;
  category: ExpenseClaimCategory;
  description: string;
  amount: Money;
  status: 'submitted' | 'reimbursed';
  reimbursedOn: string | null;
  mode: PaymentMode | null;
  reference: string | null;
  notes: string | null;
};

/** '2026-08' reads as 'August 2026'. */
export function periodLabel(period: string): string {
  const [year, month] = period.split('-').map(Number);
  if (!year || !month || month < 1 || month > 12) return period;
  const names = [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
  ];
  return `${names[month - 1]} ${year}`;
}
