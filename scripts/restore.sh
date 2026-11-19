#!/usr/bin/env bash
# Restores the database from a backup file. THIS REPLACES ALL CURRENT DATA.
#   ./scripts/restore.sh backups/crossfit-2026-11-20_030000.sql.gz
set -euo pipefail
cd "$(dirname "$0")/.."

FILE="${1:?Usage: ./scripts/restore.sh <backup-file.sql.gz>}"
[ -f "$FILE" ] || { echo "No such file: $FILE" >&2; exit 1; }

ENV_FILE="${ENV_FILE:-.env}"
COMPOSE="docker compose -f docker-compose.prod.yml --env-file $ENV_FILE"

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

if [ "${ASSUME_YES:-}" != "1" ]; then
  read -r -p "This DELETES the current database and loads $FILE. Type yes to continue: " answer
  [ "$answer" = "yes" ] || { echo "Cancelled."; exit 1; }
fi

echo "Stopping the app..."
$COMPOSE stop app
echo "Restoring..."
$COMPOSE exec -T db psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1 \
  -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"
gzip -dc "$FILE" | $COMPOSE exec -T db psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1 -q
echo "Starting the app..."
$COMPOSE start app
echo "Done."
