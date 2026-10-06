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
3. **Supplier side** (2026-10-06). The same as the subcontractor side, for the
   spinners LUMA buys yarn from. LUMA now also sells finished fabric it has
   knitted and dyed by subcontractors from yarn it bought against the order, as
   well as dyeing customers' own fabric. See section 7.

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
7. **The system number is the printed number** (2026-10-06, reversing the rule
   that stood before it). Every document LUMA issues takes a number from a
   `counter` row bumped inside its own transaction, `TYPE-YY-SERIAL`, and that
   number is what the PDF prints, what a statement quotes and what the URL
   carries: `CB` customer bill, `MR` money receipt, `PV` payment voucher, `BR`
   bill received, `EXP`, `ADV`, `PR`, `FM`; `SO`, `PO` and `WO` arrive with
   sales orders, and `DC`, `GP` and `PI` are reserved. A series is **gapless**
   and **never resets**: `YY` is the document date's year, for reading only.
   Do not switch a counter to a sequence, which leaves holes when an insert
   fails, never re-issue a `doc_no` on an edit, and never put company initials
   in a number, because the letterhead already names the company.
   LUMA still writes a paper bill book and a receipt book. Their serial is kept
   beside the system number as **Paper Ref**: `bill.bill_no` on a customer bill,
   optional and unique across customer bills when present, and
   `payment.reference` on a receipt. A bill received is the party's document,
   so its `bill_no` is the party's own number, required and unique within that
   party, and its `BR` number is the book's handle for it, never printed to
   them. A customer draft takes its `CB` number when it is posted, so an
   abandoned draft leaves no hole.
   **A document records the role its party acted in** (`party_role`), because
   `direction` cannot: a supplier's yarn bill and a knitter's bill are both
   received. Read it with a fallback to the direction until the column is made
   `NOT NULL` in a later release (rule 15).
   **A party code is never printed** on a document or in a file name. It is the
   book's key for telling two similar names apart and means nothing to the
   party reading it.
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
    a screen: `/parties/CUS-0001`, `/customers/bills/CB-26-0113`,
    `/suppliers/bills/BR-26-0031`, `/customers/settlements/MR-26-0042`. Only a
    customer draft, which has no number until it is posted, is addressed by its
    id.
    The UUID still resolves, always, so nothing already sent out breaks. It
    answers with a permanent redirect to the business key rather than serving the
    page, because one record has one address.
    Collections are plural and consistent: `/parties`, `/customers/bills`,
    `/subcontractors/settlements`, `/suppliers/bills`. The lens in a URL is plural; the party role it
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
      **`fund:read` is the one read outside `READ_ONLY`** (2026-08-23), so a
      Viewer sees no capital, no drawings, no loan book and no Cash Book.
      Accounts holds both fund permissions, and that is a call rather than an
      oversight: it is the account that writes the cash book, and a Cash Book
      with the drawings taken out shows a running balance that does not add up,
      which is worse than no cash book. Moving the pair to the Owner alone is
      one line in `permissions.ts`, and the screens and the tile follow it.
      `searchRecords` takes the role for the same reason: the top bar would
      otherwise hand back a drawing to anyone who typed a lender's name.
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
15. **Expand in one release, contract in a later one** (2026-08-15). Never drop
    or rename a column in the same release that stops using it.
    Vercel keeps the previous deployment serving until the new one is built, so
    for the length of a build the **old code runs against the new schema**.
    `scripts/migrate.mjs` applies `db/schema.sql` before `next build`, which is
    the only ordering that gets the schema in place before the new code serves,
    and it is exactly the ordering that exposes this. A migration that removes
    something the running code still reads takes the site down until the build
    finishes.
    So a removal is two releases. First add the new column, ship code that
    writes it and reads it with a fallback, and leave the old one alone: that
    deploy is safe in both directions and can be rolled back. Then, once that
    release is live and settled and nothing reads the old column, drop it.
    The 2026-08-15 release broke this rule knowingly: it folded `fabric_type`
    into `description` and dropped `book_no` and `reference` in one step. That
    was affordable exactly once, against a book nobody was using yet, with a
    restore point taken and the migration rehearsed against a copy of production
    first. It is not the pattern to repeat now that the book is live.
    **The fund tables were rewritten in place on 2026-08-24 and that did not
    break this rule**, because they had never been deployed: neither existed on
    `main` and neither had ever held a row. There was no window in which old
    code could read a column being changed, so it was a first creation rather
    than a change. The one trap it did carry is that `CREATE TABLE IF NOT
    EXISTS` is a no-op against a development database that already had the
    abandoned shape, so a guarded drop runs at the **top** of `db/schema.sql`,
    before the definitions. Expense Claims came out the way the rule asks
    instead, over two releases, because that table is live.
    Every production release takes a Neon `backup/<timestamp>` branch before the
    schema is touched. That is what makes a mistake survivable; it is not what
    makes it unlikely. This rule is the control.

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
  **Screen text is a label, not an explainer** (2026-08-24). A screen says what
  it is in its title, and the columns say what the figures are. An explanatory
  sentence under every heading is what makes an app read as a tutorial rather
  than a book, and this one had drifted into twenty of them, forty-one field
  hints and several paragraph-length chart notes. A `subtitle` earns its place
  only where it states something the screen cannot show, and a `hint` only where
  the field would otherwise be keyed wrong; both are fragments, not sentences.
  This rule is about **screen text**. The dense comments in the code are house
  style and stay: they are for the next person editing the file, not for
  somebody trying to get a bill out.
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
- **A downloaded file is named by its number** (2026-10-06): `CB-26-0113.pdf`,
  `MR-26-0042.pdf`. The number already says what the document is, and the
  document names the company and the party. A document with no number of its
  own takes a short hyphenated description with the party's or person's name:
  `Statement-Rongdhonu-Dyeing-2026-07-01-to-2026-09-30.pdf`,
  `Payslip-2026-09-Abdul-Karim.pdf`. Never a code or an id. `pdf/file-name.ts`
  is the one place this is built.
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

| Command          | Does                                                          |
| ---------------- | ------------------------------------------------------------- |
| `pnpm dev`       | Run locally on `http://localhost:5174`                        |
| `pnpm build`     | Production build                                              |
| `pnpm typecheck` | Typecheck                                                     |
| `pnpm test`      | Unit tests (integration tests skip without a DB)              |
| `pnpm db:up`     | Start this repository's own Postgres (port 5434)              |
| `pnpm db:down`   | Stop it                                                       |
| `pnpm db:setup`  | Apply `db/schema.sql` to `DATABASE_URL` (refuses a remote one) |
| `pnpm db:pull`   | Copy production into the local `interim_dev`                  |

`db:pull` is read only against production and is how a change gets built against
the real book. It restores production's schema rather than `db/schema.sql`, so
running `db:setup` straight after it rehearses exactly what the deploy will do.
See rule 15 before writing the migration it is rehearsing.

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

**Fund flow is the third exception, and it comes from the ERP's own register**
(2026-08-23, simplified 2026-08-24). Capital the owner puts in, money the owner
takes out, and a loan borrowed and repaid were unrecordable anywhere. That is
decision **D23** in `luma-erp-planning/docs/decisions.md`, whose written default
is to build posting rules 13 to 17 from its `spec/03-accounting.md`, and whose
own note says why it could not wait: in a sole proprietorship, capital, drawings
and loans are the difference between a profit figure and a solvency figure.

**The first cut was too complicated and was rebuilt.** It carried a kind on the
account so capital and loans could share one master, a composite foreign key to
hold the two in step, seven categories in a dropdown, and two contra categories
for cash moved between the drawer and the bank. Recording "I took a 10 lakh loan
from Islami Bank" took two screens, two saves and thirteen fields. It is now one
screen, one save and seven fields. That is the standard: **a sentence of business
is one action.** Five limits hold it there:

1. **The category is the account, and no screen ever offers it as a choice.**
   `FUND_CATEGORIES` in `types.ts` maps each of the five to the ERP account it
   posts to: `capital_introduced` is 3000, `owner_drawing` is 3100, the two loan
   categories are 2400, and `interest_amount` on a repayment is 5500. Each
   action fixes one category as a SQL literal, so no form takes a category, no
   Zod schema validates one, and there is nothing to pick wrongly.
2. **The principal never reaches the profit statement.** Repaying a loan settles
   a liability and costs nothing. Only the interest paid with it is a cost, and
   it arrives through `profit.ts` as one line the way Salary does. A statement
   that counted the principal would report a loss in every month a loan is being
   paid down. `loan.integration.test.ts` holds this.
3. **Every balance is computed on read.** A loan's outstanding is what was drawn
   less what was repaid, worked out each time. There is no sanctioned amount
   column: it was a reference figure that was never arithmetic, so a ceiling is
   words in `terms` and a facility drawn in tranches is drawn again.
4. **A lender is a master row, and the only one.** `loan` holds one row per
   lender, because a liability tracked by retyping a name splits the first time
   somebody spells it differently. Capital and drawings need no master, because
   there is one owner: `/owner` asks for a date, an amount, a method and a note,
   and nothing else.
5. **Deliberately absent.** Money lent out, because the business borrows and
   does not lend. A fixed asset, because the ERP's D27 says account 1900 may not
   be needed at all. Deduction at source, because the ERP's D63 is open. And a
   cash versus bank split, because there is one drawer and one set of accounts
   and nobody here reconciles them separately.

**`mode` stays on the row even though the book shows one balance**, and removing
it with the split would be a mistake. The ERP's rules 13 to 17 all name the
other leg as "1000 Cash or 1100 Bank", and `mode` is the only thing that says
which. It is also the difference between a sum by cheque and the same sum in
notes, which a clerk needs to see.

**Cash Flow is the screen and the Cash Book is the drill-down.** `cashflow.ts`
groups the movements into Trading and Funding in a fixed line order, and each
line links through to the Cash Book filtered by source. There is no Investing
group because fixed assets are out of scope. The opening balance folds into the
opening wherever it is dated, in both modules, or the two close on different
figures: that was a real bug and there is a test named for it.

**Expense Claims was removed** (2026-08-24) because the owner does not need it.
A staff reimbursement is an ordinary expense voucher with the employee as the
payee, and the tier is overhead either way, so the profit statement is unaffected
in shape. `audit/page.tsx` keeps its `expense_claim` label permanently: the
activity log is append only by rule 5 and outlives the table.

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
and the full setup are in [README.md](README.md).

**One path to production, and it is `main`.** Work happens on a branch, the pull
request gets a Vercel preview running against **its own Neon branch** rather than
the live book, CI runs typecheck, the tests and the build, and merging to `main`
deploys. Nothing is deployed from a working tree: a deploy made with
`vercel --prod` uploads local files and is labeled with a commit it does not
match, which is how the live site and `main` came to disagree on 2026-08-15.

`DATABASE_URL` is scoped to the **production target only**. It used to cover
preview as well, which meant every pull request preview was reading and writing
the real book: opening a preview to try something out put test bills in the
customer ledger. A preview gets its database from the Neon integration instead,
as a branch that is deleted when the pull request closes.

The schema is applied by the deploy, not by hand. `pnpm vercel-build` runs
`scripts/migrate.mjs` before `next build`: it does nothing outside production,
takes a Neon `backup/<timestamp>` branch, then applies `db/schema.sql`, and a
failure fails the build so a bad schema change never reaches traffic. Read rule
15 before writing a migration; the ordering this buys is real but narrow.

The first Owner is created from the server with
`node scripts/create-user.mjs`, which is also how a password is reset when
everybody is locked out. It writes the same two rows Better Auth's own sign-up
writes, using the library's hasher, so nothing about it can drift from the login
path. Public sign-up is refused in `src/app/api/auth/[...all]/route.ts`, the way
the ERP refuses it in `main.ts`: this is an internal book and nobody grants
themselves an account.
