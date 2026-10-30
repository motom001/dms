#!/usr/bin/env bash
# Image auf bekannte Sicherheitslücken prüfen (#220).
#   image-pruefen.sh <image> [--sarif datei] [--nur-melden]
# Kritisch mit verfügbarer Korrektur  → Fehler (im PR schlägt die Prüfung fehl).
# Hoch mit verfügbarer Korrektur      → Warnung.
# Ohne Korrektur                      → nur in der Übersicht und im Security-Reiter.
# Bewusst hingenommene Funde stehen mit Begründung in .trivyignore.
set -euo pipefail
IMAGE="$1"; shift
SARIF=""; NUR_MELDEN=false
while [ $# -gt 0 ]; do
  case "$1" in
    --sarif) SARIF="$2"; shift 2 ;;
    --nur-melden) NUR_MELDEN=true; shift ;;
    *) echo "unbekannt: $1"; exit 2 ;;
  esac
done
WURZEL="$(cd "$(dirname "$0")/../.." && pwd)"
BERICHT="$(mktemp --suffix=.json)"
trivy image --quiet --scanners vuln --ignorefile "$WURZEL/.trivyignore" --format json --output "$BERICHT" "$IMAGE"
[ -n "$SARIF" ] && trivy convert --quiet --format sarif --output "$SARIF" "$BERICHT"

# Anmerkungen ohne Prozent- und Zeilenumbruchprobleme.
anm() { printf '::%s title=%s::%s\n' "$1" "$2" "$(printf '%s' "$3" | sed 's/%/%25/g')"; }
funde() {
  jq -r --arg s "$1" '.Results[]? | .Target as $t | .Vulnerabilities[]?
    | select(.Severity == $s and (.FixedVersion // "") != "")
    | "\(.VulnerabilityID): \(.PkgName) \(.InstalledVersion) → \(.FixedVersion) (\($t))"' "$BERICHT" | sort -u
}
KRITISCH="$(funde CRITICAL)"; HOCH="$(funde HIGH)"
UEBERSICHT="$(jq -r '[.Results[]?.Vulnerabilities[]?] | group_by(.Severity) | map("\(.[0].Severity): \(length)") | join(", ")' "$BERICHT")"
anm notice "Trivy $IMAGE" "Funde: ${UEBERSICHT:-keine}"
while IFS= read -r z; do [ -n "$z" ] && anm warning "Lücke (hoch, Korrektur verfügbar)" "$z"; done <<< "$(head -20 <<< "$HOCH")"
if [ -n "$KRITISCH" ]; then
  while IFS= read -r z; do anm $($NUR_MELDEN && echo warning || echo error) "Lücke (kritisch, Korrektur verfügbar)" "$z"; done <<< "$KRITISCH"
  $NUR_MELDEN || { echo "Kritische Lücken mit verfügbarer Korrektur – Paket aktualisieren oder mit Begründung in .trivyignore eintragen."; exit 1; }
fi
if [ -n "$KRITISCH" ]; then echo "Kritische Lücken gemeldet (nur melden)."; else echo "Keine kritische Lücke mit verfügbarer Korrektur."; fi
