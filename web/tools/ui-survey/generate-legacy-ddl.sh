#!/usr/bin/env bash
# Regenerates legacy-ddl.sql from the live database catalogs (read-only).
# Usage: DATABASE_URL=postgres://... bash generate-legacy-ddl.sh > legacy-ddl.sql
set -euo pipefail
: "${DATABASE_URL:?set DATABASE_URL to the source database}"
for tbl in interests user_profile user_interests; do
  cols=$(psql "$DATABASE_URL" -tA -c "
    SELECT a.attname || ' ' || format_type(a.atttypid, a.atttypmod)
           || CASE WHEN a.attnotnull THEN ' NOT NULL' ELSE '' END
           || COALESCE(' DEFAULT ' || pg_get_expr(d.adbin, d.adrelid), '')
    FROM pg_attribute a
    LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
    WHERE a.attrelid = 'newchums.${tbl}'::regclass AND a.attnum > 0 AND NOT a.attisdropped
    ORDER BY a.attnum" | sed '/^$/d' | paste -sd'@' -)
  cons=$(psql "$DATABASE_URL" -tA -c "
    SELECT pg_get_constraintdef(oid) FROM pg_constraint
    WHERE conrelid = 'newchums.${tbl}'::regclass AND contype IN ('p','u','c')" | sed '/^$/d' | paste -sd'@' -)
  body=$(printf '%s@%s' "$cols" "$cons" | tr '@' '\n' | sed '/^$/d' | sed 's/^/  /' | paste -sd',
' -)
  printf 'CREATE TABLE IF NOT EXISTS newchums.%s (\n%s\n);\n' "$tbl" "$body"
done
