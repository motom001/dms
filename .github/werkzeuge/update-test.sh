#!/usr/bin/env bash
# Update-Test (#714): vom bisherigen Stand auf den neuen – so, wie ein Haushalt aktualisiert.
#   1. altes Image (dms-komplett) starten, einrichten, ein Dokument über den Eingangsordner ablegen,
#      eine Sicherung anlegen
#   2. Container entfernen, neues Image mit denselben Ordnern starten → alle Migrationen laufen durch
#   3. weiter eingerichtet, Anmeldung klappt, das Dokument ist da; ab #1354: die Ordner des alten Stands (von root
#      geschrieben) gehören jetzt Ablago, mit Meldung im Protokoll, und Ablago läuft nicht als root; ab #1466: Kam der
#      alte Stand schon ohne root (0.299.0), bleibt alles, wie es war
#   4. Probe-Wiederherstellung der alten Sicherung mit der neuen Version gelingt
#   Bringt das neue Image eine andere Hauptversion von PostgreSQL mit (#1464: 17 → 18), startet es mit dem alten
#   Datenbank-Ordner nicht, sondern zeigt die Startseite mit Grund und Weg. Dann geht der Test den Weg von dort: Ordner
#   umbenennen, leeren anlegen, neues Image starten, die Sicherung aus Schritt 1 im Assistenten einspielen.
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

# Hauptversion von PostgreSQL im Image (dms-komplett).
pg_haupt() { docker run --rm --entrypoint postgres "$1" --version | sed -n 's/.* \([0-9][0-9]*\)\..*/\1/p'; }
seite() { command curl -sS --connect-timeout 2 --max-time 5 -H 'accept-language: de' "$U/" 2>/dev/null || true; }
# Neue Hauptversion von PostgreSQL (#1464): Startseite statt Abbruch, dann der Umzug, wie ihn die Seite beschreibt.
umzug_ueber_sicherung() {
  echo "PostgreSQL $pg_alt → $pg_neu: Startseite und Umzug über die Sicherung"
  docker rm -f "$NAME" >/dev/null 2>&1 || true
  docker run -d --name "$NAME" -p "$PORT:3000" -e DMS_START_FEHLER_WARTEN_S=300 \
    -v "$arbeit/files:/data/files" -v "$arbeit/geheim:/data/geheim" -v "$arbeit/sicherung:/data/sicherung" -v "$arbeit/postgres:/data/postgres" \
    "$NEU" >/dev/null
  local s="" erwartet="anderen Hauptversion von PostgreSQL"
  [ "$pg_alt" = 17 ] && [ "$pg_neu" = 18 ] && erwartet="letzte Version mit PostgreSQL 17"
  for _ in $(seq 1 120); do s=$(seite); grep -q "$erwartet" <<< "$s" && break; sleep 1; done
  grep -q "$erwartet" <<< "$s" || fehler "keine Startseite mit „$erwartet“ beim alten Datenbank-Ordner"
  echo "Startseite: $(grep -oE 'Ziehe mit Ablago [0-9.]+ \(letzte Version mit PostgreSQL 17\)' <<< "$s" || echo "$erwartet")"
  [ "$(sudo cat "$arbeit/postgres/daten/PG_VERSION")" = "$pg_alt" ] || fehler "alter Datenbank-Ordner verändert"
  docker rm -f "$NAME" >/dev/null
  # Wie auf der Startseite: Ordner umbenennen (nicht löschen), leeren anlegen, neue Version starten.
  sudo mv "$arbeit/postgres" "$arbeit/postgres-$pg_alt"; mkdir -p "$arbeit/postgres"
  starte "$NEU"; warte
  [ "$(curl -fsS "$U/api/konto/status" | jq -r '.einrichtungNoetig')" = true ] || fehler "leere Datenbank, aber nicht im Assistenten"
  local code lauf schluessel=""
  code=$(sudo cat "$arbeit/geheim/EINRICHTUNGSCODE")
  wh() { curl -fsS -H 'x-dms: 1' -H "x-einrichtungscode: $code" -H 'content-type: application/json' "$@"; }
  wh "$U/api/wiederherstellung/sicherungen" | jq -e --arg n "$sicherung" '.liste | any(.name == $n)' >/dev/null || fehler "Sicherung $sicherung im Assistenten nicht zu sehen"
  if [ "$(wh -X POST "$U/api/wiederherstellung/abgleich" -d "{\"name\":\"$sicherung\"}" | jq -r '.schluesselNoetig')" = true ]; then
    schluessel=$(sudo cat "$arbeit/geheim/dms.schluessel")
  fi
  wh -X POST "$U/api/wiederherstellung/abgleich" -d "$(jq -nc --arg n "$sicherung" --arg s "$schluessel" '{name: $n} + (if $s == "" then {} else {schluessel: $s} end)')" \
    | jq -e '.probleme == []' >/dev/null || fehler "Abgleich der Sicherung meldet Probleme"
  wh -X POST "$U/api/wiederherstellung/start" -d "$(jq -nc --arg n "$sicherung" --arg s "$schluessel" '{name: $n} + (if $s == "" then {} else {schluessel: $s} end)')" >/dev/null \
    || fehler "Wiederherstellung starten"
  for _ in $(seq 1 150); do
    lauf=$(curl -sS "$U/api/wiederherstellung/status" 2>/dev/null | jq -r '.lauf.status // .status // empty' 2>/dev/null || true)
    [ "$(docker inspect -f '{{.State.Running}}' "$NAME")" = true ] || break
    [ "$lauf" = fehler ] && fehler "Wiederherstellung: $(curl -sS "$U/api/wiederherstellung/status" | jq -c .)"
    sleep 2
  done
  # Nach dem Umschalten beendet sich Ablago (im Betrieb startet Docker es neu); hier startet der Test den Container.
  for _ in $(seq 1 60); do [ "$(docker inspect -f '{{.State.Running}}' "$NAME")" = false ] && break; sleep 1; done
  [ "$(docker inspect -f '{{.State.Running}}' "$NAME")" = false ] || fehler "Ablago hat sich nach der Wiederherstellung nicht beendet"
  docker start "$NAME" >/dev/null; warte
  [ "$(sudo cat "$arbeit/postgres/daten/PG_VERSION")" = "$pg_neu" ] || fehler "neue Datenbank nicht mit PostgreSQL $pg_neu"
  [ "$(sudo cat "$arbeit/postgres-$pg_alt/daten/PG_VERSION")" = "$pg_alt" ] || fehler "alter Datenbank-Ordner nicht mehr da"
}

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
# Mehrere Prozesse (#1419): Der alte Stand kennt den neuen Schlüssel im anderen Prozess erst nach dessen Abgleich (bis
# 2 s); landet „Sicherung jetzt“ dort, kommt bis dahin 409. Seit #1419 liest Ablago selbst nach – ein 409 länger als
# 10 s bleibt ein Fehler.
for _ in $(seq 1 10); do
  r=$(curl -sS -b "$jar" -H 'x-dms: 1' -H 'content-type: application/json' -X POST "$U/api/werkbank/sicherung/jetzt" -d '{}' -w '\n%{http_code}')
  if [ "$(tail -1 <<< "$r")" != 409 ] || ! grep -q 'Schlüssel' <<< "$r"; then break; fi
  sleep 1
done
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
# Lief der alte Stand als root (vor 0.299.0), gehört ihm noch etwas; seit 0.299.0 gehört schon alles 1000 (#1466).
vorher_root=$(sudo find "$arbeit/files" "$arbeit/geheim" "$arbeit/sicherung" -uid 0 | head -1)
liste() { sudo find "$arbeit/files" "$arbeit/geheim" "$arbeit/sicherung" -printf '%p|%u:%g %m\n'; }
vorher=$(liste)
pg_alt=$(pg_haupt "$ALT"); pg_neu=$(pg_haupt "$NEU")
if [ "$pg_alt" != "$pg_neu" ]; then umzug_ueber_sicherung; else starte "$NEU"; warte; fi
neu=$(version); echo "Neue Version: $neu"
[ "$(curl -fsS "$U/api/konto/status" | jq -r '.einrichtungNoetig')" = false ] || fehler "nach dem Update wieder uneingerichtet"
anmelden "neuer Stand"
[ "$(api "$U/api/mappen/$mappe" | jq '.dokumente | length')" = 1 ] || fehler "Dokument nach dem Update nicht mehr da"
# Ohne root (#1354): Was der alte Stand als root geschrieben hat, gehört jetzt dem Benutzer von Ablago (1000).
fremd=$(sudo find "$arbeit/files" "$arbeit/geheim" "$arbeit/sicherung" ! -uid 1000 | head -5)
[ -z "$fremd" ] || fehler "nach dem Update gehört noch nicht alles Ablago: $fremd"
if [ -n "$vorher_root" ]; then
  grep -q "übernehme /data/files für Benutzer 1000" <<< "$(docker logs "$NAME" 2>&1)" || fehler "keine Meldung zur Übernahme der Ordner"
else
  # Bestand aus 0.299.0 (#1466): Ordner gehören schon 1000 – nichts übernommen, nichts umgeschrieben, kein Hin und Her.
  grep -q "übernehme" <<< "$(docker logs "$NAME" 2>&1)" && fehler "Bestand aus 0.299.0: Ordner erneut übernommen"
  # Nur, was es vorher und nachher gibt: Besitzer, Gruppe und Rechte gleich (Ablago darf Dateien anlegen und löschen).
  weg=$(awk -F'|' 'NR == FNR { v[$1] = $2; next } ($1 in v) && v[$1] != $2 { print $1 ": " v[$1] " → " $2 }' <(echo "$vorher") <(liste) | head -5)
  [ -z "$weg" ] || fehler "Bestand aus 0.299.0: umgeschrieben: $weg"
fi
[ "$(docker exec "$NAME" dms status --json | jq -r '.laufzeit.benutzer')" = 1000 ] || fehler "Ablago läuft nach dem Update nicht als Benutzer 1000"
echo "Benutzer: $(docker exec "$NAME" dms status --json | jq -c '.laufzeit.dienstbenutzer | {herkunft, grund, aenderungen: (.aenderungen | length)}')"
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
