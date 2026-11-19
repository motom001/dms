# shellcheck shell=sh
# Gemeinsame Teile der Start-Skripte beider Images (#1354), eingebunden mit „.“ von
# deploy/image/einstieg.sh (Image dms) und deploy/komplett/start.sh (dms-komplett). Vorher muss log() stehen.
#
# Ohne root (#1354): Das Start-Skript läuft als root, richtet ein und startet Ablago dann als eigener Benutzer:
# - Benutzer und Gruppe von Ablago (#1466): ohne PUID/PGID wie der Besitzer des Datenordners (die eingebundenen Ordner
#   unter /data), sonst die Vorgabe 1000:1000 (Benutzer „ablago“). Nie root, nie die Werkzeuge. PUID/PGID gehen vor.
# - Ordner unter /data: Das Skript ändert so wenig wie möglich – ohne PUID/PGID übernimmt es nur, was root gehört
#   (von Docker oder einer früheren Ablago als root angelegt), mit PUID/PGID wie bisher alles, was nicht genau
#   PUID:PGID gehört. Jede Änderung steht im Protokoll, auf der Startseite und im Systemzustand. Danach prüft es, ob
#   Ablago schreiben kann; wenn nicht, nennt es Ursache und Abhilfe mit den gesehenen Kennungen.
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

# Ist uid:gid als Benutzer von Ablago geeignet? Nie root (auch nicht über die Gruppe), nie die Kennung der
# Dokumentwerkzeuge und nicht postgres (dms-komplett: der Socket dort gilt „trust“).
kennung_tauglich() {
  case "$1:$2" in :* | *: | *[!0-9:]* | *:*:*) return 1 ;; esac
  [ "$1" != 0 ] && [ "$2" != 0 ] || return 1
  [ "$1" != "$WERKZEUG_UID" ] && [ "$2" != "$WERKZEUG_GID" ] || return 1
  pu=$(id -u postgres 2>/dev/null || true)
  pg=$(id -g postgres 2>/dev/null || true)
  [ -z "$pu" ] || [ "$1" != "$pu" ] || return 1
  [ -z "$pg" ] || [ "$2" != "$pg" ] || return 1
  return 0
}

# Eingehängt (Volume oder Bind-Mount)? Aus /proc/self/mountinfo, Feld 5 ist der Einhängepunkt, Feld 6 die Optionen.
EINHAENGEPUNKTE=${DMS_EINHAENGEPUNKTE:-/proc/self/mountinfo}
eingehaengt() { awk -v p="$1" '$5 == p { f = 1 } END { exit !f }' "$EINHAENGEPUNKTE" 2>/dev/null; }
# Liegt ein Ordner auf einem Volume bzw. Bind-Mount (er selbst oder /data ist eingebunden)? Sonst nur im Container.
auf_volume() { eingehaengt "$1" || eingehaengt "$DATEN_WURZEL"; }
schreibgeschuetzt() { awk -v p="$1" '$5 == p { r = ($6 ~ /(^|,)ro(,|$)/) } END { exit !r }' "$EINHAENGEPUNKTE" 2>/dev/null; }

# Besitzer des Datenordners (#1466): /data, wenn es selbst eingebunden ist, sonst der erste eingebundene Ordner
# darunter (files, geheim, sicherung, export – in den Vorlagen sind es diese). Der Ordner /data aus dem Image zählt nicht.
# Setzt DATEN_KENNUNG (uid:gid oder leer), DATEN_ORT und KENNUNG_GRUND (warum die Vorgabe gilt: root, system, ohne).
daten_kennung() {
  DATEN_KENNUNG=""
  DATEN_ORT=""
  KENNUNG_GRUND=ohne
  for o in "" files geheim sicherung export; do
    d="$DATEN_WURZEL${o:+/$o}"
    if [ ! -d "$d" ] || ! eingehaengt "$d"; then continue; fi
    k=$(stat -c %u:%g "$d" 2>/dev/null) || continue
    if kennung_tauglich "${k%%:*}" "${k#*:}"; then
      DATEN_KENNUNG=$k
      DATEN_ORT=$d
      KENNUNG_GRUND=""
      return 0
    fi
    if [ "$KENNUNG_GRUND" = ohne ]; then
      case "$k" in 0:* | *:0) KENNUNG_GRUND=root ;; *) KENNUNG_GRUND=system ;; esac
      DATEN_ORT=$d
    fi
  done
  return 0
}

# Benutzer von Ablago bestimmen und prüfen (#1354, #1466). Ergebnis 1 mit Meldung, wenn ungültig.
# - PUID oder PGID gesetzt: wie bisher (das andere 1000), Ordner werden für genau diese Kennungen übernommen.
# - Sonst Besitzer und Gruppe des Datenordners (daten_kennung), wenn tauglich; sonst die Vorgabe 1000:1000.
# Für Startseite, Systemzustand und „dms“ in der Konsole: Wahl und Herkunft im Merker und in DMS_KENNUNG_*.
benutzer_pruefen() {
  KENNUNG_VOLL=0
  if [ -n "${PUID:-}" ] || [ -n "${PGID:-}" ]; then
    KENNUNG_VOLL=1
    if [ -n "${PUID:-}" ]; then h_u=gesetzt; else h_u=vorgabe; fi
    if [ -n "${PGID:-}" ]; then h_g=gesetzt; else h_g=vorgabe; fi
    PUID=${PUID:-1000}
    PGID=${PGID:-1000}
    KENNUNG_GRUND=""
  else
    daten_kennung
    if [ -n "$DATEN_KENNUNG" ]; then
      PUID=${DATEN_KENNUNG%%:*}
      PGID=${DATEN_KENNUNG#*:}
      h_u=daten
      h_g=daten
    else
      PUID=1000
      PGID=1000
      h_u=vorgabe
      h_g=vorgabe
    fi
  fi
  case "$PUID$PGID" in *[!0-9]*)
    log "FEHLER: PUID und PGID müssen Zahlen sein (jetzt PUID=$PUID, PGID=$PGID)."
    PUID=1000 PGID=1000
    return 1
    ;;
  esac
  if [ "$PUID" = "$WERKZEUG_UID" ]; then
    log "FEHLER: PUID=$PUID ist der Benutzer der Dokumentwerkzeuge. Bitte eine andere Kennung wählen."
    PUID=1000 PGID=1000
    return 1
  fi
  [ "$PUID" = 0 ] && log "WARNUNG: PUID=0 – Ablago läuft als root. Das ist nur als Notbehelf gedacht."
  # Gruppe 0 nur, wenn sie ausdrücklich gesetzt ist (daten_kennung nimmt sie nie).
  [ "$PGID" != 0 ] || log "WARNUNG: PGID=0 – Ablago läuft mit der Gruppe root. Das ist nur als Notbehelf gedacht."
  # Gleiche Kennung wie beim letzten Start dieses Containers, aber jetzt „wie der Datenordner“: Den hat dann dieses
  # Skript selbst für die Vorgabe übernommen – die Herkunft bleibt „Vorgabe“, kein Hin und Her in der Anzeige.
  mkdir -p "$MERKER" 2>/dev/null || true
  m_k="" m_u="" m_g="" m_grund=""
  if [ -r "$MERKER/kennung" ]; then read -r m_k m_u m_g m_grund < "$MERKER/kennung" || true; fi
  [ "$m_grund" != - ] || m_grund=""
  if [ "$h_u $h_g" = "daten daten" ] && [ "${m_k:-}" = "$PUID:$PGID" ] && [ "${m_u:-} ${m_g:-}" = "vorgabe vorgabe" ]; then
    h_u=vorgabe
    h_g=vorgabe
    KENNUNG_GRUND=${m_grund:-}
  fi
  DMS_KENNUNG_HERKUNFT="$h_u $h_g"
  DMS_KENNUNG_GRUND=$KENNUNG_GRUND
  DMS_RECHTE_MERKER=$MERKER
  export PUID PGID DMS_KENNUNG_HERKUNFT DMS_KENNUNG_GRUND DMS_RECHTE_MERKER
  # Lesbar für alle im Container: ablago-als (docker exec … dms) liest die Kennung daraus.
  { printf '%s %s %s %s\n' "$PUID:$PGID" "$h_u" "$h_g" "${KENNUNG_GRUND:--}" > "$MERKER/kennung.neu" \
    && chmod 644 "$MERKER/kennung.neu" && mv -f "$MERKER/kennung.neu" "$MERKER/kennung"; } 2>/dev/null || true
  log "$(kennung_satz)"
  return 0
}

# Ein Satz fürs Protokoll: welcher Benutzer und warum (#1466).
kennung_satz() {
  case "$DMS_KENNUNG_HERKUNFT" in
    "daten daten") echo "Ablago läuft als Benutzer $PUID und Gruppe $PGID – wie der Besitzer des Datenordners ($DATEN_ORT)." ;;
    "vorgabe vorgabe")
      case "$KENNUNG_GRUND" in
        root) echo "Ablago läuft als Benutzer $PUID und Gruppe $PGID – Vorgabe, weil der Datenordner ($DATEN_ORT) root gehört." ;;
        system) echo "Ablago läuft als Benutzer $PUID und Gruppe $PGID – Vorgabe, weil der Datenordner ($DATEN_ORT) einem Systembenutzer des Containers gehört." ;;
        *) echo "Ablago läuft als Benutzer $PUID und Gruppe $PGID – Vorgabe, weil kein eigener Datenordner eingebunden ist." ;;
      esac
      ;;
    *) echo "Ablago läuft als Benutzer $PUID und Gruppe $PGID – aus PUID/PGID in der Compose-Datei (nicht gesetzt: 1000)." ;;
  esac
}

# Änderung merken (#1466): eine Zeile je Änderung – Protokoll hier, Startseite und Systemzustand lesen die Datei.
# Felder: Zeit (s), Art (besitzer: gehörte root bzw. einem anderen Benutzer; rechte: o-rwx; geheim: go-rwx an
# Dateien mit Schlüsseln), Ordner, Anzahl, neuer Besitzer.
aenderung() {
  printf '%s %s %s %s %s\n' "$(date +%s)" "$1" "$2" "$3" "$PUID:$PGID" >> "$MERKER/aenderungen" 2>/dev/null || true
  chmod 644 "$MERKER/aenderungen" 2>/dev/null || true
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
  # shellcheck disable=SC2016 # $1 und $$ gehören der inneren Shell
  als_ablago sh -c 'f="$1/.ablago-schreibprobe.$$"; : > "$f" && rm -f "$f"' probe "$1" 2>/dev/null
}

# Ordner unter /data einmal übernehmen und prüfen. Ergebnis 1, wenn Ablago in einen davon nicht schreiben kann.
# So wenig wie möglich ändern (#1466):
# - Was dem Benutzer von Ablago schon gehört, bleibt, wie es ist – auch Gruppe und Rechte anderer.
# - Ohne PUID/PGID übernimmt das Skript nur, was root gehört (von Docker oder einer früheren Ablago als root angelegt).
#   Einträge anderer Benutzer lässt es stehen und nennt sie im Protokoll. Mit PUID/PGID wie bisher alles, was nicht
#   genau PUID:PGID gehört.
# - o-rwx nur an einem der vier Ordner, den das Skript selbst angelegt oder eben übernommen hat: Andere Benutzer im
#   Container (die Dokumentwerkzeuge) sollen ihn nicht auflisten. Ordner des NAS-Benutzers bleiben unberührt; die
#   Dateien darin legt Ablago ohnehin nur für sich selbst an (0600, Ordner 0700).
# - geheim: Dateien mit Schlüsseln, die Gruppe oder andere lesen könnten, bekommen go-rwx – das ist zwingend.
# Jede Änderung steht im Protokoll und im Merker (Startseite, Systemzustand).
ordner_uebernehmen() {
  [ "$ALS_ROOT" = 1 ] || return 0
  mkdir -p "$MERKER" 2>/dev/null || true
  rm -f "$MERKER/fehler" "$MERKER/vorschlag" 2>/dev/null || true
  mkdir -p "$DATEN_WURZEL" 2>/dev/null || true
  # /data selbst (darin legt Ablago fehlende Ordner an): nur der Ordner, nicht der Inhalt. Liegt er nur im Container,
  # immer; ist er eingebunden, mit PUID/PGID wie bisher, sonst nur, wenn er root gehört.
  k=$(stat -c %u:%g "$DATEN_WURZEL" 2>/dev/null || echo "")
  if [ "$k" != "$PUID:$PGID" ]; then
    if ! eingehaengt "$DATEN_WURZEL"; then
      chown "$PUID:$PGID" "$DATEN_WURZEL" 2>/dev/null || true
    elif [ "$KENNUNG_VOLL" = 1 ] || [ "${k%%:*}" = 0 ]; then
      chown "$PUID:$PGID" "$DATEN_WURZEL" 2>/dev/null && aenderung besitzer "$DATEN_WURZEL" 1
    fi
  fi
  fehlt=""
  for o in files geheim sicherung export; do
    d="$DATEN_WURZEL/$o"
    neu=0
    if [ ! -d "$d" ]; then mkdir -p "$d" 2>/dev/null && neu=1; fi
    [ -d "$d" ] || continue
    vorher=$(stat -c %u "$d" 2>/dev/null || echo "")
    if [ "$(cat "$MERKER/$o" 2>/dev/null)" != "$PUID:$PGID" ] || [ "$vorher" != "$PUID" ]; then
      ordner_angleichen "$d"
      # Andere Benutzer im Container (die Dokumentwerkzeuge) kommen nicht hinein – nur, wenn der Ordner jetzt erst
      # Ablago gehört (selbst angelegt oder eben übernommen). Besitzer und Gruppe behalten ihre Rechte.
      if [ "$neu" = 1 ] || { [ "$vorher" != "$PUID" ] && [ "$(stat -c %u "$d" 2>/dev/null)" = "$PUID" ]; }; then
        case "$(stat -c %a "$d" 2>/dev/null)" in
          *0) ;;
          *)
            if chmod o-rwx "$d" 2>/dev/null && auf_volume "$d"; then
              aenderung rechte "$d" 1
              log "Ohne root (#1354): $d – andere Benutzer im Container haben keinen Zugriff mehr (o-rwx), weil der Ordner jetzt Ablago gehört."
            fi
            ;;
        esac
      fi
    fi
    [ "$o" = geheim ] && geheim_schuetzen "$d"
    if schreibbar "$d"; then
      echo "$PUID:$PGID" > "$MERKER/$o" 2>/dev/null || true
    else
      fehlt="$fehlt $d"
      r=0
      schreibgeschuetzt "$d" && r=1
      printf '%s %s %s %s\n' "$o" "$(stat -c %u:%g "$d" 2>/dev/null || echo ?:?)" "$(stat -c %a "$d" 2>/dev/null || echo ?)" "$r" >> "$MERKER/fehler" 2>/dev/null || true
    fi
  done
  [ ! -f "$MERKER/fehler" ] || chmod 644 "$MERKER/fehler" 2>/dev/null || true
  if [ -n "$fehlt" ]; then
    rechte_abhilfe
    return 1
  fi
  return 0
}

# Einträge eines Ordners für PUID:PGID übernehmen (siehe oben), mit Meldung und Merker. Ein Ordner, der nicht
# eingebunden ist, liegt nur im Container (im Image gehört er 1000:1000): Den übernimmt das Skript ganz, ohne Eintrag
# in den Änderungen – auf dem NAS ändert sich dadurch nichts.
ordner_angleichen() {
  intern=0
  auf_volume "$1" || intern=1
  if [ "$KENNUNG_VOLL" = 1 ] || [ "$intern" = 1 ]; then
    set -- "$1" ! -user "$PUID" -o ! -group "$PGID"
  else
    set -- "$1" -user 0
  fi
  d=$1
  shift
  if [ -n "$(find "$d" \( "$@" \) -print 2>/dev/null | head -n 1)" ]; then
    if [ "$intern" = 1 ]; then
      find "$d" \( "$@" \) -exec chown -h "$PUID:$PGID" {} + 2>/dev/null || true
      log "Ohne root (#1466): $d liegt nur im Container (kein Volume) und gehört jetzt Benutzer $PUID und Gruppe $PGID."
      return 0
    fi
    # Startseite gleich zeigen (#1250); in dms-komplett läuft der Vorstart schon.
    stand rechte
    vorstart
    if [ "$KENNUNG_VOLL" = 1 ]; then wem="nicht Benutzer $PUID und Gruppe $PGID gehört"; art=besitzer; else wem="root gehört"; art=besitzer-root; fi
    log "Ohne root (#1354): übernehme $d für Benutzer $PUID und Gruppe $PGID (was $wem) – einmalig, bei vielen Dateien dauert das etwas."
    n=$(find "$d" \( "$@" \) -exec chown -h "$PUID:$PGID" {} + -print 2>/dev/null | wc -l)
    n=$((n + 0))
    rest=$(find "$d" \( "$@" \) -print 2>/dev/null | wc -l)
    rest=$((rest + 0))
    [ "$n" -le "$rest" ] || aenderung "$art" "$d" $((n - rest))
    [ "$rest" = 0 ] || log "WARNUNG: $rest Einträge in $d ließen sich nicht übernehmen (z. B. schreibgeschützt oder Netzwerkfreigabe mit root_squash)."
  fi
  # Ohne PUID/PGID: Einträge anderer Benutzer bleiben – nur nennen.
  if [ "$KENNUNG_VOLL" != 1 ] && [ "$intern" = 0 ]; then
    fremd=$(find "$d" ! -user "$PUID" ! -user 0 -print 2>/dev/null | head -n 1)
    if [ -n "$fremd" ]; then
      log "Hinweis: In $d gehört nicht alles Ablago (z. B. $(stat -c %u:%g "$fremd" 2>/dev/null) an $fremd). Ablago lässt es unverändert; kann es eine Datei nicht lesen, steht das beim Zugriff im Protokoll."
    fi
  fi
}

# geheim (#1466): Dateien, die Gruppe oder andere lesen oder schreiben könnten, nur noch für Ablago – zwingend, sonst
# könnte jeder in der Gruppe des NAS die Schlüssel lesen. Ablago legt sie selbst ohnehin mit 0600 an.
geheim_schuetzen() {
  n=$(find "$1" -type f -user "$PUID" \( -perm -004 -o -perm -040 -o -perm -002 -o -perm -020 \) \
    -exec chmod go-rwx {} + -print 2>/dev/null | wc -l)
  n=$((n + 0))
  if [ "$n" -gt 0 ]; then
    aenderung geheim "$1" "$n"
    log "Ohne root (#1466): $n Dateien in $1 waren für Gruppe oder andere lesbar und sind jetzt nur noch für Ablago (go-rwx) – dort liegen Schlüssel."
  fi
}

# Kann Ablago nicht schreiben: Ursache und Abhilfe mit den Werten, die das Skript gesehen hat, als fertige Zeilen.
rechte_abhilfe() {
  vorschlag=""
  while read -r o k a r; do
    d="$DATEN_WURZEL/$o"
    if [ "$r" = 1 ]; then
      log "FEHLER: Ablago (Benutzer $PUID, Gruppe $PGID) kann nicht in $d schreiben: Der Ordner ist schreibgeschützt eingebunden (:ro). Abhilfe: in der Compose-Datei bei $d die Angabe :ro entfernen. $HILFE_RECHTE"
      continue
    fi
    log "FEHLER: Ablago (Benutzer $PUID, Gruppe $PGID) kann nicht in $d schreiben. Der Ordner gehört $k (Rechte $a), und die Rechte ließen sich nicht übernehmen (z. B. Netzwerkfreigabe mit root_squash, ACLs)."
    [ -n "$vorschlag" ] || ! kennung_tauglich "${k%%:*}" "${k#*:}" || [ "$k" = "$PUID:$PGID" ] || vorschlag=$k
  done < "$MERKER/fehler"
  if [ -n "$vorschlag" ]; then
    { echo "$vorschlag" > "$MERKER/vorschlag" && chmod 644 "$MERKER/vorschlag"; } 2>/dev/null || true
    log "Abhilfe 1 – Ablago als Besitzer des Ordners laufen lassen: in der Compose-Datei unter environment eintragen und den Container neu starten:"
    log "      PUID: \"${vorschlag%%:*}\""
    log "      PGID: \"${vorschlag#*:}\""
    log "Abhilfe 2 – oder auf dem NAS den eingebundenen Ordner Ablago geben: sudo chown -R $PUID:$PGID <Ordner auf dem NAS>. $HILFE_RECHTE"
  else
    log "Abhilfe: auf dem NAS den eingebundenen Ordner Ablago geben: sudo chown -R $PUID:$PGID <Ordner auf dem NAS>, oder PUID und PGID auf den Besitzer der Ordner setzen (ls -ln zeigt die Zahlen). $HILFE_RECHTE"
  fi
}

# Eingangsordner (#195): gehört meist dem Benutzer des Scanners. Nur übernehmen, was root gehört (von Docker oder
# der bisherigen Ablago angelegt); fehlt das Schreibrecht, eine Warnung – Ablago startet trotzdem.
eingang_pruefen() {
  e=${DMS_EINGANG:-/eingang}
  [ "$ALS_ROOT" = 1 ] && [ -d "$e" ] || return 0
  n=$(find "$e" -user 0 -exec chown -h "$PUID:$PGID" {} + -print 2>/dev/null | wc -l)
  n=$((n + 0))
  if [ "$n" -gt 0 ]; then
    aenderung besitzer-root "$e" "$n"
    log "Ohne root (#1354): $n Einträge im Eingangsordner $e gehörten root und gehören jetzt Benutzer $PUID und Gruppe $PGID."
  fi
  schreibbar "$e" && return 0
  log "WARNUNG: Ablago (Benutzer $PUID, Gruppe $PGID) kann im Eingangsordner $e nichts verschieben. Der Ordner gehört $(stat -c %u:%g "$e" 2>/dev/null). Bitte PUID/PGID auf den Besitzer des Ordners setzen oder ihm Schreibrechte für Ablago geben. $HILFE_RECHTE"
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
