import { company } from './env';
import { db } from './db';

/**
 * The whole book as one JSON document, or a single table as CSV.
 *
 * This is both the backup and the migration path: when the full ERP is ready,
 * it reads this file rather than anyone re-typing a year of bills. Money is
 * exported as text, never as a JSON number, so no amount can be rounded by a
 * parser on the way out.
 */

export type ExportBundle = {
  exportedAt: string;
  /**
   * The proprietor. One owner, so capital and drawings carry no member of their
   * own and this is where the ERP reads the name for its account 3000.
   */
  owner: { name: string };
  parties: unknown[];
  bills: unknown[];
  payments: unknown[];
  /**
   * Expenses and payroll travel with the rest. They are cash out rather than
   * accounting, so the ERP reads them as payment history and posts them against
   * its own chart of accounts. Leaving them out of the bundle would strand
   * every voucher and salary in this app when it is archived.
   */
  employees: unknown[];
  expenses: unknown[];
  advances: unknown[];
  /** Each run carries its own lines, the way a bill carries its lines. */
  payrollRuns: unknown[];
  leaveRecords: unknown[];
  /**
   * Capital, drawings and the loan book. The category on a movement is the ERP
   * account it posts to, so these load into its rules 13 to 17 directly.
   */
  loans: unknown[];
  fundMovements: unknown[];
  activityLog: unknown[];
};

export async function exportEverything(): Promise<ExportBundle> {
  const sql = db();
  const owner = company().ownerName;
  const rows = (await sql`
    SELECT jsonb_build_object(
      'exportedAt', to_char(now() AT TIME ZONE 'Asia/Dhaka', 'YYYY-MM-DD"T"HH24:MI:SS'),
      'owner', jsonb_build_object('name', ${owner}::text),
      'parties', (
        SELECT COALESCE(jsonb_agg(jsonb_build_object(
          'id', p.id, 'code', p.code, 'name', p.name,
          'isCustomer', p.is_customer, 'isSubcontractor', p.is_subcontractor,
          'isSupplier', p.is_supplier,
          'contactPerson', p.contact_person, 'phone', p.phone,
          'address', p.address, 'openingBalance', p.opening_balance::text,
          'openingAsOf', to_char(p.opening_as_of, 'YYYY-MM-DD'),
          'active', p.active) ORDER BY p.name), '[]'::jsonb)
        FROM party p),
      'bills', (
        SELECT COALESCE(jsonb_agg(jsonb_build_object(
          'id', b.id, 'billNo', b.bill_no,
          'docNo', b.doc_no,
          'billDate', to_char(b.bill_date, 'YYYY-MM-DD'),
          'partyId', b.party_id, 'partyName', pt.name,
          'direction', b.direction,
          -- Both of these were missing, and this export is the migration input
          -- the full ERP reads. Without status a draft imports as posted and
          -- moves a balance that was never in the book; without the nature of
          -- work the ledger cannot compose the Particulars line it prints.
          'status', b.status, 'natureOfWork', b.nature_of_work,
          'narration', b.narration,
          'notes', b.notes, 'total', b.total::text,
          'lines', (
            SELECT COALESCE(jsonb_agg(jsonb_build_object(
              'lineNo', l.line_no, 'description', l.description,
              'color', l.color,
              'challanNo', l.challan_no, 'orderNo', l.order_no,
              'lotNo', l.lot_no,
              'greyKg', l.grey_kg::text, 'finishedKg', l.finished_kg::text,
              'rate', l.rate::text,
              'amount', l.amount::text) ORDER BY l.line_no), '[]'::jsonb)
            FROM bill_line l WHERE l.bill_id = b.id)
          -- Date, then the system's own number. bill_no is text and orders
          -- nothing: '104' sorts before '34', and the bill books were run out
          -- of sequence anyway. Same rule as the register and the ledger.
          ) ORDER BY b.bill_date, b.doc_no NULLS LAST, b.created_at), '[]'::jsonb)
        FROM bill b JOIN party pt ON pt.id = b.party_id),
      'payments', (
        SELECT COALESCE(jsonb_agg(jsonb_build_object(
          'id', pay.id, 'partyId', pay.party_id, 'partyName', pt.name,
          'direction', pay.direction,
          'paidOn', to_char(pay.paid_on, 'YYYY-MM-DD'),
          'amount', pay.amount::text, 'mode', pay.mode,
          'reference', pay.reference, 'narration', pay.narration,
          'notes', pay.notes)
          ORDER BY pay.paid_on), '[]'::jsonb)
        FROM payment pay JOIN party pt ON pt.id = pay.party_id),
      'employees', (
        SELECT COALESCE(jsonb_agg(jsonb_build_object(
          'id', e.id, 'code', e.code, 'name', e.name,
          'designation', e.designation, 'phone', e.phone,
          'nid', e.nid, 'address', e.address,
          'joinedOn', to_char(e.joined_on, 'YYYY-MM-DD'),
          'active', e.active,
          -- The current structure. What any month actually paid is on its
          -- payroll line, which carries its own copy.
          'basic', e.basic::text, 'houseRent', e.house_rent::text,
          'medical', e.medical::text, 'conveyance', e.conveyance::text,
          'mobileAllowance', e.mobile_allowance::text,
          'otherAllowance', e.other_allowance::text, 'gross', e.gross::text,
          'paymentMethod', e.payment_method, 'bankName', e.bank_name,
          'accountNo', e.account_no, 'mfsNumber', e.mfs_number)
          ORDER BY e.name), '[]'::jsonb)
        FROM employee e),
      'expenses', (
        SELECT COALESCE(jsonb_agg(jsonb_build_object(
          'id', x.id, 'docNo', x.doc_no,
          'spentOn', to_char(x.spent_on, 'YYYY-MM-DD'),
          'category', x.category, 'payee', x.payee,
          'description', x.description, 'amount', x.amount::text,
          'mode', x.mode, 'reference', x.reference,
          -- Was missing. The order reference is what lets a cost be read back
          -- against the order it was incurred for, and the bundle is the ERP's
          -- migration input: without it every per order figure has to be keyed
          -- again on the other side.
          'orderNo', x.order_no,
          'notes', x.notes)
          ORDER BY x.spent_on, x.doc_no), '[]'::jsonb)
        FROM expense x),
      'advances', (
        SELECT COALESCE(jsonb_agg(jsonb_build_object(
          'id', ad.id, 'docNo', ad.doc_no, 'employeeId', ad.employee_id,
          'employeeName', em.name,
          'paidOn', to_char(ad.paid_on, 'YYYY-MM-DD'),
          'amount', ad.amount::text, 'mode', ad.mode,
          'reference', ad.reference, 'reason', ad.reason, 'notes', ad.notes)
          ORDER BY ad.paid_on, ad.doc_no), '[]'::jsonb)
        FROM advance ad JOIN employee em ON em.id = ad.employee_id),
      -- A run and its lines travel together, the way a bill carries its lines.
      -- Each line keeps the components it was actually paid on, so a payslip
      -- can be reproduced from the bundle without the employee record.
      'payrollRuns', (
        SELECT COALESCE(jsonb_agg(jsonb_build_object(
          'id', r.id, 'docNo', r.doc_no, 'period', r.period,
          'status', r.status, 'perDayBasis', r.per_day_basis,
          'notes', r.notes, 'approvedBy', r.approved_by,
          'approvedAt', to_char(r.approved_at AT TIME ZONE 'Asia/Dhaka',
            'YYYY-MM-DD"T"HH24:MI:SS'),
          'paidBy', r.paid_by,
          'paidAt', to_char(r.paid_at AT TIME ZONE 'Asia/Dhaka',
            'YYYY-MM-DD"T"HH24:MI:SS'),
          'lines', (
            SELECT COALESCE(jsonb_agg(jsonb_build_object(
              'id', l.id, 'employeeId', l.employee_id, 'employeeName', em2.name,
              'designation', l.designation,
              'basic', l.basic::text, 'houseRent', l.house_rent::text,
              'medical', l.medical::text, 'conveyance', l.conveyance::text,
              'mobileAllowance', l.mobile_allowance::text,
              'otherAllowance', l.other_allowance::text, 'gross', l.gross::text,
              'absentDays', l.absent_days::text,
              'absenceDeduction', l.absence_deduction::text,
              'bonus', l.bonus::text,
              'additionalAllowance', l.additional_allowance::text,
              'advanceDeduction', l.advance_deduction::text,
              'otherDeduction', l.other_deduction::text,
              'netPaid', l.net_paid::text,
              'paidOn', to_char(l.paid_on, 'YYYY-MM-DD'),
              'remarks', l.remarks) ORDER BY em2.name), '[]'::jsonb)
            FROM payroll_line l JOIN employee em2 ON em2.id = l.employee_id
            WHERE l.run_id = r.id)
          ) ORDER BY r.period), '[]'::jsonb)
        FROM payroll_run r),
      'leaveRecords', (
        SELECT COALESCE(jsonb_agg(jsonb_build_object(
          'id', lr.id, 'employeeId', lr.employee_id, 'employeeName', em3.name,
          'leaveType', lr.leave_type,
          'fromDate', to_char(lr.from_date, 'YYYY-MM-DD'),
          'toDate', to_char(lr.to_date, 'YYYY-MM-DD'),
          'days', lr.days::text, 'reason', lr.reason)
          ORDER BY lr.from_date), '[]'::jsonb)
        FROM leave_record lr JOIN employee em3 ON em3.id = lr.employee_id),
      -- Fund flow. The category is the ERP's account, so a bundle loads into
      -- its posting rules 13 to 17 without anybody reclassifying a voucher:
      -- capital_introduced is 3000, owner_drawing is 3100, the two loan rows
      -- are 2400, interestAmount is 5500, and mode decides whether the other
      -- leg is 1000 Cash or 1100 Bank. loanCode names the lender a movement
      -- belongs to, so nothing has to be joined back.
      --
      -- Capital and drawings carry no member, because this book has one owner
      -- and no master row for them. The proprietor's name travels once at the
      -- root of the bundle instead, from COMPANY_OWNER_NAME, so an import can
      -- post rules 13 and 14 without stopping to ask whose money it was.
      'loans', (
        SELECT COALESCE(jsonb_agg(jsonb_build_object(
          'id', l.id, 'code', l.code, 'lender', l.lender,
          'reference', l.reference,
          'takenOn', to_char(l.taken_on, 'YYYY-MM-DD'),
          'terms', l.terms, 'active', l.active, 'notes', l.notes)
          ORDER BY l.code), '[]'::jsonb)
        FROM loan l),
      'fundMovements', (
        SELECT COALESCE(jsonb_agg(jsonb_build_object(
          'id', f.id, 'docNo', f.doc_no,
          'movedOn', to_char(f.moved_on, 'YYYY-MM-DD'),
          'category', f.category, 'loanId', f.loan_id,
          'loanCode', l2.code, 'lender', l2.lender,
          'description', f.description, 'amount', f.amount::text,
          'interestAmount', f.interest_amount::text,
          -- mode decides 1000 Cash against 1100 Bank on the ERP's rules 13 to
          -- 17, so it travels even though the Cash Book shows one balance.
          'mode', f.mode,
          'reference', f.reference, 'notes', f.notes)
          ORDER BY f.moved_on, f.doc_no), '[]'::jsonb)
        FROM fund_movement f LEFT JOIN loan l2 ON l2.id = f.loan_id),
      'activityLog', (
        SELECT COALESCE(jsonb_agg(jsonb_build_object(
          'id', a.id::text,
          'at', to_char(a.at AT TIME ZONE 'Asia/Dhaka', 'YYYY-MM-DD"T"HH24:MI:SS'),
          'action', a.action, 'entity', a.entity, 'entityId', a.entity_id,
          'summary', a.summary, 'reason', a.reason,
          'before', a.before_json, 'after', a.after_json) ORDER BY a.id), '[]'::jsonb)
        FROM activity_log a)
    ) AS bundle
  `) as { bundle: ExportBundle }[];

  return (
    rows[0]?.bundle ?? {
      exportedAt: '',
      owner: { name: '' },
      parties: [],
      bills: [],
      payments: [],
      employees: [],
      expenses: [],
      advances: [],
      payrollRuns: [],
      leaveRecords: [],
      loans: [],
      fundMovements: [],
      activityLog: [],
    }
  );
}

function cell(value: unknown): string {
  const text = value === null || value === undefined ? '' : String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(
  headers: string[],
  rows: (string | number | null)[][],
): string {
  // A leading BOM so Excel opens the file as UTF-8 rather than guessing.
  return (
    '﻿' +
    [
      headers.map(cell).join(','),
      ...rows.map((row) => row.map(cell).join(',')),
    ].join('\r\n') +
    '\r\n'
  );
}

type BillRow = {
  direction: string;
  billNo: string;
  docNo: string | null;
  billDate: string;
  partyName: string;
  partyType: string;
  status: string;
  natureOfWork: string;
  notes: string | null;
  total: string;
  lines: {
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
  }[];
};

type PaymentRow = {
  paidOn: string;
  partyName: string;
  direction: string;
  amount: string;
  mode: string;
  reference: string | null;
  notes: string | null;
};

type PartyRow = {
  code: string | null;
  name: string;
  isCustomer: boolean;
  isSubcontractor: boolean;
  isSupplier: boolean;
  contactPerson: string | null;
  phone: string | null;
  address: string | null;
  openingBalance: string;
  openingAsOf: string | null;
  active: boolean;
};

/** One row per bill line, which is what a spreadsheet is useful for. */
export function billsCsv(bundle: ExportBundle): string {
  const rows: (string | number | null)[][] = [];
  for (const bill of bundle.bills as BillRow[]) {
    for (const line of bill.lines) {
      rows.push([
        bill.billDate,
        bill.billNo,
        bill.docNo,
        bill.direction,
        bill.partyName,
        bill.status,
        bill.natureOfWork,
        line.lineNo,
        line.description,
        line.color,
        line.challanNo,
        line.orderNo,
        line.lotNo,
        line.greyKg,
        line.finishedKg,
        line.rate,
        line.amount,
        bill.total,
      ]);
    }
  }
  return toCsv(
    [
      'Bill Date',
      'Bill No',
      'System Bill No',
      'Direction',
      'Party',
      'Status',
      'Nature of Work',
      'Line',
      'Description',
      'Color',
      'Challan No',
      'Order No',
      'LOT No',
      'G/Weight Kg',
      'F/Weight Kg',
      'Rate',
      'Line Amount',
      'Bill Total',
    ],
    rows,
  );
}

export function paymentsCsv(bundle: ExportBundle): string {
  return toCsv(
    ['Date', 'Direction', 'Party', 'Amount', 'Mode', 'Reference', 'Notes'],
    (bundle.payments as PaymentRow[]).map((payment) => [
      payment.paidOn,
      payment.direction,
      payment.partyName,
      payment.amount,
      payment.mode,
      payment.reference,
      payment.notes,
    ]),
  );
}

export function partiesCsv(bundle: ExportBundle): string {
  return toCsv(
    [
      'Party Code',
      'Name',
      'Roles',
      'Contact Person',
      'Phone',
      'Address',
      'Opening Balance',
      'Opening As Of',
      'Status',
    ],
    (bundle.parties as PartyRow[]).map((party) => [
      party.code,
      party.name,
      [
        party.isCustomer ? 'customer' : '',
        party.isSubcontractor ? 'subcontractor' : '',
        party.isSupplier ? 'supplier' : '',
      ]
        .filter(Boolean)
        .join(', '),
      party.contactPerson,
      party.phone,
      party.address,
      party.openingBalance,
      party.openingAsOf,
      party.active ? 'Active' : 'Inactive',
    ]),
  );
}
