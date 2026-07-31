# LUMA Mini ERP

Interim billing, receipts, and statements.

A small, self-contained web app that replaces the billing spreadsheets while the
full ERP is being built. It does two things, one for each side of the business:

1. **Customer side.** Raise a bill on a customer, record money received against
   it, and print a Statement of Account for any period.
2. **Subcontractor side.** Record a bill received from a subcontractor, record
   money paid to them, and print the same statement in the other direction.

Everything else the ERP will do (double-entry ledger, fabric custody and loss,
rate cards, payroll, P&L) is deliberately **not** here. This app tracks who owes
what, and nothing more.

It is a standalone project in its own repository, with no dependency on the ERP
codebase. When the ERP reaches its billing stage, the data here is exported and
imported there, and this app is switched off.

---

## What it costs

Nothing. It runs on the Vercel free (Hobby) plan and the Neon free plan. Both are
enough for a handful of users and a few thousand bills a year.

---

## Going live in about twenty minutes

### 1. Create the database (Neon)

1. Sign up at neon.tech and create a project. Pick the region closest to Dhaka
   (Singapore is usually the nearest free one).
2. Copy the **pooled** connection string. It looks like
   `postgresql://user:password@ep-something-pooler.region.aws.neon.tech/neondb?sslmode=require`.

### 2. Create the tables

From this folder, with the connection string in hand:

```bash
cp .env.example .env.local     # then paste your DATABASE_URL into it
pnpm install
pnpm db:setup
```

`db:setup` applies `db/schema.sql`. It is safe to run again later.

### 3. Deploy (Vercel)

1. In Vercel, **Add New Project** and import this repository
   (`iammominul/luma-mini-erp`).
2. Framework preset: **Next.js**. Root Directory stays at the repository root,
   and the build settings stay on their defaults.
3. Add the environment variables below under **Settings > Environment
   Variables**, for Production and Preview.
4. Deploy. The first build takes about two minutes.

### 4. Environment variables

| Variable          | What it is                                                                  |
| ----------------- | --------------------------------------------------------------------------- |
| `DATABASE_URL`    | The Neon pooled connection string.                                          |
| `APP_PASSWORD`    | The one shared password that opens the app. Use 12 characters or more.      |
| `SESSION_SECRET`  | Random string that signs the session cookie. See below.                     |
| `COMPANY_NAME`    | Used on the letterhead when no logo file is present, and in the top bar.    |
| `COMPANY_ADDRESS` | Printed under the logo on every document.                                   |
| `COMPANY_PHONE`   | Printed on the contact line. More than one number is fine, comma separated. |
| `COMPANY_EMAIL`   | Printed on the contact line.                                                |
| `COMPANY_WEB`     | Printed on the contact line. Leave unset to omit it.                        |

The logo on the documents is `assets/letterhead-logo.svg`, committed with the
app rather than configured. Replace that file to put another company on every
document, or point `PDF_LOGO_PATH` at a different one; with no file at all the
letterhead sets `COMPANY_NAME` as type instead. The file has three constraints
written at the top of it, because the PDF renderer applies no stylesheet and has
no access to a design font.

Generate a session secret with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Changing `SESSION_SECRET` signs everyone out, which is the fastest way to lock
the app if the password ever leaks.

### 5. First run

Open the deployment URL, sign in with `APP_PASSWORD`, then:

1. **Parties**: add each customer and each subcontractor, with the balance they
   were carrying on the day you switch over as the **Opening Balance**. Get these
   right; every statement is built on them.
2. Start entering bills and receipts as they happen.

### 6. Moving a book that already exists

Skip this if you are starting from nothing. If bills were already entered against
a local database, copy the data across rather than typing it again. Dump it in
this table order, which is the order the foreign keys allow:

```bash
for t in party counter bill bill_line payment activity_log; do
  pg_dump "$LOCAL_URL" --data-only --no-owner --no-privileges --column-inserts -t "public.$t"
done > book.sql
```

Then load it into the Neon database, **after** `pnpm db:setup` has run there:

```bash
psql "$DATABASE_URL" -c "delete from counter;"
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f book.sql
```

The `delete` is not optional. `db/schema.sql` seeds the counters at zero, and
those rows have to give way to the ones carrying the real position. Load without
it and the next customer bill is issued as number one again, against a series
where that number is already taken.

Afterwards, check the closing balance on a statement against the same statement
from the old database before anyone bills against it. `book.sql` holds real
figures, so delete it once the numbers agree.

---

## How it is put together

| Piece     | Choice                                                                |
| --------- | --------------------------------------------------------------------- |
| Framework | Next.js 16 (App Router), React 19, TypeScript strict                  |
| Database  | Postgres (Neon in production), plain SQL, no ORM                      |
| Money     | Exact integer poisha (`Money`), `NUMERIC(14,2)` in the database       |
| Styling   | Tailwind v4, the same navy office look as the ERP prototype           |
| Auth      | One shared password, signed session cookie, checked in `src/proxy.ts` |
| Tests     | Vitest: unit, plus integration against a real Postgres                |

Points worth knowing:

- **Documents download as real A4 PDFs**, rendered on the server, not as the
  browser's print of a screen. The Customer Bill, the Bill Received and the
  Statement of Account all come off one letterhead system, so they are the same
  piece of paper with different bodies.
- **A bill keeps its hand-written number.** Bills are still written by hand from
  the bill book and sent out on paper, so the book number and the book it came
  from are recorded and are what the customer sees on a statement and on the PDF.
  The system issues its own gapless `CB-26-0001` series alongside, as the internal
  reference an auditor can follow.
- **The statement reads as a ledger:** Date, Reference, Particulars, Debit,
  Credit and a running Balance carrying `Dr` or `Cr`. A customer bill is a debit
  and money received is a credit; a subcontractor's bill is a credit and money
  paid to them is a debit. The two sides are mirror images of one calculation.
- **Balances are never stored.** Every figure on screen is computed from the
  bills and receipts on read, so nothing can drift out of step.
- **Money never becomes a JS number.** It is read as text, held as integer
  poisha, and written back as text. `src/lib/money.ts` and `src/lib/format.ts`
  are copies of the ERP's tested money engine and formatters.
- **Dates are text.** `'YYYY-MM-DD'` from end to end, so a bill cannot shift a
  day between the server's timezone and Dhaka.
- **Customer bill numbers are gapless.** `CB-26-0001`, `CB-26-0002`, and so on,
  issued from a counter bumped inside the same transaction as the bill.
  Subcontractor bills keep the number written on their own paper bill.
- **Every write is logged.** `activity_log` records what changed, when, the
  before and after, and the reason given for an edit or removal. Nothing in the
  app updates or deletes a row in it.

## Running it locally

```bash
pnpm install
pnpm dev            # http://localhost:5174
```

The quickest local setup is to point `.env.local` at the Neon database and run
`pnpm dev`. Nothing else is needed.

`DATABASE_URL` can also point at a Postgres on your own machine, and the app
switches drivers on its own when the host is `localhost`. With the LUMA ERP
repo's Docker Postgres running (`pnpm db:up` in that repo):

```bash
docker exec luma_db createdb -U luma interim_dev
# DATABASE_URL="postgresql://luma:luma@localhost:5432/interim_dev" in .env.local
pnpm db:setup && pnpm dev
```

Use a separate local database for testing, never the live Neon one.

## Tests

```bash
pnpm test           # unit tests only
pnpm typecheck
```

The integration tests run every SQL statement and every server action against a
real Postgres. They are skipped unless a database is named:

```bash
INTERIM_TEST_DATABASE_URL="postgresql://luma:luma@localhost:5432/luma_dev" pnpm test
```

They create a throwaway schema and drop it afterwards, so an existing database is
left alone.

## Backups

Neon keeps its own point-in-time backups on the free plan. On top of that, take
your own copy: **Backup** in the top bar downloads the whole book as JSON, plus
CSV files for Excel. Do it weekly and keep the file off the server.

Every amount in those files is text, not a number, so nothing is rounded on the
way out.

## Handing over to the ERP

When the full ERP is ready, the JSON backup is the migration input: parties,
bills with their lines, receipts and payments, and the activity log, all with
exact amounts. Nobody re-types a year of bills. Once the cutover is done, this
app is switched off rather than kept running in parallel.
