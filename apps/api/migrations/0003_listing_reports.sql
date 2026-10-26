-- Additive: preserve all users, listings and review history.
CREATE TABLE listing_reports (
 id TEXT PRIMARY KEY,
 listing_id TEXT NOT NULL REFERENCES listings(id),
 reporter_id TEXT NOT NULL REFERENCES users(id),
 listing_title TEXT NOT NULL,
 listing_version INTEGER NOT NULL,
 reason TEXT NOT NULL CHECK(reason IN ('fraud','misleading','prohibited','spam','other')),
 description TEXT NOT NULL CHECK(length(description) BETWEEN 10 AND 1000),
 status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','resolved','dismissed')),
 resolution TEXT CHECK(resolution IN ('resolve','dismiss','hide')),
 review_note TEXT,
 reviewed_by TEXT REFERENCES users(id),
 reviewed_at TEXT,
 version INTEGER NOT NULL DEFAULT 0,
 change_token TEXT,
 created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX listing_reports_pending_unique ON listing_reports(listing_id,reporter_id) WHERE status='pending';
CREATE INDEX listing_reports_status_time ON listing_reports(status,created_at DESC);
CREATE INDEX listing_reports_reporter_time ON listing_reports(reporter_id,created_at DESC);
