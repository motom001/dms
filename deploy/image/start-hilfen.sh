# shellcheck shell=sh
# Gemeinsame Teile der Start-Skripte beider Images (#1354), eingebunden mit „.“ von
# deploy/image/einstieg.sh (Image dms) und deploy/komplett/start.sh (dms-komplett). Vorher muss log() stehen.
#
# Ohne root (#1354): Das Start-Skript läuft als root, richtet ein und startet Ablago dann als eigener Benutzer:
# - PUID/PGID (Vorgabe 1000:1000, Benutzer „ablago“): Benutzer und Gruppe von Ablago. Auf einem NAS am besten die
#   Kennungen des Benutzers, dem die eingebundenen Ordner gehören sollen.
# - Ordner unter /data: Einmal nach dem Update übernimmt das Skript, was noch root (oder einem anderen Benutzer)
#   gehört, für PUID:PGID – auf dem Datenträger des NAS, mit klarer Meldung. Andere Benutzer verlieren das Recht auf
#   die vier Ordner selbst (o-rwx); Besitzer und Gruppe behalten ihre. Danach prüft es, ob Ablago schreiben kann.
# - Dokumentwerkzeuge (poppler, qpdf): laufen im Werkzeugdienst als „ablago-werkzeug“ (61000), getrennt von Ablago,
#   mit Speicher-, Zeit- und Dateigrenze (server/src/prozesse/werkzeugdienst.ts). Ablago gehört dazu der Gruppe des
#   Werkzeugdienstes an (gemeinsamer Arbeitsordner), sonst keine weiteren Rechte.
# - Wechsel des Benutzers mit setpriv (util-linux): Benutzer, Gruppe und Zusatzgruppen als Zahlen, ohne Eintrag in
#   /etc/passwd, und „no_new_privs“ – kein Programm kann danach wieder Rechte gewinnen. Braucht keine Capabilities
#   außer denen, die root im Container ohnehin hat.
# - Läuft der Container schon ohne root (docker run --user), geht nichts davon: Ablago startet direkt, die Werkzeuge
#   dann unter seinem Benutzer, aber mit denselben Grenzen.

WERKZEUG_UID=61000
WERKZEUG_GID=61000
WERKZEUG_WURZEL=${DMS_WERKZEUG_WURZEL:-/run/ablago-werkzeuge}
DATEN_WURZEL=${DMS_DATEN_WURZEL:-/data}
# Merker je Container (nicht im Volume): Ordner schon übernommen – ein Neustart durchsucht sie nicht noch einmal.
MERKER=${DMS_RECHTE_MERKER:-/var/lib/ablago/rechte}
HILFE_RECHTE="Hilfe: https://help.ablago.app/admin/aktuell/aktualisieren/#ohne-root"

ALS_ROOT=0
[ "$(id -u)" = 0 ] && ALS_ROOT=1

# Vorstart (#1250): Schritt für die Seite in eine Datei (eine Zeile), der Vorstart liest sie. Für die Probe ohne
# Container lässt er sich abschalten (DMS_VORSTART=true) oder umstellen.
VORSTART_DATEI=${DMS_VORSTART_DATEI:-/tmp/ablago-vorstart}
# Nach einem Fehler vor Ablago so lange die Seite mit dem Grund zeigen, dann endet der Container (Docker startet ihn neu).
FEHLER_WARTEN_S=${DMS_START_FEHLER_WARTEN_S:-300}
VS=""
stand() { { printf '%s\n' "$1" > "$VORSTART_DATEI.neu" && mv -f "$VORSTART_DATEI.neu" "$VORSTART_DATEI"; } 2>/dev/null || true; }
vorstart() {
  if [ -n "$VS" ] && kill -0 "$VS" 2>/dev/null; then return 0; fi
  export DMS_VORSTART_DATEI="$VORSTART_DATEI"
  # In einer Unter-Shell mit exec: $! ist dann die PID des Vorstarts selbst (Ablago schickt ihr SIGTERM, #1250).
  # shellcheck disable=SC2086 # DMS_VORSTART ist ein Befehl mit Argumenten
  (als_ablago_exec ${DMS_VORSTART:-node /app/server/dist/vorstart.js}) &
  VS=$!
}
vorstart_ende() {
  if [ -n "$VS" ]; then kill -TERM "$VS" 2>/dev/null || true; wait "$VS" 2>/dev/null || true; fi
  VS=""
}
# Grund auf der Seite zeigen, eine Weile warten, dann zurück (der Aufrufer beendet mit exit 1).
fehlerseite() {
  stand "fehler $1"
  vorstart
  if [ "$FEHLER_WARTEN_S" -gt 0 ] 2>/dev/null; then
    log "Die Seite unter dem Port nennt den Grund. Der Container endet in $FEHLER_WARTEN_S s und startet dann neu."
    trap 'vorstart_ende; exit 1' TERM INT
    sleep "$FEHLER_WARTEN_S" & wait $! || true
    trap - TERM INT
  fi
  vorstart_ende
}

# PUID/PGID prüfen. Ergebnis 1 mit Meldung, wenn ungültig.
benutzer_pruefen() {
  PUID=${PUID:-1000}
  PGID=${PGID:-1000}
  case "$PUID$PGID" in *[!0-9]*) log "FEHLER: PUID und PGID müssen Zahlen sein (jetzt PUID=$PUID, PGID=$PGID)."; return 1 ;; esac
  if [ "$PUID" = "$WERKZEUG_UID" ]; then
    log "FEHLER: PUID=$PUID ist der Benutzer der Dokumentwerkzeuge. Bitte eine andere Kennung wählen."
    return 1
  fi
  [ "$PUID" = 0 ] && log "WARNUNG: PUID=0 – Ablago läuft als root. Das ist nur als Notbehelf gedacht."
  export PUID PGID
  return 0
}

# Befehl als Ablago (PUID:PGID, Zusatzgruppe der Werkzeuge). Ohne root: unverändert.
als_ablago() {
  if [ "$ALS_ROOT" = 1 ]; then
    HOME=/tmp setpriv --reuid="$PUID" --regid="$PGID" --groups="$WERKZEUG_GID" --no-new-privs -- "$@"
  else
    "$@"
  fi
}
# Dasselbe mit exec – für „(als_ablago_exec …) &“: Die PID im Hintergrund ist dann die des Programms.
als_ablago_exec() {
  if [ "$ALS_ROOT" = 1 ]; then
    HOME=/tmp
    export HOME
    exec setpriv --reuid="$PUID" --regid="$PGID" --groups="$WERKZEUG_GID" --no-new-privs -- "$@"
  fi
  exec "$@"
}

# Schreibprobe als Ablago in einem Ordner.
schreibbar() {
  als_ablago sh -c 'f="$1/.ablago-schreibprobe.$$"; : > "$f" && rm -f "$f"' probe "$1" 2>/dev/null
}

# Ordner unter /data einmal übernehmen und prüfen. Ergebnis 1, wenn Ablago in einen davon nicht schreiben kann.
ordner_uebernehmen() {
  [ "$ALS_ROOT" = 1 ] || return 0
  mkdir -p "$MERKER" 2>/dev/null || true
  mkdir -p "$DATEN_WURZEL" 2>/dev/null || true
  # /data selbst (darin legt Ablago fehlende Ordner an, z. B. export): nur der Ordner, nicht der Inhalt.
  [ "$(stat -c %u:%g "$DATEN_WURZEL" 2>/dev/null)" = "$PUID:$PGID" ] || chown "$PUID:$PGID" "$DATEN_WURZEL" 2>/dev/null || true
  fehlt=""
  for o in files geheim sicherung export; do
    d="$DATEN_WURZEL/$o"
    mkdir -p "$d" 2>/dev/null || true
    [ -d "$d" ] || continue
    if [ "$(cat "$MERKER/$o" 2>/dev/null)" != "$PUID:$PGID" ] || [ "$(stat -c %u:%g "$d" 2>/dev/null)" != "$PUID:$PGID" ]; then
      if [ -n "$(find "$d" \( ! -user "$PUID" -o ! -group "$PGID" \) -print 2>/dev/null | head -n 1)" ]; then
        # Startseite gleich zeigen (#1250); in dms-komplett läuft der Vorstart schon.
        stand rechte
        vorstart
        log "Ohne root (#1354): übernehme $d für Benutzer $PUID und Gruppe $PGID – einmalig, bei vielen Dateien dauert das etwas."
        find "$d" \( ! -user "$PUID" -o ! -group "$PGID" \) -exec chown -h "$PUID:$PGID" {} + 2>/dev/null || true
      fi
    fi
    # Andere Benutzer im Container (die Dokumentwerkzeuge) kommen nicht hinein; Besitzer und Gruppe behalten ihre Rechte.
    chmod o-rwx "$d" 2>/dev/null || true
    if schreibbar "$d"; then
      echo "$PUID:$PGID" > "$MERKER/$o" 2>/dev/null || true
    else
      fehlt="$fehlt $d"
    fi
  done
  if [ -n "$fehlt" ]; then
    for d in $fehlt; do
      log "FEHLER: Ablago (Benutzer $PUID, Gruppe $PGID) kann nicht in $d schreiben, und die Rechte ließen sich nicht übernehmen (z. B. Netzwerkfreigabe mit root_squash)."
    done
    log "Abhilfe: PUID und PGID auf den Besitzer der Ordner auf dem NAS setzen (ls -ln zeigt die Zahlen), oder auf dem NAS einmal: chown -R $PUID:$PGID <Ordner>. $HILFE_RECHTE"
    return 1
  fi
  return 0
}

# Eingangsordner (#195): gehört meist dem Benutzer des Scanners. Nur übernehmen, was root gehört (von Docker oder
# der bisherigen Ablago angelegt); fehlt das Schreibrecht, eine Warnung – Ablago startet trotzdem.
eingang_pruefen() {
  e=${DMS_EINGANG:-/eingang}
  [ "$ALS_ROOT" = 1 ] && [ -d "$e" ] || return 0
  find "$e" -user 0 -exec chown -h "$PUID:$PGID" {} + 2>/dev/null || true
  schreibbar "$e" && return 0
  log "WARNUNG: Ablago (Benutzer $PUID, Gruppe $PGID) kann im Eingangsordner $e nichts verschieben. Bitte PUID/PGID auf den Besitzer des Ordners setzen oder ihm Schreibrechte für Ablago geben. $HILFE_RECHTE"
}

# Werkzeugdienst starten (als ablago-werkzeug) und neu starten, falls er endet. Setzt DMS_WERKZEUG_DIENST/-ARBEIT.
werkzeuge_starten() {
  [ "$ALS_ROOT" = 1 ] || return 0
  mkdir -p "$WERKZEUG_WURZEL/arbeit" "$WERKZEUG_WURZEL/heim" "$WERKZEUG_WURZEL/dienst"
  # Arbeitsordner von einem früheren Lauf leeren (Container neu gestartet).
  find "$WERKZEUG_WURZEL/arbeit" -mindepth 1 -maxdepth 1 -exec rm -rf {} + 2>/dev/null || true
  chown "0:$WERKZEUG_GID" "$WERKZEUG_WURZEL" "$WERKZEUG_WURZEL/arbeit" || true
  chown "$WERKZEUG_UID:$WERKZEUG_GID" "$WERKZEUG_WURZEL/heim" "$WERKZEUG_WURZEL/dienst" || true
  # Wurzel: nur die Gruppe kommt hinein. arbeit: Gruppe darf anlegen, aber nicht auflisten; setgid vererbt die Gruppe,
  # sticky: niemand löscht, was ihm nicht gehört. heim: nur die Werkzeuge (fontconfig-Zwischenspeicher). dienst: der
  # Socket; die Gruppe (Ablago) darf hinein, anlegen darf dort nur der Werkzeugdienst.
  chmod 0750 "$WERKZEUG_WURZEL" "$WERKZEUG_WURZEL/dienst" || true
  chmod 3730 "$WERKZEUG_WURZEL/arbeit" || true
  chmod 0700 "$WERKZEUG_WURZEL/heim" || true
  DMS_WERKZEUG_DIENST="$WERKZEUG_WURZEL/dienst/werkzeuge.sock"
  DMS_WERKZEUG_ARBEIT="$WERKZEUG_WURZEL/arbeit"
  (
    set +e
    trap 'exit 0' TERM INT
    while :; do
      env -i PATH="$PATH" HOME="$WERKZEUG_WURZEL/heim" LANG="${LANG:-C.UTF-8}" TZ="${TZ:-}" \
        DMS_WERKZEUG_DIENST="$DMS_WERKZEUG_DIENST" DMS_WERKZEUG_SPEICHER_MB="${DMS_WERKZEUG_SPEICHER_MB:-}" \
        setpriv --reuid="$WERKZEUG_UID" --regid="$WERKZEUG_GID" --clear-groups --no-new-privs -- \
        node --max-old-space-size=64 /app/server/dist/werkzeugdienst.js
      log "Werkzeugdienst beendet – startet in 1 s neu."
      sleep 1
    done
  ) &
  # shellcheck disable=SC2034 # benutzt deploy/komplett/start.sh beim Stopp
  WERKZEUGE_PID=$!
  export DMS_WERKZEUG_DIENST DMS_WERKZEUG_ARBEIT
  i=0
  while [ ! -S "$DMS_WERKZEUG_DIENST" ] && [ "$i" -lt 50 ]; do sleep 0.1; i=$((i + 1)); done
  [ -S "$DMS_WERKZEUG_DIENST" ] || log "WARNUNG: Der Werkzeugdienst antwortet noch nicht – Ablago versucht es weiter."
}
