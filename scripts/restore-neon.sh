#!/usr/bin/env bash
# Restores a backup file INTO a database. THIS REPLACES ALL DATA IN THAT DATABASE.
#
#   ./scripts/restore-neon.sh backups/neon-2026-11-22_120000.sql.gz
#
# The target connection string is read from RESTORE_DATABASE_URL, or typed (hidden).
# Tip: practise first on a new empty Neon branch/database, not on the live one.
set -euo pipefail
cd "$(dirname "$0")/.."

FILE="${1:?Usage: ./scripts/restore-neon.sh <backup-file.sql.gz>}"
[ -f "$FILE" ] || { echo "No such file: $FILE" >&2; exit 1; }

URL="${RESTORE_DATABASE_URL:-}"
if [ -z "$URL" ]; then
  read -r -s -p "Paste the TARGET connection string (hidden) and press Enter: " URL
  echo
fi
[ -n "$URL" ] || { echo "No connection string given." >&2; exit 1; }
URL="${URL/postgresql+psycopg:\/\//postgresql:\/\/}"

export MSYS_NO_PATHCONV=1
export PGURL="$URL"
PSQL="docker run --rm -e PGURL postgres:17-alpine"

HOST="$($PSQL sh -c 'psql "$PGURL" -At -c "SELECT current_database() || '"'"' @ '"'"' || coalesce(inet_server_addr()::text, '"'"'?'"'"')"' || true)"
[ -n "$HOST" ] || { echo "Could not connect to the target database." >&2; exit 1; }

if [ "${ASSUME_YES:-}" != "1" ]; then
  read -r -p "This DELETES everything in [$HOST] and loads $FILE. Type yes to continue: " answer
  [ "$answer" = "yes" ] || { echo "Cancelled."; exit 1; }
fi

echo "Restoring..."
$PSQL sh -c 'psql "$PGURL" -v ON_ERROR_STOP=1 -q -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"'
gzip -dc "$FILE" | docker run --rm -i -e PGURL postgres:17-alpine sh -c 'psql "$PGURL" -v ON_ERROR_STOP=1 -q'
echo "Done. If this was the live database, check the site: registration, login and records."
