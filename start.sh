#!/bin/sh
set -e

echo "Ensuring database tables exist..."
node -e "
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
pool.query(\`
  CREATE TABLE IF NOT EXISTS session (
    sid VARCHAR NOT NULL PRIMARY KEY,
    sess JSON NOT NULL,
    expire TIMESTAMP(6) NOT NULL
  );
  CREATE INDEX IF NOT EXISTS IDX_session_expire ON session (expire);

  ALTER TABLE users ADD COLUMN IF NOT EXISTS samples_completed_at TIMESTAMP;

  CREATE TABLE IF NOT EXISTS onboarding_samples (
    id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id VARCHAR NOT NULL REFERENCES users(id),
    prompt_index INTEGER NOT NULL,
    prompt_text TEXT NOT NULL,
    s3_key TEXT NOT NULL,
    s3_bucket TEXT NOT NULL,
    file_name TEXT NOT NULL,
    duration INTEGER,
    file_size INTEGER,
    format TEXT NOT NULL DEFAULT 'webm',
    sample_rate INTEGER NOT NULL DEFAULT 48000,
    channels INTEGER NOT NULL DEFAULT 1,
    processed_folder TEXT,
    wav_s3_key TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT now()
  );

  ALTER TABLE users ADD COLUMN IF NOT EXISTS referred_by VARCHAR;

  CREATE TABLE IF NOT EXISTS referral_codes (
    id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(12) NOT NULL UNIQUE,
    user_id VARCHAR NOT NULL REFERENCES users(id),
    created_at TIMESTAMP NOT NULL DEFAULT now()
  );

  CREATE TABLE IF NOT EXISTS room_invitations (
    id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
    room_id VARCHAR NOT NULL REFERENCES rooms(id),
    invited_by VARCHAR NOT NULL REFERENCES users(id),
    invited_user_id VARCHAR NOT NULL REFERENCES users(id),
    status TEXT NOT NULL DEFAULT 'pending',
    created_at TIMESTAMP NOT NULL DEFAULT now()
  );

  CREATE TABLE IF NOT EXISTS notifications (
    id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id VARCHAR NOT NULL REFERENCES users(id),
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    data JSONB,
    read BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMP NOT NULL DEFAULT now()
  );

  CREATE TABLE IF NOT EXISTS task_sessions (
    id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
    task_type TEXT NOT NULL,
    user_id VARCHAR NOT NULL REFERENCES users(id),
    partner_id VARCHAR REFERENCES users(id),
    partner_email TEXT,
    partner_status TEXT NOT NULL DEFAULT 'none',
    room_id VARCHAR REFERENCES rooms(id),
    status TEXT NOT NULL DEFAULT 'inviting_partner',
    created_at TIMESTAMP NOT NULL DEFAULT now(),
    updated_at TIMESTAMP NOT NULL DEFAULT now()
  );
\`).then(() => { console.log('Database tables ready'); pool.end(); })
  .catch(err => { console.error(err); pool.end(); process.exit(1); });
"

echo "Starting server..."
exec node dist/index.cjs
