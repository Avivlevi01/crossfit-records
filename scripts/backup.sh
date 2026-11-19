#!/usr/bin/env bash
# Backs up the database to backups/crossfit-<date>.sql.gz and deletes backups older than 14 days.
# Run it from anywhere on the server:  ./scripts/backup.sh
#
# A backup that only lives on the same server is NOT enough (if the server dies, so does the
# backup). Also copy the backups/ folder somewhere else; see DEPLOY.md.
set -euo pipefail
cd "$(dirname "$0")/.."

ENV_FILE="${ENV_FILE:-.env}"
KEEP_DAYS="${KEEP_DAYS:-14}"
COMPOSE="docker compose -f docker-compose.prod.yml --env-file $ENV_FILE"

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

mkdir -p backups
FILE="backups/crossfit-$(date +%Y-%m-%d_%H%M%S).sql.gz"

# pg_dump writes plain SQL; gzip shrinks it. If pg_dump fails, the whole command fails.
$COMPOSE exec -T db pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --no-owner | gzip > "$FILE"

# a dump of a real database is never tiny: catch silent failures
if [ "$(gzip -dc "$FILE" | wc -c)" -lt 500 ]; then
  rm -f "$FILE"
  echo "Backup FAILED: the dump was empty" >&2
  exit 1
fi

find backups -name 'crossfit-*.sql.gz' -mtime +"$KEEP_DAYS" -delete
echo "Backup written: $FILE ($(du -h "$FILE" | cut -f1))"
