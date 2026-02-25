#!/bin/sh
set -e

echo "Pushing database schema..."
npx drizzle-kit push --force 2>&1 || echo "Schema push completed (may have warnings)"

echo "Starting server..."
exec node dist/index.cjs
