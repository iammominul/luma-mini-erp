'use client';

import Link from 'next/link';
import { useActionState, useState } from 'react';
import { Money } from '@/lib/money';
import { formatTaka } from '@/lib/format';
import {
  formatQtyKg,
  lineAmount,
  parseQtyKg,
  sumGrams,
  sumMoney,
} from '@/lib/amount';
import type { SideCopy } from '@/lib/side';
import {
  Button,
  Card,
  CardHeader,
  Field,
  Notice,
  Table,
  Td,
  Textarea,
  TextInput,
  Th,
} from './ui';

export type BillFormState = { error?: string };

export type BillFormLine = { description: string; qtyKg: string; rate: string };

export type BillFormValues = {
  partyId: string;
  billNo: string;
  billDate: string;
  reference: string;
  notes: string;
  lines: BillFormLine[];
};

const EMPTY_LINE: BillFormLine = { description: '', qtyKg: '', rate: '' };

/** Amount for one line, or null while the row is still being typed. */
function safeAmount(line: BillFormLine): Money | null {
  try {
    return lineAmount(line.qtyKg, line.rate);
  } catch {
    return null;
  }
}

function safeGrams(line: BillFormLine): bigint {
  try {
    return parseQtyKg(line.qtyKg);
  } catch {
    return 0n;
  }
}

export function BillForm({
  copy,
  parties,
  action,
  values,
  submitLabel,
  cancelHref,
  requireReason = false,
  billId,
}: {
  copy: SideCopy;
  parties: { id: string; name: string }[];
  action: (state: BillFormState, formData: FormData) => Promise<BillFormState>;
  values: BillFormValues;
  submitLabel: string;
  cancelHref: string;
  requireReason?: boolean;
  /** Set when editing: the bill being replaced. */
  billId?: string;
}) {
  const [state, submit, pending] = useActionState<BillFormState, FormData>(
    action,
    {},
  );
  const [lines, setLines] = useState<BillFormLine[]>(
    values.lines.length > 0 ? values.lines : [{ ...EMPTY_LINE }],
  );

  const update = (index: number, patch: Partial<BillFormLine>) =>
    setLines((current) =>
      current.map((line, i) => (i === index ? { ...line, ...patch } : line)),
    );

  const amounts = lines.map(safeAmount);
  const total = sumMoney(amounts.filter((a): a is Money => a !== null));
  const totalGrams = sumGrams(lines.map(safeGrams));

  return (
    <form action={submit} className="space-y-4">
      <input type="hidden" name="side" value={copy.side} />
      {billId ? <input type="hidden" name="id" value={billId} /> : null}
      <input type="hidden" name="linesJson" value={JSON.stringify(lines)} />

      <Card className="p-4">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label={copy.partyWord}>
            <select
              name="partyId"
              defaultValue={values.partyId}
              required
              className="w-full rounded border border-[var(--color-line)] bg-white px-2.5 py-1.5 text-sm outline-none focus:border-[var(--color-navy)] focus:ring-1 focus:ring-[var(--color-navy)]"
            >
              <option value="">Select {copy.partyWord}</option>
              {parties.map((party) => (
                <option key={party.id} value={party.id}>
                  {party.name}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Bill Date">
            <TextInput
              type="date"
              name="billDate"
              defaultValue={values.billDate}
              required
            />
          </Field>

          {copy.billNoIsOurs ? (
            <Field label="Bill No" hint="Numbered by the system when saved.">
              <TextInput
                value={values.billNo || 'Assigned on save'}
                readOnly
                disabled
              />
            </Field>
          ) : (
            <Field
              label="Their Bill No"
              hint="As written on the bill they sent."
            >
              <TextInput
                name="billNo"
                defaultValue={values.billNo}
                required
                maxLength={40}
              />
            </Field>
          )}

          <Field label="Reference" hint="Challan, lot, or order reference.">
            <TextInput
              name="reference"
              defaultValue={values.reference}
              maxLength={120}
            />
          </Field>
        </div>
      </Card>

      <Card>
        <CardHeader
          title="Bill Lines"
          action={
            <Button
              type="button"
              variant="secondary"
              onClick={() => setLines((c) => [...c, { ...EMPTY_LINE }])}
            >
              Add Line
            </Button>
          }
        />
        <Table>
          <thead>
            <tr>
              <Th className="w-10">No</Th>
              <Th>Description</Th>
              <Th numeric className="w-36">
                Weight (kg)
              </Th>
              <Th numeric className="w-32">
                Rate per kg
              </Th>
              <Th numeric className="w-36">
                Amount
              </Th>
              <Th className="w-16" />
            </tr>
          </thead>
          <tbody>
            {lines.map((line, index) => (
              <tr key={index}>
                <Td className="text-[var(--color-muted)]">{index + 1}</Td>
                <Td>
                  <TextInput
                    value={line.description}
                    onChange={(e) =>
                      update(index, { description: e.target.value })
                    }
                    placeholder="Shade, lot, or process"
                    maxLength={300}
                  />
                </Td>
                <Td>
                  <TextInput
                    value={line.qtyKg}
                    onChange={(e) => update(index, { qtyKg: e.target.value })}
                    inputMode="decimal"
                    className="text-right"
                    placeholder="0.000"
                  />
                </Td>
                <Td>
                  <TextInput
                    value={line.rate}
                    onChange={(e) => update(index, { rate: e.target.value })}
                    inputMode="decimal"
                    className="text-right"
                    placeholder="0.00"
                  />
                </Td>
                <Td numeric className="pt-3.5">
                  {amounts[index] ? formatTaka(amounts[index]!) : '-'}
                </Td>
                <Td>
                  {lines.length > 1 ? (
                    <button
                      type="button"
                      onClick={() =>
                        setLines((c) => c.filter((_, i) => i !== index))
                      }
                      className="text-sm text-red-700 hover:underline"
                    >
                      Remove
                    </button>
                  ) : null}
                </Td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-[var(--color-canvas)] font-semibold">
              <Td colSpan={2}>Total</Td>
              <Td numeric>{formatQtyKg(totalGrams)}</Td>
              <Td />
              <Td numeric>{formatTaka(total)}</Td>
              <Td />
            </tr>
          </tfoot>
        </Table>
      </Card>

      <Card className="p-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Notes">
            <Textarea
              name="notes"
              defaultValue={values.notes}
              maxLength={1000}
            />
          </Field>
          {requireReason ? (
            <Field
              label="Reason for the Edit"
              hint="Recorded in the activity log."
            >
              <Textarea name="reason" required maxLength={300} />
            </Field>
          ) : null}
        </div>
      </Card>

      {state.error ? <Notice tone="error">{state.error}</Notice> : null}

      <div className="flex items-center gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? 'Saving' : submitLabel}
        </Button>
        <Link
          href={cancelHref}
          className="rounded border border-[var(--color-line)] bg-white px-3 py-1.5 text-sm font-medium hover:bg-gray-50"
        >
          Cancel
        </Link>
      </div>
    </form>
  );
}
