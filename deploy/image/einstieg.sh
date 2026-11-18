#!/bin/sh
# Einstieg des Images dms (#1354): läuft als root, richtet ein und startet dann den Befehl (Vorgabe: Ablago) als
# eigener Benutzer – Einzelheiten in start-hilfen.sh. dms-komplett hat sein eigenes Start-Skript (deploy/komplett/start.sh)
# mit denselben Hilfen.
#
# - Ordner unter /data einmal übernehmen; kann Ablago danach in einen nicht schreiben, zeigt die Startseite den Grund
#   (Vorstart, #1250) und der Container endet nach einigen Minuten.
# - Werkzeugdienst starten, dann den Befehl mit exec als PUID:PGID (tini bleibt PID 1 und gibt Signale weiter).
# - Läuft der Container schon ohne root (docker run --user): nur den Befehl starten.
set -eu
log() { echo "[ablago] $*"; }
# shellcheck source=deploy/image/start-hilfen.sh disable=SC1091
. "${DMS_START_HILFEN:-/usr/local/lib/ablago/start-hilfen.sh}"

if [ "$ALS_ROOT" != 1 ]; then
  log "Container läuft ohne root (Benutzer $(id -u)): Dokumentwerkzeuge ohne eigenen Benutzer, aber mit Grenzen."
  exec "$@"
fi

if ! benutzer_pruefen; then
  fehlerseite daten-rechte
  exit 1
fi
DMS_VORSTART_SEIT=$(date +%s)
export DMS_VORSTART_SEIT
if ! ordner_uebernehmen; then
  fehlerseite daten-rechte
  exit 1
fi
eingang_pruefen
werkzeuge_starten
# Lief der Vorstart beim Übernehmen, übernimmt Ablago den Port von ihm ohne Lücke (#1250).
if [ -n "$VS" ] && kill -0 "$VS" 2>/dev/null; then
  stand ablago
  export DMS_VORSTART_PID="$VS"
fi
exec setpriv --reuid="$PUID" --regid="$PGID" --groups="$WERKZEUG_GID" --no-new-privs -- env HOME=/tmp "$@"
