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

/** A party is a customer or a subcontractor, and the type never changes. */
export const partyTypeSchema = z.enum(['customer', 'subcontractor']);

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
  name: z.string().trim().min(1, 'Name is required').max(200),
  type: partyTypeSchema,
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

export const billLineSchema = z.object({
  description: z
    .string()
    .trim()
    .min(1, 'Every line needs a description')
    .max(300),
  qtyKg: z
    .string()
    .trim()
    .regex(/^\d+(\.\d{1,3})?$/, 'Enter the weight in kg, up to 3 decimals')
    .refine((value) => parseQtyKg(value) > 0n, 'Weight must be more than zero'),
  rate: z
    .string()
    .trim()
    .regex(/^\d+(\.\d{1,2})?$/, 'Enter the rate with up to 2 decimals')
    .refine((value) => parseRate(value) >= 0n, 'Rate cannot be negative'),
});
export type BillLineInput = z.infer<typeof billLineSchema>;

export const billFormSchema = z.object({
  partyId: z.string().uuid('Select a party'),
  // Blank for a customer bill (the system numbers it); the subcontractor's own
  // paper number for a bill received.
  billNo: optionalText(40),
  billDate: isoDateSchema,
  reference: optionalText(120),
  notes: optionalText(1000),
  lines: z.array(billLineSchema).min(1, 'Add at least one bill line'),
  reason: optionalText(300),
});
export type BillFormInput = z.infer<typeof billFormSchema>;

export const paymentFormSchema = z.object({
  partyId: z.string().uuid('Select a party'),
  paidOn: isoDateSchema,
  amount: positiveMoney,
  mode: z.enum(['cash', 'cheque', 'bank_transfer']),
  reference: optionalText(80),
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
