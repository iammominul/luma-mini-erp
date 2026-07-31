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
  -- subcontractor's paper bill on the other.
  bill_no     text NOT NULL,
  -- Which physical bill book the number was written in, for the book sequence.
  book_no     text,
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
  reference   text,
  -- What the ledger prints in Particulars for this bill. Blank means the ledger
  -- composes it from the bill and its lines, which is the normal case.
  narration   text,
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
  description text NOT NULL,
  -- What the line is, in trade terms: S/J, 1x1 Rib, Interlock, Lycra.
  fabric_type text,
  color       text,
  -- Hand-written challan serial and the customer's own order number.
  challan_no  text,
  order_no    text,
  grey_kg     numeric(12, 3) NOT NULL CHECK (grey_kg > 0),
  finished_kg numeric(12, 3) CHECK (finished_kg > 0),
  rate        numeric(12, 2) NOT NULL CHECK (rate >= 0),
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

-- Append-only record of every write. There is one shared login, so this states
-- what changed and when, not who. Nothing in the app updates or deletes a row
-- here.
CREATE TABLE IF NOT EXISTS activity_log (
  id          bigserial PRIMARY KEY,
  at          timestamptz NOT NULL DEFAULT now(),
  action      text NOT NULL CHECK (action IN ('create', 'update', 'delete')),
  entity      text NOT NULL,
  entity_id   text NOT NULL,
  summary     text NOT NULL,
  reason      text,
  before_json jsonb,
  after_json  jsonb
);

CREATE INDEX IF NOT EXISTS activity_log_at_idx ON activity_log (at DESC);

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

