#!/bin/sh
# dms-komplett (#208): PostgreSQL und Ablago in einem Container.
#
# - Ordner /data/postgres und /data/postgres/daten für postgres richten und als postgres probeschreiben (#943).
# - Erster Start: Datenbank in /data/postgres/daten anlegen (UTF-8, Locale C, mit Datenprüfsummen).
# - PostgreSQL lauscht nur innerhalb des Containers (127.0.0.1), von außen nicht erreichbar. Kein Passwort, das jemand
#   kennen muss: Das für Ablago setzt dieses Skript selbst (#1354, siehe unten).
# - Stopp (docker stop): erst Ablago, dann PostgreSQL sauber („fast“) herunterfahren.
# - Endet einer der beiden Prozesse, endet der Container; Docker startet ihn neu.
# - Startseite sofort (#1250): Vom ersten Augenblick an zeigt der Vorstart (server/dist/vorstart.js) unter dem Port die
#   Seite „Ablago startet …“ mit dem Schritt (Datenbank wird angelegt, startet, Ablago startet) – auch bei einem Fehler
#   vor Ablago, dann mit Grund und Ausweg. Ablago übernimmt den Port von ihm (DMS_VORSTART_PID).
# - Ohne root (#1354): Das Skript läuft als root, Ablago, der Vorstart und die Dokumentwerkzeuge laufen als eigene
#   Benutzer (deploy/image/start-hilfen.sh), PostgreSQL wie bisher als postgres. Die Rolle dms ist kein Superuser mehr
#   und meldet sich über 127.0.0.1 mit einem Passwort an, das dieses Skript bei jedem Start neu setzt und nur Ablago
#   mitgibt; über den Socket kommen nur postgres und root hinein. So erreicht kein anderer Benutzer im Container die
#   Datenbank.
set -eu

# Für die Probe ohne Container lassen sich Ordner und Startbefehl umstellen.
WURZEL=${DMS_PG_WURZEL:-/data/postgres}
PGDATA="$WURZEL/daten"
SOCKET=${DMS_PG_SOCKET:-/run/postgresql}
HBA=${DMS_PG_HBA:-/usr/local/share/ablago/pg_hba.conf}
LISTE="Wachsen und umziehen: https://help.ablago.app/admin/aktuell/wachsen/"
HILFE_START="Hilfe: https://help.ablago.app/installieren/aktuell/komplett/#container-startet-nicht"
# Letzte Version mit PostgreSQL 17 (#1464) – dieselbe wie LETZTE_VERSION_PG17 in server/src/einrichtung/startfehler.ts
# (der Test pg-umzug-version.test.ts vergleicht beide).
LETZTE_PG17=0.305.0
log() { echo "[dms-komplett] $*"; }
# Vorstart (#1250), Benutzer von Ablago und Werkzeugdienst (#1354).
# shellcheck source=deploy/image/start-hilfen.sh disable=SC1091
. "${DMS_START_HILFEN:-/usr/local/lib/ablago/start-hilfen.sh}"
benutzer_pruefen || { fehlerseite daten-rechte; exit 1; }
DMS_VORSTART_SEIT=$(date +%s)
export DMS_VORSTART_SEIT
stand pg-start
vorstart
# Ordner unter /data für Ablago übernehmen (#1354), Eingangsordner prüfen, Werkzeugdienst starten.
if ! ordner_uebernehmen; then
  fehlerseite daten-rechte
  exit 1
fi
eingang_pruefen
werkzeuge_starten
stand pg-start

SOLL=$(postgres --version | sed -n 's/.* \([0-9][0-9]*\)\..*/\1/p')
mkdir -p "$SOCKET"
mkdir -p "$PGDATA" 2>/dev/null || true
# NAS-Freigaben haben oft andere Besitzer und Rechte (z. B. 000): Ordner für postgres richten (nur, wenn nötig).
# Auch der eingebundene Ordner selbst (#943): Ohne „x“ an /data/postgres kommt postgres nicht bis zu „daten“,
# obwohl root dort alles anlegen kann. Schlägt das Richten fehl (NFS mit root_squash, ACLs), meldet es die
# Schreibprobe unten verständlich – daher hier kein Abbruch.
[ "$(stat -c %U "$PGDATA" 2>/dev/null)" = postgres ] || chown -R postgres:postgres "$WURZEL" 2>/dev/null || true
chown postgres:postgres "$WURZEL" "$SOCKET" 2>/dev/null || true
chmod 700 "$WURZEL" "$PGDATA" 2>/dev/null || true
# Socket nur für postgres (und root, #1354): Dort gilt „trust“, andere Benutzer im Container kommen nicht hinein.
chmod 700 "$SOCKET" 2>/dev/null || true

# Schreibprobe als postgres (#943), bevor initdb oder PostgreSQL startet: sonst sähe man nur „Permission denied“
# von initdb und fände den Grund erst mit ls -la im Ordner.
PROBE="$PGDATA/.ablago-schreibprobe"
if ! su-exec postgres sh -c ': > "$1" && rm -f "$1"' probe "$PROBE" 2>/dev/null; then
  log "FEHLER: PostgreSQL (Benutzer $(id -u postgres)) kann nicht in $PGDATA schreiben. Bitte die Rechte des Ordners auf dem NAS prüfen (ls -la, ACLs mit getfacl) oder ein benanntes Docker-Volume nutzen."
  log "$HILFE_START"
  rm -f "$PROBE" 2>/dev/null || true
  fehlerseite rechte
  exit 1
fi

if [ -s "$PGDATA/PG_VERSION" ]; then
  IST=$(cat "$PGDATA/PG_VERSION")
  if [ "$IST" != "$SOLL" ]; then
    log "FEHLER: Die Datenbank in /data/postgres stammt von PostgreSQL $IST, dieses Image bringt PostgreSQL $SOLL mit."
    log "Der Container startet nicht, damit nichts kaputtgeht. Umstieg über Sicherung und Wiederherstellung – $LISTE"
    # Umzug von 17 auf 18 (#1464): Die Startseite nennt die letzte Version mit PostgreSQL 17 für die Sicherung. Gelöscht
    # wird nichts – der Ordner bleibt, wie er ist.
    if [ "$IST" = 17 ] && [ "$SOLL" = 18 ]; then
      log "Umzug: mit Ablago $LETZTE_PG17 (dms-komplett:$LETZTE_PG17, letzte Version mit PostgreSQL 17) eine Sicherung anlegen, den Ordner für /data/postgres umbenennen und einen leeren anlegen, dieses Image starten und die Sicherung im Einrichtungsassistenten einspielen."
      fehlerseite pg-17
    else
      fehlerseite pg-version
    fi
    exit 1
  fi
else
  if [ -n "$(ls -A "$PGDATA")" ]; then
    log "FEHLER: /data/postgres/daten ist nicht leer, enthält aber keine Datenbank. Bitte prüfen. $LISTE"
    fehlerseite nicht-leer
    exit 1
  fi
  log "Erster Start: lege die Datenbank an (PostgreSQL $SOLL)."
  stand pg-anlegen
  # Datenprüfsummen bewusst an (#1464; seit PostgreSQL 18 ohnehin Vorgabe): Beschädigte Blöcke auf dem Datenträger
  # fallen beim Lesen auf, statt still falsche Daten zu liefern. Locale C: keine Abhängigkeit von Kollationen des Systems.
  if ! su-exec postgres initdb -D "$PGDATA" -U postgres -E UTF8 --locale=C --data-checksums --auth-local=trust --auth-host=trust >/dev/null; then
    log "FEHLER: Die Datenbank ließ sich nicht anlegen (siehe oben). Häufige Gründe: Speicher voll, Rechte des Ordners. $HILFE_START"
    fehlerseite pg-anlegen
    exit 1
  fi
fi
stand pg-start

# pg_stat_statements (#894): zählt je Abfrage Anzahl und Rechenzeit – der Lasttest nennt damit die teuersten Abfragen.
# Über die Befehlszeile, damit es auch für schon bestehende Datenbanken in /data/postgres gilt (ohne postgresql.conf
# anzufassen). Kostet wenig (rund 1–2 % Rechenzeit je Abfrage, wenige MB Speicher); Ablago liest die Werte nur im Lasttest.
# Eigene pg_hba.conf (#1354), auch für schon bestehende Datenbanken: Socket „trust“ (nur postgres und root), über
# 127.0.0.1 nur mit Passwort.
su-exec postgres postgres -D "$PGDATA" -c listen_addresses=127.0.0.1 -c unix_socket_directories="$SOCKET" \
  -c shared_preload_libraries=pg_stat_statements -c hba_file="$HBA" &
PG=$!
until su-exec postgres pg_isready -q -h 127.0.0.1; do
  kill -0 "$PG" 2>/dev/null || { log "FEHLER: PostgreSQL ist beim Start beendet worden (siehe oben)."; fehlerseite pg-beendet; exit 1; }
  sleep 0.5
done

abfrage() { su-exec postgres psql -h "$SOCKET" -U postgres -tAc "$1"; }
[ "$(abfrage "SELECT 1 FROM pg_roles WHERE rolname = 'dms'")" = 1 ] || { abfrage "CREATE ROLE dms LOGIN" >/dev/null; log "Rolle dms angelegt."; }
# Kein Superuser mehr (#1354): Früher war die Rolle Superuser. Ablago braucht nur die eigene Datenbank; pg_trgm und
# unaccent darf ihr Eigentümer selbst anlegen.
if [ "$(abfrage "SELECT rolsuper FROM pg_roles WHERE rolname = 'dms'")" = t ]; then
  abfrage "ALTER ROLE dms NOSUPERUSER" >/dev/null
  log "Rolle dms ist kein Superuser mehr (#1354)."
fi
[ "$(abfrage "SELECT 1 FROM pg_database WHERE datname = 'dms'")" = 1 ] || { abfrage "CREATE DATABASE dms OWNER dms" >/dev/null; log "Datenbank dms angelegt."; }
# Passwort für die Anmeldung über 127.0.0.1, bei jedem Start neu. Über die Standardeingabe, damit es in keiner
# Befehlszeile steht (die sähen andere Benutzer im Container).
DMS_DB_KOMPLETT_PASSWORT=$(head -c 32 /dev/urandom | base64 | tr -d '+/=\n' | cut -c 1-40)
printf "ALTER ROLE dms WITH LOGIN PASSWORD '%s';\n" "$DMS_DB_KOMPLETT_PASSWORT" | su-exec postgres psql -h "$SOCKET" -U postgres -qtA -v ON_ERROR_STOP=1 >/dev/null
# Erweiterung in der Datenbank von Ablago (#894), im eigenen Schema wie pg_trgm und unaccent (übersteht das
# Wiederherstellen). Gelingt es nicht, startet Ablago trotzdem; der Lasttest nennt dann den Grund.
# Ohne Superuser (#1354) darf dms die Werte lesen und zurücksetzen (pg_read_all_stats, pg_read_all_settings für
# shared_preload_libraries, Ausführen von pg_stat_statements_reset).
# Ohne Superuser (#1354) legt dms Erweiterungen nicht mehr selbst ins eigene Schema (bzw. zieht sie nicht um): pg_trgm
# und unaccent darum hier anlegen, bevor die Migrationen laufen – wie nach einer Wiederherstellung. Vorhandene bleiben.
su-exec postgres psql -h "$SOCKET" -U postgres -d dms -qtA -v ON_ERROR_STOP=1 \
  -c "CREATE SCHEMA IF NOT EXISTS erweiterungen_dms AUTHORIZATION dms" \
  -c "CREATE EXTENSION IF NOT EXISTS pg_trgm SCHEMA erweiterungen_dms" \
  -c "CREATE EXTENSION IF NOT EXISTS unaccent SCHEMA erweiterungen_dms" >/dev/null 2>&1 \
  || log "Hinweis: Erweiterungen pg_trgm und unaccent nicht angelegt – Ablago versucht es selbst."
su-exec postgres psql -h "$SOCKET" -U postgres -d dms -qtA -v ON_ERROR_STOP=1 \
  -c "CREATE EXTENSION IF NOT EXISTS pg_stat_statements SCHEMA erweiterungen_dms" \
  -c "GRANT pg_read_all_stats, pg_read_all_settings TO dms" \
  -c "GRANT EXECUTE ON FUNCTION erweiterungen_dms.pg_stat_statements_reset(oid, oid, bigint, boolean) TO dms" >/dev/null 2>&1 \
  || log "Hinweis: Erweiterung pg_stat_statements nicht angelegt – der Lasttest nennt die teuersten Abfragen dann nicht."

# Anbindung für Ablago: nur im Container, ohne Passwort. Der Einrichtungsassistent überspringt damit den Datenbank-Schritt.
# Steht DATABASE_URL nicht in der Compose-Datei, setzt erst dieses Skript sie: dann als „vom Image“ kennzeichnen,
# damit die Werkbank nicht rät, sie aus der Compose-Datei zu entfernen (#805).
# anfang-datenbank-variable (für den Test in server/test/umgebungsvariablen.test.ts)
if [ -z "${DATABASE_URL:-}" ]; then export DMS_DATENBANK_VOM_IMAGE=1; else unset DMS_DATENBANK_VOM_IMAGE; fi
export DATABASE_URL="postgres://dms@127.0.0.1:5432/dms"
# ende-datenbank-variable
export DMS_DB_KOMPLETT_PASSWORT
# Ablago übernimmt den Port vom Vorstart (#1250): Es bittet ihn mit SIGTERM um Freigabe, sobald es selbst lauschen will.
stand ablago
if [ -n "$VS" ] && kill -0 "$VS" 2>/dev/null; then export DMS_VORSTART_PID="$VS"; else unset DMS_VORSTART_PID; fi
# In einer Unter-Shell mit exec: $DMS ist die PID von Ablago selbst (Stopp und Warten unten).
# shellcheck disable=SC2086 # DMS_START ist ein Befehl mit Argumenten
(als_ablago_exec ${DMS_START:-node --enable-source-maps /app/server/dist/index.js}) &
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
  log "Stopp: beende Ablago."
  kill -TERM "$DMS" 2>/dev/null || true
  wait "$DMS" 2>/dev/null || true
  vorstart_ende
  pg_stopp
  [ -z "${WERKZEUGE_PID:-}" ] || kill -TERM "$WERKZEUGE_PID" 2>/dev/null || true
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
  log "FEHLER: PostgreSQL wurde beendet – beende auch Ablago."
  kill -TERM "$DMS" 2>/dev/null || true
  wait "$DMS" 2>/dev/null || true
  # Häufig: Speicher voll (#1250). Statt einer toten Adresse nennt die Seite den Grund, bis der Container neu startet.
  fehlerseite pg-beendet
  exit 1
fi
set +e
wait "$DMS"; CODE=$?
set -e
log "Ablago wurde beendet (Code $CODE)."
vorstart_ende
pg_stopp
exit "$CODE"
