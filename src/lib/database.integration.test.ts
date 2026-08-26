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

/** Who the tests write as. Every mutation records an actor. */
const TEST_ACTOR = { id: 'test-user', name: 'Test User' };
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

  /** The gapless customer bill counter, read straight from the table. */
  async function currentBillCounter(): Promise<number> {
    const rows = (await driver.query(
      `SELECT value FROM counter WHERE name = 'customer_bill'`,
    )) as { value: string }[];
    return Number(rows[0]?.value ?? 0);
  }

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

    const customerId = await createParty(
      {
        code: null,
        name: 'Bangla Japan Trading Ltd.',
        roles: ['customer'],
        contactPerson: 'Mr Rahman',
        phone: '01700000000',
        address: 'Gazipur',
        openingBalance: '50000.00',
        openingAsOf: '2026-06-30',
      },
      TEST_ACTOR,
    );

    const billId = await createBill(
      {
        partyId: customerId,
        direction: 'issued',
        status: 'posted' as const,
        billNo: '889',
        natureOfWork: 'dyeing_finishing',
        billDate: '2026-07-05',
        narration: null,
        notes: null,
        reason: null,
        lines: [
          {
            description: 'S/J 100% Cotton, Lot 12',
            color: 'Navy',
            challanNo: '1042',
            orderNo: '75-T',
            lotNo: null,
            greyKg: '1250.5',
            finishedKg: '1201.25',
            rate: '45.5',
          },
          {
            description: '1x1 Rib, Lot 13',
            color: 'White',
            challanNo: '1043',
            orderNo: '75-T',
            lotNo: null,
            greyKg: '880',
            finishedKg: null,
            rate: '52.25',
          },
        ],
      },
      TEST_ACTOR,
    );

    const bill = await getBill(billId);
    expect(bill).not.toBeNull();
    // 1250.5 x 45.5 = 56897.75, 880 x 52.25 = 45980.00. Billed on grey weight.
    expect(bill!.total.toDecimalString()).toBe('102877.75');
    // The hand-written number is the bill's own; the system number sits beside it.
    expect(bill!.billNo).toBe('889');
    expect(bill!.docNo).toBe('CB-26-0001');
    expect(bill!.lines).toHaveLength(2);
    expect(bill!.lines[0]!.amount.toDecimalString()).toBe('56897.75');
    expect(bill!.lines[0]!.color).toBe('Navy');
    expect(bill!.lines[0]!.challanNo).toBe('1042');
    expect(bill!.lines[0]!.orderNo).toBe('75-T');
    expect(bill!.lines[0]!.greyKg).toBe('1250.500');
    expect(bill!.lines[0]!.finishedKg).toBe('1201.250');
    // Finished weight is optional: a bill can be raised before it is known.
    expect(bill!.lines[1]!.finishedKg).toBeNull();

    // The second customer bill takes the next number in the system series.
    const secondBillId = await createBill(
      {
        partyId: customerId,
        direction: 'issued',
        status: 'posted' as const,
        billNo: '890',
        natureOfWork: 'dyeing_finishing',
        billDate: '2026-07-18',
        narration: null,
        notes: null,
        reason: null,
        lines: [
          {
            description: 'Interlock, Lot 20',
            color: 'Black',
            challanNo: '1050',
            orderNo: '76-T',
            lotNo: null,
            greyKg: '500',
            finishedKg: null,
            rate: '60',
          },
        ],
      },
      TEST_ACTOR,
    );
    expect((await getBill(secondBillId))!.docNo).toBe('CB-26-0002');

    await createPayment(
      {
        partyId: customerId,
        direction: 'in' as const,
        reference: 'MR 5501',
        paidOn: '2026-07-20',
        amount: '100000.00',
        mode: 'cheque',
        narration: null,
        notes: null,
        reason: null,
      },
      TEST_ACTOR,
    );

    const balances = await listPartyBalances('customer');
    expect(balances).toHaveLength(1);
    // 50000 opening + 102877.75 + 30000 bills - 100000 received
    expect(balances[0]!.balance.toDecimalString()).toBe('82877.75');
    expect(balances[0]!.billCount).toBe(2);
    expect(balances[0]!.lastActivity).toBe('2026-07-20');

    const movements = await listMovements(customerId);
    const statement = buildStatement({
      openingBalance: balances[0]!.party.openingBalance,
      movements,
    });
    expect(statement.rows).toHaveLength(3);
    expect(statement.closing.toDecimalString()).toBe('82877.75');
    expect(statement.closing.equals(balances[0]!.balance)).toBe(true);

    // The ledger quotes the hand-written bill number and names the order and
    // challan the bill covered, which is how a party recognizes the row.
    const billRow = statement.rows.find((row) => row.kind === 'bill');
    expect(billRow!.reference).toBe('Bill No. 889');
    // The challan and order belong to the bill; the ledger row says what the
    // work was and leaves the column room to breathe.
    expect(billRow!.particulars).toBe('Dyeing & Finishing Bill');
    expect(billRow!.debit!.toDecimalString()).toBe('102877.75');

    const receiptRow = statement.rows.find((row) => row.kind === 'payment');
    expect(receiptRow!.reference).toBe('MR 5501');
    // What it is, how the money moved, then whatever was noted about it.
    expect(receiptRow!.particulars).toBe('Payment Received / Cheque');
    expect(receiptRow!.credit!.toDecimalString()).toBe('100000.00');

    // A statement for July only still carries the June opening balance in.
    const july = buildStatement({
      openingBalance: balances[0]!.party.openingBalance,
      movements,
      from: '2026-07-10',
      to: '2026-07-31',
    });
    expect(july.opening.toDecimalString()).toBe('152877.75');
    expect(july.closing.toDecimalString()).toBe('82877.75');

    // Editing re-writes the lines and keeps the before and after in the log.
    await updateBill(
      secondBillId,
      {
        partyId: customerId,
        direction: 'issued',
        status: 'posted' as const,
        billNo: '890',
        natureOfWork: 'dyeing_finishing',
        billDate: '2026-07-18',
        narration: null,
        notes: null,
        reason: 'Weight slip corrected by the warehouse',
        lines: [
          {
            description: 'Interlock, Lot 20',
            color: 'Black',
            challanNo: '1050',
            orderNo: '76-T',
            lotNo: null,
            greyKg: '520',
            finishedKg: '505.5',
            rate: '60',
          },
        ],
      },
      TEST_ACTOR,
    );
    const edited = (await getBill(secondBillId))!;
    expect(edited.total.toDecimalString()).toBe('31200.00');
    // The system number is never re-issued by an edit.
    expect(edited.docNo).toBe('CB-26-0002');

    await deleteBill(secondBillId, 'Duplicate entry', TEST_ACTOR);
    expect(await getBill(secondBillId)).toBeNull();
    expect((await listBills({ direction: 'issued' })).bills).toHaveLength(1);
    expect(await listPayments({ direction: 'in' })).toHaveLength(1);

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
    const { getBill, listPartyBalances } = await import('./queries');

    const subId = await createParty(
      {
        code: null,
        name: 'Bhuiyan Fabrics Ltd.',
        roles: ['subcontractor'],
        contactPerson: null,
        phone: null,
        address: null,
        openingBalance: '0.00',
        openingAsOf: null,
      },
      TEST_ACTOR,
    );

    const billId = await createBill(
      {
        partyId: subId,
        direction: 'received',
        status: 'posted' as const,
        billNo: 'RD-889',
        natureOfWork: 'dyeing_finishing',
        billDate: '2026-07-06',
        narration: null,
        notes: null,
        reason: null,
        lines: [
          {
            description: 'S/J 100% Cotton, Lot 12',
            color: 'Navy',
            challanNo: '1042',
            orderNo: '75-T',
            lotNo: null,
            greyKg: '1250.5',
            finishedKg: '1201.25',
            rate: '28',
          },
        ],
      },
      TEST_ACTOR,
    );

    // Their paper number is the bill's identity, and no system number is issued.
    const bill = await getBill(billId);
    expect(bill!.billNo).toBe('RD-889');
    expect(bill!.docNo).toBeNull();

    await expect(
      createBill(
        {
          partyId: subId,
          direction: 'received',
          status: 'posted' as const,
          billNo: 'RD-889',
          natureOfWork: 'dyeing_finishing',
          billDate: '2026-07-07',
          narration: null,
          notes: null,
          reason: null,
          lines: [
            {
              description: 'Repeat',
              color: null,
              challanNo: null,
              orderNo: null,
              lotNo: null,
              greyKg: '10',
              finishedKg: null,
              rate: '10',
            },
          ],
        },
        TEST_ACTOR,
      ),
    ).rejects.toBeInstanceOf(InputError);

    // One sign convention: a payable is negative, whoever it is owed to. The
    // old model stated this as +35014 "in the subcontractor's own direction".
    const balances = await listPartyBalances('subcontractor');
    expect(balances[0]!.balance.toDecimalString()).toBe('-35014.00');

    // A subcontractor's number is scoped to them: another one may write RD-889
    // in their own book, and that is not a clash.
    const otherId = await createParty(
      {
        code: null,
        name: 'Nokshi Dyeing',
        roles: ['subcontractor'],
        contactPerson: null,
        phone: null,
        address: null,
        openingBalance: '0.00',
        openingAsOf: null,
      },
      TEST_ACTOR,
    );
    await expect(
      createBill(
        {
          partyId: otherId,
          direction: 'received',
          status: 'posted' as const,
          billNo: 'RD-889',
          natureOfWork: 'dyeing_finishing',
          billDate: '2026-07-08',
          narration: null,
          notes: null,
          reason: null,
          lines: [
            {
              description: 'Same number, different subcontractor',
              color: null,
              challanNo: null,
              orderNo: null,
              lotNo: null,
              greyKg: '10',
              finishedKg: null,
              rate: '10',
            },
          ],
        },
        TEST_ACTOR,
      ),
    ).resolves.toBeTypeOf('string');
  }, 60_000);

  it('keeps a draft out of the book until it is posted', async () => {
    const { createBill, createParty, postBill } = await import('./mutations');
    const { getBill, listMovements, listPartyBalances } =
      await import('./queries');

    const partyId = await createParty(
      {
        code: null,
        roles: ['customer'],
        name: 'Draft Test Knitwear',
        contactPerson: null,
        phone: null,
        address: null,
        openingBalance: '0.00',
        openingAsOf: null,
      },
      TEST_ACTOR,
    );

    const line = {
      description: 'Black, Lot 1',
      color: 'Black',
      challanNo: null,
      orderNo: null,
      lotNo: null,
      greyKg: '100',
      finishedKg: null,
      rate: '50',
    };

    const before = (await listPartyBalances('customer')).find(
      (b) => b.party.id === partyId,
    );
    const counterBefore = await currentBillCounter();

    const draftId = await createBill(
      {
        partyId,
        direction: 'issued',
        status: 'draft',
        billNo: 'D-1',
        natureOfWork: 'dyeing_finishing',
        billDate: '2026-07-15',
        narration: null,
        notes: null,
        reason: null,
        lines: [line],
      },
      TEST_ACTOR,
    );

    const draft = await getBill(draftId);
    expect(draft!.status).toBe('draft');
    // The number is issued at posting, so an abandoned draft leaves no hole in
    // the series. That gapless guarantee is the whole reason for waiting.
    expect(draft!.docNo).toBeNull();
    expect(await currentBillCounter()).toBe(counterBefore);

    // It counts for nothing and appears nowhere until it is posted.
    const during = (await listPartyBalances('customer')).find(
      (b) => b.party.id === partyId,
    );
    expect(during!.balance.toDecimalString()).toBe(
      before!.balance.toDecimalString(),
    );
    expect(await listMovements(partyId)).toHaveLength(0);

    await postBill(draftId, TEST_ACTOR);

    const posted = await getBill(draftId);
    expect(posted!.status).toBe('posted');
    expect(posted!.docNo).toMatch(/^CB-26-\d{4,}$/);
    expect(await currentBillCounter()).toBe(counterBefore + 1);

    const after = (await listPartyBalances('customer')).find(
      (b) => b.party.id === partyId,
    );
    expect(after!.balance.toDecimalString()).toBe('5000.00');
    expect(await listMovements(partyId)).toHaveLength(1);

    // Posting twice is refused rather than quietly taking another number.
    const { InputError } = await import('./mutations');
    await expect(postBill(draftId, TEST_ACTOR)).rejects.toBeInstanceOf(
      InputError,
    );
    expect(await currentBillCounter()).toBe(counterBefore + 1);
  }, 60_000);

  it('refuses a bill book number already written against another customer', async () => {
    const { createBill, createParty, InputError } = await import('./mutations');

    const line = {
      description: 'Grey, Lot 1',
      color: null,
      challanNo: null,
      orderNo: null,
      lotNo: null,
      greyKg: '100',
      finishedKg: null,
      rate: '50',
    };

    const first = await createParty(
      {
        code: null,
        name: 'Bookcheck One',
        roles: ['customer'],
        contactPerson: null,
        phone: null,
        address: null,
        openingBalance: '0.00',
        openingAsOf: null,
      },
      TEST_ACTOR,
    );
    const second = await createParty(
      {
        code: null,
        name: 'Bookcheck Two',
        roles: ['customer'],
        contactPerson: null,
        phone: null,
        address: null,
        openingBalance: '0.00',
        openingAsOf: null,
      },
      TEST_ACTOR,
    );

    await createBill(
      {
        partyId: first,
        direction: 'issued',
        status: 'posted' as const,
        billNo: '1201',
        natureOfWork: 'dyeing_finishing',
        billDate: '2026-07-09',
        narration: null,
        notes: null,
        reason: null,
        lines: [line],
      },
      TEST_ACTOR,
    );

    // LUMA writes one series, so 1201 cannot be written twice, even for a
    // different customer. This used to be scoped to the bill book, which meant
    // the same serial in another book was a different piece of paper; the book
    // is gone (2026-08-15) and the number now stands on its own.
    await expect(
      createBill(
        {
          partyId: second,
          direction: 'issued',
          status: 'posted' as const,
          billNo: '1201',
          natureOfWork: 'dyeing_finishing',
          billDate: '2026-07-10',
          narration: null,
          notes: null,
          reason: null,
          lines: [line],
        },
        TEST_ACTOR,
      ),
    ).rejects.toBeInstanceOf(InputError);

    // A different number for that customer is still ordinary.
    await expect(
      createBill(
        {
          partyId: second,
          direction: 'issued',
          status: 'posted' as const,
          billNo: '1202',
          natureOfWork: 'dyeing_finishing',
          billDate: '2026-07-10',
          narration: null,
          notes: null,
          reason: null,
          lines: [line],
        },
        TEST_ACTOR,
      ),
    ).resolves.toBeTypeOf('string');
  }, 60_000);

  it('keeps a party name unique per side and refuses a type change', async () => {
    const { createParty, updateParty, setPartyActive, InputError } =
      await import('./mutations');
    const { getParty, listParties } = await import('./queries');

    const id = await createParty(
      {
        code: null,
        name: 'Unique Textiles',
        roles: ['customer'],
        contactPerson: null,
        phone: null,
        address: null,
        openingBalance: '0.00',
        openingAsOf: null,
      },
      TEST_ACTOR,
    );

    await expect(
      createParty(
        {
          code: null,
          name: 'unique textiles',
          roles: ['customer'],
          contactPerson: null,
          phone: null,
          address: null,
          openingBalance: '0.00',
          openingAsOf: null,
        },
        TEST_ACTOR,
      ),
    ).rejects.toBeInstanceOf(InputError);

    await expect(
      updateParty(
        id,
        {
          code: null,
          name: 'Unique Textiles',
          roles: ['subcontractor'],
          contactPerson: null,
          phone: null,
          address: null,
          openingBalance: '0.00',
          openingAsOf: null,
        },
        TEST_ACTOR,
      ),
    ).rejects.toBeInstanceOf(InputError);

    await updateParty(
      id,
      {
        code: null,
        name: 'Unique Textiles Ltd',
        roles: ['customer'],
        contactPerson: 'Mrs Akter',
        phone: '01800000000',
        address: 'Narayanganj',
        openingBalance: '1234.56',
        openingAsOf: '2026-07-01',
      },
      TEST_ACTOR,
    );
    const party = await getParty(id);
    expect(party!.name).toBe('Unique Textiles Ltd');
    expect(party!.openingBalance.toDecimalString()).toBe('1234.56');

    await setPartyActive(id, false, TEST_ACTOR);
    expect((await getParty(id))!.active).toBe(false);
    const activeOnly = await listParties({ role: 'customer' });
    expect(activeOnly.some((p) => p.id === id)).toBe(false);
  }, 60_000);

  it('finds a party and a bill by the handle a URL carries', async () => {
    const { createBill, createParty } = await import('./mutations');
    const { findBill, findParty, getBill, getParty } =
      await import('./queries');

    const partyId = await createParty(
      {
        code: null,
        name: 'Handle Test Textiles Ltd',
        roles: ['customer'],
        contactPerson: null,
        phone: null,
        address: null,
        openingBalance: '0',
        openingAsOf: '2026-07-01',
      },
      TEST_ACTOR,
    );
    const party = (await getParty(partyId))!;
    expect(party.code).toMatch(/^CUS-\d{4,}$/);

    // The code is what a link carries, the id is what older links carry, and
    // both have to land on the same party.
    expect((await findParty(party.code!))!.id).toBe(partyId);
    expect((await findParty(partyId))!.id).toBe(partyId);
    expect((await findParty(party.code!.toLowerCase()))!.id).toBe(partyId);

    const billId = await createBill(
      {
        partyId,
        direction: 'issued',
        status: 'posted',
        billNo: 'HANDLE-1',
        natureOfWork: 'dyeing_finishing',
        billDate: '2026-07-15',
        narration: null,
        notes: null,
        reason: null,
        lines: [
          {
            description: 'Handle test',
            color: null,
            challanNo: null,
            orderNo: null,
            lotNo: null,
            greyKg: '10',
            finishedKg: null,
            rate: '10',
          },
        ],
      },
      TEST_ACTOR,
    );
    const docNo = (await getBill(billId))!.docNo!;
    expect(docNo).toMatch(/^CB-\d{2}-\d{4,}$/);
    expect((await findBill(docNo))!.id).toBe(billId);
    expect((await findBill(docNo.toLowerCase()))!.id).toBe(billId);
    expect((await findBill(billId))!.id).toBe(billId);

    // A handle that is neither shape must answer "no such record" rather than
    // reaching Postgres and throwing out of a ::uuid cast.
    for (const junk of [
      'nonsense',
      '',
      'CUS-0001-x',
      "'; drop table bill; --",
    ]) {
      await expect(findParty(junk)).resolves.toBeNull();
      await expect(findBill(junk)).resolves.toBeNull();
      await expect(getParty(junk)).resolves.toBeNull();
      await expect(getBill(junk)).resolves.toBeNull();
    }
  }, 60_000);

  it('opens the register on the latest bill and orders on date or number', async () => {
    const { createBill, createParty } = await import('./mutations');
    const { listBills } = await import('./queries');

    const partyId = await createParty(
      {
        code: null,
        name: 'Order Of Entry Knitwear Ltd',
        roles: ['customer'],
        contactPerson: null,
        phone: null,
        address: null,
        openingBalance: '0',
        openingAsOf: '2026-01-01',
      },
      TEST_ACTOR,
    );

    // Deliberately out of step: the highest number is the oldest date, so an
    // order that only looks right by accident cannot pass both checks.
    const written: [string, string][] = [
      ['195', '2026-03-11'],
      ['7', '2026-04-06'],
      ['85', '2026-05-20'],
    ];
    for (const [billNo, billDate] of written) {
      await createBill(
        {
          partyId,
          direction: 'issued',
          status: 'posted',
          billNo,
          natureOfWork: 'dyeing_finishing',
          billDate,
          narration: null,
          notes: null,
          reason: null,
          lines: [
            {
              description: 'As per bill register',
              color: null,
              challanNo: null,
              orderNo: null,
              lotNo: null,
              greyKg: '100',
              finishedKg: null,
              rate: '50',
            },
          ],
        },
        TEST_ACTOR,
      );
    }

    const numbers = async (options: Parameters<typeof listBills>[0]) =>
      (await listBills(options)).bills.map((bill) => bill.billNo);

    const mine = { direction: 'issued' as const, partyId };

    // No sort asked for is the latest bill first, which is the one being
    // looked for when the register is opened.
    expect(await numbers(mine)).toEqual(['85', '7', '195']);
    expect(await numbers({ ...mine, sort: 'date', dir: 'asc' })).toEqual([
      '195',
      '7',
      '85',
    ]);

    // A bill number sorts as a number. Ordered as text, 195 would lead.
    expect(await numbers({ ...mine, sort: 'billNo', dir: 'desc' })).toEqual([
      '195',
      '85',
      '7',
    ]);
    expect(await numbers({ ...mine, sort: 'billNo', dir: 'asc' })).toEqual([
      '7',
      '85',
      '195',
    ]);
  }, 60_000);

  it('keeps a rate worked back out of the bill book to the poisha', async () => {
    const { createBill, createParty } = await import('./mutations');
    const { getBill } = await import('./queries');

    const partyId = await createParty(
      {
        code: null,
        name: 'Back Computed Rate Fabrics Ltd',
        roles: ['customer'],
        contactPerson: null,
        phone: null,
        address: null,
        openingBalance: '0',
        openingAsOf: '2026-01-01',
      },
      TEST_ACTOR,
    );

    // The bill book recorded 5141 kg and Tk 643,798.00 and no rate at all. The
    // rate that gets back to that amount needs six decimals; at two it is
    // 125.23, which bills the customer 643,807.43 instead.
    const billId = await createBill(
      {
        partyId,
        direction: 'issued',
        status: 'posted',
        billNo: 'RATE-1',
        natureOfWork: 'dyeing_finishing',
        billDate: '2026-04-06',
        narration: null,
        notes: null,
        reason: null,
        lines: [
          {
            description: 'As per bill register',
            color: null,
            challanNo: null,
            orderNo: null,
            lotNo: null,
            greyKg: '5141',
            finishedKg: null,
            rate: '125.228166',
          },
        ],
      },
      TEST_ACTOR,
    );

    const bill = (await getBill(billId))!;
    expect(bill.total.toDecimalString()).toBe('643798.00');
    // NUMERIC(12,6) round trip: every place typed comes back.
    expect(Number(bill.lines[0]!.rate)).toBe(125.228166);
  }, 60_000);
  /**
   * The whole point of the cost tiers, end to end.
   *
   * One order billed to a customer, knitted and dyed by two subcontractors,
   * with freight and a lab test against it, a commission to win it, an office
   * expense that belongs to nobody in particular. Every one of those has to
   * land in the right tier.
   */
  it('sorts every kind of cost into the right tier of the profit statement', async () => {
    const { createBill, createExpense, createParty } = await import(
      './mutations',
    );
    const { statementFor } = await import('./profit');

    const customer = await createParty(
      {
        code: null,
        name: 'Costing Test Customer',
        roles: ['customer'],
        contactPerson: null,
        phone: null,
        address: null,
        openingBalance: '0.00',
        openingAsOf: null,
      },
      TEST_ACTOR,
    );
    const knitter = await createParty(
      {
        code: null,
        name: 'Costing Test Knitting Mills',
        roles: ['subcontractor'],
        contactPerson: null,
        phone: null,
        address: null,
        openingBalance: '0.00',
        openingAsOf: null,
      },
      TEST_ACTOR,
    );
    const dyer = await createParty(
      {
        code: null,
        name: 'Costing Test Dyeing Mills',
        roles: ['subcontractor'],
        contactPerson: null,
        phone: null,
        address: null,
        openingBalance: '0.00',
        openingAsOf: null,
      },
      TEST_ACTOR,
    );

    const bill = (
      partyId: string,
      direction: 'issued' | 'received',
      billNo: string,
      natureOfWork: 'dyeing_finishing' | 'knitting',
      amount: string,
    ) => ({
      partyId,
      direction,
      status: 'posted' as const,
      billNo,
      natureOfWork,
      billDate: '2027-03-10',
      narration: null,
      notes: null,
      reason: null,
      lines: [
        {
          description: 'Costing test lot',
          color: null,
          challanNo: null,
          orderNo: 'ORD-COST-1',
          lotNo: null,
          greyKg: '1000',
          finishedKg: null,
          rate: amount,
        },
      ],
    });

    // 1000 kg at the rate, so the rate doubles as the amount in thousands.
    await createBill(
      bill(customer, 'issued', 'CT-1', 'dyeing_finishing', '100'),
      TEST_ACTOR,
    );
    await createBill(
      bill(knitter, 'received', 'CT-K1', 'knitting', '12'),
      TEST_ACTOR,
    );
    await createBill(
      bill(dyer, 'received', 'CT-D1', 'dyeing_finishing', '48'),
      TEST_ACTOR,
    );

    const expense = (
      category: string,
      amount: string,
      orderNo: string | null,
    ) => ({
      spentOn: '2027-03-12',
      category: category as 'freight_inward',
      payee: 'Costing test payee',
      description: `Costing test ${category}`,
      amount,
      mode: 'cash' as const,
      reference: null,
      orderNo,
      notes: null,
      reason: null,
    });

    await createExpense(
      expense('freight_inward', '2100.00', 'ORD-COST-1'),
      TEST_ACTOR,
    );
    await createExpense(
      expense('lab_test', '450.00', 'ORD-COST-1'),
      TEST_ACTOR,
    );
    await createExpense(
      expense('commission', '3400.00', 'ORD-COST-1'),
      TEST_ACTOR,
    );
    await createExpense(expense('office', '900.00', null), TEST_ACTOR);


    const statement = await statementFor('2027-03-01', '2027-03-31');

    // Revenue is the customer bill alone.
    expect(statement.revenue.toDecimalString()).toBe('100000.00');

    // Direct: knitting 12,000 + dyeing 48,000 + freight 2,100 + lab 450.
    expect(statement.directCost.toDecimalString()).toBe('62550.00');
    expect(statement.grossMargin.toDecimalString()).toBe('37450.00');
    expect(statement.grossMarginPercent).toBe('37.5%');

    // Commission is selling cost, kept out of the gross margin.
    expect(statement.sellingCost.toDecimalString()).toBe('3400.00');
    expect(statement.contribution.toDecimalString()).toBe('34050.00');

    // Overhead: the office expense alone.
    expect(statement.operatingCost.toDecimalString()).toBe('900.00');

    expect(statement.netResult.toDecimalString()).toBe('33150.00');

    // The dashboard draws the same margin a month at a time, and it has to be
    // the same margin: direct cost there is the whole tier, freight and lab
    // test included, not the subcontract bills on their own. Two figures under
    // the one name on one screen is what this holds shut.
    const { monthlyTrading } = await import('./queries');
    const march = (await monthlyTrading('2027-03-01', '2027-03-31')).find(
      (month) => month.period === '2027-03',
    );
    expect(march?.revenue.toDecimalString()).toBe('100000.00');
    expect(march?.directCost.toDecimalString()).toBe('62550.00');
  }, 30_000);

  it('costs one order without ever apportioning overhead to it', async () => {
    const { orderCosting, orderDetail } = await import('./queries');
    const { orderMargin } = await import('./costing');

    const { orders, attributed, total } = await orderCosting(
      '2027-03-01',
      '2027-03-31',
    );
    const order = orders.find((o) => o.orderNo === 'ORD-COST-1');
    expect(order).toBeDefined();

    const margin = orderMargin(order!);
    expect(margin.revenue.toDecimalString()).toBe('100000.00');
    expect(margin.directCost.toDecimalString()).toBe('62550.00');
    expect(margin.sellingCost.toDecimalString()).toBe('3400.00');
    expect(margin.contribution.toDecimalString()).toBe('34050.00');

    // The office expense carries no order reference, so it is in the period
    // total and in no order. That gap is what coverage reports.
    expect(total.cost.subtract(attributed.cost).toDecimalString()).toBe('0.00');

    const detail = await orderDetail('ORD-COST-1');
    expect(detail.bills).toHaveLength(3);
    expect(detail.expenses).toHaveLength(3);
  }, 30_000);

  // The categories used to be one list where 'transport' covered both a truck
  // carrying fabric and a bus fare. The split must not reach back and reclassify
  // what was already recorded, or a past month's margin would change on deploy.
  it('leaves an existing transport expense in overhead after the split', async () => {
    const { createExpense } = await import('./mutations');
    const { statementFor } = await import('./profit');

    await createExpense(
      {
        spentOn: '2027-04-02',
        category: 'transport',
        payee: 'Costing test',
        description: 'Staff bus fare',
        amount: '300.00',
        mode: 'cash' as const,
        reference: null,
        orderNo: null,
        notes: null,
        reason: null,
      },
      TEST_ACTOR,
    );

    const statement = await statementFor('2027-04-01', '2027-04-30');
    expect(statement.operatingCost.toDecimalString()).toBe('300.00');
    expect(statement.directCost.isZero()).toBe(true);
  }, 30_000);

  /**
   * All Dates is only as wide as this query, and a span read off the bills
   * alone would quietly leave a payment or an expense outside the one range
   * named for holding everything. The two entries here sit outside every other
   * date in this file on purpose, so the assertion does not depend on what the
   * tests above happened to record.
   */
  it('spans the whole book, not the bills alone', async () => {
    const { createExpense, createParty, createPayment } =
      await import('./mutations');
    const { bookSpan } = await import('./queries');

    const before = await bookSpan();
    expect(before).not.toBeNull();

    await createExpense(
      {
        spentOn: '2020-01-05',
        category: 'office',
        payee: 'Book span test',
        description: 'The oldest thing in the book',
        amount: '100.00',
        mode: 'cash' as const,
        reference: null,
        orderNo: null,
        notes: null,
        reason: null,
      },
      TEST_ACTOR,
    );

    const party = await createParty(
      {
        code: null,
        name: 'Book Span Test Customer',
        roles: ['customer'],
        contactPerson: null,
        phone: null,
        address: null,
        openingBalance: '0.00',
        openingAsOf: null,
      },
      TEST_ACTOR,
    );
    await createPayment(
      {
        partyId: party,
        direction: 'in' as const,
        reference: 'MR SPAN',
        paidOn: '2030-06-20',
        amount: '100.00',
        mode: 'cash',
        narration: null,
        notes: null,
        reason: null,
      },
      TEST_ACTOR,
    );

    const span = await bookSpan();
    expect(span).toEqual({ first: '2020-01-05', last: '2030-06-20' });
  }, 30_000);
});
