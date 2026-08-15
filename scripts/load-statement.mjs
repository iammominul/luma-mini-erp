#!/usr/bin/env node
/**
 * Load a subcontractor's statement of account: the bills they raised on LUMA and
 * the money LUMA paid against them.
 *
 * This is the other half of scripts/seed-bill-book.mjs. That script reconciles a
 * customer book LUMA already has against the register it was written from, and
 * only ever updates. This one creates: an old subcontractor sends a statement,
 * nothing about it is in the app yet, and the payable has to go on the books.
 *
 *   node scripts/load-statement.mjs <register-csv> <payments-csv> <party-code>
 *   node scripts/load-statement.mjs <register-csv> <payments-csv> <party-code> --apply
 *
 * Nothing is written without --apply. Re-running it is safe: a bill already in
 * the app under that number is left alone, and so is a payment already recorded
 * on the same date for the same amount and reference. It never edits, so it
 * cannot walk over a weight somebody has since filled in by hand.
 *
 * On the missing weight
 * --------------------
 * A statement gives a bill number, a date and an amount. It does not give a
 * weight, and bill_line.grey_kg is NOT NULL CHECK (grey_kg > 0), so a bill
 * received cannot be recorded without one. The register CSV therefore carries a
 * placeholder weight, and the rate is worked back out of the weight and the
 * amount exactly as the sibling script does, so the amount the party stated is
 * reproduced to the poisha. At the 1.000 kg this was written for, that rate is
 * the bill amount itself.
 *
 * That placeholder is recorded as one, not hidden: the line description says the
 * weight and rate are not available, and fabric_type and color are left blank so
 * every one of these bills shows up under the Needs Detail filter on the bills
 * list, ready to be completed if the paper bills ever turn up.
 *
 * DATABASE_URL is read from the environment or from .env.local.
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

// Reading the files -----------------------------------------------------------

/** One CSV line into fields, honoring the quotes around a narration. */
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

/** 'DD-MM-YY' as the register writes it into the 'YYYY-MM-DD' the app stores. */
function registerDate(text) {
  const match = /^(\d{2})-(\d{2})-(\d{2})$/.exec(text.trim());
  if (!match) return null;
  const [, day, month, year] = match;
  return `20${year}-${month}-${day}`;
}

/** 'YYYY-MM-DD', checked for being a real date the way isoDateSchema does. */
function isoDate(text) {
  const value = (text ?? '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [y, m, d] = value.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  const real =
    date.getUTCFullYear() === y &&
    date.getUTCMonth() === m - 1 &&
    date.getUTCDate() === d;
  return real ? value : null;
}

/** A kg figure as whole grams, the way parseQtyKg in src/lib/amount.ts does. */
function grams(text) {
  if (!/^\d+(\.\d{1,3})?$/.test(text)) return null;
  const [whole = '0', frac = ''] = text.split('.');
  return BigInt(whole) * 1000n + BigInt((frac + '000').slice(0, 3));
}

/** A Taka figure as whole poisha. Commas are tolerated, a sign is not. */
function poisha(text) {
  const clean = (text ?? '').trim().replace(/,/g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(clean)) return null;
  const [whole = '0', frac = ''] = clean.split('.');
  return BigInt(whole) * 100n + BigInt((frac + '00').slice(0, 2));
}

/** Whole micro-taka as the '0.000000' text NUMERIC(12,6) holds. */
function rateText(micro) {
  return `${micro / 1_000_000n}.${(micro % 1_000_000n).toString().padStart(6, '0')}`;
}

/** Whole poisha as the '0.00' text NUMERIC(14,2) holds. */
function takaText(value) {
  const negative = value < 0n;
  const abs = negative ? -value : value;
  return `${negative ? '-' : ''}${abs / 100n}.${(abs % 100n).toString().padStart(2, '0')}`;
}

/** Whole grams as the '0.000' text NUMERIC(12,3) holds. */
function kgText(value) {
  return `${value / 1000n}.${(value % 1000n).toString().padStart(3, '0')}`;
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

function readRegister(path) {
  const lines = readFileSync(path, 'utf8')
    .split(/\r?\n/)
    .filter((line) => line.trim() !== '');
  const headerAt = lines.findIndex((line) => /^date,\s*bill no/i.test(line.trim()));
  if (headerAt < 0) fail(`${path} has no "Date,Bill No,..." heading row.`);

  const rows = [];
  const problems = [];
  for (const [offset, line] of lines.slice(headerAt + 1).entries()) {
    const at = `${path} row ${headerAt + offset + 2}`;
    const [date, billNo, challan, grey, finished, amount] = splitCsvLine(line);

    const billDate = registerDate(date ?? '');
    const greyGrams = grams((grey ?? '').trim());
    const finishedGrams = (finished ?? '').trim() ? grams(finished.trim()) : null;
    const amountPoisha = poisha(amount ?? '');

    if (!billNo?.trim()) problems.push(`${at}: no bill number`);
    if (!billDate) problems.push(`${at}: date "${date}" is not DD-MM-YY`);
    if (greyGrams === null || greyGrams <= 0n) {
      problems.push(`${at}: grey weight "${grey}" is not a weight above zero`);
    }
    if ((finished ?? '').trim() && finishedGrams === null) {
      problems.push(`${at}: finished weight "${finished}" is not a weight`);
    }
    if (amountPoisha === null || amountPoisha <= 0n) {
      problems.push(`${at}: amount "${amount}" is not a figure above zero`);
    }
    if (problems.length > 0) continue;

    // The same rule the sibling script holds: the rate is invented, but it is
    // invented to land on the amount the party stated, and that is checked.
    const micro = rateFor(greyGrams, amountPoisha);
    if (micro >= MAX_MICRO) {
      problems.push(
        `${at}: bill ${billNo.trim()} needs a rate of ${rateText(micro)}, which does ` +
          `not fit NUMERIC(12,6). Split it across lines or give it a real weight.`,
      );
      continue;
    }
    const reached = lineAmount(greyGrams, micro);
    if (reached !== amountPoisha) {
      problems.push(
        `${at}: bill ${billNo.trim()} cannot be reached by any six-decimal rate ` +
          `(${takaText(amountPoisha)} wanted, ${takaText(reached)} reached)`,
      );
      continue;
    }

    rows.push({
      billNo: billNo.trim(),
      billDate,
      challanNo: (challan ?? '').trim() || null,
      greyGrams,
      finishedGrams: finishedGrams && finishedGrams > 0n ? finishedGrams : null,
      amountPoisha,
      micro,
    });
  }

  const seen = new Map();
  for (const row of rows) {
    if (seen.has(row.billNo)) {
      problems.push(`bill ${row.billNo} appears twice in the register`);
    }
    seen.set(row.billNo, row);
  }

  if (problems.length > 0) {
    fail(`The register cannot be loaded:\n  ${problems.join('\n  ')}`);
  }
  return rows;
}

/** The methods payment_mode_check allows. */
const MODES = new Set([
  'cash',
  'mobile_banking',
  'bank_transfer',
  'cheque',
  'rtgs',
  'lc',
  'other',
]);

function readPayments(path) {
  const lines = readFileSync(path, 'utf8')
    .split(/\r?\n/)
    .filter((line) => line.trim() !== '');
  const headerAt = lines.findIndex((line) => /^date,\s*amount/i.test(line.trim()));
  if (headerAt < 0) fail(`${path} has no "Date,Amount,..." heading row.`);

  const rows = [];
  const problems = [];
  for (const [offset, line] of lines.slice(headerAt + 1).entries()) {
    const at = `${path} row ${headerAt + offset + 2}`;
    const [date, amount, mode, reference, narration] = splitCsvLine(line);

    const paidOn = isoDate(date ?? '');
    const amountPoisha = poisha(amount ?? '');
    const method = (mode ?? '').trim();

    if (!paidOn) problems.push(`${at}: date "${date}" is not a real YYYY-MM-DD`);
    if (amountPoisha === null || amountPoisha <= 0n) {
      problems.push(`${at}: amount "${amount}" is not a figure above zero`);
    }
    if (!MODES.has(method)) {
      problems.push(`${at}: "${method}" is not a payment method this app records`);
    }
    if (problems.length > 0) continue;

    rows.push({
      paidOn,
      amountPoisha,
      mode: method,
      reference: (reference ?? '').trim() || null,
      narration: (narration ?? '').trim() || null,
    });
  }

  if (problems.length > 0) {
    fail(`The payments cannot be loaded:\n  ${problems.join('\n  ')}`);
  }
  return rows;
}

// Working out what to write ---------------------------------------------------

const [registerArg, paymentsArg, partyCode, ...flags] = process.argv.slice(2);
const apply = flags.includes('--apply');

/** --from=YYYY-MM-DD off the command line, or null if it was not given. */
function dateFlag(name) {
  const found = flags.find((flag) => flag.startsWith(`--${name}=`));
  if (found === undefined) return null;
  const value = isoDate(found.slice(name.length + 3));
  if (!value) fail(`--${name} needs a real date as YYYY-MM-DD.`);
  return value;
}

if (!registerArg || !paymentsArg || !partyCode) {
  fail(
    'Usage: node scripts/load-statement.mjs <register-csv> <payments-csv> <party-code>\n' +
      '         [--from=YYYY-MM-DD] [--to=YYYY-MM-DD] [--apply]\n\n' +
      '  --from  the date the statement opens its balance on. Defaults to the\n' +
      '          earliest record in the files, which is later whenever the\n' +
      '          statement opens before its first entry.\n' +
      '  --to    the date the statement closes on. Defaults to the latest record.\n\n' +
      '  node scripts/load-statement.mjs backups/jhonstitch-bill-book.csv \\\n' +
      '    backups/jhonstitch-payments.csv SUB-0002 \\\n' +
      '    --from=2026-04-01 --to=2026-05-24',
  );
}

loadEnvLocal();
const url = process.env.DATABASE_URL;
if (!url) fail('DATABASE_URL is not set. Put it in .env.local.');

for (const path of [registerArg, paymentsArg]) {
  if (!existsSync(resolve(process.cwd(), path))) fail(`No such file: ${path}`);
}

const register = readRegister(resolve(process.cwd(), registerArg));
const payments = readPayments(resolve(process.cwd(), paymentsArg));

/**
 * The period the statement covers, which every record quotes as its reference.
 *
 * A statement opens its balance before its first entry and closes it after the
 * last, so the records only bound the period from the inside. The real dates are
 * on the statement itself and are passed in; the records are the fallback.
 */
const dates = [
  ...register.map((row) => row.billDate),
  ...payments.map((row) => row.paidOn),
].sort();
const firstDate = dateFlag('from') ?? dates[0];
const lastDate = dateFlag('to') ?? dates[dates.length - 1];
if (firstDate > dates[0]) {
  fail(
    `--from is ${firstDate}, but there is a record dated ${dates[0]}. The statement ` +
      `cannot open after an entry it carries.`,
  );
}
if (lastDate < dates[dates.length - 1]) {
  fail(
    `--to is ${lastDate}, but there is a record dated ${dates[dates.length - 1]}. ` +
      `The statement cannot close before an entry it carries.`,
  );
}
const period = `Statement ${firstDate} to ${lastDate}`;

const pool = new pg.Pool({ connectionString: url });

const { rows: parties } = await pool.query(
  `SELECT id, name, is_subcontractor,
     to_char(opening_as_of, 'YYYY-MM-DD') AS opening_as_of
   FROM party WHERE lower(code) = lower($1)`,
  [partyCode],
);
const party = parties[0];
if (!party) {
  await pool.end();
  fail(`No party has the code ${partyCode}.`);
}
if (!party.is_subcontractor) {
  await pool.end();
  fail(
    `${party.name} (${partyCode}) does not hold the subcontractor role, and this ` +
      `loads bills received. Give the party that role first.`,
  );
}

console.log(`Party:     ${party.name} (${partyCode})`);
console.log(`Register:  ${register.length} bills from ${registerArg}`);
console.log(`Payments:  ${payments.length} entries from ${paymentsArg}`);
console.log(`Period:    ${firstDate} to ${lastDate}\n`);

const { rows: existingBills } = await pool.query(
  `SELECT bill_no FROM bill WHERE party_id = $1 AND direction = 'received'`,
  [party.id],
);
const haveBill = new Set(existingBills.map((row) => row.bill_no));

const { rows: existingPayments } = await pool.query(
  `SELECT to_char(paid_on, 'YYYY-MM-DD') AS paid_on, amount, reference
   FROM payment WHERE party_id = $1 AND direction = 'out'`,
  [party.id],
);
const havePayment = new Set(
  existingPayments.map(
    (row) => `${row.paid_on}|${takaText(poisha(String(row.amount)))}|${row.reference ?? ''}`,
  ),
);

const newBills = register.filter((row) => !haveBill.has(row.billNo));
const newPayments = payments.filter(
  (row) =>
    !havePayment.has(
      `${row.paidOn}|${takaText(row.amountPoisha)}|${row.reference ?? ''}`,
    ),
);

const billTotal = newBills.reduce((sum, row) => sum + row.amountPoisha, 0n);
const paidTotal = newPayments.reduce((sum, row) => sum + row.amountPoisha, 0n);

console.log(`Bills to create:    ${newBills.length} of ${register.length}, ${takaText(billTotal)}`);
if (newBills.length < register.length) {
  console.log(`  already recorded: ${register.length - newBills.length}`);
}
console.log(`Payments to create: ${newPayments.length} of ${payments.length}, ${takaText(paidTotal)}`);
if (newPayments.length < payments.length) {
  console.log(`  already recorded: ${payments.length - newPayments.length}`);
}

// The opening balance is dated when the party was keyed, which on an old
// subcontractor is long after the statement starts. Left alone it prints an
// opening line dated after the rows underneath it.
const movesOpening =
  party.opening_as_of === null || party.opening_as_of > firstDate;
if (movesOpening) {
  console.log(
    `\nOpening balance is dated ${party.opening_as_of ?? 'nothing'} and moves to ${firstDate}.`,
  );
}

const placeholderKg = new Set(newBills.map((row) => kgText(row.greyGrams)));
if (newBills.length > 0) {
  console.log(
    `\nGrey weight on every bill is taken from the register (${[...placeholderKg].join(', ')} kg).`,
  );
  console.log('Where that is a placeholder, the rate is the bill amount and the');
  console.log('line says the weight and rate are not available.\n');
  for (const row of newBills.slice(0, 5)) {
    console.log(
      `  ${row.billDate}  ${row.billNo.padEnd(14)} ${kgText(row.greyGrams).padStart(10)} kg` +
        ` at ${rateText(row.micro).padStart(14)} = ${takaText(row.amountPoisha).padStart(12)}`,
    );
  }
  if (newBills.length > 5) console.log(`  ... and ${newBills.length - 5} more`);
}

if (!apply) {
  await pool.end();
  console.log('\nNothing written. Run it again with --apply to write this in.');
  process.exit(0);
}

if (newBills.length === 0 && newPayments.length === 0 && !movesOpening) {
  await pool.end();
  console.log('\nNothing to do: the statement is already recorded.');
  process.exit(0);
}

// Writing it in ---------------------------------------------------------------

const reason = `Loaded from the statement of account received from ${party.name} (${period})`;

const description =
  'Dyeing and finishing charges per the statement of account. ' +
  'Weight and rate not available.';
const notes =
  `Recorded from the statement of account received from ${party.name}, covering ` +
  `${firstDate} to ${lastDate}. The statement gives the bill amount only, so the ` +
  `grey weight on this bill is a placeholder and the rate is worked back out of ` +
  `it. Neither is a figure agreed with the party. The bill total is the amount ` +
  `the statement states.`;

let billsWritten = 0;
let paymentsWritten = 0;

for (const row of newBills) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // doc_no is null on a bill received: the subcontractor's paper number is its
    // identity, and the gapless customer series is not touched here.
    const { rows: inserted } = await client.query(
      `INSERT INTO bill (party_id, direction, status, bill_no, book_no, doc_no,
         bill_date, nature_of_work, reference, narration, notes, total)
       VALUES ($1::uuid, 'received', 'posted', $2, NULL, NULL, $3::date,
         'dyeing_finishing', $4, NULL, $5, $6::numeric)
       RETURNING id`,
      [
        party.id,
        row.billNo,
        row.billDate,
        period,
        notes,
        takaText(row.amountPoisha),
      ],
    );
    const billId = inserted[0].id;

    // fabric_type and color stay null on purpose: that is what puts the bill in
    // the Needs Detail queue on the bills list.
    await client.query(
      `INSERT INTO bill_line (bill_id, line_no, description, fabric_type, color,
         challan_no, order_no, grey_kg, finished_kg, rate, amount)
       VALUES ($1::uuid, 1, $2, NULL, NULL, $3, NULL, $4::numeric, $5::numeric,
         $6::numeric, $7::numeric)`,
      [
        billId,
        description,
        row.challanNo,
        kgText(row.greyGrams),
        row.finishedGrams === null ? null : kgText(row.finishedGrams),
        rateText(row.micro),
        takaText(row.amountPoisha),
      ],
    );

    // The total is set back from the lines just written rather than carried
    // across from the CSV, so the bill and its lines can never disagree.
    await client.query(
      `UPDATE bill SET total = (SELECT COALESCE(SUM(l.amount), 0)
         FROM bill_line l WHERE l.bill_id = bill.id)
       WHERE id = $1::uuid`,
      [billId],
    );

    await client.query(
      `INSERT INTO activity_log (action, entity, entity_id, summary, reason, after_json)
       SELECT 'create', 'bill', b.id::text,
         'Bill Received ' || b.bill_no || ' from ' || $2 || ', Tk ' || b.total::text ||
           ' dated ' || to_char(b.bill_date, 'DD-Mon-YYYY'),
         $3,
         to_jsonb(b) || jsonb_build_object('lines', (
           SELECT COALESCE(jsonb_agg(to_jsonb(l) ORDER BY l.line_no), '[]'::jsonb)
           FROM bill_line l WHERE l.bill_id = b.id))
       FROM bill b WHERE b.id = $1::uuid`,
      [billId, party.name, reason],
    );

    await client.query('COMMIT');
    billsWritten++;
  } catch (error) {
    await client.query('ROLLBACK');
    client.release();
    await pool.end();
    fail(`\nBill ${row.billNo} failed, and was rolled back: ${error.message}`);
  } finally {
    client.release();
  }
}

for (const row of newPayments) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows: inserted } = await client.query(
      `INSERT INTO payment (party_id, direction, paid_on, amount, mode,
         reference, narration, notes)
       VALUES ($1::uuid, 'out', $2::date, $3::numeric, $4, $5, $6, $7)
       RETURNING id`,
      [
        party.id,
        row.paidOn,
        takaText(row.amountPoisha),
        row.mode,
        row.reference,
        row.narration,
        `Recorded from the statement of account received from ${party.name}.`,
      ],
    );

    await client.query(
      `INSERT INTO activity_log (action, entity, entity_id, summary, reason, after_json)
       SELECT 'create', 'payment', p.id::text,
         'Payment of Tk ' || p.amount::text || ' to ' || $2 || ' on ' ||
           to_char(p.paid_on, 'DD-Mon-YYYY'),
         $3, to_jsonb(p)
       FROM payment p WHERE p.id = $1::uuid`,
      [inserted[0].id, party.name, reason],
    );

    await client.query('COMMIT');
    paymentsWritten++;
  } catch (error) {
    await client.query('ROLLBACK');
    client.release();
    await pool.end();
    fail(
      `\nPayment of ${takaText(row.amountPoisha)} on ${row.paidOn} failed, ` +
        `and was rolled back: ${error.message}`,
    );
  } finally {
    client.release();
  }
}

if (movesOpening) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: before } = await client.query(
      `SELECT to_jsonb(p) AS snapshot FROM party p WHERE p.id = $1::uuid`,
      [party.id],
    );
    await client.query(
      `UPDATE party SET opening_as_of = $2::date, updated_at = now()
       WHERE id = $1::uuid`,
      [party.id, firstDate],
    );
    await client.query(
      `INSERT INTO activity_log (action, entity, entity_id, summary, reason,
         before_json, after_json)
       SELECT 'update', 'party', p.id::text,
         'Opening balance of ' || p.name || ' dated ' ||
           to_char(p.opening_as_of, 'DD-Mon-YYYY'),
         $2, $3::jsonb, to_jsonb(p)
       FROM party p WHERE p.id = $1::uuid`,
      [party.id, reason, JSON.stringify(before[0].snapshot)],
    );
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    client.release();
    await pool.end();
    fail(`\nThe opening balance date failed, and was rolled back: ${error.message}`);
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

console.log(`\nWritten. ${billsWritten} bills and ${paymentsWritten} payments recorded.`);
console.log(`  opening balance:  ${takaText(opening)}`);
console.log(`  bills received:   ${takaText(billed)}`);
console.log(`  less paid:        ${takaText(paid)}`);
console.log(`  payable now:      ${takaText(opening + billed - paid)}`);
console.log('\nCheck that against the closing balance on the statement.');
