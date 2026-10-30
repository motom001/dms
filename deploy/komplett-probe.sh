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
fehler() { echo "::error::dms-komplett: $*"; docker logs --tail 60 "$NAME" 2>&1 || true; exit 1; }

starte() {
  docker run -d --name "$NAME" -p "$PORT:3000" --stop-timeout 60 \
    -v "$arbeit/files:/data/files" -v "$arbeit/geheim:/data/geheim" -v "$arbeit/sicherung:/data/sicherung" -v "$arbeit/postgres:/data/postgres" \
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
echo "PostgreSQL $(sudo cat "$arbeit/postgres/daten/PG_VERSION")"
echo "::endgroup::"

echo "::group::2. Einrichten und Neustart"
code=$(sudo cat "$arbeit/geheim/EINRICHTUNGSCODE")
curl -fsS -X POST "http://127.0.0.1:$PORT/api/konto/einrichten" -H 'x-dms: 1' -H "x-einrichtungscode: $code" -H 'content-type: application/json' \
  -d '{"mandant":"Familie Probe","name":"Admin","email":"admin@probe.invalid","passwort":"ein-langes-probe-passwort"}' >/dev/null || fehler "Einrichten scheitert"
docker restart "$NAME" >/dev/null; warte
[ "$(curl -fsS "http://127.0.0.1:$PORT/api/konto/status" | jq -r '.einrichtungNoetig')" = false ] || fehler "nach dem Neustart wieder uneingerichtet"
curl -fsS -X POST "http://127.0.0.1:$PORT/api/konto/anmelden" -H 'x-dms: 1' -H 'content-type: application/json' \
  -d '{"email":"admin@probe.invalid","passwort":"ein-langes-probe-passwort"}' >/dev/null || fehler "Anmeldung nach dem Neustart scheitert"
docker exec "$NAME" sh -c 'pg_isready -h 127.0.0.1' || fehler "pg_isready im Container"
# Von außen ist PostgreSQL nicht erreichbar: kein Port 5432 am Container.
[ -z "$(docker port "$NAME" 5432 2>/dev/null)" ] || fehler "Port 5432 ist nach außen offen"
echo "::endgroup::"

echo "::group::3. Sauber stoppen"
docker stop "$NAME" >/dev/null
[ "$(docker inspect -f '{{.State.ExitCode}}' "$NAME")" = 0 ] || fehler "Exit-Code beim Stoppen nicht 0"
# Erst einsammeln, dann suchen: grep -q in einer Pipe bricht docker logs ab (pipefail).
protokoll=$(docker logs "$NAME" 2>&1)
grep -q "database system is shut down" <<< "$protokoll" || fehler "PostgreSQL nicht sauber heruntergefahren"
docker start "$NAME" >/dev/null; warte
[ "$(curl -fsS "http://127.0.0.1:$PORT/api/konto/status" | jq -r '.einrichtungNoetig')" = false ] || fehler "nach stop/start wieder uneingerichtet"
echo "::endgroup::"

echo "::group::4. DMS-Prozess abschießen"
# pkill -x trifft nur den Prozess „node“, nicht die Shell von docker exec.
docker exec "$NAME" pkill -9 -x node || true
for _ in $(seq 1 30); do [ "$(docker inspect -f '{{.State.Running}}' "$NAME")" = false ] && break; sleep 1; done
[ "$(docker inspect -f '{{.State.Running}}' "$NAME")" = false ] || fehler "Container läuft weiter, obwohl das DMS beendet ist"
echo "Container beendet mit Code $(docker inspect -f '{{.State.ExitCode}}' "$NAME")"
echo "::endgroup::"

echo "::group::5. Andere PostgreSQL-Hauptversion"
alt=$(mktemp -d); mkdir -p "$alt/daten"; echo 15 > "$alt/daten/PG_VERSION"
docker run --name "$NAME-alt" -v "$alt:/data/postgres" "$IMAGE" > "$alt/log" 2>&1 && fehler "startet trotz anderer Hauptversion"
grep -q "stammt von PostgreSQL 15" "$alt/log" || { cat "$alt/log"; fehler "keine klare Meldung bei anderer Hauptversion"; }
sudo rm -rf "$alt"
echo "::endgroup::"
echo "dms-komplett: Einrichten, Neustart, Stopp, Absturz und Versionsprüfung in Ordnung."
