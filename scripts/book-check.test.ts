import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createPgDriver, type PgDriver } from '../src/lib/pg-driver';
import {
  allowedFromEnv,
  compareBooks,
  describeChanges,
  fingerprintBook,
  type Fingerprint,
} from './book-check.mjs';
import { splitSqlStatements } from './split-sql.mjs';

/**
 * The book check is what stands between a migration and the live book, so the
 * cases that matter are the ones where it must fail: a figure moved, a column
 * the book reads dropped, a counter wound back. And the one where it must not:
 * the schema applied again over a real book with nothing changed.
 */

function book(figures: Record<string, string>): Fingerprint {
  return { shape: {}, figures };
}

describe('compareBooks', () => {
  const before = book({ 'bill total': '100.00', 'bill hash': 'a', 'counter customer_bill': '7' });

  it('finds nothing when every figure read before reads the same after', () => {
    expect(compareBooks(before, book({ ...before.figures }))).toEqual([]);
  });

  it('ignores a figure that first appears after, which is an addition', () => {
    const after = book({ ...before.figures, 'counter movement': '0', 'movement rows': '0' });
    expect(compareBooks(before, after)).toEqual([]);
  });

  it('names a figure that moved, with both values', () => {
    const after = book({ ...before.figures, 'bill total': '101.00' });
    expect(compareBooks(before, after)).toEqual([
      { name: 'bill total', before: '100.00', after: '101.00' },
    ]);
  });

  it('lets a counter catch up forward, which protects the series', () => {
    const after = book({ ...before.figures, 'counter customer_bill': '9' });
    expect(compareBooks(before, after)).toEqual([]);
  });

  it('names a figure that can no longer be read as missing', () => {
    const { 'counter customer_bill': _gone, ...rest } = before.figures;
    expect(compareBooks(before, book(rest))).toEqual([
      { name: 'counter customer_bill', before: '7', after: 'missing' },
    ]);
  });

  it('lets an allowed table move all three of its figures and holds the rest', () => {
    const after = book({ 'bill total': '1.00', 'bill hash': 'b', 'counter customer_bill': '6' });
    expect(compareBooks(before, after, ['bill']).map((c) => c.name)).toEqual([
      'counter customer_bill',
    ]);
  });

  it('does not let an allowed name reach a longer table name', () => {
    const lines = book({ 'bill_line total': '5.00' });
    expect(compareBooks(lines, book({ 'bill_line total': '6.00' }), ['bill'])).toHaveLength(1);
  });

  it('reads BOOK_CHECK_ALLOW as a comma separated list', () => {
    expect(allowedFromEnv(' bill_line , counter customer_bill,')).toEqual([
      'bill_line',
      'counter customer_bill',
    ]);
    expect(allowedFromEnv(undefined)).toEqual([]);
  });

  it('tells a person what moved and what to do about it', () => {
    const text = describeChanges([{ name: 'balance CUS-0001', before: '10.00', after: '12.00' }]);
    expect(text).toContain('balance CUS-0001: 10.00 -> 12.00');
    expect(text).toContain('BOOK_CHECK_ALLOW');
  });
});

const CONNECTION = process.env.INTERIM_TEST_DATABASE_URL;
const SCHEMA = 'book_check_test';

describe.skipIf(!CONNECTION)('the book check against a real Postgres', () => {
  let driver: PgDriver;
  const query = (text: string) => driver.query(text) as Promise<Record<string, unknown>[]>;
  const schemaSql = readFileSync(join(import.meta.dirname, '..', 'db', 'schema.sql'), 'utf8');

  async function applySchema() {
    for (const statement of splitSqlStatements(schemaSql)) await driver.query(statement);
  }

  beforeAll(async () => {
    const admin = createPgDriver(CONNECTION!, 'public');
    await admin.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`);
    await admin.query(`CREATE SCHEMA ${SCHEMA}`);
    await admin.end();
    driver = createPgDriver(CONNECTION!, SCHEMA);
    await applySchema();

    // A small real shaped book: a customer billed and paid, a dye house that
    // billed us, and the counters those documents took their numbers from.
    await driver.query(`
      INSERT INTO party (id, code, name, is_customer, is_subcontractor, opening_balance) VALUES
        ('00000000-0000-0000-0000-000000000001', 'CUS-0001', 'Symbiotic', true, false, 50000),
        ('00000000-0000-0000-0000-000000000002', 'SUB-0001', 'Rongdhonu Dyeing', false, true, -20000)`);
    await driver.query(`
      INSERT INTO bill (id, party_id, direction, party_role, status, doc_no, bill_date, total) VALUES
        ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-000000000001',
         'issued', 'customer', 'posted', 'CB-26-0001', '2026-07-05', 120000),
        ('00000000-0000-0000-0000-0000000000b2', '00000000-0000-0000-0000-000000000002',
         'received', 'subcontractor', 'posted', 'BR-26-0001', '2026-07-06', 80000),
        ('00000000-0000-0000-0000-0000000000b3', '00000000-0000-0000-0000-000000000001',
         'issued', 'customer', 'draft', NULL, '2026-07-07', 999)`);
    await driver.query(`
      INSERT INTO bill_line (bill_id, line_no, description, grey_kg, rate, amount) VALUES
        ('00000000-0000-0000-0000-0000000000b1', 1, 'Interlock 270 Navy', 1000, 120, 120000)`);
    await driver.query(`
      INSERT INTO payment (party_id, direction, party_role, doc_no, paid_on, amount, mode) VALUES
        ('00000000-0000-0000-0000-000000000001', 'in', 'customer', 'MR-26-0001', '2026-07-10', 100000, 'bank_transfer')`);
    await driver.query(`UPDATE counter SET value = 1 WHERE name IN ('customer_bill', 'money_receipt')`);
  }, 60_000);

  afterAll(async () => {
    await driver.end();
    const admin = createPgDriver(CONNECTION!, 'public');
    await admin.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`);
    await admin.end();
  });

  it('reads each party balance in the book sign convention, drafts left out', async () => {
    const { figures } = await fingerprintBook(query);
    // 50,000 opening + 120,000 billed - 100,000 received. The draft is not in it.
    expect(Number(figures['balance CUS-0001'])).toBe(70000);
    // -20,000 opening - 80,000 billed to us.
    expect(Number(figures['balance SUB-0001'])).toBe(-100000);
    expect(figures['counter customer_bill']).toBe('1');
  });

  it('finds nothing when the schema is applied again over the book', async () => {
    const before = await fingerprintBook(query);
    await applySchema();
    const after = await fingerprintBook(query, before.shape);
    expect(compareBooks(before, after)).toEqual([]);
  });

  it('catches a migration that moves an amount', async () => {
    const before = await fingerprintBook(query);
    await driver.query(`UPDATE bill_line SET amount = amount + 0.01`);
    const after = await fingerprintBook(query, before.shape);
    await driver.query(`UPDATE bill_line SET amount = amount - 0.01`);

    expect(compareBooks(before, after).map((c) => c.name)).toEqual([
      'bill_line total',
      'bill_line hash',
    ]);
  });

  it('catches a balance that moved through a change of direction', async () => {
    const before = await fingerprintBook(query);
    await driver.query(`UPDATE payment SET direction = 'out'`);
    const after = await fingerprintBook(query, before.shape);
    await driver.query(`UPDATE payment SET direction = 'in'`);

    const names = compareBooks(before, after).map((c) => c.name);
    expect(names).toContain('payment hash');
    expect(names).toContain('balance CUS-0001');
  });

  it('catches a counter wound back', async () => {
    const before = await fingerprintBook(query);
    await driver.query(`UPDATE counter SET value = 0 WHERE name = 'customer_bill'`);
    const after = await fingerprintBook(query, before.shape);
    await driver.query(`UPDATE counter SET value = 1 WHERE name = 'customer_bill'`);

    expect(compareBooks(before, after)).toEqual([
      { name: 'counter customer_bill', before: '1', after: '0' },
    ]);
  });

  it('catches a column the book reads being dropped', async () => {
    const before = await fingerprintBook(query);
    await driver.query(`ALTER TABLE expense DROP COLUMN mode`);
    const after = await fingerprintBook(query, before.shape);

    const changes = compareBooks(before, after);
    expect(changes.map((c) => c.name)).toEqual(['expense rows', 'expense total', 'expense hash']);
    expect(changes[2].after).toMatch(/^unreadable:/);
  });
});
