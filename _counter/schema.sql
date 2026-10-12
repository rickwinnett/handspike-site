-- handspike-visitors — the whole database.
--
-- `visitors` holds one column and nothing else. There is no IP, no timestamp, no page, no referrer
-- and no session. A row is 128 bits of salted hash, and the only question it can answer is "have I
-- seen this one before", which is the only question the footer asks.
--
-- Keeping a per-visitor first_seen date was considered and dropped: it is not needed for anything the
-- page shows, and a date beside a stable pseudonymous id is the beginning of a behavioural record.
-- The one date worth having — when the counter started — lives in `meta` as a single row, detached
-- from any visitor.

CREATE TABLE IF NOT EXISTS visitors (
  h TEXT PRIMARY KEY
);

CREATE TABLE IF NOT EXISTS meta (
  k TEXT PRIMARY KEY,
  v TEXT NOT NULL
);
