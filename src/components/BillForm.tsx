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
import { NATURE_OF_WORK } from '@/lib/types';
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

export type BillFormLine = {
  description: string;
  fabricType: string;
  color: string;
  challanNo: string;
  orderNo: string;
  greyKg: string;
  finishedKg: string;
  rate: string;
};

export type BillFormValues = {
  partyId: string;
  status: string;
  natureOfWork: string;
  narration: string;
  billNo: string;
  bookNo: string;
  billDate: string;
  reference: string;
  notes: string;
  lines: BillFormLine[];
};

const EMPTY_LINE: BillFormLine = {
  description: '',
  fabricType: '',
  color: '',
  challanNo: '',
  orderNo: '',
  greyKg: '',
  finishedKg: '',
  rate: '',
};

/**
 * Amount for one line, or null while the row is still being typed. The figure
 * shown here is only a preview: the server computes the amounts and the total
 * again from the weights and rates posted, and those are what get saved.
 */
function safeAmount(line: BillFormLine): Money | null {
  try {
    return lineAmount(line.greyKg, line.rate);
  } catch {
    return null;
  }
}

function safeGrams(value: string): bigint {
  try {
    return parseQtyKg(value);
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
  const totalGrey = sumGrams(lines.map((line) => safeGrams(line.greyKg)));
  const totalFinished = sumGrams(
    lines.map((line) => safeGrams(line.finishedKg)),
  );

  return (
    <form action={submit} className="space-y-4">
      <input type="hidden" name="side" value={copy.side} />
      {billId ? <input type="hidden" name="id" value={billId} /> : null}
      <input type="hidden" name="linesJson" value={JSON.stringify(lines)} />

      <Card className="p-4">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
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

          <Field
            label="Bill No"
            hint={
              copy.billNoIsOurs
                ? 'As written in the bill book.'
                : 'As written on the bill they sent.'
            }
          >
            <TextInput
              name="billNo"
              defaultValue={values.billNo}
              required
              maxLength={40}
              autoComplete="off"
            />
          </Field>

          {copy.billNoIsOurs ? (
            <Field label="Book No" hint="Which bill book it was written in.">
              <TextInput
                name="bookNo"
                defaultValue={values.bookNo}
                maxLength={20}
                autoComplete="off"
              />
            </Field>
          ) : null}

          <Field label="Nature of Work" hint="What this bill is for.">
            <select
              name="natureOfWork"
              defaultValue={values.natureOfWork}
              className="w-full rounded border border-[var(--color-line)] bg-white px-2.5 py-1.5 text-sm outline-none focus:border-[var(--color-navy)] focus:ring-1 focus:ring-[var(--color-navy)]"
            >
              {NATURE_OF_WORK.map((service) => (
                <option key={service.value} value={service.value}>
                  {service.label}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Reference" hint="Anything else worth recording.">
            <TextInput
              name="reference"
              defaultValue={values.reference}
              maxLength={120}
            />
          </Field>
        </div>
        {copy.billNoIsOurs ? (
          <p className="mt-3 text-xs text-[var(--color-muted)]">
            The system also issues its own number when this is saved, so the
            series stays gapless. The bill book number above is what the customer
            is shown.
          </p>
        ) : null}
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
              <Th className="w-8">No</Th>
              <Th>Particulars</Th>
              <Th className="w-24">Fabric Type</Th>
              <Th className="w-24">Color</Th>
              <Th className="w-24">Challan No</Th>
              <Th className="w-24">Order No</Th>
              <Th numeric className="w-28">
                F/Weight kg
              </Th>
              <Th numeric className="w-28">
                G/Weight kg
              </Th>
              <Th numeric className="w-24">
                Rate per kg
              </Th>
              <Th numeric className="w-32">
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
                    value={line.fabricType}
                    onChange={(e) =>
                      update(index, { fabricType: e.target.value })
                    }
                    placeholder="S/J, Rib"
                    maxLength={60}
                    autoComplete="off"
                  />
                </Td>
                <Td>
                  <TextInput
                    value={line.color}
                    onChange={(e) => update(index, { color: e.target.value })}
                    placeholder="Navy"
                    maxLength={60}
                    autoComplete="off"
                  />
                </Td>
                <Td>
                  <TextInput
                    value={line.challanNo}
                    onChange={(e) =>
                      update(index, { challanNo: e.target.value })
                    }
                    placeholder="1050"
                    maxLength={40}
                    autoComplete="off"
                  />
                </Td>
                <Td>
                  <TextInput
                    value={line.orderNo}
                    onChange={(e) => update(index, { orderNo: e.target.value })}
                    placeholder="75-T"
                    maxLength={40}
                    autoComplete="off"
                  />
                </Td>
                <Td>
                  <TextInput
                    value={line.finishedKg}
                    onChange={(e) =>
                      update(index, { finishedKg: e.target.value })
                    }
                    inputMode="decimal"
                    className="text-right"
                    placeholder="0.000"
                  />
                </Td>
                <Td>
                  <TextInput
                    value={line.greyKg}
                    onChange={(e) => update(index, { greyKg: e.target.value })}
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
              <Td colSpan={6}>Total</Td>
              <Td numeric>
                {totalFinished > 0n ? formatQtyKg(totalFinished) : ''}
              </Td>
              <Td numeric>{formatQtyKg(totalGrey)}</Td>
              <Td />
              <Td numeric>{formatTaka(total)}</Td>
              <Td />
            </tr>
          </tfoot>
        </Table>
        <p className="border-t border-[var(--color-line)] px-4 py-2 text-xs text-[var(--color-muted)]">
          The amount is the rate per kg on the grey weight, the same basis the
          full ERP bills on. Finished weight is recorded, not billed on, and can
          be left blank until it is known.
        </p>
      </Card>

      <Card className="p-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Narration"
            hint="What the ledger shows for this bill. Blank uses the standard wording."
          >
            <TextInput
              name="narration"
              defaultValue={values.narration}
              maxLength={200}
              placeholder="Dyeing Bill, Order 75-T, Challan 1050"
            />
          </Field>

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

{/*
        A new bill can be parked as a draft: entered, but out of every balance
        and off every statement until someone posts it. An edit keeps whatever
        status the bill already has, which is why it posts a hidden field.
      */}
      {billId ? <input type="hidden" name="status" value={values.status} /> : null}

      <div className="flex items-center gap-2">
        <Button type="submit" name="status" value="posted" disabled={pending}>
          {pending ? 'Saving' : submitLabel}
        </Button>
        {billId ? null : (
          <Button
            type="submit"
            name="status"
            value="draft"
            variant="secondary"
            disabled={pending}
          >
            Save as Draft
          </Button>
        )}
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
