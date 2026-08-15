# CLAUDE.md - LUMA Mini ERP (Interim Billing)

**Read this before writing any code here.** It is the short contract for this
repository. The full ERP being built in parallel (`luma-erp`) has its own, longer
one; this app shares its conventions but none of its code.

---

## 1. What this is

A stopgap that replaces the billing spreadsheets of **LUMA**, a Bangladesh knit
dyeing trader, until the full ERP reaches its billing stage. It does two things:

1. **Customer side.** Bill a customer, record money received, print a statement.
2. **Subcontractor side.** Record a bill received, record money paid, print the
   same statement in the other direction.

It answers "who owes what", nothing else. It is temporary by design: when the ERP
takes over, the JSON export is imported there and this repository is archived.

**Scale:** about 15 to 20 customers, 5 to 10 subcontractors, a few internal
users. Do not build for more.

---

## 2. Rules that must not be broken

1. **Money is exact.** Integer poisha in a `bigint` via the `Money` class,
   `NUMERIC(14,2)` in Postgres, text at every boundary. **Never a JS number.**
   A money value read from the database goes straight into `Money`.
   A **rate** is not money and carries six decimals, `NUMERIC(12,6)`, held as
   whole micro-taka in `amount.ts`. The bill book records a weight and an
   amount and often no rate at all, so the rate has to be worked back out of
   them, and at two decimals it stops reproducing the amount the party was
   shown: bill 78 is 5141 kg at 643,798.00, which needs 125.228166, where the
   125.23 first keyed in comes to 643,807.43. Do not narrow it back. Print a
   rate through `formatRate`, never raw, or an ordinary 30.00 reads as
   "30.000000".
   `scripts/seed-bill-book.mjs` loads a register CSV against this rule and
   refuses to write unless every row lands on its stated amount exactly.
   **A chart is the one carve-out, and it is a narrow one.** A bar has to be
   drawn from a number, so `src/lib/dashboard.ts` builds each point as
   `{ label, value, display }`: `display` is `formatTaka(money)` and is the only
   thing a reader is ever given as a figure, in the tooltip, on the bar and in
   the table view, while `value` is a plain number used for the bar's length.
   No total, difference or share is ever computed from `value`; every one of
   those is worked out as `Money` on the server and arrives formatted. The sole
   exception is the y-axis gridline, which is deliberately a rounded scale in
   lakh ("12L") and is labeled as such, because a full 6,43,798.00 on every
   gridline cannot be read. A scale marker is not a figure. A poisha lost in a
   bar's geometry is a pixel; a poisha lost in a figure is a wrong number on a
   screen somebody bills from.
2. **Balances are computed on read**, never stored. Opening balance plus bills
   less settlements, every time. Nothing caches a total.
3. **A bill total is computed on the server** from its lines. Never trust an
   amount posted by the browser.
4. **Dates are `'YYYY-MM-DD'` text end to end.** Select date columns with
   `to_char(...)`. A JS `Date` from the driver is built at the server's midnight
   and shifts the day against Asia/Dhaka.
5. **Every write is one transaction**, and it includes its `activity_log` row.
   Edits and removals require a stated reason. The log is append only: nothing
   updates or deletes a row in it.
6. **Validate at the boundary.** Zod in `src/lib/schemas.ts` for every input.
7. **A bill carries two numbers, and both are load-bearing.** LUMA still writes
   every bill by hand and sends that paper out, so `bill.bill_no` is the
   hand-written number: it is what the party recognizes, what a statement quotes,
   and what the PDF prints as the document number. Alongside it, `bill.doc_no` is
   the system's own **gapless** series from the `counter` row bumped inside the
   bill's own transaction. Do not switch that to a sequence, which leaves holes
   when an insert fails, and never re-issue a `doc_no` on an edit. A
   subcontractor bill has no `doc_no`: their paper number is its identity.
   Uniqueness differs by side. A customer number is checked against every
   customer bill, full stop; a subcontractor number is scoped to that
   subcontractor.
   **There was a third number, `book_no`, and it is gone** (2026-08-15). LUMA
   ran several bill books at once, so a customer number used to be unique only
   within its book. It turned out to carry nothing: of 131 customer bills exactly
   one had a book recorded, there was one distinct book, and no number was used
   twice. It was never printed on the document either. The column is dropped and
   the hand-written number now stands on its own, with a unique index on
   `bill_no` where `direction = 'issued'` holding that.
   **The entry screen shows the system number before it is issued**, as a
   read-only field labeled as issued on save. It is a preview read off the
   counter, not a reservation: two clerks entering at once see the same serial
   and get different ones. Reserving a number while somebody types is what puts
   holes in the series when they walk away.
8. **A bill line has one free-text description, and one field per thing**
   (2026-08-15). The columns are Description, Order No, Challan No, LOT No,
   Color, F/Weight, G/Weight, Unit Rate, Amount, in that order on the entry
   screen, the record view and the PDF, so the grey weight sits beside the rate
   beside the amount and the arithmetic reads left to right.
   There used to be a `fabric_type` column beside the description, and the
   register had been keyed into the pair the wrong way round: the description
   held the lot ("Lot - 5903") and the fabric type held what the line actually
   was ("(2x1) LY (65+35%) O/F"). A guarded migration in `db/schema.sql` moved
   each value to the field that means it and dropped the column. If you are
   reading an export taken before that date, expect the swap.
   A bill header likewise has **one** free-text field, `notes`, called Remarks on
   the screen and on the printed bill. The old `reference` column was folded into
   it and dropped; it held "anything else worth recording", which is what notes
   already held, and it never printed. `narration` survives and is not a note: it
   overrides what the ledger prints in Particulars, so it is a control and lives
   behind More Options rather than in the way of every entry.
   **Approving a bill belongs to the full ERP, not here** (2026-08-15). An Owner
   sign-off on a posted bill was built and then taken out: this app is a stopgap
   for who owes what, a workflow state on top of that is the ERP's job, and
   section 7 is the general form of the same argument. Posting is still the
   moment a bill becomes real.
9. **No secrets in the repository.** `.env.local` is ignored; keep
   `.env.example` current.
10. **Nothing here is LUMA specific.** Company name, address and contact all come
    from environment variables and print on the letterhead.
11. **A URL names a record the way a person does.** A row's UUID is what foreign
    keys point at; it is not an address. What goes in the URL is the business
    key, because a URL gets read aloud, pasted into an email, and recognized on
    a screen: `/parties/CUS-0001`, `/customers/bills/CB-26-0113`. A bill received
    keeps its id, because the subcontractor's paper number is unique only within
    that subcontractor and so cannot name a bill on its own.
    The UUID still resolves, always, so nothing already sent out breaks. It
    answers with a permanent redirect to the business key rather than serving the
    page, because one record has one address.
    Collections are plural and consistent: `/parties`, `/customers/bills`,
    `/subcontractors/settlements`. The lens in a URL is plural; the party role it
    looks at stays singular. Old singular URLs redirect in `src/proxy.ts`.
12. **A form never loses what was typed.** Every field on a form that posts to a
    server action is controlled from `useKeptValues`, never `defaultValue`. A
    save that comes back with an error re-renders the page on the server, and
    the server does not know what anyone typed: an uncontrolled field takes the
    blanks it sends and the form empties itself, which is what made a repeated
    bill number cost somebody the whole bill. React also resets the form once an
    action returns, and puts a controlled text field back but not a `select` or
    a checkbox, so those two are restored by hand through the hook's `register`.
13. **A wrong address is a 404, never a 500.** Every id reaches Postgres through
    a `::uuid` cast, and that cast throws on anything the wrong shape. Guard with
    `isUuid` from `src/lib/ids.ts` before the query, and let the page call
    `notFound()`. A mistyped bill number is an ordinary event, not a fault.
14. **Authorization is the server's, and the UI never decides it** (2026-08-14).
    Named accounts run on Better Auth, the same library and session model as the
    full ERP, so an account exports across with the book. Three rules hold:
    - **Every server action checks a permission for itself**, through
      `actingUser` in `src/lib/session.ts`. A server action is a public
      endpoint. Hiding a button is a courtesy so nobody clicks into a refusal;
      it is never the control, and an action that trusts the screen it was
      called from has no check at all.
    - **`src/proxy.ts` proves nothing.** It runs on the Edge runtime with no
      connection pool, so it only looks at whether a session cookie is present
      and correctly signed, and it exists to send a signed-out visitor to the
      login screen. Whether the session is live, and whether the account has
      since been disabled or had its role changed, is settled in `session.ts`,
      which reads the database. Never add a permission check to the proxy: it
      would be one that cannot see the current role.
    - **`permissions.ts` is a copy of the ERP's**, like `money.ts` and
      `format.ts`. It is pure, it has no imports, and the two apps have to agree
      on what a role means. Fix a bug in both. The ERP's fourth role, `store`,
      is deliberately absent: it exists there for fabric and challan entry with
      no money figures, and every screen here is money.
    An account is disabled, never deleted, because its name has to stay on the
    activity log rows and payroll approvals it made. Disabling drops its
    sessions and refuses it new ones through a `databaseHooks.session.create`
    guard, because Better Auth knows nothing about the status column and would
    otherwise still accept the password. The last active Owner cannot be
    demoted or disabled.
    **Every role manages its own account** at `/account`: name, email, password,
    and signing out other devices. Without it an Accounts or Viewer user cannot
    change their own password at all and has to ask an Owner, who then knows a
    password that opens their account. Changing an email keeps every session,
    because the credential is keyed to the user id and not the address, and
    changing a password drops every session but the one doing it. There is
    deliberately no two-factor, no reset by email and no forced rotation
    (2026-08-14): a handful of internal users does not repay that surface.

---

## 3. Where code goes

```text
src/lib/          The engine. money.ts, format.ts, amount.ts, statement.ts,
                  payroll.ts, costing.ts, permissions.ts and dashboard.ts are
                  pure: no database, no framework, fully tested.
                  queries.ts reads, mutations.ts writes, and nothing else does.
                  auth.ts builds the Better Auth instance and is Node only, so
                  it must never be imported from proxy.ts. session.ts is where a
                  page or an action asks who is signed in and what they may do.
                  profit.ts assembles the statement from a query and is the one
                  place the dashboard, the report and the PDF all come through,
                  so the three cannot disagree.
src/lib/pdf/      Document assembly. document.ts is the letterhead system every
                  document is built on; one builder per document; render.ts is
                  the only place bytes are produced. No arithmetic here: a
                  builder receives figures already computed and formatted.
src/app/          Pages (server components) and server actions. Thin: read,
                  render, or validate and call a mutation. A `pdf/route.ts`
                  streams a document as a download.
src/components/   Presentation. Client components only where a form needs state.
src/components/charts/  The dashboard charts, over Recharts. Client components
                  that receive figures already computed and formatted, never a
                  Money and never a query.
assets/           Bundled at runtime, not imported: the IBM Plex Sans faces
                  pdfmake needs and the letterhead logo. Both are named in
                  next.config.ts outputFileTracingIncludes, or they are missing
                  on Vercel and every PDF route fails there while working locally.
db/schema.sql     The whole schema, idempotent: current shape first, then guarded
                  migrations that bring an existing database up to it.
scripts/          setup-db.mjs applies the schema.
```

`money.ts` and `format.ts` are **copies** of the ERP's tested money engine and
formatters. Do not "improve" them here. If one has a bug, fix it in both.

---

## 4. Content and UI style (the app must never look AI built)

- **Punctuation:** the em dash and en dash are banned everywhere, including
  commit messages and comments. Use a comma, colon, parentheses, hyphen, or a new
  sentence. Hyphens are fine in compounds and ranges.
- **Vocabulary:** BD trade terms. Challan, Gate Pass, Money Receipt, Voucher,
  Party, Bill. Marketing and AI-tell words are banned: seamless, leverage, delve, <!-- style-ok -->
  robust, streamline, empower, effortless, and the rest of that family. <!-- style-ok -->
  `.claude/hooks/style-check.mjs` enforces this on every file written in a
  session. Run it over the repository with
  `node .claude/hooks/style-check.mjs src/**/*.ts*`.
- **Tone:** plain declarative business English, the way a bank statement reads.
  An error states the fact and the required action ("Bill RD-889 is already
  recorded against Rongdhonu Dyeing"). No emoji, no exclamation marks.
- **Case:** Title Case for menus, buttons and field labels. Sentence case for
  messages and help text.
- **US English everywhere**, screens, documents, code and comments: Authorized,
  Color, Organization, Recognized. Trade terms keep their own spelling (Challan,
  Gate Pass, Money Receipt, Greige). The full ERP has the same rule; a document
  that mixes the two looks careless to the party reading it.
- **Look:** classic office software. Brand navy `#142b40`, IBM Plex Sans, dense
  bordered tables, standard forms. Never gradients, glassmorphism, purple or
  teal "AI product" palettes, or emoji icons.
  **One family, and deliberately no monospace companion** (2026-08-15). A
  figure lines up down a column through `font-variant-numeric: tabular-nums`,
  which `globals.css` sets on the body and repeats on `.numeric` for a table
  column and `.figure` for a figure outside one. Plex Sans carries tabular
  figures, so the alignment is the font-feature's job and not a second family's.
  The prototype sets its figures in IBM Plex Mono; that is the one thing not
  taken from it, because `src/lib/pdf` bundles Plex Sans alone, and a screen
  whose figures no printed document can match is the wrong half of the trade.
  The face is loaded through `next/font` in `src/app/layout.tsx` and served from
  this origin; nothing is fetched from a font CDN at runtime.
  **The shell is the prototype's**: one viewport height grid, the bar across the
  top holding the mark, search and the account, the rail below it on the left,
  and only the work area scrolling. `src/components/AppShell.tsx` owns that
  geometry and every grid class in it carries an `md:` prefix, because below
  `md` the rail is a drawer and none of it applies. The screen head pins to the
  top of the work area at `md` for the same reason the bar does. It is safe to
  pin because both `Table` wrappers set an overflow and are therefore their own
  scroll containers, so a sticky column heading pins inside its table and never
  competes with the head; a table given a wrapper with no overflow breaks that.
  **The mark is `public/brand-mark.svg`**, the company symbol in white, and it
  is replaced the way `assets/letterhead-logo.svg` is replaced. It is the symbol
  alone: the printed lockup carries a tagline that is four pixels tall at the
  size the bar draws it. The name beside it is `COMPANY_NAME`, never in the file.
  **The rail splits the two sides, and that is a knowing divergence**
  (2026-08-15). The ERP's `11-navigation-and-admin.md` keeps one Money group
  holding both. Here the first two groups are Receivables and Payables, because
  every package this market has used splits the receivable side from the payable
  side, and this app is two sides before it is anything else: a bill raised and
  a bill received are opposite directions of money, and one group makes somebody
  read the item label to work out which way a screen points. Each group holds
  the whole of its side, bills, settlements, ledger and outstanding. Books is
  Accounts, which is what the department is called and what Tally calls it, and
  holds what belongs to neither side. If the ERP is made to agree, this is the
  shape to move to.
  **There is no Frequent block, and Parties is not pinned** (2026-08-15). The
  rail used to carry four shortcuts on a tinted strip above the groups. Every one
  of them was the first or second item of Receivables or Payables, which are the
  first two groups and open themselves, so the menu listed the same four screens
  twice inside one screen height. A fixed list that repeats the menu below it is
  not a shortcut; favorites somebody pins for themselves would be, and that is
  what earns the block back. Parties moved off the pinned row into a **Master
  Data** group under Reports, because a party is set up once and billed against
  for months and does not belong above the screens the office opens every day. It
  is a group of one on purpose: putting Customers under Receivables and
  Subcontractors under Payables is what Zoho and Odoo do, and it would put one
  screen on the menu under two names, which is the thing this rail must never do.
  **Two names were changed with it.** The Accounts group is **Cash and Expenses**:
  it holds Expenses and Expense Claims and nothing else, so Accounts promised a
  ledger that is not in there, and it collided with the name of a role somebody
  may be signed in as. Naming it Expenses would have put an item called Expenses
  inside a group called Expenses. The two **Outstanding** entries are now
  Customer Outstanding and Subcontractor Outstanding, because the short label
  read fine inside its group and was the same word twice anywhere the group name
  is missing. The color, ink,
  surface and rule tokens are the prototype's set: two rule weights, because the
  strong one closes a heading or a total and the soft one separates two ordinary
  rows, and `good` / `warn` / `crit` are reserved for state and are never a
  series color on a chart.
- **Documents are downloaded PDFs, never a printed screen.** A screen printed by
  the browser carries its headers, its margins and its own page breaks, which is
  not something to hand a customer. `src/lib/pdf/` renders A4 server-side with
  pdfmake, the same document model the ERP prints, so a builder moves across
  unchanged. `document.ts` owns the letterhead, the margins and the signature
  block; a screen is a record view with a Download PDF button, not a facsimile of
  the paper.
- **The letterhead is data, not code.** `assets/letterhead-logo.svg` plus the
  `COMPANY_*` variables. That file has three constraints written at the top of it
  (fills on elements, no live type, cropped viewBox) because pdfmake renders a
  string SVG with `useCSS` false and has no access to a design font. Tests hold
  those rules.

---

## 5. Commands

| Command          | Does                                             |
| ---------------- | ------------------------------------------------ |
| `pnpm dev`       | Run locally on `http://localhost:5174`           |
| `pnpm build`     | Production build                                 |
| `pnpm typecheck` | Typecheck                                        |
| `pnpm test`      | Unit tests (integration tests skip without a DB) |
| `pnpm db:up`     | Start this repository's own Postgres (port 5434) |
| `pnpm db:down`   | Stop it                                          |
| `pnpm db:setup`  | Apply `db/schema.sql` to `DATABASE_URL`          |

Run the full suite, including every SQL statement and server action, against a
real Postgres:

```bash
INTERIM_TEST_DATABASE_URL="postgresql://luma:luma@localhost:5434/interim_test" pnpm test
```

---

## 6. Testing expectations

Anything touching money or a balance needs a test before it is called done. The
pure modules are unit tested; the database layer and the server actions have
integration tests that run against a real Postgres in a throwaway schema. CI runs
all of it on every push, with a Postgres service container.

A change to a rate, a rounding step, or a statement column is a change to what
customers are billed. Add the case to the tests.

---

## 7. Scope discipline

Every request to add fabric tracking, process loss, rate cards, or a
double-entry ledger belongs in the **full ERP**, not here. If this app starts
growing modules, the reason it exists has been lost. Say so rather than building
it.

**The dashboard's trading summary is a view, not a module** (2026-08-12). LUMA
subcontracts the dyeing it bills for, so a subcontractor's bill is its cost of
sales, and revenue less that cost less expenses and salary is a real result over
figures already in the book. It adds no table and no new kind of record, which is
what keeps it on the right side of this rule. Three limits hold it there:

1. **It is not accounting.** Bills count when raised and expenses, salary and
   reimbursed claims when paid. The mixed basis is printed under the figures,
   not assumed. There is no opening or closing stock and no trial balance.
2. **Cost tiers live on the category, never on the row.** `EXPENSE_CATEGORIES`
   in `types.ts` is the one place a category maps to `direct`, `selling` or
   `operating`, so there is one choice at entry and no way to record a row whose
   category and tier disagree. Freight carrying fabric and a lab test on an
   order are cost of sales; commission is selling cost and is deliberately kept
   out of the gross margin, because it varies with revenue while saying nothing
   about whether the dyeing was bought well. An unknown category counts as
   overhead, which is the way of being wrong that cannot flatter the margin.
   A change here changes a reported margin: add the case to `costing.test.ts`.
3. **Margin per order goes as far as contribution and stops.** An order is a
   free text reference (`bill_line.order_no`, `expense.order_no`), not a table
   and not a module, and revenue and cost meet by grouping on it. Overhead is
   never apportioned across orders: there is no basis here to choose one, and a
   made up basis produces a made up per order profit somebody would then quote
   a customer from. Margin per customer stays impossible for the same reason it
   always was, because nothing links a customer bill to the subcontract bill
   behind it.
   Per order figures are only as good as the keying, so the report states its
   own coverage rather than letting an order with unreferenced costs look
   complete.
4. **Nothing new is stored.** Every figure is computed on read, as rule 2 asks.

**Expenses and payroll are the other exception, and it was a deliberate one**
(2026-08-10). The full ERP has written specs for both and is the place they
belong, but it is further out than the money going out of the business can wait,
so they are recorded here in the meantime. Two limits keep that from turning
this app into the ERP:

1. **Cash basis only.** An expense, an advance and a salary are recorded when
   the money moves. There is no chart of accounts, no journal and no accrual: a
   salary earned but unpaid is not in this app, and the ERP's posting table in
   `docs/spec/modules/payroll.md` is what settles that when it arrives.
2. **An employee is not a party.** Employees live in their own table and never
   appear in a party balance or on a customer statement. Payroll and billing
   share the money engine and nothing else.

Everything these modules hold is cash out, so it reconciles with the ERP as
payment history rather than as accounting, and it exports the same way.

**HR and payroll are separate.** HR holds the people: the personnel file and the
salary structure on the `employee` row. Payroll works out the money, a month at
a time, on `payroll_run` and `payroll_line`. Four rules hold that apart:

1. **A payroll line copies the salary structure when the month is generated.**
   The employee row carries only the current figures, so without the copy a raise
   in September would restate the August payslip. The same goes for the
   designation, which prints on the slip. This is why there is no effective-dated
   structure table: the snapshot is the history.
2. **Leave never touches a salary.** Casual, sick and earned leave are paid under
   the Labour Act, so recording one must not move money. Unpaid absence is a
   separate figure keyed on the payroll line, and the screen says Unpaid Absence
   rather than Absent Days so nobody files a sick day as one.
3. **The per day basis is stored on the run.** Divide by 30, by 26, or by the
   real length of the month; the full ERP has it open as D70. Storing it means a
   later change of policy cannot restate a month already paid, and the payslip
   prints which rule it used.
4. **A run's status is enforced in SQL, not in JavaScript.** The driver runs a
   transaction as a batch with no round trip, so nothing can read a row, decide,
   then write. Every guard is a `WHERE` clause on the writing statement with
   `RETURNING id`, and an empty result is what raises `InputError`.
5. **An advance carries its own recovery agreement, and automation proposes
   while HR disposes.** How an advance comes back is settled when the cash is
   handed over, on the `advance` row: `manual`, `full`, or `installment` with a
   figure and a month to start from. Generate fills each payroll line from it,
   capped by `plannedRecovery` at what that line can carry so a proposal can
   never be the thing that makes a month fail. There is deliberately no
   `partial` mode: a partial recovery is a decision taken in one month, not an
   agreement, so it is made by editing that month's figure. The cell stays
   editable at every status a draft allows, and the run's own
   `recover_advances` switch turns the whole month off, which is what a festival
   bonus month needs. An automatic deduction nobody can stop is a payroll
   waiting to pay somebody the wrong amount.
   Because a line holds one advance figure and not one per advance, recoveries
   are apportioned oldest first on read, never recorded per advance.

**What the workflow now promises, and what it still does not** (2026-08-14).
Draft, Approved and Paid stop an approved run being edited and stop a month
running twice. They also now stop the wrong person doing it: named accounts
replaced the shared password, so approving and paying a run take
`payroll:approve`, which only an Owner holds, and the name on an approval is the
signed-in account's rather than typed. That is authentication, not attribution,
and the field that used to ask who you were is gone: asking somebody to type
their name when the server already knows invites them to type somebody else's.

What it still does not promise is anything about the person behind the account.
A password can be shared, and nothing here checks a second factor or notices
that two people are using one login. That is the ordinary limit of a password,
not a gap in the workflow, and closing it is not this app's job.

---

## 8. Deployment

Vercel free plan, Neon free Postgres, named accounts. The environment variables
and the full setup are in [README.md](README.md). Production deploys happen from
`main`.

The first Owner is created from the server with
`node scripts/create-user.mjs`, which is also how a password is reset when
everybody is locked out. It writes the same two rows Better Auth's own sign-up
writes, using the library's hasher, so nothing about it can drift from the login
path. Public sign-up is refused in `src/app/api/auth/[...all]/route.ts`, the way
the ERP refuses it in `main.ts`: this is an internal book and nobody grants
themselves an account.
