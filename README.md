# LUMA Mini ERP

Interim billing, receipts, and statements.

A small, self-contained web app that replaces the billing spreadsheets while the
full ERP is being built. It does two things, one for each side of the business:

1. **Customer side.** Raise a bill on a customer, record money received against
   it, and print a Statement of Account for any period.
2. **Subcontractor side.** Record a bill received from a subcontractor, record
   money paid to them, and print the same statement in the other direction.

Everything else the ERP will do (double-entry ledger, fabric custody and loss,
rate cards, costed orders) is deliberately **not** here.

Two things have since been added on top of that, each for a stated reason.
**Expenses and payroll** are recorded here because the money going out could not
wait for the ERP, on a cash basis only. And there is a **profit statement**:
LUMA subcontracts the knitting and dyeing it bills for, so a subcontractor's
bill is its cost of sales, and what is left after that and the overhead is a
real result computed from figures already in the book.

It reads in three tiers, because the order the costs come off in is what makes
them mean anything:

```text
Billed to Customers
  less Direct Cost      knitting, dyeing, freight, lab testing
= Gross Margin          how well the work was bought and sold
  less Selling Cost     commission paid to win the order
= Contribution          what an order leaves toward the overhead
  less Operating Cost   salary, rent, staff travel, office
= Net Result
```

Which tier a cost falls in comes from the category it was recorded under, so
there is one choice at entry. **Order Costing** groups the same figures by the
order reference already written on each bill line, which is what answers whether
one order made money.

It is not accounting. Bills count when raised, expenses and salary and
reimbursed claims when paid, and there is no opening or closing stock and no
trial balance. Overhead is never split across orders and margin per customer is
not shown, because nothing links a customer bill to the subcontract bill behind
it. Both need order linkage and a costing basis, and they stay in the ERP.

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

| Variable            | What it is                                                                    |
| ------------------- | ----------------------------------------------------------------------------- |
| `DATABASE_URL`    | The Neon pooled connection string.                                            |
| `AUTH_SECRET`     | Random string Better Auth signs sessions with. See below.                     |
| `AUTH_URL`        | Optional. Where the app is served. Unset, the origin is read off the request. |
| `COMPANY_NAME`    | Used on the letterhead when no logo file is present, and in the top bar.      |
| `COMPANY_ADDRESS` | Printed under the logo on every document.                                     |
| `COMPANY_PHONE`   | Printed on the contact line. More than one number is fine, comma separated.   |
| `COMPANY_EMAIL`   | Printed on the contact line.                                                  |
| `COMPANY_WEB`     | Printed on the contact line. Leave unset to omit it.                          |

The logo on the documents is `assets/letterhead-logo.svg`, committed with the
app rather than configured. Replace that file to put another company on every
document, or point `PDF_LOGO_PATH` at a different one; with no file at all the
letterhead sets `COMPANY_NAME` as type instead. The file has three constraints
written at the top of it, because the PDF renderer applies no stylesheet and has
no access to a design font.

Generate an auth secret with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Changing `AUTH_SECRET` signs everyone out, which is the fastest way to lock the
app if an account is compromised. To lock one person out instead, disable their
account on the Users screen: that drops their sessions at once.

### 5. Users

Everybody signs in with their own email and password. There is no shared
password and no sign-up: an Owner creates every account.

Create the first Owner from the server, once:

```bash
node scripts/create-user.mjs --email you@example.com --name "Your Name" \
  --role owner --password "at least twelve characters"
```

Leave `--password` out and one is generated and printed. The same command resets
the password of an account that already exists, which is the way back in if
every Owner is locked out.

After that, add people under **Administration > Users**. Three roles:

| Role     | Can                                                                                         |
| -------- | ------------------------------------------------------------------------------------------- |
| Owner    | Everything, including approving a payroll run and managing users.                           |
| Accounts | Bills, receipts, expenses, and payroll entry. Cannot approve a payroll run or manage users. |
| Viewer   | Read and print only.                                                                        |

Approving a payroll run is deliberately kept out of Accounts' hands: the person
who keys the figures should not also be the person who signs them off. Every
role is checked on the server for each action, not only hidden from the menu.

An account is disabled rather than deleted, because its name has to stay on the
activity log rows and payroll approvals it made. Disabling drops every session
it holds and refuses it a new one, so it locks somebody out rather than only
signing them out. The last active Owner cannot be demoted or disabled, so nobody
can lock the company out of user management.

**Everyone manages their own account** under **My Account**, reached by clicking
your name at the foot of the menu. Any role can change its own name, its own
sign-in email, and its own password, and can sign out every other device it is
open in. Changing your own password asks for the current one first.

**An Owner** manages everybody else under **Users**. The list is read only and
shows when each account last signed in, so a dormant one is visible; clicking a
name opens **Manage User**, which holds everything about that account in one
place: name and email, role, password, and whether it is enabled. Each of those
is its own form with its own button, so nothing is changed by accident and a
password manager cannot fill a password into a name change.

Two rules worth knowing. Changing an email does not sign anybody out: the
password is stored against the account, not against the address, so it keeps
working. Changing a password signs out every *other* device but not the one
doing it.

There is deliberately no two-factor authentication, no password reset by email,
and no forced password rotation. This is an internal book for a handful of
people, and each of those is real surface for little gain here. It follows that
an Owner who sets somebody's password knows it until that person changes it on
My Account.

### 6. First run

Open the deployment URL, sign in as the Owner you created, then:

1. **Parties**: add each customer and each subcontractor, with the balance they
   were carrying on the day you switch over as the **Opening Balance**. Get these
   right; every statement is built on them.
2. Start entering bills and receipts as they happen.

### 7. Moving a book that already exists

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

Then put the search path back:

```bash
psql "$DATABASE_URL" -c 'ALTER DATABASE "your-db-name" SET search_path = "$user", public;'
```

A pg_dump file begins by setting `search_path` to nothing, so that its own
qualified names are the only ones that resolve. Against a pooled Neon endpoint
that setting outlives the load: pgbouncer hands the same backend to whoever
connects next, and they inherit the empty path. Every query in this app names
tables unqualified, so the symptom is `relation "bill" does not exist` on a
database whose tables are plainly there. The `ALTER` fixes it for new connections;
any backend already carrying the empty value drops out as the pooler recycles it.

Afterwards, check the closing balance on a statement against the same statement
from the old database before anyone bills against it. `book.sql` holds real
figures, so delete it once the numbers agree.

---

## Shipping a change

```text
branch  ->  pull request  ->  preview on its own Neon branch  ->  merge  ->  main  ->  production
```

Never `vercel --prod` from your machine. It uploads whatever is in the folder,
including files you have not committed, and labels the deployment with a commit
it does not match, so the live site and `main` quietly stop agreeing.

1. **Branch and work.** `pnpm dev` against the local Docker Postgres.
2. **Open a pull request.** It gets a preview URL backed by its own Neon branch,
   copied from production and deleted when the pull request closes. It is safe
   to add and delete records there: none of it is the real book.
3. **Wait for CI.** Typecheck, the full test suite against Postgres 18, and the
   build.
4. **Merge.** The production deploy runs `scripts/migrate.mjs` first, which
   takes a `backup/<timestamp>` Neon branch and applies `db/schema.sql`, then
   builds. A failed migration fails the build and production keeps serving the
   previous release.
5. **Check it.** Open the site, sign in, open a bill, download its PDF.

### Before you write a migration

Read rule 15 in [CLAUDE.md](CLAUDE.md). The short version: Vercel serves the old
deployment until the new one is built, so anything you remove is removed from
under code that is still running. **Add in one release, drop in a later one.**

### When a release goes wrong

Every production deploy leaves a Neon branch named `backup/<timestamp>`, taken
before the schema was touched.

1. In the Vercel dashboard, promote the previous deployment. That puts the old
   code back in seconds.
2. If the data needs to go back too, open the Neon console, find the `backup/`
   branch from that release, and restore or branch from it.
3. Only then work out what went wrong.

Roll back first, diagnose second. A restore point that nobody uses because they
were busy debugging is not a restore point.

---

## How it is put together

| Piece     | Choice                                                                                                           |
| --------- | ---------------------------------------------------------------------------------------------------------------- |
| Framework | Next.js 16 (App Router), React 19, TypeScript strict                                                             |
| Database  | Postgres (Neon in production), plain SQL, no ORM                                                                 |
| Money     | Exact integer poisha (`Money`), `NUMERIC(14,2)` in the database                                              |
| Styling   | Tailwind v4, the same navy office look as the ERP prototype                                                      |
| Charts    | Recharts on the dashboard, four validated hues, every chart has a table view                                     |
| Reports   | Profit statement, expense register and order costing over any date range, statement downloadable as A4           |
| Auth      | Better Auth, named accounts with Owner/Accounts/Viewer roles, the same library and session model as the full ERP |
| Tests     | Vitest: unit, plus integration against a real Postgres                                                           |

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
switches drivers on its own when the host is `localhost`. This repository ships
its own Docker Postgres, on port 5434 so it cannot collide with the full ERP on
5433 or a native Postgres on 5432:

```bash
pnpm db:up
# DATABASE_URL="postgresql://luma:luma@localhost:5434/interim_dev" in .env.local
pnpm db:setup && pnpm dev
```

`pnpm db:down` stops it. The container, the volume and the network belong to
this repository alone: nothing is shared with the full ERP, so either project
can be started, stopped or archived without touching the other.

Use a separate local database for testing, never the live Neon one.

## Tests

```bash
pnpm test           # unit tests only
pnpm typecheck
```

The integration tests run every SQL statement and every server action against a
real Postgres. They are skipped unless a database is named:

```bash
INTERIM_TEST_DATABASE_URL="postgresql://luma:luma@localhost:5434/interim_test" pnpm test
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
