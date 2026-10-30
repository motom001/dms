#!/bin/sh
# dms-komplett (#208): PostgreSQL und das DMS in einem Container.
#
# - Erster Start: Datenbank in /data/postgres/daten anlegen (UTF-8, Locale C).
# - PostgreSQL lauscht nur innerhalb des Containers (127.0.0.1) mit „trust“: kein Passwort,
#   von außen nicht erreichbar.
# - Stopp (docker stop): erst das DMS, dann PostgreSQL sauber („fast“) herunterfahren.
# - Endet einer der beiden Prozesse, endet der Container; Docker startet ihn neu.
set -eu

# Für die Probe ohne Container lassen sich Ordner und Startbefehl umstellen.
WURZEL=${DMS_PG_WURZEL:-/data/postgres}
PGDATA="$WURZEL/daten"
SOCKET=${DMS_PG_SOCKET:-/run/postgresql}
LISTE="Wachsen und umziehen: https://motom001.github.io/dms/admin/aktuell/wachsen/"
log() { echo "[dms-komplett] $*"; }

SOLL=$(postgres --version | sed -n 's/.* \([0-9][0-9]*\)\..*/\1/p')
mkdir -p "$PGDATA" "$SOCKET"
# NAS-Freigaben haben oft andere Besitzer: Ordner für postgres richten (nur, wenn nötig).
[ "$(stat -c %U "$PGDATA")" = postgres ] || chown -R postgres:postgres "$WURZEL"
chown postgres:postgres "$WURZEL" "$SOCKET"
chmod 700 "$PGDATA"

if [ -s "$PGDATA/PG_VERSION" ]; then
  IST=$(cat "$PGDATA/PG_VERSION")
  if [ "$IST" != "$SOLL" ]; then
    log "FEHLER: Die Datenbank in /data/postgres stammt von PostgreSQL $IST, dieses Image bringt PostgreSQL $SOLL mit."
    log "Der Container startet nicht, damit nichts kaputtgeht. Umstieg über Sicherung und Wiederherstellung – $LISTE"
    exit 1
  fi
else
  if [ -n "$(ls -A "$PGDATA")" ]; then
    log "FEHLER: /data/postgres/daten ist nicht leer, enthält aber keine Datenbank. Bitte prüfen. $LISTE"
    exit 1
  fi
  log "Erster Start: lege die Datenbank an (PostgreSQL $SOLL)."
  su-exec postgres initdb -D "$PGDATA" -U postgres -E UTF8 --locale=C --auth-local=trust --auth-host=trust >/dev/null
fi

su-exec postgres postgres -D "$PGDATA" -c listen_addresses=127.0.0.1 -c unix_socket_directories="$SOCKET" &
PG=$!
until su-exec postgres pg_isready -q -h 127.0.0.1; do
  kill -0 "$PG" 2>/dev/null || { log "FEHLER: PostgreSQL ist beim Start beendet worden (siehe oben)."; exit 1; }
  sleep 0.5
done

abfrage() { su-exec postgres psql -h 127.0.0.1 -U postgres -tAc "$1"; }
[ "$(abfrage "SELECT 1 FROM pg_roles WHERE rolname = 'dms'")" = 1 ] || { abfrage "CREATE ROLE dms LOGIN SUPERUSER" >/dev/null; log "Rolle dms angelegt."; }
[ "$(abfrage "SELECT 1 FROM pg_database WHERE datname = 'dms'")" = 1 ] || { abfrage "CREATE DATABASE dms OWNER dms" >/dev/null; log "Datenbank dms angelegt."; }

# Anbindung für das DMS: nur im Container, ohne Passwort. Der Einrichtungsassistent überspringt damit den Datenbank-Schritt.
export DATABASE_URL="postgres://dms@127.0.0.1:5432/dms"
${DMS_START:-node --enable-source-maps /app/server/dist/index.js} &
DMS=$!

pg_stopp() {
  if kill -0 "$PG" 2>/dev/null; then
    log "Fahre PostgreSQL herunter."
    kill -INT "$PG" 2>/dev/null || true
    wait "$PG" 2>/dev/null || true
  fi
}

stopp() {
  trap - TERM INT
  log "Stopp: beende das DMS."
  kill -TERM "$DMS" 2>/dev/null || true
  wait "$DMS" 2>/dev/null || true
  pg_stopp
  log "Beendet."
  exit 0
}
trap stopp TERM INT

while kill -0 "$DMS" 2>/dev/null && kill -0 "$PG" 2>/dev/null; do
  sleep 1 & wait $! || true
done

# Einer der beiden Prozesse ist beendet: den anderen sauber beenden, Container endet.
trap - TERM INT
if kill -0 "$DMS" 2>/dev/null; then
  log "FEHLER: PostgreSQL wurde beendet – beende auch das DMS."
  kill -TERM "$DMS" 2>/dev/null || true
  wait "$DMS" 2>/dev/null || true
  exit 1
fi
set +e
wait "$DMS"; CODE=$?
set -e
log "Das DMS wurde beendet (Code $CODE)."
pg_stopp
exit "$CODE"
