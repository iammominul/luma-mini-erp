import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { splitSqlStatements } from '../../scripts/split-sql.mjs';
import { createPgDriver, type PgDriver } from './pg-driver';
import type { BillFormInput, PaymentFormInput } from './schemas';

/**
 * The numbering standard and the supplier side (2026-10-06), against a real
 * Postgres.
 *
 * Its own throwaway schema, so every series starts at one and the numbers
 * asserted here are the numbers a fresh book would issue. Run it the same way
 * as the other integration suites:
 *   INTERIM_TEST_DATABASE_URL=postgresql://luma:luma@localhost:5434/interim_test pnpm test
 */

const CONNECTION = process.env.INTERIM_TEST_DATABASE_URL;
const TEST_ACTOR = { id: 'test-user', name: 'Test User' };
const SCHEMA = 'interim_numbering_test';

let driver: PgDriver;

vi.mock('./db', () => ({
  db: () => driver,
}));

async function applySchema(): Promise<void> {
  const schemaSql = readFileSync(
    join(import.meta.dirname, '..', '..', 'db', 'schema.sql'),
    'utf8',
  );
  for (const statement of splitSqlStatements(schemaSql)) {
    await driver.query(statement);
  }
}

async function counter(name: string): Promise<number> {
  const rows = (await driver.query(
    `SELECT value FROM counter WHERE name = '${name}'`,
  )) as { value: string }[];
  return Number(rows[0]?.value ?? 0);
}

const LINE = {
  description: '30/1 Combed Cotton',
  color: null,
  challanNo: null,
  orderNo: null,
  lotNo: 'YL-77',
  greyKg: '500',
  finishedKg: null,
  rate: '380',
};

function bill(
  partyId: string,
  role: BillFormInput['partyRole'],
  billNo: string | null,
  extra: Partial<BillFormInput> = {},
): BillFormInput {
  return {
    partyId,
    direction: role === 'customer' ? 'issued' : 'received',
    partyRole: role,
    status: 'posted',
    billNo,
    natureOfWork: 'dyeing_finishing',
    billDate: '2026-10-06',
    narration: null,
    notes: null,
    reason: null,
    lines: [LINE],
    ...extra,
  };
}

function payment(
  partyId: string,
  role: PaymentFormInput['partyRole'],
  reference: string | null,
): PaymentFormInput {
  return {
    partyId,
    direction: role === 'customer' ? 'in' : 'out',
    partyRole: role,
    paidOn: '2026-10-07',
    amount: '1000.00',
    mode: 'bank_transfer',
    reference,
    narration: null,
    notes: null,
    reason: null,
  };
}

describe.skipIf(!CONNECTION)('numbering and the supplier side', () => {
  let customerId: string;
  let knitterId: string;
  let spinnerId: string;

  beforeAll(async () => {
    const admin = createPgDriver(CONNECTION!, 'public');
    await admin.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`);
    await admin.query(`CREATE SCHEMA ${SCHEMA}`);
    await admin.end();

    driver = createPgDriver(CONNECTION!, SCHEMA);
    await applySchema();

    const { createParty } = await import('./mutations');
    const party = (name: string, role: 'customer' | 'subcontractor' | 'supplier') =>
      createParty(
        {
          code: null,
          name,
          roles: [role],
          contactPerson: null,
          phone: null,
          address: null,
          openingBalance: '0',
          openingAsOf: null,
        },
        TEST_ACTOR,
      );
    customerId = await party('Numbering Garments Ltd', 'customer');
    knitterId = await party('Numbering Knitting', 'subcontractor');
    spinnerId = await party('Numbering Spinning Mills', 'supplier');
  }, 60_000);

  afterAll(async () => {
    if (!CONNECTION) return;
    await driver.end();
    const admin = createPgDriver(CONNECTION, 'public');
    await admin.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`);
    await admin.end();
  });

  it('gives a supplier a SUP code from its own counter', async () => {
    const { getParty } = await import('./queries');
    expect((await getParty(spinnerId))!.code).toBe('SUP-0001');
    expect((await getParty(knitterId))!.code).toBe('SUB-0001');
    expect(await counter('party_supplier')).toBe(1);
  });

  it('records a supplier bill as yarn, under a BR number, on the supplier lens only', async () => {
    const { createBill } = await import('./mutations');
    const { getBill, listBills } = await import('./queries');

    // Whatever the form posted, a supplier's bill is yarn.
    const id = await createBill(
      bill(spinnerId, 'supplier', 'SP-501', { natureOfWork: 'knitting' }),
      TEST_ACTOR,
    );
    const saved = await getBill(id);
    expect(saved!.natureOfWork).toBe('yarn');
    expect(saved!.partyRole).toBe('supplier');
    expect(saved!.docNo).toBe('BR-26-0001');
    expect(saved!.billNo).toBe('SP-501');

    // A knitting bill runs the same direction and must not be mixed in.
    await createBill(bill(knitterId, 'subcontractor', 'KN-9'), TEST_ACTOR);

    const supplierSide = await listBills({ direction: 'received', role: 'supplier' });
    const subcontractorSide = await listBills({
      direction: 'received',
      role: 'subcontractor',
    });
    expect(supplierSide.bills.map((b) => b.billNo)).toEqual(['SP-501']);
    expect(subcontractorSide.bills.map((b) => b.billNo)).toEqual(['KN-9']);
    // One series across both kinds of bill received.
    expect(subcontractorSide.bills[0]!.docNo).toBe('BR-26-0002');
    expect(await counter('bill_received')).toBe(2);
  }, 30_000);

  it('refuses a bill on a lens whose role the party does not hold', async () => {
    const { createBill, createPayment } = await import('./mutations');
    await expect(
      createBill(bill(knitterId, 'supplier', 'X-1'), TEST_ACTOR),
    ).rejects.toThrow(/not set up as a supplier/);
    await expect(
      createPayment(payment(knitterId, 'supplier', null), TEST_ACTOR),
    ).rejects.toThrow(/not set up as a supplier/);
    // A forged pairing of role and direction is refused, not trusted.
    await expect(
      createBill(
        { ...bill(spinnerId, 'supplier', 'X-2'), direction: 'issued' },
        TEST_ACTOR,
      ),
    ).rejects.toThrow(/does not match/);
  });

  it('prints the system number on a customer bill and keeps the paper one as a reference', async () => {
    const { createBill, postBill } = await import('./mutations');
    const { getBill } = await import('./queries');

    // No Paper Ref at all is an ordinary bill now.
    const plain = await getBill(
      await createBill(bill(customerId, 'customer', null), TEST_ACTOR),
    );
    expect(plain!.docNo).toBe('CB-26-0001');
    expect(plain!.billNo).toBeNull();

    const withRef = await getBill(
      await createBill(bill(customerId, 'customer', '1201'), TEST_ACTOR),
    );
    expect(withRef!.docNo).toBe('CB-26-0002');
    expect(withRef!.billNo).toBe('1201');

    // The paper book's number still cannot be keyed twice.
    await expect(
      createBill(bill(customerId, 'customer', '1201'), TEST_ACTOR),
    ).rejects.toThrow(/Paper Ref 1201 is already recorded/);

    // A draft takes no number until it is posted, so an abandoned one leaves
    // no hole in the series.
    const draftId = await createBill(
      bill(customerId, 'customer', null, { status: 'draft' }),
      TEST_ACTOR,
    );
    expect((await getBill(draftId))!.docNo).toBeNull();
    expect(await counter('customer_bill')).toBe(2);
    await postBill(draftId, TEST_ACTOR);
    expect((await getBill(draftId))!.docNo).toBe('CB-26-0003');
  }, 30_000);

  it('numbers receipts MR and payments PV, each on its own counter', async () => {
    const { createPayment } = await import('./mutations');
    const { findPayment, listPayments } = await import('./queries');

    const mr = await findPayment(
      await createPayment(payment(customerId, 'customer', 'Book 4410'), TEST_ACTOR),
    );
    const pvSupplier = await findPayment(
      await createPayment(payment(spinnerId, 'supplier', 'Chq 100231'), TEST_ACTOR),
    );
    const pvKnitter = await findPayment(
      await createPayment(payment(knitterId, 'subcontractor', null), TEST_ACTOR),
    );

    expect(mr!.docNo).toBe('MR-26-0001');
    expect(mr!.reference).toBe('Book 4410');
    expect(pvSupplier!.docNo).toBe('PV-26-0001');
    expect(pvKnitter!.docNo).toBe('PV-26-0002');

    // A voucher number is a handle, whatever case it is typed in.
    expect((await findPayment('pv-26-0001'))!.id).toBe(pvSupplier!.id);

    expect(
      (await listPayments({ direction: 'out', role: 'supplier' })).map(
        (p) => p.docNo,
      ),
    ).toEqual(['PV-26-0001']);
    expect(await counter('money_receipt')).toBe(1);
    expect(await counter('payment_voucher')).toBe(2);
  }, 30_000);

  it('counts yarn as a direct cost of its own on the profit statement', async () => {
    const { statementFor } = await import('./profit');
    const result = await statementFor('2026-10-01', '2026-10-31');
    const yarn = result.directLines.find((line) => line.label === 'Yarn');
    // 500 kg at 380.
    expect(yarn?.amount.toDecimalString()).toBe('190000.00');
    expect(yarn?.note).toBe('Supplier bills');
  }, 30_000);

  it('reads a row old code wrote without a role or a number, and numbers it on the next apply', async () => {
    const { listBills, listPayments } = await import('./queries');

    // What the code still serving during a deploy would write: no party_role,
    // no doc_no. Dated earlier than everything above, to show the backfill
    // continues the series rather than renumbering what was already issued.
    await driver.query(`
      INSERT INTO bill (party_id, direction, status, bill_no, bill_date,
        nature_of_work, total)
      VALUES ('${knitterId}', 'received', 'posted', 'OLD-1', '2026-01-02',
        'knitting', 10)
    `);
    await driver.query(`
      INSERT INTO payment (party_id, direction, paid_on, amount, mode)
      VALUES ('${customerId}', 'in', '2026-01-03', 10, 'cash')
    `);

    // Until then it reads as its direction implies.
    const before = await listBills({ direction: 'received', role: 'subcontractor' });
    const old = before.bills.find((b) => b.billNo === 'OLD-1');
    expect(old!.partyRole).toBe('subcontractor');
    expect(old!.docNo).toBeNull();
    expect(
      (await listPayments({ direction: 'in', role: 'customer' })).some(
        (p) => p.docNo === null,
      ),
    ).toBe(true);

    await applySchema();

    const after = await listBills({ direction: 'received', role: 'subcontractor' });
    expect(after.bills.find((b) => b.billNo === 'OLD-1')!.docNo).toBe('BR-26-0003');
    expect(after.bills.find((b) => b.billNo === 'KN-9')!.docNo).toBe('BR-26-0002');
    expect(await counter('bill_received')).toBe(3);

    const receipts = await listPayments({ direction: 'in', role: 'customer' });
    expect(receipts.map((p) => p.docNo).sort()).toEqual(['MR-26-0001', 'MR-26-0002']);
    expect(await counter('money_receipt')).toBe(2);

    // And a second apply changes nothing.
    await applySchema();
    expect(await counter('bill_received')).toBe(3);
    expect(await counter('money_receipt')).toBe(2);
  }, 120_000);
});
