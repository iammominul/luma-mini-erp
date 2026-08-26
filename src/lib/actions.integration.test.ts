import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { splitSqlStatements } from '../../scripts/split-sql.mjs';
import { createPgDriver, type PgDriver } from './pg-driver';

/**
 * The server actions, called the way a submitted form calls them: a FormData
 * with exactly the field names the components render, against a real Postgres.
 *
 * This is the layer the unit tests cannot reach. It catches a renamed field or
 * a mis-parsed line grid, which would otherwise only show up in production.
 * Needs INTERIM_TEST_DATABASE_URL, the same as database.integration.test.ts.
 */

const CONNECTION = process.env.INTERIM_TEST_DATABASE_URL;
const SCHEMA = 'interim_actions_test';

let driver: PgDriver;

vi.mock('./db', () => ({ db: () => driver }));
vi.mock('next/cache', () => ({ revalidatePath: () => undefined }));

/**
 * Who is signed in while an action runs.
 *
 * What is faked is the session read, not the permission check: src/lib/session.ts
 * runs for real on top of this, so an action that forgot its actingUser call
 * would still be caught here, and can() is the thing being satisfied rather
 * than the thing being bypassed. Held in a mutable box so a test can change
 * role and watch the same action be refused.
 *
 * The default is an Owner because these tests drive every action in the app.
 */
const session = vi.hoisted(() => ({
  user: {
    id: 'test-owner',
    name: 'Test Owner',
    email: 'owner@example.com',
    role: 'owner',
    status: 'active',
  } as {
    id: string;
    name: string;
    email: string;
    role: string;
    status: string;
  },
}));

vi.mock('next/headers', () => ({ headers: async () => new Headers() }));
vi.mock('./auth', () => ({
  auth: () => ({ api: { getSession: async () => ({ user: session.user }) } }),
}));

function as<T>(role: string, run: () => Promise<T>): Promise<T> {
  const was = session.user;
  session.user = { ...was, role };
  return run().finally(() => {
    session.user = was;
  });
}
vi.mock('next/navigation', () => ({
  // The real redirect throws to unwind the request; so does this, and the test
  // reads the target off the error.
  redirect: (url: string) => {
    throw Object.assign(new Error('NEXT_REDIRECT'), { url });
  },
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND');
  },
}));

async function expectRedirect(
  run: () => Promise<{ error?: string }>,
): Promise<string> {
  try {
    const result = await run();
    throw new Error(
      `Expected a redirect but the action returned: ${JSON.stringify(result)}`,
    );
  } catch (error) {
    const redirect = error as Error & { url?: string };
    if (!redirect.url) throw error;
    return redirect.url;
  }
}

function form(fields: Record<string, string | string[]>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    // A repeated field, such as the party's roles, posts once per value.
    for (const one of Array.isArray(value) ? value : [value]) {
      data.append(key, one);
    }
  }
  return data;
}

describe.skipIf(!CONNECTION)('the server actions', () => {
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

  it('takes a party, a bill, and a receipt through the forms', async () => {
    const { createPartyAction } = await import('../app/(app)/parties/actions');
    const { createBillAction, deleteBillAction, updateBillAction } =
      await import('../app/(app)/[side]/bills/actions');
    const { createPaymentAction } =
      await import('../app/(app)/[side]/settlements/actions');
    const { getBill, listBills, listPartyBalances, listPayments } =
      await import('./queries');

    // The Parties page posts these names.
    await expectRedirect(() =>
      createPartyAction(
        {},
        form({
          name: 'Bangla Japan Trading Ltd.',
          roles: ['customer'],
          contactPerson: 'Mr Hasan',
          phone: '01900000000',
          address: 'Ashulia',
          openingBalance: '25000.00',
          openingAsOf: '2026-06-30',
        }),
      ),
    );

    const [customer] = await listPartyBalances('customer');
    expect(customer!.party.name).toBe('Bangla Japan Trading Ltd.');

    // The signed-in account reached activity_log, rather than the row being
    // written with nobody against it.
    const { recentActivity } = await import('./queries');
    const [added] = await recentActivity(1);
    expect(added!.actorName).toBe('Test Owner');

    // The bill form posts its line grid as JSON in a hidden field.
    const target = await expectRedirect(() =>
      createBillAction(
        {},
        form({
          side: 'customer',
          partyId: customer!.party.id,
          direction: 'issued',
          status: 'posted' as const,
          billNo: '1105',
          billDate: '2026-07-08',
          notes: 'July program',
          linesJson: JSON.stringify([
            {
              description: 'S/J 100% Cotton, Lot 31',
              color: 'Red',
              challanNo: '2201',
              orderNo: 'MK-14',
              lotNo: '',
              greyKg: '640.250',
              finishedKg: '622.500',
              rate: '48.75',
            },
            {
              description: '1x1 Rib, Lot 32',
              color: 'Grey Melange',
              challanNo: '2202',
              orderNo: 'MK-14',
              lotNo: '',
              greyKg: '210',
              finishedKg: '',
              rate: '39.5',
            },
          ]),
        }),
      ),
    );

    const { bills } = await listBills({ direction: 'issued' });
    expect(bills).toHaveLength(1);
    expect(target).toBe(`/customers/bills/${bills[0]!.id}`);
    // 640.25 x 48.75 = 31212.19 (rounded half up from 31212.1875), 210 x 39.5 = 8295
    expect(bills[0]!.total.toDecimalString()).toBe('39507.19');
    expect(bills[0]!.billNo).toBe('1105');
    expect(bills[0]!.docNo).toBe('CB-26-0001');

    const bill = await getBill(bills[0]!.id);
    expect(bill!.lines.map((line) => line.amount.toDecimalString())).toEqual([
      '31212.19',
      '8295.00',
    ]);
    expect(bill!.lines[0]!.color).toBe('Red');
    expect(bill!.lines[0]!.challanNo).toBe('2201');
    expect(bill!.lines[0]!.orderNo).toBe('MK-14');
    expect(bill!.lines[0]!.finishedKg).toBe('622.500');
    // An empty finished weight in the grid is stored as absent, not as zero.
    expect(bill!.lines[1]!.finishedKg).toBeNull();

    // An edit without a reason is refused rather than silently accepted.
    const refused = await updateBillAction(
      {},
      form({
        side: 'customer',
        id: bill!.id,
        partyId: customer!.party.id,
        direction: 'issued',
        status: 'posted' as const,
        billNo: '1105',
        billDate: '2026-07-08',
        linesJson: JSON.stringify([
          {
            description: 'S/J 100% Cotton, Lot 31',
            color: 'Red',
            challanNo: '2201',
            orderNo: 'MK-14',
            lotNo: '',
            greyKg: '640.250',
            finishedKg: '',
            rate: '50',
          },
        ]),
      }),
    );
    expect(refused.error).toBe('State why this bill is being edited.');

    // A bill with no hand-written number is refused: it is the number the
    // customer holds on paper, so it cannot be left off.
    const noBillNo = await createBillAction(
      {},
      form({
        side: 'customer',
        partyId: customer!.party.id,
        direction: 'issued',
        status: 'posted' as const,
        billNo: '',
        billDate: '2026-07-09',
        linesJson: JSON.stringify([
          {
            description: 'Black, Lot 40',
            color: '',
            challanNo: '',
            orderNo: '',
            lotNo: '',
            greyKg: '100',
            finishedKg: '',
            rate: '40',
          },
        ]),
      }),
    );
    expect(noBillNo.error).toMatch(/bill number/i);

    // The receipt form posts these names.
    await expectRedirect(() =>
      createPaymentAction(
        {},
        form({
          side: 'customer',
          partyId: customer!.party.id,
          direction: 'issued',
          status: 'posted' as const,
          paidOn: '2026-07-25',
          amount: '30000.00',
          mode: 'bank_transfer',
          notes: '',
        }),
      ),
    );

    const payments = await listPayments({ direction: 'in' });
    expect(payments).toHaveLength(1);
    expect(payments[0]!.mode).toBe('bank_transfer');

    // 25000 opening + 39507.19 billed - 30000 received
    const [after] = await listPartyBalances('customer');
    expect(after!.balance.toDecimalString()).toBe('34507.19');

    // Removing a bill needs a reason, and the reason reaches the log.
    const noReason = await deleteBillAction(
      {},
      form({ side: 'customer', id: bill!.id, reason: '' }),
    );
    expect(noReason.error).toBeTruthy();

    await expectRedirect(() =>
      deleteBillAction(
        {},
        form({ side: 'customer', id: bill!.id, reason: 'Billed twice' }),
      ),
    );
    expect((await listBills({ direction: 'issued' })).bills).toHaveLength(0);
  }, 60_000);

  it('reports a bad amount back to the form instead of throwing', async () => {
    const { createPaymentAction } =
      await import('../app/(app)/[side]/settlements/actions');
    const { listPartyBalances } = await import('./queries');
    const [customer] = await listPartyBalances('customer');

    const result = await createPaymentAction(
      {},
      form({
        side: 'customer',
        partyId: customer!.party.id,
        direction: 'issued',
        status: 'posted' as const,
        paidOn: '2026-07-25',
        amount: '0',
        mode: 'cash',
      }),
    );
    expect(result.error).toMatch(/greater than zero/i);

    const bad = await createPaymentAction(
      {},
      form({
        side: 'customer',
        partyId: customer!.party.id,
        direction: 'issued',
        status: 'posted' as const,
        paidOn: '2026-13-40',
        amount: '100.00',
        mode: 'cash',
      }),
    );
    expect(bad.error).toBeTruthy();
  }, 60_000);

  /**
   * A server action is a public endpoint. The menu hiding a button is not what
   * stops anybody, so the refusal is checked here against the action itself.
   */
  it('refuses a write the role is not allowed, and writes nothing', async () => {
    const { createPartyAction } = await import('../app/(app)/parties/actions');
    const { listPartyBalances, recentActivity } = await import('./queries');

    const before = (await listPartyBalances('customer')).length;
    const entriesBefore = (await recentActivity(50)).length;

    const refused = await as('viewer', () =>
      createPartyAction(
        {},
        form({
          name: 'Should Not Exist Ltd.',
          roles: ['customer'],
          openingBalance: '0',
          openingAsOf: '2026-06-30',
        }),
      ),
    );

    expect(refused.error).toMatch(/role does not allow/i);
    expect((await listPartyBalances('customer')).length).toBe(before);
    // Not even a log row: the refusal happens before the transaction.
    expect((await recentActivity(50)).length).toBe(entriesBefore);
  }, 60_000);

  it('refuses an approval to Accounts but allows the entry it prepares', async () => {
    const { generatePayrollRunAction, approvePayrollRunAction } =
      await import('../app/(app)/payroll/actions');
    const { createEmployeeAction } =
      await import('../app/(app)/employees/actions');
    const { findPayrollRun } = await import('./queries');

    // Accounts prepares the month, which is its job.
    await expectRedirect(() =>
      as('accounts', () =>
        createEmployeeAction(
          {},
          form({
            name: 'Payroll Test Employee',
            basic: '10000.00',
            houseRent: '5000.00',
            medical: '0',
            conveyance: '0',
            mobileAllowance: '0',
            otherAllowance: '0',
            paymentMethod: 'cash',
          }),
        ),
      ),
    );
    await expectRedirect(() =>
      as('accounts', () =>
        generatePayrollRunAction(
          {},
          form({ period: '2026-07', perDayBasis: 'thirty' }),
        ),
      ),
    );

    const run = (await findPayrollRun('2026-07'))!;
    expect(run.status).toBe('draft');

    // And is refused the sign-off on the figures it just keyed.
    const refused = await as('accounts', () =>
      approvePayrollRunAction({}, form({ runId: run.id, period: '2026-07' })),
    );
    expect(refused.error).toMatch(/role does not allow/i);
    expect((await findPayrollRun('2026-07'))!.status).toBe('draft');

    // The Owner approves, and the name recorded is the account's.
    await expectRedirect(() =>
      approvePayrollRunAction({}, form({ runId: run.id, period: '2026-07' })),
    );
    const approved = (await findPayrollRun('2026-07'))!;
    expect(approved.status).toBe('approved');
    expect(approved.approvedBy).toBe('Test Owner');
  }, 60_000);

  it('takes a loan, a repayment and a drawing through the forms', async () => {
    const { createLoanAction, recordRepaymentAction } = await import(
      '../app/(app)/loans/actions'
    );
    const { recordCapitalAction, recordDrawingAction } = await import(
      '../app/(app)/owner/actions'
    );
    const { findLoan, listLoans, ownerTotals } = await import('./queries');

    // Seven fields, one save, and the money arrives with the loan. This used to
    // be two screens and two saves, which is what the owner asked to be rid of.
    await expectRedirect(() =>
      createLoanAction(
        {},
        form({
          lender: 'City Bank',
          amount: '1000000.00',
          takenOn: '2026-03-01',
          mode: 'bank_transfer',
          terms: '9 percent',
          reference: 'OD/2026/9',
        }),
      ),
    );
    const loan = (await findLoan('LOAN-0001'))!;
    expect(loan.lender).toBe('City Bank');
    expect((await listLoans())[0]!.outstanding.toDecimalString()).toBe(
      '1000000.00',
    );

    await expectRedirect(() =>
      recordRepaymentAction(
        {},
        form({
          loanId: loan.id,
          code: 'LOAN-0001',
          movedOn: '2026-04-05',
          amount: '250000.00',
          interestAmount: '12500.00',
          mode: 'bank_transfer',
        }),
      ),
    );
    const after = (await listLoans())[0]!;
    // The principal comes off what is owed. The interest does not.
    expect(after.outstanding.toDecimalString()).toBe('750000.00');
    expect(after.interestPaid.toDecimalString()).toBe('12500.00');

    // Four fields, and no account to pick anywhere on the screen.
    await expectRedirect(() =>
      recordCapitalAction(
        {},
        form({
          movedOn: '2026-02-01',
          amount: '500000.00',
          mode: 'bank_transfer',
          notes: 'Opening capital',
        }),
      ),
    );
    await expectRedirect(() =>
      recordDrawingAction(
        {},
        form({
          movedOn: '2026-07-10',
          amount: '150000.00',
          mode: 'cash',
          notes: 'Household',
        }),
      ),
    );
    expect((await ownerTotals()).standing.toDecimalString()).toBe('350000.00');

    // Hiding a menu entry proves nothing: the action is the endpoint and it
    // checks the permission for itself.
    for (const role of ['viewer', 'store']) {
      const refusedLoan = await as(role, () =>
        createLoanAction(
          {},
          form({
            lender: 'Should never be written',
            amount: '1000.00',
            takenOn: '2026-04-07',
            mode: 'cash',
          }),
        ),
      );
      expect(refusedLoan.error, role).toMatch(/role does not allow/i);

      const refusedDrawing = await as(role, () =>
        recordDrawingAction(
          {},
          form({ movedOn: '2026-04-07', amount: '1000.00', mode: 'cash' }),
        ),
      );
      expect(refusedDrawing.error, role).toMatch(/role does not allow/i);
    }
    expect(await listLoans()).toHaveLength(1);
  }, 60_000);
});
