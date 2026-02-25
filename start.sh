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
\`).then(() => { console.log('Database tables ready'); pool.end(); })
  .catch(err => { console.error(err); pool.end(); process.exit(1); });
"

echo "Starting server..."
exec node dist/index.cjs
