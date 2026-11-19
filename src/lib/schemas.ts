import { z } from 'zod';
import { parseQtyKg, parseRate } from './amount';

/**
 * Every write is validated here before it reaches the database. The money and
 * party type rules match the ones in the full ERP's shared package, so the data
 * exported from here loads into it without translation.
 */

/**
 * A money amount as it crosses into the app: a decimal string with an optional
 * sign and up to two places, within NUMERIC(14,2) range. Validating the string
 * rather than a JS number keeps floating point away from money.
 */
export const moneyStringSchema = z
  .string()
  .trim()
  .regex(/^-?\d+(\.\d{1,2})?$/, 'Enter an amount with up to two decimal places')
  .refine(
    (value) => value.replace('-', '').split('.')[0]!.length <= 12,
    'Amount is larger than the maximum of twelve digits',
  );

/** A party holds roles rather than one immutable type. */
export const partyRoleSchema = z.enum([
  'customer',
  'subcontractor',
  'supplier',
]);

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((value) => (value === '' || value === undefined ? null : value));

/** A uuid, or blank or absent, which becomes null. */
const optionalUuid = z
  .union([
    z.string().trim().uuid('That record is not one this book knows'),
    z.literal(''),
    z.null(),
  ])
  .optional()
  .transform((value) => (value ? value : null));

/** A calendar date as 'YYYY-MM-DD', checked for being a real date. */
export const isoDateSchema = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Enter the date as YYYY-MM-DD')
  .refine((value) => {
    const [y, m, d] = value.split('-').map(Number) as [number, number, number];
    const date = new Date(Date.UTC(y, m - 1, d));
    return (
      date.getUTCFullYear() === y &&
      date.getUTCMonth() === m - 1 &&
      date.getUTCDate() === d
    );
  }, 'That is not a real date');

const positiveMoney = moneyStringSchema.refine(
  (value) => !value.startsWith('-') && /[1-9]/.test(value),
  'Enter an amount greater than zero',
);

export const partyFormSchema = z.object({
  /** Blank on create means the system assigns the next code for that side. */
  code: optionalText(20),
  name: z.string().trim().min(1, 'Name is required').max(200),
  /** A party holds at least one role and may hold several. */
  roles: z
    .array(partyRoleSchema)
    .min(1, 'Choose at least one role for this party'),
  contactPerson: optionalText(120),
  phone: optionalText(40),
  address: optionalText(400),
  openingBalance: moneyStringSchema,
  openingAsOf: z
    .union([isoDateSchema, z.literal('')])
    .optional()
    .transform((value) => (value ? value : null)),
});
export type PartyFormInput = z.infer<typeof partyFormSchema>;

/**
 * Wraps a parser that throws so it can be used as a Zod refinement.
 *
 * Zod runs a refinement even after an earlier check on the same string has
 * failed, so a refinement that calls a throwing parser escapes as a RangeError
 * instead of becoming a message on the form. A blank weight is the everyday case:
 * someone tabs past a field. Anything the parser rejects is simply invalid.
 */
function accepts(
  parse: (value: string) => bigint,
  test: (parsed: bigint) => boolean,
) {
  return (value: string): boolean => {
    try {
      return test(parse(value));
    } catch {
      return false;
    }
  };
}

const weightKg = (label: string) =>
  z
    .string()
    .trim()
    .regex(/^\d+(\.\d{1,3})?$/, `Enter the ${label} in kg, up to 3 decimals`)
    .refine(
      accepts(parseQtyKg, (grams) => grams > 0n),
      `${label} must be more than zero`,
    );

export const billLineSchema = z.object({
  description: z
    .string()
    .trim()
    .min(1, 'Every line needs a description')
    .max(300),
  /**
   * What shade the lot was dyed. Optional because this app records what the
   * paper bill says, and a hand-written line does not always carry one.
   */
  color: optionalText(60),
  /** The hand-written challan serial the lot went out on. */
  challanNo: optionalText(40),
  /** The customer's own order number, typed as they wrote it. */
  orderNo: optionalText(40),
  /** The dye lot number, as written on the challan and the bill. */
  lotNo: optionalText(40),
  /**
   * What the line was billed against (2026-10-06). On a customer bill, a
   * Sales Order line. On a supplier's bill, a Purchase Order line, and on a
   * subcontractor's a Work Order line, each of which names its order line.
   * Blank on a line nobody tied to an order. The mutation checks that the
   * line belongs to this party and is still open.
   */
  orderLineId: optionalUuid,
  sourceLineId: optionalUuid,
  /** Grey weight, which is what the amount is calculated on. */
  greyKg: weightKg('grey weight'),
  /**
   * Finished weight, recorded from the paper bill. Optional: a bill is
   * sometimes raised before the finished weight is back from the floor, so a
   * blank is stored as absent rather than as zero.
   */
  finishedKg: z
    .preprocess(
      (value) =>
        typeof value === 'string' && value.trim() === '' ? undefined : value,
      weightKg('finished weight').optional(),
    )
    .transform((value) => value ?? null),
  /**
   * Six decimals, not two. A bill keyed from the book often carries a weight
   * and an amount but no rate, and the rate worked back out of them needs the
   * finer places to reproduce the amount the party was shown.
   */
  rate: z
    .string()
    .trim()
    .regex(/^\d+(\.\d{1,6})?$/, 'Enter the rate with up to 6 decimals')
    .refine(
      accepts(parseRate, (microTaka) => microTaka >= 0n),
      'Rate cannot be negative',
    ),
});
export type BillLineInput = z.infer<typeof billLineSchema>;

export const billFormSchema = z.object({
  partyId: z.string().uuid('Select a party'),
  /** Which way this bill runs, set by the lens it was raised under. */
  direction: z.enum(['issued', 'received']),
  /** Which role the party is billed in, set by the lens. */
  partyRole: partyRoleSchema,
  /** Saved as a draft, or posted into the book. */
  status: z.enum(['draft', 'posted']).default('posted'),
  /**
   * The number written on the paper. On a bill received it is the party's own
   * number and is required, which the mutation enforces because the rule turns
   * on the direction. On a customer bill it is the Paper Ref from LUMA's bill
   * book and is optional: the printed number is the system's, issued by the
   * server and never posted by the browser.
   */
  billNo: optionalText(40),
  /** What was billed: dyeing and finishing unless stated otherwise. */
  natureOfWork: z
    .enum([
      'dyeing_finishing',
      'knitting',
      'knitting_dyeing_finishing',
      'full_package',
      'other',
    ])
    .default('dyeing_finishing'),
  billDate: isoDateSchema,
  /** What the ledger prints in Particulars. Blank means compose it. */
  narration: optionalText(200),
  /** Remarks on the screen, and Remarks on the printed bill. */
  notes: optionalText(1000),
  lines: z.array(billLineSchema).min(1, 'Add at least one bill line'),
  reason: optionalText(300),
});
export type BillFormInput = z.infer<typeof billFormSchema>;

export const paymentFormSchema = z.object({
  partyId: z.string().uuid('Select a party'),
  /** Money in against a receivable, or money out against a payable. */
  direction: z.enum(['in', 'out']),
  /** Which role the party is paid or received from in, set by the lens. */
  partyRole: partyRoleSchema,
  paidOn: isoDateSchema,
  amount: positiveMoney,
  mode: z.enum([
    'cash',
    'mobile_banking',
    'bank_transfer',
    'cheque',
    'rtgs',
    'lc',
    'other',
  ]),
  reference: optionalText(80),
  /** What the ledger prints in Particulars. Blank means compose it. */
  narration: optionalText(200),
  notes: optionalText(1000),
  reason: optionalText(300),
});
export type PaymentFormInput = z.infer<typeof paymentFormSchema>;

// Expenses and payroll ---------------------------------------------------------

/** The payment methods, shared by an expense, an advance and a salary. */
const paymentModeSchema = z.enum([
  'cash',
  'mobile_banking',
  'bank_transfer',
  'cheque',
  'rtgs',
  'lc',
  'other',
]);

/** Zero is allowed here, where a settlement amount must be positive. */
const nonNegativeMoney = moneyStringSchema.refine(
  (value) => !value.startsWith('-'),
  'Enter an amount of zero or more',
);

const optionalDate = z
  .union([isoDateSchema, z.literal('')])
  .optional()
  .transform((value) => (value ? value : null));

/**
 * A month as 'YYYY-MM'. Text end to end for the same reason a date is text: a
 * month built as a JS Date is constructed at the server's midnight and can
 * land in the wrong month against Asia/Dhaka.
 */
export const periodSchema = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}$/, 'Enter the month as YYYY-MM')
  .refine((value) => {
    const month = Number(value.split('-')[1]);
    return month >= 1 && month <= 12;
  }, 'That is not a real month');

/**
 * The personnel file and the salary structure.
 *
 * Gross is deliberately absent: it is the sum of the six components and the
 * database generates it, so there is nothing for the browser to send.
 */
export const employeeFormSchema = z.object({
  /** Blank on create means the system assigns the next EMP code. */
  code: optionalText(20),
  name: z.string().trim().min(1, 'Name is required').max(200),
  designation: optionalText(120),
  phone: optionalText(40),
  nid: optionalText(40),
  address: optionalText(400),
  joinedOn: optionalDate,

  basic: nonNegativeMoney.default('0'),
  houseRent: nonNegativeMoney.default('0'),
  medical: nonNegativeMoney.default('0'),
  conveyance: nonNegativeMoney.default('0'),
  mobileAllowance: nonNegativeMoney.default('0'),
  otherAllowance: nonNegativeMoney.default('0'),

  paymentMethod: z.enum(['cash', 'bank', 'mfs']).default('cash'),
  bankName: optionalText(120),
  accountNo: optionalText(60),
  mfsNumber: optionalText(40),

  reason: optionalText(300),
});
export type EmployeeFormInput = z.infer<typeof employeeFormSchema>;

/** Starting a month. Everything else about the run is worked out. */
export const payrollRunFormSchema = z.object({
  period: periodSchema,
  perDayBasis: z.enum(['thirty', 'twenty_six', 'actual']).default('thirty'),
  /**
   * Whether this month takes advances back. The action reads the checkbox and
   * sends a real boolean, so an absent field here means the caller left it out
   * rather than that somebody unticked a box.
   */
  recoverAdvances: z.boolean().default(true),
  notes: optionalText(1000),
});
export type PayrollRunFormInput = z.infer<typeof payrollRunFormSchema>;

/**
 * One row of the payroll grid: only what HR keys.
 *
 * No net and no absence cost, because both are worked out on the server from
 * these figures and the run's basis, the same rule that keeps a bill total off
 * the browser.
 */
export const payrollLineFormSchema = z.object({
  id: z.string().uuid(),
  absentDays: z
    .string()
    .trim()
    .regex(/^\d+(\.\d)?$/, 'Enter unpaid absence in days, to one decimal')
    .refine((value) => Number(value) <= 31, 'A month has at most 31 days')
    .default('0'),
  bonus: nonNegativeMoney.default('0'),
  additionalAllowance: nonNegativeMoney.default('0'),
  advanceDeduction: nonNegativeMoney.default('0'),
  otherDeduction: nonNegativeMoney.default('0'),
  remarks: optionalText(300),
});
export type PayrollLineFormInput = z.infer<typeof payrollLineFormSchema>;

// payrollStepSchema was here. It validated the typed name of whoever was
// approving or paying a run, which named users (2026-08-14) made unnecessary:
// the name now comes from the session and there is no field to validate.

export const payrollReopenSchema = z.object({
  id: z.string().uuid(),
  reason: z
    .string()
    .trim()
    .min(3, 'State why this payroll is being reopened')
    .max(300),
});

export const leaveFormSchema = z
  .object({
    employeeId: z.string().uuid('Select an employee'),
    leaveType: z.enum(['casual', 'sick', 'earned']),
    fromDate: isoDateSchema,
    toDate: isoDateSchema,
    days: z
      .string()
      .trim()
      .regex(/^\d+(\.\d)?$/, 'Enter the days taken, to one decimal')
      .refine((value) => Number(value) > 0, 'Enter more than zero days'),
    reason: optionalText(300),
    editReason: optionalText(300),
  })
  .refine((value) => value.toDate >= value.fromDate, {
    message: 'The last day cannot be before the first',
    path: ['toDate'],
  });
export type LeaveFormInput = z.infer<typeof leaveFormSchema>;

export const expenseFormSchema = z.object({
  spentOn: isoDateSchema,
  // The category carries the cost tier: see EXPENSE_CATEGORIES in types.ts,
  // which is the one place that mapping lives.
  category: z.enum([
    'freight_inward',
    'freight_outward',
    'lab_test',
    'direct_other',
    'commission',
    'rent',
    'utilities',
    'salary_related',
    'transport',
    'repairs',
    'office',
    'entertainment',
    'government_fees',
    'bank_charges',
    'other',
  ]),
  /** Who was paid. Free text: most are not a party we otherwise trade with. */
  payee: optionalText(200),
  description: z
    .string()
    .trim()
    .min(1, 'State what this expense was for')
    .max(300),
  amount: positiveMoney,
  mode: paymentModeSchema,
  reference: optionalText(80),
  /** The order this cost belongs to, so it can be costed against that order. */
  orderNo: optionalText(60),
  /**
   * The Sales Order it is filed against, or one line of it (2026-10-06). The
   * mutation checks both and writes the free text reference from the order.
   */
  salesOrderId: optionalUuid,
  orderLineId: optionalUuid,
  notes: optionalText(1000),
  reason: optionalText(300),
});
export type ExpenseFormInput = z.infer<typeof expenseFormSchema>;

export const advanceFormSchema = z
  .object({
    employeeId: z.string().uuid('Select an employee'),
    paidOn: isoDateSchema,
    amount: positiveMoney,
    mode: paymentModeSchema,

    // How it was agreed to come back. Recorded here because it is agreed when
    // the cash is handed over, which is what lets payroll fill the deduction in
    // rather than somebody keying it for every person every month.
    recoveryMode: z.enum(['manual', 'full', 'installment']).default('manual'),
    installmentAmount: positiveMoney.or(z.literal('')).default(''),
    recoverFrom: periodSchema.or(z.literal('')).default(''),

    reference: optionalText(80),
    notes: optionalText(1000),
    reason: optionalText(300),
  })
  .superRefine((value, ctx) => {
    // An installment with no figure would look scheduled and recover nothing.
    if (
      value.recoveryMode === 'installment' &&
      value.installmentAmount === ''
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['installmentAmount'],
        message: 'State how much is recovered each month',
      });
    }
  });
export type AdvanceFormInput = z.infer<typeof advanceFormSchema>;

/**
 * A loan, and the money it put in the account, on one form.
 *
 * These used to be two saves on two screens: create an account, then create a
 * voucher against it. A loan does not exist until money has moved, so the two
 * are one action and one transaction. `amount` is what came in, not a facility
 * ceiling: a ceiling is words and belongs in `terms`.
 */
export const loanFormSchema = z.object({
  lender: z.string().trim().min(1, 'Enter the lender').max(160),
  amount: positiveMoney,
  takenOn: isoDateSchema,
  mode: paymentModeSchema,
  /** Rate, tenor and security, as the sanction letter states them. */
  terms: optionalText(500),
  reference: optionalText(80),
  notes: optionalText(1000),
  reason: optionalText(300),
});
export type LoanFormInput = z.infer<typeof loanFormSchema>;

/** Editing the loan record itself. The money it received is a movement. */
export const loanEditSchema = z.object({
  lender: z.string().trim().min(1, 'Enter the lender').max(160),
  takenOn: isoDateSchema,
  terms: optionalText(500),
  reference: optionalText(80),
  active: z.enum(['yes', '']).default('yes'),
  notes: optionalText(1000),
  reason: optionalText(300),
});
export type LoanEditInput = z.infer<typeof loanEditSchema>;

/**
 * An installment: principal off the debt, interest as a cost, one cheque.
 *
 * There is no category field, here or on any other form in this file. The
 * action decides it, so a screen cannot post a movement of the wrong kind and
 * there is nothing to validate about a choice nobody makes.
 */
export const loanRepaymentSchema = z.object({
  loanId: z.string().uuid('Select a loan'),
  movedOn: isoDateSchema,
  amount: positiveMoney,
  interestAmount: nonNegativeMoney.or(z.literal('')).default(''),
  mode: paymentModeSchema,
  reference: optionalText(80),
  notes: optionalText(1000),
  reason: optionalText(300),
});
export type LoanRepaymentInput = z.infer<typeof loanRepaymentSchema>;

/** A further drawing on a facility already opened. */
export const loanDrawdownSchema = z.object({
  loanId: z.string().uuid('Select a loan'),
  movedOn: isoDateSchema,
  amount: positiveMoney,
  mode: paymentModeSchema,
  reference: optionalText(80),
  notes: optionalText(1000),
  reason: optionalText(300),
});
export type LoanDrawdownInput = z.infer<typeof loanDrawdownSchema>;

/**
 * Capital in or a drawing out. One owner, so there is nobody to pick.
 *
 * Four fields, and `mode` is one of them: the Cash Book shows one combined
 * balance, but the ERP's rules 13 and 14 post the other leg to 1000 Cash or
 * 1100 Bank and this is the only thing that says which.
 */
export const ownerMovementSchema = z.object({
  movedOn: isoDateSchema,
  amount: positiveMoney,
  mode: paymentModeSchema,
  notes: optionalText(1000),
  reason: optionalText(300),
});
export type OwnerMovementInput = z.infer<typeof ownerMovementSchema>;

/** The balance the book opens on. One figure, entered once. */
export const openingBalanceSchema = z.object({
  movedOn: isoDateSchema,
  amount: positiveMoney,
  mode: paymentModeSchema,
  notes: optionalText(1000),
  reason: optionalText(300),
});
export type OpeningBalanceInput = z.infer<typeof openingBalanceSchema>;

export const deleteSchema = z.object({
  id: z.string().uuid(),
  reason: z.string().trim().min(3, 'State why this is being removed').max(300),
});

/**
 * A password, stated once as a rule so the create form and the reset form
 * cannot disagree. Twelve characters and nothing else: a length floor is the
 * only rule that reliably buys strength, and a composition rule ("one capital,
 * one symbol") mostly buys Password1! written on a note under the keyboard.
 */
export const passwordSchema = z
  .string()
  .min(12, 'Use at least twelve characters')
  .max(200, 'That password is too long');

export const userRoleSchema = z.enum(['owner', 'accounts', 'viewer']);

export const userFormSchema = z.object({
  name: z.string().trim().min(2, 'Enter the full name').max(120),
  // Stored lower case so an address cannot be registered twice in two cases.
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email('Enter a valid email address')
    .max(200),
  password: passwordSchema,
  role: userRoleSchema,
});
export type UserFormInput = z.infer<typeof userFormSchema>;

export const userRoleChangeSchema = z.object({
  id: z.string().min(1),
  role: userRoleSchema,
});

export const userStatusChangeSchema = z.object({
  id: z.string().min(1),
  status: z.enum(['active', 'disabled']),
});

export const userPasswordResetSchema = z.object({
  id: z.string().min(1),
  password: passwordSchema,
});

/** Name and email, whether somebody is editing their own or an Owner is. */
export const userProfileSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(2, 'Enter the full name').max(120),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email('Enter a valid email address')
    .max(200),
});
export type UserProfileInput = z.infer<typeof userProfileSchema>;

/**
 * Changing your own password. The current one is required, which is what makes
 * this different from an Owner's reset: it proves who is at the keyboard.
 */
export const ownPasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Enter your current password'),
    newPassword: passwordSchema,
    confirmPassword: z.string(),
  })
  .superRefine((value, ctx) => {
    if (value.newPassword !== value.confirmPassword) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['confirmPassword'],
        message: 'The two new passwords do not match',
      });
    }
  });

/** The first error message from a ZodError, which is what the form shows. */
export function firstError(error: z.ZodError): string {
  return error.issues[0]?.message ?? 'Check the values entered';
}

// Orders (2026-10-06) ----------------------------------------------------------

/** A rate per unit, six decimals, as a bill line takes it. */
const rateSchema = z
  .string()
  .trim()
  .regex(/^\d+(\.\d{1,6})?$/, 'Enter the rate with up to 6 decimals')
  .refine(
    accepts(parseRate, (microTaka) => microTaka >= 0n),
    'Rate cannot be negative',
  );

const orderStatusSchema = z.enum(['open', 'closed', 'cancelled']);

export const salesOrderLineSchema = z.object({
  /** Set when an existing line is edited, so its id and its links survive. */
  id: optionalUuid,
  category: z.enum(['fabric', 'dyeing_service']),
  description: z
    .string()
    .trim()
    .min(1, 'Every line needs a description')
    .max(300),
  color: optionalText(60),
  /** Grey kg for both categories there are today. */
  quantity: weightKg('quantity'),
  rate: rateSchema,
});
export type SalesOrderLineInput = z.infer<typeof salesOrderLineSchema>;

export const salesOrderFormSchema = z.object({
  partyId: z.string().uuid('Select a customer'),
  orderDate: isoDateSchema,
  customerRef: optionalText(60),
  notes: optionalText(1000),
  lines: z.array(salesOrderLineSchema).min(1, 'Add at least one order line'),
  reason: optionalText(300),
});
export type SalesOrderFormInput = z.infer<typeof salesOrderFormSchema>;

/** Closing or cancelling an order, which always states why. */
export const orderStatusFormSchema = z.object({
  id: z.string().uuid(),
  status: orderStatusSchema,
  reason: z.string().trim().min(1, 'State why').max(300),
});

export const purchaseOrderLineSchema = z.object({
  id: optionalUuid,
  orderLineId: z.string().uuid('Choose the order line this yarn is for'),
  description: z
    .string()
    .trim()
    .min(1, 'Every line needs a description')
    .max(300),
  quantityKg: weightKg('quantity'),
  rate: rateSchema,
});

export const purchaseOrderFormSchema = z.object({
  partyId: z.string().uuid('Select a supplier'),
  orderDate: isoDateSchema,
  deliverToId: optionalUuid,
  deliveryBy: z
    .union([isoDateSchema, z.literal('')])
    .optional()
    .transform((value) => (value ? value : null)),
  terms: optionalText(500),
  notes: optionalText(1000),
  lines: z.array(purchaseOrderLineSchema).min(1, 'Add at least one line'),
  reason: optionalText(300),
});
export type PurchaseOrderFormInput = z.infer<typeof purchaseOrderFormSchema>;

export const workOrderLineSchema = z.object({
  id: optionalUuid,
  orderLineId: z.string().uuid('Choose the order line this work is for'),
  description: z
    .string()
    .trim()
    .min(1, 'Every line needs a description')
    .max(300),
  color: optionalText(60),
  gsm: optionalText(40),
  dia: optionalText(40),
  quantityKg: weightKg('quantity'),
  rate: rateSchema,
});

export const workOrderFormSchema = z.object({
  partyId: z.string().uuid('Select a subcontractor'),
  process: z.enum(['knitting', 'dyeing_finishing']),
  orderDate: isoDateSchema,
  deliverToId: optionalUuid,
  deliveryBy: z
    .union([isoDateSchema, z.literal('')])
    .optional()
    .transform((value) => (value ? value : null)),
  terms: optionalText(500),
  notes: optionalText(1000),
  lines: z.array(workOrderLineSchema).min(1, 'Add at least one line'),
  reason: optionalText(300),
});
export type WorkOrderFormInput = z.infer<typeof workOrderFormSchema>;
