import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { splitSqlStatements } from '../../scripts/split-sql.mjs';
import { createPgDriver, type PgDriver } from './pg-driver';

/**
 * Runs every SQL statement in the app against a real Postgres.
 *
 * Production talks to Neon over HTTP; this swaps in the node-postgres driver
 * with the same shape (see pg-driver.ts). Everything is created inside a
 * throwaway schema and dropped afterwards, so the ERP dev database is untouched.
 *
 * Set INTERIM_TEST_DATABASE_URL to run it, for example:
 *   pnpm db:up            (in the ERP repo root)
 *   INTERIM_TEST_DATABASE_URL=postgresql://luma:luma@localhost:5432/luma_dev pnpm test
 * Without it the file is skipped, because the normal database is Neon.
 */

const CONNECTION = process.env.INTERIM_TEST_DATABASE_URL;
const SCHEMA = 'interim_billing_test';

let driver: PgDriver;

vi.mock('./db', () => ({
  db: () => driver,
}));

describe.skipIf(!CONNECTION)('the database layer', () => {
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

  it('runs a customer through billing, receipt, statement, and export', async () => {
    const { createBill, createParty, createPayment, updateBill, deleteBill } =
      await import('./mutations');
    const {
      getBill,
      listBills,
      listMovements,
      listPartyBalances,
      listPayments,
      recentActivity,
      schemaReady,
    } = await import('./queries');
    const { buildStatement } = await import('./statement');
    const { exportEverything } = await import('./export');

    // The readiness probe has to run without error against a live connection.
    expect(typeof (await schemaReady())).toBe('boolean');

    const customerId = await createParty({
      name: 'Shirin Fabrics Ltd',
      type: 'customer',
      contactPerson: 'Mr Rahman',
      phone: '01700000000',
      address: 'Gazipur',
      openingBalance: '50000.00',
      openingAsOf: '2026-06-30',
    });

    const billId = await createBill({
      partyId: customerId,
      billNo: null,
      billDate: '2026-07-05',
      reference: 'Challan 1042',
      notes: null,
      reason: null,
      lines: [
        { description: 'Navy, Lot 12, Tube', qtyKg: '1250.5', rate: '45.5' },
        { description: 'White, Lot 13, Open', qtyKg: '880', rate: '52.25' },
      ],
    });

    const bill = await getBill(billId);
    expect(bill).not.toBeNull();
    // 1250.5 x 45.5 = 56897.75, 880 x 52.25 = 45980.00
    expect(bill!.total.toDecimalString()).toBe('102877.75');
    expect(bill!.billNo).toBe('CB-26-0001');
    expect(bill!.lines).toHaveLength(2);
    expect(bill!.lines[0]!.amount.toDecimalString()).toBe('56897.75');

    // The second customer bill takes the next number in the series.
    const secondBillId = await createBill({
      partyId: customerId,
      billNo: null,
      billDate: '2026-07-18',
      reference: null,
      notes: null,
      reason: null,
      lines: [{ description: 'Black, Lot 20', qtyKg: '500', rate: '60' }],
    });
    expect((await getBill(secondBillId))!.billNo).toBe('CB-26-0002');

    await createPayment({
      partyId: customerId,
      paidOn: '2026-07-20',
      amount: '100000.00',
      mode: 'cheque',
      reference: 'MR 5501',
      notes: null,
      reason: null,
    });

    const balances = await listPartyBalances('customer');
    expect(balances).toHaveLength(1);
    // 50000 opening + 102877.75 + 30000 bills - 100000 received
    expect(balances[0]!.balance.toDecimalString()).toBe('82877.75');
    expect(balances[0]!.billCount).toBe(2);
    expect(balances[0]!.lastActivity).toBe('2026-07-20');

    const statement = buildStatement({
      openingBalance: balances[0]!.party.openingBalance,
      movements: await listMovements(customerId),
    });
    expect(statement.rows).toHaveLength(3);
    expect(statement.closing.toDecimalString()).toBe('82877.75');
    expect(statement.closing.equals(balances[0]!.balance)).toBe(true);

    // A statement for July only still carries the June opening balance in.
    const july = buildStatement({
      openingBalance: balances[0]!.party.openingBalance,
      movements: await listMovements(customerId),
      from: '2026-07-10',
      to: '2026-07-31',
    });
    expect(july.opening.toDecimalString()).toBe('152877.75');
    expect(july.closing.toDecimalString()).toBe('82877.75');

    // Editing re-writes the lines and keeps the before and after in the log.
    await updateBill(secondBillId, {
      partyId: customerId,
      billNo: null,
      billDate: '2026-07-18',
      reference: 'Corrected weight',
      notes: null,
      reason: 'Weight slip corrected by the warehouse',
      lines: [{ description: 'Black, Lot 20', qtyKg: '520', rate: '60' }],
    });
    expect((await getBill(secondBillId))!.total.toDecimalString()).toBe(
      '31200.00',
    );
    expect((await getBill(secondBillId))!.billNo).toBe('CB-26-0002');

    await deleteBill(secondBillId, 'Duplicate entry');
    expect(await getBill(secondBillId)).toBeNull();
    expect(await listBills({ type: 'customer' })).toHaveLength(1);
    expect(await listPayments({ type: 'customer' })).toHaveLength(1);

    const log = await recentActivity(20);
    expect(log.map((entry) => entry.action)).toContain('delete');
    expect(log.some((entry) => entry.reason === 'Duplicate entry')).toBe(true);

    const bundle = await exportEverything();
    expect(bundle.parties).toHaveLength(1);
    expect(bundle.bills).toHaveLength(1);
    expect(bundle.payments).toHaveLength(1);
    // Money leaves as text, never as a JSON number.
    expect((bundle.bills[0] as { total: unknown }).total).toBe('102877.75');
  }, 60_000);

  it('records a subcontractor bill under their own number and refuses a repeat', async () => {
    const { createBill, createParty, InputError } = await import('./mutations');
    const { listPartyBalances } = await import('./queries');

    const subId = await createParty({
      name: 'Rongdhonu Dyeing',
      type: 'subcontractor',
      contactPerson: null,
      phone: null,
      address: null,
      openingBalance: '0.00',
      openingAsOf: null,
    });

    await createBill({
      partyId: subId,
      billNo: 'RD-889',
      billDate: '2026-07-06',
      reference: 'Challan 1042',
      notes: null,
      reason: null,
      lines: [{ description: 'Navy, Lot 12', qtyKg: '1250.5', rate: '28' }],
    });

    await expect(
      createBill({
        partyId: subId,
        billNo: 'RD-889',
        billDate: '2026-07-07',
        reference: null,
        notes: null,
        reason: null,
        lines: [{ description: 'Repeat', qtyKg: '10', rate: '10' }],
      }),
    ).rejects.toBeInstanceOf(InputError);

    const balances = await listPartyBalances('subcontractor');
    expect(balances[0]!.balance.toDecimalString()).toBe('35014.00');
  }, 60_000);

  it('keeps a party name unique per side and refuses a type change', async () => {
    const { createParty, updateParty, setPartyActive, InputError } =
      await import('./mutations');
    const { getParty, listParties } = await import('./queries');

    const id = await createParty({
      name: 'Unique Textiles',
      type: 'customer',
      contactPerson: null,
      phone: null,
      address: null,
      openingBalance: '0.00',
      openingAsOf: null,
    });

    await expect(
      createParty({
        name: 'unique textiles',
        type: 'customer',
        contactPerson: null,
        phone: null,
        address: null,
        openingBalance: '0.00',
        openingAsOf: null,
      }),
    ).rejects.toBeInstanceOf(InputError);

    await expect(
      updateParty(id, {
        name: 'Unique Textiles',
        type: 'subcontractor',
        contactPerson: null,
        phone: null,
        address: null,
        openingBalance: '0.00',
        openingAsOf: null,
      }),
    ).rejects.toBeInstanceOf(InputError);

    await updateParty(id, {
      name: 'Unique Textiles Ltd',
      type: 'customer',
      contactPerson: 'Mrs Akter',
      phone: '01800000000',
      address: 'Narayanganj',
      openingBalance: '1234.56',
      openingAsOf: '2026-07-01',
    });
    const party = await getParty(id);
    expect(party!.name).toBe('Unique Textiles Ltd');
    expect(party!.openingBalance.toDecimalString()).toBe('1234.56');

    await setPartyActive(id, false);
    expect((await getParty(id))!.active).toBe(false);
    const activeOnly = await listParties({ type: 'customer' });
    expect(activeOnly.some((p) => p.id === id)).toBe(false);
  }, 60_000);
});
