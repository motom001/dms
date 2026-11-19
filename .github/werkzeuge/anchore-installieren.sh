#!/usr/bin/env bash
# Syft und Grype für den Sicherheitsabgleich (#1417) – feste Versionen, aus dem Quelltext gebaut.
# Warum nicht die fertigen Dateien oder die Actions von Anchore: Wie bei Trivy (trivy-installieren.sh) soll sich nichts
# unbemerkt ändern können. „go install modul@version“ prüft jedes Modul gegen die öffentliche Prüfsummen-Datenbank von
# Go (sum.golang.org); ein nachträglich geänderter Stand fiele dort auf. Go selbst lädt die passende Toolchain mit
# derselben Prüfung (GOTOOLCHAIN=auto).
# Neue Versionen: GRYPE und die Syft-Version aus dessen go.mod (Zeile github.com/anchore/syft) übernehmen, damit die
# Stückliste von Syft und das Lesen in Grype zusammenpassen.
set -euo pipefail
GRYPE=v0.121.0
SYFT=v1.55.0
export GOTOOLCHAIN=auto GOFLAGS=-mod=readonly CGO_ENABLED=0
unset GONOSUMDB GONOSUMCHECK GOINSECURE GOPRIVATE
export GOSUMDB=sum.golang.org GOPROXY=https://proxy.golang.org
ZIEL="${RUNNER_TEMP:-/tmp}/anchore"
mkdir -p "$ZIEL"
GOBIN="$ZIEL" go install -trimpath -ldflags "-s -w -X main.version=${SYFT#v}" "github.com/anchore/syft/cmd/syft@$SYFT"
GOBIN="$ZIEL" go install -trimpath -ldflags "-s -w -X main.version=${GRYPE#v}" "github.com/anchore/grype/cmd/grype@$GRYPE"
# Gegenprobe: Die Binärdateien nennen genau die Modulversionen von oben.
for p in syft:"$SYFT" grype:"$GRYPE"; do
  name="${p%%:*}" soll="${p#*:}"
  ist=$(go version -m "$ZIEL/$name" | awk '$1 == "mod" { print $3 }')
  [ "$ist" = "$soll" ] || { echo "::error::$name: gebaut ist $ist, erwartet $soll"; exit 1; }
  sudo install -m 0755 "$ZIEL/$name" "/usr/local/bin/$name"
done
syft version | grep -m1 '^Version'
grype version | grep -m1 '^Version'
