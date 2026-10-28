# The full ERP's modules, built here first

**Status:** decided by the owner, 2026-10-29. Wave 0 under way on
`feature/full-erp-modules`: the book check is built and tested.

## Why this exists

The owner planned the full ERP as 22 modules
(`../../../LUMA FULL ERP/planning/module-blueprint.md`) and wants to see every
one of them working on LUMA's real orders before the full ERP is built, so that
it is built from real cases rather than from a plan alone. This app is the
proving ground for that (full ERP register, D111).

One condition, also the owner's: **the book stays intact.** Bills, receipts,
payments, expenses, payroll, funds and every balance read the same after each
release as before it. That condition decides where each module runs.

## Where each module runs

| Place | Means | Modules |
| --- | --- | --- |
| **Live** | Used on real daily work. Its own tables; reads the book, never writes it | LIB, MER, PUR, PPC, KNT, DYF, SUB, STR (stock), DLV, QCL, MIS, AUT |
| **Live, in the book** | Changes how money is recorded. Rehearsed on a pulled copy, held to the book check | BIL (payer per bill, bill from challans, credit and debit notes), COM (PI, LC), ACC Money Receipt (AIT, bank charges, exchange difference) |
| **Shadow** | Runs on real data and is shown beside the book; never replaces it | ACC Ledger (double entry derived from the book), STR Valuation |
| **Lab** | A copy of the book or sample data, on its own deployment | VAT, CMP, PRT, AIA |
| **Already here** | No change | HRM |
| **Full ERP only** | Architecture with nothing to see | SYS client catalog and licenses, INT public API and webhooks |

The shadow ledger follows the precedent of the trading summary in CLAUDE.md
section 7: a view over figures already in the book, not a second book.

## The shape every new table follows

Built in the full ERP's domain model, so the data and the test cases move
across without translation:

1. **The order line is the unit.** Every new row about work points at a
   `sales_order_line`.
2. **One movement ledger.** Every handover is one `movement` with lines: from,
   to, owner (LUMA or the customer, for fabric in custody), item form (yarn,
   grey, finished), lot, rolls, our weight, their weight, which governs. Stock,
   what each subcontractor holds, and the delivery position are computed from
   it on read and never stored (rule 2).
3. **Process steps are generic.** Knitting, dyeing, finishing, peach, brush,
   printing are rows in `process_type`. A route is steps on an order line, each
   naming its process and who performs it. A new process is a row, not a table.
4. **Settings that change carry a date.** Rate cards and loss norms have
   `valid_from` and are read as at the document's date. A document copies what
   it used, the way a payroll line copies the salary structure.
5. **New modules read the book and do not write it,** except the changes marked
   Live, in the book, which pass the book check before release.
6. **Expand in one release, contract in a later one** (rule 15).
7. **Each module can be switched on per role** (`module_switch`): off, owner
   only, or everyone. A module is tried by the owner and the champion users
   before staff see it, and the rail lists only what is switched on for the
   person signed in, so nobody is offered a screen that opens onto nothing.

## Waves

Each wave is a branch, a preview on its own Neon branch, CI, a rehearsal on a
pulled copy of production (`pnpm db:pull`, then `pnpm db:setup`, which now runs
the book check), and a release. Staff use it for about two weeks before the
next wave, because a wave nobody uses produces no real cases.

| Wave | Modules | New or changed tables | Place |
| --- | --- | --- | --- |
| **0. Safety net** | | Book check in `db:setup` and the deploy (**done**). Golden test from the July bill book export. `module_switch`. The lab deployment | |
| **1. Orders and setup** | Fabric sales phase 1 released; LIB | `process_type`; on `sales_order_line`: fabric type, composition, GSM, dia, open or tube, part; `rate_card` and `loss_norm` with `valid_from`; `route_template` and its steps | Live |
| **2. Money in the book** | ACC Money Receipt, BIL payer per bill, COM | On `payment`: AIT, bank charges, exchange difference, dollar amount; payer per bill; `proforma_invoice`, `lc`, LC to bills | In the book |
| **3. Movement** | DLV, STR, SUB, KNT, DYF, PPC | `route_step` on each order line, linked to the WO line that programs it; `movement` and `movement_line`; a `store` role for field staff; a challan screen for a phone | Live |
| **4. Merchandising and quality** | MER, QCL, MIS, AUT | Sample order linked to its bulk; `lab_dip`; TNA dates per line; `rejection` with its fault, which adds a reprocess step; `inspection`; order tracker and alert lists | Live |
| **5. Bills from work** | BIL, SUB bill check, MER pre-cost, MIS daily pulse, STR stock lots | `bill_line` to the movement line it bills; credit and debit notes; pre-cost per line; leftover released to LUMA's stock as a movement | In the book, and Live |
| **6. Shadow ledger** | ACC Ledger, STR Valuation | Chart of accounts and a posting map; the journal derived on read from the book; trial balance, profit and loss, balance sheet; stock valued at cost | Shadow |
| **Lab** | VAT, CMP, PRT, AIA | Whatever each needs, on the lab deployment only | Lab |

## What is open

| Question | Where it is decided |
| --- | --- |
| How LC receipts are keyed today, since they settle less taka than the bill | Full ERP register D112. Wave 2 depends on it |
| Who pays when a bill's payer is not the order's buyer | D96 |
| AIT and exchange difference accounts | D93, D94, with the accountant |
| Leftover value | D88 |
| The chart of accounts the shadow ledger posts to | D22 |

A question raised by a wave goes into the full ERP's register, not into this
file, so it is answered once for both systems.
