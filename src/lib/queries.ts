import { Money } from './money';
import { db } from './db';
import type { Movement } from './statement';
import {
  type ActivityEntry,
  type Bill,
  type BillDirection,
  type BillStatus,
  type BillSummary,
  type NatureOfWork,
  type Party,
  type PartyBalance,
  type PartyRole,
  type Payment,
  type PaymentDirection,
  type PaymentMode,
  natureOfWorkLabel,
  paymentModeLabel,
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
    code: maybe(row.code),
    name: text(row.name),
    roles: {
      customer: Boolean(row.is_customer),
      subcontractor: Boolean(row.is_subcontractor),
      supplier: Boolean(row.is_supplier),
    },
    contactPerson: maybe(row.contact_person),
    phone: maybe(row.phone),
    address: maybe(row.address),
    openingBalance: money(row.opening_balance),
    openingAsOf: maybe(row.opening_as_of),
    active: Boolean(row.active),
  };
}

export async function listParties(options: {
  role?: PartyRole;
  includeInactive?: boolean;
}): Promise<Party[]> {
  const sql = db();
  const role = options.role ?? null;
  const includeInactive = options.includeInactive ?? false;
  const rows = (await sql`
    SELECT id, code, name, is_customer, is_subcontractor, is_supplier,
      contact_person, phone, address, opening_balance,
      to_char(opening_as_of, 'YYYY-MM-DD') AS opening_as_of, active
    FROM party
    WHERE (${role}::text IS NULL
        OR (${role}::text = 'customer' AND is_customer)
        OR (${role}::text = 'subcontractor' AND is_subcontractor)
        OR (${role}::text = 'supplier' AND is_supplier))
      AND (${includeInactive}::boolean OR active)
    ORDER BY name
  `) as Row[];
  return rows.map(toParty);
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * A party by whichever handle a URL carries: its code, which is what the app
 * puts in a link, or its id, which is what older links and bookmarks hold.
 */
export async function findParty(handle: string): Promise<Party | null> {
  if (UUID.test(handle)) return getParty(handle);

  const sql = db();
  const rows = (await sql`
    SELECT id, code, name, is_customer, is_subcontractor, is_supplier,
      contact_person, phone, address, opening_balance,
      to_char(opening_as_of, 'YYYY-MM-DD') AS opening_as_of, active
    FROM party WHERE lower(code) = lower(${handle}::text)
  `) as Row[];
  const row = rows[0];
  return row ? toParty(row) : null;
}

export async function getParty(id: string): Promise<Party | null> {
  const sql = db();
  const rows = (await sql`
    SELECT id, code, name, is_customer, is_subcontractor, is_supplier,
      contact_person, phone, address, opening_balance,
      to_char(opening_as_of, 'YYYY-MM-DD') AS opening_as_of, active
    FROM party WHERE id = ${id}::uuid
  `) as Row[];
  const row = rows[0];
  return row ? toParty(row) : null;
}

/** One company, one party record, so the name is unique outright. */
export async function partyNameExists(
  name: string,
  excludeId?: string,
): Promise<boolean> {
  const sql = db();
  const exclude = excludeId ?? null;
  const rows = (await sql`
    SELECT 1 FROM party
    WHERE lower(name) = lower(${name}::text)
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
  role: PartyRole,
): Promise<PartyBalance[]> {
  const sql = db();
  const rows = (await sql`
    SELECT party.id, party.code, party.name, party.is_customer,
      party.is_subcontractor, party.is_supplier,
      party.contact_person, party.phone,
      party.address, party.opening_balance,
      to_char(party.opening_as_of, 'YYYY-MM-DD') AS opening_as_of, party.active,
      COALESCE(b.total, 0) AS billed,
      COALESCE(b.bill_count, 0) AS bill_count,
      COALESCE(p.total, 0) AS settled,
      COALESCE(b.signed, 0) AS billed_signed,
      COALESCE(p.signed, 0) AS settled_signed,
      to_char(GREATEST(b.last_date, p.last_date), 'YYYY-MM-DD') AS last_activity
    FROM party
    LEFT JOIN (
      SELECT party_id, SUM(total) AS total, COUNT(*) AS bill_count,
             SUM(CASE WHEN direction = 'issued' THEN total ELSE -total END)
               AS signed,
             MAX(bill_date) AS last_date
      FROM bill WHERE status = 'posted' GROUP BY party_id
    ) b ON b.party_id = party.id
    LEFT JOIN (
      SELECT party_id, SUM(amount) AS total,
             SUM(CASE WHEN direction = 'out' THEN amount ELSE -amount END)
               AS signed,
             MAX(paid_on) AS last_date
      FROM payment GROUP BY party_id
    ) p ON p.party_id = party.id
    WHERE (${role}::text = 'customer' AND party.is_customer)
       OR (${role}::text = 'subcontractor' AND party.is_subcontractor)
       OR (${role}::text = 'supplier' AND party.is_supplier)
    ORDER BY party.name
  `) as Row[];

  return rows.map((row) => {
    const party = toParty(row);
    return {
      party,
      billed: money(row.billed),
      settled: money(row.settled),
      // Every figure already carries its own sign, so the balance is a sum.
      balance: party.openingBalance
        .add(money(row.billed_signed))
        .add(money(row.settled_signed)),
      billCount: count(row.bill_count),
      lastActivity: maybe(row.last_activity),
    };
  });
}

function toBillSummary(row: Row): BillSummary {
  return {
    id: text(row.id),
    status: text(row.status) as BillStatus,
    // A bill whose lines have no fabric type or color is real and counted, but
    // still waiting for someone to write down what it was.
    needsDetail: Boolean(row.needs_detail),
    greyKg: maybe(row.grey_kg),
    finishedKg: maybe(row.finished_kg),
    direction: text(row.direction) as BillDirection,
    natureOfWork: text(row.nature_of_work) as NatureOfWork,
    narration: maybe(row.narration),
    billNo: text(row.bill_no),
    bookNo: maybe(row.book_no),
    docNo: maybe(row.doc_no),
    billDate: text(row.bill_date),
    reference: maybe(row.reference),
    notes: maybe(row.notes),
    total: money(row.total),
    partyId: text(row.party_id),
    partyName: text(row.party_name),
  };
}

/**
 * A page of bills, with the totals for the whole filtered set alongside.
 *
 * The totals are deliberately not the page's: someone looking at page two of
 * five still wants to know what the filter comes to in full, and adding up the
 * pages by hand is exactly what a register is meant to save them.
 */
export type BillPage = {
  bills: BillSummary[];
  /** How many bills match, before paging. */
  matched: number;
  totalAmount: Money;
  /** Greige weight across the match, as kg text. */
  totalGreyKg: string;
};

export async function listBills(options: {
  direction: BillDirection;
  partyId?: string | null;
  natureOfWork?: string | null;
  /** 'draft', 'posted', or 'needs_detail' for posted bills still lacking detail. */
  status?: string | null;
  /** Matches the bill number, the system number, or the party name. */
  search?: string | null;
  from?: string | null;
  to?: string | null;
  limit?: number;
  offset?: number;
}): Promise<BillPage> {
  const sql = db();
  const partyId = options.partyId ?? null;
  const natureOfWork = options.natureOfWork ?? null;
  const status = options.status ?? null;
  const search = options.search?.trim() ? `%${options.search.trim()}%` : null;
  const from = options.from ?? null;
  const to = options.to ?? null;
  const limit = options.limit ?? 50;
  const offset = options.offset ?? 0;

  const [rows, totals] = (await Promise.all([
    sql`
      SELECT bill.id, bill.bill_no, bill.book_no, bill.doc_no, bill.narration,
        bill.nature_of_work, bill.direction,
        to_char(bill.bill_date, 'YYYY-MM-DD') AS bill_date,
        bill.reference, bill.notes, bill.total,
        (SELECT SUM(l.grey_kg) FROM bill_line l WHERE l.bill_id = bill.id)
          AS grey_kg,
        (SELECT SUM(l.finished_kg) FROM bill_line l WHERE l.bill_id = bill.id)
          AS finished_kg,
        bill.status,
        EXISTS (SELECT 1 FROM bill_line l WHERE l.bill_id = bill.id
          AND (l.fabric_type IS NULL OR l.color IS NULL)) AS needs_detail,
        bill.party_id, party.name AS party_name
      FROM bill JOIN party ON party.id = bill.party_id
      WHERE bill.direction = ${options.direction}::text
        AND (${partyId}::uuid IS NULL OR bill.party_id = ${partyId}::uuid)
        AND (${natureOfWork}::text IS NULL
          OR bill.nature_of_work = ${natureOfWork}::text)
        AND (${status}::text IS NULL
          OR (${status}::text = 'draft' AND bill.status = 'draft')
          OR (${status}::text = 'posted' AND bill.status = 'posted')
          OR (${status}::text = 'needs_detail' AND bill.status = 'posted'
            AND EXISTS (SELECT 1 FROM bill_line l WHERE l.bill_id = bill.id
              AND (l.fabric_type IS NULL OR l.color IS NULL))))
        AND (${from}::date IS NULL OR bill.bill_date >= ${from}::date)
        AND (${to}::date IS NULL OR bill.bill_date <= ${to}::date)
        AND (${search}::text IS NULL
          OR bill.bill_no ILIKE ${search}::text
          OR bill.doc_no ILIKE ${search}::text
          OR party.name ILIKE ${search}::text)
      ORDER BY bill.bill_date ASC, bill.created_at ASC
      LIMIT ${limit}::int OFFSET ${offset}::int
    `,
    // The same filter again, aggregated over every match rather than the page.
    sql`
      WITH matched AS (
        SELECT bill.id, bill.total
        FROM bill JOIN party ON party.id = bill.party_id
        WHERE bill.direction = ${options.direction}::text
          AND (${partyId}::uuid IS NULL OR bill.party_id = ${partyId}::uuid)
          AND (${natureOfWork}::text IS NULL
            OR bill.nature_of_work = ${natureOfWork}::text)
          AND (${status}::text IS NULL
            OR (${status}::text = 'draft' AND bill.status = 'draft')
            OR (${status}::text = 'posted' AND bill.status = 'posted')
            OR (${status}::text = 'needs_detail' AND bill.status = 'posted'
                AND EXISTS (SELECT 1 FROM bill_line l WHERE l.bill_id = bill.id
                  AND (l.fabric_type IS NULL OR l.color IS NULL))))
          AND (${from}::date IS NULL OR bill.bill_date >= ${from}::date)
          AND (${to}::date IS NULL OR bill.bill_date <= ${to}::date)
          AND (${search}::text IS NULL
            OR bill.bill_no ILIKE ${search}::text
            OR bill.doc_no ILIKE ${search}::text
            OR party.name ILIKE ${search}::text)
      )
      SELECT
        (SELECT COUNT(*) FROM matched) AS matched,
        (SELECT COALESCE(SUM(total), 0) FROM matched) AS total_amount,
        (SELECT COALESCE(SUM(l.grey_kg), 0) FROM bill_line l
          WHERE l.bill_id IN (SELECT id FROM matched)) AS total_grey_kg
    `,
  ])) as [Row[], Row[]];

  const summary = totals[0] ?? {};
  return {
    bills: rows.map(toBillSummary),
    matched: count(summary.matched),
    totalAmount: money(summary.total_amount),
    totalGreyKg: text(summary.total_grey_kg ?? '0'),
  };
}

export async function getBill(id: string): Promise<Bill | null> {
  const sql = db();
  const [billRows, lineRows] = (await Promise.all([
    sql`
      SELECT bill.id, bill.bill_no, bill.book_no, bill.doc_no, bill.narration,
        bill.nature_of_work, bill.direction, bill.status,
        to_char(bill.bill_date, 'YYYY-MM-DD') AS bill_date,
        bill.reference, bill.notes, bill.total,
        (SELECT SUM(l.grey_kg) FROM bill_line l WHERE l.bill_id = bill.id)
          AS grey_kg,
        (SELECT SUM(l.finished_kg) FROM bill_line l WHERE l.bill_id = bill.id)
          AS finished_kg,
        EXISTS (SELECT 1 FROM bill_line l WHERE l.bill_id = bill.id
          AND (l.fabric_type IS NULL OR l.color IS NULL)) AS needs_detail,
        bill.party_id, party.name AS party_name
      FROM bill JOIN party ON party.id = bill.party_id
      WHERE bill.id = ${id}::uuid
    `,
    sql`
      SELECT id, line_no, description, fabric_type, color, challan_no,
        order_no, grey_kg, finished_kg, rate, amount
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
      fabricType: maybe(line.fabric_type),
      color: maybe(line.color),
      challanNo: maybe(line.challan_no),
      orderNo: maybe(line.order_no),
      greyKg: text(line.grey_kg),
      finishedKg: maybe(line.finished_kg),
      rate: text(line.rate),
      amount: money(line.amount),
    })),
  };
}

/**
 * Is this hand-written bill number already used?
 *
 * The two sides scope differently, because the books do. LUMA's own bill book is
 * one serial series written across every customer, so a customer bill number is
 * checked against all customer bills, within its book. A subcontractor's number
 * comes off their own paper, so two subcontractors may each have a bill 889 and
 * the check is scoped to that party.
 *
 * The unique index on (party_id, bill_no) is the database's backstop. The wider
 * customer rule is enforced here, because an index predicate cannot reach the
 * party table to ask whether the row is a customer's.
 */
export async function billNoExists(options: {
  partyId: string;
  direction: BillDirection;
  billNo: string;
  bookNo?: string | null;
  excludeId?: string;
}): Promise<{ taken: boolean; partyName: string | null }> {
  const sql = db();
  const exclude = options.excludeId ?? null;
  const rows = (await sql`
    SELECT party.name AS party_name
    FROM bill JOIN party ON party.id = bill.party_id
    WHERE bill.bill_no = ${options.billNo}::text
      AND (${exclude}::uuid IS NULL OR bill.id <> ${exclude}::uuid)
      AND CASE WHEN ${options.direction}::text = 'issued'
        THEN bill.direction = 'issued'
          AND bill.book_no IS NOT DISTINCT FROM ${options.bookNo ?? null}::text
        ELSE bill.party_id = ${options.partyId}::uuid
          AND bill.direction = 'received'
      END
    LIMIT 1
  `) as Row[];
  const row = rows[0];
  return { taken: Boolean(row), partyName: row ? text(row.party_name) : null };
}

function toPayment(row: Row): Payment {
  return {
    id: text(row.id),
    narration: maybe(row.narration),
    partyId: text(row.party_id),
    partyName: text(row.party_name),
    direction: text(row.direction) as PaymentDirection,
    paidOn: text(row.paid_on),
    amount: money(row.amount),
    mode: text(row.mode) as PaymentMode,
    reference: maybe(row.reference),
    notes: maybe(row.notes),
  };
}

export async function listPayments(options: {
  direction: PaymentDirection;
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
      payment.direction, to_char(payment.paid_on, 'YYYY-MM-DD') AS paid_on,
      payment.amount, payment.mode, payment.reference, payment.narration,
      payment.notes
    FROM payment JOIN party ON party.id = payment.party_id
    WHERE payment.direction = ${options.direction}::text
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
      payment.direction, to_char(payment.paid_on, 'YYYY-MM-DD') AS paid_on,
      payment.amount, payment.mode, payment.reference, payment.narration,
      payment.notes
    FROM payment JOIN party ON party.id = payment.party_id
    WHERE payment.id = ${id}::uuid
  `) as Row[];
  const row = rows[0];
  return row ? toPayment(row) : null;
}

/**
 * Every bill and settlement for one party, as ledger movements.
 *
 * All of them, whatever role the document was raised under. That is the point of
 * one party holding several roles: a dye house that processes our fabric and
 * sells us yarn has one ledger, and the debits and credits in it net off.
 *
 * Each row carries its own side, taken from the document's direction rather than
 * from the party. The date window is applied while building the statement, not
 * here, so anything before the period can be folded into the opening balance.
 *
 * Particulars and Reference are composed here rather than in the page, so the
 * screen and the PDF quote a party the same wording. Reference is the document
 * the row points at, which is the hand-written bill number on a bill and the
 * money receipt or transfer reference on a settlement.
 */
export async function listMovements(partyId: string): Promise<Movement[]> {
  const sql = db();
  const rows = (await sql`
    SELECT b.id::text AS id, 'bill' AS kind,
      CASE WHEN b.direction = 'issued' THEN 'debit' ELSE 'credit' END AS side,
      to_char(b.bill_date, 'YYYY-MM-DD') AS date,
      b.bill_no, b.total AS amount, NULL AS mode, NULL AS note, b.narration,
      b.nature_of_work, b.direction,
      (SELECT string_agg(DISTINCT l.order_no, ', ') FROM bill_line l
        WHERE l.bill_id = b.id AND l.order_no IS NOT NULL) AS order_nos,
      (SELECT string_agg(DISTINCT l.challan_no, ', ') FROM bill_line l
        WHERE l.bill_id = b.id AND l.challan_no IS NOT NULL) AS challan_nos
    FROM bill b
    WHERE b.party_id = ${partyId}::uuid AND b.status = 'posted'
    UNION ALL
    SELECT pay.id::text AS id, 'payment' AS kind,
      CASE WHEN pay.direction = 'out' THEN 'debit' ELSE 'credit' END AS side,
      to_char(pay.paid_on, 'YYYY-MM-DD') AS date,
      pay.reference AS bill_no, pay.amount, pay.mode, pay.notes AS note,
      pay.narration, NULL AS nature_of_work, pay.direction,
      NULL AS order_nos, NULL AS challan_nos
    FROM payment pay
    WHERE pay.party_id = ${partyId}::uuid
  `) as Row[];

  return rows.map((row) => {
    const kind = text(row.kind) === 'bill' ? ('bill' as const) : 'payment';
    return {
      id: text(row.id),
      kind,
      side: text(row.side) === 'debit' ? ('debit' as const) : 'credit',
      date: text(row.date),
      particulars:
        kind === 'bill'
          ? // A narration typed on a bill replaces the composed text outright.
            (maybe(row.narration) ??
            billParticulars(text(row.direction), text(row.nature_of_work)))
          : // A settlement reads "Payment Received / LC / UCB": what it is,
            // how the money moved, then the narration as the detail.
            settlementParticulars(
              text(row.direction),
              text(row.mode),
              maybe(row.narration) ?? maybe(row.note),
            ),
      reference:
        kind === 'bill' ? `Bill No. ${text(row.bill_no)}` : maybe(row.bill_no),
      amount: money(row.amount),
    };
  });
}

/**
 * What a bill row says it is: the work billed for, and nothing else. The challan
 * and order belong to the bill itself, where there is room to list several of
 * them, and repeating them here only crowded the column.
 */
function billParticulars(direction: string, natureOfWork: string): string {
  const work = natureOfWorkLabel(natureOfWork);
  return direction === 'issued' ? `${work} Bill` : `Subcontract ${work} Bill`;
}

/**
 * What a settlement row is, in three parts: that it was a settlement, how the
 * money moved, and whatever was noted about it.
 * "Payment Received / LC / UCB", or "Payment Made / Cheque".
 *
 * The leading word is there even though the Debit and Credit columns already
 * imply it, because a row read on its own, in a photocopy or across a page
 * break, should still say what it is without the reader inferring it.
 */
function settlementParticulars(
  direction: string,
  mode: string,
  note: string | null,
): string {
  const word = direction === 'in' ? 'Payment Received' : 'Payment Made';
  const parts = [word, paymentModeLabel(mode)];
  if (note) parts.push(note);
  return parts.join(' / ');
}

/**
 * The earliest date this party has any activity on, so an unbounded statement
 * can state the span it actually covers instead of calling itself open ended.
 */
export async function earliestActivity(
  partyId: string,
): Promise<string | null> {
  const sql = db();
  const rows = (await sql`
    SELECT to_char(MIN(d), 'YYYY-MM-DD') AS earliest FROM (
      SELECT MIN(bill_date) AS d FROM bill WHERE party_id = ${partyId}::uuid
      UNION ALL
      SELECT MIN(paid_on) FROM payment WHERE party_id = ${partyId}::uuid
      UNION ALL
      SELECT opening_as_of FROM party WHERE id = ${partyId}::uuid
    ) dates
  `) as Row[];
  return rows[0] ? maybe(rows[0].earliest) : null;
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
