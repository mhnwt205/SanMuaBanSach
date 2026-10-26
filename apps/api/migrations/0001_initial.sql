PRAGMA foreign_keys = ON;

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL CHECK(length(name) BETWEEN 2 AND 100),
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user' CHECK(role IN ('user','seller','admin')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX sessions_user_id_idx ON sessions(user_id);

CREATE TABLE seller_applications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  phone TEXT NOT NULL,
  note TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),
  reviewed_by TEXT REFERENCES users(id),
  reviewed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX seller_applications_status_idx ON seller_applications(status, created_at);

CREATE TABLE listings (
  id TEXT PRIMARY KEY,
  seller_id TEXT NOT NULL REFERENCES users(id),
  title TEXT NOT NULL CHECK(length(title) BETWEEN 2 AND 180),
  author TEXT NOT NULL CHECK(length(author) BETWEEN 2 AND 140),
  description TEXT NOT NULL DEFAULT '',
  price_vnd INTEGER NOT NULL CHECK(price_vnd >= 0 AND price_vnd <= 100000000),
  condition TEXT NOT NULL CHECK(condition IN ('new','like_new','good','acceptable')),
  category TEXT NOT NULL,
  city TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','active','rejected','sold','hidden')),
  image_keys TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX listings_status_created_idx ON listings(status, created_at DESC);
CREATE INDEX listings_seller_id_idx ON listings(seller_id);

CREATE TABLE listing_reviews (
  id TEXT PRIMARY KEY,
  listing_id TEXT NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  admin_id TEXT NOT NULL REFERENCES users(id),
  decision TEXT NOT NULL CHECK(decision IN ('active','rejected','hidden')),
  note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
