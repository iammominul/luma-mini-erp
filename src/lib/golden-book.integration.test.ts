import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { splitSqlStatements } from '../../scripts/split-sql.mjs';
import { Money } from './money';
import { createPgDriver, type PgDriver } from './pg-driver';

/**
 * The real bill book, reproduced to the poisha on every change.
 *
 * __fixtures__/luma-book-2026-07-31.json is the Backup export of 2026-07-31:
 * 113 real customer bills for Bangla Japan Trading Ltd., April to July 2026,
 * and the two receipts against them. The owner approved committing it as it
 * is (2026-10-29). August named it the best test asset the project has.
 *
 * It is loaded into a throwaway schema and every statement is built through
 * the same listMovements and buildStatement the screen and the PDF use. Two
 * checks hold it:
 *
 * 1. Arithmetic worked out here from the export alone: each bill's lines add
 *    to its total, and each closing balance is opening plus bills less
 *    receipts. A change that breaks the money engine fails this.
 * 2. Every statement row, in order, with its running balance, against a
 *    committed snapshot. A change that reorders a statement, rounds
 *    differently or drops a row fails this, even when the closing still agrees.
 *
 * The full ERP's modules are built in this app from 2026-10-29. None of them
 * may move a figure here; if one is meant to, that is a decision taken in the
 * full ERP's register first, and the snapshot is updated in the same change.
 */

type ExportLine = { lineNo: number; description: string; fabricType: string | null;
  color: string | null; challanNo: string | null; orderNo: string | null;
  greyKg: string; finishedKg: string | null; rate: string; amount: string };
type ExportBill = { id: string; docNo: string; billNo: string | null; partyId: string;
  billDate: string; direction: 'issued' | 'received'; narration: string | null;
  notes: string | null; total: string; lines: ExportLine[] };
type ExportParty = { id: string; code: string; name: string; isCustomer: boolean;
  isSubcontractor: boolean; isSupplier: boolean; openingBalance: string;
  openingAsOf: string | null };
type ExportPayment = { id: string; partyId: string; direction: 'in' | 'out';
  paidOn: string; amount: string; mode: string; reference: string | null;
  narration: string | null; notes: string | null };
type ExportBook = { bills: ExportBill[]; parties: ExportParty[]; payments: ExportPayment[] };

const book = JSON.parse(
  readFileSync(join(import.meta.dirname, '__fixtures__', 'luma-book-2026-07-31.json'), 'utf8'),
) as ExportBook;

const sum = (values: string[]) =>
  values.reduce((total, value) => total.add(Money.fromDecimal(value)), Money.ZERO);

describe('the July bill book export itself', () => {
  it('holds 113 bills and two receipts', () => {
    expect(book.bills).toHaveLength(113);
    expect(book.payments).toHaveLength(2);
  });

  it('has every bill adding up from its lines to the poisha', () => {
    for (const bill of book.bills) {
      expect(sum(bill.lines.map((l) => l.amount)).toString(), bill.docNo).toBe(
        Money.fromDecimal(bill.total).toString(),
      );
    }
  });
});

const CONNECTION = process.env.INTERIM_TEST_DATABASE_URL;
const SCHEMA = 'golden_book_test';
let driver: PgDriver;

vi.mock('./db', () => ({ db: () => driver }));

describe.skipIf(!CONNECTION)('the real bill book through the statement', () => {
  beforeAll(async () => {
    const admin = createPgDriver(CONNECTION!, 'public');
    await admin.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`);
    await admin.query(`CREATE SCHEMA ${SCHEMA}`);
    await admin.end();

    driver = createPgDriver(CONNECTION!, SCHEMA);
    const schemaSql = readFileSync(join(import.meta.dirname, '..', '..', 'db', 'schema.sql'), 'utf8');
    for (const statement of splitSqlStatements(schemaSql)) await driver.query(statement);

    for (const p of book.parties) {
      await driver.query(
        `INSERT INTO party (id, code, name, is_customer, is_subcontractor, is_supplier,
           opening_balance, opening_as_of)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [p.id, p.code, p.name, p.isCustomer, p.isSubcontractor, p.isSupplier,
         p.openingBalance, p.openingAsOf],
      );
    }
    // Bills and receipts are recorded in export order, so the one tie breaker
    // that is not in the data, when a row was recorded, is stable run to run.
    for (const b of book.bills) {
      await driver.query(
        `INSERT INTO bill (id, party_id, direction, party_role, status, doc_no, bill_no,
           bill_date, narration, notes, total)
         VALUES ($1, $2, $3, 'customer', 'posted', $4, $5, $6, $7, $8, $9)`,
        [b.id, b.partyId, b.direction, b.docNo, b.billNo, b.billDate, b.narration, b.notes, b.total],
      );
      for (const l of b.lines) {
        await driver.query(
          `INSERT INTO bill_line (bill_id, line_no, description, color, challan_no, order_no,
             grey_kg, finished_kg, rate, amount)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
          [b.id, l.lineNo, l.fabricType ?? l.description, l.color, l.challanNo, l.orderNo,
           l.greyKg, l.finishedKg, l.rate, l.amount],
        );
      }
    }
    for (const y of book.payments) {
      await driver.query(
        `INSERT INTO payment (id, party_id, direction, party_role, paid_on, amount, mode,
           reference, narration, notes)
         VALUES ($1, $2, $3, 'customer', $4, $5, $6, $7, $8, $9)`,
        [y.id, y.partyId, y.direction, y.paidOn, y.amount, y.mode, y.reference, y.narration, y.notes],
      );
    }
  }, 120_000);

  afterAll(async () => {
    await driver.end();
    const admin = createPgDriver(CONNECTION!, 'public');
    await admin.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`);
    await admin.end();
  });

  async function statementFor(partyId: string) {
    const { getParty, listMovements } = await import('./queries');
    const { buildStatement } = await import('./statement');
    const party = await getParty(partyId);
    return buildStatement({ openingBalance: party!.openingBalance, movements: await listMovements(partyId) });
  }

  it('closes every party at opening plus bills less receipts', async () => {
    for (const party of book.parties) {
      const bills = book.bills.filter((b) => b.partyId === party.id);
      const receipts = book.payments.filter((y) => y.partyId === party.id);
      const expected = Money.fromDecimal(party.openingBalance)
        .add(sum(bills.map((b) => b.total)))
        .subtract(sum(receipts.map((y) => y.amount)));

      const statement = await statementFor(party.id);
      expect(statement.closing.toString(), party.code).toBe(expected.toString());
      expect(statement.totalBilled.toString(), party.code).toBe(sum(bills.map((b) => b.total)).toString());
      expect(statement.rows, party.code).toHaveLength(bills.length + receipts.length);
    }
  });

  it('reproduces every statement row and running balance', async () => {
    const statements: Record<string, unknown> = {};
    for (const party of book.parties) {
      const statement = await statementFor(party.id);
      statements[party.code] = {
        opening: statement.opening.toString(),
        closing: statement.closing.toString(),
        rows: statement.rows.map((r) =>
          [r.date, r.kind, r.reference, r.particulars, r.debit?.toString() ?? '',
           r.credit?.toString() ?? '', r.balance.toString()].join(' | '),
        ),
      };
    }
    await expect(JSON.stringify(statements, null, 2)).toMatchFileSnapshot(
      './__fixtures__/luma-book-2026-07-31.statements.json',
    );
  });
});
