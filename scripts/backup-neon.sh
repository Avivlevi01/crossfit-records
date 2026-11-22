#!/usr/bin/env bash
# Backs up the LIVE database (Neon) to backups/neon-<date>.sql.gz and deletes backups older than 30 days.
#
#   ./scripts/backup-neon.sh
#
# The Neon connection string is a secret. It is read from the NEON_DATABASE_URL environment variable,
# or typed when the script asks (the typing is hidden). It is never written to a file by this script.
# Needs only Docker: pg_dump runs inside a throwaway postgres container, so nothing to install.
# The pg_dump version is matched to the server's version automatically (pg_dump refuses an older client).
set -euo pipefail
cd "$(dirname "$0")/.."

KEEP_DAYS="${KEEP_DAYS:-30}"

URL="${NEON_DATABASE_URL:-}"
if [ -z "$URL" ]; then
  read -r -s -p "Paste the Neon connection string (hidden) and press Enter: " URL
  echo
fi
[ -n "$URL" ] || { echo "No connection string given." >&2; exit 1; }

# Neon gives postgresql://... ; the psycopg "+psycopg" form used by the app is not valid for pg_dump
URL="${URL/postgresql+psycopg:\/\//postgresql:\/\/}"

# On Git Bash (Windows) MSYS rewrites paths in arguments; harmless here, but keep it off.
export MSYS_NO_PATHCONV=1

# Pass the secret through the environment, not the command line (command lines are visible in process lists).
export PGURL="$URL"
PSQL="docker run --rm -e PGURL postgres:17-alpine"

echo "Checking the connection and the server version..."
VERSION_NUM="$($PSQL sh -c 'psql "$PGURL" -At -c "SHOW server_version_num"' | tr -d '[:space:]')"
case "$VERSION_NUM" in
  ''|*[!0-9]*) echo "Could not connect to the database (wrong string, or Neon is waking up; try again)." >&2; exit 1 ;;
esac
MAJOR=$((VERSION_NUM / 10000))
IMAGE="postgres:${MAJOR}-alpine"
echo "Server is PostgreSQL ${MAJOR}; using ${IMAGE}."

mkdir -p backups
FILE="backups/neon-$(date +%Y-%m-%d_%H%M%S).sql.gz"

# --no-owner/--no-privileges: Neon role names should not leak into the file, so it restores anywhere.
docker run --rm -e PGURL "$IMAGE" sh -c 'pg_dump "$PGURL" --no-owner --no-privileges' | gzip > "$FILE"

# a dump of a real database is never tiny: catch silent failures
if [ "$(gzip -dc "$FILE" | wc -c)" -lt 500 ]; then
  rm -f "$FILE"
  echo "Backup FAILED: the dump was empty" >&2
  exit 1
fi

find backups -name 'neon-*.sql.gz' -mtime +"$KEEP_DAYS" -delete
echo "Backup written: $FILE ($(du -h "$FILE" | cut -f1))"
echo "Keep a copy outside this computer too (Google Drive, a USB stick). See DEPLOY.md."
