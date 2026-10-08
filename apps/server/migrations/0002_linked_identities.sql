-- One user can sign in with several providers. Google and Apple identities
-- whose provider-verified email matches are linked to the same user.
-- `email_hash` is a keyed HMAC of the normalized email; the email itself is
-- never stored.
CREATE TABLE identities (
  provider TEXT NOT NULL,
  provider_subject TEXT NOT NULL,
  user_id TEXT NOT NULL,
  email_hash TEXT,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (provider, provider_subject)
);

INSERT INTO identities (provider, provider_subject, user_id, email_hash, created_at)
SELECT provider, provider_subject, id, NULL, created_at FROM users;

CREATE INDEX identities_user_idx ON identities(user_id);
CREATE INDEX identities_email_idx ON identities(email_hash);

-- Which provider this session signed in with, for "Signed in with …".
ALTER TABLE sessions ADD COLUMN provider TEXT;
