CREATE TABLE IF NOT EXISTS ag_users (
 id text PRIMARY KEY, email text NOT NULL UNIQUE, name text NOT NULL,
 salt text NOT NULL, password_hash text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS ag_sessions (
 token_hash text PRIMARY KEY, user_id text NOT NULL REFERENCES ag_users(id),
 expires_at timestamptz NOT NULL
);
CREATE TABLE IF NOT EXISTS ag_rooms (
 id text PRIMARY KEY, owner_id text NOT NULL REFERENCES ag_users(id), title text NOT NULL,
 started_at timestamptz NOT NULL DEFAULT now(), ended_at timestamptz,
 end_requested_at timestamptz, end_deadline timestamptz
);
ALTER TABLE ag_rooms ADD COLUMN IF NOT EXISTS student_language text CHECK (student_language IN ('pt','en','es','zh'));
CREATE TABLE IF NOT EXISTS ag_participants (
 id text PRIMARY KEY, room_id text NOT NULL REFERENCES ag_rooms(id), name text NOT NULL,
 language text NOT NULL CHECK (language IN ('pt','en','es','zh')),
 role text NOT NULL CHECK (role IN ('teacher','student')),
 status text NOT NULL CHECK (status IN ('accepted','pending','rejected')),
 token_hash text NOT NULL UNIQUE, online boolean NOT NULL DEFAULT true,
 last_seen timestamptz NOT NULL DEFAULT now(), generation integer NOT NULL DEFAULT 0,
 media jsonb NOT NULL DEFAULT '{}', flushed boolean NOT NULL DEFAULT false
);
CREATE INDEX IF NOT EXISTS ag_participants_room_idx ON ag_participants(room_id);
CREATE TABLE IF NOT EXISTS ag_transcripts (
 seq bigserial PRIMARY KEY, id text NOT NULL UNIQUE,
 room_id text NOT NULL REFERENCES ag_rooms(id), member_id text NOT NULL REFERENCES ag_participants(id),
 client_id text NOT NULL, payload jsonb NOT NULL,
 captured_at timestamptz NOT NULL, saved_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(room_id,member_id,client_id),
 CHECK (payload->>'v'='1' AND payload->>'algorithm'='AES-GCM' AND payload ? 'iv' AND payload ? 'ciphertext')
);
CREATE INDEX IF NOT EXISTS ag_transcripts_room_seq_idx ON ag_transcripts(room_id,seq);
CREATE TABLE IF NOT EXISTS ag_events (
 seq bigserial PRIMARY KEY, room_id text NOT NULL REFERENCES ag_rooms(id),
 type text NOT NULL, data jsonb NOT NULL DEFAULT '{}', recipient_id text,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ag_events_room_seq_idx ON ag_events(room_id,seq);
CREATE TABLE IF NOT EXISTS ag_rate_limits (
 key text PRIMARY KEY, window_start timestamptz NOT NULL, count integer NOT NULL
);
