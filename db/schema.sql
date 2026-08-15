-- Interim Billing schema (Neon Postgres).
-- Idempotent: safe to run again after a change.
--
-- Money is NUMERIC(14,2) everywhere, read into the Money type (exact poisha)
-- before any arithmetic happens. Weight is NUMERIC(12,3) kg.
--
-- Sign convention: one, everywhere. A positive balance is receivable, money the
-- party owes us; a negative balance is payable, money we owe them. Debit and
-- Credit follow the sign, and nothing is stated "in the party's own direction".
--
-- That single convention is what lets one party hold more than one role. A dye
-- house that processes fabric for us and also sells us fabric is one party with
-- one balance, not two records nobody can add together, so the direction of a
-- bill or a payment belongs to that document and not to the party.

CREATE TABLE IF NOT EXISTS party (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- The human-readable key a party is known by: CUS-0001, SUB-0001. Assigned by
  -- the system and editable, because a business that already codes its parties
  -- will want its own scheme. Two customers with near-identical names are told
  -- apart by this, and it survives the migration into the full ERP where a uuid
  -- would mean nothing to anyone.
  code            text,
  name            text NOT NULL,
  -- Roles, not a type. The same company can send us fabric to dye and sell us
  -- yarn, and that is one party wearing two hats rather than two parties.
  is_customer      boolean NOT NULL DEFAULT false,
  is_subcontractor boolean NOT NULL DEFAULT false,
  is_supplier      boolean NOT NULL DEFAULT false,
  contact_person  text,
  phone           text,
  address         text,
  opening_balance numeric(14, 2) NOT NULL DEFAULT 0,
  opening_as_of   date,
  active          boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- One company, one party record, whatever roles it holds.
CREATE UNIQUE INDEX IF NOT EXISTS party_name_key ON party (lower(name));

-- Customer bills carry two numbers, and both matter.
--
-- LUMA still writes every bill by hand from a serial-numbered bill book and
-- sends that paper to the customer, so the hand-written number (bill_no, with
-- the book it came from) is what the customer recognizes and what a statement
-- quotes. Alongside it the system issues its own gapless series in doc_no. The
-- counter is bumped inside the same transaction as the insert, so two people
-- billing at the same moment queue on the row lock and the series has no gaps
-- and no duplicates. A bill series with holes in it is the kind of thing an
-- auditor asks about, which is why this is a counter row and not a sequence.
--
-- A subcontractor bill has no system number: their own paper number is its
-- identity, so doc_no stays null on that side.
CREATE TABLE IF NOT EXISTS counter (
  name  text PRIMARY KEY,
  value bigint NOT NULL DEFAULT 0
);

INSERT INTO counter (name, value) VALUES ('customer_bill', 0)
  ON CONFLICT (name) DO NOTHING;

CREATE TABLE IF NOT EXISTS bill (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  party_id    uuid NOT NULL REFERENCES party (id),
  -- Which way the money runs. 'issued' is a bill we raised on a customer and is
  -- receivable; 'received' is a bill a subcontractor or supplier raised on us
  -- and is payable. The party does not decide this, the document does.
  direction   text NOT NULL DEFAULT 'issued'
              CONSTRAINT bill_direction_check
              CHECK (direction IN ('issued', 'received')),
  -- The hand-written number: LUMA's own bill book on the customer side, the
  -- subcontractor's paper bill on the other. On the customer side it is unique
  -- across every customer bill. It used to be unique only within its book_no,
  -- which is gone: see the migration at the end for why.
  bill_no     text NOT NULL,
  -- The system's own gapless series, 'CB-26-0001'. Null on a bill received, and
  -- null on a draft: a draft that was abandoned must not leave a hole in the
  -- series, so the number is issued when the bill is posted and not before.
  doc_no      text,
  -- A draft is entered but not yet part of the book: it is left out of every
  -- balance and off every statement until it is posted. Posted is the default,
  -- because a bill keyed straight from the paper book is real on arrival.
  status      text NOT NULL DEFAULT 'posted'
              CONSTRAINT bill_status_check
              CHECK (status IN ('draft', 'posted')),
  bill_date   date NOT NULL,
  -- What the work was. LUMA mainly dyes and finishes fabric a customer sends,
  -- but also knits, and sometimes supplies finished fabric from yarn, and the
  -- ledger and the bill both need to say which of those a given bill is for.
  -- Named for how a bill in this trade words it, and deliberately not "process",
  -- which in the full ERP means a per-line add-on charge (Enzyme, Compacting).
  nature_of_work text NOT NULL DEFAULT 'dyeing_finishing'
                CONSTRAINT bill_nature_of_work_check CHECK (nature_of_work IN
                  ('dyeing_finishing', 'knitting', 'knitting_dyeing_finishing',
                   'full_package', 'other')),
  -- What the ledger prints in Particulars for this bill. Blank means the ledger
  -- composes it from the bill and its lines, which is the normal case. It is a
  -- control and not a note, which is why it survived the merge that folded the
  -- old reference column into notes.
  narration   text,
  -- Free text about the bill. Prints on the document under Remarks, which is
  -- what the screen calls it too.
  notes       text,
  total       numeric(14, 2) NOT NULL CHECK (total >= 0),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS bill_party_no_key ON bill (party_id, bill_no);
CREATE INDEX IF NOT EXISTS bill_party_date_idx ON bill (party_id, bill_date);
-- The unique index on doc_no is created in the migrations section at the end,
-- because on an existing database the column does not exist until it runs.

-- One line per lot billed. grey_kg is what the money is calculated on, the same
-- basis the full ERP bills on; finished_kg is recorded from the paper bill so
-- process loss stays visible even though this app does not compute it.
CREATE TABLE IF NOT EXISTS bill_line (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bill_id     uuid NOT NULL REFERENCES bill (id) ON DELETE CASCADE,
  line_no     integer NOT NULL,
  -- What the line is, in trade terms: S/J, 1x1 Rib, Fleece (2x1) LY, F/Terry.
  -- There used to be a separate fabric_type column beside this one, and the
  -- book was keyed the wrong way round into the pair: the description held the
  -- lot ("Lot - 5903") and the fabric type held the actual description. The
  -- migration at the end of this file puts each where it belongs and drops the
  -- column.
  description text NOT NULL,
  color       text,
  -- Hand-written challan serial and the customer's own order number.
  challan_no  text,
  order_no    text,
  -- The dye lot the line was run as, written on the challan and on the bill.
  -- Free text, like the challan and order beside it: this app records the
  -- number the paper carries and does not keep a table of lots.
  lot_no      text,
  grey_kg     numeric(12, 3) NOT NULL CHECK (grey_kg > 0),
  finished_kg numeric(12, 3) CHECK (finished_kg > 0),
  -- Six decimals, where money is two. A bill keyed from the bill book often
  -- records a weight and an amount but no rate, so the rate is worked back out
  -- of them; rounded to the poisha it stops reproducing the amount the party
  -- was shown. The amount below is still exact poisha.
  rate        numeric(12, 6) NOT NULL CHECK (rate >= 0),
  amount      numeric(14, 2) NOT NULL CHECK (amount >= 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS bill_line_no_key ON bill_line (bill_id, line_no);

-- One table for both directions. Against a customer it is money received
-- (a money receipt). Against a subcontractor it is money paid.
CREATE TABLE IF NOT EXISTS payment (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  party_id    uuid NOT NULL REFERENCES party (id),
  -- 'in' is money received against a receivable; 'out' is money paid against a
  -- payable.
  direction   text NOT NULL DEFAULT 'in'
              CONSTRAINT payment_direction_check
              CHECK (direction IN ('in', 'out')),
  paid_on     date NOT NULL,
  amount      numeric(14, 2) NOT NULL CHECK (amount > 0),
  -- The methods the full ERP records, so a payment exports without translation.
  mode        text NOT NULL CONSTRAINT payment_mode_check CHECK (mode IN
                ('cash', 'mobile_banking', 'bank_transfer', 'cheque', 'rtgs',
                 'lc', 'other')),
  -- Money receipt serial, cheque number, LC reference, or bank reference.
  reference   text,
  -- Overrides the composed Particulars on the ledger, as above.
  narration   text,
  notes       text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS payment_party_date_idx ON payment (party_id, paid_on);

-- Money going out that is not a party settlement -----------------------------
--
-- Expenses and payroll are recorded on a cash basis: a row exists because money
-- moved, not because a cost was incurred. There is no chart of accounts and no
-- journal here, which is the line that keeps this app a stopgap rather than the
-- ERP. See CLAUDE.md section 7.

-- An employee is not a party. Payroll never touches a party balance or a
-- customer statement, so the two share the money engine and nothing else.
--
-- This row is both the personnel file and the salary structure, which is set
-- once and edited when it changes. It carries no history of its own: a payroll
-- line copies the whole structure when the month is generated, so a raise in
-- September cannot restate the August payslip. That snapshot is what lets the
-- structure be one editable row instead of an effective-dated table nobody in a
-- business this size wants to maintain.
CREATE TABLE IF NOT EXISTS employee (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- EMP-0001, the same idea as a party code: what a person calls the record.
  code           text,
  name           text NOT NULL,
  designation    text,
  phone          text,
  nid            text,
  address        text,
  joined_on      date,
  active         boolean NOT NULL DEFAULT true,

  -- The salary structure. Gross is the sum and is generated by the database
  -- rather than written by the app, so it can never drift from its parts. That
  -- is a definition, not a stored balance, and the rule against caching totals
  -- is untouched by it.
  basic            numeric(14, 2) NOT NULL DEFAULT 0 CHECK (basic >= 0),
  house_rent       numeric(14, 2) NOT NULL DEFAULT 0 CHECK (house_rent >= 0),
  medical          numeric(14, 2) NOT NULL DEFAULT 0 CHECK (medical >= 0),
  conveyance       numeric(14, 2) NOT NULL DEFAULT 0 CHECK (conveyance >= 0),
  mobile_allowance numeric(14, 2) NOT NULL DEFAULT 0 CHECK (mobile_allowance >= 0),
  other_allowance  numeric(14, 2) NOT NULL DEFAULT 0 CHECK (other_allowance >= 0),
  gross            numeric(14, 2) GENERATED ALWAYS AS
                     (basic + house_rent + medical + conveyance
                      + mobile_allowance + other_allowance) STORED,

  -- How this employee is paid, so Accounts does not have to ask.
  payment_method text NOT NULL DEFAULT 'cash'
                 CONSTRAINT employee_payment_method_check
                 CHECK (payment_method IN ('cash', 'bank', 'mfs')),
  bank_name      text,
  account_no     text,
  mfs_number     text,

  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS employee_name_key ON employee (lower(name));
CREATE UNIQUE INDEX IF NOT EXISTS employee_code_key
  ON employee (lower(code)) WHERE code IS NOT NULL;

-- An operating expense paid out: rent, utilities, transport, office. The payee
-- is free text rather than a party, because most of these are paid to someone
-- the business does not otherwise trade with and does not want in its ledger.
CREATE TABLE IF NOT EXISTS expense (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Gapless voucher series, 'EXP-26-0001', from the counter bumped inside the
  -- same transaction as the insert. Same reasoning as a bill: an expense
  -- voucher book with holes in it is what an auditor asks about.
  doc_no      text,
  spent_on    date NOT NULL,
  -- The category carries the cost tier with it: see EXPENSE_CATEGORIES in
  -- src/lib/types.ts, which is the one place the mapping lives. The first four
  -- are cost of sales, commission is selling cost, the rest are overhead.
  category    text NOT NULL CONSTRAINT expense_category_check CHECK (category IN
                ('freight_inward', 'freight_outward', 'lab_test',
                 'direct_other', 'commission',
                 'rent', 'utilities', 'salary_related', 'transport', 'repairs',
                 'office', 'entertainment', 'government_fees', 'bank_charges',
                 'other')),
  payee       text,
  description text NOT NULL,
  amount      numeric(14, 2) NOT NULL CHECK (amount > 0),
  mode        text NOT NULL CONSTRAINT expense_mode_check CHECK (mode IN
                ('cash', 'mobile_banking', 'bank_transfer', 'cheque', 'rtgs',
                 'lc', 'other')),
  reference   text,
  -- The order this cost belongs to, the same free text reference bill_line
  -- already carries. It is what lets one order be costed end to end. Null is
  -- ordinary and means the cost is not attributable to a single order.
  order_no    text,
  notes       text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS expense_date_idx ON expense (spent_on);
-- The index on order_no is created in the migrations section at the end, for
-- the same reason bill.doc_no is: on a database that already has this table,
-- CREATE TABLE IF NOT EXISTS does nothing and the column does not exist until
-- the migration adds it.
CREATE INDEX IF NOT EXISTS expense_category_idx ON expense (category, spent_on);

-- Money handed to an employee before payday, recovered from a later salary.
-- What is still outstanding is computed on read, never stored: advances paid
-- less what salary rows have recovered.
CREATE TABLE IF NOT EXISTS advance (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  doc_no      text,
  employee_id uuid NOT NULL REFERENCES employee (id),
  paid_on     date NOT NULL,
  amount      numeric(14, 2) NOT NULL CHECK (amount > 0),
  mode        text NOT NULL CONSTRAINT advance_mode_check CHECK (mode IN
                ('cash', 'mobile_banking', 'bank_transfer', 'cheque', 'rtgs',
                 'lc', 'other')),
  reference   text,
  notes       text,

  -- How this advance was agreed to come back, settled at the moment the cash is
  -- handed over rather than re-decided every month. That is what makes payroll
  -- able to fill the deduction in on its own.
  --
  -- 'manual' recovers nothing automatically: somebody keys a figure on the
  -- payroll line when they choose to. 'full' takes the whole outstanding from
  -- the next run. 'installment' takes installment_amount a month until it is
  -- cleared, and the last one is the remainder rather than an overshoot.
  --
  -- There is deliberately no 'partial' mode. A partial recovery is a decision
  -- taken in one particular month, not an agreement, so it belongs on that
  -- month's payroll line: every mode below stays overridable in the grid.
  recovery_mode      text NOT NULL DEFAULT 'manual'
                     CONSTRAINT advance_recovery_mode_check
                     CHECK (recovery_mode IN ('manual', 'full', 'installment')),
  installment_amount numeric(14, 2) CHECK (installment_amount > 0),
  -- The first month it may be taken from, 'YYYY-MM'. Text for the same reason
  -- every other date here is text. Null means from the next run onwards.
  recover_from       text CONSTRAINT advance_recover_from_check
                     CHECK (recover_from ~ '^\d{4}-\d{2}$'),

  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),

  -- An installment with no figure on it would recover nothing while looking as
  -- though it were scheduled, which is the worst of both.
  CONSTRAINT advance_installment_check
    CHECK (recovery_mode <> 'installment' OR installment_amount IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS advance_employee_date_idx ON advance (employee_id, paid_on);

-- Payroll is run a month at a time, not an employee at a time.
--
-- Generating a month writes one line per active employee, seeded from that
-- employee's salary structure. HR then keys only what varies: unpaid absence,
-- bonus, an advance being taken back, an extra allowance, any other deduction.
-- Every figure that can be worked out is worked out on the server.
--
-- The run carries a status, and that status is the whole point: figures freeze
-- on approval and lock on payment, so a paid month cannot quietly change.
-- Read what the status can and cannot promise in CLAUDE.md section 7: with one
-- shared login it is discipline and a record, not access control.
CREATE TABLE IF NOT EXISTS payroll_run (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Gapless series, 'PR-26-0001', from the counter bumped in the same
  -- transaction as the insert, the same rule a bill number follows.
  doc_no        text,
  -- The month being paid, as 'YYYY-MM'. Text end to end for the same reason a
  -- date is text: a month built as a JS Date shifts against Asia/Dhaka.
  period        text NOT NULL
                CONSTRAINT payroll_run_period_check CHECK (period ~ '^\d{4}-\d{2}$'),
  status        text NOT NULL DEFAULT 'draft'
                CONSTRAINT payroll_run_status_check
                CHECK (status IN ('draft', 'approved', 'paid')),
  -- One policy for the month rather than per employee. The full ERP has the
  -- choice open as D70; divide by 30 is the Bangladesh norm for monthly rated
  -- staff, because the salary already covers the weekly holiday.
  per_day_basis text NOT NULL DEFAULT 'thirty'
                CONSTRAINT payroll_run_basis_check
                CHECK (per_day_basis IN ('thirty', 'twenty_six', 'actual')),
  -- Whether this month takes advances back at all. Off is a real month, not an
  -- oversight: an advance is normally left alone in the month the festival
  -- bonus is paid. Stored on the run so the payslip can be explained later.
  recover_advances boolean NOT NULL DEFAULT true,
  notes         text,
  -- Who approved and who paid, taken from the signed-in account rather than
  -- typed. Since named users arrived (2026-08-14) this is authentication and
  -- not just attribution: only an Owner reaches these two steps. The name is
  -- copied at the step and prints on the payslip, and the user id is kept
  -- beside it so the account can still be found after a rename, on the same
  -- reasoning as activity_log.
  approved_by         text,
  approved_by_user_id text,
  approved_at   timestamptz,
  paid_by             text,
  paid_by_user_id     text,
  paid_at       timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- One run per month, enforced by the database rather than by a check in the
-- app, so a second Generate cannot race the first.
CREATE UNIQUE INDEX IF NOT EXISTS payroll_run_period_key ON payroll_run (period);

-- One employee's pay for one month.
--
-- The salary components are copied here at Generate, not joined from the
-- employee. That is deliberate: the employee row holds only the current
-- structure, so without the copy a raise would restate every payslip already
-- handed out. The designation is copied for the same reason, because it prints
-- on the payslip and people change roles.
CREATE TABLE IF NOT EXISTS payroll_line (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id      uuid NOT NULL REFERENCES payroll_run (id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES employee (id),

  -- Snapshot of the structure, as it stood when the month was generated.
  basic            numeric(14, 2) NOT NULL DEFAULT 0 CHECK (basic >= 0),
  house_rent       numeric(14, 2) NOT NULL DEFAULT 0 CHECK (house_rent >= 0),
  medical          numeric(14, 2) NOT NULL DEFAULT 0 CHECK (medical >= 0),
  conveyance       numeric(14, 2) NOT NULL DEFAULT 0 CHECK (conveyance >= 0),
  mobile_allowance numeric(14, 2) NOT NULL DEFAULT 0 CHECK (mobile_allowance >= 0),
  other_allowance  numeric(14, 2) NOT NULL DEFAULT 0 CHECK (other_allowance >= 0),
  gross            numeric(14, 2) NOT NULL CHECK (gross >= 0),
  designation      text,

  -- What HR keys. Days absent are in tenths so a half day is expressible, and
  -- this is leave without pay only: casual, sick, earned and festival leave are
  -- paid under the Labour Act, which is why the screen says Unpaid Absence.
  absent_days          numeric(4, 1) NOT NULL DEFAULT 0 CHECK (absent_days >= 0),
  bonus                numeric(14, 2) NOT NULL DEFAULT 0 CHECK (bonus >= 0),
  additional_allowance numeric(14, 2) NOT NULL DEFAULT 0 CHECK (additional_allowance >= 0),
  advance_deduction    numeric(14, 2) NOT NULL DEFAULT 0 CHECK (advance_deduction >= 0),
  other_deduction      numeric(14, 2) NOT NULL DEFAULT 0 CHECK (other_deduction >= 0),
  remarks              text,

  -- Worked out on the server from the days and the run's basis, then stored,
  -- because it is a line on the payslip the employee was handed.
  absence_deduction numeric(14, 2) NOT NULL DEFAULT 0 CHECK (absence_deduction >= 0),
  net_paid          numeric(14, 2) NOT NULL CHECK (net_paid >= 0),

  -- Set as Accounts works down the list marking each one paid.
  paid_on     date,

  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),

  -- The last line of defense on the formula. The app computes the net and the
  -- database refuses to hold one that does not add up.
  CONSTRAINT payroll_line_net_check CHECK (
    net_paid = gross - absence_deduction - advance_deduction - other_deduction
               + bonus + additional_allowance)
);

CREATE UNIQUE INDEX IF NOT EXISTS payroll_line_run_employee_key
  ON payroll_line (run_id, employee_id);
CREATE INDEX IF NOT EXISTS payroll_line_employee_idx ON payroll_line (employee_id);

-- Leave, kept on purpose away from payroll.
--
-- Nothing here feeds a deduction. Casual, sick and earned leave are paid, so
-- recording them must never move money; HR decides the unpaid absence figure
-- for the month and keys that on the payroll line instead. Wiring the two
-- together is how a paid sick day silently becomes an unpaid one.
CREATE TABLE IF NOT EXISTS leave_record (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES employee (id),
  leave_type  text NOT NULL CONSTRAINT leave_record_type_check
              CHECK (leave_type IN ('casual', 'sick', 'earned')),
  from_date   date NOT NULL,
  to_date     date NOT NULL,
  days        numeric(4, 1) NOT NULL CHECK (days > 0),
  reason      text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT leave_record_range_check CHECK (to_date >= from_date)
);

CREATE INDEX IF NOT EXISTS leave_record_employee_idx
  ON leave_record (employee_id, from_date);

-- Money a member of staff spent and is owed back.
--
-- Separate from the expense table, which is money the company has already
-- spent, and separate from payroll, because a reimbursement is not pay and must
-- not land on a payslip or in a salary total.
CREATE TABLE IF NOT EXISTS expense_claim (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  doc_no        text,
  employee_id   uuid NOT NULL REFERENCES employee (id),
  claimed_on    date NOT NULL,
  category      text NOT NULL CONSTRAINT expense_claim_category_check
                CHECK (category IN ('transport', 'courier', 'fuel', 'parking', 'other')),
  description   text NOT NULL,
  amount        numeric(14, 2) NOT NULL CHECK (amount > 0),
  status        text NOT NULL DEFAULT 'submitted'
                CONSTRAINT expense_claim_status_check
                CHECK (status IN ('submitted', 'reimbursed')),
  reimbursed_on date,
  mode          text CONSTRAINT expense_claim_mode_check CHECK (mode IN
                  ('cash', 'mobile_banking', 'bank_transfer', 'cheque', 'rtgs',
                   'lc', 'other')),
  reference     text,
  order_no      text,
  notes         text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  -- Reimbursed means the money moved, so it carries a date and a method.
  CONSTRAINT expense_claim_reimbursed_check CHECK (
    status = 'submitted' OR (reimbursed_on IS NOT NULL AND mode IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS expense_claim_employee_idx
  ON expense_claim (employee_id, claimed_on);
CREATE UNIQUE INDEX IF NOT EXISTS expense_claim_doc_no_key
  ON expense_claim (doc_no) WHERE doc_no IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS payroll_run_doc_no_key
  ON payroll_run (doc_no) WHERE doc_no IS NOT NULL;

INSERT INTO counter (name, value)
  VALUES ('expense', 0), ('advance', 0), ('payroll_run', 0), ('expense_claim', 0)
  ON CONFLICT (name) DO NOTHING;

-- Append-only record of every write: what changed, when, and who did it.
-- Nothing in the app updates or deletes a row here.
--
-- The actor is recorded twice on purpose. actor_user_id points at the account
-- and is set null if that account is ever removed, because a log row must
-- outlive the user it names. actor_name is the name copied at the time of the
-- write, so a log read back in a year still says who did it even after somebody
-- is renamed or deleted. The id is for joining; the name is the record.
CREATE TABLE IF NOT EXISTS activity_log (
  id            bigserial PRIMARY KEY,
  at            timestamptz NOT NULL DEFAULT now(),
  action        text NOT NULL CHECK (action IN ('create', 'update', 'delete')),
  entity        text NOT NULL,
  entity_id     text NOT NULL,
  summary       text NOT NULL,
  reason        text,
  actor_user_id text,
  actor_name    text,
  before_json   jsonb,
  after_json    jsonb
);

CREATE INDEX IF NOT EXISTS activity_log_at_idx ON activity_log (at DESC);

-- Users, sessions and credentials -------------------------------------------
--
-- Named accounts replaced the single shared password on 2026-08-14. These four
-- tables are Better Auth's, and they are written here by hand rather than by
-- its CLI because this file is the whole schema and stays readable on its own.
-- The column names match the full ERP's Prisma @map names exactly, so the two
-- apps hold the same shape and an account exports across with the book. The
-- mapping between these columns and Better Auth's camelCase fields lives in
-- src/lib/auth.ts, and the two have to be changed together.
--
-- Ids are text, not uuid: Better Auth generates them itself.

CREATE TABLE IF NOT EXISTS users (
  id             text PRIMARY KEY,
  name           text NOT NULL,
  email          text NOT NULL UNIQUE,
  email_verified boolean NOT NULL DEFAULT false,
  image          text,
  -- Authorization is the server's, so it is stored here and never accepted
  -- from a browser. src/lib/permissions.ts holds what each role may do.
  role           text NOT NULL DEFAULT 'viewer'
                   CHECK (role IN ('owner', 'accounts', 'viewer')),
  -- An account is disabled, never deleted, for the same reason a party is:
  -- its activity log rows and payroll approvals have to keep their name.
  status         text NOT NULL DEFAULT 'active'
                   CHECK (status IN ('active', 'disabled')),
  -- Stamped whenever a session is created, in the databaseHooks in
  -- src/lib/auth.ts. Null means the account has never been used, which is a
  -- different thing from a dormant one and reads differently on the screen.
  last_signed_in_at timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS users_role_idx ON users (role);

CREATE TABLE IF NOT EXISTS sessions (
  id         text PRIMARY KEY,
  user_id    text NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  token      text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  ip_address text,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sessions_user_id_idx ON sessions (user_id);

-- The credential row. `password` holds the hash Better Auth produced, never a
-- password. The name matches the ERP, which renames it away from its ledger
-- Account; there is no such collision here but the two schemas stay identical.
CREATE TABLE IF NOT EXISTS auth_accounts (
  id                        text PRIMARY KEY,
  user_id                   text NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  account_id                text NOT NULL,
  provider_id               text NOT NULL,
  access_token              text,
  refresh_token             text,
  access_token_expires_at   timestamptz,
  refresh_token_expires_at  timestamptz,
  scope                     text,
  id_token                  text,
  password                  text,
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS auth_accounts_user_id_idx ON auth_accounts (user_id);

CREATE TABLE IF NOT EXISTS verifications (
  id         text PRIMARY KEY,
  identifier text NOT NULL,
  value      text NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS verifications_identifier_idx
  ON verifications (identifier);

-- Migrations -----------------------------------------------------------------
--
-- The definitions above are the current shape, which is all a new database
-- needs. What follows brings an existing one up to it. Every statement is safe
-- to run again, so this file stays one idempotent script.

-- Roles and directions (2026-07-31), replacing the immutable party type.
--
-- The whole block is guarded on the old column still existing, so it runs once
-- and re-running the file afterwards does nothing. The opening balance flip in
-- particular must never run twice: it restates a subcontractor's opening from
-- "positive means we owe them" into the single convention where a payable is
-- negative, and doing that a second time would silently reverse every one.
ALTER TABLE party ADD COLUMN IF NOT EXISTS is_customer boolean NOT NULL DEFAULT false;
ALTER TABLE party ADD COLUMN IF NOT EXISTS is_subcontractor boolean NOT NULL DEFAULT false;
ALTER TABLE party ADD COLUMN IF NOT EXISTS is_supplier boolean NOT NULL DEFAULT false;
ALTER TABLE bill ADD COLUMN IF NOT EXISTS direction text;
ALTER TABLE payment ADD COLUMN IF NOT EXISTS direction text;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = 'party' AND column_name = 'type'
  ) THEN
    UPDATE party SET
      is_customer = (type = 'customer'),
      is_subcontractor = (type = 'subcontractor');

    UPDATE bill b SET direction =
      CASE WHEN p.type = 'customer' THEN 'issued' ELSE 'received' END
      FROM party p WHERE p.id = b.party_id;

    UPDATE payment pay SET direction =
      CASE WHEN p.type = 'customer' THEN 'in' ELSE 'out' END
      FROM party p WHERE p.id = pay.party_id;

    -- A subcontractor's opening balance was stated as "positive means we owe
    -- them". Under one convention a payable is negative.
    UPDATE party SET opening_balance = -opening_balance
      WHERE type <> 'customer' AND opening_balance <> 0;

    DROP INDEX IF EXISTS party_name_type_key;
    ALTER TABLE party DROP COLUMN type;
  END IF;
END
$$;

-- Anything still without a direction is a row created before the column
-- existed on a database that never had the type column, which means a fresh
-- one; the table defaults cover it, and these make the columns final.
UPDATE bill SET direction = 'issued' WHERE direction IS NULL;
UPDATE payment SET direction = 'in' WHERE direction IS NULL;
ALTER TABLE bill ALTER COLUMN direction SET NOT NULL;
ALTER TABLE payment ALTER COLUMN direction SET NOT NULL;
ALTER TABLE bill DROP CONSTRAINT IF EXISTS bill_direction_check;
ALTER TABLE bill ADD CONSTRAINT bill_direction_check
  CHECK (direction IN ('issued', 'received'));
ALTER TABLE payment DROP CONSTRAINT IF EXISTS payment_direction_check;
ALTER TABLE payment ADD CONSTRAINT payment_direction_check
  CHECK (direction IN ('in', 'out'));

-- A party with no role at all can never be billed or paid, so it is not a party.
ALTER TABLE party DROP CONSTRAINT IF EXISTS party_has_a_role_check;
ALTER TABLE party ADD CONSTRAINT party_has_a_role_check
  CHECK (is_customer OR is_subcontractor OR is_supplier);

CREATE UNIQUE INDEX IF NOT EXISTS party_name_key ON party (lower(name));

-- Hand-written bill numbers and the bill book (2026-07-30). A customer bill
-- entered before this carried the system number in bill_no; it moves to doc_no
-- and stays in bill_no too, because the hand-written number it should hold is
-- not something the database can know. Re-enter it on those bills.
ALTER TABLE bill ADD COLUMN IF NOT EXISTS book_no text;
ALTER TABLE bill ADD COLUMN IF NOT EXISTS doc_no text;
UPDATE bill SET doc_no = bill_no WHERE doc_no IS NULL AND bill_no LIKE 'CB-%';
CREATE UNIQUE INDEX IF NOT EXISTS bill_doc_no_key ON bill (doc_no)
  WHERE doc_no IS NOT NULL;

-- Grey and finished weight per line, and the challan and order it belongs to
-- (2026-07-30). qty_kg was always the grey weight; the name now says so.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = 'bill_line' AND column_name = 'qty_kg'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = 'bill_line' AND column_name = 'grey_kg'
  ) THEN
    ALTER TABLE bill_line RENAME COLUMN qty_kg TO grey_kg;
  END IF;
END
$$;

ALTER TABLE bill_line ADD COLUMN IF NOT EXISTS challan_no text;
ALTER TABLE bill_line ADD COLUMN IF NOT EXISTS order_no text;
ALTER TABLE bill_line ADD COLUMN IF NOT EXISTS finished_kg numeric(12, 3)
  CHECK (finished_kg > 0);

-- Fabric type and color per line (2026-07-30), so the bill reads the way a
-- dyeing bill in this trade reads. Both are nullable: this app records what the
-- paper bill says, and a hand-written line does not always carry either.
ALTER TABLE bill_line ADD COLUMN IF NOT EXISTS fabric_type text;
ALTER TABLE bill_line ADD COLUMN IF NOT EXISTS color text;

-- The full set of payment methods (2026-07-30), widened from cash, cheque and
-- bank transfer to what the ERP records. Dropping first keeps the pair rerunnable.
ALTER TABLE payment DROP CONSTRAINT IF EXISTS payment_mode_check;
ALTER TABLE payment ADD CONSTRAINT payment_mode_check CHECK (mode IN
  ('cash', 'mobile_banking', 'bank_transfer', 'cheque', 'rtgs', 'lc', 'other'));

-- Draft bills (2026-07-31). Everything already in the book is posted: it was
-- entered from paper that had already been billed.
ALTER TABLE bill ADD COLUMN IF NOT EXISTS status text NOT NULL
  DEFAULT 'posted';
ALTER TABLE bill DROP CONSTRAINT IF EXISTS bill_status_check;
ALTER TABLE bill ADD CONSTRAINT bill_status_check
  CHECK (status IN ('draft', 'posted'));
CREATE INDEX IF NOT EXISTS bill_status_idx ON bill (status);

-- A narration that overrides what the ledger composes (2026-07-31).
ALTER TABLE bill ADD COLUMN IF NOT EXISTS narration text;
ALTER TABLE payment ADD COLUMN IF NOT EXISTS narration text;

-- What the work was, per bill (2026-07-31). Existing bills are dyeing and
-- finishing, which is the bulk of the work and the default. Named service_type
-- when first added the same day; renamed before anyone relied on it.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = 'bill' AND column_name = 'service_type'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = 'bill' AND column_name = 'nature_of_work'
  ) THEN
    ALTER TABLE bill RENAME COLUMN service_type TO nature_of_work;
  END IF;
END
$$;

ALTER TABLE bill ADD COLUMN IF NOT EXISTS nature_of_work text NOT NULL
  DEFAULT 'dyeing_finishing';
ALTER TABLE bill DROP CONSTRAINT IF EXISTS bill_service_type_check;
ALTER TABLE bill DROP CONSTRAINT IF EXISTS bill_nature_of_work_check;
ALTER TABLE bill ADD CONSTRAINT bill_nature_of_work_check
  CHECK (nature_of_work IN
    ('dyeing_finishing', 'knitting', 'knitting_dyeing_finishing',
     'full_package', 'other'));

-- Statements are identified by the party and the period, the way a ledger always
-- has been, so the numbering introduced earlier the same day is withdrawn.
DROP TABLE IF EXISTS statement_issue;
DELETE FROM counter WHERE name = 'statement';

-- Rates to six decimals (2026-08-03), widened from two. Only the precision
-- changes: every rate already stored keeps its value, and the amounts computed
-- from them are untouched. Widening a NUMERIC rewrites nothing, so this is safe
-- to run against a live table and safe to run again.
ALTER TABLE bill_line ALTER COLUMN rate TYPE numeric(12, 6);

-- Party codes (2026-07-31). Existing parties are numbered by the order they were
-- added, per side, and the counters are set past whatever is already in use so
-- the next party added does not collide with a backfilled code.
ALTER TABLE party ADD COLUMN IF NOT EXISTS code text;

INSERT INTO counter (name, value) VALUES ('party_customer', 0), ('party_subcontractor', 0)
  ON CONFLICT (name) DO NOTHING;

WITH numbered AS (
  SELECT id, is_customer,
    row_number() OVER (PARTITION BY is_customer ORDER BY created_at, id) AS seq
  FROM party WHERE code IS NULL
)
UPDATE party p SET code =
  CASE WHEN numbered.is_customer THEN 'CUS-' ELSE 'SUB-' END ||
  lpad(numbered.seq::text, GREATEST(4, length(numbered.seq::text)), '0')
FROM numbered WHERE p.id = numbered.id;

UPDATE counter c SET value = GREATEST(c.value, (
  SELECT COALESCE(MAX(NULLIF(regexp_replace(p.code, '\D', '', 'g'), '')::bigint), 0)
  FROM party p
  WHERE p.is_customer = (c.name = 'party_customer')
    AND p.code ~ '^(CUS|SUB)-\d+$'
))
WHERE c.name IN ('party_customer', 'party_subcontractor');

-- A code the system assigned is re-padded to the current width, so a scheme
-- change does not leave two widths in circulation. Re-running is harmless: a
-- code already at the right width comes out unchanged. A code someone typed by
-- hand in their own scheme does not match the pattern and is left alone.
UPDATE party SET code = split_part(code, '-', 1) || '-' ||
  lpad(
    (split_part(code, '-', 2))::bigint::text,
    GREATEST(4, length((split_part(code, '-', 2))::bigint::text)),
    '0'
  )
WHERE code ~ '^(CUS|SUB)-[0-9]+$';

CREATE UNIQUE INDEX IF NOT EXISTS party_code_key ON party (lower(code))
  WHERE code IS NOT NULL;


-- Expenses and payroll (2026-08-10). New tables, so the definitions above cover
-- an existing database as well as a new one and nothing needs backfilling. Only
-- the employee counter is set here, because it is derived from rows that a
-- fresh database does not have.
--
-- Recorded on a cash basis and deliberately outside the party ledger. The
-- reasoning, and the two limits that keep this app from becoming the ERP, are
-- in CLAUDE.md section 7.
CREATE UNIQUE INDEX IF NOT EXISTS expense_doc_no_key
  ON expense (doc_no) WHERE doc_no IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS advance_doc_no_key
  ON advance (doc_no) WHERE doc_no IS NOT NULL;

INSERT INTO counter (name, value) VALUES ('employee', 0)
  ON CONFLICT (name) DO NOTHING;

-- The employee counter catches up to the highest code already issued, so a
-- database that gained employees before this ran cannot reissue a code.
UPDATE counter c SET value = GREATEST(c.value, (
  SELECT COALESCE(MAX(NULLIF(regexp_replace(e.code, '\D', '', 'g'), '')::bigint), 0)
  FROM employee e WHERE e.code ~ '^EMP-\d+$'
))
WHERE c.name = 'employee';

-- Unpaid absence on a salary (2026-08-10). A salary recorded before this had no
-- absence, so the columns default to zero and the divide by 30 basis, and every
-- existing row satisfies the widened net check unchanged.
--
-- The whole block is now guarded on the salary table still being there, because
-- the reshape further down moves those rows onto payroll_line and drops it. On
-- any database that has already been reshaped this does nothing; on one still
-- holding salary rows it has to run first, since the reshape reads the very
-- columns it adds.
DO $$
BEGIN
  IF to_regclass('salary') IS NULL THEN RETURN; END IF;

  EXECUTE 'ALTER TABLE salary ADD COLUMN IF NOT EXISTS absent_days numeric(4, 1) NOT NULL DEFAULT 0';
  EXECUTE 'ALTER TABLE salary ADD COLUMN IF NOT EXISTS per_day_basis text NOT NULL DEFAULT ''thirty''';
  EXECUTE 'ALTER TABLE salary ADD COLUMN IF NOT EXISTS absence_deduction numeric(14, 2) NOT NULL DEFAULT 0';

  EXECUTE 'ALTER TABLE salary DROP CONSTRAINT IF EXISTS salary_absent_days_check';
  EXECUTE 'ALTER TABLE salary ADD CONSTRAINT salary_absent_days_check CHECK (absent_days >= 0)';

  EXECUTE 'ALTER TABLE salary DROP CONSTRAINT IF EXISTS salary_per_day_basis_check';
  EXECUTE 'ALTER TABLE salary ADD CONSTRAINT salary_per_day_basis_check
    CHECK (per_day_basis IN (''thirty'', ''twenty_six'', ''actual''))';

  EXECUTE 'ALTER TABLE salary DROP CONSTRAINT IF EXISTS salary_absence_deduction_check';
  EXECUTE 'ALTER TABLE salary ADD CONSTRAINT salary_absence_deduction_check CHECK (absence_deduction >= 0)';

  EXECUTE 'ALTER TABLE salary DROP CONSTRAINT IF EXISTS salary_net_check';
  EXECUTE 'ALTER TABLE salary ADD CONSTRAINT salary_net_check
    CHECK (net_paid = gross - absence_deduction - deduction - advance_recovered)';

  EXECUTE 'CREATE UNIQUE INDEX IF NOT EXISTS salary_doc_no_key
    ON salary (doc_no) WHERE doc_no IS NOT NULL';
END $$;

-- HR and payroll reshaped (2026-08-12). The employee row gains the salary
-- structure, and a salary stops being a row of its own and becomes a line on a
-- monthly run. Every statement below is guarded, so this file stays one
-- idempotent script and a database built after today skips all of it.
--
-- The reasoning is in CLAUDE.md section 7. The short version: HR holds the
-- people, payroll works out the money, and a payroll line copies the structure
-- so a later raise cannot restate a payslip already handed out.
--
-- Anything that names the old salary table or the old monthly_salary column
-- runs through EXECUTE inside a DO block. A plain guarded statement is not
-- enough: Postgres resolves table and column names when it parses, so a
-- statement mentioning a table that is already gone fails before its WHERE
-- clause is ever considered.

ALTER TABLE employee ADD COLUMN IF NOT EXISTS nid text;
ALTER TABLE employee ADD COLUMN IF NOT EXISTS address text;
ALTER TABLE employee ADD COLUMN IF NOT EXISTS basic numeric(14, 2) NOT NULL DEFAULT 0;
ALTER TABLE employee ADD COLUMN IF NOT EXISTS house_rent numeric(14, 2) NOT NULL DEFAULT 0;
ALTER TABLE employee ADD COLUMN IF NOT EXISTS medical numeric(14, 2) NOT NULL DEFAULT 0;
ALTER TABLE employee ADD COLUMN IF NOT EXISTS conveyance numeric(14, 2) NOT NULL DEFAULT 0;
ALTER TABLE employee ADD COLUMN IF NOT EXISTS mobile_allowance numeric(14, 2) NOT NULL DEFAULT 0;
ALTER TABLE employee ADD COLUMN IF NOT EXISTS other_allowance numeric(14, 2) NOT NULL DEFAULT 0;
ALTER TABLE employee ADD COLUMN IF NOT EXISTS payment_method text NOT NULL DEFAULT 'cash';
ALTER TABLE employee ADD COLUMN IF NOT EXISTS bank_name text;
ALTER TABLE employee ADD COLUMN IF NOT EXISTS account_no text;
ALTER TABLE employee ADD COLUMN IF NOT EXISTS mfs_number text;

ALTER TABLE employee DROP CONSTRAINT IF EXISTS employee_payment_method_check;
ALTER TABLE employee ADD CONSTRAINT employee_payment_method_check
  CHECK (payment_method IN ('cash', 'bank', 'mfs'));

-- What the employee was engaged at becomes their Basic, because no split into
-- House Rent and the rest is recorded anywhere and inventing one would put
-- figures on a payslip nobody agreed to. Restate the split by hand before the
-- first run: a festival bonus in this trade is often quoted as one Basic, and a
-- Basic standing at the whole gross overstates it.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = current_schema()
               AND table_name = 'employee'
               AND column_name = 'monthly_salary')
  THEN
    EXECUTE 'UPDATE employee SET basic = monthly_salary WHERE basic = 0';
  END IF;
END $$;

-- gross is generated from the parts, so it is added once the parts are right.
ALTER TABLE employee ADD COLUMN IF NOT EXISTS gross numeric(14, 2)
  GENERATED ALWAYS AS (basic + house_rent + medical + conveyance
                       + mobile_allowance + other_allowance) STORED;

ALTER TABLE employee DROP COLUMN IF EXISTS monthly_salary;

-- Advances gain the reason they were given, because a deduction nobody can
-- explain a year later is the thing this module exists to prevent.
ALTER TABLE advance ADD COLUMN IF NOT EXISTS reason text;

-- Every salary already recorded becomes a run and a line.
--
-- One run per month it was paid in, marked paid, because the money moved. The
-- net comes across untouched: the old check was
--   net = gross - absence - deduction - advance_recovered
-- and the new one is that same expression plus bonus and additional allowance,
-- both zero here, so no figure can move. No component split was ever recorded,
-- so the whole gross sits in Basic, exactly as it does on the employee.
DO $$
BEGIN
  IF to_regclass('salary') IS NULL THEN RETURN; END IF;

  EXECUTE $q$
    INSERT INTO payroll_run (doc_no, period, status, per_day_basis,
      approved_by, approved_at, paid_by, paid_at, notes)
    SELECT
      'PR-' || substring(s.period, 3, 2) || '-' ||
        lpad((row_number() OVER (ORDER BY s.period))::text, 4, '0'),
      s.period, 'paid', min(s.per_day_basis),
      'Migrated', min(s.created_at), 'Migrated', min(s.created_at),
      'Carried over from the salary records kept before payroll ran by month.'
    FROM salary s
    GROUP BY s.period
    ON CONFLICT (period) DO NOTHING
  $q$;

  EXECUTE $q$
    INSERT INTO payroll_line (run_id, employee_id, basic, house_rent, medical,
      conveyance, mobile_allowance, other_allowance, gross, designation,
      absent_days, bonus, additional_allowance, advance_deduction,
      other_deduction, absence_deduction, net_paid, paid_on, remarks)
    SELECT r.id, s.employee_id,
      s.gross, 0, 0, 0, 0, 0, s.gross, e.designation,
      s.absent_days, 0, 0, s.advance_recovered, s.deduction,
      s.absence_deduction, s.net_paid, s.paid_on, s.notes
    FROM salary s
    JOIN payroll_run r ON r.period = s.period
    JOIN employee e ON e.id = s.employee_id
    ON CONFLICT (run_id, employee_id) DO NOTHING
  $q$;

  -- The old table goes only once every row it held is provably on a line. If
  -- the counts disagree the DROP is skipped and the table stays, which is the
  -- outcome to want: a migration that half worked leaves its evidence behind.
  IF (SELECT count(*) FROM salary) <= (SELECT count(*) FROM payroll_line) THEN
    DROP TABLE salary;
    DELETE FROM counter WHERE name = 'salary';
  END IF;
END $$;

-- The counter catches up to the highest run number issued, so the next
-- Generate cannot reissue one.
UPDATE counter c SET value = GREATEST(c.value, (
  SELECT COALESCE(MAX(NULLIF(regexp_replace(split_part(r.doc_no, '-', 3),
    '\D', '', 'g'), '')::bigint), 0)
  FROM payroll_run r WHERE r.doc_no ~ '^PR-\d+-\d+$'
))
WHERE c.name = 'payroll_run';

-- Advance recovery agreed on the advance (2026-08-12), so payroll can fill the
-- deduction in instead of somebody keying it for every person every month.
--
-- 'manual' is the default on purpose. Every advance already in the book keeps
-- the behavior it has had, and nothing starts deducting on its own the moment
-- this file is applied. An agreement is something a person enters, one advance
-- at a time, and a migration is not in a position to guess one.
ALTER TABLE advance ADD COLUMN IF NOT EXISTS recovery_mode text
  NOT NULL DEFAULT 'manual';
ALTER TABLE advance ADD COLUMN IF NOT EXISTS installment_amount numeric(14, 2);
ALTER TABLE advance ADD COLUMN IF NOT EXISTS recover_from text;

ALTER TABLE advance DROP CONSTRAINT IF EXISTS advance_recovery_mode_check;
ALTER TABLE advance ADD CONSTRAINT advance_recovery_mode_check
  CHECK (recovery_mode IN ('manual', 'full', 'installment'));
ALTER TABLE advance DROP CONSTRAINT IF EXISTS advance_recover_from_check;
ALTER TABLE advance ADD CONSTRAINT advance_recover_from_check
  CHECK (recover_from ~ '^\d{4}-\d{2}$');
ALTER TABLE advance DROP CONSTRAINT IF EXISTS advance_installment_positive_check;
ALTER TABLE advance ADD CONSTRAINT advance_installment_positive_check
  CHECK (installment_amount > 0);
ALTER TABLE advance DROP CONSTRAINT IF EXISTS advance_installment_check;
ALTER TABLE advance ADD CONSTRAINT advance_installment_check
  CHECK (recovery_mode <> 'installment' OR installment_amount IS NOT NULL);

-- Whether a run recovers advances at all. True matches what every run already
-- generated did, which is to carry whatever figure was keyed by hand.
ALTER TABLE payroll_run ADD COLUMN IF NOT EXISTS recover_advances boolean
  NOT NULL DEFAULT true;

-- Cost tiers and the order reference (2026-08-12), so a profit statement can
-- tell cost of sales from overhead and an order can be costed end to end.
--
-- The category list grows: freight in and out, lab testing and other direct
-- cost are cost of sales, and commission is selling cost. Nothing already
-- recorded is reclassified. In particular every existing 'transport' row stays
-- where it is, because that category used to mean both a truck carrying fabric
-- and somebody's bus fare, and no statement here can tell which a given row
-- was. It now means staff movement only. Re-keying the old rows is a decision
-- for whoever knows what they were, not for this migration.
ALTER TABLE expense DROP CONSTRAINT IF EXISTS expense_category_check;
ALTER TABLE expense ADD CONSTRAINT expense_category_check CHECK (category IN
  ('freight_inward', 'freight_outward', 'lab_test', 'direct_other',
   'commission',
   'rent', 'utilities', 'salary_related', 'transport', 'repairs', 'office',
   'entertainment', 'government_fees', 'bank_charges', 'other'));

ALTER TABLE expense ADD COLUMN IF NOT EXISTS order_no text;
ALTER TABLE expense_claim ADD COLUMN IF NOT EXISTS order_no text;

CREATE INDEX IF NOT EXISTS expense_order_idx ON expense (order_no)
  WHERE order_no IS NOT NULL;

-- Named users (2026-08-14), replacing the one shared password.
--
-- The four auth tables above are plain CREATE TABLE IF NOT EXISTS, so an
-- existing database picks them up by running this file again and nothing here
-- has to create them. What is left is the actor on the rows that record a
-- decision.
--
-- Every row written before this point was written under the shared password,
-- so there is no way to say who wrote it. Those rows keep a null actor, which
-- is the truthful answer. Do not backfill them with a name: a log that guesses
-- is worse than a log that admits it does not know.
ALTER TABLE activity_log ADD COLUMN IF NOT EXISTS actor_user_id text;
ALTER TABLE activity_log ADD COLUMN IF NOT EXISTS actor_name text;

-- The payroll approval already carried a typed name. It keeps it, and gains the
-- account id alongside for runs approved from here on.
ALTER TABLE payroll_run ADD COLUMN IF NOT EXISTS approved_by_user_id text;
ALTER TABLE payroll_run ADD COLUMN IF NOT EXISTS paid_by_user_id text;

-- When each account was last used (2026-08-14). Null on every row that exists
-- when this runs, which is truthful: nothing was recorded before now, and a
-- backfill from created_at would say somebody signed in when they may not have.
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_signed_in_at timestamptz;

-- Finding a record by its number (2026-08-15) --------------------------------
--
-- One search box resolves a bill number, an order reference, a party or a
-- voucher, as the full ERP specifies in D36. Two kinds of matching sit behind
-- it and they want different indexes.
--
-- An identifier is matched exactly and by prefix. A plain btree on the lowered
-- column serves both, because a prefix match is a range scan over it.
--
-- A name is matched on trigram similarity, so a party typed from memory still
-- resolves. That is what pg_trgm is for, and its GIN indexes serve the ILIKE
-- containment searches on the same columns as well, which a btree cannot.
--
-- This is deliberately the whole of the search machinery. A separate search
-- server cannot join the transaction a write happens in, so its index drifts
-- from the book; and at this size Postgres answers a full scan of the register
-- in well under a millisecond, against a network round trip of twenty.
-- Pinned to public, and referenced below as public.gin_trgm_ops. The
-- integration tests run the whole schema inside a throwaway schema with
-- search_path set to it alone, so an unqualified opclass is not resolvable
-- there even though the extension is installed.
--
-- Wrapped because IF NOT EXISTS is not a lock. The two integration suites apply
-- this file at the same moment into two throwaway schemas of one database, and
-- against a database that has never had the extension they race: both see it
-- missing, both create it, and the loser gets a duplicate_object it has no
-- reason to fail on. CI builds a fresh database every run, so that race is the
-- normal case there rather than a rare one.
DO $ensure_pg_trgm$
BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA public;
EXCEPTION
  WHEN duplicate_object OR unique_violation THEN NULL;
END
$ensure_pg_trgm$;

CREATE INDEX IF NOT EXISTS bill_bill_no_lower_idx ON bill (lower(bill_no));
CREATE INDEX IF NOT EXISTS bill_doc_no_lower_idx ON bill (lower(doc_no));
CREATE INDEX IF NOT EXISTS bill_line_order_no_idx ON bill_line (order_no)
  WHERE order_no IS NOT NULL;
CREATE INDEX IF NOT EXISTS expense_order_no_idx ON expense (order_no)
  WHERE order_no IS NOT NULL;
CREATE INDEX IF NOT EXISTS expense_doc_no_lower_idx ON expense (lower(doc_no));
CREATE INDEX IF NOT EXISTS expense_claim_doc_no_lower_idx
  ON expense_claim (lower(doc_no));
CREATE INDEX IF NOT EXISTS advance_doc_no_lower_idx ON advance (lower(doc_no));
CREATE INDEX IF NOT EXISTS payment_reference_lower_idx
  ON payment (lower(reference));

CREATE INDEX IF NOT EXISTS party_name_trgm_idx ON party USING gin (name public.gin_trgm_ops);
CREATE INDEX IF NOT EXISTS party_code_trgm_idx ON party USING gin (code public.gin_trgm_ops);
CREATE INDEX IF NOT EXISTS employee_name_trgm_idx
  ON employee USING gin (name public.gin_trgm_ops);
CREATE INDEX IF NOT EXISTS expense_description_trgm_idx
  ON expense USING gin (description public.gin_trgm_ops);

-- The audit trail is read by entity and by person, not only newest first
-- (2026-08-15). The log is append only and never trimmed: at the rate this
-- book is written it grows by a few megabytes a year, and it is the only
-- record of who changed what and why.
CREATE INDEX IF NOT EXISTS activity_log_entity_idx
  ON activity_log (entity, at DESC);
CREATE INDEX IF NOT EXISTS activity_log_actor_idx
  ON activity_log (actor_user_id, at DESC);


-- Lot number on a bill line, one remarks field, and the end of the bill book
-- (2026-08-15). Three changes that arrived with the bill entry screen being
-- rebuilt.

ALTER TABLE bill_line ADD COLUMN IF NOT EXISTS lot_no text;

-- One free text field instead of three. reference held "anything else worth
-- recording", which is what notes already held, and it was never printed on the
-- document. Fold it in before dropping it so nothing keyed is lost. narration
-- stays: it overrides the ledger's Particulars and is a control, not a note.
-- Guarded, because this file is applied to a fresh database as well as to an
-- existing one, and the table above no longer declares the column. Unguarded,
-- the UPDATE fails on a database that never had it, which is every new one and
-- every throwaway schema the integration tests build.
DO $fold_reference$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = 'bill' AND column_name = 'reference'
  ) THEN
    UPDATE bill
      SET notes = NULLIF(
        concat_ws(E'\n', NULLIF(notes, ''), NULLIF(reference, '')), '')
      WHERE reference IS NOT NULL AND reference <> '';
    ALTER TABLE bill DROP COLUMN reference;
  END IF;
END
$fold_reference$;

-- The bill book is gone. LUMA now writes one series, so the hand-written number
-- stands on its own and book_no had one job left: scoping the duplicate check.
-- Checked before dropping: of 131 customer bills exactly one carried a book
-- number, there was one distinct book, and no bill number was used twice. The
-- unique index below is what the check now rests on, and it will refuse to be
-- created if that is not true of this database, which is the intended behavior:
-- a database that would lose the distinction must not silently drop the column.
CREATE UNIQUE INDEX IF NOT EXISTS bill_issued_no_key ON bill (bill_no)
  WHERE direction = 'issued';
ALTER TABLE bill DROP COLUMN IF EXISTS book_no;


-- Fabric type folded into the description, and the lot into its own column
-- (2026-08-15).
--
-- The register was keyed the wrong way round into these two fields. The
-- description held the lot ("Lot - 5903", "6061") and fabric_type held what the
-- line actually was ("(2x1) LY (65+35%) O/F", "F/Terry"). Now that a line has a
-- lot_no of its own, each value moves to the field that means it and the extra
-- column goes, rather than asking anyone to key a fabric type again into a box
-- the bill does not have.
--
-- Guarded on the column still existing, because this file also runs against a
-- fresh database and against the throwaway schema the integration tests build.
DO $fold_fabric_type$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = 'bill_line' AND column_name = 'fabric_type'
  ) THEN
    -- A line that carries a fabric type: the lot comes out of the description,
    -- and the description becomes the fabric type plus whatever else the old
    -- description was carrying beside the lot ("Lot 6081, (E+O/F)").
    UPDATE bill_line
      SET lot_no = COALESCE(
            NULLIF(lot_no, ''), substring(description from '[0-9]+')),
          description = btrim(
            fabric_type ||
            CASE
              WHEN btrim(regexp_replace(description,
                     '^\s*(lot\s*[-#:]?\s*)?[0-9]+\s*,?\s*', '', 'i'), ' ,') <> ''
              THEN ' ' || btrim(regexp_replace(description,
                     '^\s*(lot\s*[-#:]?\s*)?[0-9]+\s*,?\s*', '', 'i'), ' ,')
              ELSE ''
            END)
      WHERE fabric_type IS NOT NULL AND btrim(fabric_type) <> '';

    -- A line with no fabric type whose description is only a lot number. The
    -- lot is copied out, and the description is deliberately left alone: it is
    -- NOT NULL, there is nothing else on the row to put in it, and inventing a
    -- description would be putting words in the book's mouth.
    UPDATE bill_line
      SET lot_no = substring(description from '[0-9]+')
      WHERE (fabric_type IS NULL OR btrim(fabric_type) = '')
        AND (lot_no IS NULL OR lot_no = '')
        AND description ~* '^\s*lot\s*[-#:]?\s*[0-9A-Za-z/+-]+\s*$';

    ALTER TABLE bill_line DROP COLUMN fabric_type;
  END IF;
END
$fold_fabric_type$;


-- The bill approval columns are gone (2026-08-15).
--
-- An Owner sign-off on a posted bill was built and then taken back out: a
-- workflow state layered on top of who owes what is the full ERP's job, not this
-- app's. Removing it from the definition above is enough for a database created
-- afterwards, and not enough for one that ran the schema while the feature
-- existed. That database keeps three columns nothing writes, which is how a
-- developer's copy quietly stops matching production and a dump taken from one
-- refuses to load into the other.
--
-- Guarded, so this is a no-op everywhere the columns were never added.
DROP INDEX IF EXISTS bill_awaiting_approval_idx;
ALTER TABLE bill DROP COLUMN IF EXISTS approved_at;
ALTER TABLE bill DROP COLUMN IF EXISTS approved_by;
ALTER TABLE bill DROP COLUMN IF EXISTS approved_by_user_id;
