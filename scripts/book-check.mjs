/**
 * The book check: proof that a schema change left every figure already in the
 * book where it was.
 *
 * db/schema.sql may add a table, a column, an index or a counter. It may not
 * move a figure already recorded: a bill total, a receipt, a party's balance, a
 * payslip, a document number. The Neon restore point in migrate.mjs makes such a
 * mistake survivable; this makes it visible, first on the rehearsal against a
 * pulled copy of production (`pnpm db:pull`, then `pnpm db:setup`) and then on
 * the deploy itself.
 *
 * Every table that holds money or a document number is read before the schema
 * is applied and again after: a row count, a money total, and an md5 over the
 * columns that make up the book. Each party's balance is read as well, because
 * a figure somebody recognizes is a better report than a hash. Any figure that
 * differs, or a table that can no longer be read the way it was, is named.
 *
 * What is not compared, on purpose:
 *
 * - A table or column that did not exist before. Adding is what a migration is
 *   for. The columns read after are exactly the ones that existed before.
 * - A counter that did not exist before, for the same reason.
 * - A counter that moved forward. Several migrations catch a counter up to the
 *   highest number already issued (the GREATEST updates in db/schema.sql), so
 *   the next document cannot reissue one, and that is the schema protecting the
 *   series. A counter that moved back is held: the next document would take a
 *   number already printed.
 *
 * The full ERP modules this app now runs are held to this
 * (docs/plans/2026-10-29-full-erp-modules.md). They live in tables of their own
 * and read the book; a release that changes a figure in it fails here.
 *
 * When a migration has to change existing rows and means to (the fabric_type
 * fold of 2026-08-15 was one), name the figures it is allowed to move in
 * BOOK_CHECK_ALLOW, comma separated, for that one release, and write what moved
 * and why in the pull request. Everything not named is still held.
 */

/**
 * The book: each table, the columns that make it up, and the money column to
 * total. A column listed here that a database does not have yet is skipped on
 * both reads, which is what lets this run against production's older shape.
 */
export const BOOK = [
  { table: 'party', columns: ['id', 'code', 'opening_balance', 'opening_as_of'], money: 'opening_balance' },
  { table: 'bill', columns: ['id', 'party_id', 'direction', 'status', 'doc_no', 'bill_no', 'bill_date', 'total'], money: 'total' },
  { table: 'bill_line', columns: ['id', 'bill_id', 'line_no', 'grey_kg', 'rate', 'amount'], money: 'amount' },
  { table: 'payment', columns: ['id', 'party_id', 'direction', 'doc_no', 'paid_on', 'amount', 'mode'], money: 'amount' },
  { table: 'expense', columns: ['id', 'doc_no', 'spent_on', 'category', 'amount', 'mode'], money: 'amount' },
  { table: 'advance', columns: ['id', 'doc_no', 'employee_id', 'paid_on', 'amount'], money: 'amount' },
  { table: 'payroll_run', columns: ['id', 'doc_no', 'period', 'status'], money: null },
  { table: 'payroll_line', columns: ['id', 'run_id', 'employee_id', 'gross', 'net_paid'], money: 'net_paid' },
  { table: 'fund_movement', columns: ['id', 'doc_no', 'moved_on', 'category', 'loan_id', 'amount', 'interest_amount'], money: 'amount' },
];

/** Identifiers come from BOOK and information_schema, never from input. */
const ident = (name) => `"${name.replace(/"/g, '""')}"`;

async function existingColumns(query) {
  const rows = await query(
    `SELECT table_name, column_name FROM information_schema.columns
     WHERE table_schema = current_schema()`,
  );
  const tables = new Map();
  for (const { table_name, column_name } of rows) {
    if (!tables.has(table_name)) tables.set(table_name, new Set());
    tables.get(table_name).add(column_name);
  }
  return tables;
}

/**
 * Which columns of the book this database holds now. Taken once, before the
 * schema is applied, and handed to the second read so both read the same thing.
 */
export async function readShape(query) {
  const present = await existingColumns(query);
  const shape = {};
  for (const { table, columns } of BOOK) {
    const have = present.get(table);
    if (!have || !have.has('id')) continue;
    shape[table] = columns.filter((column) => have.has(column));
  }
  return shape;
}

function tableSql(table, columns, money) {
  // A null is written as \N so it cannot collide with an empty string.
  const row = columns
    .map((column) => `coalesce(${ident(column)}::text, '\\N')`)
    .join(` || '|' || `);
  const total = money && columns.includes(money)
    ? `coalesce(sum(${ident(money)}), 0)::text`
    : `'0'`;
  return `SELECT count(*)::text AS n, ${total} AS total,
            coalesce(md5(string_agg(${row}, E'\\n' ORDER BY id)), '') AS hash
          FROM ${ident(table)}`;
}

/**
 * A party's balance, in the book's one sign convention: positive is owed to
 * us. Opening, plus bills raised, less bills received, less money in, plus
 * money out. A draft bill is not in the book until it is posted.
 */
function balanceSql(shape) {
  const posted = shape.bill.includes('status') ? `AND b.status = 'posted'` : '';
  const label = shape.party.includes('code') ? `coalesce(p.code, p.id::text)` : `p.id::text`;
  return `SELECT ${label} AS party,
            (p.opening_balance
             + coalesce((SELECT sum(CASE b.direction WHEN 'issued' THEN b.total ELSE -b.total END)
                         FROM bill b WHERE b.party_id = p.id ${posted}), 0)
             - coalesce((SELECT sum(CASE y.direction WHEN 'in' THEN y.amount ELSE -y.amount END)
                         FROM payment y WHERE y.party_id = p.id), 0))::text AS balance
          FROM party p ORDER BY 1`;
}

/**
 * Read the book into a flat map of named figures. Pass the shape read before
 * the schema was applied; omit it to read the shape now.
 */
export async function fingerprintBook(query, shape) {
  const columnsOf = shape ?? (await readShape(query));
  const figures = {};

  for (const { table, money } of BOOK) {
    const columns = columnsOf[table];
    if (!columns) continue;
    try {
      const [row] = await query(tableSql(table, columns, money));
      figures[`${table} rows`] = row.n;
      figures[`${table} total`] = row.total;
      figures[`${table} hash`] = row.hash;
    } catch (error) {
      // A table that read before and cannot now is the loudest change there is.
      figures[`${table} hash`] = `unreadable: ${error.message}`;
    }
  }

  const balanceInputs = ['party', 'bill', 'payment'];
  if (balanceInputs.every((table) => columnsOf[table])
      && columnsOf.party.includes('opening_balance')
      && columnsOf.bill.includes('total')
      && columnsOf.payment.includes('amount')) {
    try {
      for (const { party, balance } of await query(balanceSql(columnsOf))) {
        figures[`balance ${party}`] = balance;
      }
    } catch (error) {
      figures['balances'] = `unreadable: ${error.message}`;
    }
  }

  try {
    for (const { name, value } of await query(
      `SELECT name, value::text AS value FROM counter ORDER BY name`,
    )) {
      figures[`counter ${name}`] = value;
    }
  } catch {
    // No counter table yet means an empty database, where there is nothing to hold.
  }

  return { shape: columnsOf, figures };
}

/**
 * The figures that moved. Only names read before are compared: anything that
 * first appears after is an addition. `allow` lists figures a release is
 * permitted to move; a table name allows all three of its figures.
 */
export function compareBooks(before, after, allow = []) {
  const allowed = (name) =>
    allow.some((item) => name === item || name.startsWith(`${item} `));
  const caughtUp = (name, was, now) =>
    name.startsWith('counter ') && now !== undefined && BigInt(now) > BigInt(was);
  const changes = [];
  for (const [name, was] of Object.entries(before.figures)) {
    const now = after.figures[name];
    if (now === was || allowed(name) || caughtUp(name, was, now)) continue;
    changes.push({ name, before: was, after: now ?? 'missing' });
  }
  return changes;
}

/** The message a person reads when the check fails. */
export function describeChanges(changes) {
  const lines = changes.map(
    ({ name, before, after }) => `  ${name}: ${before} -> ${after}`,
  );
  return [
    `The schema change moved ${changes.length} figure(s) already in the book:`,
    ...lines,
    'A migration may add to the book but not change it. If this change is',
    'intended, name the figures in BOOK_CHECK_ALLOW for this release and say',
    'in the pull request what moved and why.',
  ].join('\n');
}

/** BOOK_CHECK_ALLOW, split. */
export function allowedFromEnv(value = process.env.BOOK_CHECK_ALLOW) {
  return (value ?? '').split(',').map((item) => item.trim()).filter(Boolean);
}
