import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { splitSqlStatements } from '../../scripts/split-sql.mjs';
import { createPgDriver, type PgDriver } from './pg-driver';

/**
 * Payroll run by run, against a real Postgres: generating a month, keying the
 * figures, the workflow, and what an advance does on the way through.
 *
 * Same harness as database.integration.test.ts: a throwaway schema, created and
 * dropped here, so a database holding real bills is untouched. Skipped unless
 * INTERIM_TEST_DATABASE_URL names a database.
 */

const CONNECTION = process.env.INTERIM_TEST_DATABASE_URL;

/** Who the tests write as. Every mutation records an actor. */
const TEST_ACTOR = { id: 'test-user', name: 'Test User' };
const SCHEMA = 'interim_payroll_test';

let driver: PgDriver;

vi.mock('./db', () => ({
  db: () => driver,
}));

/** An employee with a structure, which is what payroll is generated from. */
function structure(over: Partial<Record<string, string>> = {}) {
  return {
    code: null,
    name: 'Someone',
    designation: null,
    phone: null,
    nid: null,
    address: null,
    joinedOn: null,
    basic: '0',
    houseRent: '0',
    medical: '0',
    conveyance: '0',
    mobileAllowance: '0',
    otherAllowance: '0',
    paymentMethod: 'cash' as const,
    bankName: null,
    accountNo: null,
    mfsNumber: null,
    reason: null,
    ...over,
  };
}

const blankLine = {
  absentDays: '0',
  bonus: '0',
  additionalAllowance: '0',
  advanceDeduction: '0',
  otherDeduction: '0',
  remarks: null,
};

describe.skipIf(!CONNECTION)('payroll', () => {
  beforeAll(async () => {
    const admin = createPgDriver(CONNECTION!, 'public');
    await admin.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`);
    await admin.query(`CREATE SCHEMA ${SCHEMA}`);
    await admin.end();

    driver = createPgDriver(CONNECTION!, SCHEMA);
    const schemaSql = readFileSync(
      join(import.meta.dirname, '..', '..', 'db', 'schema.sql'),
      'utf8',
    );
    for (const statement of splitSqlStatements(schemaSql)) {
      await driver.query(statement);
    }
  }, 60_000);

  afterAll(async () => {
    if (!CONNECTION) return;
    await driver.end();
    const admin = createPgDriver(CONNECTION, 'public');
    await admin.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`);
    await admin.end();
  });

  it('generates a month from the salary structures and works out the net', async () => {
    const { createAdvance, createEmployee, generatePayrollRun, savePayrollLines } =
      await import('./mutations');
    const { employeeAdvanceOutstanding, findPayrollRun, listPayrollLines } =
      await import('./queries');

    // Gross 30,000 split across components, which is what the owner's worked
    // example is built on.
    const jahangir = await createEmployee(
      structure({
        name: 'Md. Jahangir Alam',
        designation: 'Manager',
        basic: '18000.00',
        houseRent: '9000.00',
        medical: '1500.00',
        conveyance: '1000.00',
        mobileAllowance: '500.00',
      }),
      TEST_ACTOR,
    );
    const tarek = await createEmployee(
      structure({ name: 'Md. Tarek Hossain', basic: '20000.00' }),
      TEST_ACTOR,
    );

    await createAdvance({
      employeeId: jahangir,
      paidOn: '2026-08-05',
      amount: '3000.00',
      mode: 'cash',
      reference: null,
      reason: 'Family expense',
      notes: null,
      recoveryMode: 'manual',
      installmentAmount: '',
      recoverFrom: '',
    }, TEST_ACTOR);
    expect(
      (await employeeAdvanceOutstanding(jahangir)).toDecimalString(),
    ).toBe('3000.00');

    await generatePayrollRun({
      period: '2026-08',
      perDayBasis: 'thirty',
      recoverAdvances: true,
      notes: null,
    }, TEST_ACTOR);

    const run = (await findPayrollRun('2026-08'))!;
    expect(run.status).toBe('draft');
    expect(run.docNo).toMatch(/^PR-26-\d{4}$/);

    // Every active employee gets a line, seeded from the structure, and the
    // components are copied rather than joined.
    const generated = await listPayrollLines(run.id);
    expect(generated).toHaveLength(2);
    const jLine = generated.find((l) => l.employeeId === jahangir)!;
    expect(jLine.gross.toDecimalString()).toBe('30000.00');
    expect(jLine.basic.toDecimalString()).toBe('18000.00');
    expect(jLine.houseRent.toDecimalString()).toBe('9000.00');
    // Nothing is deducted until HR keys it, so the net starts at the gross.
    expect(jLine.netPaid.toDecimalString()).toBe('30000.00');

    // The worked example: 30,000 gross, 2 days absent, 3,000 advance, 5,000
    // bonus, which comes back to 30,000 net.
    await savePayrollLines(run.id, [
      {
        ...blankLine,
        id: jLine.id,
        absentDays: '2',
        advanceDeduction: '3000.00',
        bonus: '5000.00',
      },
      { ...blankLine, id: generated.find((l) => l.employeeId === tarek)!.id },
    ], TEST_ACTOR);

    const saved = await listPayrollLines(run.id);
    const jSaved = saved.find((l) => l.employeeId === jahangir)!;
    expect(jSaved.absenceDeduction.toDecimalString()).toBe('2000.00');
    expect(jSaved.netPaid.toDecimalString()).toBe('30000.00');
    expect(saved.find((l) => l.employeeId === tarek)!.netPaid.toDecimalString())
      .toBe('20000.00');

    // A draft does not move the advance: it can still be abandoned.
    expect(
      (await employeeAdvanceOutstanding(jahangir)).toDecimalString(),
    ).toBe('3000.00');
  }, 30_000);

  it('freezes on approval and locks on payment', async () => {
    const {
      approvePayrollRun,
      InputError,
      markPayrollRunPaid,
      reopenPayrollRun,
      savePayrollLines,
    } = await import('./mutations');
    const { employeeAdvanceOutstanding, findPayrollRun, listPayrollLines } =
      await import('./queries');

    const run = (await findPayrollRun('2026-08'))!;
    const lines = await listPayrollLines(run.id);
    const jLine = lines[0]!;

    await approvePayrollRun(run.id, TEST_ACTOR);
    const approved = (await findPayrollRun('2026-08'))!;
    expect(approved.status).toBe('approved');
    // The name comes from the signed-in account now, not from a typed field.
    expect(approved.approvedBy).toBe(TEST_ACTOR.name);

    // Approving is what makes the advance count as recovered.
    const employeeId = jLine.employeeId;
    const afterApproval = await employeeAdvanceOutstanding(employeeId);

    // An approved run refuses an edit.
    await expect(
      savePayrollLines(run.id, [{ ...blankLine, id: jLine.id }], TEST_ACTOR),
    ).rejects.toBeInstanceOf(InputError);

    // And it cannot be approved twice.
    await expect(
      approvePayrollRun(run.id, TEST_ACTOR),
    ).rejects.toBeInstanceOf(InputError);

    await markPayrollRunPaid(run.id, '2026-08-31', TEST_ACTOR);
    const paid = (await findPayrollRun('2026-08'))!;
    expect(paid.status).toBe('paid');
    expect(paid.paidBy).toBe(TEST_ACTOR.name);
    expect((await listPayrollLines(run.id))[0]!.paidOn).toBe('2026-08-31');

    // Paying does not move the advance again: approval already did.
    expect((await employeeAdvanceOutstanding(employeeId)).toDecimalString()).toBe(
      afterApproval.toDecimalString(),
    );

    // A paid run still refuses an edit until it is reopened.
    await expect(
      savePayrollLines(run.id, [{ ...blankLine, id: jLine.id }], TEST_ACTOR),
    ).rejects.toBeInstanceOf(InputError);

    await reopenPayrollRun(run.id, 'Bonus figure was wrong', TEST_ACTOR);
    const reopened = (await findPayrollRun('2026-08'))!;
    expect(reopened.status).toBe('draft');
    expect(reopened.approvedBy).toBeNull();
    expect(reopened.paidBy).toBeNull();
    // The paid dates go with it, because the run is no longer paid.
    expect((await listPayrollLines(run.id))[0]!.paidOn).toBeNull();

    // Reopening gives the advance back, so it is not recovered twice.
    expect(
      (await employeeAdvanceOutstanding(employeeId)).toDecimalString(),
    ).toBe('3000.00');
  }, 30_000);

  it('refuses a second run for the same month', async () => {
    const { generatePayrollRun, InputError } = await import('./mutations');
    await expect(
      generatePayrollRun({
        period: '2026-08',
        perDayBasis: 'thirty',
        recoverAdvances: true,
        notes: null,
      }, TEST_ACTOR),
    ).rejects.toBeInstanceOf(InputError);
  }, 30_000);

  it('refuses a line whose deductions exceed the salary', async () => {
    const { savePayrollLines } = await import('./mutations');
    const { findPayrollRun, listPayrollLines } = await import('./queries');

    const run = (await findPayrollRun('2026-08'))!;
    const line = (await listPayrollLines(run.id))[0]!;

    await expect(
      savePayrollLines(run.id, [
        { ...blankLine, id: line.id, otherDeduction: '999999.00' },
      ], TEST_ACTOR),
    ).rejects.toThrow();
  }, 30_000);

  it('keeps a payslip intact when the salary structure changes later', async () => {
    const { updateEmployee } = await import('./mutations');
    const { findPayrollRun, getEmployee, listPayrollLines } = await import(
      './queries'
    );

    const run = (await findPayrollRun('2026-08'))!;
    const before = (await listPayrollLines(run.id))[0]!;
    const employee = (await getEmployee(before.employeeId))!;

    // A raise, applied after August was generated.
    await updateEmployee(employee.id, {
      ...structure({
        name: employee.name,
        designation: employee.designation ?? undefined,
        basic: '25000.00',
        houseRent: '9000.00',
        medical: '1500.00',
        conveyance: '1000.00',
        mobileAllowance: '500.00',
      }),
      reason: 'Annual increment',
    }, TEST_ACTOR);

    expect((await getEmployee(employee.id))!.gross.toDecimalString()).toBe(
      '37000.00',
    );

    // August is untouched, because the line holds its own copy.
    const after = (await listPayrollLines(run.id))[0]!;
    expect(after.gross.toDecimalString()).toBe(before.gross.toDecimalString());
    expect(after.basic.toDecimalString()).toBe(before.basic.toDecimalString());
  }, 30_000);

  it('records leave without touching any salary', async () => {
    const { createLeaveRecord } = await import('./mutations');
    const { listLeaveRecords, listPayrollLines, findPayrollRun } = await import(
      './queries'
    );

    const run = (await findPayrollRun('2026-08'))!;
    const before = (await listPayrollLines(run.id))[0]!;

    await createLeaveRecord({
      employeeId: before.employeeId,
      leaveType: 'sick',
      fromDate: '2026-08-10',
      toDate: '2026-08-11',
      days: '2',
      reason: 'Fever',
      editReason: null,
    }, TEST_ACTOR);

    const leave = await listLeaveRecords({ employeeId: before.employeeId });
    expect(leave).toHaveLength(1);
    expect(leave[0]!.leaveType).toBe('sick');

    // Paid leave is paid: the payroll line is exactly as it was.
    const after = (await listPayrollLines(run.id))[0]!;
    expect(after.netPaid.toDecimalString()).toBe(before.netPaid.toDecimalString());
    expect(after.absenceDeduction.toDecimalString()).toBe(
      before.absenceDeduction.toDecimalString(),
    );
  }, 30_000);

  // Advance recovery, end to end: an agreement made when the cash is handed
  // over, filled in by Generate, and still overridable at every step.
  it('recovers an advance by installments once it is agreed', async () => {
    const { approvePayrollRun, createAdvance, createEmployee, generatePayrollRun } =
      await import('./mutations');
    const { employeeAdvanceOutstanding, listPayrollLines, findPayrollRun } =
      await import('./queries');

    const rafiq = await createEmployee(
      structure({ name: 'Md. Rafiqul Islam', basic: '25000.00' }),
      TEST_ACTOR,
    );
    await createAdvance({
      employeeId: rafiq,
      paidOn: '2026-08-20',
      amount: '20000.00',
      mode: 'cash',
      reference: null,
      reason: 'Medical',
      notes: null,
      recoveryMode: 'installment',
      installmentAmount: '5000.00',
      recoverFrom: '2026-09',
    }, TEST_ACTOR);

    const september = await generatePayrollRun({
      period: '2026-09',
      perDayBasis: 'thirty',
      recoverAdvances: true,
      notes: null,
    }, TEST_ACTOR);
    const line = (await listPayrollLines(september)).find(
      (l) => l.employeeId === rafiq,
    );
    // Generate filled the installment in, and the net came off it.
    expect(line?.advanceDeduction.toDecimalString()).toBe('5000.00');
    expect(line?.netPaid.toDecimalString()).toBe('20000.00');

    // A draft has not recovered anything yet: it can still be abandoned.
    expect((await employeeAdvanceOutstanding(rafiq)).toDecimalString()).toBe(
      '20000.00',
    );

    await approvePayrollRun(september, TEST_ACTOR);
    expect((await employeeAdvanceOutstanding(rafiq)).toDecimalString()).toBe(
      '15000.00',
    );

    // The next month picks up where the last one left off rather than
    // offering the same installment against an advance already part recovered.
    const october = await generatePayrollRun({
      period: '2026-10',
      perDayBasis: 'thirty',
      recoverAdvances: true,
      notes: null,
    }, TEST_ACTOR);
    expect(
      (await listPayrollLines(october))
        .find((l) => l.employeeId === rafiq)
        ?.advanceDeduction.toDecimalString(),
    ).toBe('5000.00');
    expect((await findPayrollRun(october))?.recoverAdvances).toBe(true);
  }, 30_000);

  it('recovers nothing in a month generated with recovery switched off', async () => {
    const { generatePayrollRun } = await import('./mutations');
    const { listPayrollLines, findPayrollRun } = await import('./queries');

    const november = await generatePayrollRun({
      period: '2026-11',
      perDayBasis: 'thirty',
      recoverAdvances: false,
      notes: null,
    }, TEST_ACTOR);
    const run = await findPayrollRun(november);
    expect(run?.recoverAdvances).toBe(false);
    // Every line, not just the one with an agreement on it.
    for (const line of await listPayrollLines(november)) {
      expect(line.advanceDeduction.isZero()).toBe(true);
    }
  }, 30_000);

  it('fills the recoveries into a draft that was generated without them', async () => {
    const { approvePayrollRun, fillAdvanceRecoveries, InputError } =
      await import('./mutations');
    const { findPayrollRun, listPayrollLines } = await import('./queries');

    const november = await findPayrollRun('2026-11');
    const changed = await fillAdvanceRecoveries(november!.id, TEST_ACTOR);
    expect(changed).toBe(1);
    expect(
      (await listPayrollLines(november!.id))
        .map((l) => l.advanceDeduction.toDecimalString())
        .filter((amount) => amount !== '0.00'),
    ).toEqual(['5000.00']);

    // Running it again changes nothing, because nothing is out of step.
    expect(await fillAdvanceRecoveries(november!.id, TEST_ACTOR)).toBe(0);

    // Once approved the figures are frozen, and this is one more thing that
    // cannot move them.
    await approvePayrollRun(november!.id, TEST_ACTOR);
    await expect(fillAdvanceRecoveries(november!.id, TEST_ACTOR)).rejects.toBeInstanceOf(
      InputError,
    );
  }, 30_000);

  it('never proposes more than the salary can carry', async () => {
    const { createAdvance, createEmployee, generatePayrollRun } =
      await import('./mutations');
    const { listPayrollLines } = await import('./queries');

    // An advance larger than a month's pay, on full recovery. Uncapped this
    // would drive the net negative and fail the whole month at Generate.
    const shahin = await createEmployee(
      structure({ name: 'Md. Shahin Mia', basic: '12000.00' }),
      TEST_ACTOR,
    );
    await createAdvance({
      employeeId: shahin,
      paidOn: '2026-11-02',
      amount: '30000.00',
      mode: 'cash',
      reference: null,
      reason: 'House rent',
      notes: null,
      recoveryMode: 'full',
      installmentAmount: '',
      recoverFrom: '',
    }, TEST_ACTOR);

    const december = await generatePayrollRun({
      period: '2026-12',
      perDayBasis: 'thirty',
      recoverAdvances: true,
      notes: null,
    }, TEST_ACTOR);
    const line = (await listPayrollLines(december)).find(
      (l) => l.employeeId === shahin,
    );
    expect(line?.advanceDeduction.toDecimalString()).toBe('12000.00');
    expect(line?.netPaid.isZero()).toBe(true);
  }, 30_000);
});
