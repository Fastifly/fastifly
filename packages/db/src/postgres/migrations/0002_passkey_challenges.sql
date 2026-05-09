ALTER TABLE passkeys ADD COLUMN name TEXT NOT NULL DEFAULT 'Passkey';

CREATE TABLE passkey_challenges (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT REFERENCES users(id),
  kind TEXT NOT NULL,
  challenge TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  CONSTRAINT passkey_challenges_kind_check CHECK (kind IN ('registration', 'login'))
);
CREATE INDEX passkey_challenges_user_id_idx ON passkey_challenges (user_id);
CREATE INDEX passkey_challenges_kind_idx ON passkey_challenges (kind);
