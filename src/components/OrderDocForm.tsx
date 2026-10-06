'use client';

import { useActionState, useState } from 'react';
import { lineAmount, sumMoney } from '@/lib/amount';
import { amountInWords, formatTaka } from '@/lib/format';
import type { Money } from '@/lib/money';
import { type OrderCategory, WORK_PROCESSES } from '@/lib/types';
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
  Textarea,
  TextInput,
} from './ui';

/**
 * The Purchase Order and the Work Order, one form (2026-10-06).
 *
 * The same document aimed at a different party: a PO buys yarn from a supplier
 * against an order, a WO sends knitting or dyeing to a subcontractor. Every
 * line names the Sales Order line it is for, which is what lets the bill that
 * follows be costed against the right order.
 */

export type OrderDocLine = {
  id: string;
  orderLineId: string;
  description: string;
  color: string;
  gsm: string;
  dia: string;
  quantityKg: string;
  rate: string;
};

export type OrderDocValues = {
  partyId: string;
  process: string;
  orderDate: string;
  deliverToId: string;
  deliveryBy: string;
  terms: string;
  notes: string;
  lines: OrderDocLine[];
};

export type OrderLineChoice = {
  id: string;
  label: string;
  category: OrderCategory;
  open: boolean;
  description: string;
  color: string | null;
};

const EMPTY: OrderDocLine = {
  id: '',
  orderLineId: '',
  description: '',
  color: '',
  gsm: '',
  dia: '',
  quantityKg: '',
  rate: '',
};

function safeAmount(line: OrderDocLine): Money | null {
  try {
    return lineAmount(line.quantityKg, line.rate);
  } catch {
    return null;
  }
}

export function OrderDocForm({
  kind,
  parties,
  allParties,
  orderLines,
  action,
  values,
  submitLabel,
  cancelHref,
  docId,
  docNo,
  canCreateParty,
}: {
  kind: 'po' | 'wo';
  /** Suppliers for a PO, subcontractors for a WO. */
  parties: { id: string; name: string }[];
  /** Everybody, for Deliver To. */
  allParties: { id: string; name: string }[];
  orderLines: OrderLineChoice[];
  action: (state: { error?: string }, formData: FormData) => Promise<{ error?: string }>;
  values: OrderDocValues;
  submitLabel: string;
  cancelHref: string;
  docId?: string;
  docNo?: string;
  canCreateParty: boolean;
}) {
  const [state, submit, pending] = useActionState<{ error?: string }, FormData>(
    action,
    {},
  );
  const [lines, setLines] = useState<OrderDocLine[]>(
    values.lines.length > 0 ? values.lines : [{ ...EMPTY }],
  );
  const { values: header, set, register } = useKeptValues(
    {
      partyId: values.partyId,
      process: values.process,
      orderDate: values.orderDate,
      deliverToId: values.deliverToId,
      deliveryBy: values.deliveryBy,
      terms: values.terms,
      notes: values.notes,
      reason: '',
    },
    state,
  );

  const isWo = kind === 'wo';
  // Which order lines this document may serve: open orders only, plus any line
  // it already points at. Yarn and knitting are for finished fabric; dyeing
  // serves a dyeing service as well.
  const fabricOnly = !isWo || header.process === 'knitting';
  const choices = (current: string) =>
    orderLines.filter(
      (choice) =>
        choice.id === current ||
        (choice.open && (!fabricOnly || choice.category === 'fabric')),
    );

  const update = (index: number, patch: Partial<OrderDocLine>) =>
    setLines((current) =>
      current.map((line, i) => (i === index ? { ...line, ...patch } : line)),
    );
  const pick = (index: number, orderLineId: string) => {
    const choice = orderLines.find((c) => c.id === orderLineId);
    const line = lines[index]!;
    // Picking the order line fills what is blank from it; nothing typed is
    // overwritten.
    update(index, {
      orderLineId,
      description: line.description || choice?.description || '',
      color: line.color || choice?.color || '',
    });
  };
  const amounts = lines.map(safeAmount);
  const total = sumMoney(amounts.filter((a): a is Money => a !== null));
  const posted = lines.map((line) => ({ ...line, id: line.id || null }));
  const word = isWo ? 'Subcontractor' : 'Supplier';

  return (
    <form action={submit} className="space-y-4">
      <input type="hidden" name="kind" value={kind} />
      {docId ? <input type="hidden" name="id" value={docId} /> : null}
      <input type="hidden" name="linesJson" value={JSON.stringify(posted)} />

      <Card className="p-4">
        <div className="grid gap-4 md:grid-cols-4">
          <div className="md:col-span-2">
            <PartyPicker
              role={isWo ? 'subcontractor' : 'supplier'}
              label={word}
              parties={parties}
              value={header.partyId}
              onChange={(partyId) => set({ partyId })}
              selectRef={register('partyId')}
              canCreate={canCreateParty}
            />
          </div>
          {isWo ? (
            <Field label="Process">
              <Select
                ref={register('process')}
                name="process"
                value={header.process}
                onChange={(e) => set({ process: e.target.value })}
              >
                {WORK_PROCESSES.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </Select>
            </Field>
          ) : null}
          <Field label={isWo ? 'WO No' : 'PO No'}>
            <div className="figure rounded border border-[var(--color-line)] bg-[var(--color-canvas)] px-3 py-2 text-sm text-[var(--color-muted)]">
              {docNo ?? 'Issued on save'}
            </div>
          </Field>
          <Field label="Order Date">
            <TextInput
              type="date"
              name="orderDate"
              value={header.orderDate}
              onChange={(e) => set({ orderDate: e.target.value })}
              required
            />
          </Field>
          <Field label="Delivery By">
            <TextInput
              type="date"
              name="deliveryBy"
              value={header.deliveryBy}
              onChange={(e) => set({ deliveryBy: e.target.value })}
            />
          </Field>
          <div className="md:col-span-2">
            <Field label="Deliver To">
              <Select
                ref={register('deliverToId')}
                name="deliverToId"
                value={header.deliverToId}
                onChange={(e) => set({ deliverToId: e.target.value })}
              >
                <option value="">Our store</option>
                {allParties.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </Select>
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
              onClick={() => setLines((c) => [...c, { ...EMPTY }])}
            >
              Add Line
            </Button>
          }
        />
        <div className="divide-y divide-[var(--color-line)]">
          {lines.map((line, index) => (
            <div key={line.id || `new-${index}`} className="grid gap-3 p-3 md:grid-cols-12">
              <div className="md:col-span-4">
                <Field label={`${index + 1}. For Order Line`}>
                  <Select
                    value={line.orderLineId}
                    onChange={(e) => pick(index, e.target.value)}
                    required
                  >
                    <option value="">Select order line</option>
                    {choices(line.orderLineId).map((choice) => (
                      <option key={choice.id} value={choice.id}>
                        {choice.label}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>
              <div className={isWo ? 'md:col-span-4' : 'md:col-span-5'}>
                <Field label={isWo ? 'Description' : 'Yarn'}>
                  <TextInput
                    type="text"
                    value={line.description}
                    onChange={(e) => update(index, { description: e.target.value })}
                    maxLength={300}
                    autoComplete="off"
                  />
                </Field>
              </div>
              {isWo ? (
                <>
                  <div className="md:col-span-2">
                    <Field label="Color">
                      <TextInput
                        type="text"
                        value={line.color}
                        onChange={(e) => update(index, { color: e.target.value })}
                        maxLength={60}
                      />
                    </Field>
                  </div>
                  <div className="md:col-span-1">
                    <Field label="GSM">
                      <TextInput
                        type="text"
                        value={line.gsm}
                        onChange={(e) => update(index, { gsm: e.target.value })}
                        maxLength={40}
                      />
                    </Field>
                  </div>
                  <div className="md:col-span-1">
                    <Field label="Dia">
                      <TextInput
                        type="text"
                        value={line.dia}
                        onChange={(e) => update(index, { dia: e.target.value })}
                        maxLength={40}
                      />
                    </Field>
                  </div>
                </>
              ) : null}
              <div className="md:col-span-2">
                <Field label={isWo ? 'Grey kg' : 'Yarn kg'}>
                  <TextInput
                    value={line.quantityKg}
                    onChange={(e) => update(index, { quantityKg: e.target.value })}
                    inputMode="decimal"
                    className="text-right"
                    placeholder="0.000"
                  />
                </Field>
              </div>
              <div className="md:col-span-2">
                <Field label="Rate per kg">
                  <TextInput
                    value={line.rate}
                    onChange={(e) => update(index, { rate: e.target.value })}
                    inputMode="decimal"
                    className="text-right"
                    placeholder="0.00"
                  />
                </Field>
              </div>
              <div className="flex items-end justify-between gap-2 md:col-span-2 md:justify-end">
                <div className="py-2 text-right text-sm font-semibold">
                  {amounts[index] ? formatTaka(amounts[index]!) : '-'}
                </div>
                {lines.length > 1 ? (
                  <button
                    type="button"
                    onClick={() => setLines((c) => c.filter((_, i) => i !== index))}
                    className="inline-flex min-h-11 items-center px-2 text-sm text-red-700 md:min-h-0 md:py-2"
                  >
                    Remove
                  </button>
                ) : null}
              </div>
            </div>
          ))}
        </div>
        <div className="flex flex-wrap justify-between gap-2 border-t border-[var(--color-rule)] bg-[var(--color-canvas)] px-4 py-2 text-sm">
          <span className="text-[var(--color-muted)]">{amountInWords(total)}</span>
          <span className="font-semibold">Total {formatTaka(total)}</span>
        </div>
      </Card>

      <Card className="space-y-4 p-4">
        <Field label="Terms">
          <Textarea
            name="terms"
            value={header.terms}
            onChange={(e) => set({ terms: e.target.value })}
            maxLength={500}
          />
        </Field>
        <Field label="Remarks">
          <Textarea
            name="notes"
            value={header.notes}
            onChange={(e) => set({ notes: e.target.value })}
            maxLength={1000}
          />
        </Field>
        {docId ? (
          <Field label="Reason for the Edit">
            <Textarea
              name="reason"
              value={header.reason}
              onChange={(e) => set({ reason: e.target.value })}
              required
              maxLength={300}
            />
          </Field>
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
