import { randomUUID } from 'node:crypto';
import { hashPassword, verifyPassword } from 'better-auth/crypto';
import { Money } from './money';
import { formatTaka } from './format';
import { lineAmount, sumMoney } from './amount';
import { db } from './db';
import { formatDate } from './dates';
import {
  PayrollError,
  absenceDeduction,
  leaveTypeLabel,
  netPay,
  plannedRecovery,
} from './payroll';
import {
  billNoExists,
  employeeNameExists,
  advancesForRecovery,
  findPayrollRun,
  getAdvance,
  getBill,
  getEmployee,
  getExpense,
  getExpenseClaim,
  getParty,
  getPayment,
  getUser,
  listEmployees,
  listPayrollLines,
  otherActiveOwners,
  partyNameExists,
  userEmailExists,
} from './queries';
import { roleLabel, type Role } from './permissions';
import type {
  AdvanceFormInput,
  BillFormInput,
  EmployeeFormInput,
  ExpenseClaimFormInput,
  ExpenseFormInput,
  LeaveFormInput,
  PartyFormInput,
  PaymentFormInput,
  PayrollLineFormInput,
  PayrollRunFormInput,
  UserFormInput,
} from './schemas';
import type { Actor, BillDirection } from './types';
import {
  billLabel,
  expenseCategoryLabel,
  paymentModeLabel,
  periodLabel,
  settlementLabel,
} from './types';

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

export async function createParty(
  input: PartyFormInput,
  actor: Actor,
): Promise<string> {
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
      INSERT INTO activity_log (actor_user_id, actor_name, action, entity, entity_id, summary, after_json)
      SELECT ${actor.id}::text, ${actor.name}::text, 'create', 'party', p.id::text,
        ${`Added ${input.roles.join(' and ')} ${input.name}`}::text, to_jsonb(p)
      FROM party p WHERE p.id = ${id}::uuid
    `,
  ]);
  return id;
}

export async function updateParty(
  id: string,
  input: PartyFormInput,
  actor: Actor,
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
      INSERT INTO activity_log (actor_user_id, actor_name, action, entity, entity_id, summary,
        before_json, after_json)
      SELECT ${actor.id}::text, ${actor.name}::text, 'update', 'party', p.id::text, ${`Edited ${input.name}`}::text,
        ${asJson(snapshot)}::jsonb, to_jsonb(p)
      FROM party p WHERE p.id = ${id}::uuid
    `,
  ]);
}

/** Parties are deactivated, never deleted: their bills and receipts stay. */
export async function setPartyActive(
  id: string,
  active: boolean,
  actor: Actor,
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
      INSERT INTO activity_log (actor_user_id, actor_name, action, entity, entity_id, summary)
      VALUES (${actor.id}::text, ${actor.name}::text, 'update', 'party', ${id}::text,
        ${`${active ? 'Reactivated' : 'Deactivated'} ${party.name}`}::text)
    `,
  ]);
}

// Bills -----------------------------------------------------------------------

type PreparedLine = {
  lineNo: number;
  description: string;
  color: string | null;
  challanNo: string | null;
  orderNo: string | null;
  lotNo: string | null;
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
    color: line.color,
    challanNo: line.challanNo,
    orderNo: line.orderNo,
    lotNo: line.lotNo,
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
    excludeId,
  });
  if (!taken) return;

  if (direction === 'issued') {
    throw new InputError(
      `Bill ${input.billNo} is already recorded against ${partyName}.`,
    );
  }
  throw new InputError(
    `Bill ${input.billNo} is already recorded against ${party.name}.`,
  );
}

export async function createBill(
  input: BillFormInput,
  actor: Actor,
): Promise<string> {
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
        INSERT INTO bill (id, party_id, direction, status, bill_no,
          doc_no, bill_date, nature_of_work, narration, notes, total)
        SELECT ${id}::uuid, ${party.id}::uuid, 'issued'::text, 'posted'::text,
          ${input.billNo}::text,
          'CB-' || to_char(${input.billDate}::date, 'YY') || '-' ||
            lpad(bumped.value::text,
              GREATEST(4, length(bumped.value::text)), '0'),
          ${input.billDate}::date, ${input.natureOfWork}::text,
          ${input.narration}, ${input.notes}, ${total}::numeric
        FROM bumped
      `
    : sql`
        INSERT INTO bill (id, party_id, direction, status, bill_no,
          doc_no, bill_date, nature_of_work, narration, notes, total)
        VALUES (${id}::uuid, ${party.id}::uuid, ${input.direction}::text,
          ${input.status}::text, ${input.billNo}::text,
          NULL, ${input.billDate}::date,
          ${input.natureOfWork}::text,
          ${input.narration}, ${input.notes}, ${total}::numeric)
      `;

  await sql.transaction([
    insertBill,
    ...lines.map(
      (line) => sql`
        INSERT INTO bill_line (bill_id, line_no, description,
          color, challan_no, order_no, lot_no, grey_kg, finished_kg, rate,
          amount)
        VALUES (${id}::uuid, ${line.lineNo}::int, ${line.description}::text,
          ${line.color}, ${line.challanNo}, ${line.orderNo},
          ${line.lotNo},
          ${line.greyKg}::numeric, ${line.finishedKg}::numeric,
          ${line.rate}::numeric, ${line.amount}::numeric)
      `,
    ),
    sql`
      INSERT INTO activity_log (actor_user_id, actor_name, action, entity, entity_id, summary, reason, after_json)
      SELECT ${actor.id}::text, ${actor.name}::text, 'create', 'bill', b.id::text,
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
  actor: Actor,
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
        bill_date = ${input.billDate}::date,
        nature_of_work = ${input.natureOfWork}::text,
        narration = ${input.narration},
        notes = ${input.notes},
        total = ${total}::numeric, updated_at = now()
      WHERE id = ${id}::uuid
    `,
    sql`DELETE FROM bill_line WHERE bill_id = ${id}::uuid`,
    ...lines.map(
      (line) => sql`
        INSERT INTO bill_line (bill_id, line_no, description,
          color, challan_no, order_no, lot_no, grey_kg, finished_kg, rate,
          amount)
        VALUES (${id}::uuid, ${line.lineNo}::int, ${line.description}::text,
          ${line.color}, ${line.challanNo}, ${line.orderNo},
          ${line.lotNo},
          ${line.greyKg}::numeric, ${line.finishedKg}::numeric,
          ${line.rate}::numeric, ${line.amount}::numeric)
      `,
    ),
    sql`
      INSERT INTO activity_log (actor_user_id, actor_name, action, entity, entity_id, summary, reason,
        before_json, after_json)
      SELECT ${actor.id}::text, ${actor.name}::text, 'update', 'bill', b.id::text,
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
export async function postBill(id: string, actor: Actor): Promise<void> {
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
      INSERT INTO activity_log (actor_user_id, actor_name, action, entity, entity_id, summary,
        before_json, after_json)
      SELECT ${actor.id}::text, ${actor.name}::text, 'update', 'bill', b.id::text,
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

export async function deleteBill(
  id: string,
  reason: string,
  actor: Actor,
): Promise<void> {
  const existing = await getBill(id);
  if (!existing) throw new InputError('That bill no longer exists.');
  const snapshot = await billSnapshot(id);

  const sql = db();
  await sql.transaction([
    sql`
      INSERT INTO activity_log (actor_user_id, actor_name, action, entity, entity_id, summary, reason, before_json)
      VALUES (${actor.id}::text, ${actor.name}::text, 'delete', 'bill', ${id}::text,
        ${`Removed ${billLabel(existing.direction)} ${existing.billNo} for ${existing.partyName}, Tk ${formatTaka(existing.total)}`}::text,
        ${reason}::text, ${asJson(snapshot)}::jsonb)
    `,
    sql`DELETE FROM bill WHERE id = ${id}::uuid`,
  ]);
}

// Receipts and payments -------------------------------------------------------

export async function createPayment(
  input: PaymentFormInput,
  actor: Actor,
): Promise<string> {
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
      INSERT INTO activity_log (actor_user_id, actor_name, action, entity, entity_id, summary, reason, after_json)
      SELECT ${actor.id}::text, ${actor.name}::text, 'create', 'payment', p.id::text, ${summary}::text, ${input.reason},
        to_jsonb(p)
      FROM payment p WHERE p.id = ${id}::uuid
    `,
  ]);
  return id;
}

export async function updatePayment(
  id: string,
  input: PaymentFormInput,
  actor: Actor,
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
      INSERT INTO activity_log (actor_user_id, actor_name, action, entity, entity_id, summary, reason,
        before_json, after_json)
      SELECT ${actor.id}::text, ${actor.name}::text, 'update', 'payment', p.id::text,
        ${`Edited ${word} for ${existing.partyName}, now Tk ${tk(input.amount)}`}::text,
        ${input.reason}, ${asJson(snapshot)}::jsonb, to_jsonb(p)
      FROM payment p WHERE p.id = ${id}::uuid
    `,
  ]);
}

export async function deletePayment(
  id: string,
  reason: string,
  actor: Actor,
): Promise<void> {
  const existing = await getPayment(id);
  if (!existing) throw new InputError('That entry no longer exists.');
  const word = settlementLabel(existing.direction).toLowerCase();

  const sql = db();
  await sql.transaction([
    sql`
      INSERT INTO activity_log (actor_user_id, actor_name, action, entity, entity_id, summary, reason, before_json)
      SELECT ${actor.id}::text, ${actor.name}::text, 'delete', 'payment', p.id::text,
        ${`Removed ${word} of Tk ${formatTaka(existing.amount)} for ${existing.partyName}`}::text,
        ${reason}::text, to_jsonb(p)
      FROM payment p WHERE p.id = ${id}::uuid
    `,
    sql`DELETE FROM payment WHERE id = ${id}::uuid`,
  ]);
}
// HR, payroll and staff claims -------------------------------------------------
//
// Same rules as everything above: one transaction per write, its activity_log
// row inside it, and every figure that can be derived is derived here rather
// than taken from the browser.
//
// The workflow guards need a word of explanation. The driver runs a
// transaction as a batch of statements with no round trip in between, so
// nothing here can read a row, decide in JavaScript, and then write. Every
// guard therefore lives in the WHERE clause of the statement that writes and
// reports back through RETURNING: an empty result means the run had already
// moved on, and the mutation raises InputError. The read before the write is
// only there to produce a useful message; the WHERE clause is what actually
// holds when two tabs race.

async function employeeSnapshot(id: string): Promise<unknown> {
  const sql = db();
  const rows = (await sql`
    SELECT to_jsonb(e) AS snapshot FROM employee e WHERE e.id = ${id}::uuid
  `) as { snapshot: unknown }[];
  return rows[0]?.snapshot ?? null;
}

async function expenseSnapshot(id: string): Promise<unknown> {
  const sql = db();
  const rows = (await sql`
    SELECT to_jsonb(x) AS snapshot FROM expense x WHERE x.id = ${id}::uuid
  `) as { snapshot: unknown }[];
  return rows[0]?.snapshot ?? null;
}

async function advanceSnapshot(id: string): Promise<unknown> {
  const sql = db();
  const rows = (await sql`
    SELECT to_jsonb(a) AS snapshot FROM advance a WHERE a.id = ${id}::uuid
  `) as { snapshot: unknown }[];
  return rows[0]?.snapshot ?? null;
}

/** A run and every line on it, for the before and after columns. */
async function runSnapshot(id: string): Promise<unknown> {
  const sql = db();
  const rows = (await sql`
    SELECT to_jsonb(r) || jsonb_build_object('lines', (
      SELECT COALESCE(jsonb_agg(to_jsonb(l) ORDER BY l.id), '[]'::jsonb)
      FROM payroll_line l WHERE l.run_id = r.id)) AS snapshot
    FROM payroll_run r WHERE r.id = ${id}::uuid
  `) as { snapshot: unknown }[];
  return rows[0]?.snapshot ?? null;
}

// Employees -------------------------------------------------------------------

export async function createEmployee(
  input: EmployeeFormInput,
  actor: Actor,
): Promise<string> {
  if (await employeeNameExists(input.name)) {
    throw new InputError(`${input.name} is already on the employee list.`);
  }

  const sql = db();
  const id = randomUUID();

  await sql.transaction([
    sql`
      WITH bumped AS (
        UPDATE counter SET value = value + 1 WHERE name = 'employee'
        RETURNING value
      )
      INSERT INTO employee (id, code, name, designation, phone, nid, address,
        joined_on, basic, house_rent, medical, conveyance, mobile_allowance,
        other_allowance, payment_method, bank_name, account_no, mfs_number)
      SELECT ${id}::uuid,
        COALESCE(${input.code}::text,
          'EMP-' || lpad(bumped.value::text,
            GREATEST(4, length(bumped.value::text)), '0')),
        ${input.name}::text, ${input.designation}, ${input.phone},
        ${input.nid}, ${input.address}, ${input.joinedOn}::date,
        ${input.basic}::numeric, ${input.houseRent}::numeric,
        ${input.medical}::numeric, ${input.conveyance}::numeric,
        ${input.mobileAllowance}::numeric, ${input.otherAllowance}::numeric,
        ${input.paymentMethod}::text, ${input.bankName}, ${input.accountNo},
        ${input.mfsNumber}
      FROM bumped
    `,
    sql`
      INSERT INTO activity_log (actor_user_id, actor_name, action, entity, entity_id, summary, reason, after_json)
      SELECT ${actor.id}::text, ${actor.name}::text, 'create', 'employee', e.id::text,
        ${`Added employee ${input.name}`}::text || ', gross Tk ' ||
          to_char(e.gross, 'FM999,999,990.00'),
        ${input.reason}, to_jsonb(e)
      FROM employee e WHERE e.id = ${id}::uuid
    `,
  ]);
  return id;
}

export async function updateEmployee(
  id: string,
  input: EmployeeFormInput,
  actor: Actor,
): Promise<void> {
  const before = await getEmployee(id);
  if (!before) throw new InputError('That employee no longer exists.');
  if (await employeeNameExists(input.name, id)) {
    throw new InputError(`${input.name} is already on the employee list.`);
  }

  const sql = db();
  const snapshot = await employeeSnapshot(id);

  // Editing the structure changes what future months are generated from. Every
  // payroll line already written keeps its own copy, so nothing already paid
  // moves.
  await sql.transaction([
    sql`
      UPDATE employee SET code = ${input.code}, name = ${input.name}::text,
        designation = ${input.designation}, phone = ${input.phone},
        nid = ${input.nid}, address = ${input.address},
        joined_on = ${input.joinedOn}::date,
        basic = ${input.basic}::numeric,
        house_rent = ${input.houseRent}::numeric,
        medical = ${input.medical}::numeric,
        conveyance = ${input.conveyance}::numeric,
        mobile_allowance = ${input.mobileAllowance}::numeric,
        other_allowance = ${input.otherAllowance}::numeric,
        payment_method = ${input.paymentMethod}::text,
        bank_name = ${input.bankName}, account_no = ${input.accountNo},
        mfs_number = ${input.mfsNumber}, updated_at = now()
      WHERE id = ${id}::uuid
    `,
    sql`
      INSERT INTO activity_log (actor_user_id, actor_name, action, entity, entity_id, summary, reason,
        before_json, after_json)
      SELECT ${actor.id}::text, ${actor.name}::text, 'update', 'employee', e.id::text,
        ${`Updated employee ${input.name}`}::text || ', gross Tk ' ||
          to_char(e.gross, 'FM999,999,990.00'),
        ${input.reason}, ${asJson(snapshot)}::jsonb, to_jsonb(e)
      FROM employee e WHERE e.id = ${id}::uuid
    `,
  ]);
}

/**
 * An employee who has left is deactivated, never removed. Their advances,
 * payroll lines and claims are money that moved and stay on the record.
 */
export async function setEmployeeActive(
  id: string,
  active: boolean,
  reason: string,
  actor: Actor,
): Promise<void> {
  const before = await getEmployee(id);
  if (!before) throw new InputError('That employee no longer exists.');

  const sql = db();
  const snapshot = await employeeSnapshot(id);

  await sql.transaction([
    sql`
      UPDATE employee SET active = ${active}::boolean, updated_at = now()
      WHERE id = ${id}::uuid
    `,
    sql`
      INSERT INTO activity_log (actor_user_id, actor_name, action, entity, entity_id, summary, reason,
        before_json, after_json)
      SELECT ${actor.id}::text, ${actor.name}::text, 'update', 'employee', e.id::text,
        ${`${active ? 'Reinstated' : 'Deactivated'} employee ${before.name}`}::text,
        ${reason}, ${asJson(snapshot)}::jsonb, to_jsonb(e)
      FROM employee e WHERE e.id = ${id}::uuid
    `,
  ]);
}

// Expenses --------------------------------------------------------------------

export async function createExpense(
  input: ExpenseFormInput,
  actor: Actor,
): Promise<string> {
  const sql = db();
  const id = randomUUID();

  await sql.transaction([
    sql`
      WITH bumped AS (
        UPDATE counter SET value = value + 1 WHERE name = 'expense'
        RETURNING value
      )
      INSERT INTO expense (id, doc_no, spent_on, category, payee, description,
        amount, mode, reference, order_no, notes)
      SELECT ${id}::uuid,
        'EXP-' || to_char(${input.spentOn}::date, 'YY') || '-' ||
          lpad(bumped.value::text, GREATEST(4, length(bumped.value::text)), '0'),
        ${input.spentOn}::date, ${input.category}::text, ${input.payee},
        ${input.description}::text, ${input.amount}::numeric,
        ${input.mode}::text, ${input.reference}, ${input.orderNo}, ${input.notes}
      FROM bumped
    `,
    sql`
      INSERT INTO activity_log (actor_user_id, actor_name, action, entity, entity_id, summary, reason, after_json)
      SELECT ${actor.id}::text, ${actor.name}::text, 'create', 'expense', x.id::text,
        'Expense ' || x.doc_no ||
          ${`, ${expenseCategoryLabel(input.category)}, Tk ${tk(input.amount)} dated ${formatDate(input.spentOn)}`}::text,
        ${input.reason}, to_jsonb(x)
      FROM expense x WHERE x.id = ${id}::uuid
    `,
  ]);
  return id;
}

export async function updateExpense(
  id: string,
  input: ExpenseFormInput,
  actor: Actor,
): Promise<void> {
  const before = await getExpense(id);
  if (!before) throw new InputError('That expense no longer exists.');

  const sql = db();
  const snapshot = await expenseSnapshot(id);

  await sql.transaction([
    sql`
      UPDATE expense SET spent_on = ${input.spentOn}::date,
        category = ${input.category}::text, payee = ${input.payee},
        description = ${input.description}::text,
        amount = ${input.amount}::numeric, mode = ${input.mode}::text,
        reference = ${input.reference}, order_no = ${input.orderNo},
        notes = ${input.notes},
        updated_at = now()
      WHERE id = ${id}::uuid
    `,
    sql`
      INSERT INTO activity_log (actor_user_id, actor_name, action, entity, entity_id, summary, reason,
        before_json, after_json)
      SELECT ${actor.id}::text, ${actor.name}::text, 'update', 'expense', x.id::text,
        'Updated expense ' || COALESCE(x.doc_no, x.id::text) ||
          ${`, Tk ${tk(input.amount)}`}::text,
        ${input.reason}, ${asJson(snapshot)}::jsonb, to_jsonb(x)
      FROM expense x WHERE x.id = ${id}::uuid
    `,
  ]);
}

export async function deleteExpense(
  id: string,
  reason: string,
  actor: Actor,
): Promise<void> {
  const before = await getExpense(id);
  if (!before) throw new InputError('That expense no longer exists.');

  const sql = db();
  const snapshot = await expenseSnapshot(id);

  await sql.transaction([
    sql`
      INSERT INTO activity_log (actor_user_id, actor_name, action, entity, entity_id, summary, reason, before_json)
      VALUES (${actor.id}::text, ${actor.name}::text, 'delete', 'expense', ${id}::text,
        ${`Removed expense ${before.docNo ?? ''}, Tk ${tk(before.amount.toDecimalString())} dated ${formatDate(before.spentOn)}`}::text,
        ${reason}, ${asJson(snapshot)}::jsonb)
    `,
    sql`DELETE FROM expense WHERE id = ${id}::uuid`,
  ]);
}

// Advances --------------------------------------------------------------------

export async function createAdvance(
  input: AdvanceFormInput,
  actor: Actor,
): Promise<string> {
  const employee = await getEmployee(input.employeeId);
  if (!employee) throw new InputError('Select an employee for this advance.');

  const sql = db();
  const id = randomUUID();

  await sql.transaction([
    sql`
      WITH bumped AS (
        UPDATE counter SET value = value + 1 WHERE name = 'advance'
        RETURNING value
      )
      INSERT INTO advance (id, doc_no, employee_id, paid_on, amount, mode,
        reference, reason, notes, recovery_mode, installment_amount,
        recover_from)
      SELECT ${id}::uuid,
        'ADV-' || to_char(${input.paidOn}::date, 'YY') || '-' ||
          lpad(bumped.value::text, GREATEST(4, length(bumped.value::text)), '0'),
        ${employee.id}::uuid, ${input.paidOn}::date, ${input.amount}::numeric,
        ${input.mode}::text, ${input.reference}, ${input.reason}, ${input.notes},
        ${input.recoveryMode}::text, ${input.installmentAmount || null}::numeric,
        ${input.recoverFrom || null}::text
      FROM bumped
    `,
    sql`
      INSERT INTO activity_log (actor_user_id, actor_name, action, entity, entity_id, summary, reason, after_json)
      SELECT ${actor.id}::text, ${actor.name}::text, 'create', 'advance', a.id::text,
        'Advance ' || a.doc_no ||
          ${` to ${employee.name}, Tk ${tk(input.amount)} dated ${formatDate(input.paidOn)}`}::text,
        ${input.reason}, to_jsonb(a)
      FROM advance a WHERE a.id = ${id}::uuid
    `,
  ]);
  return id;
}

export async function updateAdvance(
  id: string,
  input: AdvanceFormInput,
  actor: Actor,
): Promise<void> {
  const before = await getAdvance(id);
  if (!before) throw new InputError('That advance no longer exists.');
  const employee = await getEmployee(input.employeeId);
  if (!employee) throw new InputError('Select an employee for this advance.');

  const sql = db();
  const snapshot = await advanceSnapshot(id);

  await sql.transaction([
    sql`
      UPDATE advance SET employee_id = ${employee.id}::uuid,
        paid_on = ${input.paidOn}::date, amount = ${input.amount}::numeric,
        mode = ${input.mode}::text, reference = ${input.reference},
        reason = ${input.reason}, notes = ${input.notes},
        recovery_mode = ${input.recoveryMode}::text,
        installment_amount = ${input.installmentAmount || null}::numeric,
        recover_from = ${input.recoverFrom || null}::text,
        updated_at = now()
      WHERE id = ${id}::uuid
    `,
    sql`
      INSERT INTO activity_log (actor_user_id, actor_name, action, entity, entity_id, summary, reason,
        before_json, after_json)
      SELECT ${actor.id}::text, ${actor.name}::text, 'update', 'advance', a.id::text,
        'Updated advance ' || COALESCE(a.doc_no, a.id::text) ||
          ${` to ${employee.name}, Tk ${tk(input.amount)}`}::text,
        ${input.reason}, ${asJson(snapshot)}::jsonb, to_jsonb(a)
      FROM advance a WHERE a.id = ${id}::uuid
    `,
  ]);
}

export async function deleteAdvance(
  id: string,
  reason: string,
  actor: Actor,
): Promise<void> {
  const before = await getAdvance(id);
  if (!before) throw new InputError('That advance no longer exists.');

  const sql = db();
  const snapshot = await advanceSnapshot(id);

  await sql.transaction([
    sql`
      INSERT INTO activity_log (actor_user_id, actor_name, action, entity, entity_id, summary, reason, before_json)
      VALUES (${actor.id}::text, ${actor.name}::text, 'delete', 'advance', ${id}::text,
        ${`Removed advance ${before.docNo ?? ''} to ${before.employeeName}, Tk ${tk(before.amount.toDecimalString())}`}::text,
        ${reason}, ${asJson(snapshot)}::jsonb)
    `,
    sql`DELETE FROM advance WHERE id = ${id}::uuid`,
  ]);
}

// Payroll ---------------------------------------------------------------------

/**
 * Starts a month and writes a line for every active employee.
 *
 * The whole month is one INSERT ... SELECT over the employee table, so
 * generating fifteen people is one statement rather than fifteen. The salary
 * components are copied here, which is what makes a later raise safe.
 *
 * Nothing is deducted at this point: absence, bonus and the rest are what HR
 * keys next, so every line starts with net equal to gross.
 */
/**
 * What each employee's advances propose to take back in this month.
 *
 * The cap is what the line can carry, which at generate time is the gross.
 * Anyone with no advances is simply absent from the map, and the caller reads
 * that as zero.
 */
async function plannedRecoveryByEmployee(
  period: string,
  employees: { id: string; gross: Money }[],
): Promise<Map<string, Money>> {
  const byEmployee = await advancesForRecovery();
  const planned = new Map<string, Money>();
  for (const employee of employees) {
    const entry = byEmployee.get(employee.id);
    if (!entry) continue;
    const amount = plannedRecovery(
      entry.advances,
      entry.recoveredToDate,
      period,
      employee.gross,
    );
    if (!amount.isZero()) planned.set(employee.id, amount);
  }
  return planned;
}

export async function generatePayrollRun(
  input: PayrollRunFormInput,
  actor: Actor,
): Promise<string> {
  const existing = await findPayrollRun(input.period);
  if (existing) {
    throw new InputError(
      `Payroll for ${periodLabel(input.period)} has already been generated.`,
    );
  }

  const employees = await listEmployees({ activeOnly: true });
  if (employees.length === 0) {
    throw new InputError(
      'There are no active employees to generate payroll for.',
    );
  }

  // What each employee's advances want back this month, worked out here rather
  // than in SQL: apportioning recoveries across advances is arithmetic, and
  // arithmetic on money belongs in the tested pure module.
  //
  // At this point nothing else is keyed, so what the salary can carry is the
  // gross. plannedRecovery caps against it, which is why a generated month can
  // never come out with a negative net and fail on its own proposal.
  const recovery = input.recoverAdvances
    ? await plannedRecoveryByEmployee(input.period, employees)
    : new Map<string, Money>();

  const sql = db();
  const id = randomUUID();

  await sql.transaction([
    sql`
      WITH bumped AS (
        UPDATE counter SET value = value + 1 WHERE name = 'payroll_run'
        RETURNING value
      )
      INSERT INTO payroll_run (id, doc_no, period, status, per_day_basis,
        recover_advances, notes)
      SELECT ${id}::uuid,
        'PR-' || substring(${input.period}::text, 3, 2) || '-' ||
          lpad(bumped.value::text, GREATEST(4, length(bumped.value::text)), '0'),
        ${input.period}::text, 'draft', ${input.perDayBasis}::text,
        ${input.recoverAdvances}::boolean, ${input.notes}
      FROM bumped
    `,
    sql`
      INSERT INTO payroll_line (run_id, employee_id, basic, house_rent, medical,
        conveyance, mobile_allowance, other_allowance, gross, designation,
        advance_deduction, net_paid)
      SELECT ${id}::uuid, e.id, e.basic, e.house_rent, e.medical, e.conveyance,
        e.mobile_allowance, e.other_allowance, e.gross, e.designation,
        COALESCE(r.recovery, 0), e.gross - COALESCE(r.recovery, 0)
      FROM employee e
      LEFT JOIN (
        SELECT * FROM unnest(
          ${employees.map((employee) => employee.id)}::uuid[],
          ${employees.map((employee) =>
            (recovery.get(employee.id) ?? Money.ZERO).toDecimalString(),
          )}::numeric[]
        ) AS t(employee_id, recovery)
      ) r ON r.employee_id = e.id
      WHERE e.active
    `,
    sql`
      INSERT INTO activity_log (actor_user_id, actor_name, action, entity, entity_id, summary, after_json)
      SELECT ${actor.id}::text, ${actor.name}::text, 'create', 'payroll_run', r.id::text,
        'Generated payroll ' || r.doc_no ||
          ${` for ${periodLabel(input.period)}, ${employees.length} employee${employees.length === 1 ? '' : 's'}`}::text,
        to_jsonb(r)
      FROM payroll_run r WHERE r.id = ${id}::uuid
    `,
  ]);
  return id;
}

/** Adds a line for somebody hired after the month was generated. */
export async function addEmployeeToRun(
  runId: string,
  employeeId: string,
  actor: Actor,
): Promise<void> {
  const run = await findPayrollRun(runId);
  if (!run) throw new InputError('That payroll run no longer exists.');
  if (run.status !== 'draft') {
    throw new InputError(
      'This payroll has been approved. Reopen it before adding anyone.',
    );
  }
  const employee = await getEmployee(employeeId);
  if (!employee) throw new InputError('That employee no longer exists.');

  const sql = db();
  const rows = (await sql.transaction([
    sql`
      INSERT INTO payroll_line (run_id, employee_id, basic, house_rent, medical,
        conveyance, mobile_allowance, other_allowance, gross, designation,
        net_paid)
      SELECT r.id, e.id, e.basic, e.house_rent, e.medical, e.conveyance,
        e.mobile_allowance, e.other_allowance, e.gross, e.designation, e.gross
      FROM payroll_run r, employee e
      WHERE r.id = ${runId}::uuid AND r.status = 'draft' AND e.id = ${employeeId}::uuid
      ON CONFLICT (run_id, employee_id) DO NOTHING
      RETURNING id
    `,
    sql`
      INSERT INTO activity_log (actor_user_id, actor_name, action, entity, entity_id, summary)
      VALUES (${actor.id}::text, ${actor.name}::text, 'update', 'payroll_run', ${runId}::text,
        ${`Added ${employee.name} to payroll ${periodLabel(run.period)}`}::text)
    `,
  ])) as unknown[][];

  if ((rows[0] ?? []).length === 0) {
    throw new InputError(
      `${employee.name} is already on this payroll, or it is no longer a draft.`,
    );
  }
}

/**
 * Saves the whole grid at once.
 *
 * The absence cost and the net are worked out here for every line, from the
 * days HR keyed and the run's own basis. The browser never sends an amount.
 *
 * Each UPDATE carries the draft guard, so an approved run cannot be edited even
 * by a tab that was left open before it was approved.
 */
export async function savePayrollLines(
  runId: string,
  lines: PayrollLineFormInput[],
  actor: Actor,
): Promise<void> {
  const run = await findPayrollRun(runId);
  if (!run) throw new InputError('That payroll run no longer exists.');
  if (run.status !== 'draft') {
    throw new InputError(
      'This payroll has been approved. Reopen it before changing any figure.',
    );
  }

  const current = await listPayrollLines(run.id);
  const byId = new Map(current.map((line) => [line.id, line]));

  const updates = lines.map((line) => {
    const existing = byId.get(line.id);
    if (!existing) {
      throw new InputError('A row on this payroll no longer exists.');
    }
    const absence = absenceDeduction(
      existing.gross,
      line.absentDays,
      run.perDayBasis,
      run.period,
    );
    let net: Money;
    try {
      net = netPay({
        gross: existing.gross,
        absence,
        advanceDeduction: Money.fromDecimal(line.advanceDeduction),
        otherDeduction: Money.fromDecimal(line.otherDeduction),
        bonus: Money.fromDecimal(line.bonus),
        additionalAllowance: Money.fromDecimal(line.additionalAllowance),
      });
    } catch (error) {
      // The grid saves every row at once, so a message that does not name the
      // person leaves somebody reading twenty rows to find the one at fault.
      if (error instanceof PayrollError) {
        throw new PayrollError(`${existing.employeeName}: ${error.message}`);
      }
      throw error;
    }
    return { line, absence, net, name: existing.employeeName };
  });

  const sql = db();
  await sql.transaction([
    ...updates.map(
      ({ line, absence, net }) => sql`
        UPDATE payroll_line SET absent_days = ${line.absentDays}::numeric,
          bonus = ${line.bonus}::numeric,
          additional_allowance = ${line.additionalAllowance}::numeric,
          advance_deduction = ${line.advanceDeduction}::numeric,
          other_deduction = ${line.otherDeduction}::numeric,
          remarks = ${line.remarks},
          absence_deduction = ${absence.toDecimalString()}::numeric,
          net_paid = ${net.toDecimalString()}::numeric,
          updated_at = now()
        WHERE id = ${line.id}::uuid
          AND run_id IN (SELECT id FROM payroll_run
                         WHERE id = ${run.id}::uuid AND status = 'draft')
      `,
    ),
    sql`
      INSERT INTO activity_log (actor_user_id, actor_name, action, entity, entity_id, summary, after_json)
      SELECT ${actor.id}::text, ${actor.name}::text, 'update', 'payroll_run', r.id::text,
        'Payroll ' || COALESCE(r.doc_no, r.period) ||
          ${` figures saved, ${updates.length} line${updates.length === 1 ? '' : 's'}`}::text,
        to_jsonb(r) || jsonb_build_object('lines', (
          SELECT COALESCE(jsonb_agg(to_jsonb(l) ORDER BY l.id), '[]'::jsonb)
          FROM payroll_line l WHERE l.run_id = r.id))
      FROM payroll_run r WHERE r.id = ${run.id}::uuid
    `,
  ]);
}

/**
 * Fills the advance column of a draft run from the recovery agreements.
 *
 * Generate does this once. This is the way back to it: after an advance is
 * agreed later in the month, after a run is reopened, or after somebody
 * generated a month with recovery switched off and changed their mind. It
 * overwrites whatever is in the column, which is why it is a button somebody
 * presses and never something that runs on its own.
 *
 * The cap is what each line can carry as it now stands, absence and bonus
 * included, so a figure this writes can always be saved.
 */
export async function fillAdvanceRecoveries(
  runId: string,
  actor: Actor,
): Promise<number> {
  const run = await findPayrollRun(runId);
  if (!run) throw new InputError('That payroll run no longer exists.');
  if (run.status !== 'draft') {
    throw new InputError(
      'This payroll has been approved. Reopen it before changing any figure.',
    );
  }

  const lines = await listPayrollLines(run.id);
  const byEmployee = await advancesForRecovery();

  const updates = lines.flatMap((line) => {
    const entry = byEmployee.get(line.employeeId);
    if (!entry) return [];
    // What is left for an advance once everything else on the line is settled.
    const payable = line.gross
      .subtract(line.absenceDeduction)
      .subtract(line.otherDeduction)
      .add(line.bonus)
      .add(line.additionalAllowance);
    const amount = plannedRecovery(
      entry.advances,
      entry.recoveredToDate,
      run.period,
      payable,
    );
    if (amount.equals(line.advanceDeduction)) return [];
    return [{ line, amount, net: payable.subtract(amount) }];
  });

  if (updates.length === 0) return 0;

  const sql = db();
  const rows = (await sql.transaction([
    ...updates.map(
      ({ line, amount, net }) => sql`
        UPDATE payroll_line
          SET advance_deduction = ${amount.toDecimalString()}::numeric,
            net_paid = ${net.toDecimalString()}::numeric,
            updated_at = now()
        WHERE id = ${line.id}::uuid
          AND run_id IN (SELECT id FROM payroll_run
                         WHERE id = ${run.id}::uuid AND status = 'draft')
        RETURNING id
      `,
    ),
    sql`
      INSERT INTO activity_log (actor_user_id, actor_name, action, entity, entity_id, summary, after_json)
      SELECT ${actor.id}::text, ${actor.name}::text, 'update', 'payroll_run', r.id::text,
        'Payroll ' || COALESCE(r.doc_no, r.period) ||
          ${` advance recoveries filled, ${updates.length} line${updates.length === 1 ? '' : 's'}`}::text,
        to_jsonb(r) || jsonb_build_object('lines', (
          SELECT COALESCE(jsonb_agg(to_jsonb(l) ORDER BY l.id), '[]'::jsonb)
          FROM payroll_line l WHERE l.run_id = r.id))
      FROM payroll_run r WHERE r.id = ${run.id}::uuid
    `,
  ])) as unknown[][];

  // Every UPDATE carried the draft guard. If none of them matched, the run
  // stopped being a draft between the read above and the write, and nothing
  // was changed.
  const changed = updates.filter((_, i) => (rows[i] ?? []).length > 0).length;
  if (changed === 0) {
    throw new InputError(
      'This payroll is no longer a draft, so nothing was changed.',
    );
  }
  return changed;
}

/**
 * Freezes the figures.
 *
 * The guard is the WHERE clause: approving a run that is not a draft matches
 * nothing and returns nothing, which is how a second approval from a stale tab
 * is refused rather than overwriting the first one's name and timestamp.
 *
 * The approver is the signed-in account and is no longer typed. Since named
 * users arrived the name on an approval is one somebody proved, and the caller
 * has already been checked for 'payroll:approve', which only an Owner holds.
 */
export async function approvePayrollRun(
  runId: string,
  actor: Actor,
): Promise<void> {
  const run = await findPayrollRun(runId);
  if (!run) throw new InputError('That payroll run no longer exists.');
  if (run.status !== 'draft') {
    throw new InputError('This payroll has already been approved.');
  }

  const sql = db();
  const snapshot = await runSnapshot(run.id);
  const results = (await sql.transaction([
    sql`
      UPDATE payroll_run
      SET status = 'approved', approved_by = ${actor.name}::text,
        approved_by_user_id = ${actor.id}::text,
        approved_at = now(), updated_at = now()
      WHERE id = ${run.id}::uuid AND status = 'draft'
      RETURNING id
    `,
    sql`
      INSERT INTO activity_log (actor_user_id, actor_name, action, entity, entity_id, summary, before_json, after_json)
      SELECT ${actor.id}::text, ${actor.name}::text, 'update', 'payroll_run', r.id::text,
        'Approved payroll ' || COALESCE(r.doc_no, r.period) ||
          ${` for ${periodLabel(run.period)} by ${actor.name}`}::text,
        ${asJson(snapshot)}::jsonb, to_jsonb(r)
      FROM payroll_run r WHERE r.id = ${run.id}::uuid
    `,
  ])) as unknown[][];

  if ((results[0] ?? []).length === 0) {
    throw new InputError('This payroll has already been approved.');
  }
}

/**
 * Marks the whole run paid and stamps every line with the date.
 *
 * A line already carrying its own paid date keeps it, so a run finished off in
 * two sittings does not restate the first sitting's dates.
 */
export async function markPayrollRunPaid(
  runId: string,
  paidOn: string,
  actor: Actor,
): Promise<void> {
  const run = await findPayrollRun(runId);
  if (!run) throw new InputError('That payroll run no longer exists.');
  if (run.status === 'draft') {
    throw new InputError('Approve this payroll before marking it paid.');
  }
  if (run.status === 'paid') {
    throw new InputError('This payroll is already marked paid.');
  }

  const sql = db();
  const snapshot = await runSnapshot(run.id);
  const results = (await sql.transaction([
    sql`
      UPDATE payroll_run
      SET status = 'paid', paid_by = ${actor.name}::text,
        paid_by_user_id = ${actor.id}::text, paid_at = now(),
        updated_at = now()
      WHERE id = ${run.id}::uuid AND status = 'approved'
      RETURNING id
    `,
    sql`
      UPDATE payroll_line SET paid_on = ${paidOn}::date, updated_at = now()
      WHERE run_id = ${run.id}::uuid AND paid_on IS NULL
    `,
    sql`
      INSERT INTO activity_log (actor_user_id, actor_name, action, entity, entity_id, summary, before_json, after_json)
      SELECT ${actor.id}::text, ${actor.name}::text, 'update', 'payroll_run', r.id::text,
        'Paid payroll ' || COALESCE(r.doc_no, r.period) ||
          ${` for ${periodLabel(run.period)} by ${actor.name}`}::text,
        ${asJson(snapshot)}::jsonb, to_jsonb(r)
      FROM payroll_run r WHERE r.id = ${run.id}::uuid
    `,
  ])) as unknown[][];

  if ((results[0] ?? []).length === 0) {
    throw new InputError('This payroll is no longer waiting to be paid.');
  }
}

/**
 * Sends a run back to draft so a mistake can be corrected.
 *
 * The reason is required and goes in the log, because reopening a paid month is
 * exactly the event somebody will ask about later. The paid dates on the lines
 * are cleared with it: the run is no longer paid, so neither are they.
 */
export async function reopenPayrollRun(
  runId: string,
  reason: string,
  actor: Actor,
): Promise<void> {
  const run = await findPayrollRun(runId);
  if (!run) throw new InputError('That payroll run no longer exists.');
  if (run.status === 'draft') {
    throw new InputError('This payroll is already a draft.');
  }

  const sql = db();
  const snapshot = await runSnapshot(run.id);
  const results = (await sql.transaction([
    sql`
      UPDATE payroll_run
      SET status = 'draft', approved_by = NULL, approved_at = NULL,
        paid_by = NULL, paid_at = NULL, updated_at = now()
      WHERE id = ${run.id}::uuid AND status IN ('approved', 'paid')
      RETURNING id
    `,
    sql`
      UPDATE payroll_line SET paid_on = NULL, updated_at = now()
      WHERE run_id = ${run.id}::uuid
    `,
    sql`
      INSERT INTO activity_log (actor_user_id, actor_name, action, entity, entity_id, summary, reason,
        before_json, after_json)
      SELECT ${actor.id}::text, ${actor.name}::text, 'update', 'payroll_run', r.id::text,
        'Reopened payroll ' || COALESCE(r.doc_no, r.period) ||
          ${` for ${periodLabel(run.period)}, previously ${run.status}`}::text,
        ${reason}, ${asJson(snapshot)}::jsonb, to_jsonb(r)
      FROM payroll_run r WHERE r.id = ${run.id}::uuid
    `,
  ])) as unknown[][];

  if ((results[0] ?? []).length === 0) {
    throw new InputError('This payroll is already a draft.');
  }
}

// Leave -----------------------------------------------------------------------

export async function createLeaveRecord(
  input: LeaveFormInput,
  actor: Actor,
): Promise<string> {
  const employee = await getEmployee(input.employeeId);
  if (!employee) throw new InputError('Select an employee for this leave.');

  const sql = db();
  const id = randomUUID();

  await sql.transaction([
    sql`
      INSERT INTO leave_record (id, employee_id, leave_type, from_date, to_date,
        days, reason)
      VALUES (${id}::uuid, ${employee.id}::uuid, ${input.leaveType}::text,
        ${input.fromDate}::date, ${input.toDate}::date, ${input.days}::numeric,
        ${input.reason})
    `,
    sql`
      INSERT INTO activity_log (actor_user_id, actor_name, action, entity, entity_id, summary, after_json)
      SELECT ${actor.id}::text, ${actor.name}::text, 'create', 'leave', lr.id::text,
        ${`${leaveTypeLabel(input.leaveType)} for ${employee.name}, ${input.days} day${input.days === '1' ? '' : 's'} from ${formatDate(input.fromDate)}`}::text,
        to_jsonb(lr)
      FROM leave_record lr WHERE lr.id = ${id}::uuid
    `,
  ]);
  return id;
}

export async function deleteLeaveRecord(
  id: string,
  reason: string,
  actor: Actor,
): Promise<void> {
  const sql = db();
  await sql.transaction([
    sql`
      INSERT INTO activity_log (actor_user_id, actor_name, action, entity, entity_id, summary, reason, before_json)
      SELECT ${actor.id}::text, ${actor.name}::text, 'delete', 'leave', lr.id::text,
        'Removed leave for ' || e.name, ${reason}, to_jsonb(lr)
      FROM leave_record lr JOIN employee e ON e.id = lr.employee_id
      WHERE lr.id = ${id}::uuid
    `,
    sql`DELETE FROM leave_record WHERE id = ${id}::uuid`,
  ]);
}

// Staff expense claims --------------------------------------------------------

export async function createExpenseClaim(
  input: ExpenseClaimFormInput,
  actor: Actor,
): Promise<string> {
  const employee = await getEmployee(input.employeeId);
  if (!employee) throw new InputError('Select an employee for this claim.');

  const sql = db();
  const id = randomUUID();

  await sql.transaction([
    sql`
      WITH bumped AS (
        UPDATE counter SET value = value + 1 WHERE name = 'expense_claim'
        RETURNING value
      )
      INSERT INTO expense_claim (id, doc_no, employee_id, claimed_on, category,
        description, amount, order_no, status)
      SELECT ${id}::uuid,
        'ECL-' || to_char(${input.claimedOn}::date, 'YY') || '-' ||
          lpad(bumped.value::text, GREATEST(4, length(bumped.value::text)), '0'),
        ${employee.id}::uuid, ${input.claimedOn}::date, ${input.category}::text,
        ${input.description}::text, ${input.amount}::numeric,
        ${input.orderNo}, 'submitted'
      FROM bumped
    `,
    sql`
      INSERT INTO activity_log (actor_user_id, actor_name, action, entity, entity_id, summary, reason, after_json)
      SELECT ${actor.id}::text, ${actor.name}::text, 'create', 'expense_claim', c.id::text,
        'Claim ' || c.doc_no ||
          ${` from ${employee.name}, Tk ${tk(input.amount)}`}::text,
        ${input.reason}, to_jsonb(c)
      FROM expense_claim c WHERE c.id = ${id}::uuid
    `,
  ]);
  return id;
}

/** Pays a claim back. Guarded so a claim cannot be reimbursed twice. */
export async function reimburseExpenseClaim(
  input: {
    id: string;
    reimbursedOn: string;
    mode: string;
    reference: string | null;
  },
  actor: Actor,
): Promise<void> {
  const claim = await getExpenseClaim(input.id);
  if (!claim) throw new InputError('That claim no longer exists.');
  if (claim.status === 'reimbursed') {
    throw new InputError('That claim has already been reimbursed.');
  }

  const sql = db();
  const results = (await sql.transaction([
    sql`
      UPDATE expense_claim
      SET status = 'reimbursed', reimbursed_on = ${input.reimbursedOn}::date,
        mode = ${input.mode}::text, reference = ${input.reference},
        updated_at = now()
      WHERE id = ${input.id}::uuid AND status = 'submitted'
      RETURNING id
    `,
    sql`
      INSERT INTO activity_log (actor_user_id, actor_name, action, entity, entity_id, summary, after_json)
      SELECT ${actor.id}::text, ${actor.name}::text, 'update', 'expense_claim', c.id::text,
        'Reimbursed claim ' || COALESCE(c.doc_no, c.id::text) ||
          ${` to ${claim.employeeName}, Tk ${tk(claim.amount.toDecimalString())}`}::text,
        to_jsonb(c)
      FROM expense_claim c WHERE c.id = ${input.id}::uuid
    `,
  ])) as unknown[][];

  if ((results[0] ?? []).length === 0) {
    throw new InputError('That claim has already been reimbursed.');
  }
}

export async function deleteExpenseClaim(
  id: string,
  reason: string,
  actor: Actor,
): Promise<void> {
  const claim = await getExpenseClaim(id);
  if (!claim) throw new InputError('That claim no longer exists.');

  const sql = db();
  await sql.transaction([
    sql`
      INSERT INTO activity_log (actor_user_id, actor_name, action, entity, entity_id, summary, reason, before_json)
      SELECT ${actor.id}::text, ${actor.name}::text, 'delete', 'expense_claim', c.id::text,
        ${`Removed claim ${claim.docNo ?? ''} from ${claim.employeeName}`}::text,
        ${reason}, to_jsonb(c)
      FROM expense_claim c WHERE c.id = ${id}::uuid
    `,
    sql`DELETE FROM expense_claim WHERE id = ${id}::uuid`,
  ]);
}

// Users -----------------------------------------------------------------------
//
// Named accounts arrived on 2026-08-14 and replaced the single shared password.
// Better Auth owns reading these tables at sign-in; the writes are here, with
// every other write in the app, because rule 5 asks that a write and its
// activity_log row land in one transaction.
//
// That rule is also why the rows are written directly rather than through
// Better Auth's signUpEmail. That call runs on its own connection, so it could
// not be inside this transaction, and inside a server action its response would
// hand the new user's session cookie to whoever was creating the account. What
// it does is hash the password and write two rows, which is what happens below,
// using its own hasher so a password set here and a password set by the library
// are stored the same way.

/** An Owner may not lock the last way into user management. */
async function assertNotLastOwner(id: string, doing: string): Promise<void> {
  const user = await getUser(id);
  if (!user) throw new InputError('That user no longer exists.');
  if (user.role !== 'owner') return;
  if ((await otherActiveOwners(id)) === 0) {
    throw new InputError(
      `${user.name} is the last active Owner, so that account cannot be ${doing}. Make somebody else an Owner first.`,
    );
  }
}

export async function createUser(
  input: UserFormInput,
  actor: Actor,
): Promise<string> {
  if (await userEmailExists(input.email)) {
    throw new InputError(`${input.email} already has an account.`);
  }

  const id = randomUUID();
  const hash = await hashPassword(input.password);
  const sql = db();

  await sql.transaction([
    sql`
      INSERT INTO users (id, name, email, email_verified, role, status)
      VALUES (${id}::text, ${input.name}::text, ${input.email}::text,
        true, ${input.role}::text, 'active')
    `,
    // account_id equals the user id for a credential account, which is what
    // Better Auth's own sign-up writes.
    sql`
      INSERT INTO auth_accounts (id, user_id, account_id, provider_id, password)
      VALUES (${randomUUID()}::text, ${id}::text, ${id}::text, 'credential',
        ${hash}::text)
    `,
    sql`
      INSERT INTO activity_log (action, entity, entity_id, summary,
        actor_user_id, actor_name, after_json)
      VALUES ('create', 'user', ${id}::text,
        ${`Added ${roleLabel(input.role)} ${input.name}`}::text,
        ${actor.id}::text, ${actor.name}::text,
        ${asJson({ name: input.name, email: input.email, role: input.role })}::jsonb)
    `,
  ]);
  return id;
}

export async function setUserRole(
  id: string,
  role: Role,
  actor: Actor,
): Promise<void> {
  const before = await getUser(id);
  if (!before) throw new InputError('That user no longer exists.');
  if (before.role === role) return;
  if (role !== 'owner') await assertNotLastOwner(id, 'changed');

  const sql = db();
  await sql.transaction([
    sql`
      UPDATE users SET role = ${role}::text, updated_at = now()
      WHERE id = ${id}::text
    `,
    sql`
      INSERT INTO activity_log (action, entity, entity_id, summary,
        actor_user_id, actor_name, before_json, after_json)
      VALUES ('update', 'user', ${id}::text,
        ${`Changed ${before.name} from ${roleLabel(before.role)} to ${roleLabel(role)}`}::text,
        ${actor.id}::text, ${actor.name}::text,
        ${asJson({ role: before.role })}::jsonb, ${asJson({ role })}::jsonb)
    `,
  ]);
}

/**
 * An account is disabled, never deleted: its activity log rows and its payroll
 * approvals have to keep their name. Disabling also drops every session it
 * holds, so somebody already signed in is out at once rather than at the end of
 * the week the cookie would otherwise have run for.
 */
export async function setUserStatus(
  id: string,
  status: 'active' | 'disabled',
  actor: Actor,
): Promise<void> {
  const before = await getUser(id);
  if (!before) throw new InputError('That user no longer exists.');
  if (before.status === status) return;
  if (status === 'disabled') {
    if (id === actor.id) {
      throw new InputError('You cannot disable the account you are signed in with.');
    }
    await assertNotLastOwner(id, 'disabled');
  }

  const sql = db();
  await sql.transaction([
    sql`
      UPDATE users SET status = ${status}::text, updated_at = now()
      WHERE id = ${id}::text
    `,
    // Only when disabling. Enabling somebody has no session to clear.
    ...(status === 'disabled'
      ? [sql`DELETE FROM sessions WHERE user_id = ${id}::text`]
      : []),
    sql`
      INSERT INTO activity_log (action, entity, entity_id, summary,
        actor_user_id, actor_name, before_json, after_json)
      VALUES ('update', 'user', ${id}::text,
        ${`${status === 'disabled' ? 'Disabled' : 'Enabled'} ${before.name}`}::text,
        ${actor.id}::text, ${actor.name}::text,
        ${asJson({ status: before.status })}::jsonb,
        ${asJson({ status })}::jsonb)
    `,
  ]);
}

/**
 * An Owner sets a new password for somebody who cannot get in. Every session
 * that account holds is dropped with it, because a password is reset when it
 * may be known to somebody else.
 *
 * The password itself is never logged, only that it was changed.
 */
export async function resetUserPassword(
  id: string,
  password: string,
  actor: Actor,
): Promise<void> {
  const user = await getUser(id);
  if (!user) throw new InputError('That user no longer exists.');

  const hash = await hashPassword(password);
  const sql = db();
  await sql.transaction([
    sql`
      UPDATE auth_accounts SET password = ${hash}::text, updated_at = now()
      WHERE user_id = ${id}::text AND provider_id = 'credential'
    `,
    sql`DELETE FROM sessions WHERE user_id = ${id}::text`,
    sql`
      INSERT INTO activity_log (action, entity, entity_id, summary,
        actor_user_id, actor_name)
      VALUES ('update', 'user', ${id}::text,
        ${`Reset the password for ${user.name}`}::text,
        ${actor.id}::text, ${actor.name}::text)
    `,
  ]);
}

/**
 * Name and email, changed either by the person themselves on the account screen
 * or by an Owner on the Users screen.
 *
 * The email is the sign-in name, so it is checked for being taken by anybody
 * else, case-insensitively: two accounts differing only in case would be two
 * accounts nobody could tell apart on a screen. Sessions are deliberately left
 * alone. The credential is keyed to the user id and not to the address, so the
 * password still opens the account and there is nothing to sign anybody out of.
 *
 * `actor` is who made the change, which is not always whose account it is: an
 * Owner correcting somebody's address is recorded as the Owner.
 */
export async function updateUserProfile(
  id: string,
  input: { name: string; email: string },
  actor: Actor,
): Promise<void> {
  const before = await getUser(id);
  if (!before) throw new InputError('That user no longer exists.');
  if (await userEmailExists(input.email, id)) {
    throw new InputError(`${input.email} already has an account.`);
  }
  if (before.name === input.name && before.email === input.email) return;

  const changed =
    before.email === input.email
      ? `Renamed ${before.name} to ${input.name}`
      : before.name === input.name
        ? `Changed the email for ${input.name} from ${before.email} to ${input.email}`
        : `Changed ${before.name} (${before.email}) to ${input.name} (${input.email})`;

  const sql = db();
  await sql.transaction([
    sql`
      UPDATE users SET name = ${input.name}::text, email = ${input.email}::text,
        updated_at = now()
      WHERE id = ${id}::text
    `,
    sql`
      INSERT INTO activity_log (actor_user_id, actor_name, action, entity,
        entity_id, summary, before_json, after_json)
      VALUES (${actor.id}::text, ${actor.name}::text, 'update', 'user',
        ${id}::text, ${changed}::text,
        ${asJson({ name: before.name, email: before.email })}::jsonb,
        ${asJson({ name: input.name, email: input.email })}::jsonb)
    `,
  ]);
}

/**
 * Somebody changing their own password.
 *
 * The current one has to be given and is checked here, which is what makes this
 * different from the Owner's reset: it proves the person at the keyboard is the
 * account holder and not somebody who found the screen unlocked.
 *
 * Every other session is dropped, because a password is changed when it may be
 * known to somebody else, and the session in front of the person doing it is
 * kept, because signing them out of the tab they are working in would be a
 * strange reward for securing the account.
 */
export async function changeOwnPassword(
  id: string,
  input: { currentPassword: string; newPassword: string },
  keepSessionId: string | null,
): Promise<void> {
  const user = await getUser(id);
  if (!user) throw new InputError('That user no longer exists.');

  const sql = db();
  const rows = (await sql`
    SELECT password FROM auth_accounts
    WHERE user_id = ${id}::text AND provider_id = 'credential'
  `) as { password: string | null }[];
  const hash = rows[0]?.password;
  if (!hash) {
    throw new InputError(
      'This account has no password set. Ask an Owner to set one.',
    );
  }
  if (!(await verifyPassword({ hash, password: input.currentPassword }))) {
    throw new InputError('That is not your current password.');
  }
  if (input.currentPassword === input.newPassword) {
    throw new InputError('The new password is the same as the current one.');
  }

  const next = await hashPassword(input.newPassword);
  await sql.transaction([
    sql`
      UPDATE auth_accounts SET password = ${next}::text, updated_at = now()
      WHERE user_id = ${id}::text AND provider_id = 'credential'
    `,
    sql`
      DELETE FROM sessions
      WHERE user_id = ${id}::text AND id <> ${keepSessionId ?? ''}::text
    `,
    // The password itself is never logged, only that it changed.
    sql`
      INSERT INTO activity_log (actor_user_id, actor_name, action, entity,
        entity_id, summary)
      VALUES (${id}::text, ${user.name}::text, 'update', 'user', ${id}::text,
        ${`${user.name} changed their own password`}::text)
    `,
  ]);
}

/**
 * Sign out every other device, keeping the one asking. For a shared machine
 * somebody forgot to sign out of, without having to change a password to do it.
 */
export async function signOutOtherSessions(
  id: string,
  keepSessionId: string | null,
  actor: Actor,
): Promise<number> {
  const sql = db();
  const results = (await sql.transaction([
    sql`
      DELETE FROM sessions
      WHERE user_id = ${id}::text AND id <> ${keepSessionId ?? ''}::text
      RETURNING id
    `,
    sql`
      INSERT INTO activity_log (actor_user_id, actor_name, action, entity,
        entity_id, summary)
      VALUES (${actor.id}::text, ${actor.name}::text, 'update', 'user',
        ${id}::text, ${`${actor.name} signed out their other devices`}::text)
    `,
  ])) as unknown[][];
  return (results[0] ?? []).length;
}
