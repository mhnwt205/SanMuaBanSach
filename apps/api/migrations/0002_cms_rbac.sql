-- Additive only: preserve users, sessions, listings and all review history.
ALTER TABLE users ADD COLUMN is_locked INTEGER NOT NULL DEFAULT 0 CHECK(is_locked IN (0,1));
ALTER TABLE users ADD COLUMN is_super_admin INTEGER NOT NULL DEFAULT 0 CHECK(is_super_admin IN (0,1));
ALTER TABLE users ADD COLUMN version INTEGER NOT NULL DEFAULT 0;
ALTER TABLE listings ADD COLUMN deleted_at TEXT;
ALTER TABLE listings ADD COLUMN deleted_by TEXT REFERENCES users(id);
ALTER TABLE listings ADD COLUMN version INTEGER NOT NULL DEFAULT 0;

CREATE TABLE categories (
 id TEXT PRIMARY KEY,
 name TEXT NOT NULL UNIQUE COLLATE NOCASE CHECK(length(name) BETWEEN 2 AND 40),
 description TEXT NOT NULL DEFAULT '',
 deleted_at TEXT,
 version INTEGER NOT NULL DEFAULT 0,
 created_at TEXT NOT NULL DEFAULT (datetime('now')),
 updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
INSERT OR IGNORE INTO categories(id,name) SELECT lower(hex(randomblob(16))),category FROM listings WHERE length(category) BETWEEN 2 AND 40 GROUP BY category;
INSERT OR IGNORE INTO categories(id,name) VALUES ('van-hoc','Văn học'),('ky-nang','Kỹ năng'),('tam-ly','Tâm lý'),('kinh-te','Kinh tế'),('giao-khoa','Giáo khoa');

CREATE TABLE cms_roles (
 id TEXT PRIMARY KEY,
 name TEXT NOT NULL UNIQUE COLLATE NOCASE CHECK(length(name) BETWEEN 2 AND 80),
 description TEXT NOT NULL DEFAULT '',
 deleted_at TEXT,
 version INTEGER NOT NULL DEFAULT 0,
 created_at TEXT NOT NULL DEFAULT (datetime('now')),
 updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE cms_role_permissions (
 role_id TEXT NOT NULL REFERENCES cms_roles(id),
 permission TEXT NOT NULL,
 PRIMARY KEY(role_id,permission)
);
CREATE TABLE cms_user_roles (
 user_id TEXT NOT NULL REFERENCES users(id),
 role_id TEXT NOT NULL REFERENCES cms_roles(id),
 PRIMARY KEY(user_id,role_id)
);
CREATE INDEX cms_user_roles_role_idx ON cms_user_roles(role_id);
CREATE TABLE cms_audit (
 id TEXT PRIMARY KEY,
 actor_id TEXT NOT NULL REFERENCES users(id),
 action TEXT NOT NULL,
 resource_type TEXT NOT NULL,
 resource_id TEXT NOT NULL,
 detail_json TEXT NOT NULL DEFAULT '{}',
 created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX cms_audit_time_idx ON cms_audit(created_at DESC);
CREATE INDEX listings_deleted_status_idx ON listings(deleted_at,status,created_at DESC);
ALTER TABLE users ADD COLUMN change_token TEXT;
ALTER TABLE listings ADD COLUMN change_token TEXT;
ALTER TABLE categories ADD COLUMN change_token TEXT;
ALTER TABLE cms_roles ADD COLUMN change_token TEXT;
ALTER TABLE seller_applications ADD COLUMN change_token TEXT;
-- Preserve existing Admin review access explicitly; custom roles are the sole CMS grants.
INSERT INTO cms_roles(id,name,description) VALUES('legacy-admin','Quản trị viên hiện có','Quyền xét duyệt được bảo toàn từ phiên bản trước');
INSERT INTO cms_role_permissions(role_id,permission) VALUES('legacy-admin','listings.view'),('legacy-admin','listings.review'),('legacy-admin','sellers.view'),('legacy-admin','sellers.review'),('legacy-admin','users.view');
INSERT INTO cms_user_roles(user_id,role_id) SELECT id,'legacy-admin' FROM users WHERE role='admin';
