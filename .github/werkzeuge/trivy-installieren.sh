#!/usr/bin/env bash
# Trivy für die Prüfung der Images (#220) – feste Version, Prüfsumme fest im Repo.
# Bewusst nicht über die trivy-action: deren Tags wurden 2026 kompromittiert; eine feste
# Binärdatei mit Prüfsumme kann sich nicht unbemerkt ändern.
# Neue Version: VERSION und beide Prüfsummen aus trivy_<version>_checksums.txt des Releases übernehmen.
set -euo pipefail
# Downloads von github.com antworten zeitweise mit 504: großzügig wiederholen (auch bei 5xx), mit Pause.
VERSION=0.76.1
case "$(uname -m)" in
  x86_64)  DATEI="trivy_${VERSION}_Linux-64bit.tar.gz"; SUMME=c7cbe3137fb8a48a17574bede3dd6beb16742d1e9772929940fc90082c39d9c0 ;;
  aarch64) DATEI="trivy_${VERSION}_Linux-ARM64.tar.gz"; SUMME=e174dff2a6dba5e3ae41f8d0537a6324405bd08132497340304c6b20e0f16a1f ;;
  *) echo "::error::Trivy: unbekannte Architektur $(uname -m)"; exit 1 ;;
esac
ZIEL="${RUNNER_TEMP:-/tmp}/trivy-${VERSION}"
mkdir -p "$ZIEL"
if ! curl -sSfL --retry 8 --retry-delay 15 --retry-all-errors --connect-timeout 20 -o "$ZIEL/$DATEI" "https://github.com/aquasecurity/trivy/releases/download/v${VERSION}/${DATEI}"; then
  # Zweiter Weg über die API (anderer Einstieg als github.com/…/releases/download); Prüfsumme gilt genauso.
  echo "::warning title=Trivy::Download über github.com gescheitert – versuche die API."
  [ -n "${GH_TOKEN:-}" ] || { echo "::error::Trivy: kein GH_TOKEN für den zweiten Weg."; exit 1; }
  url=$(curl -sSfL --retry 5 --retry-delay 10 --retry-all-errors -H "Authorization: Bearer $GH_TOKEN" \
    "https://api.github.com/repos/aquasecurity/trivy/releases/tags/v${VERSION}" | jq -r --arg n "$DATEI" '.assets[] | select(.name == $n) | .url')
  [ -n "$url" ] || { echo "::error::Trivy: Datei $DATEI im Release nicht gefunden."; exit 1; }
  curl -sSfL --retry 8 --retry-delay 15 --retry-all-errors -H "Authorization: Bearer $GH_TOKEN" -H "Accept: application/octet-stream" -o "$ZIEL/$DATEI" "$url"
fi
echo "$SUMME  $ZIEL/$DATEI" | sha256sum -c --quiet - || { echo "::error::Trivy: Prüfsumme stimmt nicht – Download verworfen."; exit 1; }
tar -xzf "$ZIEL/$DATEI" -C "$ZIEL" trivy
sudo install -m 0755 "$ZIEL/trivy" /usr/local/bin/trivy
trivy --version | head -1
