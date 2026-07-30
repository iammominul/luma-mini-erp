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
  parties: unknown[];
  bills: unknown[];
  payments: unknown[];
  activityLog: unknown[];
};

export async function exportEverything(): Promise<ExportBundle> {
  const sql = db();
  const rows = (await sql`
    SELECT jsonb_build_object(
      'exportedAt', to_char(now() AT TIME ZONE 'Asia/Dhaka', 'YYYY-MM-DD"T"HH24:MI:SS'),
      'parties', (
        SELECT COALESCE(jsonb_agg(jsonb_build_object(
          'id', p.id, 'name', p.name, 'type', p.type,
          'contactPerson', p.contact_person, 'phone', p.phone,
          'address', p.address, 'openingBalance', p.opening_balance::text,
          'openingAsOf', to_char(p.opening_as_of, 'YYYY-MM-DD'),
          'active', p.active) ORDER BY p.type, p.name), '[]'::jsonb)
        FROM party p),
      'bills', (
        SELECT COALESCE(jsonb_agg(jsonb_build_object(
          'id', b.id, 'billNo', b.bill_no,
          'billDate', to_char(b.bill_date, 'YYYY-MM-DD'),
          'partyId', b.party_id, 'partyName', pt.name, 'partyType', pt.type,
          'reference', b.reference, 'notes', b.notes, 'total', b.total::text,
          'lines', (
            SELECT COALESCE(jsonb_agg(jsonb_build_object(
              'lineNo', l.line_no, 'description', l.description,
              'qtyKg', l.qty_kg::text, 'rate', l.rate::text,
              'amount', l.amount::text) ORDER BY l.line_no), '[]'::jsonb)
            FROM bill_line l WHERE l.bill_id = b.id)
          ) ORDER BY b.bill_date, b.bill_no), '[]'::jsonb)
        FROM bill b JOIN party pt ON pt.id = b.party_id),
      'payments', (
        SELECT COALESCE(jsonb_agg(jsonb_build_object(
          'id', pay.id, 'partyId', pay.party_id, 'partyName', pt.name,
          'partyType', pt.type, 'paidOn', to_char(pay.paid_on, 'YYYY-MM-DD'),
          'amount', pay.amount::text, 'mode', pay.mode,
          'reference', pay.reference, 'notes', pay.notes)
          ORDER BY pay.paid_on), '[]'::jsonb)
        FROM payment pay JOIN party pt ON pt.id = pay.party_id),
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
      parties: [],
      bills: [],
      payments: [],
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
  billNo: string;
  billDate: string;
  partyName: string;
  partyType: string;
  reference: string | null;
  total: string;
  lines: {
    lineNo: number;
    description: string;
    qtyKg: string;
    rate: string;
    amount: string;
  }[];
};

type PaymentRow = {
  paidOn: string;
  partyName: string;
  partyType: string;
  amount: string;
  mode: string;
  reference: string | null;
  notes: string | null;
};

type PartyRow = {
  name: string;
  type: string;
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
        bill.partyType,
        bill.partyName,
        bill.reference,
        line.lineNo,
        line.description,
        line.qtyKg,
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
      'Party Type',
      'Party',
      'Reference',
      'Line',
      'Description',
      'Weight Kg',
      'Rate',
      'Line Amount',
      'Bill Total',
    ],
    rows,
  );
}

export function paymentsCsv(bundle: ExportBundle): string {
  return toCsv(
    ['Date', 'Party Type', 'Party', 'Amount', 'Mode', 'Reference', 'Notes'],
    (bundle.payments as PaymentRow[]).map((payment) => [
      payment.paidOn,
      payment.partyType,
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
      'Name',
      'Type',
      'Contact Person',
      'Phone',
      'Address',
      'Opening Balance',
      'Opening As Of',
      'Status',
    ],
    (bundle.parties as PartyRow[]).map((party) => [
      party.name,
      party.type,
      party.contactPerson,
      party.phone,
      party.address,
      party.openingBalance,
      party.openingAsOf,
      party.active ? 'Active' : 'Inactive',
    ]),
  );
}
