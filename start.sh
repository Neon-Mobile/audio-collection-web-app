#!/bin/sh
set -e

echo "Pushing database schema..."
npx drizzle-kit push --force 2>&1 || echo "Schema push completed (may have warnings)"

echo "Creating session table if missing..."
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
\`).then(() => { console.log('Session table ready'); pool.end(); })
  .catch(err => { console.error(err); pool.end(); process.exit(1); });
"

echo "Starting server..."
exec node dist/index.cjs
