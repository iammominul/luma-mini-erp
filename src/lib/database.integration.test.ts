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

    const customerId = await createParty({
      code: null,
      name: 'Bangla Japan Trading Ltd.',
      roles: ['customer'],
      contactPerson: 'Mr Rahman',
      phone: '01700000000',
      address: 'Gazipur',
      openingBalance: '50000.00',
      openingAsOf: '2026-06-30',
    });

    const billId = await createBill({
      partyId: customerId,
      direction: 'issued',
      status: 'posted' as const,
      billNo: '889',
      bookNo: '3',
      natureOfWork: 'dyeing_finishing',
      billDate: '2026-07-05',
      reference: null,
      narration: null,
      notes: null,
      reason: null,
      lines: [
        {
          description: 'S/J 100% Cotton, Lot 12',
          fabricType: 'S/J',
          color: 'Navy',
          challanNo: '1042',
          orderNo: '75-T',
          greyKg: '1250.5',
          finishedKg: '1201.25',
          rate: '45.5',
        },
        {
          description: '1x1 Rib, Lot 13',
          fabricType: '1x1 Rib',
          color: 'White',
          challanNo: '1043',
          orderNo: '75-T',
          greyKg: '880',
          finishedKg: null,
          rate: '52.25',
        },
      ],
    });

    const bill = await getBill(billId);
    expect(bill).not.toBeNull();
    // 1250.5 x 45.5 = 56897.75, 880 x 52.25 = 45980.00. Billed on grey weight.
    expect(bill!.total.toDecimalString()).toBe('102877.75');
    // The hand-written number is the bill's own; the system number sits beside it.
    expect(bill!.billNo).toBe('889');
    expect(bill!.bookNo).toBe('3');
    expect(bill!.docNo).toBe('CB-26-0001');
    expect(bill!.lines).toHaveLength(2);
    expect(bill!.lines[0]!.amount.toDecimalString()).toBe('56897.75');
    expect(bill!.lines[0]!.fabricType).toBe('S/J');
    expect(bill!.lines[0]!.color).toBe('Navy');
    expect(bill!.lines[0]!.challanNo).toBe('1042');
    expect(bill!.lines[0]!.orderNo).toBe('75-T');
    expect(bill!.lines[0]!.greyKg).toBe('1250.500');
    expect(bill!.lines[0]!.finishedKg).toBe('1201.250');
    // Finished weight is optional: a bill can be raised before it is known.
    expect(bill!.lines[1]!.finishedKg).toBeNull();

    // The second customer bill takes the next number in the system series.
    const secondBillId = await createBill({
      partyId: customerId,
      direction: 'issued',
      status: 'posted' as const,
      billNo: '890',
      bookNo: '3',
      natureOfWork: 'dyeing_finishing',
      billDate: '2026-07-18',
      reference: null,
      narration: null,
      notes: null,
      reason: null,
      lines: [
        {
          description: 'Interlock, Lot 20',
          fabricType: 'Interlock',
          color: 'Black',
          challanNo: '1050',
          orderNo: '76-T',
          greyKg: '500',
          finishedKg: null,
          rate: '60',
        },
      ],
    });
    expect((await getBill(secondBillId))!.docNo).toBe('CB-26-0002');

    await createPayment({
      partyId: customerId,
      direction: 'in',
      paidOn: '2026-07-20',
      amount: '100000.00',
      mode: 'cheque',
      reference: 'MR 5501',
      narration: null,
      notes: null,
      reason: null,
    });

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
    await updateBill(secondBillId, {
      partyId: customerId,
      direction: 'issued',
      status: 'posted' as const,
      billNo: '890',
      bookNo: '3',
      natureOfWork: 'dyeing_finishing',
      billDate: '2026-07-18',
      reference: 'Corrected weight',
      narration: null,
      notes: null,
      reason: 'Weight slip corrected by the warehouse',
      lines: [
        {
          description: 'Interlock, Lot 20',
          fabricType: 'Interlock',
          color: 'Black',
          challanNo: '1050',
          orderNo: '76-T',
          greyKg: '520',
          finishedKg: '505.5',
          rate: '60',
        },
      ],
    });
    const edited = (await getBill(secondBillId))!;
    expect(edited.total.toDecimalString()).toBe('31200.00');
    // The system number is never re-issued by an edit.
    expect(edited.docNo).toBe('CB-26-0002');

    await deleteBill(secondBillId, 'Duplicate entry');
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

    const subId = await createParty({
      code: null,
      name: 'Bhuiyan Fabrics Ltd.',
      roles: ['subcontractor'],
      contactPerson: null,
      phone: null,
      address: null,
      openingBalance: '0.00',
      openingAsOf: null,
    });

    const billId = await createBill({
      partyId: subId,
      direction: 'received',
      status: 'posted' as const,
      billNo: 'RD-889',
      bookNo: null,
      natureOfWork: 'dyeing_finishing',
      billDate: '2026-07-06',
      reference: null,
      narration: null,
      notes: null,
      reason: null,
      lines: [
        {
          description: 'S/J 100% Cotton, Lot 12',
          fabricType: 'S/J',
          color: 'Navy',
          challanNo: '1042',
          orderNo: '75-T',
          greyKg: '1250.5',
          finishedKg: '1201.25',
          rate: '28',
        },
      ],
    });

    // Their paper number is the bill's identity, and no system number is issued.
    const bill = await getBill(billId);
    expect(bill!.billNo).toBe('RD-889');
    expect(bill!.docNo).toBeNull();

    await expect(
      createBill({
        partyId: subId,
        direction: 'received',
        status: 'posted' as const,
        billNo: 'RD-889',
        bookNo: null,
        natureOfWork: 'dyeing_finishing',
        billDate: '2026-07-07',
        reference: null,
        narration: null,
        notes: null,
        reason: null,
        lines: [
          {
            description: 'Repeat',
            fabricType: null,
            color: null,
            challanNo: null,
            orderNo: null,
            greyKg: '10',
            finishedKg: null,
            rate: '10',
          },
        ],
      }),
    ).rejects.toBeInstanceOf(InputError);

    // One sign convention: a payable is negative, whoever it is owed to. The
    // old model stated this as +35014 "in the subcontractor's own direction".
    const balances = await listPartyBalances('subcontractor');
    expect(balances[0]!.balance.toDecimalString()).toBe('-35014.00');

    // A subcontractor's number is scoped to them: another one may write RD-889
    // in their own book, and that is not a clash.
    const otherId = await createParty({
      code: null,
      name: 'Nokshi Dyeing',
      roles: ['subcontractor'],
      contactPerson: null,
      phone: null,
      address: null,
      openingBalance: '0.00',
      openingAsOf: null,
    });
    await expect(
      createBill({
        partyId: otherId,
        direction: 'received',
        status: 'posted' as const,
        billNo: 'RD-889',
        bookNo: null,
        natureOfWork: 'dyeing_finishing',
        billDate: '2026-07-08',
        reference: null,
        narration: null,
        notes: null,
        reason: null,
        lines: [
          {
            description: 'Same number, different subcontractor',
            fabricType: null,
            color: null,
            challanNo: null,
            orderNo: null,
            greyKg: '10',
            finishedKg: null,
            rate: '10',
          },
        ],
      }),
    ).resolves.toBeTypeOf('string');
  }, 60_000);

  it('keeps a draft out of the book until it is posted', async () => {
    const { createBill, createParty, postBill } = await import('./mutations');
    const { getBill, listMovements, listPartyBalances } =
      await import('./queries');

    const partyId = await createParty({
      code: null,
      roles: ['customer'],
      name: 'Draft Test Knitwear',
      contactPerson: null,
      phone: null,
      address: null,
      openingBalance: '0.00',
      openingAsOf: null,
    });

    const line = {
      description: 'Black, Lot 1',
      fabricType: 'S/J',
      color: 'Black',
      challanNo: null,
      orderNo: null,
      greyKg: '100',
      finishedKg: null,
      rate: '50',
    };

    const before = (await listPartyBalances('customer')).find(
      (b) => b.party.id === partyId,
    );
    const counterBefore = await currentBillCounter();

    const draftId = await createBill({
      partyId,
      direction: 'issued',
      status: 'draft',
      billNo: 'D-1',
      bookNo: null,
      natureOfWork: 'dyeing_finishing',
      billDate: '2026-07-15',
      reference: null,
      narration: null,
      notes: null,
      reason: null,
      lines: [line],
    });

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

    await postBill(draftId);

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
    await expect(postBill(draftId)).rejects.toBeInstanceOf(InputError);
    expect(await currentBillCounter()).toBe(counterBefore + 1);
  }, 60_000);

  it('refuses a bill book number already written against another customer', async () => {
    const { createBill, createParty, InputError } = await import('./mutations');

    const line = {
      description: 'Grey, Lot 1',
      fabricType: null,
      color: null,
      challanNo: null,
      orderNo: null,
      greyKg: '100',
      finishedKg: null,
      rate: '50',
    };

    const first = await createParty({
      code: null,
      name: 'Bookcheck One',
      roles: ['customer'],
      contactPerson: null,
      phone: null,
      address: null,
      openingBalance: '0.00',
      openingAsOf: null,
    });
    const second = await createParty({
      code: null,
      name: 'Bookcheck Two',
      roles: ['customer'],
      contactPerson: null,
      phone: null,
      address: null,
      openingBalance: '0.00',
      openingAsOf: null,
    });

    await createBill({
      partyId: first,
      direction: 'issued',
      status: 'posted' as const,
      billNo: '1201',
      bookNo: '4',
      natureOfWork: 'dyeing_finishing',
      billDate: '2026-07-09',
      reference: null,
      narration: null,
      notes: null,
      reason: null,
      lines: [line],
    });

    // LUMA's bill book is one series across every customer, so serial 1201 of
    // book 4 cannot be written twice, even for a different customer.
    await expect(
      createBill({
        partyId: second,
        direction: 'issued',
        status: 'posted' as const,
        billNo: '1201',
        bookNo: '4',
        natureOfWork: 'dyeing_finishing',
        billDate: '2026-07-10',
        reference: null,
        narration: null,
        notes: null,
        reason: null,
        lines: [line],
      }),
    ).rejects.toBeInstanceOf(InputError);

    // The same serial in a different book is a different piece of paper.
    await expect(
      createBill({
        partyId: second,
        direction: 'issued',
        status: 'posted' as const,
        billNo: '1201',
        bookNo: '5',
        natureOfWork: 'dyeing_finishing',
        billDate: '2026-07-10',
        reference: null,
        narration: null,
        notes: null,
        reason: null,
        lines: [line],
      }),
    ).resolves.toBeTypeOf('string');
  }, 60_000);

  it('keeps a party name unique per side and refuses a type change', async () => {
    const { createParty, updateParty, setPartyActive, InputError } =
      await import('./mutations');
    const { getParty, listParties } = await import('./queries');

    const id = await createParty({
      code: null,
      name: 'Unique Textiles',
      roles: ['customer'],
      contactPerson: null,
      phone: null,
      address: null,
      openingBalance: '0.00',
      openingAsOf: null,
    });

    await expect(
      createParty({
        code: null,
        name: 'unique textiles',
        roles: ['customer'],
        contactPerson: null,
        phone: null,
        address: null,
        openingBalance: '0.00',
        openingAsOf: null,
      }),
    ).rejects.toBeInstanceOf(InputError);

    await expect(
      updateParty(id, {
        code: null,
        name: 'Unique Textiles',
        roles: ['subcontractor'],
        contactPerson: null,
        phone: null,
        address: null,
        openingBalance: '0.00',
        openingAsOf: null,
      }),
    ).rejects.toBeInstanceOf(InputError);

    await updateParty(id, {
      code: null,
      name: 'Unique Textiles Ltd',
      roles: ['customer'],
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
    const activeOnly = await listParties({ role: 'customer' });
    expect(activeOnly.some((p) => p.id === id)).toBe(false);
  }, 60_000);

  it('finds a party and a bill by the handle a URL carries', async () => {
    const { createBill, createParty } = await import('./mutations');
    const { findBill, findParty, getBill, getParty } = await import('./queries');

    const partyId = await createParty({
      code: null,
      name: 'Handle Test Textiles Ltd',
      roles: ['customer'],
      contactPerson: null,
      phone: null,
      address: null,
      openingBalance: '0',
      openingAsOf: '2026-07-01',
    });
    const party = (await getParty(partyId))!;
    expect(party.code).toMatch(/^CUS-\d{4,}$/);

    // The code is what a link carries, the id is what older links carry, and
    // both have to land on the same party.
    expect((await findParty(party.code!))!.id).toBe(partyId);
    expect((await findParty(partyId))!.id).toBe(partyId);
    expect((await findParty(party.code!.toLowerCase()))!.id).toBe(partyId);

    const billId = await createBill({
      partyId,
      direction: 'issued',
      status: 'posted',
      billNo: 'HANDLE-1',
      bookNo: '9',
      natureOfWork: 'dyeing_finishing',
      billDate: '2026-07-15',
      reference: null,
      narration: null,
      notes: null,
      reason: null,
      lines: [
        {
          description: 'Handle test',
          fabricType: null,
          color: null,
          challanNo: null,
          orderNo: null,
          greyKg: '10',
          finishedKg: null,
          rate: '10',
        },
      ],
    });
    const docNo = (await getBill(billId))!.docNo!;
    expect(docNo).toMatch(/^CB-\d{2}-\d{4,}$/);
    expect((await findBill(docNo))!.id).toBe(billId);
    expect((await findBill(docNo.toLowerCase()))!.id).toBe(billId);
    expect((await findBill(billId))!.id).toBe(billId);

    // A handle that is neither shape must answer "no such record" rather than
    // reaching Postgres and throwing out of a ::uuid cast.
    for (const junk of ['nonsense', '', 'CUS-0001-x', "'; drop table bill; --"]) {
      await expect(findParty(junk)).resolves.toBeNull();
      await expect(findBill(junk)).resolves.toBeNull();
      await expect(getParty(junk)).resolves.toBeNull();
      await expect(getBill(junk)).resolves.toBeNull();
    }
  }, 60_000);
});
