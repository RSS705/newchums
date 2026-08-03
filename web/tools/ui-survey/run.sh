#!/usr/bin/env bash
# One-shot UI survey: throwaway DB -> both dev servers pointed at it ->
# cookie mint -> capture/detector sweep -> teardown. Env files it touches
# (api/.dev.vars, web/.env.development.local) are backed up and restored on
# any exit. See README.md next to this script.
#
# Usage, from web/:
#   npm run ui-survey              # full loop
#   npm run ui-survey -- --keep    # leave DB + servers up for manual poking
#   npm run ui-survey -- --sweep-only   # servers already up: mint + sweep only
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
WEB="$(cd "$HERE/../.." && pwd)"
API="$(cd "$WEB/../api" && pwd)"
OUT="${UI_SURVEY_OUT:-/tmp/ui-survey/$(date +%H%M%S)}"
KEEP=0; SWEEP_ONLY=0
for a in "$@"; do
  case "$a" in
    --keep) KEEP=1 ;;
    --sweep-only) SWEEP_ONLY=1 ;;
  esac
done
mkdir -p "$OUT"

if [ "$SWEEP_ONLY" -eq 0 ]; then
  DBURL=$(grep '^DATABASE_URL=' "$API/.dev.vars" | cut -d= -f2- | tr -d '"')
  [ -n "$DBURL" ] || { echo "DATABASE_URL not found in api/.dev.vars"; exit 1; }

  TESTURL=$(DATABASE_URL="$DBURL" bash "$HERE/build-db.sh" newchums_uisurvey)

  cp "$API/.dev.vars" "$OUT/dev.vars.backup"
  [ -f "$WEB/.env.development.local" ] && cp "$WEB/.env.development.local" "$OUT/env.dev.local.backup" || true

  cleanup() {
    echo "[ui-survey] teardown"
    kill "${API_PID:-0}" "${WEB_PID:-0}" 2>/dev/null || true
    pkill -f "workerd" 2>/dev/null || true
    cp "$OUT/dev.vars.backup" "$API/.dev.vars"
    if [ -f "$OUT/env.dev.local.backup" ]; then
      cp "$OUT/env.dev.local.backup" "$WEB/.env.development.local"
    else
      rm -f "$WEB/.env.development.local"
    fi
    psql "$DBURL" -qc "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='newchums_uisurvey' AND pid <> pg_backend_pid()" >/dev/null 2>&1 || true
    psql "$DBURL" -qc "DROP DATABASE IF EXISTS newchums_uisurvey" >/dev/null 2>&1 || true
  }
  if [ "$KEEP" -eq 0 ]; then trap cleanup EXIT; fi

  # Point both servers at the throwaway DB. RESEND is neutered so nothing in
  # the survey can ever email a real address.
  python3 - "$API/.dev.vars" "$TESTURL" <<'PYEOF'
import sys
path, url = sys.argv[1], sys.argv[2]
out = []
for line in open(path).read().splitlines():
    if line.startswith("DATABASE_URL="):
        out.append(f'DATABASE_URL="{url}"')
    elif line.startswith("RESEND_API_KEY="):
        out.append('RESEND_API_KEY="re_ui_survey_neutered"')
    else:
        out.append(line)
open(path, "w").write("\n".join(out) + "\n")
PYEOF
  printf 'DATABASE_URL="%s"\n' "$TESTURL" > "$WEB/.env.development.local"

  echo "[ui-survey] starting servers (logs in $OUT)"
  (cd "$API" && npx wrangler dev --port 8787 > "$OUT/api.log" 2>&1) & API_PID=$!
  (cd "$WEB" && npm run dev > "$OUT/web.log" 2>&1) & WEB_PID=$!

  for i in $(seq 1 60); do
    sleep 2
    A=$(curl -s -o /dev/null -w '%{http_code}' -m 5 http://127.0.0.1:8787/ || true)
    W=$(curl -s -o /dev/null -w '%{http_code}' -m 5 http://localhost:3000/ || true)
    [ "$A" = "200" ] && [ "$W" = "200" ] && break
    [ "$i" = "60" ] && { echo "[ui-survey] servers did not come up (api=$A web=$W)"; exit 1; }
  done
  echo "[ui-survey] servers up"
fi

(cd "$WEB" && node tools/ui-survey/mint-cookies.mjs "$OUT/cookies.json")
echo "[ui-survey] sweeping -> $OUT"
set +e
(cd "$WEB" && node tools/ui-survey/sweep.mjs --routes tools/ui-survey/routes.json --cookies "$OUT/cookies.json" --out "$OUT/shots")
RC=$?
set -e
echo "[ui-survey] shots: $OUT/shots"
if [ "$KEEP" -eq 1 ]; then
  echo "[ui-survey] --keep: servers and DB left running; restore $OUT/dev.vars.backup to api/.dev.vars and drop newchums_uisurvey when done"
fi
exit "$RC"
