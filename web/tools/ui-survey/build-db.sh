#!/usr/bin/env bash
# Builds the throwaway UI-survey database: fresh DB on the same instance as
# DATABASE_URL, newchums schema + postgis, the legacy pre-chain tables, the
# full web/sql migration chain, then seed.sql. Prints the connection URL.
#
# Usage:
#   DATABASE_URL=postgres://... bash build-db.sh [dbname]
# Default dbname: newchums_uisurvey. Re-running drops and rebuilds it.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
SQL_DIR="$HERE/../../sql"
DBNAME="${1:-newchums_uisurvey}"
: "${DATABASE_URL:?set DATABASE_URL (e.g. from api/.dev.vars) to the source instance}"

TESTURL=$(printf '%s' "$DATABASE_URL" | sed -E "s#(/)[^/?]+(\?[^?]*)?\$#\1${DBNAME}\2#")

echo "[build-db] recreating ${DBNAME}" >&2
psql "$DATABASE_URL" -qc "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='${DBNAME}' AND pid <> pg_backend_pid()" >/dev/null 2>&1 || true
psql "$DATABASE_URL" -qc "DROP DATABASE IF EXISTS ${DBNAME}" >&2
psql "$DATABASE_URL" -qc "CREATE DATABASE ${DBNAME}" >&2
psql "$TESTURL" -qc "CREATE SCHEMA IF NOT EXISTS newchums; CREATE EXTENSION IF NOT EXISTS postgis;" >&2

echo "[build-db] legacy tables" >&2
psql "$TESTURL" -q -v ON_ERROR_STOP=1 -f "$HERE/legacy-ddl.sql" >&2

echo "[build-db] migration chain ($(ls "$SQL_DIR"/*.sql | wc -l) files)" >&2
ERRS=0
for f in $(ls "$SQL_DIR"/*.sql | sort); do
  OUT=$(psql "$TESTURL" -v ON_ERROR_STOP=0 -f "$f" 2>&1) || true
  N=$(printf '%s' "$OUT" | grep -c "ERROR" || true)
  if [ "$N" -gt 0 ]; then
    echo "[build-db] $f: $N error(s)" >&2
    printf '%s\n' "$OUT" | grep "ERROR" | head -3 >&2
    ERRS=$((ERRS + N))
  fi
done
if [ "$ERRS" -gt 0 ]; then
  echo "[build-db] chain finished with $ERRS error(s); inspect before trusting captures" >&2
  exit 1
fi

echo "[build-db] seeding state matrix" >&2
psql "$TESTURL" -q -v ON_ERROR_STOP=1 -f "$HERE/seed.sql" >&2

echo "[build-db] done" >&2
printf '%s\n' "$TESTURL"
