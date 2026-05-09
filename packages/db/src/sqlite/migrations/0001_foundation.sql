PRAGMA foreign_keys = ON;

CREATE TABLE users (
  id TEXT PRIMARY KEY NOT NULL,
  username TEXT NOT NULL,
  username_normalized TEXT NOT NULL,
  display_name TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  disabled_at TEXT
);
CREATE UNIQUE INDEX users_username_normalized_unique ON users (username_normalized);

CREATE TABLE sessions (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id),
  token_hash TEXT NOT NULL,
  user_agent TEXT,
  ip_address TEXT,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  revoked_at TEXT
);
CREATE UNIQUE INDEX sessions_token_hash_unique ON sessions (token_hash);
CREATE INDEX sessions_user_id_idx ON sessions (user_id);

CREATE TABLE passkeys (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id),
  credential_id TEXT NOT NULL,
  public_key TEXT NOT NULL,
  counter INTEGER NOT NULL,
  transports_json TEXT,
  created_at TEXT NOT NULL,
  last_used_at TEXT
);
CREATE UNIQUE INDEX passkeys_credential_id_unique ON passkeys (credential_id);
CREATE INDEX passkeys_user_id_idx ON passkeys (user_id);

CREATE TABLE recovery_codes (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id),
  code_hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  used_at TEXT
);
CREATE INDEX recovery_codes_user_id_idx ON recovery_codes (user_id);

CREATE TABLE workspaces (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  owner_user_id TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  archived_at TEXT
);

CREATE TABLE workspace_members (
  id TEXT PRIMARY KEY NOT NULL,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  role TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  removed_at TEXT
);
CREATE INDEX workspace_members_workspace_id_idx ON workspace_members (workspace_id);
CREATE INDEX workspace_members_user_id_idx ON workspace_members (user_id);
CREATE UNIQUE INDEX workspace_members_workspace_user_unique ON workspace_members (workspace_id, user_id);

CREATE TABLE workspace_invitations (
  id TEXT PRIMARY KEY NOT NULL,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  invited_by_user_id TEXT NOT NULL REFERENCES users(id),
  invitee_identifier TEXT NOT NULL,
  role TEXT NOT NULL,
  token_hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  accepted_at TEXT,
  revoked_at TEXT
);
CREATE INDEX workspace_invitations_workspace_id_idx ON workspace_invitations (workspace_id);
CREATE UNIQUE INDEX workspace_invitations_token_hash_unique ON workspace_invitations (token_hash);

CREATE TABLE ledgers (
  id TEXT PRIMARY KEY NOT NULL,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  name TEXT NOT NULL,
  base_currency_code TEXT NOT NULL CHECK (length(base_currency_code) = 3),
  first_day_of_week INTEGER NOT NULL CHECK (first_day_of_week BETWEEN 0 AND 6),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  archived_at TEXT
);
CREATE INDEX ledgers_workspace_id_idx ON ledgers (workspace_id);

CREATE TABLE devices (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id),
  device_key TEXT NOT NULL,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL,
  last_seen_at TEXT,
  revoked_at TEXT
);
CREATE INDEX devices_user_id_idx ON devices (user_id);
CREATE INDEX devices_revoked_at_idx ON devices (revoked_at);
CREATE UNIQUE INDEX devices_user_device_key_unique ON devices (user_id, device_key);

CREATE TABLE idempotency_receipts (
  id TEXT PRIMARY KEY NOT NULL,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  ledger_id TEXT REFERENCES ledgers(id),
  actor_user_id TEXT NOT NULL REFERENCES users(id),
  idempotency_key TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  response_status INTEGER NOT NULL,
  response_body_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);
CREATE INDEX idempotency_receipts_workspace_id_idx ON idempotency_receipts (workspace_id);
CREATE INDEX idempotency_receipts_ledger_id_idx ON idempotency_receipts (ledger_id);
CREATE UNIQUE INDEX idempotency_receipts_actor_key_unique ON idempotency_receipts (actor_user_id, idempotency_key);

CREATE TABLE job_queue (
  id TEXT PRIMARY KEY NOT NULL,
  type TEXT NOT NULL,
  status TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  dedupe_key TEXT,
  attempts INTEGER NOT NULL,
  max_attempts INTEGER NOT NULL,
  available_at TEXT NOT NULL,
  locked_at TEXT,
  locked_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX job_queue_status_idx ON job_queue (status);
CREATE INDEX job_queue_available_at_idx ON job_queue (available_at);
CREATE UNIQUE INDEX job_queue_dedupe_key_unique ON job_queue (dedupe_key);

CREATE TABLE audit_log (
  id TEXT PRIMARY KEY NOT NULL,
  workspace_id TEXT REFERENCES workspaces(id),
  ledger_id TEXT REFERENCES ledgers(id),
  actor_user_id TEXT REFERENCES users(id),
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  metadata_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX audit_log_workspace_id_idx ON audit_log (workspace_id);
CREATE INDEX audit_log_ledger_id_idx ON audit_log (ledger_id);
CREATE INDEX audit_log_actor_user_id_idx ON audit_log (actor_user_id);
