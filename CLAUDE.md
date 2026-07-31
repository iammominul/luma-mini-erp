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
   every bill by hand from a serial bill book and sends that paper out, so
   `bill.bill_no` (with `book_no`) is the hand-written number: it is what the
   party recognizes, what a statement quotes, and what the PDF prints as the
   document number. Alongside it, `bill.doc_no` is the system's own **gapless**
   series from the `counter` row bumped inside the bill's own transaction. Do not
   switch that to a sequence, which leaves holes when an insert fails, and never
   re-issue a `doc_no` on an edit. A subcontractor bill has no `doc_no`: their
   paper number is its identity.
   Uniqueness differs by side because the books do. A customer number is checked
   against every customer bill within its book (one series, written across all
   customers); a subcontractor number is scoped to that subcontractor.
8. **No secrets in the repository.** `.env.local` is ignored; keep
   `.env.example` current.
9. **Nothing here is LUMA specific.** Company name, address and contact all come
   from environment variables and print on the letterhead.

---

## 3. Where code goes

```text
src/lib/          The engine. money.ts, format.ts, amount.ts and statement.ts are
                  pure: no database, no framework, fully tested.
                  queries.ts reads, mutations.ts writes, and nothing else does.
src/lib/pdf/      Document assembly. document.ts is the letterhead system every
                  document is built on; one builder per document; render.ts is
                  the only place bytes are produced. No arithmetic here: a
                  builder receives figures already computed and formatted.
src/app/          Pages (server components) and server actions. Thin: read,
                  render, or validate and call a mutation. A `pdf/route.ts`
                  streams a document as a download.
src/components/   Presentation. Client components only where a form needs state.
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
  Party, Bill. Marketing and AI-tell words are banned: seamless, leverage, delve,
  robust, streamline, empower, effortless, and the rest of that family.
- **Tone:** plain declarative business English, the way a bank statement reads.
  An error states the fact and the required action ("Bill RD-889 is already
  recorded against Rongdhonu Dyeing"). No emoji, no exclamation marks.
- **Case:** Title Case for menus, buttons and field labels. Sentence case for
  messages and help text.
- **US English everywhere**, screens, documents, code and comments: Authorized,
  Color, Organization, Recognized. Trade terms keep their own spelling (Challan,
  Gate Pass, Money Receipt, Greige). The full ERP has the same rule; a document
  that mixes the two looks careless to the party reading it.
- **Look:** classic office software. Brand navy `#142b40`, Inter, dense bordered
  tables, standard forms. Never gradients, glassmorphism, purple or teal "AI
  product" palettes, or emoji icons.
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
| `pnpm db:setup`  | Apply `db/schema.sql` to `DATABASE_URL`          |

Run the full suite, including every SQL statement and server action, against a
real Postgres:

```bash
INTERIM_TEST_DATABASE_URL="postgresql://luma:luma@localhost:5432/luma_dev" pnpm test
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

Every request to add fabric tracking, process loss, rate cards, payroll, or a
double-entry ledger belongs in the **full ERP**, not here. If this app starts
growing modules, the reason it exists has been lost. Say so rather than building
it.

---

## 8. Deployment

Vercel free plan, Neon free Postgres, one shared password. The environment
variables and the full setup are in [README.md](README.md). Production deploys
happen from `main`.
