'use client';

import { useActionState, useState } from 'react';
import { lineAmount, sumMoney } from '@/lib/amount';
import { amountInWords, formatTaka } from '@/lib/format';
import type { Money } from '@/lib/money';
import { ORDER_CATEGORIES } from '@/lib/types';
import { PartyPicker } from './PartyPicker';
import { useKeptValues } from './use-kept-values';
import {
  Button,
  CancelLink,
  Card,
  CardHeader,
  Field,
  FormActions,
  Notice,
  Select,
  Table,
  Td,
  Textarea,
  TextInput,
  Th,
} from './ui';

export type SalesOrderFormLine = {
  /** Set on a line that already exists, so its links survive an edit. */
  id: string;
  category: string;
  description: string;
  color: string;
  quantity: string;
  rate: string;
};

export type SalesOrderFormValues = {
  partyId: string;
  orderDate: string;
  customerRef: string;
  notes: string;
  lines: SalesOrderFormLine[];
};

const EMPTY_LINE: SalesOrderFormLine = {
  id: '',
  category: 'fabric',
  description: '',
  color: '',
  quantity: '',
  rate: '',
};

/** A preview only: the server works every amount out again. */
function safeAmount(line: SalesOrderFormLine): Money | null {
  try {
    return lineAmount(line.quantity, line.rate);
  } catch {
    return null;
  }
}

export function SalesOrderForm({
  customers,
  action,
  values,
  submitLabel,
  cancelHref,
  orderId,
  docNo,
  canCreateParty,
}: {
  customers: { id: string; name: string }[];
  action: (state: { error?: string }, formData: FormData) => Promise<{ error?: string }>;
  values: SalesOrderFormValues;
  submitLabel: string;
  cancelHref: string;
  /** Set when editing. */
  orderId?: string;
  docNo?: string;
  canCreateParty: boolean;
}) {
  const [state, submit, pending] = useActionState<{ error?: string }, FormData>(
    action,
    {},
  );
  const [lines, setLines] = useState<SalesOrderFormLine[]>(
    values.lines.length > 0 ? values.lines : [{ ...EMPTY_LINE }],
  );
  const { values: header, set, register } = useKeptValues(
    {
      partyId: values.partyId,
      orderDate: values.orderDate,
      customerRef: values.customerRef,
      notes: values.notes,
      reason: '',
    },
    state,
  );

  const update = (index: number, patch: Partial<SalesOrderFormLine>) =>
    setLines((current) =>
      current.map((line, i) => (i === index ? { ...line, ...patch } : line)),
    );
  const remove = (index: number) =>
    setLines((current) => current.filter((_, i) => i !== index));
  const amounts = lines.map(safeAmount);
  const total = sumMoney(amounts.filter((a): a is Money => a !== null));

  // What is posted. A blank id is a new line; the server issues it one.
  const posted = lines.map((line) => ({ ...line, id: line.id || null }));

  return (
    <form action={submit} className="space-y-4">
      {orderId ? <input type="hidden" name="id" value={orderId} /> : null}
      <input type="hidden" name="linesJson" value={JSON.stringify(posted)} />

      <Card className="p-4">
        <div className="grid gap-4 md:grid-cols-4">
          <div className="md:col-span-2">
            <PartyPicker
              role="customer"
              label="Customer"
              parties={customers}
              value={header.partyId}
              onChange={(partyId) => set({ partyId })}
              selectRef={register('partyId')}
              canCreate={canCreateParty}
            />
          </div>
          <Field label="Order Date">
            <TextInput
              type="date"
              name="orderDate"
              value={header.orderDate}
              onChange={(e) => set({ orderDate: e.target.value })}
              required
            />
          </Field>
          <Field label="SO No">
            <div className="figure rounded border border-[var(--color-line)] bg-[var(--color-canvas)] px-3 py-2 text-sm text-[var(--color-muted)]">
              {docNo ?? 'Issued on save'}
            </div>
          </Field>
          <div className="md:col-span-2">
            <Field label="Customer PO / WO No">
              <TextInput
                type="text"
                name="customerRef"
                value={header.customerRef}
                onChange={(e) => set({ customerRef: e.target.value })}
                maxLength={60}
                autoComplete="off"
              />
            </Field>
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader
          title="Lines"
          action={
            <Button
              type="button"
              variant="secondary"
              icon="plus"
              onClick={() => setLines((c) => [...c, { ...EMPTY_LINE }])}
            >
              Add Line
            </Button>
          }
        />
        <div className="hidden md:block">
          <Table>
            <thead>
              <tr>
                <Th className="w-8">No</Th>
                <Th className="w-40">Category</Th>
                <Th>Description</Th>
                <Th className="w-28">Color</Th>
                <Th numeric className="w-28">
                  Grey kg
                </Th>
                <Th numeric className="w-28">
                  Rate
                </Th>
                <Th numeric className="w-32">
                  Amount
                </Th>
                <Th className="w-16" />
              </tr>
            </thead>
            <tbody>
              {lines.map((line, index) => (
                <tr key={line.id || `new-${index}`}>
                  <Td className="text-[var(--color-muted)]">{index + 1}</Td>
                  <Td>
                    <Select
                      value={line.category}
                      onChange={(e) => update(index, { category: e.target.value })}
                    >
                      {ORDER_CATEGORIES.map((c) => (
                        <option key={c.value} value={c.value}>
                          {c.label}
                        </option>
                      ))}
                    </Select>
                  </Td>
                  <Td>
                    <TextInput
                      type="text"
                      value={line.description}
                      onChange={(e) => update(index, { description: e.target.value })}
                      maxLength={300}
                      autoComplete="off"
                    />
                  </Td>
                  <Td>
                    <TextInput
                      type="text"
                      value={line.color}
                      onChange={(e) => update(index, { color: e.target.value })}
                      maxLength={60}
                      autoComplete="off"
                    />
                  </Td>
                  <Td>
                    <TextInput
                      value={line.quantity}
                      onChange={(e) => update(index, { quantity: e.target.value })}
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
                        onClick={() => remove(index)}
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
                <Td colSpan={6}>Booked Value</Td>
                <Td numeric>{formatTaka(total)}</Td>
                <Td />
              </tr>
            </tfoot>
          </Table>
        </div>

        <div className="divide-y divide-[var(--color-line)] md:hidden">
          {lines.map((line, index) => (
            <div key={line.id || `new-${index}`} className="space-y-3 p-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wide text-[var(--color-muted)]">
                  Line {index + 1}
                </span>
                {lines.length > 1 ? (
                  <button
                    type="button"
                    onClick={() => remove(index)}
                    className="-mr-2 inline-flex min-h-11 items-center px-2 text-sm text-red-700"
                  >
                    Remove
                  </button>
                ) : null}
              </div>
              <Field label="Category">
                <Select
                  value={line.category}
                  onChange={(e) => update(index, { category: e.target.value })}
                >
                  {ORDER_CATEGORIES.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Description">
                <TextInput
                  type="text"
                  value={line.description}
                  onChange={(e) => update(index, { description: e.target.value })}
                  maxLength={300}
                />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Color">
                  <TextInput
                    type="text"
                    value={line.color}
                    onChange={(e) => update(index, { color: e.target.value })}
                    maxLength={60}
                  />
                </Field>
                <Field label="Grey kg">
                  <TextInput
                    value={line.quantity}
                    onChange={(e) => update(index, { quantity: e.target.value })}
                    inputMode="decimal"
                    className="text-right"
                  />
                </Field>
                <Field label="Rate">
                  <TextInput
                    value={line.rate}
                    onChange={(e) => update(index, { rate: e.target.value })}
                    inputMode="decimal"
                    className="text-right"
                  />
                </Field>
                <div>
                  <span className="mb-1 block text-sm font-medium">Amount</span>
                  <div className="py-2.5 text-right text-base font-semibold">
                    {amounts[index] ? formatTaka(amounts[index]!) : '-'}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
        <p className="border-t border-[var(--color-line)] px-4 py-2 text-xs text-[var(--color-muted)]">
          Booked value in words: {amountInWords(total)}
        </p>
      </Card>

      <Card className="p-4">
        <Field label="Remarks">
          <Textarea
            name="notes"
            value={header.notes}
            onChange={(e) => set({ notes: e.target.value })}
            maxLength={1000}
          />
        </Field>
        {orderId ? (
          <div className="mt-4">
            <Field label="Reason for the Edit">
              <Textarea
                name="reason"
                value={header.reason}
                onChange={(e) => set({ reason: e.target.value })}
                required
                maxLength={300}
              />
            </Field>
          </div>
        ) : null}
      </Card>

      {state.error ? <Notice tone="error">{state.error}</Notice> : null}

      <div className="sticky bottom-0 -mx-4 border-t border-[var(--color-rule)] bg-[var(--color-surface-2)] px-4 py-3 md:-mx-6 md:px-6">
        <FormActions>
          <Button type="submit" icon="check" disabled={pending}>
            {pending ? 'Saving' : submitLabel}
          </Button>
          <CancelLink href={cancelHref} />
        </FormActions>
      </div>
    </form>
  );
}
