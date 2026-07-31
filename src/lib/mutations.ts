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
import type { BillDirection } from './types';
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
  if (await partyNameExists(input.name)) {
    throw new InputError(
      `${input.name} is already on the party list. Open that party and add the role instead.`,
    );
  }

  const sql = db();
  const id = randomUUID();
  // The code is the party's human-readable key. A typed one is taken as given;
  // otherwise the counter for that side issues the next, inside this same
  // transaction so two people adding parties at once cannot collide.
  // The code is issued from the counter for the party's primary role, which is
  // the first one it holds. A party that is a customer first stays CUS even if
  // it later starts supplying us: a code that changes is not a key.
  const isCustomer = input.roles.includes('customer');
  const counterName = isCustomer ? 'party_customer' : 'party_subcontractor';
  const prefix = isCustomer ? 'CUS-' : 'SUB-';

  await sql.transaction([
    sql`
      WITH bumped AS (
        UPDATE counter SET value = value + 1 WHERE name = ${counterName}::text
        RETURNING value
      )
      INSERT INTO party (id, code, name, is_customer, is_subcontractor,
        is_supplier, contact_person, phone, address,
        opening_balance, opening_as_of)
      SELECT ${id}::uuid,
        COALESCE(${input.code}::text,
          ${prefix}::text || lpad(bumped.value::text,
            GREATEST(4, length(bumped.value::text)), '0')),
        ${input.name}::text,
        ${input.roles.includes('customer')}::boolean,
        ${input.roles.includes('subcontractor')}::boolean,
        ${input.roles.includes('supplier')}::boolean,
        ${input.contactPerson}, ${input.phone}, ${input.address},
        ${input.openingBalance}::numeric, ${input.openingAsOf}::date
      FROM bumped
    `,
    sql`
      INSERT INTO activity_log (action, entity, entity_id, summary, after_json)
      SELECT 'create', 'party', p.id::text,
        ${`Added ${input.roles.join(' and ')} ${input.name}`}::text, to_jsonb(p)
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
  if (await partyNameExists(input.name, id)) {
    throw new InputError(`Another party is already named ${input.name}.`);
  }
  // A role can be added, and that is the point of roles. Taking one away while
  // documents were raised under it would orphan them, so it is refused.
  for (const role of ['customer', 'subcontractor', 'supplier'] as const) {
    if (before.roles[role] && !input.roles.includes(role)) {
      throw new InputError(
        `${before.name} has been traded with as a ${role}, so that role cannot be removed.`,
      );
    }
  }

  const snapshot = await partySnapshot(id);
  const sql = db();
  await sql.transaction([
    sql`
      UPDATE party SET name = ${input.name}::text,
        code = COALESCE(${input.code}::text, code),
        is_customer = ${input.roles.includes('customer')}::boolean,
        is_subcontractor = ${input.roles.includes('subcontractor')}::boolean,
        is_supplier = ${input.roles.includes('supplier')}::boolean,
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
  fabricType: string | null;
  color: string | null;
  challanNo: string | null;
  orderNo: string | null;
  greyKg: string;
  finishedKg: string | null;
  rate: string;
  amount: string;
};

/**
 * Line amounts and the bill total, computed here from the weights and rates
 * posted. The amount is rate times the grey weight, the basis the full ERP bills
 * on, and the total is never taken from the browser.
 */
function prepare(input: BillFormInput): {
  lines: PreparedLine[];
  total: string;
} {
  const amounts = input.lines.map((line) => lineAmount(line.greyKg, line.rate));
  const lines = input.lines.map((line, index) => ({
    lineNo: index + 1,
    description: line.description,
    fabricType: line.fabricType,
    color: line.color,
    challanNo: line.challanNo,
    orderNo: line.orderNo,
    greyKg: line.greyKg,
    finishedKg: line.finishedKg,
    rate: line.rate,
    amount: amounts[index]!.toDecimalString(),
  }));
  return { lines, total: sumMoney(amounts).toDecimalString() };
}

/** The message shown when a bill number is already in the book. */
async function assertBillNoFree(
  input: BillFormInput,
  party: { id: string; name: string },
  direction: BillDirection,
  excludeId?: string,
): Promise<void> {
  const { taken, partyName } = await billNoExists({
    partyId: party.id,
    direction,
    billNo: input.billNo,
    bookNo: input.bookNo,
    excludeId,
  });
  if (!taken) return;

  if (direction === 'issued') {
    const book = input.bookNo ? ` of book ${input.bookNo}` : '';
    throw new InputError(
      `Bill ${input.billNo}${book} is already recorded against ${partyName}. Check the bill book.`,
    );
  }
  throw new InputError(
    `Bill ${input.billNo} is already recorded against ${party.name}.`,
  );
}

export async function createBill(input: BillFormInput): Promise<string> {
  const party = await getParty(input.partyId);
  if (!party) throw new InputError('Select a party for this bill.');

  // Only a posted customer bill takes a number. A draft that is abandoned must
  // not leave a hole in the series, so the counter is not touched until posting.
  const isCustomer = input.direction === 'issued' && input.status === 'posted';
  await assertBillNoFree(input, party, input.direction);

  const { lines, total } = prepare(input);
  const id = randomUUID();
  const sql = db();

  // The hand-written number is what the party is shown. Alongside it a customer
  // bill takes the system's own number, from the counter bumped inside this same
  // transaction, so that series cannot skip a number or issue one twice.
  const insertBill = isCustomer
    ? sql`
        WITH bumped AS (
          UPDATE counter SET value = value + 1 WHERE name = 'customer_bill'
          RETURNING value
        )
        INSERT INTO bill (id, party_id, direction, status, bill_no, book_no,
          doc_no, bill_date, nature_of_work, reference, narration, notes, total)
        SELECT ${id}::uuid, ${party.id}::uuid, 'issued'::text, 'posted'::text,
          ${input.billNo}::text, ${input.bookNo},
          'CB-' || to_char(${input.billDate}::date, 'YY') || '-' ||
            lpad(bumped.value::text,
              GREATEST(4, length(bumped.value::text)), '0'),
          ${input.billDate}::date, ${input.natureOfWork}::text,
          ${input.reference}, ${input.narration},
          ${input.notes}, ${total}::numeric
        FROM bumped
      `
    : sql`
        INSERT INTO bill (id, party_id, direction, status, bill_no, book_no,
          doc_no, bill_date, nature_of_work, reference, narration, notes, total)
        VALUES (${id}::uuid, ${party.id}::uuid, ${input.direction}::text,
          ${input.status}::text, ${input.billNo}::text,
          ${input.bookNo}, NULL, ${input.billDate}::date,
          ${input.natureOfWork}::text, ${input.reference},
          ${input.narration}, ${input.notes}, ${total}::numeric)
      `;

  await sql.transaction([
    insertBill,
    ...lines.map(
      (line) => sql`
        INSERT INTO bill_line (bill_id, line_no, description, fabric_type,
          color, challan_no, order_no, grey_kg, finished_kg, rate, amount)
        VALUES (${id}::uuid, ${line.lineNo}::int, ${line.description}::text,
          ${line.fabricType}, ${line.color}, ${line.challanNo}, ${line.orderNo},
          ${line.greyKg}::numeric, ${line.finishedKg}::numeric,
          ${line.rate}::numeric, ${line.amount}::numeric)
      `,
    ),
    sql`
      INSERT INTO activity_log (action, entity, entity_id, summary, reason, after_json)
      SELECT 'create', 'bill', b.id::text,
        ${`${input.status === 'draft' ? 'Draft ' : ''}${billLabel(input.direction)} `}::text || b.bill_no ||
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

  await assertBillNoFree(
    input,
    { id: existing.partyId, name: existing.partyName },
    existing.direction,
    id,
  );

  const snapshot = await billSnapshot(id);
  const { lines, total } = prepare(input);
  const sql = db();

  // doc_no is never rewritten: the system's series stays as issued, even when the
  // hand-written number on the paper bill is corrected.
  await sql.transaction([
    sql`
      UPDATE bill SET
        bill_no = ${input.billNo}::text,
        book_no = ${input.bookNo},
        bill_date = ${input.billDate}::date,
        nature_of_work = ${input.natureOfWork}::text,
        reference = ${input.reference}, narration = ${input.narration},
        notes = ${input.notes},
        total = ${total}::numeric, updated_at = now()
      WHERE id = ${id}::uuid
    `,
    sql`DELETE FROM bill_line WHERE bill_id = ${id}::uuid`,
    ...lines.map(
      (line) => sql`
        INSERT INTO bill_line (bill_id, line_no, description, fabric_type,
          color, challan_no, order_no, grey_kg, finished_kg, rate, amount)
        VALUES (${id}::uuid, ${line.lineNo}::int, ${line.description}::text,
          ${line.fabricType}, ${line.color}, ${line.challanNo}, ${line.orderNo},
          ${line.greyKg}::numeric, ${line.finishedKg}::numeric,
          ${line.rate}::numeric, ${line.amount}::numeric)
      `,
    ),
    sql`
      INSERT INTO activity_log (action, entity, entity_id, summary, reason,
        before_json, after_json)
      SELECT 'update', 'bill', b.id::text,
        ${`Edited ${billLabel(existing.direction)} `}::text || b.bill_no ||
          ${` for ${existing.partyName}, now Tk ${tk(total)}`}::text,
        ${input.reason}, ${asJson(snapshot)}::jsonb,
        to_jsonb(b) || jsonb_build_object('lines', (
          SELECT COALESCE(jsonb_agg(to_jsonb(l) ORDER BY l.line_no), '[]'::jsonb)
          FROM bill_line l WHERE l.bill_id = b.id))
      FROM bill b WHERE b.id = ${id}::uuid
    `,
  ]);
}

/**
 * Post a draft into the book. This is the moment the bill becomes real: it
 * starts counting towards the balance, appears on the statement, and takes the
 * next number in the gapless series. The counter is bumped inside this same
 * transaction, so two people posting at once queue on the row lock.
 */
export async function postBill(id: string): Promise<void> {
  const existing = await getBill(id);
  if (!existing) throw new InputError('That bill no longer exists.');
  if (existing.status !== 'draft') {
    throw new InputError(`Bill ${existing.billNo} is already posted.`);
  }

  const snapshot = await billSnapshot(id);
  const sql = db();
  const isCustomer = existing.direction === 'issued';

  await sql.transaction([
    isCustomer
      ? sql`
          WITH bumped AS (
            UPDATE counter SET value = value + 1 WHERE name = 'customer_bill'
            RETURNING value
          )
          UPDATE bill SET status = 'posted', updated_at = now(),
            doc_no = 'CB-' || to_char(bill_date, 'YY') || '-' ||
              lpad(bumped.value::text,
                GREATEST(4, length(bumped.value::text)), '0')
          FROM bumped WHERE bill.id = ${id}::uuid
        `
      : sql`
          UPDATE bill SET status = 'posted', updated_at = now()
          WHERE id = ${id}::uuid
        `,
    sql`
      INSERT INTO activity_log (action, entity, entity_id, summary,
        before_json, after_json)
      SELECT 'update', 'bill', b.id::text,
        ${`Posted ${billLabel(existing.direction)} `}::text || b.bill_no ||
          ${` for ${existing.partyName}, Tk ${formatTaka(existing.total)}`}::text,
        ${asJson(snapshot)}::jsonb,
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
        ${`Removed ${billLabel(existing.direction)} ${existing.billNo} for ${existing.partyName}, Tk ${formatTaka(existing.total)}`}::text,
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
  const towards = input.direction === 'in' ? 'from' : 'to';
  const summary =
    `${settlementLabel(input.direction)} of Tk ${tk(input.amount)} ${towards} ` +
    `${party.name} by ${paymentModeLabel(input.mode)} on ${formatDate(input.paidOn)}`;

  await sql.transaction([
    sql`
      INSERT INTO payment (id, party_id, direction, paid_on, amount, mode,
        reference, narration, notes)
      VALUES (${id}::uuid, ${party.id}::uuid, ${input.direction}::text,
        ${input.paidOn}::date,
        ${input.amount}::numeric, ${input.mode}::text, ${input.reference},
        ${input.narration}, ${input.notes})
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
  const word = settlementLabel(existing.direction).toLowerCase();
  const sql = db();

  await sql.transaction([
    sql`
      UPDATE payment SET paid_on = ${input.paidOn}::date,
        amount = ${input.amount}::numeric, mode = ${input.mode}::text,
        reference = ${input.reference}, narration = ${input.narration},
        notes = ${input.notes}, updated_at = now()
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
  const word = settlementLabel(existing.direction).toLowerCase();

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
