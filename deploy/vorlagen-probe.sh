#!/usr/bin/env bash
# Probe-Installation der NAS-Vorlagen (#184, #185, #179) und der Vorlage für den Raspberry Pi (#578):
# startet jede Vorlage unter deploy/*/ mit dem gerade gebauten Image, wartet, bis Ablago antwortet,
# und prüft, dass der Einrichtungsassistent ohne Datenbankschritt beginnt. Läuft in der CI (image.yml).
#
#   deploy/vorlagen-probe.sh <image> [vorlage …]      z. B. deploy/vorlagen-probe.sh dms:probe
set -euo pipefail
IMAGE="${1:?Image angeben, z. B. dms:probe}"; shift || true
cd "$(dirname "$0")"
VORLAGEN=("$@"); [ ${#VORLAGEN[@]} -gt 0 ] || VORLAGEN=(synology ugreen qnap truenas unraid raspberry-pi)
fehler=0

for v in "${VORLAGEN[@]}"; do
  echo "::group::Vorlage $v"
  arbeit=$(mktemp -d)
  # Pfade auf einen leeren Ordner, Passwort setzen, Image austauschen, Port frei wählen.
  sed -e "s#\(/volume1/docker/dms\|/share/Container/dms\|/mnt/tank/apps/dms\|/mnt/user/appdata/dms\)#$arbeit#g" \
      -e 's#HIER-EIN-LANGES-PASSWORT-EINTRAGEN#probe-passwort-123#' \
      -e "s#ghcr.io/motom001/dms:stabil#$IMAGE#" \
      -e 's#"8080:3000"#"18080:3000"#' \
      "$v/docker-compose.yml" > "$arbeit/docker-compose.yml"
  # Vorlagen mit Passwort in der .env (raspberry-pi; das Einrichtungsskript schreibt sie dort).
  echo "DB_PASSWORD=probe-passwort-123" > "$arbeit/.env"
  grep -q 'HIER-' "$arbeit/docker-compose.yml" && { echo "::error::$v: Platzhalter nicht ersetzt"; fehler=1; }
  projekt="probe-$v"
  docker compose -p "$projekt" -f "$arbeit/docker-compose.yml" up -d --quiet-pull
  ok=""
  for _ in $(seq 1 60); do
    # Höchstens 10 s je Versuch (#1369), sonst hält eine hängende Verbindung die Schleife auf.
    if s=$(curl -fsS --connect-timeout 5 --max-time 10 http://127.0.0.1:18080/api/konto/status 2>/dev/null); then ok=1; break; fi
    sleep 2
  done
  if [ -z "$ok" ]; then
    echo "::error::$v: Ablago antwortet nicht"; docker compose -p "$projekt" -f "$arbeit/docker-compose.yml" logs --tail 40; fehler=1
  else
    echo "$s" | jq -c '{einrichtungNoetig, einrichtung}'
    # Datenbank vorbelegt: der Assistent beginnt beim Konto (Mandant), nicht bei der Datenbank.
    phase=$(echo "$s" | jq -r '.einrichtung.phase // empty')
    if [ "$phase" != konto ]; then echo "::error::$v: Assistent beginnt bei „$phase“ statt beim Mandanten"; fehler=1; fi
    test -s "$arbeit/geheim/EINRICHTUNGSCODE" || { echo "::error::$v: kein Einrichtungscode in geheim/"; fehler=1; }
    test -s "$arbeit/geheim/datenbank.json" || { echo "::error::$v: Anbindung nicht übernommen"; fehler=1; }
  fi
  docker compose -p "$projekt" -f "$arbeit/docker-compose.yml" down -v >/dev/null 2>&1 || true
  sudo rm -rf "$arbeit" 2>/dev/null || rm -rf "$arbeit" || true
  echo "::endgroup::"
done
exit $fehler
