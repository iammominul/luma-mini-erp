#!/usr/bin/env node
/**
 * Load a party's bill book from the register CSV, so every bill in the app
 * carries the amount the party was actually shown.
 *
 * The book records a date, a bill number, a challan, a grey weight, a finished
 * weight and an amount. It does not record a rate: the rate was worked back out
 * of the weight and the amount when the book was first keyed, and rounding it
 * to two decimals moved the amounts off the paper. This reads the register as
 * the authority, works out the six-decimal rate that reproduces its amount to
 * the poisha, and writes that.
 *
 *   node scripts/seed-bill-book.mjs <csv> <party-code>            plan only
 *   node scripts/seed-bill-book.mjs <csv> <party-code> --apply    write it
 *
 * Nothing is written without --apply, and nothing is written at all unless
 * every row checks out: a book loaded halfway is worse than one not loaded.
 * Re-running it is safe, because it sets each bill to what the CSV says rather
 * than adjusting what is there.
 *
 * DATABASE_URL is read from the environment or from .env.local, and is
 * connected to over the Postgres wire protocol, which Neon speaks as well.
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

// Reading the register --------------------------------------------------------

/** One CSV line into fields, honouring the quotes around a challan list. */
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

/** 'DD-MM-YY' as the book writes it into the 'YYYY-MM-DD' the app stores. */
function isoDate(text) {
  const match = /^(\d{2})-(\d{2})-(\d{2})$/.exec(text.trim());
  if (!match) return null;
  const [, day, month, year] = match;
  return `20${year}-${month}-${day}`;
}

/** A kg figure as whole grams, the way parseQtyKg in src/lib/amount.ts does. */
function grams(text) {
  if (!/^\d+(\.\d{1,3})?$/.test(text)) return null;
  const [whole = '0', frac = ''] = text.split('.');
  return BigInt(whole) * 1000n + BigInt((frac + '000').slice(0, 3));
}

/** A Taka figure as whole poisha. */
function poisha(text) {
  if (!/^\d+(\.\d{1,2})?$/.test(text)) return null;
  const [whole = '0', frac = ''] = text.split('.');
  return BigInt(whole) * 100n + BigInt((frac + '00').slice(0, 2));
}

/** Whole micro-taka as the '0.000000' text NUMERIC(12,6) holds. */
function rateText(micro) {
  return `${micro / 1_000_000n}.${(micro % 1_000_000n).toString().padStart(6, '0')}`;
}

/**
 * Whole poisha as the '0.00' text NUMERIC(14,2) holds. The sign is taken off
 * first: the difference between two book totals is often negative, and dividing
 * a negative by 100 leaves the minus on both halves.
 */
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

/**
 * The six-decimal rate nearest to amount over weight.
 *
 * This is the one place the book's missing rate is invented, and it is invented
 * to a rule: the rate that, put back through the app's own arithmetic, lands on
 * the amount the register states. The caller checks that it does.
 */
function rateFor(weightGrams, amountPoisha) {
  return (amountPoisha * 10_000_000n + weightGrams / 2n) / weightGrams;
}

function readRegister(path) {
  const text = readFileSync(path, 'utf8');
  const lines = text.split(/\r?\n/).filter((line) => line.trim() !== '');
  const headerAt = lines.findIndex((line) =>
    /^date,\s*bill no/i.test(line.trim()),
  );
  if (headerAt < 0) {
    fail(`${path} has no "Date,Bill No,..." heading row.`);
  }

  const rows = [];
  const problems = [];
  for (const [offset, line] of lines.slice(headerAt + 1).entries()) {
    const at = `row ${headerAt + offset + 2}`;
    const [date, billNo, challan, grey, finished, amount] = splitCsvLine(line);

    const billDate = isoDate(date ?? '');
    const greyGrams = grams((grey ?? '').trim());
    const finishedGrams = (finished ?? '').trim()
      ? grams(finished.trim())
      : null;
    const amountPoisha = poisha((amount ?? '').trim());

    if (!billNo?.trim()) problems.push(`${at}: no bill number`);
    if (!billDate) problems.push(`${at}: date "${date}" is not DD-MM-YY`);
    if (greyGrams === null || greyGrams <= 0n) {
      problems.push(`${at}: grey weight "${grey}" is not a weight above zero`);
    }
    if ((finished ?? '').trim() && finishedGrams === null) {
      problems.push(`${at}: finished weight "${finished}" is not a weight`);
    }
    if (amountPoisha === null) problems.push(`${at}: amount "${amount}" is not a figure`);
    if (problems.length > 0) continue;

    const micro = rateFor(greyGrams, amountPoisha);
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
      // The book writes several challans against one bill as "334,35", meaning
      // 334 and 335. It is recorded as written, because that is what the paper
      // says and this app does not renumber anyone's challans.
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

// Writing it in ---------------------------------------------------------------

const [csvArg, partyCode, ...flags] = process.argv.slice(2);
const apply = flags.includes('--apply');

if (!csvArg || !partyCode) {
  fail(
    'Usage: node scripts/seed-bill-book.mjs <csv> <party-code> [--apply]\n' +
      '  node scripts/seed-bill-book.mjs backups/bangla-japan-bill-book.csv CUS-0001',
  );
}

loadEnvLocal();
const url = process.env.DATABASE_URL;
if (!url) fail('DATABASE_URL is not set. Put it in .env.local.');

const csvPath = resolve(process.cwd(), csvArg);
if (!existsSync(csvPath)) fail(`No such file: ${csvPath}`);

const register = readRegister(csvPath);
console.log(`Register: ${register.length} bills from ${csvArg}`);

const pool = new pg.Pool({ connectionString: url });

const { rows: parties } = await pool.query(
  `SELECT id, name FROM party WHERE lower(code) = lower($1)`,
  [partyCode],
);
const party = parties[0];
if (!party) {
  await pool.end();
  fail(`No party has the code ${partyCode}.`);
}
console.log(`Party:    ${party.name} (${partyCode})\n`);

const { rows: existing } = await pool.query(
  `SELECT b.id, b.bill_no, b.total,
     to_char(b.bill_date, 'YYYY-MM-DD') AS bill_date,
     (SELECT count(*) FROM bill_line l WHERE l.bill_id = b.id) AS line_count,
     l.id AS line_id, l.grey_kg, l.finished_kg, l.rate, l.amount, l.challan_no
   FROM bill b LEFT JOIN bill_line l ON l.bill_id = b.id
   WHERE b.party_id = $1 AND b.direction = 'issued'`,
  [party.id],
);

const byNumber = new Map(existing.map((row) => [row.bill_no, row]));
const blocking = [];
for (const row of register) {
  const found = byNumber.get(row.billNo);
  if (!found) {
    blocking.push(`bill ${row.billNo} is in the register but not in the app`);
  } else if (Number(found.line_count) !== 1) {
    blocking.push(
      `bill ${row.billNo} has ${found.line_count} lines, and this loads one line per bill`,
    );
  }
}
const inRegister = new Set(register.map((row) => row.billNo));
for (const row of existing) {
  if (!inRegister.has(row.bill_no)) {
    blocking.push(`bill ${row.bill_no} is in the app but not in the register`);
  }
}
if (blocking.length > 0) {
  await pool.end();
  fail(`Nothing written. The register and the app do not line up:\n  ${blocking.join('\n  ')}`);
}

/** What each bill needs changed, and nothing for the ones already right. */
const work = [];
let totalBefore = 0n;
let totalAfter = 0n;
for (const row of register) {
  const found = byNumber.get(row.billNo);
  totalBefore += poisha(String(found.total));
  totalAfter += row.amountPoisha;

  const changes = [];
  if (found.bill_date !== row.billDate) {
    changes.push(`date ${found.bill_date} to ${row.billDate}`);
  }
  if (String(found.grey_kg) !== kgText(row.greyGrams)) {
    changes.push(`grey ${found.grey_kg} to ${kgText(row.greyGrams)}`);
  }
  const finishedNow = found.finished_kg === null ? null : String(found.finished_kg);
  const finishedNext = row.finishedGrams === null ? null : kgText(row.finishedGrams);
  if (finishedNow !== finishedNext) {
    changes.push(`finished ${finishedNow ?? 'blank'} to ${finishedNext ?? 'blank'}`);
  }
  if ((found.challan_no ?? null) !== row.challanNo) {
    changes.push(`challan ${found.challan_no ?? 'blank'} to ${row.challanNo ?? 'blank'}`);
  }
  if (String(found.rate) !== rateText(row.micro)) {
    changes.push(`rate ${found.rate} to ${rateText(row.micro)}`);
  }
  if (poisha(String(found.amount)) !== row.amountPoisha) {
    changes.push(`amount ${found.amount} to ${takaText(row.amountPoisha)}`);
  }
  if (changes.length > 0) work.push({ row, found, changes });
}

const amountChanges = work.filter((item) =>
  item.changes.some((change) => change.startsWith('amount ')),
);

console.log(`Bills to change: ${work.length} of ${register.length}`);
console.log(`  amounts corrected: ${amountChanges.length}`);
console.log(`  book total now:    ${takaText(totalBefore)}`);
console.log(`  book total after:  ${takaText(totalAfter)}`);
console.log(`  difference:        ${takaText(totalAfter - totalBefore)}\n`);

for (const item of work) {
  console.log(`  bill ${item.row.billNo.padStart(3)}  ${item.changes.join(', ')}`);
}

if (!apply) {
  await pool.end();
  console.log('\nNothing written. Run it again with --apply to write this in.');
  process.exit(0);
}

if (work.length === 0) {
  await pool.end();
  console.log('\nNothing to do: the app already matches the register.');
  process.exit(0);
}

const reason = `Reloaded from the bill book register (${csvArg})`;
let written = 0;

for (const item of work) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // The before snapshot is taken inside the transaction, so what the log
    // records is exactly what this write replaced.
    const { rows: before } = await client.query(
      `SELECT to_jsonb(b) || jsonb_build_object('lines', (
         SELECT COALESCE(jsonb_agg(to_jsonb(l) ORDER BY l.line_no), '[]'::jsonb)
         FROM bill_line l WHERE l.bill_id = b.id)) AS snapshot
       FROM bill b WHERE b.id = $1`,
      [item.found.id],
    );

    await client.query(
      `UPDATE bill_line SET grey_kg = $2::numeric, finished_kg = $3::numeric,
         challan_no = $4, rate = $5::numeric, amount = $6::numeric
       WHERE id = $1`,
      [
        item.found.line_id,
        kgText(item.row.greyGrams),
        item.row.finishedGrams === null ? null : kgText(item.row.finishedGrams),
        item.row.challanNo,
        rateText(item.row.micro),
        takaText(item.row.amountPoisha),
      ],
    );

    // The total is the sum of the lines, read back from the rows just written
    // rather than carried across from the CSV, so the two can never disagree.
    await client.query(
      `UPDATE bill SET bill_date = $2::date, updated_at = now(),
         total = (SELECT COALESCE(SUM(l.amount), 0) FROM bill_line l
                  WHERE l.bill_id = bill.id)
       WHERE id = $1`,
      [item.found.id, item.row.billDate],
    );

    await client.query(
      `INSERT INTO activity_log (action, entity, entity_id, summary, reason,
         before_json, after_json)
       SELECT 'update', 'bill', b.id::text,
         'Reloaded Customer Bill ' || b.bill_no || ' for ' || $2 ||
           ', now Tk ' || b.total::text,
         $3, $4::jsonb,
         to_jsonb(b) || jsonb_build_object('lines', (
           SELECT COALESCE(jsonb_agg(to_jsonb(l) ORDER BY l.line_no), '[]'::jsonb)
           FROM bill_line l WHERE l.bill_id = b.id))
       FROM bill b WHERE b.id = $1`,
      [item.found.id, party.name, reason, JSON.stringify(before[0].snapshot)],
    );

    await client.query('COMMIT');
    written++;
  } catch (error) {
    await client.query('ROLLBACK');
    await client.release();
    await pool.end();
    fail(`\nBill ${item.row.billNo} failed, and was rolled back: ${error.message}`);
  } finally {
    client.release();
  }
}

const { rows: after } = await pool.query(
  `SELECT COALESCE(SUM(total), 0) AS total FROM bill
   WHERE party_id = $1 AND direction = 'issued' AND status = 'posted'`,
  [party.id],
);
await pool.end();

console.log(`\nWritten. ${written} bills reloaded from the register.`);
console.log(`Book total is now ${after[0].total}, against ${takaText(totalAfter)} in the register.`);
