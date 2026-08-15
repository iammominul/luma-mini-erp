'use client';

import { Fragment, useActionState, useState } from 'react';
import { formatTaka } from '@/lib/format';
import { Money } from '@/lib/money';
import { absenceDeduction, type PerDayBasis } from '@/lib/payroll';
import { Button, Card, Notice, Table, Td, Th } from './ui';

export type PayrollGridState = { error?: string };

export type GridLine = {
  id: string;
  employeeName: string;
  employeeCode: string | null;
  designation: string | null;
  gross: string;
  absentDays: string;
  bonus: string;
  additionalAllowance: string;
  advanceDeduction: string;
  otherDeduction: string;
  remarks: string;
  /** What this employee still owes, so the row can say so. */
  advanceOutstanding: string;
};

type Editable = Omit<
  GridLine,
  'employeeName' | 'employeeCode' | 'designation' | 'gross' | 'advanceOutstanding'
>;

const CELL =
  'w-full border border-[var(--color-line)] bg-white px-1.5 py-1 text-right text-sm';

/**
 * One keyed figure on a phone, with its label above rather than in a heading
 * eight columns away. 16px text, so iOS does not zoom the page on focus.
 */
function PhoneCell({
  label,
  value,
  onChange,
  readOnly,
  note,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  readOnly: boolean;
  note?: string;
}) {
  return (
    <div className="min-w-0">
      <span className="mb-1 block text-sm font-medium">{label}</span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        inputMode="decimal"
        readOnly={readOnly}
        className="min-h-11 w-full rounded border border-[var(--color-line)] bg-white px-3 py-2.5 text-right text-base"
      />
      {note ? (
        <span className="mt-0.5 block text-xs text-[var(--color-muted)]">
          {note}
        </span>
      ) : null}
    </div>
  );
}

/**
 * The month, one row per employee, saved in a single post.
 *
 * Everything typed here is a figure HR knows and the app cannot: how many days
 * somebody was absent without pay, what bonus was agreed, how much of an
 * advance is coming back. The absence cost and the net are worked out as you
 * type, using the same functions the server uses, so the figure on screen is
 * the figure that gets saved rather than an approximation of it.
 */
export function PayrollGrid({
  runId,
  period,
  perDayBasis,
  lines,
  readOnly,
  action,
}: {
  runId: string;
  period: string;
  perDayBasis: PerDayBasis;
  lines: GridLine[];
  readOnly: boolean;
  action: (
    state: PayrollGridState,
    formData: FormData,
  ) => Promise<PayrollGridState>;
}) {
  const [state, submit, pending] = useActionState<PayrollGridState, FormData>(
    action,
    {},
  );

  const [rows, setRows] = useState<Record<string, Editable>>(() =>
    Object.fromEntries(
      lines.map((line) => [
        line.id,
        {
          id: line.id,
          absentDays: line.absentDays,
          bonus: line.bonus,
          additionalAllowance: line.additionalAllowance,
          advanceDeduction: line.advanceDeduction,
          otherDeduction: line.otherDeduction,
          remarks: line.remarks,
        },
      ]),
    ),
  );

  const set = (id: string, patch: Partial<Editable>) =>
    setRows((current) => ({ ...current, [id]: { ...current[id]!, ...patch } }));

  /** The row's figures, or null while something is half typed. */
  const figuresFor = (line: GridLine) => {
    const row = rows[line.id];
    if (!row) return null;
    try {
      const gross = Money.fromDecimal(line.gross);
      const absence = absenceDeduction(
        gross,
        row.absentDays || '0',
        perDayBasis,
        period,
      );
      const net = gross
        .subtract(absence)
        .subtract(Money.fromDecimal(row.advanceDeduction || '0'))
        .subtract(Money.fromDecimal(row.otherDeduction || '0'))
        .add(Money.fromDecimal(row.bonus || '0'))
        .add(Money.fromDecimal(row.additionalAllowance || '0'));
      return { absence, net, negative: net.isNegative() };
    } catch {
      return null;
    }
  };

  const totals = lines.reduce(
    (running, line) => {
      const figures = figuresFor(line);
      if (!figures) return running;
      return {
        gross: running.gross.add(Money.fromDecimal(line.gross)),
        absence: running.absence.add(figures.absence),
        net: running.net.add(figures.net),
      };
    },
    { gross: Money.ZERO, absence: Money.ZERO, net: Money.ZERO },
  );

  const anyNegative = lines.some((line) => figuresFor(line)?.negative);

  return (
    <form action={submit}>
      <input type="hidden" name="runId" value={runId} />
      <input type="hidden" name="period" value={period} />

      {/*
        What the form posts, kept apart from what it shows.

        The action zips these by position (getAll('lineId')[i] against
        getAll('bonus')[i] and the rest), so exactly one set has to exist
        however many layouts are on screen at a given width. The visible inputs
        below deliberately carry no name: every value already lives in `rows`,
        so their names were only ever a second copy waiting to be posted twice.
        FormData keeps document order, so one map here is byte for byte what
        the server read before.
      */}
      {lines.map((line) => {
        const row = rows[line.id]!;
        return (
          <Fragment key={line.id}>
            <input type="hidden" name="lineId" value={line.id} />
            <input type="hidden" name="absentDays" value={row.absentDays} />
            <input type="hidden" name="bonus" value={row.bonus} />
            <input
              type="hidden"
              name="additionalAllowance"
              value={row.additionalAllowance}
            />
            <input
              type="hidden"
              name="advanceDeduction"
              value={row.advanceDeduction}
            />
            <input
              type="hidden"
              name="otherDeduction"
              value={row.otherDeduction}
            />
            <input type="hidden" name="remarks" value={row.remarks} />
          </Fragment>
        );
      })}

      <Card>
        <div className="hidden md:block">
        <Table sticky>
          <thead>
            <tr>
              <Th>Employee</Th>
              <Th numeric>Gross</Th>
              <Th numeric>Absent Days</Th>
              <Th numeric>Absence</Th>
              <Th numeric>Bonus</Th>
              <Th numeric>Allowance</Th>
              <Th numeric>Advance</Th>
              <Th numeric>Other</Th>
              <Th>Remarks</Th>
              <Th numeric>Net Payable</Th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line) => {
              const row = rows[line.id]!;
              const figures = figuresFor(line);
              return (
                <tr key={line.id} className="hover:bg-gray-50">
                  <Td>
                    <div className="font-medium">{line.employeeName}</div>
                    <div className="text-xs text-[var(--color-muted)]">
                      {[line.employeeCode, line.designation]
                        .filter(Boolean)
                        .join(' - ')}
                    </div>
                  </Td>
                  <Td numeric>{formatTaka(Money.fromDecimal(line.gross))}</Td>

                  <Td numeric className="w-20">
                    <input
                      value={row.absentDays}
                      onChange={(e) =>
                        set(line.id, { absentDays: e.target.value })
                      }
                      inputMode="decimal"
                      className={CELL}
                      readOnly={readOnly}
                    />
                  </Td>

                  <Td numeric className="text-[var(--color-muted)]">
                    {figures && !figures.absence.isZero()
                      ? formatTaka(figures.absence)
                      : ''}
                  </Td>

                  <Td numeric className="w-24">
                    <input
                      value={row.bonus}
                      onChange={(e) => set(line.id, { bonus: e.target.value })}
                      inputMode="decimal"
                      className={CELL}
                      readOnly={readOnly}
                    />
                  </Td>

                  <Td numeric className="w-24">
                    <input
                      value={row.additionalAllowance}
                      onChange={(e) =>
                        set(line.id, { additionalAllowance: e.target.value })
                      }
                      inputMode="decimal"
                      className={CELL}
                      readOnly={readOnly}
                    />
                  </Td>

                  <Td numeric className="w-24">
                    <input
                      value={row.advanceDeduction}
                      onChange={(e) =>
                        set(line.id, { advanceDeduction: e.target.value })
                      }
                      inputMode="decimal"
                      className={CELL}
                      readOnly={readOnly}
                      title={`Outstanding advance: ${line.advanceOutstanding}`}
                    />
                    {line.advanceOutstanding !== '0.00' ? (
                      <div className="mt-0.5 text-[10px] text-[var(--color-muted)]">
                        owes {line.advanceOutstanding}
                      </div>
                    ) : null}
                  </Td>

                  <Td numeric className="w-24">
                    <input
                      value={row.otherDeduction}
                      onChange={(e) =>
                        set(line.id, { otherDeduction: e.target.value })
                      }
                      inputMode="decimal"
                      className={CELL}
                      readOnly={readOnly}
                    />
                  </Td>

                  <Td className="w-40">
                    <input
                      value={row.remarks}
                      onChange={(e) => set(line.id, { remarks: e.target.value })}
                      maxLength={300}
                      className={`${CELL} text-left`}
                      readOnly={readOnly}
                    />
                  </Td>

                  <Td
                    numeric
                    className={`font-semibold ${figures?.negative ? 'text-red-700' : ''}`}
                  >
                    {figures ? formatTaka(figures.net) : ''}
                  </Td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr>
              <Td className="font-semibold">Total</Td>
              <Td numeric className="font-semibold">
                {formatTaka(totals.gross)}
              </Td>
              <Td />
              <Td numeric className="font-semibold">
                {totals.absence.isZero() ? '' : formatTaka(totals.absence)}
              </Td>
              <Td colSpan={5} />
              <Td numeric className="font-semibold">
                {formatTaka(totals.net)}
              </Td>
            </tr>
          </tfoot>
        </Table>
        </div>

        {/* One employee at a time on a phone. Ten columns of money side by side
            is how a figure lands against the wrong person. */}
        <div className="divide-y divide-[var(--color-line)] md:hidden">
          {lines.map((line) => {
            const row = rows[line.id]!;
            const figures = figuresFor(line);
            return (
              <div key={line.id} className="p-3">
                <div className="font-medium">{line.employeeName}</div>
                <div className="text-xs text-[var(--color-muted)]">
                  {[line.employeeCode, line.designation]
                    .filter(Boolean)
                    .join(' - ')}
                </div>

                <div className="mt-2 flex items-baseline justify-between text-sm">
                  <span className="text-[var(--color-muted)]">Gross</span>
                  <span className="whitespace-nowrap font-medium">
                    {formatTaka(Money.fromDecimal(line.gross))}
                  </span>
                </div>

                <div className="mt-3 grid grid-cols-2 gap-3">
                  <PhoneCell
                    label="Unpaid Absence Days"
                    value={row.absentDays}
                    onChange={(v) => set(line.id, { absentDays: v })}
                    readOnly={readOnly}
                  />
                  <PhoneCell
                    label="Bonus"
                    value={row.bonus}
                    onChange={(v) => set(line.id, { bonus: v })}
                    readOnly={readOnly}
                  />
                  <PhoneCell
                    label="Allowance"
                    value={row.additionalAllowance}
                    onChange={(v) => set(line.id, { additionalAllowance: v })}
                    readOnly={readOnly}
                  />
                  <PhoneCell
                    label="Advance Recovery"
                    value={row.advanceDeduction}
                    onChange={(v) => set(line.id, { advanceDeduction: v })}
                    readOnly={readOnly}
                    note={
                      line.advanceOutstanding !== '0.00'
                        ? `owes ${line.advanceOutstanding}`
                        : undefined
                    }
                  />
                  <PhoneCell
                    label="Other Deduction"
                    value={row.otherDeduction}
                    onChange={(v) => set(line.id, { otherDeduction: v })}
                    readOnly={readOnly}
                  />
                  <div className="col-span-2">
                    <span className="mb-1 block text-sm font-medium">
                      Remarks
                    </span>
                    <input
                      value={row.remarks}
                      onChange={(e) =>
                        set(line.id, { remarks: e.target.value })
                      }
                      maxLength={300}
                      readOnly={readOnly}
                      className="min-h-11 w-full rounded border border-[var(--color-line)] bg-white px-3 py-2.5 text-base"
                    />
                  </div>
                </div>

                <div className="mt-3 border-t border-[var(--color-line)] pt-2">
                  {figures && !figures.absence.isZero() ? (
                    <div className="flex items-baseline justify-between text-sm">
                      <span className="text-[var(--color-muted)]">
                        Absence Deduction
                      </span>
                      <span className="whitespace-nowrap">
                        {formatTaka(figures.absence)}
                      </span>
                    </div>
                  ) : null}
                  <div className="flex items-baseline justify-between">
                    <span className="text-sm font-medium">Net Payable</span>
                    <span
                      className={`whitespace-nowrap text-base font-semibold ${
                        figures?.negative ? 'text-red-700' : ''
                      }`}
                    >
                      {figures ? formatTaka(figures.net) : ''}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}

          <div className="bg-[var(--color-canvas)] px-3 py-3 text-sm font-semibold">
            <div className="flex items-baseline justify-between">
              <span>Total Gross</span>
              <span className="whitespace-nowrap">
                {formatTaka(totals.gross)}
              </span>
            </div>
            {totals.absence.isZero() ? null : (
              <div className="mt-1 flex items-baseline justify-between">
                <span>Total Absence</span>
                <span className="whitespace-nowrap">
                  {formatTaka(totals.absence)}
                </span>
              </div>
            )}
            <div className="mt-1 flex items-baseline justify-between">
              <span>Total Net Payable</span>
              <span className="whitespace-nowrap">
                {formatTaka(totals.net)}
              </span>
            </div>
          </div>
        </div>
      </Card>

      {anyNegative ? (
        <div className="mt-3">
          <Notice tone="error">
            A row is taking off more than the salary can carry. Correct it before
            saving.
          </Notice>
        </div>
      ) : null}

      {state.error ? (
        <div className="mt-3">
          <Notice tone="error">{state.error}</Notice>
        </div>
      ) : null}

      {readOnly ? null : (
        <div className="mt-3">
          <Button type="submit" disabled={pending || anyNegative}>
            {pending ? 'Saving' : 'Save Payroll'}
          </Button>
        </div>
      )}
    </form>
  );
}
