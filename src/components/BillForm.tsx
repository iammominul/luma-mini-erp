'use client';

import { useActionState, useEffect, useRef, useState } from 'react';
import { Money } from '@/lib/money';
import { amountInWords, formatTaka } from '@/lib/format';
import {
  formatQtyKg,
  lineAmount,
  parseQtyKg,
  sumGrams,
  sumMoney,
} from '@/lib/amount';
import type { SideCopy } from '@/lib/side';
import { NATURE_OF_WORK } from '@/lib/types';
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

export type BillFormState = { error?: string };

export type BillFormLine = {
  description: string;
  color: string;
  challanNo: string;
  orderNo: string;
  lotNo: string;
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
  billDate: string;
  notes: string;
  lines: BillFormLine[];
};

const EMPTY_LINE: BillFormLine = {
  description: '',
  color: '',
  challanNo: '',
  orderNo: '',
  lotNo: '',
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

/**
 * The system number this bill would take, worked out the same way the insert
 * works it out: the year off the bill date, the serial padded to at least four.
 * It follows the date field, because changing the date changes the number.
 */
function previewDocNo(billDate: string, serial: number): string | null {
  const year = billDate.slice(2, 4);
  if (year.length !== 2) return null;
  const digits = String(serial);
  return `CB-${year}-${digits.padStart(Math.max(4, digits.length), '0')}`;
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
  docNo,
  nextSerial,
  checkBillNo,
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
  /** The number already issued, when editing a posted customer bill. */
  docNo?: string | null;
  /** The serial the next customer bill would take. Null on the other side. */
  nextSerial?: number | null;
  /** Asks whether the number is already in the book. A warning, not a gate. */
  checkBillNo?: (input: {
    side: string;
    billNo: string;
    partyId: string;
    excludeId?: string;
  }) => Promise<{ taken: boolean; message: string | null }>;
}) {
  const [state, submit, pending] = useActionState<BillFormState, FormData>(
    action,
    {},
  );
  const [lines, setLines] = useState<BillFormLine[]>(
    values.lines.length > 0 ? values.lines : [{ ...EMPTY_LINE }],
  );

  // Which line is open in the phone editor. Only one is, so a bill is a list
  // of what each line is worth with one line being keyed, rather than every
  // field of every line at once. The desktop table ignores this entirely.
  //
  // Nothing about it can lose a keystroke: the inputs carry no name, every
  // value lives in `lines`, and the whole array is posted as `linesJson`. A
  // closed line is unmounted markup, not a dropped figure.
  const [openLine, setOpenLine] = useState(0);

  // The narration overrides what the ledger prints and is used on a minority of
  // bills, so it is folded away rather than sitting in the way of every entry.
  // It opens itself when there is one to see.
  const [showMore, setShowMore] = useState(Boolean(values.narration));

  // The header keeps what was typed even when a save comes back with an error.
  // The line grid below already did, which is why the lines survived a repeated
  // bill number and everything above them did not.
  const {
    values: header,
    set: setField,
    register,
  } = useKeptValues(
    {
      partyId: values.partyId,
      billDate: values.billDate,
      billNo: values.billNo,
      natureOfWork: values.natureOfWork,
      narration: values.narration,
      notes: values.notes,
      reason: '',
    },
    state,
  );

  // Whether this number is already in the book. Asked while it is typed, so a
  // repeat is found before the lines are keyed rather than after.
  const [duplicate, setDuplicate] = useState<string | null>(null);
  const touched = useRef(false);

  useEffect(() => {
    if (!checkBillNo) return;
    // Nothing to say until somebody has typed. Without this the check fires on
    // first paint and, when editing, reports the bill against itself.
    if (!touched.current) return;

    const billNo = header.billNo.trim();
    if (!billNo) {
      setDuplicate(null);
      return;
    }

    let live = true;
    const timer = setTimeout(() => {
      void checkBillNo({
        side: copy.side,
        billNo,
        partyId: header.partyId,
        excludeId: billId,
      }).then((answer) => {
        if (live) setDuplicate(answer.message);
      });
    }, 400);

    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [header.billNo, header.partyId, checkBillNo, copy.side, billId]);

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

  const systemBillNo = copy.billNoIsOurs
    ? (docNo ?? (nextSerial ? previewDocNo(header.billDate, nextSerial) : null))
    : null;

  return (
    <form action={submit} className="space-y-4">
      <input type="hidden" name="side" value={copy.side} />
      {billId ? <input type="hidden" name="id" value={billId} /> : null}
      <input type="hidden" name="linesJson" value={JSON.stringify(lines)} />

      {/* Three blocks rather than one row of five. Who the bill is against and
          when, then what identifies it, then what it is for. They were one flat
          grid, which asked somebody to work out from the labels alone which of
          five fields belonged together. */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="p-4">
          <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--color-muted)]">
            Party and Date
          </h3>
          <div className="space-y-3">
            <Field label={copy.partyWord}>
              <Select
                ref={register('partyId')}
                name="partyId"
                value={header.partyId}
                onChange={(e) => setField({ partyId: e.target.value })}
                required
              >
                <option value="">Select {copy.partyWord}</option>
                {parties.map((party) => (
                  <option key={party.id} value={party.id}>
                    {party.name}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Bill Date">
              <TextInput
                type="date"
                name="billDate"
                value={header.billDate}
                onChange={(e) => setField({ billDate: e.target.value })}
                required
              />
            </Field>
          </div>
        </Card>

        <Card className="p-4">
          <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--color-muted)]">
            Bill Number
          </h3>
          <div className="space-y-3">
            <Field
              label="Bill No"
              hint={
                copy.billNoIsOurs
                  ? 'As written on the paper bill sent to the customer.'
                  : 'As written on the bill they sent.'
              }
            >
              <TextInput
                type="text"
                name="billNo"
                value={header.billNo}
                onChange={(e) => {
                  touched.current = true;
                  setField({ billNo: e.target.value });
                }}
                required
                maxLength={40}
                autoComplete="off"
                aria-invalid={duplicate ? true : undefined}
              />
              {/* Under the field it is about. A repeated number used to be
                  found only when the whole bill was submitted. */}
              {duplicate ? (
                <span className="mt-1 block text-xs font-medium text-[var(--color-crit)]">
                  {duplicate}
                </span>
              ) : null}
            </Field>

            {copy.billNoIsOurs && systemBillNo ? (
              <Field
                label="System Bill No"
                hint={
                  docNo
                    ? 'Issued when this bill was posted. It never changes.'
                    : 'Issued when this bill is saved. If somebody else saves first, this bill takes the next one.'
                }
              >
                <div className="figure rounded border border-[var(--color-line)] bg-[var(--color-canvas)] px-3 py-2 text-sm text-[var(--color-muted)]">
                  {systemBillNo}
                </div>
              </Field>
            ) : null}
          </div>
        </Card>

        <Card className="p-4">
          <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--color-muted)]">
            Work
          </h3>
          <Field label="Nature of Work" hint="What this bill is for.">
            <Select
              ref={register('natureOfWork')}
              name="natureOfWork"
              value={header.natureOfWork}
              onChange={(e) => setField({ natureOfWork: e.target.value })}
            >
              {NATURE_OF_WORK.map((service) => (
                <option key={service.value} value={service.value}>
                  {service.label}
                </option>
              ))}
            </Select>
          </Field>
        </Card>
      </div>

      <Card>
        <CardHeader
          title="Items"
          action={
            // The desktop's, because a table has no foot to put a control on.
            // The phone editor carries its own at the bottom of the list.
            <Button
              type="button"
              variant="secondary"
              className="hidden md:inline-flex"
              onClick={() => setLines((c) => [...c, { ...EMPTY_LINE }])}
            >
              Add Line
            </Button>
          }
        />
        {/* Both layouts are in the document at once, and that is safe here
            because not one of these inputs carries a name: the lines are held
            in state and posted as the single linesJson field above. */}
        <div className="hidden md:block">
          <Table>
            <thead>
              <tr>
                <Th className="w-8">No</Th>
                <Th>Description</Th>
                <Th className="w-24">Order No</Th>
                <Th className="w-24">Challan No</Th>
                <Th className="w-24">LOT No</Th>
                <Th className="w-24">Color</Th>
                {/* The finished weight is recorded, not billed on. The grey
                    weight sits next to the rate next to the amount, so the
                    arithmetic the bill is built on reads left to right. */}
                <Th numeric className="w-24">
                  F/Weight kg
                </Th>
                <Th numeric className="w-24">
                  G/Weight kg
                </Th>
                <Th numeric className="w-24">
                  Unit Rate
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
                  {/* Plain text fields, and deliberately no placeholders: what
                      goes in a bill line is whatever the paper bill says, and an
                      example sitting in an empty cell reads as a rule about the
                      format when it is not one. */}
                  <Td>
                    <TextInput
                      type="text"
                      value={line.description}
                      onChange={(e) =>
                        update(index, { description: e.target.value })
                      }
                      maxLength={300}
                      autoComplete="off"
                    />
                  </Td>
                  <Td>
                    <TextInput
                      type="text"
                      value={line.orderNo}
                      onChange={(e) =>
                        update(index, { orderNo: e.target.value })
                      }
                      maxLength={40}
                      autoComplete="off"
                    />
                  </Td>
                  <Td>
                    <TextInput
                      type="text"
                      value={line.challanNo}
                      onChange={(e) =>
                        update(index, { challanNo: e.target.value })
                      }
                      maxLength={40}
                      autoComplete="off"
                    />
                  </Td>
                  <Td>
                    <TextInput
                      type="text"
                      value={line.lotNo}
                      onChange={(e) => update(index, { lotNo: e.target.value })}
                      maxLength={40}
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
                      onChange={(e) =>
                        update(index, { greyKg: e.target.value })
                      }
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
        </div>

        {/* One line at a time on a phone, and only one open at a time.
            Ten columns of money side by side is how a figure ends up in the
            wrong one; ten fields all open at once is a bill you scroll for
            a minute and a half to reach the bottom of. A finished line closes
            to what it is worth, which is what you check it by. */}
        <div className="divide-y divide-[var(--color-line)] md:hidden">
          {lines.map((line, index) =>
            index !== openLine ? (
              <button
                key={index}
                type="button"
                onClick={() => setOpenLine(index)}
                className="flex min-h-14 w-full items-center gap-3 px-3 py-2 text-left active:bg-[var(--color-canvas)]"
              >
                <span className="w-5 shrink-0 text-sm text-[var(--color-muted)]">
                  {index + 1}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm">
                  {line.description || (
                    <span className="text-[var(--color-muted)]">
                      Line {index + 1}
                    </span>
                  )}
                </span>
                <span className="shrink-0 whitespace-nowrap text-sm font-semibold">
                  {amounts[index] ? formatTaka(amounts[index]!) : '-'}
                </span>
              </button>
            ) : (
              <div key={index} className="space-y-3 p-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wide text-[var(--color-muted)]">
                    Line {index + 1}
                  </span>
                  {lines.length > 1 ? (
                    <button
                      type="button"
                      onClick={() => {
                        setLines((c) => c.filter((_, i) => i !== index));
                        // Removing the open line opens the one before it, so the
                        // card is never left with nothing expanded.
                        setOpenLine(Math.max(0, index - 1));
                      }}
                      className="-mr-2 inline-flex min-h-11 items-center px-2 text-sm text-red-700"
                    >
                      Remove
                    </button>
                  ) : null}
                </div>

                <Field label="Description">
                  <TextInput
                    type="text"
                    value={line.description}
                    onChange={(e) =>
                      update(index, { description: e.target.value })
                    }
                    maxLength={300}
                    autoComplete="off"
                  />
                </Field>

                <div className="grid grid-cols-2 gap-3">
                  <Field label="Order No">
                    <TextInput
                      type="text"
                      value={line.orderNo}
                      onChange={(e) =>
                        update(index, { orderNo: e.target.value })
                      }
                      maxLength={40}
                      autoComplete="off"
                    />
                  </Field>
                  <Field label="Challan No">
                    <TextInput
                      type="text"
                      value={line.challanNo}
                      onChange={(e) =>
                        update(index, { challanNo: e.target.value })
                      }
                      maxLength={40}
                      autoComplete="off"
                    />
                  </Field>
                  <Field label="LOT No">
                    <TextInput
                      type="text"
                      value={line.lotNo}
                      onChange={(e) => update(index, { lotNo: e.target.value })}
                      maxLength={40}
                      autoComplete="off"
                    />
                  </Field>
                  <Field label="Color">
                    <TextInput
                      type="text"
                      value={line.color}
                      onChange={(e) => update(index, { color: e.target.value })}
                      maxLength={60}
                      autoComplete="off"
                    />
                  </Field>
                  <Field label="F/Weight kg">
                    <TextInput
                      value={line.finishedKg}
                      onChange={(e) =>
                        update(index, { finishedKg: e.target.value })
                      }
                      inputMode="decimal"
                      className="text-right"
                      placeholder="0.000"
                    />
                  </Field>
                  <Field label="G/Weight kg">
                    <TextInput
                      value={line.greyKg}
                      onChange={(e) =>
                        update(index, { greyKg: e.target.value })
                      }
                      inputMode="decimal"
                      className="text-right"
                      placeholder="0.000"
                    />
                  </Field>
                  <Field label="Unit Rate">
                    <TextInput
                      value={line.rate}
                      onChange={(e) => update(index, { rate: e.target.value })}
                      inputMode="decimal"
                      className="text-right"
                      placeholder="0.00"
                    />
                  </Field>
                  <div>
                    <span className="mb-1 block text-sm font-medium">
                      Amount
                    </span>
                    <div className="whitespace-nowrap py-2.5 text-right text-base font-semibold">
                      {amounts[index] ? formatTaka(amounts[index]!) : '-'}
                    </div>
                  </div>
                </div>
              </div>
            ),
          )}

          {/* At the foot, beside the line just keyed. In the card header it
              was a screen and a half above whoever needed it. */}
          <button
            type="button"
            onClick={() => {
              setLines((c) => [...c, { ...EMPTY_LINE }]);
              setOpenLine(lines.length);
            }}
            className="flex min-h-14 w-full items-center justify-center gap-1.5 px-3 py-3 text-sm font-medium text-[var(--color-navy)] active:bg-[var(--color-canvas)]"
          >
            Add Line
          </button>
        </div>

        <p className="border-t border-[var(--color-line)] px-4 py-2 text-xs text-[var(--color-muted)]">
          The amount is the rate per kg on the grey weight, the same basis the
          full ERP bills on. Finished weight is recorded, not billed on, and can
          be left blank until it is known.
        </p>
      </Card>

      {/* What the bill comes to, in one place, including the words. The words
          are what the printed bill carries, so keying can be checked against
          the document without opening it. */}
      <Card>
        <CardHeader title="Summary" />
        <div className="p-4">
          <dl className="grid gap-3 sm:grid-cols-3">
            <div>
              <dt className="text-[11px] font-medium uppercase tracking-wide text-[var(--color-muted)]">
                Grey Weight
              </dt>
              <dd className="figure mt-0.5 text-sm">
                {formatQtyKg(totalGrey)} kg
              </dd>
            </div>
            <div>
              <dt className="text-[11px] font-medium uppercase tracking-wide text-[var(--color-muted)]">
                Finished Weight
              </dt>
              <dd className="figure mt-0.5 text-sm">
                {totalFinished > 0n ? `${formatQtyKg(totalFinished)} kg` : ''}
              </dd>
            </div>
            <div>
              <dt className="text-[11px] font-medium uppercase tracking-wide text-[var(--color-muted)]">
                Bill Amount
              </dt>
              <dd className="figure mt-0.5 text-base font-semibold">
                {formatTaka(total)}
              </dd>
            </div>
          </dl>
          <div className="mt-3 border-t border-[var(--color-line)] pt-3 text-sm">
            <span className="font-medium">In Words (BDT): </span>
            {amountInWords(total)}
          </div>
        </div>
      </Card>

      <Card className="p-4">
        <Field label="Remarks">
          <Textarea
            name="notes"
            value={header.notes}
            onChange={(e) => setField({ notes: e.target.value })}
            maxLength={1000}
          />
        </Field>

        {requireReason ? (
          <div className="mt-4">
            <Field
              label="Reason for the Edit"
              hint="Recorded in the activity log."
            >
              <Textarea
                name="reason"
                value={header.reason}
                onChange={(e) => setField({ reason: e.target.value })}
                required
                maxLength={300}
              />
            </Field>
          </div>
        ) : null}

        {/* Narration is a control on what the ledger prints, not a note, and
            most bills never need one. It stays reachable and out of the way. */}
        <div className="mt-4 border-t border-[var(--color-line)] pt-3">
          <button
            type="button"
            onClick={() => setShowMore((was) => !was)}
            aria-expanded={showMore}
            className="text-sm font-medium text-[var(--color-navy)] hover:underline"
          >
            {showMore ? 'Hide More Options' : 'More Options'}
          </button>
          {showMore ? (
            <div className="mt-3">
              <Field
                label="Ledger Narration"
                hint="Blank uses the standard wording."
              >
                <TextInput
                  type="text"
                  name="narration"
                  value={header.narration}
                  onChange={(e) => setField({ narration: e.target.value })}
                  maxLength={200}
                  autoComplete="off"
                />
              </Field>
            </div>
          ) : null}
        </div>
      </Card>

      {state.error ? <Notice tone="error">{state.error}</Notice> : null}

      {/*
        A new bill can be parked as a draft: entered, but out of every balance
        and off every statement until someone posts it. An edit keeps whatever
        status the bill already has, which is why it posts a hidden field.
      */}
      {billId ? (
        <input type="hidden" name="status" value={values.status} />
      ) : null}

      {/* Pinned to the foot of the work area. A bill with twenty lines had its
          Save two screens below the line being keyed. */}
      <div className="sticky bottom-0 -mx-4 border-t border-[var(--color-rule)] bg-[var(--color-surface-2)] px-4 py-3 md:-mx-6 md:px-6">
        <FormActions>
          <Button
            type="submit"
            name="status"
            value="posted"
            icon="check"
            disabled={pending}
          >
            {pending ? 'Saving' : submitLabel}
          </Button>
          {billId ? null : (
            <Button
              type="submit"
              name="status"
              value="draft"
              variant="secondary"
              icon="check"
              disabled={pending}
            >
              {pending ? 'Saving' : 'Save as Draft'}
            </Button>
          )}
          <CancelLink href={cancelHref} />
        </FormActions>
      </div>
    </form>
  );
}
