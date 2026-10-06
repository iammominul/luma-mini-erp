import { Money } from './money';
import { formatTaka } from './format';
import type { BookSpan } from './dashboard';
import { db } from './db';
import { isDocNo, isUuid } from './ids';
import { can } from './permissions';
import { sideForRole } from './side';
import { formatQtyKg, lineAmount, parseQtyKg, sumMoney } from './amount';
import {
  type OrderLevelInput,
  type OrderLineInput,
  type OrderStage,
  orderStage,
} from './order-costing';
import type {
  LeaveType,
  PerDayBasis,
  RecoverableAdvance,
  RecoveryMode,
} from './payroll';
import type { Movement } from './statement';
import {
  type ActivityEntry,
  type Advance,
  type AppUser,
  type Bill,
  type BillDirection,
  type BillStatus,
  type BillSummary,
  type Employee,
  type EmployeeBalance,
  type Expense,
  type ExpenseCategory,
  type FundCategory,
  type FundMovement,
  type Loan,
  type LoanBalance,
  type OwnerTotals,
  type LeaveRecord,
  type NatureOfWork,
  type OrderCategory,
  type OrderLineOption,
  type OrderStatus,
  type OrderUnit,
  type Party,
  type PartyBalance,
  type PartyRole,
  type Payment,
  type PaymentDirection,
  type PaymentMethod,
  type PaymentMode,
  type PayrollLine,
  type PayrollLineWithRun,
  type PayrollRun,
  type PayrollRunSummary,
  type PayrollStatus,
  type PurchaseOrder,
  type SalesOrder,
  type SourceLineOption,
  type WorkOrder,
  type WorkProcess,
  expenseCategoryTier,
  fundCategoryLabel,
  fundDirection,
  natureOfWorkLabel,
  paymentModeLabel,
  roleOfDirection,
  workProcessLabel,
} from './types';
import type { CashMovement, CashSource } from './cashbook';

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

/**
 * The role a document was raised under. A row written by code older than the
 * party_role column has none until the next schema apply backfills it, and
 * until then it reads as its direction implies: before suppliers existed, a
 * received bill could only have been a subcontractor's.
 */
const roleOf = (role: unknown, direction: unknown): PartyRole =>
  role === 'customer' || role === 'subcontractor' || role === 'supplier'
    ? role
    : roleOfDirection(text(direction) as BillDirection);

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

/**
 * A party by whichever handle a URL carries: its code, which is what the app
 * puts in a link, or its id, which is what older links and bookmarks hold.
 */
export async function findParty(handle: string): Promise<Party | null> {
  if (isUuid(handle)) return getParty(handle);

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
  // A URL can carry anything. Without this the ::uuid cast below throws, and a
  // mistyped address answers with a server error instead of a missing page.
  if (!isUuid(id)) return null;
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
    billNo: maybe(row.bill_no),
    docNo: maybe(row.doc_no),
    partyRole: roleOf(row.party_role, row.direction),
    billDate: text(row.bill_date),
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
  /** Finished weight across the match, as kg text. Blank on lines never keyed. */
  totalFinishedKg: string;
};

/** What a bill register can be ordered by. */
export type BillSort = 'date' | 'billNo';
export type SortDirection = 'asc' | 'desc';

export function isBillSort(value: string): value is BillSort {
  return value === 'date' || value === 'billNo';
}

export async function listBills(options: {
  direction: BillDirection;
  /**
   * The lens. A screen always passes it: a supplier's bill and a
   * subcontractor's bill run the same direction, and only this tells them
   * apart. Omitted, every bill of the direction comes back.
   */
  role?: PartyRole | null;
  partyId?: string | null;
  natureOfWork?: string | null;
  /** 'draft', 'posted', or 'needs_detail' for posted bills still lacking detail. */
  status?: string | null;
  /** Matches the bill number, the system number, or the party name. */
  search?: string | null;
  from?: string | null;
  to?: string | null;
  /** Defaults to the date, newest first: the last bill written is the one being looked for. */
  sort?: BillSort;
  dir?: SortDirection;
  limit?: number;
  offset?: number;
}): Promise<BillPage> {
  const sql = db();
  const role = options.role ?? null;
  const partyId = options.partyId ?? null;
  const natureOfWork = options.natureOfWork ?? null;
  const status = options.status ?? null;
  const search = options.search?.trim() ? `%${options.search.trim()}%` : null;
  const from = options.from ?? null;
  const to = options.to ?? null;
  const sort = options.sort ?? 'date';
  const descending = (options.dir ?? 'desc') === 'desc';
  const limit = options.limit ?? 50;
  const offset = options.offset ?? 0;

  const [rows, totals] = (await Promise.all([
    // The sort keys are worked out in the inner query and ordered on outside it,
    // because the driver binds values and never SQL text: a column name cannot
    // be interpolated into an ORDER BY, so the two columns a register can be
    // ordered by collapse into one numeric key and one text key here.
    //
    // A bill number sorts as a number when it is one, which is every number in
    // LUMA's own bill book: as text, 195 would come before 7. A subcontractor's
    // paper number can carry letters, so the digits in it lead and the text
    // itself breaks the tie, with anything holding no digit at all sorted last.
    sql`
      SELECT * FROM (
        SELECT bill.id, bill.bill_no, bill.doc_no, bill.narration,
          bill.nature_of_work, bill.direction, bill.party_role,
          to_char(bill.bill_date, 'YYYY-MM-DD') AS bill_date,
          bill.notes, bill.total,
          (SELECT SUM(l.grey_kg) FROM bill_line l WHERE l.bill_id = bill.id)
            AS grey_kg,
          (SELECT SUM(l.finished_kg) FROM bill_line l WHERE l.bill_id = bill.id)
            AS finished_kg,
          bill.status,
          EXISTS (SELECT 1 FROM bill_line l WHERE l.bill_id = bill.id
            AND l.color IS NULL) AS needs_detail,
          bill.party_id, party.name AS party_name,
          -- Bill No is the system number (2026-10-06), so ordering by it is
          -- ordering by its serial. A customer draft has none yet and falls
          -- back to the digits of its paper number, then sorts last.
          CASE WHEN ${sort}::text = 'billNo'
            THEN COALESCE(
              CASE WHEN bill.doc_no ~ '^[A-Z]+-[0-9]+-[0-9]+$'
                THEN split_part(bill.doc_no, '-', 3)::numeric END,
              NULLIF(regexp_replace(COALESCE(bill.bill_no, ''), '[^0-9]', '', 'g'),
                '')::numeric)
            ELSE (bill.bill_date - DATE '2000-01-01')::numeric
          END AS sort_num,
          CASE WHEN ${sort}::text = 'billNo'
            THEN COALESCE(bill.doc_no, bill.bill_no, '') ELSE '' END
            AS sort_text,
          -- The serial out of the system's own number, 'CB-26-0120' -> 120.
          -- Null on a bill received, which has no system number, and on
          -- anything that does not match the shape.
          CASE WHEN bill.doc_no ~ '^[A-Z]+-[0-9]+-[0-9]+$'
            THEN split_part(bill.doc_no, '-', 3)::numeric END AS doc_seq,
          bill.created_at AS sort_created
        FROM bill JOIN party ON party.id = bill.party_id
        WHERE bill.direction = ${options.direction}::text
          AND (${role}::text IS NULL OR COALESCE(bill.party_role,
            CASE WHEN bill.direction = 'issued' THEN 'customer'
              ELSE 'subcontractor' END) = ${role}::text)
          AND (${partyId}::uuid IS NULL OR bill.party_id = ${partyId}::uuid)
          AND (${natureOfWork}::text IS NULL
            OR bill.nature_of_work = ${natureOfWork}::text)
          AND (${status}::text IS NULL
            OR (${status}::text = 'draft' AND bill.status = 'draft')
            OR (${status}::text = 'posted' AND bill.status = 'posted')
            OR (${status}::text = 'needs_detail' AND bill.status = 'posted'
              AND EXISTS (SELECT 1 FROM bill_line l WHERE l.bill_id = bill.id
                AND l.color IS NULL)))
          AND (${from}::date IS NULL OR bill.bill_date >= ${from}::date)
          AND (${to}::date IS NULL OR bill.bill_date <= ${to}::date)
          AND (${search}::text IS NULL
            OR bill.bill_no ILIKE ${search}::text
            OR bill.doc_no ILIKE ${search}::text
            OR party.name ILIKE ${search}::text)
      ) sorted
      -- One direction's terms are null for every row and order nothing, so the
      -- pair reads as a single ORDER BY that the direction chooses between.
      --
      -- Two bills on one date are separated by the system's own number, not by
      -- the hand-written one. LUMA ran several bill books at once and the
      -- hand-written numbers do not follow the dates, so they order nothing:
      -- they are what the customer recognizes, and that is all. A bill received
      -- has no system number, so that side falls through to when it was
      -- recorded.
      ORDER BY
        CASE WHEN ${descending}::boolean THEN sort_num END DESC NULLS LAST,
        CASE WHEN NOT ${descending}::boolean THEN sort_num END ASC NULLS LAST,
        CASE WHEN ${descending}::boolean THEN sort_text END DESC,
        CASE WHEN NOT ${descending}::boolean THEN sort_text END ASC,
        CASE WHEN ${descending}::boolean THEN doc_seq END DESC NULLS LAST,
        CASE WHEN NOT ${descending}::boolean THEN doc_seq END ASC NULLS LAST,
        CASE WHEN ${descending}::boolean THEN sort_created END DESC,
        sort_created ASC
      LIMIT ${limit}::int OFFSET ${offset}::int
    `,
    // The same filter again, aggregated over every match rather than the page.
    sql`
      WITH matched AS (
        SELECT bill.id, bill.total
        FROM bill JOIN party ON party.id = bill.party_id
        WHERE bill.direction = ${options.direction}::text
          AND (${role}::text IS NULL OR COALESCE(bill.party_role,
            CASE WHEN bill.direction = 'issued' THEN 'customer'
              ELSE 'subcontractor' END) = ${role}::text)
          AND (${partyId}::uuid IS NULL OR bill.party_id = ${partyId}::uuid)
          AND (${natureOfWork}::text IS NULL
            OR bill.nature_of_work = ${natureOfWork}::text)
          AND (${status}::text IS NULL
            OR (${status}::text = 'draft' AND bill.status = 'draft')
            OR (${status}::text = 'posted' AND bill.status = 'posted')
            OR (${status}::text = 'needs_detail' AND bill.status = 'posted'
                AND EXISTS (SELECT 1 FROM bill_line l WHERE l.bill_id = bill.id
                  AND l.color IS NULL)))
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
          WHERE l.bill_id IN (SELECT id FROM matched)) AS total_grey_kg,
        (SELECT COALESCE(SUM(l.finished_kg), 0) FROM bill_line l
          WHERE l.bill_id IN (SELECT id FROM matched)) AS total_finished_kg
    `,
  ])) as [Row[], Row[]];

  const summary = totals[0] ?? {};
  return {
    bills: rows.map(toBillSummary),
    matched: count(summary.matched),
    totalAmount: money(summary.total_amount),
    totalGreyKg: text(summary.total_grey_kg ?? '0'),
    totalFinishedKg: text(summary.total_finished_kg ?? '0'),
  };
}

/**
 * A bill by whichever handle a URL carries.
 *
 * Every bill is addressed by its system number: `CB-26-0113` for a customer
 * bill, `BR-26-0031` for a bill received (2026-10-06). Each series is gapless
 * and unique across the whole book, so it names one bill. The party's own paper
 * number on a bill received is only unique within that party, which is why it
 * never became the address.
 *
 * The id is always accepted, so no existing link breaks. A customer draft has
 * no number yet and is addressed by its id until it is posted.
 */
export async function findBill(handle: string): Promise<Bill | null> {
  if (isUuid(handle)) return getBill(handle);
  if (!isDocNo(handle)) return null;

  const sql = db();
  const rows = (await sql`
    SELECT id::text AS id FROM bill WHERE upper(doc_no) = upper(${handle}::text)
  `) as Row[];
  const row = rows[0];
  return row ? getBill(text(row.id)) : null;
}

export async function getBill(id: string): Promise<Bill | null> {
  if (!isUuid(id)) return null;
  const sql = db();
  const [billRows, lineRows] = (await Promise.all([
    sql`
      SELECT bill.id, bill.bill_no, bill.doc_no, bill.narration,
        bill.nature_of_work, bill.direction, bill.party_role, bill.status,
        to_char(bill.bill_date, 'YYYY-MM-DD') AS bill_date,
        bill.notes, bill.total,
        (SELECT SUM(l.grey_kg) FROM bill_line l WHERE l.bill_id = bill.id)
          AS grey_kg,
        (SELECT SUM(l.finished_kg) FROM bill_line l WHERE l.bill_id = bill.id)
          AS finished_kg,
        EXISTS (SELECT 1 FROM bill_line l WHERE l.bill_id = bill.id
          AND l.color IS NULL) AS needs_detail,
        bill.party_id, party.name AS party_name
      FROM bill JOIN party ON party.id = bill.party_id
      WHERE bill.id = ${id}::uuid
    `,
    sql`
      SELECT l.id, l.line_no, l.description, l.color, l.challan_no,
        l.order_no, l.lot_no, l.grey_kg, l.finished_kg, l.rate, l.amount,
        l.order_line_id, COALESCE(l.po_line_id, l.wo_line_id) AS source_line_id,
        so.doc_no || ' / ' || sol.line_no AS order_ref,
        COALESCE(po.doc_no || ' / ' || pl.line_no,
          wo.doc_no || ' / ' || wl.line_no) AS source_ref
      FROM bill_line l
      LEFT JOIN sales_order_line sol ON sol.id = l.order_line_id
      LEFT JOIN sales_order so ON so.id = sol.order_id
      LEFT JOIN purchase_order_line pl ON pl.id = l.po_line_id
      LEFT JOIN purchase_order po ON po.id = pl.po_id
      LEFT JOIN work_order_line wl ON wl.id = l.wo_line_id
      LEFT JOIN work_order wo ON wo.id = wl.wo_id
      WHERE l.bill_id = ${id}::uuid ORDER BY l.line_no
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
      color: maybe(line.color),
      challanNo: maybe(line.challan_no),
      orderNo: maybe(line.order_no),
      lotNo: maybe(line.lot_no),
      orderLineId: maybe(line.order_line_id),
      sourceLineId: maybe(line.source_line_id),
      orderRef: maybe(line.order_ref),
      sourceRef: maybe(line.source_ref),
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
/**
 * The serial the next customer bill would take, for the preview on the entry
 * screen.
 *
 * A preview and nothing more. The number is actually issued by the counter bump
 * inside the bill's own transaction, so two clerks entering at once both read
 * the same serial here and get different ones when they save. That is correct
 * and is why the screen labels the field rather than presenting it as settled:
 * the alternative, reserving a number while somebody types, is what leaves holes
 * in the series when they walk away.
 */
export async function nextCustomerBillSerial(): Promise<number> {
  const sql = db();
  const rows = (await sql`
    SELECT value + 1 AS next FROM counter WHERE name = 'customer_bill'
  `) as Row[];
  return count(rows[0]?.next ?? 1);
}

export async function billNoExists(options: {
  partyId: string;
  direction: BillDirection;
  billNo: string;
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
    docNo: maybe(row.doc_no),
    narration: maybe(row.narration),
    partyId: text(row.party_id),
    partyName: text(row.party_name),
    partyRole: roleOf(row.party_role, row.direction),
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
  /** The lens, as on listBills: money out to a supplier and to a subcontractor share a direction. */
  role?: PartyRole | null;
  partyId?: string | null;
  from?: string | null;
  to?: string | null;
  limit?: number;
}): Promise<Payment[]> {
  const sql = db();
  const role = options.role ?? null;
  const partyId = options.partyId ?? null;
  const from = options.from ?? null;
  const to = options.to ?? null;
  const rows = (await sql`
    SELECT payment.id, payment.doc_no, payment.party_id,
      party.name AS party_name, payment.party_role,
      payment.direction, to_char(payment.paid_on, 'YYYY-MM-DD') AS paid_on,
      payment.amount, payment.mode, payment.reference, payment.narration,
      payment.notes
    FROM payment JOIN party ON party.id = payment.party_id
    WHERE payment.direction = ${options.direction}::text
      AND (${role}::text IS NULL OR COALESCE(payment.party_role,
        CASE WHEN payment.direction = 'in' THEN 'customer'
          ELSE 'subcontractor' END) = ${role}::text)
      AND (${partyId}::uuid IS NULL OR payment.party_id = ${partyId}::uuid)
      AND (${from}::date IS NULL OR payment.paid_on >= ${from}::date)
      AND (${to}::date IS NULL OR payment.paid_on <= ${to}::date)
    ORDER BY payment.paid_on DESC, payment.created_at DESC
    LIMIT ${options.limit ?? 500}::int
  `) as Row[];
  return rows.map(toPayment);
}

/**
 * A receipt or payment by whichever handle a URL carries: its voucher number,
 * `MR-26-0042` or `PV-26-0018`, or its id. The id redirects to the number, as a
 * bill's does.
 */
export async function findPayment(handle: string): Promise<Payment | null> {
  if (isUuid(handle)) return getPayment(handle);
  if (!isDocNo(handle)) return null;

  const sql = db();
  const rows = (await sql`
    SELECT id::text AS id FROM payment WHERE upper(doc_no) = upper(${handle}::text)
  `) as Row[];
  const row = rows[0];
  return row ? getPayment(text(row.id)) : null;
}

export async function getPayment(id: string): Promise<Payment | null> {
  if (!isUuid(id)) return null;
  const sql = db();
  const rows = (await sql`
    SELECT payment.id, payment.doc_no, payment.party_id,
      party.name AS party_name, payment.party_role,
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
 * the row points at, by the number the party was given for it (2026-10-06):
 * a customer bill's CB number with its Paper Ref beside it, a bill received by
 * the party's own number (its BR number is the book's, never printed to them),
 * and a receipt or payment by its MR or PV number with the paper serial or
 * cheque reference beside it.
 */
export async function listMovements(partyId: string): Promise<Movement[]> {
  if (!isUuid(partyId)) return [];
  const sql = db();
  const rows = (await sql`
    SELECT b.id::text AS id, 'bill' AS kind,
      CASE WHEN b.direction = 'issued' THEN 'debit' ELSE 'credit' END AS side,
      to_char(b.bill_date, 'YYYY-MM-DD') AS date,
      b.doc_no, b.bill_no AS paper_ref,
      b.total AS amount, NULL AS mode, NULL AS note, b.narration,
      b.nature_of_work, b.direction,
      -- What orders two documents on one date. See compare() in statement.ts.
      CASE WHEN b.doc_no ~ '^[A-Z]+-[0-9]+-[0-9]+$'
        THEN split_part(b.doc_no, '-', 3)::numeric END AS seq,
      to_char(b.created_at, 'YYYY-MM-DD"T"HH24:MI:SS.US') AS recorded_at,
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
      pay.doc_no, pay.reference AS paper_ref,
      pay.amount, pay.mode, pay.notes AS note,
      pay.narration, NULL AS nature_of_work, pay.direction,
      -- A settlement has never carried a system number of its own.
      NULL AS seq,
      to_char(pay.created_at, 'YYYY-MM-DD"T"HH24:MI:SS.US') AS recorded_at,
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
      reference: movementReference(
        kind,
        text(row.direction),
        maybe(row.doc_no),
        maybe(row.paper_ref),
      ),
      seq: row.seq === null || row.seq === undefined ? null : Number(row.seq),
      recordedAt: text(row.recorded_at),
      amount: money(row.amount),
    };
  });
}

/**
 * The Reference column of a ledger row. See listMovements for the rules. A
 * paper number that repeats the system number (bills keyed before the system
 * numbered them carry it in both) is not printed twice.
 */
function movementReference(
  kind: 'bill' | 'payment',
  direction: string,
  docNo: string | null,
  paperRef: string | null,
): string | null {
  if (kind === 'bill' && direction === 'received') {
    return paperRef ? `Bill No. ${paperRef}` : null;
  }
  const extra = paperRef && paperRef !== docNo ? paperRef : null;
  if (docNo && extra) return `${docNo} / ${extra}`;
  return docNo ?? extra;
}

/**
 * What a bill row says it is: the work billed for, and nothing else. The challan
 * and order belong to the bill itself, where there is room to list several of
 * them, and repeating them here only crowded the column.
 */
function billParticulars(direction: string, natureOfWork: string): string {
  const work = natureOfWorkLabel(natureOfWork);
  // A supplier's yarn bill is a purchase, not subcontracted work.
  if (natureOfWork === 'yarn') return 'Yarn Purchase Bill';
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
  if (!isUuid(partyId)) return null;
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
  // actor_name is the name as it was when the row was written, so this reads
  // back correctly even after somebody is renamed. There is no join to users.
  //
  // ORDER BY names the table columns, and it has to. Postgres resolves an
  // ORDER BY against the output names before the table's, so ordering by `at`
  // while `at` is also the alias of the formatted string sorts the text
  // "14 Aug 2026, 12:45" rather than the timestamp, and ordering by `id` sorts
  // the text cast, where '9' lands after '10'. Both are wrong and neither is
  // visible until two entries share a minute or the list crosses a month.
  // The aliases are named apart from the columns so the trap cannot come back.
  const rows = (await sql`
    SELECT activity_log.id::text AS entry_id,
      to_char(activity_log.at AT TIME ZONE 'Asia/Dhaka', 'DD Mon YYYY, HH24:MI')
        AS at_label,
      action, entity, summary, reason, actor_name
    FROM activity_log
    ORDER BY activity_log.at DESC, activity_log.id DESC
    LIMIT ${limit}::int
  `) as Row[];

  return rows.map((row) => ({
    id: text(row.entry_id),
    at: text(row.at_label),
    action: text(row.action) as ActivityEntry['action'],
    entity: text(row.entity),
    summary: text(row.summary),
    reason: maybe(row.reason),
    actorName: maybe(row.actor_name),
  }));
}

// Users -----------------------------------------------------------------------
//
// The auth tables are Better Auth's and it owns writing them. These reads are
// for the Users screen only, and none of them touches auth_accounts: a password
// hash has no business leaving that table.

export async function listUsers(): Promise<AppUser[]> {
  const sql = db();
  const rows = (await sql`
    SELECT u.id, u.name, u.email, u.role, u.status,
      to_char(u.created_at AT TIME ZONE 'Asia/Dhaka', 'DD Mon YYYY') AS created_at,
      to_char(u.last_signed_in_at AT TIME ZONE 'Asia/Dhaka', 'DD Mon YYYY, HH24:MI')
        AS last_signed_in_at,
      EXISTS (
        SELECT 1 FROM sessions s
        WHERE s.user_id = u.id AND s.expires_at > now()
      ) AS has_live_session
    FROM users u
    ORDER BY u.created_at
  `) as Row[];

  return rows.map((row) => ({
    id: text(row.id),
    name: text(row.name),
    email: text(row.email),
    role: text(row.role) as AppUser['role'],
    status: text(row.status) as AppUser['status'],
    createdAt: text(row.created_at),
    lastSignedInAt: maybe(row.last_signed_in_at),
    hasLiveSession: row.has_live_session === true,
  }));
}

export async function getUser(id: string): Promise<AppUser | null> {
  const sql = db();
  // Better Auth generates the id, so this is text and takes no ::uuid cast.
  // Rule 12 is satisfied without isUuid: nothing here can throw on a bad shape.
  const rows = (await sql`
    SELECT u.id, u.name, u.email, u.role, u.status,
      to_char(u.created_at AT TIME ZONE 'Asia/Dhaka', 'DD Mon YYYY') AS created_at,
      to_char(u.last_signed_in_at AT TIME ZONE 'Asia/Dhaka', 'DD Mon YYYY, HH24:MI')
        AS last_signed_in_at,
      EXISTS (
        SELECT 1 FROM sessions s
        WHERE s.user_id = u.id AND s.expires_at > now()
      ) AS has_live_session
    FROM users u WHERE u.id = ${id}::text
  `) as Row[];
  const row = rows[0];
  if (!row) return null;
  return {
    id: text(row.id),
    name: text(row.name),
    email: text(row.email),
    role: text(row.role) as AppUser['role'],
    status: text(row.status) as AppUser['status'],
    createdAt: text(row.created_at),
    lastSignedInAt: maybe(row.last_signed_in_at),
    hasLiveSession: row.has_live_session === true,
  };
}

export async function userEmailExists(
  email: string,
  exceptId?: string,
): Promise<boolean> {
  const sql = db();
  const rows = (await sql`
    SELECT 1 FROM users
    WHERE lower(email) = lower(${email}::text)
      AND (${exceptId ?? null}::text IS NULL OR id <> ${exceptId ?? null}::text)
    LIMIT 1
  `) as Row[];
  return rows.length > 0;
}

/**
 * How many active Owners there are apart from this one. Zero means the account
 * being changed is the last way into user management, and the change is refused.
 */
export async function otherActiveOwners(exceptId: string): Promise<number> {
  const sql = db();
  const rows = (await sql`
    SELECT count(*)::int AS count FROM users
    WHERE role = 'owner' AND status = 'active' AND id <> ${exceptId}::text
  `) as Row[];
  return Number(rows[0]?.count ?? 0);
}

/** Has the schema been applied yet? Lets the app show setup steps, not a stack trace. */
export async function schemaReady(): Promise<boolean> {
  const sql = db();
  const rows = (await sql`
    SELECT to_regclass('public.party') IS NOT NULL AS ready
  `) as Row[];
  return Boolean(rows[0]?.ready);
}
// HR and payroll -------------------------------------------------
//
// Same two conventions as everything above: money arrives as a NUMERIC string
// and becomes Money at once, a date arrives through to_char as 'YYYY-MM-DD'.
// Every balance and every run total is worked out here on read. The only
// figures read back rather than recomputed are the ones on a payroll line,
// because those are a record of what was actually paid.

function toEmployee(row: Row): Employee {
  return {
    id: text(row.id),
    code: maybe(row.code),
    name: text(row.name),
    designation: maybe(row.designation),
    phone: maybe(row.phone),
    nid: maybe(row.nid),
    address: maybe(row.address),
    joinedOn: maybe(row.joined_on),
    active: Boolean(row.active),
    basic: money(row.basic),
    houseRent: money(row.house_rent),
    medical: money(row.medical),
    conveyance: money(row.conveyance),
    mobileAllowance: money(row.mobile_allowance),
    otherAllowance: money(row.other_allowance),
    gross: money(row.gross),
    paymentMethod: text(row.payment_method || 'cash') as PaymentMethod,
    bankName: maybe(row.bank_name),
    accountNo: maybe(row.account_no),
    mfsNumber: maybe(row.mfs_number),
  };
}

function toExpense(row: Row): Expense {
  return {
    id: text(row.id),
    docNo: maybe(row.doc_no),
    spentOn: text(row.spent_on),
    category: text(row.category) as ExpenseCategory,
    payee: maybe(row.payee),
    description: text(row.description),
    amount: money(row.amount),
    mode: text(row.mode) as PaymentMode,
    reference: maybe(row.reference),
    orderNo: maybe(row.order_no),
    salesOrderId: maybe(row.sales_order_id),
    orderLineId: maybe(row.order_line_id),
    orderDocNo: maybe(row.order_doc_no),
    notes: maybe(row.notes),
  };
}

function toAdvance(row: Row): Advance {
  return {
    id: text(row.id),
    docNo: maybe(row.doc_no),
    employeeId: text(row.employee_id),
    employeeName: text(row.employee_name),
    employeeCode: maybe(row.employee_code),
    paidOn: text(row.paid_on),
    amount: money(row.amount),
    mode: text(row.mode) as PaymentMode,
    reference: maybe(row.reference),
    reason: maybe(row.reason),
    notes: maybe(row.notes),
    recoveryMode: text(row.recovery_mode) as RecoveryMode,
    installmentAmount:
      row.installment_amount == null ? null : money(row.installment_amount),
    recoverFrom: maybe(row.recover_from),
  };
}

function toPayrollRun(row: Row): PayrollRun {
  return {
    id: text(row.id),
    docNo: maybe(row.doc_no),
    period: text(row.period),
    status: text(row.status) as PayrollStatus,
    perDayBasis: text(row.per_day_basis) as PerDayBasis,
    recoverAdvances: Boolean(row.recover_advances),
    notes: maybe(row.notes),
    approvedBy: maybe(row.approved_by),
    approvedAt: maybe(row.approved_at),
    paidBy: maybe(row.paid_by),
    paidAt: maybe(row.paid_at),
  };
}

function toPayrollLine(row: Row): PayrollLine {
  return {
    id: text(row.id),
    runId: text(row.run_id),
    employeeId: text(row.employee_id),
    employeeName: text(row.employee_name),
    employeeCode: maybe(row.employee_code),
    basic: money(row.basic),
    houseRent: money(row.house_rent),
    medical: money(row.medical),
    conveyance: money(row.conveyance),
    mobileAllowance: money(row.mobile_allowance),
    otherAllowance: money(row.other_allowance),
    gross: money(row.gross),
    designation: maybe(row.designation),
    absentDays: text(row.absent_days ?? '0'),
    bonus: money(row.bonus),
    additionalAllowance: money(row.additional_allowance),
    advanceDeduction: money(row.advance_deduction),
    otherDeduction: money(row.other_deduction),
    remarks: maybe(row.remarks),
    absenceDeduction: money(row.absence_deduction),
    netPaid: money(row.net_paid),
    paidOn: maybe(row.paid_on),
  };
}

export async function listEmployees(
  options: { activeOnly?: boolean } = {},
): Promise<Employee[]> {
  const sql = db();
  const activeOnly = options.activeOnly ?? false;
  const rows = (await sql`
    SELECT id, code, name, designation, phone, nid, address,
      to_char(joined_on, 'YYYY-MM-DD') AS joined_on, active,
      basic, house_rent, medical, conveyance, mobile_allowance, other_allowance,
      gross, payment_method, bank_name, account_no, mfs_number
    FROM employee
    WHERE (${activeOnly}::boolean IS NOT TRUE OR active)
    ORDER BY active DESC, name
  `) as Row[];
  return rows.map(toEmployee);
}

/**
 * Every employee with the advance and salary figures worked out on read.
 *
 * The two sides are aggregated separately before they meet. Joining advances
 * and payroll lines in one pass pairs every advance with every line and
 * inflates both totals, which only shows up once somebody has taken two
 * advances in a month.
 *
 * A deduction only counts against the outstanding advance once its run is
 * approved. A draft can still be abandoned, so counting it would show an
 * advance as recovered when no money had moved; counting approved as well as
 * paid is what stops the same advance being offered back twice across two open
 * months.
 */
export async function listEmployeeBalances(): Promise<EmployeeBalance[]> {
  const sql = db();
  const rows = (await sql`
    WITH adv AS (
      SELECT employee_id, SUM(amount) AS paid
      FROM advance GROUP BY employee_id
    ), pay AS (
      SELECT l.employee_id,
        SUM(l.advance_deduction) FILTER (WHERE r.status IN ('approved', 'paid'))
          AS recovered,
        SUM(l.net_paid) FILTER (WHERE r.status = 'paid') AS net,
        MAX(r.period) FILTER (WHERE r.status = 'paid') AS last_period
      FROM payroll_line l JOIN payroll_run r ON r.id = l.run_id
      GROUP BY l.employee_id
    )
    SELECT e.id, e.code, e.name, e.designation, e.phone, e.nid, e.address,
      to_char(e.joined_on, 'YYYY-MM-DD') AS joined_on, e.active,
      e.basic, e.house_rent, e.medical, e.conveyance, e.mobile_allowance,
      e.other_allowance, e.gross, e.payment_method, e.bank_name, e.account_no,
      e.mfs_number,
      COALESCE(adv.paid, 0) AS advance_paid,
      COALESCE(pay.recovered, 0) AS advance_recovered,
      COALESCE(pay.net, 0) AS salary_paid,
      pay.last_period
    FROM employee e
    LEFT JOIN adv ON adv.employee_id = e.id
    LEFT JOIN pay ON pay.employee_id = e.id
    ORDER BY e.active DESC, e.name
  `) as Row[];
  return rows.map((row) => {
    const advancePaid = money(row.advance_paid);
    const advanceRecovered = money(row.advance_recovered);
    return {
      ...toEmployee(row),
      advancePaid,
      advanceRecovered,
      advanceOutstanding: advancePaid.subtract(advanceRecovered),
      salaryPaid: money(row.salary_paid),
      lastPaidPeriod: maybe(row.last_period),
    };
  });
}

/**
 * What each employee's advances want back, ready for the recovery arithmetic.
 *
 * Two aggregates that never meet in SQL: the advances themselves, and the total
 * already recovered. They are handed to plannedRecovery in payroll.ts, which
 * apportions one against the other. Nothing is decided here.
 *
 * Recovered counts approved and paid runs only, the same rule as
 * listEmployeeBalances. A draft can still be abandoned, and this is called while
 * generating or refilling a draft: counting drafts would let a run see its own
 * proposed figures as already recovered and offer nothing the second time.
 */
export async function advancesForRecovery(): Promise<
  Map<string, { advances: RecoverableAdvance[]; recoveredToDate: Money }>
> {
  const sql = db();
  const [advanceRows, recoveredRows] = (await Promise.all([
    sql`
      SELECT id, employee_id, to_char(paid_on, 'YYYY-MM-DD') AS paid_on,
        amount, recovery_mode, installment_amount, recover_from
      FROM advance
      ORDER BY employee_id, paid_on, id
    `,
    sql`
      SELECT l.employee_id, SUM(l.advance_deduction) AS recovered
      FROM payroll_line l JOIN payroll_run r ON r.id = l.run_id
      WHERE r.status IN ('approved', 'paid')
      GROUP BY l.employee_id
    `,
  ])) as [Row[], Row[]];

  const recovered = new Map(
    recoveredRows.map((row) => [text(row.employee_id), money(row.recovered)]),
  );

  const byEmployee = new Map<
    string,
    { advances: RecoverableAdvance[]; recoveredToDate: Money }
  >();
  for (const row of advanceRows) {
    const employeeId = text(row.employee_id);
    let entry = byEmployee.get(employeeId);
    if (!entry) {
      entry = {
        advances: [],
        recoveredToDate: recovered.get(employeeId) ?? Money.ZERO,
      };
      byEmployee.set(employeeId, entry);
    }
    entry.advances.push({
      id: text(row.id),
      paidOn: text(row.paid_on),
      amount: money(row.amount),
      recoveryMode: text(row.recovery_mode) as RecoveryMode,
      installmentAmount:
        row.installment_amount == null ? null : money(row.installment_amount),
      recoverFrom: maybe(row.recover_from),
    });
  }
  return byEmployee;
}

export async function getEmployee(id: string): Promise<Employee | null> {
  if (!isUuid(id)) return null;
  const sql = db();
  const rows = (await sql`
    SELECT id, code, name, designation, phone, nid, address,
      to_char(joined_on, 'YYYY-MM-DD') AS joined_on, active,
      basic, house_rent, medical, conveyance, mobile_allowance, other_allowance,
      gross, payment_method, bank_name, account_no, mfs_number
    FROM employee WHERE id = ${id}::uuid
  `) as Row[];
  const row = rows[0];
  return row ? toEmployee(row) : null;
}

/** By EMP code or by uuid, so a spoken code and an old link both resolve. */
export async function findEmployee(handle: string): Promise<Employee | null> {
  if (isUuid(handle)) return getEmployee(handle);
  const sql = db();
  const rows = (await sql`
    SELECT id, code, name, designation, phone, nid, address,
      to_char(joined_on, 'YYYY-MM-DD') AS joined_on, active,
      basic, house_rent, medical, conveyance, mobile_allowance, other_allowance,
      gross, payment_method, bank_name, account_no, mfs_number
    FROM employee WHERE lower(code) = lower(${handle})
  `) as Row[];
  const row = rows[0];
  return row ? toEmployee(row) : null;
}

export async function employeeNameExists(
  name: string,
  exceptId?: string,
): Promise<boolean> {
  const sql = db();
  const except = exceptId && isUuid(exceptId) ? exceptId : null;
  const rows = (await sql`
    SELECT 1 FROM employee
    WHERE lower(name) = lower(${name})
      AND (${except}::uuid IS NULL OR id <> ${except}::uuid)
    LIMIT 1
  `) as Row[];
  return rows.length > 0;
}

/** What one employee still owes. Same rule as the list: approved counts. */
export async function employeeAdvanceOutstanding(
  employeeId: string,
): Promise<Money> {
  if (!isUuid(employeeId)) return Money.ZERO;
  const sql = db();
  const rows = (await sql`
    SELECT
      COALESCE((SELECT SUM(amount) FROM advance
        WHERE employee_id = ${employeeId}::uuid), 0)
      - COALESCE((SELECT SUM(l.advance_deduction)
        FROM payroll_line l JOIN payroll_run r ON r.id = l.run_id
        WHERE l.employee_id = ${employeeId}::uuid
          AND r.status IN ('approved', 'paid')), 0) AS outstanding
  `) as Row[];
  return money(rows[0]?.outstanding);
}

export async function listExpenses(
  options: {
    category?: string | null;
    from?: string | null;
    to?: string | null;
    limit?: number;
  } = {},
): Promise<Expense[]> {
  const sql = db();
  const category = options.category ?? null;
  const from = options.from ?? null;
  const to = options.to ?? null;
  const rows = (await sql`
    SELECT id, doc_no, to_char(spent_on, 'YYYY-MM-DD') AS spent_on, category, order_no,
      sales_order_id, order_line_id,
      (SELECT so.doc_no FROM sales_order so WHERE so.id = expense.sales_order_id)
        AS order_doc_no,
      payee, description, amount, mode, reference, notes
    FROM expense
    WHERE (${category}::text IS NULL OR category = ${category}::text)
      AND (${from}::date IS NULL OR spent_on >= ${from}::date)
      AND (${to}::date IS NULL OR spent_on <= ${to}::date)
    ORDER BY spent_on DESC, created_at DESC
    LIMIT ${options.limit ?? 500}::int
  `) as Row[];
  return rows.map(toExpense);
}

/** Expenses grouped by category for a window, for the summary on the list. */
export async function expenseTotalsByCategory(
  options: { from?: string | null; to?: string | null } = {},
): Promise<{ category: ExpenseCategory; total: Money; count: number }[]> {
  const sql = db();
  const from = options.from ?? null;
  const to = options.to ?? null;
  const rows = (await sql`
    SELECT category, SUM(amount) AS total, COUNT(*) AS entries
    FROM expense
    WHERE (${from}::date IS NULL OR spent_on >= ${from}::date)
      AND (${to}::date IS NULL OR spent_on <= ${to}::date)
    GROUP BY category
    ORDER BY SUM(amount) DESC
  `) as Row[];
  return rows.map((row) => ({
    category: text(row.category) as ExpenseCategory,
    total: money(row.total),
    count: count(row.entries),
  }));
}

export async function getExpense(id: string): Promise<Expense | null> {
  if (!isUuid(id)) return null;
  const sql = db();
  const rows = (await sql`
    SELECT id, doc_no, to_char(spent_on, 'YYYY-MM-DD') AS spent_on, category, order_no,
      sales_order_id, order_line_id,
      (SELECT so.doc_no FROM sales_order so WHERE so.id = expense.sales_order_id)
        AS order_doc_no,
      payee, description, amount, mode, reference, notes
    FROM expense WHERE id = ${id}::uuid
  `) as Row[];
  const row = rows[0];
  return row ? toExpense(row) : null;
}

/** By voucher number or by uuid, the same rule a bill follows. */
export async function findExpense(handle: string): Promise<Expense | null> {
  if (isUuid(handle)) return getExpense(handle);
  if (!isDocNo(handle)) return null;
  const sql = db();
  const rows = (await sql`
    SELECT id, doc_no, to_char(spent_on, 'YYYY-MM-DD') AS spent_on, category, order_no,
      sales_order_id, order_line_id,
      (SELECT so.doc_no FROM sales_order so WHERE so.id = expense.sales_order_id)
        AS order_doc_no,
      payee, description, amount, mode, reference, notes
    FROM expense WHERE lower(doc_no) = lower(${handle})
  `) as Row[];
  const row = rows[0];
  return row ? toExpense(row) : null;
}

// Fund flow ------------------------------------------------------------------

function toLoan(row: Row): Loan {
  return {
    id: text(row.id),
    code: maybe(row.code),
    lender: text(row.lender),
    reference: maybe(row.reference),
    takenOn: text(row.taken_on),
    terms: maybe(row.terms),
    active: Boolean(row.active),
    notes: maybe(row.notes),
  };
}

function toFundMovement(row: Row): FundMovement {
  const category = text(row.category) as FundCategory;
  return {
    id: text(row.id),
    docNo: maybe(row.doc_no),
    movedOn: text(row.moved_on),
    category,
    // Read off the category rather than stored on the row, so there is one
    // place the mapping lives and no way for the two to disagree.
    direction: fundDirection(category),
    loanId: maybe(row.loan_id),
    loanCode: maybe(row.loan_code),
    lender: maybe(row.lender),
    description: text(row.description),
    amount: money(row.amount),
    interestAmount: money(row.interest_amount),
    mode: text(row.mode) as PaymentMode,
    reference: maybe(row.reference),
    notes: maybe(row.notes),
  };
}

/**
 * Every loan with what is still owed on it, worked out on read.
 *
 * Outstanding is received less principal repaid. Interest is carried beside it
 * and never inside it, because a loan does not become more owed because
 * interest was paid on it.
 *
 * The movements are aggregated in a grouped subquery and joined on loan_id
 * rather than joined directly, which would repeat the loan row once per
 * movement and multiply every figure taken off it.
 */
export async function listLoans(
  options: { activeOnly?: boolean } = {},
): Promise<LoanBalance[]> {
  const sql = db();
  const activeOnly = options.activeOnly ?? false;
  const rows = (await sql`
    SELECT l.id, l.code, l.lender, l.reference,
      to_char(l.taken_on, 'YYYY-MM-DD') AS taken_on, l.terms, l.active, l.notes,
      COALESCE(m.received, 0) AS received,
      COALESCE(m.repaid, 0) AS repaid,
      COALESCE(m.received, 0) - COALESCE(m.repaid, 0) AS outstanding,
      COALESCE(m.interest_paid, 0) AS interest_paid,
      to_char(m.last_moved_on, 'YYYY-MM-DD') AS last_moved_on,
      COALESCE(m.movements, 0) AS movements
    FROM loan l
    LEFT JOIN (
      SELECT loan_id,
        SUM(amount) FILTER (WHERE category = 'loan_received') AS received,
        SUM(amount) FILTER (WHERE category = 'loan_repayment') AS repaid,
        SUM(interest_amount) AS interest_paid,
        MAX(moved_on) AS last_moved_on,
        COUNT(*) AS movements
      FROM fund_movement WHERE loan_id IS NOT NULL GROUP BY loan_id
    ) m ON m.loan_id = l.id
    WHERE (${activeOnly}::boolean = false OR l.active)
    ORDER BY l.active DESC, l.taken_on DESC, l.lender
  `) as Row[];
  return rows.map((row) => ({
    ...toLoan(row),
    received: money(row.received),
    repaid: money(row.repaid),
    outstanding: money(row.outstanding),
    interestPaid: money(row.interest_paid),
    lastMovementOn: maybe(row.last_moved_on),
    movementCount: count(row.movements),
  }));
}

export async function getLoan(id: string): Promise<Loan | null> {
  if (!isUuid(id)) return null;
  const sql = db();
  const rows = (await sql`
    SELECT id, code, lender, reference,
      to_char(taken_on, 'YYYY-MM-DD') AS taken_on, terms, active, notes
    FROM loan WHERE id = ${id}::uuid
  `) as Row[];
  const row = rows[0];
  return row ? toLoan(row) : null;
}

/** By loan code or by uuid, the same rule a party follows. */
export async function findLoan(handle: string): Promise<Loan | null> {
  if (isUuid(handle)) return getLoan(handle);
  const sql = db();
  const rows = (await sql`
    SELECT id, code, lender, reference,
      to_char(taken_on, 'YYYY-MM-DD') AS taken_on, terms, active, notes
    FROM loan WHERE lower(code) = lower(${handle})
  `) as Row[];
  const row = rows[0];
  return row ? toLoan(row) : null;
}

/** How many movements point at a loan, which is what stops a delete. */
export async function loanMovementCount(id: string): Promise<number> {
  if (!isUuid(id)) return 0;
  const sql = db();
  const rows = (await sql`
    SELECT COUNT(*) AS entries FROM fund_movement WHERE loan_id = ${id}::uuid
  `) as Row[];
  return count(rows[0]?.entries);
}

/** One loan's own movements, for its ledger. */
export async function listLoanMovements(
  loanId: string,
): Promise<FundMovement[]> {
  if (!isUuid(loanId)) return [];
  const sql = db();
  const rows = (await sql`
    SELECT f.id, f.doc_no, to_char(f.moved_on, 'YYYY-MM-DD') AS moved_on,
      f.category, f.loan_id, l.code AS loan_code, l.lender, f.description,
      f.amount, f.interest_amount, f.mode, f.reference, f.notes
    FROM fund_movement f JOIN loan l ON l.id = f.loan_id
    WHERE f.loan_id = ${loanId}::uuid
    ORDER BY f.moved_on, f.created_at
  `) as Row[];
  return rows.map(toFundMovement);
}

/** What the owner put in and took out, most recent first. */
export async function listOwnerMovements(
  options: { from?: string | null; to?: string | null; limit?: number } = {},
): Promise<FundMovement[]> {
  const sql = db();
  const from = options.from ?? null;
  const to = options.to ?? null;
  const rows = (await sql`
    SELECT f.id, f.doc_no, to_char(f.moved_on, 'YYYY-MM-DD') AS moved_on,
      f.category, f.loan_id, NULL::text AS loan_code, NULL::text AS lender,
      f.description, f.amount, f.interest_amount, f.mode, f.reference, f.notes
    FROM fund_movement f
    WHERE f.category IN ('capital_introduced', 'owner_drawing')
      AND (${from}::date IS NULL OR f.moved_on >= ${from}::date)
      AND (${to}::date IS NULL OR f.moved_on <= ${to}::date)
    ORDER BY f.moved_on DESC, f.created_at DESC
    LIMIT ${options.limit ?? 500}::int
  `) as Row[];
  return rows.map(toFundMovement);
}

/**
 * What the owner has put in and taken out, and what stands to their name.
 *
 * One owner, so there is nothing to group by. This is deliberately not built on
 * the loan ledger: it needs three totals and no running balance, no ordering
 * guarantee and no interest column, and sharing that module is what would put
 * the account kind back into the model.
 */
export async function ownerTotals(
  options: { from?: string | null; to?: string | null } = {},
): Promise<OwnerTotals> {
  const sql = db();
  const from = options.from ?? null;
  const to = options.to ?? null;
  const rows = (await sql`
    SELECT
      COALESCE(SUM(amount) FILTER (WHERE category = 'capital_introduced'), 0)
        AS introduced,
      COALESCE(SUM(amount) FILTER (WHERE category = 'owner_drawing'), 0)
        AS drawn
    FROM fund_movement
    WHERE (${from}::date IS NULL OR moved_on >= ${from}::date)
      AND (${to}::date IS NULL OR moved_on <= ${to}::date)
  `) as Row[];
  const row = rows[0] ?? {};
  const introduced = money(row.introduced);
  const drawn = money(row.drawn);
  return { introduced, drawn, standing: introduced.subtract(drawn) };
}

/** The opening balance row, if one has been set. */
export async function openingBalance(): Promise<FundMovement | null> {
  const sql = db();
  const rows = (await sql`
    SELECT f.id, f.doc_no, to_char(f.moved_on, 'YYYY-MM-DD') AS moved_on,
      f.category, f.loan_id, NULL::text AS loan_code, NULL::text AS lender,
      f.description, f.amount, f.interest_amount, f.mode, f.reference, f.notes
    FROM fund_movement f WHERE f.category = 'opening_cash'
  `) as Row[];
  const row = rows[0];
  return row ? toFundMovement(row) : null;
}

export async function getFundMovement(
  id: string,
): Promise<FundMovement | null> {
  if (!isUuid(id)) return null;
  const sql = db();
  const rows = (await sql`
    SELECT f.id, f.doc_no, to_char(f.moved_on, 'YYYY-MM-DD') AS moved_on,
      f.category, f.loan_id, l.code AS loan_code, l.lender, f.description,
      f.amount, f.interest_amount, f.mode, f.reference, f.notes
    FROM fund_movement f LEFT JOIN loan l ON l.id = f.loan_id
    WHERE f.id = ${id}::uuid
  `) as Row[];
  const row = rows[0];
  return row ? toFundMovement(row) : null;
}

export async function listAdvances(
  options: {
    employeeId?: string | null;
    from?: string | null;
    to?: string | null;
    limit?: number;
  } = {},
): Promise<Advance[]> {
  const sql = db();
  const employeeId = options.employeeId ?? null;
  const from = options.from ?? null;
  const to = options.to ?? null;
  const rows = (await sql`
    SELECT a.id, a.doc_no, a.employee_id, e.name AS employee_name,
      e.code AS employee_code, to_char(a.paid_on, 'YYYY-MM-DD') AS paid_on,
      a.amount, a.mode, a.reference, a.reason, a.notes,
      a.recovery_mode, a.installment_amount, a.recover_from
    FROM advance a JOIN employee e ON e.id = a.employee_id
    WHERE (${employeeId}::uuid IS NULL OR a.employee_id = ${employeeId}::uuid)
      AND (${from}::date IS NULL OR a.paid_on >= ${from}::date)
      AND (${to}::date IS NULL OR a.paid_on <= ${to}::date)
    ORDER BY a.paid_on DESC, a.created_at DESC
    LIMIT ${options.limit ?? 500}::int
  `) as Row[];
  return rows.map(toAdvance);
}

export async function getAdvance(id: string): Promise<Advance | null> {
  if (!isUuid(id)) return null;
  const sql = db();
  const rows = (await sql`
    SELECT a.id, a.doc_no, a.employee_id, e.name AS employee_name,
      e.code AS employee_code, to_char(a.paid_on, 'YYYY-MM-DD') AS paid_on,
      a.amount, a.mode, a.reference, a.reason, a.notes,
      a.recovery_mode, a.installment_amount, a.recover_from
    FROM advance a JOIN employee e ON e.id = a.employee_id
    WHERE a.id = ${id}::uuid
  `) as Row[];
  const row = rows[0];
  return row ? toAdvance(row) : null;
}

// Dashboard -------------------------------------------------------------------

/**
 * The first and last date anything in the book is dated, which is what All
 * Dates resolves to on the dashboard and on every report.
 *
 * It reads the five things a period screen counts: bills, payments, expenses,
 * payroll runs and fund movements. A fund movement is in here because an
 * opening balance is usually the earliest row in the book and All Dates has to
 * reach it. A payroll run is dated by its month, so
 * it widens to the first and last day of that month. Nothing is joined, because
 * this is five separate questions; LEAST and GREATEST ignore a source with
 * nothing in it and answer null only when every one of them is empty.
 *
 * Null is an empty book, and the caller turns that into today to today rather
 * than into an error. Draft bills count toward the window: it is the span the
 * book covers, not a figure, and a draft becoming posted should not move it.
 */
export async function bookSpan(): Promise<BookSpan | null> {
  const sql = db();
  const rows = (await sql`
    SELECT
      to_char(LEAST(
        (SELECT MIN(bill_date) FROM bill),
        (SELECT MIN(paid_on) FROM payment),
        (SELECT MIN(spent_on) FROM expense),
        (SELECT MIN(moved_on) FROM fund_movement),
        (SELECT MIN(to_date(period, 'YYYY-MM')) FROM payroll_run)
      ), 'YYYY-MM-DD') AS first_on,
      to_char(GREATEST(
        (SELECT MAX(bill_date) FROM bill),
        (SELECT MAX(paid_on) FROM payment),
        (SELECT MAX(spent_on) FROM expense),
        (SELECT MAX(moved_on) FROM fund_movement),
        (SELECT MAX((to_date(period, 'YYYY-MM')
          + INTERVAL '1 month' - INTERVAL '1 day')::date) FROM payroll_run)
      ), 'YYYY-MM-DD') AS last_on
  `) as Row[];

  const first = maybe(rows[0]?.first_on);
  const last = maybe(rows[0]?.last_on);
  return first && last ? { first, last } : null;
}

/**
 * Billed and settled per month for one side of the business.
 *
 * Months are grouped with to_char rather than date_trunc, so the key arrives as
 * 'YYYY-MM' text and never becomes a JS Date that could land in the wrong month
 * against Asia/Dhaka. The two sides are aggregated separately and joined on the
 * month, because joining bills to payments directly pairs every bill with every
 * payment and inflates both.
 */
export async function monthlyMovement(
  role: PartyRole,
  from: string,
  to: string,
): Promise<{ period: string; billed: Money; settled: Money }[]> {
  const direction = role === 'customer' ? 'issued' : 'received';
  const settlement = role === 'customer' ? 'in' : 'out';
  const sql = db();
  const rows = (await sql`
    WITH billed AS (
      SELECT to_char(bill_date, 'YYYY-MM') AS period, SUM(total) AS total
      FROM bill
      WHERE status = 'posted' AND direction = ${direction}::text
        AND bill_date >= ${from}::date AND bill_date <= ${to}::date
      GROUP BY 1
    ), settled AS (
      SELECT to_char(paid_on, 'YYYY-MM') AS period, SUM(amount) AS total
      FROM payment
      WHERE direction = ${settlement}::text
        AND paid_on >= ${from}::date AND paid_on <= ${to}::date
      GROUP BY 1
    )
    SELECT COALESCE(b.period, s.period) AS period,
      COALESCE(b.total, 0) AS billed,
      COALESCE(s.total, 0) AS settled
    FROM billed b FULL OUTER JOIN settled s ON s.period = b.period
    ORDER BY 1
  `) as Row[];
  return rows.map((row) => ({
    period: text(row.period),
    billed: money(row.billed),
    settled: money(row.settled),
  }));
}

/**
 * Outstanding customer money by how old it is.
 *
 * Bucketed on the bill date against a stated day rather than against now(), so
 * the figure is the same whoever loads the page and from whichever timezone.
 *
 * What is settled is not tied to a particular bill anywhere in this app: a
 * receipt is against the party, not the invoice. So the party's receipts are
 * applied to its bills oldest first, which is the same convention the statement
 * reads under and the same one an advance is recovered under.
 */
export async function receivableAgeing(
  asOf: string,
): Promise<{ bucket: string; amount: Money }[]> {
  const sql = db();
  const rows = (await sql`
    WITH posted AS (
      SELECT b.party_id, b.bill_date, b.total,
        SUM(b.total) OVER (PARTITION BY b.party_id
                           ORDER BY b.bill_date, b.id) AS running
      FROM bill b JOIN party p ON p.id = b.party_id
      WHERE b.status = 'posted' AND b.direction = 'issued' AND p.is_customer
        AND b.bill_date <= ${asOf}::date
    ), received AS (
      SELECT party_id, SUM(amount) AS paid
      FROM payment WHERE direction = 'in' AND paid_on <= ${asOf}::date
      GROUP BY party_id
    )
    SELECT CASE
        WHEN ${asOf}::date - posted.bill_date <= 30 THEN '0 to 30 Days'
        WHEN ${asOf}::date - posted.bill_date <= 60 THEN '31 to 60 Days'
        WHEN ${asOf}::date - posted.bill_date <= 90 THEN '61 to 90 Days'
        ELSE 'Over 90 Days'
      END AS bucket,
      -- What is left of this bill once the older ones have taken their share.
      SUM(LEAST(posted.total,
            GREATEST(posted.running - COALESCE(received.paid, 0), 0))) AS amount
    FROM posted LEFT JOIN received ON received.party_id = posted.party_id
    GROUP BY 1
  `) as Row[];

  const byBucket = new Map(
    rows.map((row) => [text(row.bucket), money(row.amount)]),
  );
  // Every bucket appears, in order, so an empty one is a gap in the bar rather
  // than a bucket the chart silently drops.
  return ['0 to 30 Days', '31 to 60 Days', '61 to 90 Days', 'Over 90 Days'].map(
    (bucket) => ({ bucket, amount: byBucket.get(bucket) ?? Money.ZERO }),
  );
}

/**
 * Every figure the profit statement needs for a period, already grouped.
 *
 * LUMA is a trader. It takes the order, subcontracts the knitting and the
 * dyeing, and bills the customer, so a subcontractor's bill is its cost of
 * sales. Direct cost is those bills plus the expenses recorded under a direct
 * category: freight carrying the fabric, a lab test on a customer's order.
 *
 * Four sources are read and none are joined to each other, because joining them
 * would pair every bill with every expense and inflate the lot:
 *
 * 1. customer bills, which are the revenue
 * 2. subcontractor bills, split by nature of work so knitting reads apart from
 *    dyeing
 * 3. expenses by category, whose tier the caller resolves
 * 4. salary paid and loan interest, both overhead
 *
 * Loan interest is in here deliberately and the loan principal beside it is
 * deliberately not: repaying a loan settles a liability and costs nothing, and
 * a statement that counted the principal would report a loss in every month a
 * loan is being paid down.
 *
 * The basis is mixed and stated on the screen rather than hidden: bills count
 * when raised, expenses and salary and interest when paid.
 */
export async function profitFigures(
  from: string,
  to: string,
): Promise<{
  revenue: Money;
  subcontract: { natureOfWork: NatureOfWork; amount: Money }[];
  expenses: { category: ExpenseCategory; amount: Money }[];
  salary: Money;
  /** Interest and charges paid on a working capital loan. ERP account 5500. */
  interest: Money;
}> {
  const sql = db();
  const [revenueRows, subcontractRows, expenseRows, paidRows] =
    (await Promise.all([
      sql`
        SELECT COALESCE(SUM(total), 0) AS total FROM bill
        WHERE status = 'posted' AND direction = 'issued'
          AND bill_date >= ${from}::date AND bill_date <= ${to}::date
      `,
      sql`
        SELECT nature_of_work, SUM(total) AS total FROM bill
        WHERE status = 'posted' AND direction = 'received'
          AND bill_date >= ${from}::date AND bill_date <= ${to}::date
        GROUP BY nature_of_work ORDER BY SUM(total) DESC
      `,
      sql`
        SELECT category, SUM(amount) AS total FROM expense
        WHERE spent_on >= ${from}::date AND spent_on <= ${to}::date
        GROUP BY category ORDER BY SUM(amount) DESC
      `,
      sql`
        SELECT
          COALESCE((SELECT SUM(l.net_paid)
            FROM payroll_line l JOIN payroll_run r ON r.id = l.run_id
            WHERE r.status = 'paid'
              AND r.period >= to_char(${from}::date, 'YYYY-MM')
              AND r.period <= to_char(${to}::date, 'YYYY-MM')), 0) AS salary,
          COALESCE((SELECT SUM(interest_amount) FROM fund_movement
            WHERE category = 'loan_repayment'
              AND moved_on >= ${from}::date
              AND moved_on <= ${to}::date), 0) AS interest
      `,
    ])) as [Row[], Row[], Row[], Row[]];

  return {
    revenue: money(revenueRows[0]?.total),
    subcontract: subcontractRows.map((row) => ({
      natureOfWork: text(row.nature_of_work) as NatureOfWork,
      amount: money(row.total),
    })),
    expenses: expenseRows.map((row) => ({
      category: text(row.category) as ExpenseCategory,
      amount: money(row.total),
    })),
    salary: money(paidRows[0]?.salary),
    interest: money(paidRows[0]?.interest),
  };
}

/**
 * Revenue, direct cost and selling cost per order reference.
 *
 * The reference is the free text order number already on bill_line, now on an
 * expense too. Nothing is joined: revenue comes from customer bill lines, cost
 * from subcontractor bill lines and from expenses, and they meet by order here.
 *
 * A row with no reference is left out of the orders and still counted in the
 * totals, because an order whose freight was keyed without its number does not
 * become cheaper, it becomes wrong. What is unattributed is reported so a
 * reader can see how much of the picture is missing.
 */
export async function orderCosting(
  from: string,
  to: string,
): Promise<{
  orders: {
    orderNo: string;
    revenue: Money;
    directCost: Money;
    sellingCost: Money;
  }[];
  attributed: { revenue: Money; cost: Money };
  total: { revenue: Money; cost: Money };
}> {
  const sql = db();
  const rows = (await sql`
    WITH lines AS (
      SELECT NULLIF(btrim(COALESCE(l.order_no, '')), '') AS order_no,
        b.direction, SUM(l.amount) AS amount
      FROM bill_line l JOIN bill b ON b.id = l.bill_id
      WHERE b.status = 'posted'
        AND b.bill_date >= ${from}::date AND b.bill_date <= ${to}::date
      GROUP BY 1, 2
    ), costs AS (
      SELECT NULLIF(btrim(COALESCE(order_no, '')), '') AS order_no,
        category, SUM(amount) AS amount
      FROM expense
      WHERE spent_on >= ${from}::date AND spent_on <= ${to}::date
      GROUP BY 1, 2
    )
    SELECT order_no, 'revenue' AS bucket, NULL::text AS category, amount
      FROM lines WHERE direction = 'issued'
    UNION ALL
    SELECT order_no, 'subcontract', NULL::text, amount
      FROM lines WHERE direction = 'received'
    UNION ALL
    SELECT order_no, 'expense', category, amount FROM costs
  `) as Row[];

  const byOrder = new Map<
    string,
    { orderNo: string; revenue: Money; directCost: Money; sellingCost: Money }
  >();
  let attributedRevenue = Money.ZERO;
  let attributedCost = Money.ZERO;
  let totalRevenue = Money.ZERO;
  let totalCost = Money.ZERO;

  for (const row of rows) {
    const orderNo = maybe(row.order_no);
    const amount = money(row.amount);
    const bucket = text(row.bucket);

    // The tier lives with the category, in types.ts, and is resolved here so
    // the SQL never has to carry a second copy of that list.
    const tier =
      bucket === 'revenue'
        ? 'revenue'
        : bucket === 'subcontract'
          ? 'direct'
          : expenseCategoryTier(text(row.category));

    if (bucket === 'revenue') {
      totalRevenue = totalRevenue.add(amount);
    } else if (tier === 'direct' || tier === 'selling') {
      totalCost = totalCost.add(amount);
    }

    // Overhead is never pinned to an order. See orderMargin in costing.ts.
    if (!orderNo || tier === 'operating') continue;

    const entry = byOrder.get(orderNo) ?? {
      orderNo,
      revenue: Money.ZERO,
      directCost: Money.ZERO,
      sellingCost: Money.ZERO,
    };
    if (tier === 'revenue') {
      entry.revenue = entry.revenue.add(amount);
      attributedRevenue = attributedRevenue.add(amount);
    } else if (tier === 'direct') {
      entry.directCost = entry.directCost.add(amount);
      attributedCost = attributedCost.add(amount);
    } else {
      entry.sellingCost = entry.sellingCost.add(amount);
      attributedCost = attributedCost.add(amount);
    }
    byOrder.set(orderNo, entry);
  }

  return {
    orders: [...byOrder.values()].sort((a, b) => b.revenue.compare(a.revenue)),
    attributed: { revenue: attributedRevenue, cost: attributedCost },
    total: { revenue: totalRevenue, cost: totalCost },
  };
}

/** Every document carrying one order reference, for the order detail page. */
export async function orderDetail(orderNo: string): Promise<{
  bills: {
    direction: BillDirection;
    partyName: string;
    billNo: string;
    docNo: string | null;
    billDate: string;
    natureOfWork: NatureOfWork;
    description: string;
    amount: Money;
  }[];
  expenses: {
    docNo: string | null;
    spentOn: string;
    category: ExpenseCategory;
    description: string;
    amount: Money;
  }[];
}> {
  const sql = db();
  const [billRows, expenseRows] = (await Promise.all([
    sql`
      SELECT b.direction, p.name AS party_name, b.bill_no, b.doc_no,
        to_char(b.bill_date, 'YYYY-MM-DD') AS bill_date, b.nature_of_work,
        l.description, l.amount
      FROM bill_line l
      JOIN bill b ON b.id = l.bill_id
      JOIN party p ON p.id = b.party_id
      WHERE b.status = 'posted'
        AND lower(btrim(l.order_no)) = lower(btrim(${orderNo}::text))
      ORDER BY b.bill_date, b.bill_no, l.line_no
    `,
    sql`
      SELECT doc_no, to_char(spent_on, 'YYYY-MM-DD') AS spent_on,
        category, description, amount
      FROM expense
      WHERE lower(btrim(order_no)) = lower(btrim(${orderNo}::text))
      ORDER BY spent_on, doc_no
    `,
  ])) as [Row[], Row[]];

  return {
    bills: billRows.map((row) => ({
      direction: text(row.direction) as BillDirection,
      partyName: text(row.party_name),
      billNo: text(row.bill_no),
      docNo: maybe(row.doc_no),
      billDate: text(row.bill_date),
      natureOfWork: text(row.nature_of_work) as NatureOfWork,
      description: text(row.description),
      amount: money(row.amount),
    })),
    expenses: expenseRows.map((row) => ({
      docNo: maybe(row.doc_no),
      spentOn: text(row.spent_on),
      category: text(row.category) as ExpenseCategory,
      description: text(row.description),
      amount: money(row.amount),
    })),
  };
}

/**
 * Revenue against direct cost, month by month, so the trend of the margin is
 * visible even though any one month is noisy for the reason above.
 *
 * Direct cost is the whole of the direct tier, not the subcontract bills alone:
 * the freight carrying the fabric and the lab test on the order come off before
 * the gross margin on the profit statement, so they have to come off here too.
 * Otherwise the dashboard prints two different figures under the one name, and
 * the months would not add up to the tile above them.
 *
 * Nothing is joined. Three sources are read and folded by period here, because
 * joining bills to expenses would pair every bill with every expense.
 */
export async function monthlyTrading(
  from: string,
  to: string,
): Promise<{ period: string; revenue: Money; directCost: Money }[]> {
  const sql = db();
  const rows = (await sql`
    WITH issued AS (
      SELECT to_char(bill_date, 'YYYY-MM') AS period, SUM(total) AS total
      FROM bill
      WHERE status = 'posted' AND direction = 'issued'
        AND bill_date >= ${from}::date AND bill_date <= ${to}::date
      GROUP BY 1
    ), received AS (
      SELECT to_char(bill_date, 'YYYY-MM') AS period, SUM(total) AS total
      FROM bill
      WHERE status = 'posted' AND direction = 'received'
        AND bill_date >= ${from}::date AND bill_date <= ${to}::date
      GROUP BY 1
    ), spent AS (
      SELECT to_char(spent_on, 'YYYY-MM') AS period, category, SUM(amount) AS total
      FROM expense
      WHERE spent_on >= ${from}::date AND spent_on <= ${to}::date
      GROUP BY 1, 2
    )
    SELECT period, 'revenue' AS bucket, NULL::text AS category, total FROM issued
    UNION ALL
    SELECT period, 'subcontract', NULL::text, total FROM received
    UNION ALL
    SELECT period, 'expense', category, total FROM spent
  `) as Row[];

  // The tier lives with the category, in types.ts, and is resolved here so the
  // SQL never has to carry a second copy of that list.
  const byPeriod = new Map<
    string,
    { period: string; revenue: Money; directCost: Money }
  >();
  for (const row of rows) {
    const period = text(row.period);
    const amount = money(row.total);
    const bucket = text(row.bucket);
    const entry = byPeriod.get(period) ?? {
      period,
      revenue: Money.ZERO,
      directCost: Money.ZERO,
    };

    if (bucket === 'revenue') {
      entry.revenue = entry.revenue.add(amount);
    } else if (
      bucket === 'subcontract' ||
      expenseCategoryTier(text(row.category)) === 'direct'
    ) {
      entry.directCost = entry.directCost.add(amount);
    }
    byPeriod.set(period, entry);
  }

  return [...byPeriod.values()].sort((a, b) =>
    a.period.localeCompare(b.period),
  );
}

/** Salary paid out across a range of months, as one figure for the dashboard. */
export async function payrollNetInRange(
  from: string,
  to: string,
): Promise<Money> {
  const sql = db();
  const rows = (await sql`
    SELECT COALESCE(SUM(l.net_paid), 0) AS total
    FROM payroll_line l JOIN payroll_run r ON r.id = l.run_id
    WHERE r.status = 'paid'
      AND r.period >= to_char(${from}::date, 'YYYY-MM')
      AND r.period <= to_char(${to}::date, 'YYYY-MM')
  `) as Row[];
  return money(rows[0]?.total);
}

/** Every run, newest month first, with its totals worked out from its lines. */
export async function listPayrollRuns(
  limit = 60,
): Promise<PayrollRunSummary[]> {
  const sql = db();
  const rows = (await sql`
    SELECT r.id, r.doc_no, r.period, r.status, r.per_day_basis,
      r.recover_advances, r.notes,
      r.approved_by, r.paid_by,
      to_char(r.approved_at AT TIME ZONE 'Asia/Dhaka', 'YYYY-MM-DD') AS approved_at,
      to_char(r.paid_at AT TIME ZONE 'Asia/Dhaka', 'YYYY-MM-DD') AS paid_at,
      COALESCE(t.employees, 0) AS employees,
      COALESCE(t.gross, 0) AS gross,
      COALESCE(t.absence_deduction, 0) AS absence_deduction,
      COALESCE(t.advance_deduction, 0) AS advance_deduction,
      COALESCE(t.other_deduction, 0) AS other_deduction,
      COALESCE(t.bonus, 0) AS bonus,
      COALESCE(t.additional_allowance, 0) AS additional_allowance,
      COALESCE(t.net_paid, 0) AS net_paid,
      COALESCE(t.lines_paid, 0) AS lines_paid
    FROM payroll_run r
    LEFT JOIN (
      SELECT run_id, COUNT(*) AS employees, SUM(gross) AS gross,
        SUM(absence_deduction) AS absence_deduction,
        SUM(advance_deduction) AS advance_deduction,
        SUM(other_deduction) AS other_deduction,
        SUM(bonus) AS bonus,
        SUM(additional_allowance) AS additional_allowance,
        SUM(net_paid) AS net_paid,
        COUNT(*) FILTER (WHERE paid_on IS NOT NULL) AS lines_paid
      FROM payroll_line GROUP BY run_id
    ) t ON t.run_id = r.id
    ORDER BY r.period DESC
    LIMIT ${limit}::int
  `) as Row[];
  return rows.map((row) => ({
    ...toPayrollRun(row),
    employees: count(row.employees),
    gross: money(row.gross),
    absenceDeduction: money(row.absence_deduction),
    advanceDeduction: money(row.advance_deduction),
    otherDeduction: money(row.other_deduction),
    bonus: money(row.bonus),
    additionalAllowance: money(row.additional_allowance),
    netPaid: money(row.net_paid),
    linesPaid: count(row.lines_paid),
  }));
}

/** By month, which is how a run is named in a URL, or by uuid. */
export async function findPayrollRun(
  handle: string,
): Promise<PayrollRun | null> {
  const sql = db();
  const byId = isUuid(handle) ? handle : null;
  const rows = (await sql`
    SELECT id, doc_no, period, status, per_day_basis, recover_advances, notes,
      approved_by, paid_by,
      to_char(approved_at AT TIME ZONE 'Asia/Dhaka', 'YYYY-MM-DD') AS approved_at,
      to_char(paid_at AT TIME ZONE 'Asia/Dhaka', 'YYYY-MM-DD') AS paid_at
    FROM payroll_run
    WHERE (${byId}::uuid IS NOT NULL AND id = ${byId}::uuid)
       OR (${byId}::uuid IS NULL AND period = ${handle}::text)
  `) as Row[];
  const row = rows[0];
  return row ? toPayrollRun(row) : null;
}

export async function listPayrollLines(runId: string): Promise<PayrollLine[]> {
  if (!isUuid(runId)) return [];
  const sql = db();
  const rows = (await sql`
    SELECT l.id, l.run_id, l.employee_id, e.name AS employee_name,
      e.code AS employee_code, l.basic, l.house_rent, l.medical, l.conveyance,
      l.mobile_allowance, l.other_allowance, l.gross, l.designation,
      l.absent_days, l.bonus, l.additional_allowance, l.advance_deduction,
      l.other_deduction, l.remarks, l.absence_deduction, l.net_paid,
      to_char(l.paid_on, 'YYYY-MM-DD') AS paid_on
    FROM payroll_line l JOIN employee e ON e.id = l.employee_id
    WHERE l.run_id = ${runId}::uuid
    ORDER BY e.name
  `) as Row[];
  return rows.map(toPayrollLine);
}

/** One line with its run alongside, which is everything a payslip needs. */
export async function getPayrollLine(
  id: string,
): Promise<PayrollLineWithRun | null> {
  if (!isUuid(id)) return null;
  const sql = db();
  const rows = (await sql`
    SELECT l.id, l.run_id, l.employee_id, e.name AS employee_name,
      e.code AS employee_code, l.basic, l.house_rent, l.medical, l.conveyance,
      l.mobile_allowance, l.other_allowance, l.gross, l.designation,
      l.absent_days, l.bonus, l.additional_allowance, l.advance_deduction,
      l.other_deduction, l.remarks, l.absence_deduction, l.net_paid,
      to_char(l.paid_on, 'YYYY-MM-DD') AS paid_on,
      r.period, r.status, r.per_day_basis, r.doc_no, r.approved_by
    FROM payroll_line l
    JOIN employee e ON e.id = l.employee_id
    JOIN payroll_run r ON r.id = l.run_id
    WHERE l.id = ${id}::uuid
  `) as Row[];
  const row = rows[0];
  if (!row) return null;
  return {
    ...toPayrollLine(row),
    period: text(row.period),
    status: text(row.status) as PayrollStatus,
    perDayBasis: text(row.per_day_basis) as PerDayBasis,
    docNo: maybe(row.doc_no),
    approvedBy: maybe(row.approved_by),
  };
}

/**
 * Active employees who have no line on this run.
 *
 * Somebody hired after the month was generated has no line, and adding them by
 * hand is better than regenerating, which would throw away everything already
 * keyed against the others.
 */
export async function employeesMissingFromRun(
  runId: string,
): Promise<Employee[]> {
  if (!isUuid(runId)) return [];
  const sql = db();
  const rows = (await sql`
    SELECT id, code, name, designation, phone, nid, address,
      to_char(joined_on, 'YYYY-MM-DD') AS joined_on, active,
      basic, house_rent, medical, conveyance, mobile_allowance, other_allowance,
      gross, payment_method, bank_name, account_no, mfs_number
    FROM employee e
    WHERE e.active
      AND NOT EXISTS (SELECT 1 FROM payroll_line l
                      WHERE l.run_id = ${runId}::uuid AND l.employee_id = e.id)
    ORDER BY e.name
  `) as Row[];
  return rows.map(toEmployee);
}

export async function listLeaveRecords(
  options: { employeeId?: string | null; year?: string | null } = {},
): Promise<LeaveRecord[]> {
  const sql = db();
  const employeeId = options.employeeId ?? null;
  const year = options.year ?? null;
  const rows = (await sql`
    SELECT lr.id, lr.employee_id, e.name AS employee_name,
      e.code AS employee_code, lr.leave_type,
      to_char(lr.from_date, 'YYYY-MM-DD') AS from_date,
      to_char(lr.to_date, 'YYYY-MM-DD') AS to_date, lr.days, lr.reason
    FROM leave_record lr JOIN employee e ON e.id = lr.employee_id
    WHERE (${employeeId}::uuid IS NULL OR lr.employee_id = ${employeeId}::uuid)
      AND (${year}::text IS NULL
           OR to_char(lr.from_date, 'YYYY') = ${year}::text)
    ORDER BY lr.from_date DESC
    LIMIT 500
  `) as Row[];
  return rows.map((row) => ({
    id: text(row.id),
    employeeId: text(row.employee_id),
    employeeName: text(row.employee_name),
    employeeCode: maybe(row.employee_code),
    leaveType: text(row.leave_type) as LeaveType,
    fromDate: text(row.from_date),
    toDate: text(row.to_date),
    days: text(row.days),
    reason: maybe(row.reason),
  }));
}

export async function getLeaveRecord(id: string): Promise<LeaveRecord | null> {
  if (!isUuid(id)) return null;
  const records = await listLeaveRecords();
  return records.find((r) => r.id === id) ?? null;
}

/** Days taken per employee per type in a year, for the balance column. */
export async function leaveTakenByType(
  year: string,
): Promise<{ employeeId: string; leaveType: LeaveType; days: string }[]> {
  const sql = db();
  const rows = (await sql`
    SELECT employee_id, leave_type, SUM(days) AS days
    FROM leave_record
    WHERE to_char(from_date, 'YYYY') = ${year}::text
    GROUP BY employee_id, leave_type
  `) as Row[];
  return rows.map((row) => ({
    employeeId: text(row.employee_id),
    leaveType: text(row.leave_type) as LeaveType,
    days: text(row.days),
  }));
}

/**
 * Which Cash Book row a fund movement produces. The category mapping stays in
 * TypeScript, beside FUND_CATEGORIES, so the SQL below carries no second copy
 * of it. An unrecognized category counts as money out, which is the way of
 * being wrong that cannot overstate the cash in hand.
 */
function cashSourceForFund(category: string, leg: string): CashSource {
  if (leg === 'interest') return 'loan_interest';
  switch (category) {
    case 'opening_cash':
      return 'opening';
    case 'capital_introduced':
      return 'capital';
    case 'loan_received':
      return 'loan_received';
    case 'loan_repayment':
      return 'loan_repayment';
    case 'owner_drawing':
      return 'drawing';
    default:
      return 'drawing';
  }
}

/**
 * Where a Cash Book row is read back to.
 *
 * Every source is named. There is deliberately no catch-all `default` that
 * builds a URL: the three kinds of fund row go to two different screens, and a
 * single fallback would send capital and drawings to a loan address that does
 * not exist, silently, with nothing to catch it.
 */
function cashHref(source: CashSource, link: string | null): string | null {
  switch (source) {
    case 'receipt':
      return link ? `/customers/settlements/${link}` : null;
    case 'payment':
      return link ? `/subcontractors/settlements/${link}` : null;
    case 'supplier_payment':
      return link ? `/suppliers/settlements/${link}` : null;
    case 'expense':
      return link ? `/expenses/${link}/edit` : null;
    case 'salary':
      return link ? `/payroll/${link}` : null;
    case 'advance':
      return link ? `/payroll/advances/${link}/edit` : null;
    case 'capital':
    case 'drawing':
      return '/owner';
    case 'loan_received':
    case 'loan_repayment':
    case 'loan_interest':
      return link ? `/loans/${link}` : '/loans';
    case 'opening':
      return null;
  }
}

/**
 * Every movement of cash in the book, in one list, for the Cash Book and the
 * cash position.
 *
 * A UNION ALL and never a join, for the reason given on profitFigures: these
 * are separate questions, and joining them would pair every receipt with every
 * expense. The joins inside each branch are many-to-one lookups for a name and
 * cannot multiply a row.
 *
 * **It takes no date bound.** buildCashBook folds everything before `from` into
 * the opening balance, so it has to see the whole book. Bounding the dates here
 * would silently produce a wrong opening, which is the easiest way to get this
 * feature wrong.
 *
 * One voucher comes back as two rows, and that is the point. A loan repayment
 * emits the principal and, where there is one, the interest: the cash that left
 * is their sum, and splitting them here is what stops every caller having to
 * remember to add them, and what lets the interest be a cost while the
 * principal beside it is not.
 *
 * A salary counts on the day its line was marked paid, which is the day the
 * cash moved. profitFigures counts a paid run against its own month instead.
 * The two answer different questions and are allowed to differ.
 */
export async function cashMovements(): Promise<CashMovement[]> {
  const sql = db();
  const rows = (await sql`
    SELECT pay.id::text AS id,
      CASE WHEN pay.direction = 'in' THEN 'receipt'
        WHEN pay.party_role = 'supplier' THEN 'supplier_payment'
        ELSE 'payment' END AS source,
      NULL::text AS category,
      NULL::text AS leg,
      to_char(pay.paid_on, 'YYYY-MM-DD') AS date,
      pay.amount AS amount,
      pay.mode AS mode,
      -- The voucher number, with the paper serial or cheque beside it.
      concat_ws(' / ', pay.doc_no, pay.reference) AS reference,
      CASE WHEN pay.direction = 'in' THEN 'Received from ' ELSE 'Paid to ' END
        || pt.name AS particulars,
      COALESCE(pay.doc_no, pay.id::text) AS link,
      NULL::bigint AS seq,
      to_char(pay.created_at AT TIME ZONE 'Asia/Dhaka',
        'YYYY-MM-DD"T"HH24:MI:SS.US') AS recorded_at
    FROM payment pay JOIN party pt ON pt.id = pay.party_id

    UNION ALL
    SELECT x.id::text, 'expense', NULL, NULL,
      to_char(x.spent_on, 'YYYY-MM-DD'), x.amount, x.mode, x.doc_no,
      x.description || COALESCE(', ' || x.payee, ''),
      COALESCE(x.doc_no, x.id::text),
      NULLIF(regexp_replace(COALESCE(x.doc_no, ''), '^.*-', ''), '')::bigint,
      to_char(x.created_at AT TIME ZONE 'Asia/Dhaka', 'YYYY-MM-DD"T"HH24:MI:SS.US')
    FROM expense x

    UNION ALL
    SELECT l.id::text, 'salary', NULL, NULL,
      to_char(l.paid_on, 'YYYY-MM-DD'), l.net_paid, e.payment_method, r.doc_no,
      'Salary to ' || e.name || ', ' || r.period,
      r.period, NULL,
      to_char(l.created_at AT TIME ZONE 'Asia/Dhaka', 'YYYY-MM-DD"T"HH24:MI:SS.US')
    FROM payroll_line l
      JOIN payroll_run r ON r.id = l.run_id
      JOIN employee e ON e.id = l.employee_id
    WHERE l.paid_on IS NOT NULL

    UNION ALL
    SELECT a.id::text, 'advance', NULL, NULL,
      to_char(a.paid_on, 'YYYY-MM-DD'), a.amount, a.mode, a.doc_no,
      'Salary Advance to ' || ea.name, a.id::text,
      NULLIF(regexp_replace(COALESCE(a.doc_no, ''), '^.*-', ''), '')::bigint,
      to_char(a.created_at AT TIME ZONE 'Asia/Dhaka', 'YYYY-MM-DD"T"HH24:MI:SS.US')
    FROM advance a JOIN employee ea ON ea.id = a.employee_id


    -- The movement itself: an opening, capital in, a drawing, or a principal.
    -- A transfer is handled by the two branches below instead.
    UNION ALL
    SELECT f.id::text, 'fund', f.category, NULL,
      to_char(f.moved_on, 'YYYY-MM-DD'), f.amount, f.mode, f.doc_no,
      f.description || COALESCE(', ' || l.lender, ''),
      -- A loan row is read back to its loan, everything else to its own screen,
      -- so the link is the loan code where there is one.
      COALESCE(l.code, f.doc_no, f.id::text),
      NULLIF(regexp_replace(COALESCE(f.doc_no, ''), '^.*-', ''), '')::bigint,
      to_char(f.created_at AT TIME ZONE 'Asia/Dhaka', 'YYYY-MM-DD"T"HH24:MI:SS.US')
    FROM fund_movement f LEFT JOIN loan l ON l.id = f.loan_id

    -- Interest leaves the account on the same day as the principal it was paid
    -- with, and it is a cost where the principal is not, so it reads as its own
    -- row. The id is suffixed so two rows off one voucher stay distinct and the
    -- ordering tie-break still terminates.
    UNION ALL
    SELECT f.id::text || ':interest', 'fund', f.category, 'interest',
      to_char(f.moved_on, 'YYYY-MM-DD'), f.interest_amount, f.mode, f.doc_no,
      'Interest and Charges, ' || l.lender,
      COALESCE(l.code, f.doc_no, f.id::text),
      NULLIF(regexp_replace(COALESCE(f.doc_no, ''), '^.*-', ''), '')::bigint,
      to_char(f.created_at AT TIME ZONE 'Asia/Dhaka', 'YYYY-MM-DD"T"HH24:MI:SS.US')
    FROM fund_movement f JOIN loan l ON l.id = f.loan_id
    WHERE f.category = 'loan_repayment' AND f.interest_amount > 0


  `) as Row[];

  return rows.map((row): CashMovement => {
    const raw = text(row.source);
    const source =
      raw === 'fund'
        ? cashSourceForFund(text(row.category), text(row.leg))
        : (raw as CashSource);
    const link = maybe(row.link);
    return {
      id: text(row.id),
      source,
      date: text(row.date),
      particulars: text(row.particulars),
      mode: text(row.mode),
      reference: maybe(row.reference),
      href: cashHref(source, link),
      seq: row.seq === null || row.seq === undefined ? null : count(row.seq),
      recordedAt: text(row.recorded_at),
      amount: money(row.amount),
    };
  });
}

/**
 * The audit trail, filtered.
 *
 * The log is append only and never trimmed, which is the point of it: it is
 * the only record of who changed what and why, and it exports with the book.
 * At the rate this book is written it grows by a few megabytes a year, so
 * there is no retention window and adding one would delete the evidence the
 * log exists to keep.
 */
export async function listActivity(options: {
  entity?: string | null;
  actorUserId?: string | null;
  action?: string | null;
  from?: string | null;
  to?: string | null;
  limit?: number;
  offset?: number;
}): Promise<{ entries: ActivityEntry[]; matched: number }> {
  const sql = db();
  const entity = options.entity ?? null;
  const actor = options.actorUserId ?? null;
  const action = options.action ?? null;
  const from = options.from ?? null;
  const to = options.to ?? null;
  const limit = options.limit ?? 50;
  const offset = options.offset ?? 0;

  const [rows, totals] = (await Promise.all([
    sql`
      SELECT activity_log.id::text AS entry_id,
        to_char(activity_log.at AT TIME ZONE 'Asia/Dhaka', 'DD Mon YYYY, HH24:MI')
          AS at_label,
        action, entity, entity_id, summary, reason, actor_name
      FROM activity_log
      WHERE (${entity}::text IS NULL OR entity = ${entity}::text)
        AND (${actor}::text IS NULL OR actor_user_id = ${actor}::text)
        AND (${action}::text IS NULL OR action = ${action}::text)
        AND (${from}::date IS NULL
          OR (at AT TIME ZONE 'Asia/Dhaka')::date >= ${from}::date)
        AND (${to}::date IS NULL
          OR (at AT TIME ZONE 'Asia/Dhaka')::date <= ${to}::date)
      ORDER BY activity_log.at DESC, activity_log.id DESC
      LIMIT ${limit}::int OFFSET ${offset}::int
    `,
    sql`
      SELECT COUNT(*)::int AS matched FROM activity_log
      WHERE (${entity}::text IS NULL OR entity = ${entity}::text)
        AND (${actor}::text IS NULL OR actor_user_id = ${actor}::text)
        AND (${action}::text IS NULL OR action = ${action}::text)
        AND (${from}::date IS NULL
          OR (at AT TIME ZONE 'Asia/Dhaka')::date >= ${from}::date)
        AND (${to}::date IS NULL
          OR (at AT TIME ZONE 'Asia/Dhaka')::date <= ${to}::date)
    `,
  ])) as [Row[], Row[]];

  return {
    entries: rows.map((row) => ({
      id: text(row.entry_id),
      at: text(row.at_label),
      action: text(row.action) as ActivityEntry['action'],
      entity: text(row.entity),
      summary: text(row.summary),
      reason: maybe(row.reason),
      actorName: maybe(row.actor_name),
    })),
    matched: count(totals[0]?.matched),
  };
}

/** The entities and people the log actually holds, for its filter controls. */
export async function activityFilterOptions(): Promise<{
  entities: string[];
  actors: { id: string; name: string }[];
}> {
  const sql = db();
  const [entities, actors] = (await Promise.all([
    sql`SELECT DISTINCT entity FROM activity_log ORDER BY entity`,
    sql`
      SELECT actor_user_id AS id, MAX(actor_name) AS name
      FROM activity_log
      WHERE actor_user_id IS NOT NULL
      GROUP BY actor_user_id
      ORDER BY MAX(actor_name)
    `,
  ])) as [Row[], Row[]];

  return {
    entities: entities.map((row) => text(row.entity)),
    actors: actors.map((row) => ({ id: text(row.id), name: text(row.name) })),
  };
}

// Finding a record by the number on a piece of paper ------------------------
//
// The full ERP specifies this as D36: one box that resolves a number, matched
// in a fixed order, where an exact hit opens the record and anything else
// lists candidates. Its order leads with a Challan serial, which this app has
// no such thing as, so what is left is that list without it: a bill number in
// either series, then an order number, then a party, then the voucher and
// receipt numbers this app issues.
//
// Two kinds of matching, and the split is deliberate.
//
// An identifier is matched exactly, then by prefix, then by containment, and
// never fuzzily. A bill number is either the one written on the paper in
// somebody's hand or it is not, and a search that helpfully offers CB-26-0114
// for CB-26-0113 is offering the wrong bill on a screen people bill from.
//
// A name is matched on trigram similarity, because that is where a typo
// actually happens: "Rongdonu" should still find Rongdhonu Dyeing. pg_trgm is
// one extension, it indexes with GIN, and it stays inside the same
// transaction as every other read. A separate search server was considered and
// refused: it cannot join a write's transaction, so the index drifts from the
// book, and at this size a sequential scan of the whole register already
// answers in well under a millisecond against a network hop of twenty.

export type SearchHitKind =
  | 'bill'
  | 'order'
  | 'party'
  | 'loan'
  | 'payment'
  | 'expense'
  | 'fund'
  | 'advance';

export type SearchHit = {
  kind: SearchHitKind;
  /** What the paper calls it, and what the reader recognizes. */
  code: string;
  /** The line under the code, saying which record this is. */
  label: string;
  href: string;
  /** True when the term is the whole of the code, not a part of it. */
  exact: boolean;
  /**
   * True when nothing on this record matched, and it is only here because the
   * party or employee it belongs to did.
   *
   * It decides the ranking, and it has to. Typing a party name matches that
   * party once and every bill it ever had, so without this the one record
   * somebody asked for sits under twenty they did not.
   */
  indirect: boolean;
};

/** How the kinds rank against each other, from D36. */
const HIT_ORDER: SearchHitKind[] = [
  'bill',
  'order',
  'party',
  'loan',
  'payment',
  'expense',
  'fund',
  'advance',
];

/** Below this a name is a different name, not a misspelling of this one. */
const NAME_SIMILARITY = 0.3;

/**
 * The top bar search, over everything the caller is entitled to open.
 *
 * The role is a parameter and not a convenience. Every other kind here is a
 * record any signed-in account may already reach by its address, so search
 * needed no permission of its own. Capital, drawings and the loan book are not:
 * they are behind 'fund:read', and a search that returned them regardless would
 * hand a Viewer the owner's drawings the moment they typed a lender's name.
 */
export async function searchRecords(
  term: string,
  options: { limit?: number; role: string },
): Promise<SearchHit[]> {
  const trimmed = term.trim();
  // One character matches most of the book and answers nothing.
  if (trimmed.length < 2) return [];

  const limit = options.limit ?? 25;
  const mayReadFunds = can(options.role, 'fund:read');

  const sql = db();
  const like = `%${trimmed}%`;
  const prefix = `${trimmed}%`;
  const lower = trimmed.toLowerCase();

  const results = (await Promise.all([
    sql`
        SELECT bill.id, bill.bill_no, bill.doc_no, bill.direction,
          bill.party_role, bill.total, party.name AS party_name
        FROM bill JOIN party ON party.id = bill.party_id
        WHERE bill.bill_no ILIKE ${like}
          OR bill.doc_no ILIKE ${like}
          OR bill.notes ILIKE ${like}
          OR party.name % ${trimmed}
        ORDER BY
          (lower(coalesce(bill.bill_no, '')) = ${lower}
            OR lower(coalesce(bill.doc_no, '')) = ${lower}) DESC,
          (bill.doc_no ILIKE ${prefix} OR bill.bill_no ILIKE ${prefix}) DESC,
          bill.bill_date DESC
        LIMIT ${limit}::int
      `,
    // An order is a free text reference on a bill line or an expense, not a
    // table, so the candidates are the distinct references themselves.
    sql`
        SELECT order_no, COUNT(*)::int AS uses FROM (
          SELECT order_no FROM bill_line WHERE order_no ILIKE ${like}
          UNION ALL
          SELECT order_no FROM expense WHERE order_no ILIKE ${like}
        ) refs
        WHERE order_no IS NOT NULL AND order_no <> ''
        GROUP BY order_no
        ORDER BY (lower(order_no) = ${lower}) DESC,
          (order_no ILIKE ${prefix}) DESC, order_no
        LIMIT ${limit}::int
      `,
    // The one place a misspelling is worth forgiving: a name typed from
    // memory. The code beside it stays an exact and prefix match.
    sql`
        SELECT id, code, name, active
        FROM party
        WHERE code ILIKE ${like}
          OR name ILIKE ${like}
          OR similarity(name, ${trimmed}) > ${NAME_SIMILARITY}::real
        ORDER BY (lower(coalesce(code, '')) = ${lower}) DESC,
          similarity(name, ${trimmed}) DESC, name
        LIMIT ${limit}::int
      `,
    sql`
        SELECT payment.id, payment.doc_no, payment.reference,
          payment.direction, payment.party_role, payment.amount,
          party.name AS party_name
        FROM payment JOIN party ON party.id = payment.party_id
        WHERE payment.doc_no ILIKE ${like}
          OR payment.reference ILIKE ${like}
          OR party.name % ${trimmed}
        ORDER BY (lower(coalesce(payment.doc_no, '')) = ${lower}
            OR lower(coalesce(payment.reference, '')) = ${lower}) DESC,
          payment.paid_on DESC
        LIMIT ${limit}::int
      `,
    sql`
        SELECT id, doc_no, description, amount
        FROM expense
        WHERE doc_no ILIKE ${like}
          OR payee ILIKE ${like}
          OR similarity(description, ${trimmed}) > ${NAME_SIMILARITY}::real
        ORDER BY (lower(coalesce(doc_no, '')) = ${lower}) DESC, spent_on DESC
        LIMIT ${limit}::int
      `,
    sql`
        SELECT advance.id, advance.doc_no, advance.amount, advance.reference,
          employee.name AS employee_name
        FROM advance JOIN employee ON employee.id = advance.employee_id
        WHERE advance.doc_no ILIKE ${like}
          OR advance.reference ILIKE ${like}
          OR employee.name % ${trimmed}
        ORDER BY (lower(coalesce(advance.doc_no, '')) = ${lower}) DESC,
          advance.paid_on DESC
        LIMIT ${limit}::int
      `,
    // The two fund queries are pushed only where the role may read them. An
    // empty array in their place keeps the destructuring below unchanged.
    mayReadFunds
      ? sql`
            SELECT id, code, lender, active
            FROM loan
            WHERE code ILIKE ${like}
              OR lender ILIKE ${like}
              OR similarity(lender, ${trimmed}) > ${NAME_SIMILARITY}::real
            ORDER BY (lower(coalesce(code, '')) = ${lower}) DESC,
              similarity(lender, ${trimmed}) DESC, lender
            LIMIT ${limit}::int
          `
      : Promise.resolve([] as Row[]),
    mayReadFunds
      ? sql`
            SELECT f.id, f.doc_no, f.category, f.amount, f.description,
              l.lender, l.code AS loan_code
            FROM fund_movement f LEFT JOIN loan l ON l.id = f.loan_id
            WHERE f.doc_no ILIKE ${like}
              OR f.reference ILIKE ${like}
              OR l.lender % ${trimmed}
              OR similarity(f.description, ${trimmed}) > ${NAME_SIMILARITY}::real
            ORDER BY (lower(coalesce(f.doc_no, '')) = ${lower}) DESC,
              f.moved_on DESC
            LIMIT ${limit}::int
          `
      : Promise.resolve([] as Row[]),
  ])) as Row[][];

  const [
    bills = [],
    orders = [],
    parties = [],
    payments = [],
    expenses = [],
    advances = [],
    loans = [],
    fundMovements = [],
  ] = results;

  const isExact = (...candidates: (string | null)[]) =>
    candidates.some((one) => (one ?? '').toLowerCase() === lower);

  // Nothing on the record itself matched, so it is here on its party's or its
  // employee's account. Those rank under a record that matched on its own.
  const isIndirect = (...own: (string | null)[]) =>
    !own.some((one) => (one ?? '').toLowerCase().includes(lower));

  const hits: SearchHit[] = [];

  // Sales, Purchase and Work Orders (2026-10-06), by their number or, for a
  // Sales Order, the customer's own reference. Listed as orders: that is what
  // all three are, and the code says which.
  const orderDocs = (await db()`
    SELECT 'so' AS kind, so.doc_no, so.customer_ref AS extra, p.name AS party_name
    FROM sales_order so JOIN party p ON p.id = so.party_id
    WHERE so.doc_no ILIKE ${like} OR so.customer_ref ILIKE ${like}
      OR p.name % ${trimmed}
    UNION ALL
    SELECT 'po', d.doc_no, NULL, p.name
    FROM purchase_order d JOIN party p ON p.id = d.party_id
    WHERE d.doc_no ILIKE ${like} OR p.name % ${trimmed}
    UNION ALL
    SELECT 'wo', d.doc_no, d.process, p.name
    FROM work_order d JOIN party p ON p.id = d.party_id
    WHERE d.doc_no ILIKE ${like} OR p.name % ${trimmed}
    LIMIT ${limit}::int
  `) as Row[];
  for (const row of orderDocs) {
    const kind = text(row.kind);
    const docNo = text(row.doc_no);
    const base =
      kind === 'so' ? '/orders' : kind === 'po' ? '/purchase-orders' : '/work-orders';
    const what =
      kind === 'so'
        ? 'Sales Order'
        : kind === 'po'
          ? 'Purchase Order'
          : `Work Order, ${workProcessLabel(text(row.extra))}`;
    hits.push({
      kind: 'order',
      code: docNo,
      label: [what, text(row.party_name), kind === 'so' ? maybe(row.extra) : null]
        .filter(Boolean)
        .join(', '),
      href: `${base}/${docNo}`,
      exact: isExact(docNo, kind === 'so' ? maybe(row.extra) : null),
      indirect: isIndirect(docNo, kind === 'so' ? maybe(row.extra) : null),
    });
  }

  for (const row of bills) {
    // The lens follows the role, so a yarn bill opens under Suppliers.
    const side = sideForRole(roleOf(row.party_role, row.direction));
    hits.push({
      kind: 'bill',
      // Known by its system number; the paper number rides in the label.
      code: maybe(row.doc_no) ?? maybe(row.bill_no) ?? 'Draft',
      label: [
        text(row.party_name),
        formatTaka(money(row.total)),
        maybe(row.bill_no),
      ]
        .filter(Boolean)
        .join(', '),
      href: `/${side}/bills/${maybe(row.doc_no) ?? text(row.id)}`,
      exact: isExact(maybe(row.bill_no), maybe(row.doc_no)),
      indirect: isIndirect(maybe(row.bill_no), maybe(row.doc_no)),
    });
  }

  for (const row of orders) {
    const orderNo = text(row.order_no);
    const uses = count(row.uses);
    hits.push({
      kind: 'order',
      code: orderNo,
      label: `${uses} ${uses === 1 ? 'entry' : 'entries'} against this order`,
      href: `/reports/orders/${encodeURIComponent(orderNo)}`,
      exact: isExact(orderNo),
      indirect: false,
    });
  }

  for (const row of parties) {
    hits.push({
      kind: 'party',
      code: maybe(row.code) ?? text(row.name),
      label: [text(row.name), row.active === false ? 'Inactive' : null]
        .filter(Boolean)
        .join(', '),
      href: `/parties/${maybe(row.code) ?? text(row.id)}`,
      exact: isExact(maybe(row.code), maybe(row.name)),
      indirect: false,
    });
  }

  for (const row of loans) {
    hits.push({
      kind: 'loan',
      code: maybe(row.code) ?? text(row.lender),
      label: [text(row.lender), row.active === false ? 'Settled' : null]
        .filter(Boolean)
        .join(', '),
      href: `/loans/${maybe(row.code) ?? text(row.id)}`,
      exact: isExact(maybe(row.code), maybe(row.lender)),
      indirect: false,
    });
  }

  for (const row of fundMovements) {
    hits.push({
      kind: 'fund',
      code: maybe(row.doc_no) ?? 'Fund Voucher',
      label: [
        fundCategoryLabel(text(row.category)),
        maybe(row.lender),
        formatTaka(money(row.amount)),
      ]
        .filter(Boolean)
        .join(', '),
      href: maybe(row.loan_code) ? `/loans/${text(row.loan_code)}` : '/owner',
      exact: isExact(maybe(row.doc_no)),
      indirect: isIndirect(maybe(row.doc_no), maybe(row.description)),
    });
  }

  for (const row of payments) {
    const side = sideForRole(roleOf(row.party_role, row.direction));
    hits.push({
      kind: 'payment',
      code: maybe(row.doc_no) ?? maybe(row.reference) ?? 'Receipt',
      label: [
        text(row.party_name),
        formatTaka(money(row.amount)),
        maybe(row.reference),
      ]
        .filter(Boolean)
        .join(', '),
      href: `/${side}/settlements/${maybe(row.doc_no) ?? text(row.id)}`,
      exact: isExact(maybe(row.doc_no), maybe(row.reference)),
      indirect: isIndirect(maybe(row.doc_no), maybe(row.reference)),
    });
  }

  for (const row of expenses) {
    hits.push({
      kind: 'expense',
      code: maybe(row.doc_no) ?? 'Voucher',
      label: `${text(row.description)}, ${formatTaka(money(row.amount))}`,
      href: `/expenses/${maybe(row.doc_no) ?? text(row.id)}/edit`,
      exact: isExact(maybe(row.doc_no)),
      indirect: isIndirect(maybe(row.doc_no)),
    });
  }


  for (const row of advances) {
    hits.push({
      kind: 'advance',
      code: maybe(row.doc_no) ?? 'Advance',
      label: `${text(row.employee_name)}, ${formatTaka(money(row.amount))}`,
      href: `/payroll/advances/${text(row.id)}/edit`,
      exact: isExact(maybe(row.doc_no), maybe(row.reference)),
      indirect: isIndirect(maybe(row.doc_no), maybe(row.reference)),
    });
  }

  // An exact hit leads whatever kind it is, then the fixed order of kinds.
  // Within a kind the query's own ranking already holds.
  hits.sort((a, b) => {
    if (a.exact !== b.exact) return a.exact ? -1 : 1;
    // A record that matched on something of its own beats one carried in by
    // its party. Without this, typing a party name buries that party under
    // every bill it ever had.
    if (a.indirect !== b.indirect) return a.indirect ? 1 : -1;
    return HIT_ORDER.indexOf(a.kind) - HIT_ORDER.indexOf(b.kind);
  });

  return hits.slice(0, limit);
}

// Orders (2026-10-06) ----------------------------------------------------------
//
// Sales Orders, Purchase Orders and Work Orders, and everything worked out from
// them. Booked value, what was billed and what it cost are never stored: they
// are summed here from the bill lines and expenses that point at an order line,
// and the arithmetic itself is order-costing.ts. A PO or WO line's amount is
// worked out with lineAmount in JavaScript rather than in SQL, so the one
// rounding rule in amount.ts is the only one there is.

/** A Sales Order as a list shows it: what it is and where it has got to. */
export type SalesOrderSummary = {
  id: string;
  docNo: string;
  partyId: string;
  partyName: string;
  orderDate: string;
  customerRef: string | null;
  status: OrderStatus;
  categories: OrderCategory[];
  bookedValue: Money;
  billed: Money;
  stage: OrderStage;
};

const orderStatusOf = (value: unknown): OrderStatus =>
  value === 'closed' || value === 'cancelled' ? value : 'open';

export async function listSalesOrders(
  options: {
    partyId?: string | null;
    status?: string | null;
    /** Matches the SO number, the customer's reference or the customer. */
    search?: string | null;
    limit?: number;
  } = {},
): Promise<SalesOrderSummary[]> {
  const sql = db();
  const partyId = options.partyId && isUuid(options.partyId) ? options.partyId : null;
  const status = options.status || null;
  const search = options.search?.trim() ? `%${options.search.trim()}%` : null;
  const limit = options.limit ?? 200;

  const [orderRows, lineRows] = (await Promise.all([
    sql`
      SELECT so.id, so.doc_no, so.party_id, p.name AS party_name,
        to_char(so.order_date, 'YYYY-MM-DD') AS order_date,
        so.customer_ref, so.status
      FROM sales_order so JOIN party p ON p.id = so.party_id
      WHERE (${partyId}::uuid IS NULL OR so.party_id = ${partyId}::uuid)
        AND (${status}::text IS NULL OR so.status = ${status}::text)
        AND (${search}::text IS NULL OR so.doc_no ILIKE ${search}::text
          OR so.customer_ref ILIKE ${search}::text OR p.name ILIKE ${search}::text)
      ORDER BY so.order_date DESC, so.doc_no DESC
      LIMIT ${limit}::int
    `,
    // Every line of the same orders, with what the stage is read from. The
    // filter is repeated rather than passed as a list of ids, because the
    // driver binds values one at a time.
    sql`
      SELECT sol.order_id, sol.category, sol.quantity::text AS quantity,
        sol.rate::text AS rate,
        EXISTS (SELECT 1 FROM purchase_order_line pl
          JOIN purchase_order po ON po.id = pl.po_id
          WHERE pl.order_line_id = sol.id AND po.status <> 'cancelled')
          AS has_po,
        EXISTS (SELECT 1 FROM work_order_line wl
          JOIN work_order wo ON wo.id = wl.wo_id
          WHERE wl.order_line_id = sol.id AND wo.status <> 'cancelled'
            AND wo.process = 'knitting') AS has_knitting,
        EXISTS (SELECT 1 FROM work_order_line wl
          JOIN work_order wo ON wo.id = wl.wo_id
          WHERE wl.order_line_id = sol.id AND wo.status <> 'cancelled'
            AND wo.process = 'dyeing_finishing') AS has_dyeing,
        COALESCE((SELECT SUM(l.amount) FROM bill_line l
          JOIN bill b ON b.id = l.bill_id
          WHERE l.order_line_id = sol.id AND b.direction = 'issued'
            AND b.status = 'posted'), 0) AS billed,
        EXISTS (SELECT 1 FROM bill_line l JOIN bill b ON b.id = l.bill_id
          WHERE l.order_line_id = sol.id AND b.direction = 'issued'
            AND b.status = 'posted') AS is_billed
      FROM sales_order_line sol
      JOIN sales_order so ON so.id = sol.order_id
      JOIN party p ON p.id = so.party_id
      WHERE (${partyId}::uuid IS NULL OR so.party_id = ${partyId}::uuid)
        AND (${status}::text IS NULL OR so.status = ${status}::text)
        AND (${search}::text IS NULL OR so.doc_no ILIKE ${search}::text
          OR so.customer_ref ILIKE ${search}::text OR p.name ILIKE ${search}::text)
      ORDER BY sol.order_id, sol.line_no
    `,
  ])) as [Row[], Row[]];

  const linesByOrder = new Map<string, Row[]>();
  for (const row of lineRows) {
    const key = text(row.order_id);
    linesByOrder.set(key, [...(linesByOrder.get(key) ?? []), row]);
  }

  return orderRows.map((row) => {
    const lines = linesByOrder.get(text(row.id)) ?? [];
    const statusValue = orderStatusOf(row.status);
    return {
      id: text(row.id),
      docNo: text(row.doc_no),
      partyId: text(row.party_id),
      partyName: text(row.party_name),
      orderDate: text(row.order_date),
      customerRef: maybe(row.customer_ref),
      status: statusValue,
      categories: [
        ...new Set(lines.map((line) => text(line.category) as OrderCategory)),
      ],
      bookedValue: sumMoney(
        lines.map((line) => lineAmount(text(line.quantity), text(line.rate))),
      ),
      billed: sumMoney(lines.map((line) => money(line.billed))),
      stage: orderStage({
        status: statusValue,
        lines: lines.map((line) => ({
          hasPurchaseOrder: Boolean(line.has_po),
          hasKnittingOrder: Boolean(line.has_knitting),
          hasDyeingOrder: Boolean(line.has_dyeing),
          billedToCustomer: Boolean(line.is_billed),
        })),
      }),
    };
  });
}

/** A Sales Order by its SO number or its id. */
export async function findSalesOrder(handle: string): Promise<SalesOrder | null> {
  if (isUuid(handle)) return getSalesOrder(handle);
  if (!isDocNo(handle)) return null;
  const sql = db();
  const rows = (await sql`
    SELECT id::text AS id FROM sales_order WHERE upper(doc_no) = upper(${handle}::text)
  `) as Row[];
  return rows[0] ? getSalesOrder(text(rows[0].id)) : null;
}

export async function getSalesOrder(id: string): Promise<SalesOrder | null> {
  if (!isUuid(id)) return null;
  const sql = db();
  const [orderRows, lineRows] = (await Promise.all([
    sql`
      SELECT so.id, so.doc_no, so.party_id, p.name AS party_name,
        to_char(so.order_date, 'YYYY-MM-DD') AS order_date,
        so.customer_ref, so.status, so.notes
      FROM sales_order so JOIN party p ON p.id = so.party_id
      WHERE so.id = ${id}::uuid
    `,
    sql`
      SELECT id, line_no, category, description, color, unit,
        quantity::text AS quantity, rate::text AS rate
      FROM sales_order_line WHERE order_id = ${id}::uuid ORDER BY line_no
    `,
  ])) as [Row[], Row[]];
  const row = orderRows[0];
  if (!row) return null;
  return {
    id: text(row.id),
    docNo: text(row.doc_no),
    partyId: text(row.party_id),
    partyName: text(row.party_name),
    orderDate: text(row.order_date),
    customerRef: maybe(row.customer_ref),
    status: orderStatusOf(row.status),
    notes: maybe(row.notes),
    lines: lineRows.map((line) => ({
      id: text(line.id),
      lineNo: count(line.line_no),
      category: text(line.category) as OrderCategory,
      description: text(line.description),
      color: maybe(line.color),
      unit: text(line.unit) as OrderUnit,
      quantity: text(line.quantity),
      rate: text(line.rate),
    })),
  };
}

/**
 * Which of an order's lines something already points at, so an edit cannot
 * remove a line a bill, a PO, a WO or an expense was filed against.
 */
export async function referencedOrderLines(orderId: string): Promise<Set<string>> {
  if (!isUuid(orderId)) return new Set();
  const sql = db();
  const rows = (await sql`
    SELECT sol.id::text AS id FROM sales_order_line sol
    WHERE sol.order_id = ${orderId}::uuid AND (
      EXISTS (SELECT 1 FROM bill_line l WHERE l.order_line_id = sol.id)
      OR EXISTS (SELECT 1 FROM purchase_order_line pl WHERE pl.order_line_id = sol.id)
      OR EXISTS (SELECT 1 FROM work_order_line wl WHERE wl.order_line_id = sol.id)
      OR EXISTS (SELECT 1 FROM expense e WHERE e.order_line_id = sol.id))
  `) as Row[];
  return new Set(rows.map((row) => text(row.id)));
}

/** Whether any document at all is filed against the order. */
export async function salesOrderInUse(orderId: string): Promise<boolean> {
  if (!isUuid(orderId)) return false;
  const sql = db();
  const rows = (await sql`
    SELECT (
      EXISTS (SELECT 1 FROM expense e WHERE e.sales_order_id = ${orderId}::uuid)
      OR EXISTS (SELECT 1 FROM sales_order_line sol WHERE sol.order_id = ${orderId}::uuid
        AND (EXISTS (SELECT 1 FROM bill_line l WHERE l.order_line_id = sol.id)
          OR EXISTS (SELECT 1 FROM purchase_order_line pl WHERE pl.order_line_id = sol.id)
          OR EXISTS (SELECT 1 FROM work_order_line wl WHERE wl.order_line_id = sol.id)))
    ) AS in_use
  `) as Row[];
  return Boolean(rows[0]?.in_use);
}

/**
 * Everything order-costing.ts needs for one order, read from the documents.
 *
 * A subcontractor's bill line counts as knitting or dyeing by the Work Order
 * it was billed against, and, where it names an order line but no WO, by the
 * bill's own nature of work. A supplier's bill line is yarn. An expense
 * counts by the tier of its category; freight is transport.
 */
export async function salesOrderFigures(orderId: string): Promise<{
  lines: OrderLineInput[];
  orderLevel: OrderLevelInput;
} | null> {
  const order = await getSalesOrder(orderId);
  if (!order) return null;
  const sql = db();
  const [billRows, poRows, woRows, expenseRows] = (await Promise.all([
    sql`
      SELECT l.order_line_id,
        CASE
          WHEN b.direction = 'issued' THEN 'sale'
          WHEN COALESCE(b.party_role, 'subcontractor') = 'supplier' THEN 'yarn'
          WHEN COALESCE(wo.process,
            CASE WHEN b.nature_of_work = 'knitting' THEN 'knitting'
              ELSE 'dyeing_finishing' END) = 'knitting' THEN 'knitting'
          ELSE 'dyeing'
        END AS kind,
        SUM(l.amount) AS amount, SUM(l.grey_kg)::text AS qty
      FROM bill_line l
      JOIN bill b ON b.id = l.bill_id
      JOIN sales_order_line sol ON sol.id = l.order_line_id
      LEFT JOIN work_order_line wl ON wl.id = l.wo_line_id
      LEFT JOIN work_order wo ON wo.id = wl.wo_id
      WHERE sol.order_id = ${orderId}::uuid AND b.status = 'posted'
      GROUP BY 1, 2
    `,
    sql`
      SELECT pl.order_line_id, pl.quantity_kg::text AS qty, pl.rate::text AS rate
      FROM purchase_order_line pl
      JOIN purchase_order po ON po.id = pl.po_id
      JOIN sales_order_line sol ON sol.id = pl.order_line_id
      WHERE sol.order_id = ${orderId}::uuid AND po.status <> 'cancelled'
    `,
    sql`
      SELECT wl.order_line_id, wo.process, wl.quantity_kg::text AS qty,
        wl.rate::text AS rate
      FROM work_order_line wl
      JOIN work_order wo ON wo.id = wl.wo_id
      JOIN sales_order_line sol ON sol.id = wl.order_line_id
      WHERE sol.order_id = ${orderId}::uuid AND wo.status <> 'cancelled'
    `,
    sql`
      SELECT order_line_id, category, SUM(amount) AS amount
      FROM expense WHERE sales_order_id = ${orderId}::uuid
      GROUP BY 1, 2
    `,
  ])) as [Row[], Row[], Row[], Row[]];

  const zero = () => ({
    billed: Money.ZERO,
    billedQty: 0n,
    yarnOrdered: Money.ZERO,
    yarnBilled: Money.ZERO,
    knittingOrdered: Money.ZERO,
    knittingBilled: Money.ZERO,
    dyeingOrdered: Money.ZERO,
    dyeingBilled: Money.ZERO,
    transport: Money.ZERO,
    otherDirect: Money.ZERO,
    selling: Money.ZERO,
  });
  const byLine = new Map(order.lines.map((line) => [line.id, zero()]));
  const orderLevel = { transport: Money.ZERO, otherDirect: Money.ZERO, selling: Money.ZERO };

  for (const row of billRows) {
    const entry = byLine.get(text(row.order_line_id));
    if (!entry) continue;
    const amount = money(row.amount);
    switch (text(row.kind)) {
      case 'sale':
        entry.billed = entry.billed.add(amount);
        entry.billedQty += parseQtyKg(text(row.qty) || '0');
        break;
      case 'yarn':
        entry.yarnBilled = entry.yarnBilled.add(amount);
        break;
      case 'knitting':
        entry.knittingBilled = entry.knittingBilled.add(amount);
        break;
      default:
        entry.dyeingBilled = entry.dyeingBilled.add(amount);
    }
  }
  for (const row of poRows) {
    const entry = byLine.get(text(row.order_line_id));
    if (entry) {
      entry.yarnOrdered = entry.yarnOrdered.add(
        lineAmount(text(row.qty), text(row.rate)),
      );
    }
  }
  for (const row of woRows) {
    const entry = byLine.get(text(row.order_line_id));
    if (!entry) continue;
    const amount = lineAmount(text(row.qty), text(row.rate));
    if (text(row.process) === 'knitting') {
      entry.knittingOrdered = entry.knittingOrdered.add(amount);
    } else {
      entry.dyeingOrdered = entry.dyeingOrdered.add(amount);
    }
  }
  for (const row of expenseRows) {
    const amount = money(row.amount);
    const category = text(row.category);
    const tier = expenseCategoryTier(category);
    // Overhead is never pinned to an order, even when somebody filed it there.
    if (tier === 'operating') continue;
    const target = maybe(row.order_line_id)
      ? byLine.get(text(row.order_line_id))
      : orderLevel;
    if (!target) continue;
    if (tier === 'selling') {
      target.selling = target.selling.add(amount);
    } else if (category === 'freight_inward' || category === 'freight_outward') {
      target.transport = target.transport.add(amount);
    } else {
      target.otherDirect = target.otherDirect.add(amount);
    }
  }

  return {
    lines: order.lines.map((line) => {
      const entry = byLine.get(line.id) ?? zero();
      return {
        lineId: line.id,
        lineNo: line.lineNo,
        category: line.category,
        description: line.description,
        color: line.color,
        quantity: line.quantity,
        rate: line.rate,
        ...entry,
        billedQty: formatQtyKg(entry.billedQty),
      };
    }),
    orderLevel,
  };
}

/** Every document filed against one order, for the list under its figures. */
export async function salesOrderDocuments(orderId: string): Promise<{
  purchaseOrders: { docNo: string; partyName: string; date: string; status: OrderStatus }[];
  workOrders: {
    docNo: string;
    partyName: string;
    date: string;
    process: WorkProcess;
    status: OrderStatus;
  }[];
  bills: {
    id: string;
    docNo: string | null;
    billNo: string | null;
    partyName: string;
    partyRole: PartyRole;
    date: string;
    amount: Money;
  }[];
  expenses: {
    docNo: string | null;
    date: string;
    category: ExpenseCategory;
    description: string;
    lineNo: number | null;
    amount: Money;
  }[];
}> {
  if (!isUuid(orderId)) {
    return { purchaseOrders: [], workOrders: [], bills: [], expenses: [] };
  }
  const sql = db();
  const [poRows, woRows, billRows, expenseRows] = (await Promise.all([
    sql`
      SELECT DISTINCT po.doc_no, p.name AS party_name,
        to_char(po.order_date, 'YYYY-MM-DD') AS date, po.status
      FROM purchase_order po
      JOIN party p ON p.id = po.party_id
      JOIN purchase_order_line pl ON pl.po_id = po.id
      JOIN sales_order_line sol ON sol.id = pl.order_line_id
      WHERE sol.order_id = ${orderId}::uuid
      ORDER BY 3, 1
    `,
    sql`
      SELECT DISTINCT wo.doc_no, p.name AS party_name,
        to_char(wo.order_date, 'YYYY-MM-DD') AS date, wo.process, wo.status
      FROM work_order wo
      JOIN party p ON p.id = wo.party_id
      JOIN work_order_line wl ON wl.wo_id = wo.id
      JOIN sales_order_line sol ON sol.id = wl.order_line_id
      WHERE sol.order_id = ${orderId}::uuid
      ORDER BY 3, 1
    `,
    sql`
      SELECT b.id, b.doc_no, b.bill_no, p.name AS party_name, b.party_role,
        b.direction, to_char(b.bill_date, 'YYYY-MM-DD') AS date,
        SUM(l.amount) AS amount
      FROM bill_line l
      JOIN bill b ON b.id = l.bill_id
      JOIN party p ON p.id = b.party_id
      JOIN sales_order_line sol ON sol.id = l.order_line_id
      WHERE sol.order_id = ${orderId}::uuid AND b.status = 'posted'
      GROUP BY b.id, b.doc_no, b.bill_no, p.name, b.party_role, b.direction, b.bill_date
      ORDER BY b.bill_date, b.doc_no
    `,
    sql`
      SELECT e.doc_no, to_char(e.spent_on, 'YYYY-MM-DD') AS date, e.category,
        e.description, e.amount, sol.line_no
      FROM expense e
      LEFT JOIN sales_order_line sol ON sol.id = e.order_line_id
      WHERE e.sales_order_id = ${orderId}::uuid
      ORDER BY e.spent_on, e.doc_no
    `,
  ])) as [Row[], Row[], Row[], Row[]];

  return {
    purchaseOrders: poRows.map((row) => ({
      docNo: text(row.doc_no),
      partyName: text(row.party_name),
      date: text(row.date),
      status: orderStatusOf(row.status),
    })),
    workOrders: woRows.map((row) => ({
      docNo: text(row.doc_no),
      partyName: text(row.party_name),
      date: text(row.date),
      process: text(row.process) as WorkProcess,
      status: orderStatusOf(row.status),
    })),
    bills: billRows.map((row) => ({
      id: text(row.id),
      docNo: maybe(row.doc_no),
      billNo: maybe(row.bill_no),
      partyName: text(row.party_name),
      partyRole: roleOf(row.party_role, row.direction),
      date: text(row.date),
      amount: money(row.amount),
    })),
    expenses: expenseRows.map((row) => ({
      docNo: maybe(row.doc_no),
      date: text(row.date),
      category: text(row.category) as ExpenseCategory,
      description: text(row.description),
      lineNo: row.line_no === null || row.line_no === undefined ? null : count(row.line_no),
      amount: money(row.amount),
    })),
  };
}

/**
 * Every Sales Order line, for the pickers on a bill, a PO, a WO and an
 * expense. All of them, closed ones included, with the order's status beside
 * each: a form offers the open ones and still shows a closed one that a
 * document being edited already points at.
 */
export async function listOrderLineOptions(
  options: { partyId?: string | null } = {},
): Promise<(OrderLineOption & { orderStatus: OrderStatus })[]> {
  const sql = db();
  const partyId = options.partyId && isUuid(options.partyId) ? options.partyId : null;
  const rows = (await sql`
    SELECT sol.id, sol.order_id, so.doc_no, sol.line_no, so.party_id,
      p.name AS party_name, so.customer_ref, so.status, sol.category,
      sol.description, sol.color
    FROM sales_order_line sol
    JOIN sales_order so ON so.id = sol.order_id
    JOIN party p ON p.id = so.party_id
    WHERE (${partyId}::uuid IS NULL OR so.party_id = ${partyId}::uuid)
    ORDER BY so.order_date DESC, so.doc_no DESC, sol.line_no
  `) as Row[];
  return rows.map((row) => ({
    id: text(row.id),
    orderId: text(row.order_id),
    orderDocNo: text(row.doc_no),
    lineNo: count(row.line_no),
    partyId: text(row.party_id),
    partyName: text(row.party_name),
    customerRef: maybe(row.customer_ref),
    category: text(row.category) as OrderCategory,
    description: text(row.description),
    color: maybe(row.color),
    orderStatus: orderStatusOf(row.status),
  }));
}

/** One order line with its order, for checking a link before it is written. */
export async function getOrderLineOption(
  id: string,
): Promise<(OrderLineOption & { orderStatus: OrderStatus }) | null> {
  if (!isUuid(id)) return null;
  const sql = db();
  const rows = (await sql`
    SELECT sol.id, sol.order_id, so.doc_no, sol.line_no, so.party_id,
      p.name AS party_name, so.customer_ref, so.status, sol.category,
      sol.description, sol.color
    FROM sales_order_line sol
    JOIN sales_order so ON so.id = sol.order_id
    JOIN party p ON p.id = so.party_id
    WHERE sol.id = ${id}::uuid
  `) as Row[];
  const row = rows[0];
  if (!row) return null;
  return {
    id: text(row.id),
    orderId: text(row.order_id),
    orderDocNo: text(row.doc_no),
    lineNo: count(row.line_no),
    partyId: text(row.party_id),
    partyName: text(row.party_name),
    customerRef: maybe(row.customer_ref),
    category: text(row.category) as OrderCategory,
    description: text(row.description),
    color: maybe(row.color),
    orderStatus: orderStatusOf(row.status),
  };
}

/**
 * Every PO line (kind 'po') or WO line (kind 'wo'), for the picker on a
 * supplier's or subcontractor's bill, with the status of its PO or WO.
 */
export async function listSourceLineOptions(
  kind: 'po' | 'wo',
  options: { partyId?: string | null } = {},
): Promise<(SourceLineOption & { status: OrderStatus })[]> {
  const sql = db();
  const partyId = options.partyId && isUuid(options.partyId) ? options.partyId : null;
  const rows = (kind === 'po'
    ? await sql`
        SELECT pl.id, po.doc_no, pl.line_no, po.party_id, po.status,
          pl.order_line_id, so.doc_no AS order_doc_no, so.customer_ref,
          pl.description, NULL::text AS color,
          pl.quantity_kg::text AS quantity_kg, pl.rate::text AS rate
        FROM purchase_order_line pl
        JOIN purchase_order po ON po.id = pl.po_id
        JOIN sales_order_line sol ON sol.id = pl.order_line_id
        JOIN sales_order so ON so.id = sol.order_id
        WHERE (${partyId}::uuid IS NULL OR po.party_id = ${partyId}::uuid)
        ORDER BY po.order_date DESC, po.doc_no DESC, pl.line_no
      `
    : await sql`
        SELECT wl.id, wo.doc_no, wl.line_no, wo.party_id, wo.status,
          wl.order_line_id, so.doc_no AS order_doc_no, so.customer_ref,
          wl.description, wl.color,
          wl.quantity_kg::text AS quantity_kg, wl.rate::text AS rate
        FROM work_order_line wl
        JOIN work_order wo ON wo.id = wl.wo_id
        JOIN sales_order_line sol ON sol.id = wl.order_line_id
        JOIN sales_order so ON so.id = sol.order_id
        WHERE (${partyId}::uuid IS NULL OR wo.party_id = ${partyId}::uuid)
        ORDER BY wo.order_date DESC, wo.doc_no DESC, wl.line_no
      `) as Row[];
  return rows.map((row) => ({
    id: text(row.id),
    docNo: text(row.doc_no),
    lineNo: count(row.line_no),
    partyId: text(row.party_id),
    orderLineId: text(row.order_line_id),
    orderDocNo: text(row.order_doc_no),
    customerRef: maybe(row.customer_ref),
    description: text(row.description),
    color: maybe(row.color),
    quantityKg: text(row.quantity_kg),
    rate: text(row.rate),
    status: orderStatusOf(row.status),
  }));
}

/** A PO or WO line with its document's party and status, to check a link. */
export async function getSourceLine(
  kind: 'po' | 'wo',
  id: string,
): Promise<(SourceLineOption & { status: OrderStatus }) | null> {
  if (!isUuid(id)) return null;
  const all = await listSourceLineOptions(kind);
  return all.find((line) => line.id === id) ?? null;
}

// Purchase Orders and Work Orders.

type OrderDocKind = 'po' | 'wo';

/** The rows a PO or WO list shows. */
export type OrderDocSummary = {
  id: string;
  docNo: string;
  partyName: string;
  date: string;
  deliveryBy: string | null;
  status: OrderStatus;
  /** Knitting or Dyeing & Finishing on a WO; null on a PO. */
  process: WorkProcess | null;
  /** The Sales Orders its lines are for. */
  orderDocNos: string[];
  total: Money;
};

export async function listOrderDocs(
  kind: OrderDocKind,
  options: { partyId?: string | null; status?: string | null } = {},
): Promise<OrderDocSummary[]> {
  const sql = db();
  const partyId = options.partyId && isUuid(options.partyId) ? options.partyId : null;
  const status = options.status || null;
  const rows = (kind === 'po'
    ? await sql`
        SELECT d.id, d.doc_no, p.name AS party_name,
          to_char(d.order_date, 'YYYY-MM-DD') AS date,
          to_char(d.delivery_by, 'YYYY-MM-DD') AS delivery_by, d.status,
          NULL::text AS process,
          (SELECT jsonb_agg(jsonb_build_object('q', l.quantity_kg::text,
              'r', l.rate::text, 'so', so.doc_no))
            FROM purchase_order_line l
            JOIN sales_order_line sol ON sol.id = l.order_line_id
            JOIN sales_order so ON so.id = sol.order_id
            WHERE l.po_id = d.id) AS lines
        FROM purchase_order d JOIN party p ON p.id = d.party_id
        WHERE (${partyId}::uuid IS NULL OR d.party_id = ${partyId}::uuid)
          AND (${status}::text IS NULL OR d.status = ${status}::text)
        ORDER BY d.order_date DESC, d.doc_no DESC
      `
    : await sql`
        SELECT d.id, d.doc_no, p.name AS party_name,
          to_char(d.order_date, 'YYYY-MM-DD') AS date,
          to_char(d.delivery_by, 'YYYY-MM-DD') AS delivery_by, d.status,
          d.process,
          (SELECT jsonb_agg(jsonb_build_object('q', l.quantity_kg::text,
              'r', l.rate::text, 'so', so.doc_no))
            FROM work_order_line l
            JOIN sales_order_line sol ON sol.id = l.order_line_id
            JOIN sales_order so ON so.id = sol.order_id
            WHERE l.wo_id = d.id) AS lines
        FROM work_order d JOIN party p ON p.id = d.party_id
        WHERE (${partyId}::uuid IS NULL OR d.party_id = ${partyId}::uuid)
          AND (${status}::text IS NULL OR d.status = ${status}::text)
        ORDER BY d.order_date DESC, d.doc_no DESC
      `) as Row[];

  return rows.map((row) => {
    const lines = (
      typeof row.lines === 'string' ? JSON.parse(row.lines) : (row.lines ?? [])
    ) as { q: string; r: string; so: string }[];
    return {
      id: text(row.id),
      docNo: text(row.doc_no),
      partyName: text(row.party_name),
      date: text(row.date),
      deliveryBy: maybe(row.delivery_by),
      status: orderStatusOf(row.status),
      process: maybe(row.process) as WorkProcess | null,
      orderDocNos: [...new Set(lines.map((line) => line.so))],
      total: sumMoney(lines.map((line) => lineAmount(line.q, line.r))),
    };
  });
}

export async function findPurchaseOrder(handle: string): Promise<PurchaseOrder | null> {
  const id = await orderDocId('po', handle);
  return id ? getPurchaseOrder(id) : null;
}

export async function findWorkOrder(handle: string): Promise<WorkOrder | null> {
  const id = await orderDocId('wo', handle);
  return id ? getWorkOrder(id) : null;
}

async function orderDocId(kind: OrderDocKind, handle: string): Promise<string | null> {
  if (isUuid(handle)) return handle;
  if (!isDocNo(handle)) return null;
  const sql = db();
  const rows = (kind === 'po'
    ? await sql`SELECT id::text AS id FROM purchase_order
        WHERE upper(doc_no) = upper(${handle}::text)`
    : await sql`SELECT id::text AS id FROM work_order
        WHERE upper(doc_no) = upper(${handle}::text)`) as Row[];
  return rows[0] ? text(rows[0].id) : null;
}

export async function getPurchaseOrder(id: string): Promise<PurchaseOrder | null> {
  if (!isUuid(id)) return null;
  const sql = db();
  const [docRows, lineRows] = (await Promise.all([
    sql`
      SELECT d.id, d.doc_no, d.party_id, p.name AS party_name,
        to_char(d.order_date, 'YYYY-MM-DD') AS order_date,
        d.deliver_to_id, t.name AS deliver_to_name,
        to_char(d.delivery_by, 'YYYY-MM-DD') AS delivery_by,
        d.status, d.terms, d.notes
      FROM purchase_order d
      JOIN party p ON p.id = d.party_id
      LEFT JOIN party t ON t.id = d.deliver_to_id
      WHERE d.id = ${id}::uuid
    `,
    sql`
      SELECT l.id, l.line_no, l.order_line_id, so.doc_no AS order_doc_no,
        sol.line_no AS order_line_no, l.description,
        l.quantity_kg::text AS quantity_kg, l.rate::text AS rate
      FROM purchase_order_line l
      JOIN sales_order_line sol ON sol.id = l.order_line_id
      JOIN sales_order so ON so.id = sol.order_id
      WHERE l.po_id = ${id}::uuid ORDER BY l.line_no
    `,
  ])) as [Row[], Row[]];
  const row = docRows[0];
  if (!row) return null;
  const lines = lineRows.map((line) => ({
    id: text(line.id),
    lineNo: count(line.line_no),
    orderLineId: text(line.order_line_id),
    orderDocNo: text(line.order_doc_no),
    orderLineNo: count(line.order_line_no),
    description: text(line.description),
    quantityKg: text(line.quantity_kg),
    rate: text(line.rate),
    amount: lineAmount(text(line.quantity_kg), text(line.rate)),
  }));
  return {
    id: text(row.id),
    docNo: text(row.doc_no),
    partyId: text(row.party_id),
    partyName: text(row.party_name),
    orderDate: text(row.order_date),
    deliverToId: maybe(row.deliver_to_id),
    deliverToName: maybe(row.deliver_to_name),
    deliveryBy: maybe(row.delivery_by),
    status: orderStatusOf(row.status),
    terms: maybe(row.terms),
    notes: maybe(row.notes),
    total: sumMoney(lines.map((line) => line.amount)),
    lines,
  };
}

export async function getWorkOrder(id: string): Promise<WorkOrder | null> {
  if (!isUuid(id)) return null;
  const sql = db();
  const [docRows, lineRows] = (await Promise.all([
    sql`
      SELECT d.id, d.doc_no, d.party_id, p.name AS party_name, d.process,
        to_char(d.order_date, 'YYYY-MM-DD') AS order_date,
        d.deliver_to_id, t.name AS deliver_to_name,
        to_char(d.delivery_by, 'YYYY-MM-DD') AS delivery_by,
        d.status, d.terms, d.notes
      FROM work_order d
      JOIN party p ON p.id = d.party_id
      LEFT JOIN party t ON t.id = d.deliver_to_id
      WHERE d.id = ${id}::uuid
    `,
    sql`
      SELECT l.id, l.line_no, l.order_line_id, so.doc_no AS order_doc_no,
        sol.line_no AS order_line_no, l.description, l.color, l.gsm, l.dia,
        l.quantity_kg::text AS quantity_kg, l.rate::text AS rate
      FROM work_order_line l
      JOIN sales_order_line sol ON sol.id = l.order_line_id
      JOIN sales_order so ON so.id = sol.order_id
      WHERE l.wo_id = ${id}::uuid ORDER BY l.line_no
    `,
  ])) as [Row[], Row[]];
  const row = docRows[0];
  if (!row) return null;
  const lines = lineRows.map((line) => ({
    id: text(line.id),
    lineNo: count(line.line_no),
    orderLineId: text(line.order_line_id),
    orderDocNo: text(line.order_doc_no),
    orderLineNo: count(line.order_line_no),
    description: text(line.description),
    color: maybe(line.color),
    gsm: maybe(line.gsm),
    dia: maybe(line.dia),
    quantityKg: text(line.quantity_kg),
    rate: text(line.rate),
    amount: lineAmount(text(line.quantity_kg), text(line.rate)),
  }));
  return {
    id: text(row.id),
    docNo: text(row.doc_no),
    partyId: text(row.party_id),
    partyName: text(row.party_name),
    process: text(row.process) as WorkProcess,
    orderDate: text(row.order_date),
    deliverToId: maybe(row.deliver_to_id),
    deliverToName: maybe(row.deliver_to_name),
    deliveryBy: maybe(row.delivery_by),
    status: orderStatusOf(row.status),
    terms: maybe(row.terms),
    notes: maybe(row.notes),
    total: sumMoney(lines.map((line) => line.amount)),
    lines,
  };
}

/** Which lines of a PO or WO a bill already points at, so an edit cannot drop them. */
export async function referencedSourceLines(
  kind: OrderDocKind,
  docId: string,
): Promise<Set<string>> {
  if (!isUuid(docId)) return new Set();
  const sql = db();
  const rows = (kind === 'po'
    ? await sql`SELECT l.id::text AS id FROM purchase_order_line l
        WHERE l.po_id = ${docId}::uuid
          AND EXISTS (SELECT 1 FROM bill_line b WHERE b.po_line_id = l.id)`
    : await sql`SELECT l.id::text AS id FROM work_order_line l
        WHERE l.wo_id = ${docId}::uuid
          AND EXISTS (SELECT 1 FROM bill_line b WHERE b.wo_line_id = l.id)`) as Row[];
  return new Set(rows.map((row) => text(row.id)));
}

// The dashboard.

/**
 * The counts behind the Needs Attention strip, each a question the book can
 * answer and a screen that settles it. Overdue receivable is not here: the
 * ageing the dashboard already reads answers that.
 */
export async function attentionCounts(today: string): Promise<{
  draftBills: number;
  billsNeedingDetail: number;
  overdueWorkOrders: number;
  unbilledOrderLines: number;
}> {
  const sql = db();
  const rows = (await sql`
    SELECT
      (SELECT COUNT(*) FROM bill WHERE status = 'draft') AS draft_bills,
      (SELECT COUNT(*) FROM bill b WHERE b.status = 'posted'
        AND EXISTS (SELECT 1 FROM bill_line l WHERE l.bill_id = b.id
          AND l.color IS NULL)
        AND COALESCE(b.party_role, CASE WHEN b.direction = 'issued'
          THEN 'customer' ELSE 'subcontractor' END) <> 'supplier')
        AS needs_detail,
      (SELECT COUNT(*) FROM work_order WHERE status = 'open'
        AND delivery_by < ${today}::date) AS overdue_work_orders,
      -- Work a subcontractor or supplier has billed on a line of an open
      -- order, with nothing billed to the customer on it yet.
      (SELECT COUNT(*) FROM sales_order_line sol
        JOIN sales_order so ON so.id = sol.order_id AND so.status = 'open'
        WHERE EXISTS (SELECT 1 FROM bill_line l JOIN bill b ON b.id = l.bill_id
            WHERE l.order_line_id = sol.id AND b.direction = 'received'
              AND b.status = 'posted')
          AND NOT EXISTS (SELECT 1 FROM bill_line l JOIN bill b ON b.id = l.bill_id
            WHERE l.order_line_id = sol.id AND b.direction = 'issued'
              AND b.status = 'posted')) AS unbilled_lines
  `) as Row[];
  const row = rows[0] ?? {};
  return {
    draftBills: count(row.draft_bills),
    billsNeedingDetail: count(row.needs_detail),
    overdueWorkOrders: count(row.overdue_work_orders),
    unbilledOrderLines: count(row.unbilled_lines),
  };
}

/** Customers ranked by what was billed to them in a window. */
export async function topCustomers(
  from: string,
  to: string,
  limit = 5,
): Promise<{ total: Money; customers: { partyId: string; name: string; code: string | null; billed: Money }[] }> {
  const sql = db();
  const [rows, totals] = (await Promise.all([
    sql`
      SELECT p.id, p.name, p.code, SUM(b.total) AS billed
      FROM bill b JOIN party p ON p.id = b.party_id
      WHERE b.direction = 'issued' AND b.status = 'posted'
        AND b.bill_date >= ${from}::date AND b.bill_date <= ${to}::date
      GROUP BY p.id, p.name, p.code
      ORDER BY SUM(b.total) DESC, p.name
      LIMIT ${limit}::int
    `,
    sql`
      SELECT COALESCE(SUM(total), 0) AS total FROM bill
      WHERE direction = 'issued' AND status = 'posted'
        AND bill_date >= ${from}::date AND bill_date <= ${to}::date
    `,
  ])) as [Row[], Row[]];
  return {
    total: money(totals[0]?.total),
    customers: rows.map((row) => ({
      partyId: text(row.id),
      name: text(row.name),
      code: maybe(row.code),
      billed: money(row.billed),
    })),
  };
}
