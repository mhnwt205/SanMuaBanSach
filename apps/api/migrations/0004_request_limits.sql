-- Additive operational counters, independent of accounts and role grants.
-- Keys are SHA-256 hashes of scoped subjects; no raw IP/email is stored here.
CREATE TABLE request_limits (
  key TEXT PRIMARY KEY,
  bucket INTEGER NOT NULL,
  attempts INTEGER NOT NULL CHECK(attempts>0),
  expires_at INTEGER NOT NULL
);
CREATE INDEX request_limits_expiry_idx ON request_limits(expires_at);
