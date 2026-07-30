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

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.append(key, value);
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
          name: 'Meghna Knitwear',
          type: 'customer',
          contactPerson: 'Mr Hasan',
          phone: '01900000000',
          address: 'Ashulia',
          openingBalance: '25000.00',
          openingAsOf: '2026-06-30',
        }),
      ),
    );

    const [customer] = await listPartyBalances('customer');
    expect(customer!.party.name).toBe('Meghna Knitwear');

    // The bill form posts its line grid as JSON in a hidden field.
    const target = await expectRedirect(() =>
      createBillAction(
        {},
        form({
          side: 'customer',
          partyId: customer!.party.id,
          billDate: '2026-07-08',
          reference: 'Challan 2201',
          notes: 'July program',
          linesJson: JSON.stringify([
            {
              description: 'Red, Lot 31, Tube',
              qtyKg: '640.250',
              rate: '48.75',
            },
            { description: 'Grey Melange, Lot 32', qtyKg: '210', rate: '39.5' },
          ]),
        }),
      ),
    );

    const bills = await listBills({ type: 'customer' });
    expect(bills).toHaveLength(1);
    expect(target).toBe(`/customer/bills/${bills[0]!.id}`);
    // 640.25 x 48.75 = 31212.19 (rounded half up from 31212.1875), 210 x 39.5 = 8295
    expect(bills[0]!.total.toDecimalString()).toBe('39507.19');
    expect(bills[0]!.billNo).toBe('CB-26-0001');

    const bill = await getBill(bills[0]!.id);
    expect(bill!.lines.map((line) => line.amount.toDecimalString())).toEqual([
      '31212.19',
      '8295.00',
    ]);

    // An edit without a reason is refused rather than silently accepted.
    const refused = await updateBillAction(
      {},
      form({
        side: 'customer',
        id: bill!.id,
        partyId: customer!.party.id,
        billDate: '2026-07-08',
        linesJson: JSON.stringify([
          { description: 'Red, Lot 31, Tube', qtyKg: '640.250', rate: '50' },
        ]),
      }),
    );
    expect(refused.error).toBe('State why this bill is being edited.');

    // The receipt form posts these names.
    await expectRedirect(() =>
      createPaymentAction(
        {},
        form({
          side: 'customer',
          partyId: customer!.party.id,
          paidOn: '2026-07-25',
          amount: '30000.00',
          mode: 'bank_transfer',
          reference: 'MR 5510',
          notes: '',
        }),
      ),
    );

    const payments = await listPayments({ type: 'customer' });
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
    expect(await listBills({ type: 'customer' })).toHaveLength(0);
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
        paidOn: '2026-13-40',
        amount: '100.00',
        mode: 'cash',
      }),
    );
    expect(bad.error).toBeTruthy();
  }, 60_000);
});
