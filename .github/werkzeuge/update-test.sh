#!/usr/bin/env bash
# Update-Test (#714): vom bisherigen Stand auf den neuen – so, wie ein Haushalt aktualisiert.
#   1. altes Image (dms-komplett) starten, einrichten, ein Dokument über den Eingangsordner ablegen,
#      eine Sicherung anlegen
#   2. Container entfernen, neues Image mit denselben Ordnern starten → alle Migrationen laufen durch
#   3. weiter eingerichtet, Anmeldung klappt, das Dokument ist da
#   4. Probe-Wiederherstellung der alten Sicherung mit der neuen Version gelingt
#
#   .github/werkzeuge/update-test.sh <altes Image> <neues Image>
#   z. B. .github/werkzeuge/update-test.sh ghcr.io/motom001/dms-komplett:stabil dms-komplett:probe
set -euo pipefail
ALT="${1:?altes Image angeben}"
NEU="${2:?neues Image angeben}"
PORT=18095
NAME=update-test
arbeit=$(mktemp -d)
jar=$(mktemp)
U="http://127.0.0.1:$PORT"
EMAIL=admin@probe.invalid
PASS=ein-langes-probe-passwort
aufraeumen() { docker rm -f "$NAME" >/dev/null 2>&1 || true; sudo rm -rf "$arbeit" 2>/dev/null || rm -rf "$arbeit" || true; rm -f "$jar"; }
trap aufraeumen EXIT
set -E
trap 'echo "::error::Update-Test: Zeile $LINENO: $BASH_COMMAND (Code $?)"; docker logs --tail 40 "$NAME" 2>&1 | sed "s/^/::error::/" || true' ERR
fehler() { echo "::error::Update-Test: $*"; docker logs --tail 60 "$NAME" 2>&1 || true; exit 1; }
# Keine Anfrage hängt unbegrenzt (#1369): Verbindung höchstens 10 s, ganze Anfrage höchstens 60 s.
curl() { command curl --connect-timeout 10 --max-time 60 "$@"; }

starte() {
  docker rm -f "$NAME" >/dev/null 2>&1 || true
  docker run -d --name "$NAME" -p "$PORT:3000" --stop-timeout 60 \
    -v "$arbeit/files:/data/files" -v "$arbeit/geheim:/data/geheim" -v "$arbeit/sicherung:/data/sicherung" -v "$arbeit/postgres:/data/postgres" -v "$arbeit/eingang:/eingang" \
    "$1" >/dev/null
}
warte() {
  for _ in $(seq 1 150); do
    curl -fsS "$U/api/konto/status" >/dev/null 2>&1 && return 0
    [ "$(docker inspect -f '{{.State.Running}}' "$NAME")" = true ] || fehler "Container läuft nicht mehr"
    sleep 2
  done
  fehler "Ablago antwortet nicht"
}
anmelden() {
  curl -fsS -c "$jar" -X POST "$U/api/konto/anmelden" -H 'x-dms: 1' -H 'content-type: application/json' \
    -d "{\"email\":\"$EMAIL\",\"passwort\":\"$PASS\"}" >/dev/null || fehler "Anmeldung scheitert ($1)"
  # Seit 0.192.0 (#819) braucht die Werkbank den Verwaltungsmodus; direkt nach der Anmeldung ohne erneute Abfrage.
  # Ältere Stände kennen die Route nicht (404) – das ist in Ordnung.
  curl -sS -b "$jar" -X POST "$U/api/konto/verwaltung" -H 'x-dms: 1' -H 'content-type: application/json' -d '{}' >/dev/null || true
}
api() { curl -fsS -b "$jar" -H 'x-dms: 1' -H 'content-type: application/json' "$@"; }
version() { docker exec "$NAME" dms status --json | jq -r '.dms.version // "?"'; }

echo "::group::1. Alter Stand: $ALT"
docker pull -q "$ALT" >/dev/null || fehler "altes Image $ALT nicht abrufbar"
starte "$ALT"; warte
code=$(sudo cat "$arbeit/geheim/EINRICHTUNGSCODE")
curl -fsS -X POST "$U/api/konto/einrichten" -H 'x-dms: 1' -H "x-einrichtungscode: $code" -H 'content-type: application/json' \
  -d "{\"mandant\":\"Familie Probe\",\"name\":\"Admin\",\"email\":\"$EMAIL\",\"passwort\":\"$PASS\"}" >/dev/null || fehler "Einrichten scheitert"
anmelden "alter Stand"
alt=$(version); echo "Alte Version: $alt"
api -X PUT "$U/api/werkbank/eingangsordner" -d '{"abstand":5}' >/dev/null || fehler "Eingangsordner einstellen"
printf '%%PDF-1.4\n%% Update-Test\n' | sudo tee "$arbeit/eingang/Update Probe.pdf" >/dev/null
mappe=""
for _ in $(seq 1 30); do
  mappe=$(api "$U/api/werkbank/eingangsordner" | jq -r '.uebernommen[0].mappeId // empty')
  [ -n "$mappe" ] && break; sleep 2
done
[ -n "$mappe" ] || fehler "Datei aus dem Eingangsordner nicht übernommen"
# Ohne Schlüssel keine Sicherung: wie im Assistenten unter Werkbank → Verschlüsselung erzeugen.
api -X POST "$U/api/werkbank/tresor/erzeugen" -d '{}' >/dev/null || fehler "Schlüssel erzeugen"
r=$(curl -sS -b "$jar" -H 'x-dms: 1' -H 'content-type: application/json' -X POST "$U/api/werkbank/sicherung/jetzt" -d '{}' -w '\n%{http_code}')
[ "$(tail -1 <<< "$r")" = 200 ] || fehler "Sicherung starten: $(head -1 <<< "$r")"
for _ in $(seq 1 90); do
  s=$(api "$U/api/werkbank/sicherung/lauf" | jq -r '.status // "keiner"')
  [ "$s" = laeuft ] || break; sleep 2
done
[ "$s" = fertig ] || fehler "Sicherung im alten Stand: $s"
sicherung=$(api "$U/api/werkbank/sicherung" | jq -r '.liste[0].name // empty')
[ -n "$sicherung" ] || fehler "keine Sicherung in der Liste"
echo "Mappe $mappe, Sicherung $sicherung"
docker stop "$NAME" >/dev/null
echo "::endgroup::"

echo "::group::2. Neuer Stand: $NEU"
starte "$NEU"; warte
neu=$(version); echo "Neue Version: $neu"
[ "$(curl -fsS "$U/api/konto/status" | jq -r '.einrichtungNoetig')" = false ] || fehler "nach dem Update wieder uneingerichtet"
anmelden "neuer Stand"
[ "$(api "$U/api/mappen/$mappe" | jq '.dokumente | length')" = 1 ] || fehler "Dokument nach dem Update nicht mehr da"
echo "::endgroup::"

echo "::group::3. Probe-Wiederherstellung der alten Sicherung"
api -X POST "$U/api/werkbank/sicherung/probe" -d "{\"name\":\"$sicherung\"}" >/dev/null || fehler "Probe-Wiederherstellung starten"
for _ in $(seq 1 150); do
  p=$(api "$U/api/werkbank/sicherung/probe" | jq -r '.status // "keiner"')
  [ "$p" = laeuft ] || break; sleep 2
done
[ "$p" = fertig ] || { api "$U/api/werkbank/sicherung/probe" | jq -c '.schritte' | sed 's/^/::error::/'; fehler "Probe-Wiederherstellung: $p"; }
echo "::endgroup::"
echo "::notice title=Update-Test::$alt → $neu: Migrationen, Daten und Probe-Wiederherstellung in Ordnung"
