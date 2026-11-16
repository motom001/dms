#!/usr/bin/env bash
# Probe für dms-komplett (#208), läuft in der CI auf amd64 und arm64 (image.yml):
#   1. starten → Ablago antwortet, Assistent beginnt beim Konto (Datenbank angebunden, kein Passwort)
#   2. einrichten (mit dem Code aus geheim/), neu starten → eingerichtet, Anmeldung klappt
#   3. docker stop → PostgreSQL sauber heruntergefahren, Exit-Code 0
#   4. Prozess abschießen → Container endet
#   5. Ordner einer anderen PostgreSQL-Hauptversion → Container startet nicht
#  5b. Rechte (#943): eingebundener Ordner mit 000 → startet; nicht beschreibbar → klare Meldung
#   6. Eigener PORT → Healthcheck gesund
#   7. Lasttest-Modus ohne Ordner (#612) → Seite, Ergebnis, „Test beenden“ → Container weg
#
#   deploy/komplett-probe.sh <image>      z. B. deploy/komplett-probe.sh dms-komplett:probe
set -euo pipefail
IMAGE="${1:?Image angeben, z. B. dms-komplett:probe}"
PORT=18090
arbeit=$(mktemp -d)
NAME=probe-komplett
aufraeumen() { docker rm -f "$NAME" "$NAME-alt" "$NAME-rechte" >/dev/null 2>&1 || true; sudo rm -rf "$arbeit" 2>/dev/null || rm -rf "$arbeit" || true; }
trap aufraeumen EXIT
# Job-Logs sind nicht überall lesbar: jeden unerwarteten Fehler als Anmerkung melden.
set -E
trap 'echo "::error::dms-komplett: Zeile $LINENO: $BASH_COMMAND (Code $?)"; docker logs --tail 40 "$NAME" 2>&1 | sed "s/^/::error::/" || true' ERR
fehler() { echo "::error::dms-komplett: $*"; docker logs --tail 60 "$NAME" 2>&1 || true; exit 1; }
# Keine Anfrage hängt unbegrenzt (#1369): Verbindung höchstens 10 s, ganze Anfrage höchstens 60 s.
curl() { command curl --connect-timeout 10 --max-time 60 "$@"; }

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
  fehler "Ablago antwortet nicht"
}

echo "::group::1. Erster Start"
starte; warte
s=$(curl -fsS "http://127.0.0.1:$PORT/api/konto/status"); echo "$s" | jq -c '{einrichtungNoetig, einrichtung}'
[ "$(echo "$s" | jq -r '.einrichtung.phase')" = konto ] || fehler "Assistent beginnt nicht beim Mandanten (Datenbank nicht angebunden?)"
sudo test -s "$arbeit/postgres/daten/PG_VERSION" || fehler "keine Datenbank unter /data/postgres/daten"
echo "::notice::dms-komplett enthält $(docker exec "$NAME" postgres --version)"
# Offline-Hilfe (#219): Startseite und eine Seite je Handbuch, ohne Anmeldung.
for h in "" benutzer/ admin/ installieren/ entwickler/ admin/sicherung/; do
  curl -fsS "http://127.0.0.1:$PORT/hilfe/$h" | grep "<html" >/dev/null || fehler "Hilfe /hilfe/$h fehlt"
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
# pg_stat_statements (#894): geladen und in der Datenbank von Ablago angelegt – auch nach dem Neustart mit bestehender Datenbank.
docker exec "$NAME" psql -h 127.0.0.1 -U dms -d dms -tAc "SHOW shared_preload_libraries" | grep -q pg_stat_statements || fehler "pg_stat_statements nicht geladen"
[ "$(docker exec "$NAME" psql -h 127.0.0.1 -U dms -d dms -tAc "SELECT count(*) FROM pg_extension WHERE extname = 'pg_stat_statements'")" = 1 ] || fehler "Erweiterung pg_stat_statements fehlt"
docker exec "$NAME" psql -h 127.0.0.1 -U dms -d dms -tAc "SELECT count(*) FROM erweiterungen_dms.pg_stat_statements" >/dev/null || fehler "pg_stat_statements nicht lesbar"
# Von außen ist PostgreSQL nicht erreichbar: kein Port 5432 am Container.
[ -z "$(docker port "$NAME" 5432 2>/dev/null)" ] || fehler "Port 5432 ist nach außen offen"
echo "::endgroup::"; echo "::notice::dms-komplett: Schritt erledigt"

echo "::group::2b. Eingangsordner (#195)"
jar=$(mktemp)
curl -fsS -c "$jar" -X POST "http://127.0.0.1:$PORT/api/konto/anmelden" -H 'x-dms: 1' -H 'content-type: application/json' \
  -d '{"email":"admin@probe.invalid","passwort":"ein-langes-probe-passwort"}' >/dev/null || fehler "Anmeldung für den Eingangsordner"
# Die Werkbank braucht seit #819 den Verwaltungsmodus; direkt nach der Anmeldung ohne erneute Abfrage.
curl -fsS -b "$jar" -X POST "http://127.0.0.1:$PORT/api/konto/verwaltung" -H 'x-dms: 1' -H 'content-type: application/json' -d '{}' >/dev/null || fehler "Verwaltungsmodus beginnen"
curl -fsS -b "$jar" -X PUT "http://127.0.0.1:$PORT/api/werkbank/eingangsordner" -H 'x-dms: 1' -H 'content-type: application/json' -d '{"abstand":5,"nachher":"erledigt"}' >/dev/null || fehler "Eingangsordner einstellen"
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
docker exec "$NAME" dms hilfe | grep "passwort <email>" >/dev/null || fehler "dms hilfe"
[ "$(docker exec "$NAME" dms status --json | jq -r '.dms.variante')" = komplett ] || fehler "dms status"
docker exec "$NAME" dms benutzer | grep "admin@probe.invalid" >/dev/null || fehler "dms benutzer"
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

echo "::group::4. Ablago-Prozess abschießen"
# pkill -x trifft nur den Prozess „node“, nicht die Shell von docker exec.
docker exec "$NAME" pkill -9 -x node || true
for _ in $(seq 1 30); do [ "$(docker inspect -f '{{.State.Running}}' "$NAME")" = false ] && break; sleep 1; done
[ "$(docker inspect -f '{{.State.Running}}' "$NAME")" = false ] || fehler "Container läuft weiter, obwohl Ablago beendet ist"
echo "Container beendet mit Code $(docker inspect -f '{{.State.ExitCode}}' "$NAME")"
echo "::endgroup::"; echo "::notice::dms-komplett: Schritt erledigt"

echo "::group::5. Andere PostgreSQL-Hauptversion"
# Das Protokoll liegt außerhalb des Ordners: den übernimmt der Container für postgres (nicht mehr lesbar).
alt=$(mktemp -d); altlog=$(mktemp); mkdir -p "$alt/daten"; echo 15 > "$alt/daten/PG_VERSION"
# Läuft der Container wider Erwarten weiter, beendet ihn timeout (#1369); aufraeumen entfernt ihn.
code=0; timeout 120 docker run --name "$NAME-alt" -v "$alt:/data/postgres" "$IMAGE" > "$altlog" 2>&1 || code=$?
[ "$code" = 124 ] && fehler "läuft trotz anderer Hauptversion nach 120 s noch"
[ "$code" = 0 ] && fehler "startet trotz anderer Hauptversion"
grep -q "stammt von PostgreSQL 15" "$altlog" || { sed 's/^/::error::/' "$altlog"; fehler "keine klare Meldung bei anderer Hauptversion"; }
sudo rm -rf "$alt" "$altlog"
echo "::endgroup::"; echo "::notice::dms-komplett: Schritt erledigt"
echo "::group::5b. Rechte am Datenbank-Ordner (#943)"
# Wie auf dem UGREEN-NAS: Der Ordner für /data/postgres hat 000. Ablago selbst startet nicht (DMS_START=true),
# es genügt, dass initdb und PostgreSQL als Benutzer postgres durchlaufen.
rechte=$(mktemp -d); chmod 000 "$rechte"; rechtelog=$(mktemp)
timeout 180 docker run --rm --name "$NAME-rechte" -e DMS_START=true -v "$rechte:/data/postgres" "$IMAGE" > "$rechtelog" 2>&1 \
  || { sed 's/^/::error::/' "$rechtelog"; fehler "startet nicht (oder hängt), wenn /data/postgres die Rechte 000 hat"; }
sudo test -s "$rechte/daten/PG_VERSION" || fehler "keine Datenbank bei Rechten 000"
# Nicht beschreibbar (hier: schreibgeschützt eingebunden) → Abbruch vor initdb mit verständlicher Meldung.
sudo rm -rf "$rechte"; rechte=$(mktemp -d)
code=0; timeout 120 docker run --rm --name "$NAME-rechte" -v "$rechte:/data/postgres:ro" "$IMAGE" > "$rechtelog" 2>&1 || code=$?
[ "$code" = 124 ] && fehler "läuft trotz nicht beschreibbarem Ordner nach 120 s noch"
[ "$code" = 0 ] && fehler "startet trotz nicht beschreibbarem Ordner"
grep -q "FEHLER: PostgreSQL (Benutzer 70) kann nicht in /data/postgres/daten schreiben. Bitte die Rechte des Ordners auf dem NAS prüfen" "$rechtelog" \
  || { sed 's/^/::error::/' "$rechtelog"; fehler "keine klare Meldung bei nicht beschreibbarem Ordner"; }
grep -q "komplett/#container-startet-nicht" "$rechtelog" || fehler "kein Link ins Handbuch bei nicht beschreibbarem Ordner"
sudo rm -rf "$rechte" "$rechtelog"
echo "::endgroup::"; echo "::notice::dms-komplett: Rechte am Datenbank-Ordner in Ordnung"
echo "::group::6. Eigener PORT: Healthcheck bleibt gesund (#321)"
docker rm -f "$NAME" >/dev/null 2>&1 || true
docker run -d --name "$NAME" -e PORT=4000 -p "$PORT:4000" \
  -v "$arbeit/files:/data/files" -v "$arbeit/geheim:/data/geheim" -v "$arbeit/sicherung:/data/sicherung" -v "$arbeit/postgres:/data/postgres" \
  "$IMAGE" >/dev/null
warte
zustand=""
for _ in $(seq 1 60); do
  zustand=$(docker inspect -f '{{.State.Health.Status}}' "$NAME")
  [ "$zustand" = healthy ] && break
  [ "$zustand" = unhealthy ] && fehler "Healthcheck mit PORT=4000: unhealthy"
  sleep 3
done
[ "$zustand" = healthy ] || fehler "Healthcheck mit PORT=4000: $zustand"
echo "::endgroup::"; echo "::notice::dms-komplett: Healthcheck mit eigenem PORT gesund"
echo "::group::7. Lasttest ohne Ordner und ohne Konsole (#612)"
# Nur DMS_LASTTEST und Port (DMS_LASTTEST_DAUER kürzt die Messung): Seite statt Ablage, Lauf bis zum Ergebnis,
# „Test beenden“ fährt den Container herunter, mit --rm ist er danach weg.
docker rm -f "$NAME" >/dev/null 2>&1 || true
docker run -d --rm --name "$NAME" -p "$PORT:3000" -e DMS_LASTTEST=klein -e DMS_LASTTEST_DAUER=5 "$IMAGE" >/dev/null
warte
[ "$(curl -fsS "http://127.0.0.1:$PORT/api/konto/status" | jq -r '.lasttest')" = true ] || fehler "Lasttest-Modus: keine Lasttest-Seite"
[ "$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$PORT/api/mappen")" = 503 ] || fehler "Lasttest-Modus: Ablage erreichbar"
zustand=""
for _ in $(seq 1 450); do
  zustand=$(curl -fsS "http://127.0.0.1:$PORT/api/lasttest" | jq -r '.zustand')
  [ "$zustand" != laeuft ] && break
  sleep 2
done
stand=$(curl -fsS "http://127.0.0.1:$PORT/api/lasttest")
[ "$zustand" = fertig ] || fehler "Lasttest: $zustand – $(jq -r '.meldung' <<< "$stand")"
jq -r '.ergebnis.vorlage' <<< "$stand" | grep -q "Image: dms-komplett" || fehler "Lasttest: Ergebnisblock ohne Image"
echo "::notice::Lasttest-Modus: $(jq -r '"p95 \(.durchgaenge[0].p95) ms, Speicher \(.speicherErkannt // "nicht erkannt")"' <<< "$stand")"
curl -fsS -X POST "http://127.0.0.1:$PORT/api/lasttest/beenden" -H 'x-dms: 1' -H 'content-type: application/json' -d '{}' >/dev/null || fehler "Lasttest beenden"
for _ in $(seq 1 60); do docker inspect "$NAME" >/dev/null 2>&1 || break; sleep 1; done
docker inspect "$NAME" >/dev/null 2>&1 && fehler "Container nach „Test beenden“ noch da (--rm)"
echo "::endgroup::"; echo "::notice::dms-komplett: Lasttest ohne Ordner in Ordnung"
echo "dms-komplett: Einrichten, Neustart, Stopp, Absturz, Versionsprüfung, Ordnerrechte, Healthcheck und Lasttest-Modus in Ordnung."
