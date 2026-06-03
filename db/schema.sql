-- Canonical local schema for the Product Passport backend.
-- The SQL is intentionally SQLite/D1-compatible.

CREATE TABLE IF NOT EXISTS product_passports (
  id TEXT PRIMARY KEY,
  public_id TEXT UNIQUE,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
  product_url TEXT NOT NULL,
  retailer TEXT NOT NULL,
  product_name TEXT NOT NULL DEFAULT 'not_found',
  brand TEXT NOT NULL DEFAULT 'not_found',
  extraction_status TEXT NOT NULL DEFAULT 'partial',
  report_json TEXT NOT NULL,
  snapshot_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  published_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_product_passports_status_updated
  ON product_passports (status, updated_at);

CREATE INDEX IF NOT EXISTS idx_product_passports_public_id
  ON product_passports (public_id);

CREATE TABLE IF NOT EXISTS passport_events (
  id TEXT PRIMARY KEY,
  passport_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  payload_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  FOREIGN KEY (passport_id) REFERENCES product_passports (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_passport_events_passport_created
  ON passport_events (passport_id, created_at);
