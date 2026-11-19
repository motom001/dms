#!/usr/bin/env bash
# apt-pakete.sh – Pakete auf den Rechnern von GitHub installieren, mit höchstens drei Versuchen.
# Aufruf: bash "$GITHUB_WORKSPACE/.github/werkzeuge/apt-pakete.sh" poppler-utils qpdf
#
# Versuch 1 ohne „apt-get update“ (#905): Die Paketlisten des Images reichen meist, das Update dauert mal 10 s, mal
# über 3 Minuten. Ab Versuch 2 stellt apt-spiegel.sh verlässliche Spiegel nach vorn und leitet auch security.ubuntu.com
# über sie (einmal), dann Paketlisten neu holen und erneut installieren. Anlass: Am 19.11.2026 scheiterte der Bau auf main an security.ubuntu.com bzw.
# Spiegeln („Could not wait for server fd“).
# Für den Test: APT_SPIEGEL (Spiegel-Skript) und APT_PAUSE (Sekunden je Versuch vor dem nächsten) überschreibbar.
set -u
[ "$#" -gt 0 ] || { echo "apt-pakete: keine Pakete angegeben" >&2; exit 2; }
spiegel=${APT_SPIEGEL:-"$(cd "$(dirname "$0")" && pwd)/apt-spiegel.sh"}
pause=${APT_PAUSE:-10}
for versuch in 1 2 3; do
  if [ "$versuch" -gt 1 ]; then
    echo "apt-pakete: Versuch $versuch von 3 für $*"
    [ "$versuch" -eq 2 ] && bash "$spiegel"
    sudo apt-get update -qq || echo "apt-pakete: apt-get update meldet Fehler, installiere trotzdem" >&2
  fi
  if sudo apt-get install -y -qq "$@" >/dev/null; then exit 0; fi
  [ "$versuch" -lt 3 ] && sleep $((versuch * pause))
done
echo "::error::apt-pakete: $* nach drei Versuchen nicht installiert"
exit 1
