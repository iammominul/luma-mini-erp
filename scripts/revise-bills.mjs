#!/usr/bin/env node
/**
 * Revise the amount on bills already posted, from a corrected statement.
 *
 * scripts/load-statement.mjs creates and never edits, on purpose: it must not
 * walk over a weight somebody has since filled in by hand. So when a party
 * sends a corrected statement, or LUMA recalculates one from the register, the
 * bills already in the book need this instead.
 *
 *   node scripts/revise-bills.mjs <revisions-csv> <party-code> --reason="..."
 *   node scripts/revise-bills.mjs <revisions-csv> <party-code> --reason="..." --apply
 *
 * The CSV is "Bill No,Amount" under that heading row.
 *
 * Nothing is written without --apply, and a reason is required: an edit to a
 * posted bill changes what a party is owed, and the activity log has to say why
 * on whose authority. Re-running is safe, because a bill already standing at the
 * stated amount is left alone.
 *
 * What it refuses
 * ---------------
 * A bill carrying more than one line, because which line the correction belongs
 * to is not something a statement total can settle. Those are edited on the
 * screen, where the person doing it can see the lots.
 *
 * A new amount that no six-decimal rate reaches exactly on the weight already
 * recorded. The amount is exact poisha and the rate is worked back out of it,
 * so a rate that misses the amount would leave the line and its own arithmetic
 * disagreeing. See CLAUDE.md rule 1.
 *
 * DATABASE_URL is read from the environment or from .env.local. The database it
 * is about to write to is printed before anything happens, because this script
 * is equally capable of correcting the live book.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import pg from 'pg';

const root = join(import.meta.dirname, '..');

function loadEnvLocal() {
  const file = join(root, '.env.local');
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (!match) continue;
    const [, key, rawValue] = match;
    if (process.env[key]) continue;
    process.env[key] = rawValue.replace(/^["']|["']$/g, '');
  }
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

/** One CSV line into fields, honoring the quotes around a thousands separator. */
function splitCsvLine(line) {
  const fields = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const character = line[i];
    if (quoted) {
      if (character === '"' && line[i + 1] === '"') {
        field += '"';
        i++;
      } else if (character === '"') quoted = false;
      else field += character;
    } else if (character === '"') quoted = true;
    else if (character === ',') {
      fields.push(field);
      field = '';
    } else field += character;
  }
  fields.push(field);
  return fields;
}

/** A Taka figure as whole poisha. Commas are tolerated, a sign is not. */
function poisha(text) {
  const clean = (text ?? '').trim().replace(/,/g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(clean)) return null;
  const [whole = '0', frac = ''] = clean.split('.');
  return BigInt(whole) * 100n + BigInt((frac + '00').slice(0, 2));
}

/** A kg figure as whole grams, the way parseQtyKg in src/lib/amount.ts does. */
function grams(text) {
  const clean = (text ?? '').trim();
  if (!/^\d+(\.\d{1,3})?$/.test(clean)) return null;
  const [whole = '0', frac = ''] = clean.split('.');
  return BigInt(whole) * 1000n + BigInt((frac + '000').slice(0, 3));
}

/** Whole poisha as the '0.00' text NUMERIC(14,2) holds. */
function takaText(value) {
  const negative = value < 0n;
  const abs = negative ? -value : value;
  return `${negative ? '-' : ''}${abs / 100n}.${(abs % 100n).toString().padStart(2, '0')}`;
}

/** Whole micro-taka as the '0.000000' text NUMERIC(12,6) holds. */
function rateText(micro) {
  return `${micro / 1_000_000n}.${(micro % 1_000_000n).toString().padStart(6, '0')}`;
}

/** lineAmount from src/lib/amount.ts: weight times rate, half up at the poisha. */
function lineAmount(weightGrams, micro) {
  return (weightGrams * micro + 5_000_000n) / 10_000_000n;
}

/** The six-decimal rate nearest to amount over weight. */
function rateFor(weightGrams, amountPoisha) {
  return (amountPoisha * 10_000_000n + weightGrams / 2n) / weightGrams;
}

/** NUMERIC(12,6) holds six digits ahead of the point and no more. */
const MAX_MICRO = 1_000_000n * 1_000_000n;

// Reading the arguments -------------------------------------------------------

const [revisionsArg, partyCode, ...flags] = process.argv.slice(2);
const apply = flags.includes('--apply');
const reasonFlag = flags.find((flag) => flag.startsWith('--reason='));
const reason = reasonFlag ? reasonFlag.slice('--reason='.length).trim() : '';

if (!revisionsArg || !partyCode) {
  fail(
    'Usage: node scripts/revise-bills.mjs <revisions-csv> <party-code>\n' +
      '         --reason="..." [--apply]\n\n' +
      '  The CSV is "Bill No,Amount" under that heading row.\n' +
      '  --reason  why the amounts are being corrected. Required, and it is what\n' +
      '            the activity log records against every bill touched.\n\n' +
      '  node scripts/revise-bills.mjs backups/jhonstitch-revisions.csv SUB-0002 \\\n' +
      '    --reason="Corrected per the statement of 29-06-2026"',
  );
}
if (reason === '') {
  fail('--reason is required. An edit to a posted bill has to say why.');
}

loadEnvLocal();
const url = process.env.DATABASE_URL;
if (!url) fail('DATABASE_URL is not set. Put it in .env.local.');
if (!existsSync(resolve(process.cwd(), revisionsArg))) {
  fail(`No such file: ${revisionsArg}`);
}

// Reading the revisions -------------------------------------------------------

function readRevisions(path) {
  const lines = readFileSync(path, 'utf8')
    .split(/\r?\n/)
    .filter((line) => line.trim() !== '');
  const headerAt = lines.findIndex((line) => /^bill no\s*,\s*amount/i.test(line.trim()));
  if (headerAt < 0) fail(`${path} has no "Bill No,Amount" heading row.`);

  const rows = [];
  const problems = [];
  const seen = new Set();
  for (const [offset, line] of lines.slice(headerAt + 1).entries()) {
    const at = `${path} row ${headerAt + offset + 2}`;
    const [billNo, amount] = splitCsvLine(line);

    const number = (billNo ?? '').trim();
    const amountPoisha = poisha(amount ?? '');
    if (number === '') problems.push(`${at}: no bill number`);
    if (amountPoisha === null || amountPoisha <= 0n) {
      problems.push(`${at}: amount "${amount}" is not a figure above zero`);
      continue;
    }
    if (seen.has(number)) problems.push(`${at}: bill ${number} appears twice`);
    seen.add(number);
    rows.push({ billNo: number, amountPoisha });
  }

  if (problems.length > 0) {
    fail(`The revisions cannot be read:\n  ${problems.join('\n  ')}`);
  }
  return rows;
}

const revisions = readRevisions(resolve(process.cwd(), revisionsArg));

const pool = new pg.Pool({ connectionString: url });

const { rows: where } = await pool.query(
  `SELECT current_database() AS name, inet_server_addr()::text AS host`,
);
console.log(`Database:  ${where[0].name} at ${where[0].host ?? 'local socket'}`);

const { rows: parties } = await pool.query(
  `SELECT id, name FROM party WHERE lower(code) = lower($1)`,
  [partyCode],
);
const party = parties[0];
if (!party) {
  await pool.end();
  fail(`No party has the code ${partyCode}.`);
}

console.log(`Party:     ${party.name} (${partyCode})`);
console.log(`Revisions: ${revisions.length} from ${revisionsArg}`);
console.log(`Reason:    ${reason}\n`);

// Working out what changes ----------------------------------------------------

const planned = [];
const problems = [];

for (const row of revisions) {
  const { rows: found } = await pool.query(
    `SELECT b.id, b.status, b.total,
       (SELECT count(*) FROM bill_line l WHERE l.bill_id = b.id) AS line_count,
       (SELECT l.id FROM bill_line l WHERE l.bill_id = b.id ORDER BY l.line_no
         LIMIT 1) AS line_id,
       (SELECT l.grey_kg FROM bill_line l WHERE l.bill_id = b.id ORDER BY l.line_no
         LIMIT 1) AS grey_kg
     FROM bill b WHERE b.party_id = $1::uuid AND b.bill_no = $2`,
    [party.id, row.billNo],
  );
  const bill = found[0];
  if (!bill) {
    problems.push(`bill ${row.billNo} is not in the book against ${party.name}`);
    continue;
  }
  if (Number(bill.line_count) !== 1) {
    problems.push(
      `bill ${row.billNo} carries ${bill.line_count} lines, so which line the ` +
        `correction belongs to is not settled by a total. Edit it on the screen.`,
    );
    continue;
  }

  const was = poisha(String(bill.total));
  if (was === row.amountPoisha) continue; // already correct, nothing to do

  const weightGrams = grams(String(bill.grey_kg));
  const micro = rateFor(weightGrams, row.amountPoisha);
  if (micro >= MAX_MICRO) {
    problems.push(
      `bill ${row.billNo} needs a rate of ${rateText(micro)} to reach ` +
        `${takaText(row.amountPoisha)} on ${bill.grey_kg} kg, which does not fit ` +
        `NUMERIC(12,6).`,
    );
    continue;
  }
  const reached = lineAmount(weightGrams, micro);
  if (reached !== row.amountPoisha) {
    problems.push(
      `bill ${row.billNo} cannot be reached by any six-decimal rate on ` +
        `${bill.grey_kg} kg (${takaText(row.amountPoisha)} wanted, ` +
        `${takaText(reached)} reached)`,
    );
    continue;
  }

  planned.push({
    billNo: row.billNo,
    billId: bill.id,
    lineId: bill.line_id,
    status: bill.status,
    was,
    now: row.amountPoisha,
    micro,
  });
}

if (problems.length > 0) {
  await pool.end();
  fail(`Nothing was written. These stand in the way:\n  ${problems.join('\n  ')}`);
}

const already = revisions.length - planned.length;
console.log(`Bills to revise: ${planned.length} of ${revisions.length}`);
if (already > 0) console.log(`  already at the stated amount: ${already}`);

let net = 0n;
for (const row of planned) {
  net += row.now - row.was;
  const change = row.now - row.was;
  console.log(
    `  ${row.billNo.padEnd(14)} ${takaText(row.was).padStart(12)}  ->  ` +
      `${takaText(row.now).padStart(12)}   ` +
      `${(change > 0n ? `+${takaText(change)}` : takaText(change)).padStart(12)}` +
      `   rate ${rateText(row.micro)}`,
  );
}
console.log(
  `\nNet change to the payable: ${net > 0n ? '+' : ''}${takaText(net)}`,
);

if (!apply) {
  await pool.end();
  console.log('\nNothing written. Run it again with --apply to write this in.');
  process.exit(0);
}
if (planned.length === 0) {
  await pool.end();
  console.log('\nNothing to do: every bill already stands at the stated amount.');
  process.exit(0);
}

// Writing it in ---------------------------------------------------------------

let written = 0;

for (const row of planned) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows: before } = await client.query(
      `SELECT to_jsonb(b) || jsonb_build_object('lines', (
         SELECT COALESCE(jsonb_agg(to_jsonb(l) ORDER BY l.line_no), '[]'::jsonb)
         FROM bill_line l WHERE l.bill_id = b.id)) AS snapshot
       FROM bill b WHERE b.id = $1::uuid`,
      [row.billId],
    );

    await client.query(
      `UPDATE bill_line SET rate = $2::numeric, amount = $3::numeric
       WHERE id = $1::uuid`,
      [row.lineId, rateText(row.micro), takaText(row.now)],
    );

    // The total is set back from the lines rather than from the CSV, so the bill
    // and its lines can never disagree. CLAUDE.md rule 3.
    await client.query(
      `UPDATE bill SET total = (SELECT COALESCE(SUM(l.amount), 0)
         FROM bill_line l WHERE l.bill_id = bill.id), updated_at = now()
       WHERE id = $1::uuid`,
      [row.billId],
    );

    await client.query(
      `INSERT INTO activity_log (action, entity, entity_id, summary, reason,
         before_json, after_json)
       SELECT 'update', 'bill', b.id::text,
         'Bill Received ' || b.bill_no || ' from ' || $2 || ' revised to Tk ' ||
           b.total::text,
         $3, $4::jsonb,
         to_jsonb(b) || jsonb_build_object('lines', (
           SELECT COALESCE(jsonb_agg(to_jsonb(l) ORDER BY l.line_no), '[]'::jsonb)
           FROM bill_line l WHERE l.bill_id = b.id))
       FROM bill b WHERE b.id = $1::uuid`,
      [row.billId, party.name, reason, JSON.stringify(before[0].snapshot)],
    );

    await client.query('COMMIT');
    written++;
  } catch (error) {
    await client.query('ROLLBACK');
    client.release();
    await pool.end();
    fail(`\nBill ${row.billNo} failed, and was rolled back: ${error.message}`);
  } finally {
    client.release();
  }
}

// What the book now says, computed on read the way every balance in this app is.
const { rows: check } = await pool.query(
  `SELECT
     (SELECT opening_balance FROM party WHERE id = $1::uuid) AS opening,
     (SELECT COALESCE(SUM(total), 0) FROM bill
       WHERE party_id = $1::uuid AND direction = 'received' AND status = 'posted')
       AS billed,
     (SELECT COALESCE(SUM(amount), 0) FROM payment
       WHERE party_id = $1::uuid AND direction = 'out') AS paid`,
  [party.id],
);
await pool.end();

const opening = poisha(String(check[0].opening));
const billed = poisha(String(check[0].billed));
const paid = poisha(String(check[0].paid));

console.log(`\nWritten. ${written} bills revised.`);
console.log(`  opening balance:  ${takaText(opening)}`);
console.log(`  bills received:   ${takaText(billed)}`);
console.log(`  less paid:        ${takaText(paid)}`);
console.log(`  payable now:      ${takaText(opening + billed - paid)}`);
console.log('\nCheck that against the closing balance on the statement.');
