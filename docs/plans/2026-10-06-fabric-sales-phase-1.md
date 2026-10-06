# Fabric sales, phase 1: numbering, suppliers, orders and order costing

**Status:** 1a and 1b built on `feature/fabric-sales-phase-1`, 2026-10-06. Not
yet released: the rehearsal against a pulled copy of production comes first.

**Where the build differs from this plan, and why:**

- **Order Costing report** (`/reports/orders`) was not reworked. A linked line
  writes its free text `order_no` from the order (the customer's reference, or
  the SO number), so every linked bill and expense already appears there under
  that reference. Reading the report from Sales Orders directly is left for
  when it is needed; the Sales Order screen is now the per order view.
- **Business Summary line** is the existing tile row (Receivable, Payable, Cash,
  Net Result), with the period's expenses in the Trading band under it. A
  second line repeating those figures was not added.
- **A Dyeing Service order starts at Booked**, not In Dyeing, until a dyeing WO
  is issued for it. The stage is read off documents, and before the WO there
  is no document saying dyeing has started.
- **Cash and Funds keeps its name** rather than becoming Accounts: Accounts is
  also a role name, which is why it was renamed before (CLAUDE.md section 4).
- **The three Outstanding items keep the short label**, by the 2026-08-24
  reasoning recorded in `nav-items.ts`.
- **Sales Order permissions reuse `bill:read` and `bill:manage`**, as planned.
**Decided by:** the owner, in conversation on 2026-10-06 (answers recorded below).

## Why this exists

LUMA now runs two businesses side by side:

1. **Dyeing service.** The customer sends grey, LUMA has it dyed by a
   subcontractor and bills the dyeing. The fabric is the customer's. This is
   what the app was built for.
2. **Finished fabric sales.** LUMA buys yarn against an order, has it knitted by
   a subcontractor, has the grey dyed by a subcontractor, and sells the finished
   fabric to garment factories, buying houses and local buyers. The yarn, the
   grey and the finished fabric are LUMA's.

The owner has decided the second belongs in this app now, not in the full ERP.
CLAUDE.md section 7 says the opposite and is amended in this phase.

The owner also asked for the numbering of every record and document, and the
naming of every downloaded file, to follow the way established ERPs in
Bangladesh do it: one clean series per document type, the system's number on
the printed document, nothing internal printed to a party.

## Out of scope, and why

| Item | Status |
| --- | --- |
| **Dye and chemical supply** | Out of this plan. It may be run as a separate company, which the owner is settling with the CA and a lawyer. If it is a separate company it gets its own copy of this app (own database, deployment, letterhead and logins), which needs no code because rule 10 keeps every company detail in configuration. Nothing in this plan may assume chemicals live in LUMA's book |
| **LC sales** | A later module. Every sale is in taka and settled by cash or bank transfer, both of which `payment.mode` already records. No currency column, no exchange rate, no acceptance or maturity date |
| **Garment accessories** | Not decided which company sells them. The order line is generic so they can be added as a category without a schema change if they land in LUMA's book |

## What the owner settled (2026-10-06)

| Question | Answer |
| --- | --- |
| How yarn is bought | Against one order, never in bulk |
| Who knits | Always a subcontractor |
| Who buys finished fabric | Garment factories, buying houses and local buyers |
| Payment | Cash and bank transfer, in taka. LC is a later module |
| Dyeing service continues | Yes, both businesses run |
| Kilos tracked | Yes, through the chain (phase 2) |
| Sale billed on | Grey kg |
| Yarn suppliers | A real Supplier role with its own bills, payments and ledger |
| Leftovers | Moved to another order or sold off (phase 3) |
| Order record | A real Sales Order, not free text |
| Yarn and grey route | Either direct or via LUMA (phase 2 movements) |
| Cost level | Per order line (fabric and color) |
| Pre-cost | Yes, budget vs actual (phase 3) |
| Loss basis | Percent of input (phase 2) |
| Service jobs | Also Sales Orders, with Dyeing Service lines |
| Transport | Cash per trip. Split by kg carried when a trip serves several lines (phase 2). Phase 1 names one line |
| Number year basis | **Never reset.** One running serial per type, the year of the document date shown for reading |
| Printed number | **The system number**, from now. The paper book stays in use and its number is keyed as Paper Ref |
| Company initials in numbers | **No.** The letterhead names the company |
| Purchase and Work Orders | **Real documents in phase 1**, printed to the spinner, knitter and dye house |
| Party code on documents | **Never printed** (statement change already made, 2026-10-06) |

## The phases

| Phase | What it delivers |
| --- | --- |
| **1a** | The numbering standard, file names, the supplier side, money receipt and payment voucher numbers, system number printed on the customer bill |
| **1b** | Sales Order, Purchase Order, Work Order, every bill line and expense tied to an order line, order costing in money |
| 2 | Movement register (challans in kilos), stock by location, knitting and dyeing loss per subcontractor, transport split by kg per trip |
| 3 | Pre-cost, budget vs actual with variances, closing gates, leftover transfers and leftover sales |

Each is a release that is useful on its own. 1a goes first because every
document 1b adds is numbered and named by it.

---

## Part A. The numbering and naming standard

### A1. The record keys

Masters are numbered once and never carry a year.

| Record | Key | Status |
| --- | --- | --- |
| Customer | `CUS-0001` | unchanged |
| Subcontractor | `SUB-0001` | unchanged |
| Supplier | `SUP-0001` | new counter, `party_supplier` |
| Employee | `EMP-0001` | unchanged |
| Lender | `LOAN-0001` | unchanged |

A party holding several roles keeps the one code it was given first. The code is
the book's internal key: it is shown on screens and never printed on a document
that goes to a party.

### A2. The document series

Every document is `TYPE-YY-SERIAL`:

- `TYPE` is two or three capitals naming the document.
- `YY` is the calendar year of the document's own date, for reading only.
- `SERIAL` is one running counter per type, **never reset**, at least four
  digits and widening past 9999 rather than wrapping.
- Gapless: the counter row is bumped inside the document's own transaction,
  as `customer_bill` is today (rule 7). Never a sequence.

| Document | Series | Issued to | Status |
| --- | --- | --- | --- |
| Sales Order | `SO-26-0001` | internal, confirms the customer's order | 1b |
| Customer Bill | `CB-26-0001` | customer | exists; now printed |
| Money Receipt | `MR-26-0001` | customer | 1a, new |
| Purchase Order | `PO-26-0001` | yarn supplier | 1b |
| Work Order | `WO-26-0001` | knitter or dye house | 1b |
| Bill Received | `BR-26-0001` | internal, beside the party's own number | 1a, new |
| Payment Voucher | `PV-26-0001` | supplier or subcontractor | 1a, new |
| Expense Voucher | `EXP-26-0001` | internal | unchanged |
| Salary Advance | `ADV-26-0001` | internal | unchanged |
| Payroll Run | `PR-26-0001` | internal | unchanged |
| Fund Movement | `FM-26-0001` | internal | unchanged |

**How the prefixes were checked (2026-10-06).** There is no published Bangladesh
standard: Tally, PrismERP, Logic and every office set their own. What the trade
does share is the document vocabulary, so each prefix is held to that:

| Prefix | Verdict |
| --- | --- |
| `MR` | The Bangladesh term. Every office's money receipt book says MR |
| `PO`, `WO` | The trade's own words. A garment factory sends a WO to its suppliers; a mill sends a PO for yarn |
| `SO` | The generic ERP term (Odoo, ERPNext, SAP, Logic, Prism all say Sales Order). The trade says "order" or "booking", which has no clean prefix |
| `CB` | Not a trade abbreviation; `INV` or `BILL` would read more naturally to a party. Kept because the series is live (`CB-26-0113` is in use and in URLs) and a series that changes prefix midway reads as two books. Revisit only at a clean cut, not mid-book |
| `PV` | Kept. Bangladesh offices also say Debit Voucher (DV) and Credit Voucher (CV), but those are double-entry words for a ledger this app does not keep (section 7), and Payment Voucher says what the paper is |
| `BR` | Internal only, never printed to a party. Matches the screen name Bill Received. Generic ERPs say Purchase Bill or Vendor Bill, which would be wrong for a dyeing bill |

Reserved now so they are never taken by something else: `DC` Delivery Challan
and `GP` Gate Pass (phase 2), `PI` Proforma Invoice (the LC module).

**Work Order means the order LUMA issues** to a knitter or a dye house, which is
what the trade calls it. The order a garment factory or buying house sends LUMA
is recorded on the Sales Order as **Customer PO / WO No**, so the two never share
a name on a screen.

**A number once issued is never changed or re-issued.** That is unchanged from
rule 7, and it is why the existing `CB-26-xxxx` series simply continues.

`ids.ts` `DOC_NO_PATTERN` already accepts this shape. `dates.ts`
`fiscalYearCode` is unused and stays so; note in its comment that the owner chose
a never-reset series over the full ERP spec's fiscal reset.

**For the CA.** If LUMA issues VAT invoices (Mushak 6.3), the serial must be
sequential and unbroken. A gapless series that never resets meets that; the CA
should confirm a single running series is acceptable rather than one per fiscal
year.

### A3. What a printed document carries

| Document | Printed as the number | Also printed |
| --- | --- | --- |
| Customer Bill | `CB-26-0001` | Paper Ref, when keyed |
| Money Receipt | `MR-26-0001` | Paper Ref, when keyed; the cheque or bank reference |
| Payment Voucher | `PV-26-0001` | the party's bill numbers it settles, if stated |
| Purchase Order | `PO-26-0001` | the Sales Order's Customer PO / WO No |
| Work Order | `WO-26-0001` | the Sales Order's Customer PO / WO No |
| Statement of Account | none, identified by party and period | the system number of every bill and receipt in it, Paper Ref beside |

Never printed to a party: the party code, a UUID, the internal `BR-` number.

### A4. Downloaded file names

**The number is the file name** (owner, 2026-10-06: short and concise). A
numbered document is saved as its number and nothing else, because the number
already names the document type, and the document itself names the company and
the party. Only a document with no number of its own gets a short descriptive
name.

| Document | File name |
| --- | --- |
| Customer Bill | `CB-26-0113.pdf` |
| Draft customer bill (no number yet) | `CB-DRAFT-2026-10-06.pdf` |
| Money Receipt | `MR-26-0042.pdf` |
| Payment Voucher | `PV-26-0018.pdf` |
| Bill Received | `BR-26-0031.pdf` |
| Purchase Order | `PO-26-0007.pdf` |
| Work Order | `WO-26-0011.pdf` |
| Payslip | `Payslip-2026-09-Abdul-Karim.pdf` |
| Statement of Account | `Statement-Rongdhonu-Dyeing-2026-07-01-to-2026-09-30.pdf` |
| Profit Statement | `Profit-Statement-2026-07-01-to-2026-09-30.pdf` |

Rules: never a party code, an employee code or a UUID; the number exactly as
printed on the document; hyphens only. The trade-off, accepted: a file saved
into a party's downloads folder as `CB-26-0113.pdf` does not say who sent it
until it is opened.

---

## Part B. Phase 1a

### B1. Customer Bill: the system number is the printed number

Today `bill.bill_no` is the hand-written number, unique among customer bills,
printed as the document number, and quoted on the statement. `doc_no` is
internal. That reverses.

Release 1a (expand, rule 15):

- Add `bill.paper_ref text NULL`. The entry form calls it **Paper Ref**, optional.
- On a new customer bill the action writes `paper_ref` from the form and also
  writes `bill_no` (still `NOT NULL`, still unique for issued bills) as the paper
  number when one is keyed, else as the `doc_no` being issued. Old code reading
  `bill_no` during the build window therefore still finds a value, and the
  unique index still holds.
- Backfill: `paper_ref = bill_no` on every existing customer bill, so the paper
  number of every past bill is in the new field.
- The PDF, the bill screen, the register and the statement print `doc_no` as
  the number and `paper_ref` beside it.
- A **draft** bill has no `doc_no` yet (rule 7, nothing leaves a hole). Its PDF
  prints **DRAFT** in place of the number, and the download stays allowed.
- The uniqueness check moves to `paper_ref` among customer bills, so a paper
  number keyed twice is still refused with the existing message.

Release after 1a is settled (contract):

- `bill_no` becomes nullable on issued bills, and the action stops writing it.
- CLAUDE.md rule 7 is rewritten at 1a, not here: the system number is the
  identity and the printed number; the paper number is a reference.

A bill received is unchanged in this respect: the subcontractor's or supplier's
own paper number stays `bill_no`, unique within that party, and is what the
payment voucher quotes.

### B2. Bill Received gets a system number

- Counter `bill_received`; `doc_no = 'BR-' || YY || '-' || serial` issued on save
  of a bill received (a received bill has no draft).
- Backfill every existing received bill in `bill_date, created_at` order, inside
  the migration, and set the counter to the last value. No number on any party's
  paper changes, because nobody was ever shown one.
- URL: `/subcontractors/bills/BR-26-0031`. The UUID redirects to it, which
  removes the exception rule 11 had to make for bills received.

### B3. Money Receipt and Payment Voucher numbers

- `payment.doc_no text NULL`, counters `money_receipt` and `payment_voucher`.
- On save: `MR-YY-serial` for money in, `PV-YY-serial` for money out.
- `payment.reference` keeps holding the paper money receipt serial, cheque
  number or bank reference. The form labels it **Paper Ref / Cheque / Bank Ref**.
- Backfill existing rows in `paid_on, created_at` order. A reprint of an old
  receipt then shows its new MR number with the paper serial beside it; the
  paper the customer holds still matches by the serial.
- URLs: `/customers/settlements/MR-26-0042`, `/subcontractors/settlements/PV-26-0018`.

### B4. Supplier side

`party.is_supplier` exists and is unused for documents. `side.ts` already
anticipates a third lens (lines 12 to 13).

**The finding that shapes this step.** A supplier bill is a bill received and a
supplier payment is money out, the same directions a subcontractor's use.
`listBills` and `listPayments` filter on `direction` alone
(`queries.ts` line 331), so without a discriminator a yarn bill would appear on
the Subcontractor screens.

Schema, all additive (rule 15):

- `bill.party_role` and `payment.party_role`, `text NULL CHECK (party_role IN
  ('customer', 'subcontractor', 'supplier'))`.
- Backfill: `issued` and `in` become `customer`, `received` and `out` become
  `subcontractor`. Every existing row is one of those.
- Reads use `COALESCE(party_role, CASE direction ...)`, so a row the old code
  writes during the build window still lands on the right lens. `NOT NULL` in
  the contract release.
- `bill_nature_of_work_check` widened to add `'yarn'`. A supplier bill is fixed
  to `'yarn'` by the action, never offered as a choice.
- Counter row `party_supplier` issuing `SUP-0001` (`mutations.ts` line 132 picks
  only customer or subcontractor today).

Code:

- `side.ts`: `Side` gains `'suppliers'` with its copy: Supplier, Supplier Bills,
  Supplier Payments, Supplier Ledger, Balance Payable, `billNoIsOurs: false`.
- `listBills`, `listPayments`, `listPartyBalances` and the bill uniqueness check
  take the role. A supplier's bill number is unique within that supplier.
- Actions under `[side]` write `party_role` from the lens and refuse a party
  that does not hold that role.
- A supplier bill line reuses `bill_line`: `grey_kg` is the billed weight and
  is labeled **Yarn Kg** on this lens; `lot_no` is the yarn lot; `finished_kg`
  and `color` are hidden.
- `profit.ts`: received bills are labeled by role, so Yarn arrives as its own
  direct cost line, note "Supplier bills". Case added to `costing.test.ts`.
- `cashflow.ts`, `cashbook.ts`: a supplier payment is a Trading outflow.
- Dashboard payables card counts suppliers.
- Rail: Payables gains Supplier Bills, Supplier Payments, Supplier Ledger beside
  the subcontractor items (open question 2).

### B5. File names and printed fields

- `file-name.ts` names a numbered document by its number alone, and an
  unnumbered one by a short description with the party's name, per A4.
- Every builder passes the number as printed.
- `pdf.test.ts`: one assertion per document that no party code and no UUID
  appears in the rendered text or the file name.

### B6. 1a tests

- Two customer bills saved at once get consecutive CB numbers; the same for MR,
  PV and BR, each on its own counter.
- The backfills: every existing received bill and payment has a number, no two
  share one, and each counter equals the highest issued.
- A customer bill keyed with no Paper Ref saves, prints its CB number, and the
  old code path's `bill_no` read still returns a value.
- A Paper Ref keyed twice on customer bills is refused.
- A supplier bill never appears on the Subcontractor screens, and the reverse.
- A row with null `party_role` reads as its direction implies.
- File names for every document match A4.

---

## Part C. Phase 1b

### C1. Sales Order

```sql
INSERT INTO counter (name, value) VALUES ('sales_order', 0) ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS sales_order (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  doc_no          text NOT NULL,          -- SO-26-0001, issued on save
  party_id        uuid NOT NULL REFERENCES party (id),   -- a customer
  order_date      date NOT NULL,
  customer_ref    text,                   -- Customer PO / WO No
  status          text NOT NULL DEFAULT 'open'
                  CHECK (status IN ('open', 'closed', 'cancelled')),
  notes           text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS sales_order_doc_no_key ON sales_order (doc_no);

CREATE TABLE IF NOT EXISTS sales_order_line (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id        uuid NOT NULL REFERENCES sales_order (id),
  line_no         integer NOT NULL,
  -- Widened by a CHECK change, never by a new table, when a category is added.
  category        text NOT NULL CHECK (category IN ('fabric', 'dyeing_service')),
  description     text NOT NULL,          -- S/J 30/1 CVC, 1x1 Rib, Fleece (2x1) LY
  color           text,
  unit            text NOT NULL DEFAULT 'kg'
                  CHECK (unit IN ('kg', 'pcs', 'dozen', 'gross', 'yard', 'meter')),
  quantity        numeric(12, 3) NOT NULL CHECK (quantity > 0),   -- booked
  rate            numeric(12, 6) NOT NULL CHECK (rate >= 0),      -- per unit
  UNIQUE (order_id, line_no),
  UNIQUE (id, order_id)
);
```

Rules:

- The number is issued on save. There is no draft order, so nothing leaves a
  hole.
- An order is never deleted. It is cancelled with a reason, and only while
  nothing points at it. A line is removed only while nothing points at it.
- Booked value is `quantity x rate` through `amount.ts`, on read, never stored.
- **Fabric** and **Dyeing Service** lines are fixed to `kg` by the action and the
  quantity is grey kg, because both are billed on grey weight.
- An order may mix categories. The filter reads the category off the lines; the
  header stores none, so the two cannot disagree.
- A **Dyeing Service** line's costs are the dye house bills. The fabric is the
  customer's and carries no cost here.
- Every write carries its `activity_log` row; edits and cancellation need a
  reason. Permissions reuse `bill:read` and `bill:manage`.

### C2. Purchase Order (yarn)

```sql
CREATE TABLE IF NOT EXISTS purchase_order (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  doc_no          text NOT NULL,          -- PO-26-0001
  party_id        uuid NOT NULL REFERENCES party (id),   -- a supplier
  order_date      date NOT NULL,
  -- Where the spinner delivers: a knitter (direct) or LUMA itself (null).
  deliver_to_id   uuid REFERENCES party (id),
  delivery_by     date,
  status          text NOT NULL DEFAULT 'open'
                  CHECK (status IN ('open', 'closed', 'cancelled')),
  terms           text,                   -- payment and delivery terms, printed
  notes           text,
  created_at, updated_at
);

CREATE TABLE IF NOT EXISTS purchase_order_line (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  po_id           uuid NOT NULL REFERENCES purchase_order (id),
  line_no         integer NOT NULL,
  order_line_id   uuid NOT NULL REFERENCES sales_order_line (id),
  description     text NOT NULL,          -- 30/1 Combed Cotton, 26/1 CVC 60/40
  quantity_kg     numeric(12, 3) NOT NULL CHECK (quantity_kg > 0),
  rate            numeric(12, 6) NOT NULL CHECK (rate >= 0),
  UNIQUE (po_id, line_no)
);
```

- Every PO line names a **Fabric** Sales Order line: yarn is bought per order.
- Printed on the letterhead: supplier, deliver to, delivery by, lines with
  amount, total in figures and words, terms, the Customer PO / WO No of each
  order, signature block. No party code.

### C3. Work Order (knitting, dyeing)

```sql
CREATE TABLE IF NOT EXISTS work_order (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  doc_no          text NOT NULL,          -- WO-26-0001
  party_id        uuid NOT NULL REFERENCES party (id),   -- a subcontractor
  process         text NOT NULL CHECK (process IN ('knitting', 'dyeing_finishing')),
  order_date      date NOT NULL,
  -- Where the finished work goes: the next subcontractor, LUMA, or the customer.
  deliver_to_id   uuid REFERENCES party (id),
  delivery_by     date,
  status          text NOT NULL DEFAULT 'open'
                  CHECK (status IN ('open', 'closed', 'cancelled')),
  terms           text,
  notes           text,
  created_at, updated_at
);

CREATE TABLE IF NOT EXISTS work_order_line (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wo_id           uuid NOT NULL REFERENCES work_order (id),
  line_no         integer NOT NULL,
  order_line_id   uuid NOT NULL REFERENCES sales_order_line (id),
  description     text NOT NULL,          -- the fabric to make or the finish
  color           text,                   -- dyeing
  gsm             text,                   -- knitting and finishing spec, as written
  dia             text,
  quantity_kg     numeric(12, 3) NOT NULL CHECK (quantity_kg > 0),  -- grey kg
  rate            numeric(12, 6) NOT NULL CHECK (rate >= 0),        -- per grey kg
  UNIQUE (wo_id, line_no)
);
```

- A knitting WO line names a Fabric line. A dyeing WO line names a Fabric line
  or a Dyeing Service line, which is how the existing dyeing service gets its
  Work Order too.
- `gsm` and `dia` are text, as written on the program, because the trade writes
  ranges ("160-170", "30 Open").
- Printed like the PO, titled **Work Order: Knitting** or **Work Order: Dyeing
  and Finishing**.

### C4. Everything points at an order line

```sql
ALTER TABLE bill_line ADD COLUMN IF NOT EXISTS order_line_id uuid
  REFERENCES sales_order_line (id);
ALTER TABLE bill_line ADD COLUMN IF NOT EXISTS po_line_id uuid
  REFERENCES purchase_order_line (id);
ALTER TABLE bill_line ADD COLUMN IF NOT EXISTS wo_line_id uuid
  REFERENCES work_order_line (id);
ALTER TABLE expense ADD COLUMN IF NOT EXISTS sales_order_id uuid
  REFERENCES sales_order (id);
ALTER TABLE expense ADD COLUMN IF NOT EXISTS order_line_id uuid;
ALTER TABLE expense ADD CONSTRAINT expense_order_line_fk
  FOREIGN KEY (order_line_id, sales_order_id)
  REFERENCES sales_order_line (id, order_id);
```

How each bill line is tied, checked in the action:

| Bill | The line picks | Which sets |
| --- | --- | --- |
| Customer bill | a Sales Order line of **that customer** | `order_line_id` |
| Supplier bill | a PO line of **that supplier** | `po_line_id`, and `order_line_id` from it |
| Subcontractor bill | a WO line of **that subcontractor** | `wo_line_id`, and `order_line_id` from it |
| Expense | an order, or a line of it | `sales_order_id`, `order_line_id` |

- A closed or cancelled order, PO or WO takes no new links. An edit that keeps
  an existing link is allowed, so a typo fix is not blocked.
- One bill may carry lines from several orders.
- Picking the PO or WO line fills the description, weight and rate on the bill
  line, which stay editable: the bill states what was actually charged.
- The free text `order_no` stays (rule 15). On a linked line the action writes it
  from the Sales Order's `customer_ref`, so the current Order Costing report,
  search and export keep working through the build window.
- Forms: the picker per line in `BillForm.tsx` and `ExpenseForm.tsx`, controlled
  through `useKeptValues` (rule 12).

### C5. Screens

| URL | Screen |
| --- | --- |
| `/orders`, `/orders/new`, `/orders/SO-26-0001`, `.../edit` | Sales Orders |
| `/purchase-orders`, `/purchase-orders/PO-26-0001`, `.../pdf` | Purchase Orders |
| `/work-orders`, `/work-orders/WO-26-0001`, `.../pdf` | Work Orders |

A UUID resolves with a permanent redirect to the number (rule 11); a wrong
handle is a 404 through `isUuid` (rule 13).

The Sales Order screen, money only in this phase:

| Line | Category | Booked Qty | Rate | Booked Value | Billed Qty | Billed | Yarn | Knitting | Dyeing | Transport | Other Direct | Contribution | % |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |

then an **Order Level** row for costs filed against the order and no line, then
**Total**. Below it, the POs, WOs, bills and vouchers behind each figure, linked,
each shown by its number. From the order: **New Purchase Order** and **New Work
Order**, prefilled from its lines.

**The rail is redesigned in 1b** (owner, 2026-10-06), by business function the
way Bangladesh textile ERPs arrange it, while keeping each side of the book in
one place:

| Group | Holds |
| --- | --- |
| Dashboard | pinned |
| Sales | Sales Orders, Customer Bills, Money Receipts, Customer Ledger, Customer Outstanding |
| Purchase | Purchase Orders, Supplier Bills, Supplier Payments, Supplier Ledger, Supplier Outstanding |
| Work Orders | Work Orders, Subcontractor Bills, Subcontractor Payments, Subcontractor Ledger, Subcontractor Outstanding |
| Accounts | Expenses, Loans, Owner's Account |
| HR and Payroll | unchanged |
| Reports | Profit Statement, Cash Flow, Cash Book, Expense Register, Order Costing |
| Setup | Parties |
| Settings | Users, Audit Trail |

Commercial (LC, PI) and Store (challans, phase 2) slot in later as groups of
their own. CLAUDE.md section 4's Receivables and Payables entry is rewritten
with it: Sales is the whole receivable side, Purchase and Work Orders the whole
payable side, so the rule that one side never splits across groups holds.

### C6. The pure module

`src/lib/order-costing.ts`, no database, fully tested. Cost columns:

| Column | Source |
| --- | --- |
| Yarn | supplier bill lines on the order line |
| Knitting | subcontractor bill lines through a knitting WO |
| Dyeing | subcontractor bill lines through a dyeing WO |
| Transport | expenses in the freight categories |
| Other Direct | other direct tier expenses |
| Selling | commission, below contribution as `orderMargin` does |

Overhead never reaches an order (section 7, limit 3, unchanged). A PO or WO is a
commitment, not a cost: phase 1 shows **Ordered** beside **Billed** for yarn,
knitting and dyeing, so an order with work done and not yet billed reads as
incomplete rather than cheap.

### C7. Reports, search, export, audit

- `/reports/orders` reads Sales Orders first; rows carrying only free text
  `order_no` appear under **Earlier Orders (Free Text)** as today.
- `searchRecords` finds every new series (SO, PO, WO, MR, PV, BR) and Customer
  PO / WO No.
- `export.ts` writes the new tables and columns. This is the file the ERP imports.
- `audit/page.tsx` labels the new tables.

### C7a. Dashboard and quick entry (owner, 2026-10-06)

Taken from a reference dashboard the owner shared, and only the parts that fit
this book. Every figure is computed on read from documents already recorded.

- **Needs Attention strip** under the tiles: one line of counts, each a link.
  Customer drafts not posted; posted bills missing detail; receivable over 60
  days; Work Orders open past their delivery date; order lines with
  subcontractor work billed and nothing billed to the customer.
- **Order Pipeline**: open Sales Orders with a stage **derived from the
  documents**, never typed: Booked (no PO or WO), Yarn Ordered (a PO), In
  Knitting, In Dyeing (an open WO of that process), Billed (a customer bill on
  every line), Closed. A dyeing service line starts at In Dyeing.
- **Business Summary line**: receivable, payable, this month's expense, cash
  (cash only for a role with `fund:read`).
- **Top Customers** by billing in the period, with each one's share, as a bar
  list. No donut beside it.
- **New buttons** in the dashboard head: New Sales Order, New Customer Bill,
  New Receipt. Not a tile grid: that would repeat the menu.
- **Quick create in a dialog**, only for short tasks: **New Party** from inside
  the party picker on a bill, Sales Order, PO or WO, so a new buyer does not
  make anyone leave half-keyed lines; **Record Receipt / Record Payment** from
  a party's statement and from a bill. Documents with line grids stay full
  pages, because a dialog dismissed by a stray click loses what was typed,
  which rule 12 forbids.

Deliberately not taken: gradient or purple tiles, a donut duplicating a list, a
growth figure with no stated basis, a delete button on every party row, an
approvals queue, and a status somebody types by hand.

### C8. 1b tests

Pure: `order-costing.test.ts` (per line and per order, order level costs kept out
of lines, ordered vs billed, zero booked value); `costing.test.ts` (yarn is
direct cost).

Integration:

- SO, PO and WO numbers gapless under concurrent saves.
- A customer bill line naming another customer's order line is refused.
- A supplier bill line naming another supplier's PO line is refused; the same
  for a subcontractor and a WO.
- A PO line naming a Dyeing Service line is refused.
- A fabric or dyeing service line with a unit other than kg is refused.
- A cancelled order refuses a new PO, WO or link; cancelling one with links is
  refused.
- An expense whose line belongs to another order is refused by the database.
- The order screen figures equal the sum of the documents behind them.
- Export round trip includes the new tables.

---

## Part D. CLAUDE.md, at 1a

- **Section 1:** two businesses; suppliers on the payable side.
- **Rule 7:** rewritten. The system number is the identity and the printed
  number for every document LUMA issues. The paper book number is Paper Ref. A
  party's own bill number stays the identity of a bill received from it, beside
  the internal BR number. All series are `TYPE-YY-SERIAL`, gapless, never reset.
- **Rule 11:** the bill received exception goes (it has a BR number now).
- **Section 4:** a short Numbering and File Names entry pointing at Part A here,
  and "a party code is never printed".
- **Section 7:** a fourth exception, Fabric Sales and Per Order Costing, with its
  limits: no stock valuation (yarn is bought per order), costs tied by
  reference not by valuation, overhead never apportioned, phases 2 and 3 named.

## Rehearsal before each merge

`pnpm db:pull`, then `pnpm db:setup`, then the full suite against the pulled
copy. Check the counts of every backfill (`paper_ref`, `party_role`, BR, MR, PV)
against the tables before and after, and that each counter equals the highest
number it issued.

---

## Open questions for the owner

1. **Yarn weight on a supplier bill.** Reuse the bill line's weight column,
   labeled Yarn Kg (default), or a separate column.
2. **The rail.** Default: Receivables opens with Sales Orders; Payables gains
   Purchase Orders, Work Orders and the three Supplier items. That is eleven
   items in Payables, which may want to become Payables and Purchasing.
3. **Old free text orders.** Leave them as history (default), or a one time
   screen to attach them to Sales Orders.
4. **Sales Order PDF.** Should the customer receive a printed Order
   Confirmation? Default: not in phase 1.
