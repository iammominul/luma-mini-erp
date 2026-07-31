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
   * What the fabric is and what shade it was dyed. Both print on the bill, and
   * both are optional because this app records what the paper bill says: a
   * hand-written line does not always carry either.
   */
  fabricType: optionalText(60),
  color: optionalText(60),
  /** The hand-written challan serial the lot went out on. */
  challanNo: optionalText(40),
  /** The customer's own order number, typed as they wrote it. */
  orderNo: optionalText(40),
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
  rate: z
    .string()
    .trim()
    .regex(/^\d+(\.\d{1,2})?$/, 'Enter the rate with up to 2 decimals')
    .refine(
      accepts(parseRate, (poisha) => poisha >= 0n),
      'Rate cannot be negative',
    ),
});
export type BillLineInput = z.infer<typeof billLineSchema>;

export const billFormSchema = z.object({
  partyId: z.string().uuid('Select a party'),
  /** Which way this bill runs, set by the lens it was raised under. */
  direction: z.enum(['issued', 'received']),
  /** Saved as a draft, or posted into the book. */
  status: z.enum(['draft', 'posted']).default('posted'),
  /**
   * The hand-written number, required on both sides: LUMA's own bill book on
   * the customer side, the subcontractor's paper bill on the other. The system
   * number is issued separately and is never posted by the browser.
   */
  billNo: z
    .string()
    .trim()
    .min(1, 'Enter the bill number written on the paper bill')
    .max(40),
  /** Which bill book the number came from, for the book sequence. */
  bookNo: optionalText(20),
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
  reference: optionalText(120),
  /** What the ledger prints in Particulars. Blank means compose it. */
  narration: optionalText(200),
  notes: optionalText(1000),
  lines: z.array(billLineSchema).min(1, 'Add at least one bill line'),
  reason: optionalText(300),
});
export type BillFormInput = z.infer<typeof billFormSchema>;

export const paymentFormSchema = z.object({
  partyId: z.string().uuid('Select a party'),
  /** Money in against a receivable, or money out against a payable. */
  direction: z.enum(['in', 'out']),
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

export const deleteSchema = z.object({
  id: z.string().uuid(),
  reason: z.string().trim().min(3, 'State why this is being removed').max(300),
});

/** The first error message from a ZodError, which is what the form shows. */
export function firstError(error: z.ZodError): string {
  return error.issues[0]?.message ?? 'Check the values entered';
}
