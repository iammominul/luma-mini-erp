import { Money } from './money';
import { db } from './db';
import type { Movement } from './statement';
import {
  type ActivityEntry,
  type Bill,
  type BillSummary,
  type Party,
  type PartyBalance,
  type PartyType,
  type Payment,
  type PaymentMode,
} from './types';

/**
 * Every read in the app. Nothing here writes.
 *
 * Two conventions hold throughout: a money column arrives as a NUMERIC string
 * and becomes Money immediately, and a date column is selected with to_char so
 * it arrives as 'YYYY-MM-DD' text rather than a JS Date built at the wrong
 * midnight.
 */

type Row = Record<string, unknown>;

const text = (value: unknown): string => String(value ?? '');
const maybe = (value: unknown): string | null =>
  value === null || value === undefined || value === '' ? null : String(value);
const money = (value: unknown): Money =>
  Money.fromDecimal(String(value ?? '0'));
const count = (value: unknown): number => Number(value ?? 0);

function toParty(row: Row): Party {
  return {
    id: text(row.id),
    name: text(row.name),
    type: text(row.type) as PartyType,
    contactPerson: maybe(row.contact_person),
    phone: maybe(row.phone),
    address: maybe(row.address),
    openingBalance: money(row.opening_balance),
    openingAsOf: maybe(row.opening_as_of),
    active: Boolean(row.active),
  };
}

export async function listParties(options: {
  type?: PartyType;
  includeInactive?: boolean;
}): Promise<Party[]> {
  const sql = db();
  const type = options.type ?? null;
  const rows = (await sql`
    SELECT id, name, type, contact_person, phone, address, opening_balance,
      to_char(opening_as_of, 'YYYY-MM-DD') AS opening_as_of, active
    FROM party
    WHERE (${type}::text IS NULL OR type = ${type}::text)
      AND (${options.includeInactive ?? false}::boolean OR active)
    ORDER BY name
  `) as Row[];
  return rows.map(toParty);
}

export async function getParty(id: string): Promise<Party | null> {
  const sql = db();
  const rows = (await sql`
    SELECT id, name, type, contact_person, phone, address, opening_balance,
      to_char(opening_as_of, 'YYYY-MM-DD') AS opening_as_of, active
    FROM party WHERE id = ${id}::uuid
  `) as Row[];
  const row = rows[0];
  return row ? toParty(row) : null;
}

export async function partyNameExists(
  name: string,
  type: PartyType,
  excludeId?: string,
): Promise<boolean> {
  const sql = db();
  const exclude = excludeId ?? null;
  const rows = (await sql`
    SELECT 1 FROM party
    WHERE lower(name) = lower(${name}::text) AND type = ${type}::text
      AND (${exclude}::uuid IS NULL OR id <> ${exclude}::uuid)
    LIMIT 1
  `) as Row[];
  return rows.length > 0;
}

/**
 * Outstanding per party, computed on read from the bills and payments: opening
 * balance plus billed minus settled. No balance is ever stored.
 */
export async function listPartyBalances(
  type: PartyType,
): Promise<PartyBalance[]> {
  const sql = db();
  const rows = (await sql`
    SELECT party.id, party.name, party.type, party.contact_person, party.phone,
      party.address, party.opening_balance,
      to_char(party.opening_as_of, 'YYYY-MM-DD') AS opening_as_of, party.active,
      COALESCE(b.total, 0) AS billed,
      COALESCE(b.bill_count, 0) AS bill_count,
      COALESCE(p.total, 0) AS settled,
      to_char(GREATEST(b.last_date, p.last_date), 'YYYY-MM-DD') AS last_activity
    FROM party
    LEFT JOIN (
      SELECT party_id, SUM(total) AS total, COUNT(*) AS bill_count,
             MAX(bill_date) AS last_date
      FROM bill GROUP BY party_id
    ) b ON b.party_id = party.id
    LEFT JOIN (
      SELECT party_id, SUM(amount) AS total, MAX(paid_on) AS last_date
      FROM payment GROUP BY party_id
    ) p ON p.party_id = party.id
    WHERE party.type = ${type}::text
    ORDER BY party.name
  `) as Row[];

  return rows.map((row) => {
    const party = toParty(row);
    const billed = money(row.billed);
    const settled = money(row.settled);
    return {
      party,
      billed,
      settled,
      balance: party.openingBalance.add(billed).subtract(settled),
      billCount: count(row.bill_count),
      lastActivity: maybe(row.last_activity),
    };
  });
}

function toBillSummary(row: Row): BillSummary {
  return {
    id: text(row.id),
    billNo: text(row.bill_no),
    billDate: text(row.bill_date),
    reference: maybe(row.reference),
    notes: maybe(row.notes),
    total: money(row.total),
    partyId: text(row.party_id),
    partyName: text(row.party_name),
    partyType: text(row.party_type) as PartyType,
  };
}

export async function listBills(options: {
  type: PartyType;
  partyId?: string | null;
  from?: string | null;
  to?: string | null;
  limit?: number;
}): Promise<BillSummary[]> {
  const sql = db();
  const partyId = options.partyId ?? null;
  const from = options.from ?? null;
  const to = options.to ?? null;
  const rows = (await sql`
    SELECT bill.id, bill.bill_no, to_char(bill.bill_date, 'YYYY-MM-DD') AS bill_date,
      bill.reference, bill.notes, bill.total,
      bill.party_id, party.name AS party_name, party.type AS party_type
    FROM bill JOIN party ON party.id = bill.party_id
    WHERE party.type = ${options.type}::text
      AND (${partyId}::uuid IS NULL OR bill.party_id = ${partyId}::uuid)
      AND (${from}::date IS NULL OR bill.bill_date >= ${from}::date)
      AND (${to}::date IS NULL OR bill.bill_date <= ${to}::date)
    ORDER BY bill.bill_date DESC, bill.bill_no DESC
    LIMIT ${options.limit ?? 500}::int
  `) as Row[];
  return rows.map(toBillSummary);
}

export async function getBill(id: string): Promise<Bill | null> {
  const sql = db();
  const [billRows, lineRows] = (await Promise.all([
    sql`
      SELECT bill.id, bill.bill_no, to_char(bill.bill_date, 'YYYY-MM-DD') AS bill_date,
        bill.reference, bill.notes, bill.total,
        bill.party_id, party.name AS party_name, party.type AS party_type
      FROM bill JOIN party ON party.id = bill.party_id
      WHERE bill.id = ${id}::uuid
    `,
    sql`
      SELECT id, line_no, description, qty_kg, rate, amount
      FROM bill_line WHERE bill_id = ${id}::uuid ORDER BY line_no
    `,
  ])) as [Row[], Row[]];

  const row = billRows[0];
  if (!row) return null;
  const summary = toBillSummary(row);
  const party = await getParty(summary.partyId);
  if (!party) return null;

  return {
    ...summary,
    party,
    lines: lineRows.map((line) => ({
      id: text(line.id),
      lineNo: count(line.line_no),
      description: text(line.description),
      qtyKg: text(line.qty_kg),
      rate: text(line.rate),
      amount: money(line.amount),
    })),
  };
}

export async function billNoExists(
  partyId: string,
  billNo: string,
  excludeId?: string,
): Promise<boolean> {
  const sql = db();
  const exclude = excludeId ?? null;
  const rows = (await sql`
    SELECT 1 FROM bill
    WHERE party_id = ${partyId}::uuid AND bill_no = ${billNo}::text
      AND (${exclude}::uuid IS NULL OR id <> ${exclude}::uuid)
    LIMIT 1
  `) as Row[];
  return rows.length > 0;
}

function toPayment(row: Row): Payment {
  return {
    id: text(row.id),
    partyId: text(row.party_id),
    partyName: text(row.party_name),
    partyType: text(row.party_type) as PartyType,
    paidOn: text(row.paid_on),
    amount: money(row.amount),
    mode: text(row.mode) as PaymentMode,
    reference: maybe(row.reference),
    notes: maybe(row.notes),
  };
}

export async function listPayments(options: {
  type: PartyType;
  partyId?: string | null;
  from?: string | null;
  to?: string | null;
  limit?: number;
}): Promise<Payment[]> {
  const sql = db();
  const partyId = options.partyId ?? null;
  const from = options.from ?? null;
  const to = options.to ?? null;
  const rows = (await sql`
    SELECT payment.id, payment.party_id, party.name AS party_name,
      party.type AS party_type, to_char(payment.paid_on, 'YYYY-MM-DD') AS paid_on,
      payment.amount, payment.mode, payment.reference, payment.notes
    FROM payment JOIN party ON party.id = payment.party_id
    WHERE party.type = ${options.type}::text
      AND (${partyId}::uuid IS NULL OR payment.party_id = ${partyId}::uuid)
      AND (${from}::date IS NULL OR payment.paid_on >= ${from}::date)
      AND (${to}::date IS NULL OR payment.paid_on <= ${to}::date)
    ORDER BY payment.paid_on DESC, payment.created_at DESC
    LIMIT ${options.limit ?? 500}::int
  `) as Row[];
  return rows.map(toPayment);
}

export async function getPayment(id: string): Promise<Payment | null> {
  const sql = db();
  const rows = (await sql`
    SELECT payment.id, payment.party_id, party.name AS party_name,
      party.type AS party_type, to_char(payment.paid_on, 'YYYY-MM-DD') AS paid_on,
      payment.amount, payment.mode, payment.reference, payment.notes
    FROM payment JOIN party ON party.id = payment.party_id
    WHERE payment.id = ${id}::uuid
  `) as Row[];
  const row = rows[0];
  return row ? toPayment(row) : null;
}

/**
 * Every bill and settlement for one party, as statement movements. The date
 * window is applied while building the statement, not here, so anything before
 * the period can be folded into the opening balance.
 */
export async function listMovements(partyId: string): Promise<Movement[]> {
  const sql = db();
  const rows = (await sql`
    SELECT id::text AS id, 'bill' AS kind,
      to_char(bill_date, 'YYYY-MM-DD') AS date,
      bill_no AS particulars, reference, total AS amount
    FROM bill WHERE party_id = ${partyId}::uuid
    UNION ALL
    SELECT id::text AS id, 'payment' AS kind,
      to_char(paid_on, 'YYYY-MM-DD') AS date,
      mode AS particulars, reference, amount
    FROM payment WHERE party_id = ${partyId}::uuid
  `) as Row[];

  return rows.map((row) => ({
    id: text(row.id),
    kind: text(row.kind) === 'bill' ? ('bill' as const) : ('payment' as const),
    date: text(row.date),
    particulars: text(row.particulars),
    reference: maybe(row.reference),
    amount: money(row.amount),
  }));
}

export async function recentActivity(limit = 12): Promise<ActivityEntry[]> {
  const sql = db();
  const rows = (await sql`
    SELECT id::text AS id,
      to_char(at AT TIME ZONE 'Asia/Dhaka', 'DD Mon YYYY, HH24:MI') AS at,
      action, entity, summary, reason
    FROM activity_log ORDER BY at DESC, id DESC LIMIT ${limit}::int
  `) as Row[];

  return rows.map((row) => ({
    id: text(row.id),
    at: text(row.at),
    action: text(row.action) as ActivityEntry['action'],
    entity: text(row.entity),
    summary: text(row.summary),
    reason: maybe(row.reason),
  }));
}

/** Has the schema been applied yet? Lets the app show setup steps, not a stack trace. */
export async function schemaReady(): Promise<boolean> {
  const sql = db();
  const rows = (await sql`
    SELECT to_regclass('public.party') IS NOT NULL AS ready
  `) as Row[];
  return Boolean(rows[0]?.ready);
}
