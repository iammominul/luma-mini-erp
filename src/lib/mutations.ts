import { randomUUID } from 'node:crypto';
import { Money } from './money';
import { formatTaka } from './format';
import { lineAmount, sumMoney } from './amount';
import { db } from './db';
import { formatDate } from './dates';
import {
  billNoExists,
  getBill,
  getParty,
  getPayment,
  partyNameExists,
} from './queries';
import type {
  BillFormInput,
  PartyFormInput,
  PaymentFormInput,
} from './schemas';
import { billLabel, paymentModeLabel, settlementLabel } from './types';

/**
 * Every write in the app, and the only place the activity log is written.
 *
 * Each write is one transaction: the rows and their log entry land together or
 * not at all. A bill total is always computed here from the line inputs, never
 * accepted from the browser.
 */

/** A message that is safe and useful to show the person filling the form. */
export class InputError extends Error {}

const tk = (decimal: string) => formatTaka(Money.fromDecimal(decimal));

function asJson(value: unknown): string | null {
  return value === null || value === undefined ? null : JSON.stringify(value);
}

async function partySnapshot(id: string): Promise<unknown> {
  const sql = db();
  const rows = (await sql`
    SELECT to_jsonb(p) AS snapshot FROM party p WHERE p.id = ${id}::uuid
  `) as { snapshot: unknown }[];
  return rows[0]?.snapshot ?? null;
}

async function paymentSnapshot(id: string): Promise<unknown> {
  const sql = db();
  const rows = (await sql`
    SELECT to_jsonb(p) AS snapshot FROM payment p WHERE p.id = ${id}::uuid
  `) as { snapshot: unknown }[];
  return rows[0]?.snapshot ?? null;
}

/** A bill and its lines as one JSON object, for the before and after columns. */
async function billSnapshot(id: string): Promise<unknown> {
  const sql = db();
  const rows = (await sql`
    SELECT to_jsonb(b) || jsonb_build_object('lines', (
      SELECT COALESCE(jsonb_agg(to_jsonb(l) ORDER BY l.line_no), '[]'::jsonb)
      FROM bill_line l WHERE l.bill_id = b.id)) AS snapshot
    FROM bill b WHERE b.id = ${id}::uuid
  `) as { snapshot: unknown }[];
  return rows[0]?.snapshot ?? null;
}

// Parties ---------------------------------------------------------------------

export async function createParty(input: PartyFormInput): Promise<string> {
  if (await partyNameExists(input.name, input.type)) {
    throw new InputError(
      `${input.name} is already on the ${input.type} list. Open that party instead.`,
    );
  }

  const sql = db();
  const id = randomUUID();
  await sql.transaction([
    sql`
      INSERT INTO party (id, name, type, contact_person, phone, address,
        opening_balance, opening_as_of)
      VALUES (${id}::uuid, ${input.name}::text, ${input.type}::text,
        ${input.contactPerson}, ${input.phone}, ${input.address},
        ${input.openingBalance}::numeric, ${input.openingAsOf}::date)
    `,
    sql`
      INSERT INTO activity_log (action, entity, entity_id, summary, after_json)
      SELECT 'create', 'party', p.id::text,
        ${`Added ${input.type} ${input.name}`}::text, to_jsonb(p)
      FROM party p WHERE p.id = ${id}::uuid
    `,
  ]);
  return id;
}

export async function updateParty(
  id: string,
  input: PartyFormInput,
): Promise<void> {
  const before = await getParty(id);
  if (!before) throw new InputError('That party no longer exists.');
  // Same rule as the real ERP: a customer never becomes a subcontractor.
  if (before.type !== input.type) {
    throw new InputError('A party type cannot be changed.');
  }
  if (await partyNameExists(input.name, input.type, id)) {
    throw new InputError(
      `Another ${input.type} is already named ${input.name}.`,
    );
  }

  const snapshot = await partySnapshot(id);
  const sql = db();
  await sql.transaction([
    sql`
      UPDATE party SET name = ${input.name}::text,
        contact_person = ${input.contactPerson},
        phone = ${input.phone}, address = ${input.address},
        opening_balance = ${input.openingBalance}::numeric,
        opening_as_of = ${input.openingAsOf}::date,
        updated_at = now()
      WHERE id = ${id}::uuid
    `,
    sql`
      INSERT INTO activity_log (action, entity, entity_id, summary,
        before_json, after_json)
      SELECT 'update', 'party', p.id::text, ${`Edited ${input.name}`}::text,
        ${asJson(snapshot)}::jsonb, to_jsonb(p)
      FROM party p WHERE p.id = ${id}::uuid
    `,
  ]);
}

/** Parties are deactivated, never deleted: their bills and receipts stay. */
export async function setPartyActive(
  id: string,
  active: boolean,
): Promise<void> {
  const party = await getParty(id);
  if (!party) throw new InputError('That party no longer exists.');

  const sql = db();
  await sql.transaction([
    sql`
      UPDATE party SET active = ${active}::boolean, updated_at = now()
      WHERE id = ${id}::uuid
    `,
    sql`
      INSERT INTO activity_log (action, entity, entity_id, summary)
      VALUES ('update', 'party', ${id}::text,
        ${`${active ? 'Reactivated' : 'Deactivated'} ${party.name}`}::text)
    `,
  ]);
}

// Bills -----------------------------------------------------------------------

type PreparedLine = {
  lineNo: number;
  description: string;
  qtyKg: string;
  rate: string;
  amount: string;
};

function prepare(input: BillFormInput): {
  lines: PreparedLine[];
  total: string;
} {
  const amounts = input.lines.map((line) => lineAmount(line.qtyKg, line.rate));
  const lines = input.lines.map((line, index) => ({
    lineNo: index + 1,
    description: line.description,
    qtyKg: line.qtyKg,
    rate: line.rate,
    amount: amounts[index]!.toDecimalString(),
  }));
  return { lines, total: sumMoney(amounts).toDecimalString() };
}

export async function createBill(input: BillFormInput): Promise<string> {
  const party = await getParty(input.partyId);
  if (!party) throw new InputError('Select a party for this bill.');

  const isCustomer = party.type === 'customer';
  if (!isCustomer) {
    if (!input.billNo) {
      throw new InputError("Enter the subcontractor's bill number.");
    }
    if (await billNoExists(party.id, input.billNo)) {
      throw new InputError(
        `Bill ${input.billNo} is already recorded against ${party.name}.`,
      );
    }
  }

  const { lines, total } = prepare(input);
  const id = randomUUID();
  const sql = db();

  // A customer bill is system-numbered. The counter is bumped inside this same
  // transaction, so the series cannot skip a number or issue one twice.
  const insertBill = isCustomer
    ? sql`
        WITH bumped AS (
          UPDATE counter SET value = value + 1 WHERE name = 'customer_bill'
          RETURNING value
        )
        INSERT INTO bill (id, party_id, bill_no, bill_date, reference, notes, total)
        SELECT ${id}::uuid, ${party.id}::uuid,
          'CB-' || to_char(${input.billDate}::date, 'YY') || '-' ||
            lpad(bumped.value::text, 4, '0'),
          ${input.billDate}::date, ${input.reference}, ${input.notes},
          ${total}::numeric
        FROM bumped
      `
    : sql`
        INSERT INTO bill (id, party_id, bill_no, bill_date, reference, notes, total)
        VALUES (${id}::uuid, ${party.id}::uuid, ${input.billNo}::text,
          ${input.billDate}::date, ${input.reference}, ${input.notes},
          ${total}::numeric)
      `;

  await sql.transaction([
    insertBill,
    ...lines.map(
      (line) => sql`
        INSERT INTO bill_line (bill_id, line_no, description, qty_kg, rate, amount)
        VALUES (${id}::uuid, ${line.lineNo}::int, ${line.description}::text,
          ${line.qtyKg}::numeric, ${line.rate}::numeric, ${line.amount}::numeric)
      `,
    ),
    sql`
      INSERT INTO activity_log (action, entity, entity_id, summary, reason, after_json)
      SELECT 'create', 'bill', b.id::text,
        ${`${billLabel(party.type)} `}::text || b.bill_no ||
          ${` for ${party.name}, Tk ${tk(total)} dated ${formatDate(input.billDate)}`}::text,
        ${input.reason},
        to_jsonb(b) || jsonb_build_object('lines', (
          SELECT COALESCE(jsonb_agg(to_jsonb(l) ORDER BY l.line_no), '[]'::jsonb)
          FROM bill_line l WHERE l.bill_id = b.id))
      FROM bill b WHERE b.id = ${id}::uuid
    `,
  ]);

  return id;
}

export async function updateBill(
  id: string,
  input: BillFormInput,
): Promise<void> {
  const existing = await getBill(id);
  if (!existing) throw new InputError('That bill no longer exists.');
  if (existing.partyId !== input.partyId) {
    throw new InputError(
      'A bill cannot be moved to another party. Remove it and enter a new one.',
    );
  }

  const isCustomer = existing.partyType === 'customer';
  if (!isCustomer) {
    if (!input.billNo) {
      throw new InputError("Enter the subcontractor's bill number.");
    }
    if (await billNoExists(input.partyId, input.billNo, id)) {
      throw new InputError(
        `Bill ${input.billNo} is already recorded against ${existing.partyName}.`,
      );
    }
  }

  const snapshot = await billSnapshot(id);
  const { lines, total } = prepare(input);
  const sql = db();

  await sql.transaction([
    sql`
      UPDATE bill SET
        bill_no = ${isCustomer ? existing.billNo : input.billNo}::text,
        bill_date = ${input.billDate}::date,
        reference = ${input.reference}, notes = ${input.notes},
        total = ${total}::numeric, updated_at = now()
      WHERE id = ${id}::uuid
    `,
    sql`DELETE FROM bill_line WHERE bill_id = ${id}::uuid`,
    ...lines.map(
      (line) => sql`
        INSERT INTO bill_line (bill_id, line_no, description, qty_kg, rate, amount)
        VALUES (${id}::uuid, ${line.lineNo}::int, ${line.description}::text,
          ${line.qtyKg}::numeric, ${line.rate}::numeric, ${line.amount}::numeric)
      `,
    ),
    sql`
      INSERT INTO activity_log (action, entity, entity_id, summary, reason,
        before_json, after_json)
      SELECT 'update', 'bill', b.id::text,
        ${`Edited ${billLabel(existing.partyType)} `}::text || b.bill_no ||
          ${` for ${existing.partyName}, now Tk ${tk(total)}`}::text,
        ${input.reason}, ${asJson(snapshot)}::jsonb,
        to_jsonb(b) || jsonb_build_object('lines', (
          SELECT COALESCE(jsonb_agg(to_jsonb(l) ORDER BY l.line_no), '[]'::jsonb)
          FROM bill_line l WHERE l.bill_id = b.id))
      FROM bill b WHERE b.id = ${id}::uuid
    `,
  ]);
}

export async function deleteBill(id: string, reason: string): Promise<void> {
  const existing = await getBill(id);
  if (!existing) throw new InputError('That bill no longer exists.');
  const snapshot = await billSnapshot(id);

  const sql = db();
  await sql.transaction([
    sql`
      INSERT INTO activity_log (action, entity, entity_id, summary, reason, before_json)
      VALUES ('delete', 'bill', ${id}::text,
        ${`Removed ${billLabel(existing.partyType)} ${existing.billNo} for ${existing.partyName}, Tk ${formatTaka(existing.total)}`}::text,
        ${reason}::text, ${asJson(snapshot)}::jsonb)
    `,
    sql`DELETE FROM bill WHERE id = ${id}::uuid`,
  ]);
}

// Receipts and payments -------------------------------------------------------

export async function createPayment(input: PaymentFormInput): Promise<string> {
  const party = await getParty(input.partyId);
  if (!party) throw new InputError('Select a party for this entry.');

  const sql = db();
  const id = randomUUID();
  const direction = party.type === 'customer' ? 'from' : 'to';
  const summary =
    `${settlementLabel(party.type)} of Tk ${tk(input.amount)} ${direction} ` +
    `${party.name} by ${paymentModeLabel(input.mode)} on ${formatDate(input.paidOn)}`;

  await sql.transaction([
    sql`
      INSERT INTO payment (id, party_id, paid_on, amount, mode, reference, notes)
      VALUES (${id}::uuid, ${party.id}::uuid, ${input.paidOn}::date,
        ${input.amount}::numeric, ${input.mode}::text, ${input.reference},
        ${input.notes})
    `,
    sql`
      INSERT INTO activity_log (action, entity, entity_id, summary, reason, after_json)
      SELECT 'create', 'payment', p.id::text, ${summary}::text, ${input.reason},
        to_jsonb(p)
      FROM payment p WHERE p.id = ${id}::uuid
    `,
  ]);
  return id;
}

export async function updatePayment(
  id: string,
  input: PaymentFormInput,
): Promise<void> {
  const existing = await getPayment(id);
  if (!existing) throw new InputError('That entry no longer exists.');
  if (existing.partyId !== input.partyId) {
    throw new InputError(
      'An entry cannot be moved to another party. Remove it and enter a new one.',
    );
  }

  const snapshot = await paymentSnapshot(id);
  const word = settlementLabel(existing.partyType).toLowerCase();
  const sql = db();

  await sql.transaction([
    sql`
      UPDATE payment SET paid_on = ${input.paidOn}::date,
        amount = ${input.amount}::numeric, mode = ${input.mode}::text,
        reference = ${input.reference}, notes = ${input.notes}, updated_at = now()
      WHERE id = ${id}::uuid
    `,
    sql`
      INSERT INTO activity_log (action, entity, entity_id, summary, reason,
        before_json, after_json)
      SELECT 'update', 'payment', p.id::text,
        ${`Edited ${word} for ${existing.partyName}, now Tk ${tk(input.amount)}`}::text,
        ${input.reason}, ${asJson(snapshot)}::jsonb, to_jsonb(p)
      FROM payment p WHERE p.id = ${id}::uuid
    `,
  ]);
}

export async function deletePayment(id: string, reason: string): Promise<void> {
  const existing = await getPayment(id);
  if (!existing) throw new InputError('That entry no longer exists.');
  const word = settlementLabel(existing.partyType).toLowerCase();

  const sql = db();
  await sql.transaction([
    sql`
      INSERT INTO activity_log (action, entity, entity_id, summary, reason, before_json)
      SELECT 'delete', 'payment', p.id::text,
        ${`Removed ${word} of Tk ${formatTaka(existing.amount)} for ${existing.partyName}`}::text,
        ${reason}::text, to_jsonb(p)
      FROM payment p WHERE p.id = ${id}::uuid
    `,
    sql`DELETE FROM payment WHERE id = ${id}::uuid`,
  ]);
}
