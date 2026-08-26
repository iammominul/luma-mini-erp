import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { splitSqlStatements } from '../../scripts/split-sql.mjs';
import { createPgDriver, type PgDriver } from './pg-driver';

/**
 * Loans, capital and drawings against a real Postgres: the constraints, the
 * gapless series, the activity log, and the two figures that decide whether a
 * repayment is read as a cost or as a liability being settled.
 *
 * The same throwaway schema idiom as database.integration.test.ts, and skipped
 * the same way when there is no connection string.
 */

const CONNECTION = process.env.INTERIM_TEST_DATABASE_URL;
const TEST_ACTOR = { id: 'test-user', name: 'Test User' };
const SCHEMA = 'interim_loan_test';

let driver: PgDriver;

vi.mock('./db', () => ({
  db: () => driver,
}));

describe.skipIf(!CONNECTION)('loans, capital and drawings', () => {
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

  /** A voucher keyed straight at the table, to prove a CHECK and not Zod. */
  async function rawMovement(columns: Record<string, string>): Promise<void> {
    const keys = Object.keys(columns).join(', ');
    const values = Object.values(columns).join(', ');
    await driver.query(
      `INSERT INTO fund_movement (${keys}) VALUES (${values})`,
    );
  }

  async function counterValue(name: string): Promise<number> {
    const rows = (await driver.query(
      `SELECT value FROM counter WHERE name = '${name}'`,
    )) as { value: string }[];
    return Number(rows[0]?.value ?? 0);
  }

  it('records a loan and the money it received in one save', async () => {
    const { createLoan } = await import('./mutations');
    const { listLoans, listLoanMovements } = await import('./queries');

    const before = await counterValue('fund_movement');
    const id = await createLoan(
      {
        lender: 'Islami Bank',
        amount: '1000000.00',
        takenOn: '2026-03-01',
        mode: 'bank_transfer',
        terms: '9 percent, one year, renewable',
        reference: 'OD/2026/114',
        notes: null,
        reason: null,
      },
      TEST_ACTOR,
    );

    // One click, two records: the loan and the money that made it a loan.
    const loans = await listLoans();
    expect(loans).toHaveLength(1);
    expect(loans[0]!.code).toBe('LOAN-0001');
    expect(loans[0]!.received.toDecimalString()).toBe('1000000.00');
    expect(loans[0]!.outstanding.toDecimalString()).toBe('1000000.00');

    const movements = await listLoanMovements(id);
    expect(movements).toHaveLength(1);
    expect(movements[0]!.category).toBe('loan_received');
    expect(movements[0]!.docNo).toBe('FM-26-0001');
    expect(await counterValue('fund_movement')).toBe(before + 1);
  });

  it('takes a second lender who is a person, not a bank', async () => {
    const { createLoan } = await import('./mutations');
    const { listLoans } = await import('./queries');

    await createLoan(
      {
        lender: 'Mr Anwar Hossain',
        amount: '200000.00',
        takenOn: '2026-03-10',
        mode: 'cash',
        terms: 'No interest, returnable on demand',
        reference: null,
        notes: null,
        reason: null,
      },
      TEST_ACTOR,
    );

    const loans = await listLoans();
    expect(loans.map((l) => l.code).sort()).toEqual(['LOAN-0001', 'LOAN-0002']);
  });

  it('refuses at the database what no screen can ask for', async () => {
    const rows = (await driver.query(
      `SELECT id FROM loan WHERE code = 'LOAN-0001'`,
    )) as { id: string }[];
    const loan = rows[0]!.id;

    // A drawing has no loan to belong to.
    await expect(
      rawMovement({
        moved_on: `'2026-04-01'`,
        category: `'owner_drawing'`,
        loan_id: `'${loan}'`,
        description: `'Drawing against a lender'`,
        amount: '1000',
        mode: `'cash'`,
      }),
    ).rejects.toThrow();

    // A loan movement has to name one.
    await expect(
      rawMovement({
        moved_on: `'2026-04-01'`,
        category: `'loan_received'`,
        description: `'No lender'`,
        amount: '1000',
        mode: `'cash'`,
      }),
    ).rejects.toThrow();

    // Interest belongs to a repayment and to nothing else.
    await expect(
      rawMovement({
        moved_on: `'2026-04-01'`,
        category: `'capital_introduced'`,
        description: `'Capital with interest on it'`,
        amount: '1000',
        interest_amount: '50',
        mode: `'cash'`,
      }),
    ).rejects.toThrow();

    // The two categories the simplification removed are no longer accepted.
    await expect(
      rawMovement({
        moved_on: `'2026-04-01'`,
        category: `'contra_deposit'`,
        description: `'Cash to bank'`,
        amount: '1000',
        mode: `'bank_transfer'`,
      }),
    ).rejects.toThrow();

    // Nothing moves a zero.
    await expect(
      rawMovement({
        moved_on: `'2026-04-01'`,
        category: `'capital_introduced'`,
        description: `'Nothing'`,
        amount: '0',
        mode: `'other'`,
      }),
    ).rejects.toThrow();
  });

  it('allows one opening balance and refuses a second', async () => {
    const { setOpeningBalance, InputError } = await import('./mutations');

    await setOpeningBalance(
      {
        movedOn: '2026-01-01',
        amount: '600000.00',
        mode: 'bank_transfer',
        notes: null,
        reason: null,
      },
      TEST_ACTOR,
    );

    // A second one quietly restates every closing balance after it.
    await expect(
      setOpeningBalance(
        {
          movedOn: '2026-01-01',
          amount: '9000.00',
          mode: 'cash',
          notes: null,
          reason: null,
        },
        TEST_ACTOR,
      ),
    ).rejects.toBeInstanceOf(InputError);
  });

  it('computes the outstanding on read and keeps interest out of it', async () => {
    const { recordLoanRepayment } = await import('./mutations');
    const { findLoan, listLoans } = await import('./queries');

    const loan = (await findLoan('LOAN-0001'))!;
    for (const [date, interest] of [
      ['2026-04-05', '12500.00'],
      ['2026-05-05', '11000.00'],
    ] as const) {
      await recordLoanRepayment(
        {
          loanId: loan.id,
          movedOn: date,
          amount: '250000.00',
          interestAmount: interest,
          mode: 'bank_transfer',
          reference: null,
          notes: null,
          reason: null,
        },
        TEST_ACTOR,
      );
    }

    const found = (await listLoans()).find((l) => l.code === 'LOAN-0001')!;
    // Drawn 10,00,000, repaid 5,00,000 of principal and 23,500 of interest.
    // The interest reduced nothing, which is the whole rule.
    expect(found.received.toDecimalString()).toBe('1000000.00');
    expect(found.repaid.toDecimalString()).toBe('500000.00');
    expect(found.outstanding.toDecimalString()).toBe('500000.00');
    expect(found.interestPaid.toDecimalString()).toBe('23500.00');
  });

  it('draws a facility again without a second loan record', async () => {
    const { recordLoanDrawdown } = await import('./mutations');
    const { findLoan, listLoans } = await import('./queries');

    const loan = (await findLoan('LOAN-0001'))!;
    await recordLoanDrawdown(
      {
        loanId: loan.id,
        movedOn: '2026-06-01',
        amount: '300000.00',
        mode: 'bank_transfer',
        reference: null,
        notes: null,
        reason: null,
      },
      TEST_ACTOR,
    );

    // The sanctioned figure was dropped, so a tranched facility is recorded by
    // drawing against the loan again rather than by stating a ceiling.
    const found = (await listLoans()).find((l) => l.code === 'LOAN-0001')!;
    expect(found.received.toDecimalString()).toBe('1300000.00');
    expect(found.outstanding.toDecimalString()).toBe('800000.00');
  });

  it('puts loan interest on the profit statement and the principal nowhere', async () => {
    const { profitFigures } = await import('./queries');
    const { statementFor } = await import('./profit');

    const figures = await profitFigures('2026-01-01', '2026-12-31');
    expect(figures.interest.toDecimalString()).toBe('23500.00');

    const statement = await statementFor('2026-01-01', '2026-12-31');
    expect(
      statement.operatingLines
        .find((line) => line.label === 'Loan Interest')
        ?.amount.toDecimalString(),
    ).toBe('23500.00');

    // The figure that matters. Repaying a loan settles a liability and costs
    // nothing, so nothing on the statement is the 5,00,000 of principal.
    for (const line of [
      ...statement.directLines,
      ...statement.sellingLines,
      ...statement.operatingLines,
    ]) {
      expect(line.amount.toDecimalString(), line.label).not.toBe('500000.00');
    }
    expect(statement.netResult.toDecimalString()).toBe('-23500.00');
  });

  it('records capital and a drawing with no account to choose', async () => {
    const { recordCapital, recordDrawing } = await import('./mutations');
    const { listOwnerMovements, ownerTotals } = await import('./queries');

    await recordCapital(
      {
        movedOn: '2026-02-01',
        amount: '2000000.00',
        mode: 'bank_transfer',
        notes: 'Opening capital',
        reason: null,
      },
      TEST_ACTOR,
    );
    await recordDrawing(
      {
        movedOn: '2026-07-10',
        amount: '150000.00',
        mode: 'cash',
        notes: 'Household',
        reason: null,
      },
      TEST_ACTOR,
    );

    const totals = await ownerTotals();
    expect(totals.introduced.toDecimalString()).toBe('2000000.00');
    expect(totals.drawn.toDecimalString()).toBe('150000.00');
    expect(totals.standing.toDecimalString()).toBe('1850000.00');

    const movements = await listOwnerMovements();
    expect(movements).toHaveLength(2);
    // Neither names a loan, and the CHECK constraint is what holds that.
    for (const movement of movements) {
      expect(movement.loanId).toBeNull();
    }
  });

  it('builds a cash book and a cash flow that close on the same figure', async () => {
    const { cashMovements } = await import('./queries');
    const { buildCashBook } = await import('./cashbook');
    const { buildCashFlow } = await import('./cashflow');

    const movements = await cashMovements();
    const book = buildCashBook({ movements });
    const flow = buildCashFlow({
      movements,
      from: '2026-01-01',
      to: '2026-12-31',
    });

    // In: 6,00,000 opening, 10,00,000 and 3,00,000 from the bank, 2,00,000
    // from the second lender, 20,00,000 capital. Out: 5,00,000 of principal,
    // 23,500 of interest, 1,50,000 drawn.
    expect(book.closing.toDecimalString()).toBe('3426500.00');
    expect(flow.closing.toDecimalString()).toBe(book.closing.toDecimalString());

    // A repayment is two rows: the principal and the interest beside it.
    expect(
      movements.filter((one) => one.source === 'loan_interest'),
    ).toHaveLength(2);
    // And every row carries how the money moved, which the ERP needs to know
    // whether the other leg is 1000 Cash or 1100 Bank.
    for (const movement of movements) {
      expect(movement.mode.length, movement.source).toBeGreaterThan(0);
    }
  });

  it('logs every write with the actor and the stated reason', async () => {
    const { recordDrawing, updateFundMovement, deleteFundMovement } =
      await import('./mutations');
    const { getFundMovement, listActivity } = await import('./queries');

    const id = await recordDrawing(
      {
        movedOn: '2026-08-01',
        amount: '1000.00',
        mode: 'cash',
        notes: 'To be corrected',
        reason: null,
      },
      TEST_ACTOR,
    );
    const docNo = (await getFundMovement(id))!.docNo!;

    await updateFundMovement(
      id,
      {
        movedOn: '2026-08-01',
        amount: '1200.00',
        mode: 'cash',
        notes: 'Corrected',
        reason: 'Amount was keyed short',
      },
      TEST_ACTOR,
    );
    await deleteFundMovement(id, 'Recorded twice', TEST_ACTOR);

    const log = await listActivity({ entity: 'fund_movement', limit: 200 });
    const mine = log.entries.filter((entry) => entry.summary.includes(docNo));
    expect(mine.map((entry) => entry.action).sort()).toEqual([
      'create',
      'delete',
      'update',
    ]);
    for (const entry of mine) {
      expect(entry.actorName).toBe(TEST_ACTOR.name);
    }
    expect(mine.find((entry) => entry.action === 'update')?.reason).toBe(
      'Amount was keyed short',
    );
  });

  it('writes two log rows from one loan, one for each record', async () => {
    const { listActivity } = await import('./queries');
    const loanLog = await listActivity({ entity: 'loan', limit: 100 });
    expect(loanLog.entries.length).toBeGreaterThanOrEqual(2);
    expect(
      loanLog.entries.some((entry) => entry.summary.includes('LOAN-0001')),
    ).toBe(true);
  });

  it('refuses to remove a loan that has entries against it', async () => {
    const { deleteLoan, InputError } = await import('./mutations');
    const { findLoan } = await import('./queries');
    const loan = (await findLoan('LOAN-0001'))!;

    // Every loan is created with a movement, so in practice this means a loan
    // is settled rather than removed.
    await expect(
      deleteLoan(loan.id, 'No longer needed', TEST_ACTOR),
    ).rejects.toBeInstanceOf(InputError);
    await expect(
      deleteLoan(loan.id, 'No longer needed', TEST_ACTOR),
    ).rejects.toThrow(/Mark it settled instead/);
  });

  it('holds the fund records back from a role that may not read them', async () => {
    const { searchRecords } = await import('./queries');

    expect(
      (await searchRecords('Islami', { role: 'owner' })).some(
        (hit) => hit.kind === 'loan',
      ),
    ).toBe(true);
    // Hiding the menu entry proves nothing. This is the control.
    expect(await searchRecords('Islami', { role: 'viewer' })).toHaveLength(0);
    expect(await searchRecords('LOAN-0001', { role: 'viewer' })).toHaveLength(0);
  });

  it('widens the book span to a fund movement earlier than any bill', async () => {
    const { bookSpan } = await import('./queries');
    const span = await bookSpan();
    // The opening balance is dated 1 January and there are no bills at all.
    expect(span?.first).toBe('2026-01-01');
  });

  it('carries the loans, the movements and the owner into the export', async () => {
    const { exportEverything } = await import('./export');
    const bundle = await exportEverything();

    const loans = bundle.loans as Record<string, unknown>[];
    const movements = bundle.fundMovements as Record<string, unknown>[];

    expect(loans).toHaveLength(2);
    expect(loans[0]!.lender).toBeTruthy();

    const repayment = movements.find((one) => one.category === 'loan_repayment')!;
    // Text, never a JSON number, so no parser can round an amount on the way
    // out. The interest travels with it, which is what lets the ERP post its
    // rule 16 and its rule 17 from one row, and mode says whether the other leg
    // is 1000 Cash or 1100 Bank.
    expect(typeof repayment.amount).toBe('string');
    expect(repayment.interestAmount).toBe('12500.00');
    expect(repayment.loanCode).toBe('LOAN-0001');
    expect(repayment.mode).toBe('bank_transfer');

    // One owner, so capital carries no member and the name travels once.
    expect(bundle.owner).toHaveProperty('name');
  });
});
