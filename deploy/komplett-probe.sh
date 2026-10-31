#!/usr/bin/env bash
# Probe für dms-komplett (#208), läuft in der CI auf amd64 und arm64 (image.yml):
#   1. starten → DMS antwortet, Assistent beginnt beim Konto (Datenbank angebunden, kein Passwort)
#   2. einrichten (mit dem Code aus geheim/), neu starten → eingerichtet, Anmeldung klappt
#   3. docker stop → PostgreSQL sauber heruntergefahren, Exit-Code 0
#   4. Prozess abschießen → Container endet
#   5. Ordner einer anderen PostgreSQL-Hauptversion → Container startet nicht
#
#   deploy/komplett-probe.sh <image>      z. B. deploy/komplett-probe.sh dms-komplett:probe
set -euo pipefail
IMAGE="${1:?Image angeben, z. B. dms-komplett:probe}"
PORT=18090
arbeit=$(mktemp -d)
NAME=probe-komplett
aufraeumen() { docker rm -f "$NAME" "$NAME-alt" >/dev/null 2>&1 || true; sudo rm -rf "$arbeit" 2>/dev/null || rm -rf "$arbeit" || true; }
trap aufraeumen EXIT
# Job-Logs sind nicht überall lesbar: jeden unerwarteten Fehler als Anmerkung melden.
set -E
trap 'echo "::error::dms-komplett: Zeile $LINENO: $BASH_COMMAND (Code $?)"; docker logs --tail 40 "$NAME" 2>&1 | sed "s/^/::error::/" || true' ERR
fehler() { echo "::error::dms-komplett: $*"; docker logs --tail 60 "$NAME" 2>&1 || true; exit 1; }

starte() {
  docker run -d --name "$NAME" -p "$PORT:3000" --stop-timeout 60 \
    -v "$arbeit/files:/data/files" -v "$arbeit/geheim:/data/geheim" -v "$arbeit/sicherung:/data/sicherung" -v "$arbeit/postgres:/data/postgres" -v "$arbeit/eingang:/eingang" \
    "$IMAGE" >/dev/null
}
warte() {
  for _ in $(seq 1 90); do
    curl -fsS "http://127.0.0.1:$PORT/api/konto/status" >/dev/null 2>&1 && return 0
    [ "$(docker inspect -f '{{.State.Running}}' "$NAME")" = true ] || fehler "Container läuft nicht mehr"
    sleep 2
  done
  fehler "DMS antwortet nicht"
}

echo "::group::1. Erster Start"
starte; warte
s=$(curl -fsS "http://127.0.0.1:$PORT/api/konto/status"); echo "$s" | jq -c '{einrichtungNoetig, einrichtung}'
[ "$(echo "$s" | jq -r '.einrichtung.phase')" = konto ] || fehler "Assistent beginnt nicht beim Mandanten (Datenbank nicht angebunden?)"
sudo test -s "$arbeit/postgres/daten/PG_VERSION" || fehler "keine Datenbank unter /data/postgres/daten"
echo "::notice::dms-komplett enthält $(docker exec "$NAME" postgres --version)"
# Offline-Hilfe (#219): Startseite und eine Seite je Handbuch, ohne Anmeldung.
for h in "" benutzer/ admin/ installieren/ entwickler/ admin/sicherung/; do
  curl -fsS "http://127.0.0.1:$PORT/hilfe/$h" | grep -q "<html" || fehler "Hilfe /hilfe/$h fehlt"
done
echo "::notice::Offline-Hilfe: $(docker exec "$NAME" du -sh /app/web/dist/hilfe | cut -f1)"
echo "::endgroup::"; echo "::notice::dms-komplett: Schritt erledigt"

echo "::group::2. Einrichten und Neustart"
code=$(sudo cat "$arbeit/geheim/EINRICHTUNGSCODE")
curl -fsS -X POST "http://127.0.0.1:$PORT/api/konto/einrichten" -H 'x-dms: 1' -H "x-einrichtungscode: $code" -H 'content-type: application/json' \
  -d '{"mandant":"Familie Probe","name":"Admin","email":"admin@probe.invalid","passwort":"ein-langes-probe-passwort"}' >/dev/null || fehler "Einrichten scheitert"
docker restart "$NAME" >/dev/null; warte
[ "$(curl -fsS "http://127.0.0.1:$PORT/api/konto/status" | jq -r '.einrichtungNoetig')" = false ] || fehler "nach dem Neustart wieder uneingerichtet"
curl -fsS -X POST "http://127.0.0.1:$PORT/api/konto/anmelden" -H 'x-dms: 1' -H 'content-type: application/json' \
  -d '{"email":"admin@probe.invalid","passwort":"ein-langes-probe-passwort"}' >/dev/null || fehler "Anmeldung nach dem Neustart scheitert"
docker exec "$NAME" pg_isready -q -h 127.0.0.1 -U dms -d dms || fehler "pg_isready im Container"
# Von außen ist PostgreSQL nicht erreichbar: kein Port 5432 am Container.
[ -z "$(docker port "$NAME" 5432 2>/dev/null)" ] || fehler "Port 5432 ist nach außen offen"
echo "::endgroup::"; echo "::notice::dms-komplett: Schritt erledigt"

echo "::group::2b. Eingangsordner (#195)"
jar=$(mktemp)
curl -fsS -c "$jar" -X POST "http://127.0.0.1:$PORT/api/konto/anmelden" -H 'x-dms: 1' -H 'content-type: application/json' \
  -d '{"email":"admin@probe.invalid","passwort":"ein-langes-probe-passwort"}' >/dev/null || fehler "Anmeldung für den Eingangsordner"
curl -fsS -b "$jar" -X PUT "http://127.0.0.1:$PORT/api/werkbank/eingangsordner" -H 'x-dms: 1' -H 'content-type: application/json' -d '{"abstand":5}' >/dev/null || fehler "Eingangsordner einstellen"
printf '%%PDF-1.4\n%% Probe Eingangsordner\n' | sudo tee "$arbeit/eingang/Probe Scan.pdf" >/dev/null
uebernommen=""
for _ in $(seq 1 30); do
  uebernommen=$(curl -fsS -b "$jar" -H 'x-dms: 1' "http://127.0.0.1:$PORT/api/werkbank/eingangsordner" | jq -r '.uebernommen[0].mappeId // empty')
  [ -n "$uebernommen" ] && break; sleep 2
done
[ -n "$uebernommen" ] || fehler "Datei aus dem Eingangsordner nicht übernommen"
sudo test -f "$arbeit/eingang/erledigt/Probe Scan.pdf" || fehler "Datei nicht nach erledigt/ verschoben"
[ "$(curl -fsS -b "$jar" -H 'x-dms: 1' "http://127.0.0.1:$PORT/api/mappen/$uebernommen" | jq '.dokumente | length')" = 1 ] || fehler "Post ohne Dokument"
echo "::endgroup::"; echo "::notice::dms-komplett: Eingangsordner übernimmt (Post $uebernommen)"

echo "::group::2c. Befehl dms im Container (#244)"
docker exec "$NAME" dms hilfe | grep -q "passwort <email>" || fehler "dms hilfe"
[ "$(docker exec "$NAME" dms status --json | jq -r '.dms.variante')" = komplett ] || fehler "dms status"
docker exec "$NAME" dms benutzer | grep -q "admin@probe.invalid" || fehler "dms benutzer"
docker exec "$NAME" dms passwort admin@probe.invalid --passwort ein-neues-probe-passwort >/dev/null || fehler "dms passwort"
curl -fsS -X POST "http://127.0.0.1:$PORT/api/konto/anmelden" -H 'x-dms: 1' -H 'content-type: application/json' \
  -d '{"email":"admin@probe.invalid","passwort":"ein-neues-probe-passwort"}' >/dev/null || fehler "Anmeldung mit dem Passwort aus dms passwort"
# Der Schlüssel gilt nur innerhalb des Containers (Loopback), nicht über den veröffentlichten Port.
schluessel=$(docker exec "$NAME" cat /tmp/dms-konsole.json | jq -r .schluessel)
[ "$(curl -s -o /dev/null -w '%{http_code}' -H "x-dms-konsole: $schluessel" "http://127.0.0.1:$PORT/api/benutzer")" = 401 ] || fehler "Konsolenschlüssel von außen angenommen"
echo "::endgroup::"; echo "::notice::dms-komplett: Befehl dms funktioniert"

echo "::group::3. Sauber stoppen"
docker stop "$NAME" >/dev/null
[ "$(docker inspect -f '{{.State.ExitCode}}' "$NAME")" = 0 ] || fehler "Exit-Code beim Stoppen nicht 0"
# Erst einsammeln, dann suchen: grep -q in einer Pipe bricht docker logs ab (pipefail).
protokoll=$(docker logs "$NAME" 2>&1)
grep -q "database system is shut down" <<< "$protokoll" || fehler "PostgreSQL nicht sauber heruntergefahren"
docker start "$NAME" >/dev/null; warte
[ "$(curl -fsS "http://127.0.0.1:$PORT/api/konto/status" | jq -r '.einrichtungNoetig')" = false ] || fehler "nach stop/start wieder uneingerichtet"
echo "::endgroup::"; echo "::notice::dms-komplett: Schritt erledigt"

echo "::group::4. DMS-Prozess abschießen"
# pkill -x trifft nur den Prozess „node“, nicht die Shell von docker exec.
docker exec "$NAME" pkill -9 -x node || true
for _ in $(seq 1 30); do [ "$(docker inspect -f '{{.State.Running}}' "$NAME")" = false ] && break; sleep 1; done
[ "$(docker inspect -f '{{.State.Running}}' "$NAME")" = false ] || fehler "Container läuft weiter, obwohl das DMS beendet ist"
echo "Container beendet mit Code $(docker inspect -f '{{.State.ExitCode}}' "$NAME")"
echo "::endgroup::"; echo "::notice::dms-komplett: Schritt erledigt"

echo "::group::5. Andere PostgreSQL-Hauptversion"
# Das Protokoll liegt außerhalb des Ordners: den übernimmt der Container für postgres (nicht mehr lesbar).
alt=$(mktemp -d); altlog=$(mktemp); mkdir -p "$alt/daten"; echo 15 > "$alt/daten/PG_VERSION"
docker run --name "$NAME-alt" -v "$alt:/data/postgres" "$IMAGE" > "$altlog" 2>&1 && fehler "startet trotz anderer Hauptversion"
grep -q "stammt von PostgreSQL 15" "$altlog" || { sed 's/^/::error::/' "$altlog"; fehler "keine klare Meldung bei anderer Hauptversion"; }
sudo rm -rf "$alt" "$altlog"
echo "::endgroup::"; echo "::notice::dms-komplett: Schritt erledigt"
echo "dms-komplett: Einrichten, Neustart, Stopp, Absturz und Versionsprüfung in Ordnung."
