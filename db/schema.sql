-- Interim Billing schema (Neon Postgres).
-- Idempotent: safe to run again after a change.
--
-- Money is NUMERIC(14,2) everywhere, read into the Money type (exact poisha)
-- before any arithmetic happens. Weight is NUMERIC(12,3) kg.
--
-- Sign convention: a balance is always stated in the party's natural
-- direction. For a customer, positive means the customer owes us. For a
-- subcontractor, positive means we owe the subcontractor.

CREATE TABLE IF NOT EXISTS party (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name            text NOT NULL,
  type            text NOT NULL CHECK (type IN ('customer', 'subcontractor')),
  contact_person  text,
  phone           text,
  address         text,
  opening_balance numeric(14, 2) NOT NULL DEFAULT 0,
  opening_as_of   date,
  active          boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS party_name_type_key
  ON party (lower(name), type);

-- Customer bills are system-numbered. The counter is bumped inside the same
-- transaction as the insert, so two people billing at the same moment queue on
-- the row lock and the series has no gaps and no duplicates. A bill series with
-- holes in it is the kind of thing an auditor asks about, which is why this is a
-- counter row and not a sequence.
CREATE TABLE IF NOT EXISTS counter (
  name  text PRIMARY KEY,
  value bigint NOT NULL DEFAULT 0
);

INSERT INTO counter (name, value) VALUES ('customer_bill', 0)
  ON CONFLICT (name) DO NOTHING;

CREATE TABLE IF NOT EXISTS bill (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  party_id    uuid NOT NULL REFERENCES party (id),
  -- System-numbered for a customer bill; the subcontractor's own paper number
  -- for a bill received.
  bill_no     text NOT NULL,
  bill_date   date NOT NULL,
  reference   text,
  notes       text,
  total       numeric(14, 2) NOT NULL CHECK (total >= 0),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS bill_party_no_key ON bill (party_id, bill_no);
CREATE INDEX IF NOT EXISTS bill_party_date_idx ON bill (party_id, bill_date);

CREATE TABLE IF NOT EXISTS bill_line (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bill_id     uuid NOT NULL REFERENCES bill (id) ON DELETE CASCADE,
  line_no     integer NOT NULL,
  description text NOT NULL,
  qty_kg      numeric(12, 3) NOT NULL CHECK (qty_kg > 0),
  rate        numeric(12, 2) NOT NULL CHECK (rate >= 0),
  amount      numeric(14, 2) NOT NULL CHECK (amount >= 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS bill_line_no_key ON bill_line (bill_id, line_no);

-- One table for both directions. Against a customer it is money received
-- (a money receipt). Against a subcontractor it is money paid.
CREATE TABLE IF NOT EXISTS payment (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  party_id    uuid NOT NULL REFERENCES party (id),
  paid_on     date NOT NULL,
  amount      numeric(14, 2) NOT NULL CHECK (amount > 0),
  mode        text NOT NULL CHECK (mode IN ('cash', 'cheque', 'bank_transfer')),
  -- Money receipt serial, cheque number, or bank reference.
  reference   text,
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
