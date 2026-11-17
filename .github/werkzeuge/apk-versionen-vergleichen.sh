#!/usr/bin/env bash
# Haben beide Varianten dieselben Alpine-Pakete? (#1397)
#   apk-versionen-vergleichen.sh <Liste A> <Liste B> [Name A] [Name B]
# Eine Liste ist /lib/apk/db/installed eines Images (Zeilen „P:<Name>“ und „V:<Version>“) oder die Ausgabe von
# „apk info -v“ (eine Zeile „<Name>-<Version>-r<N>“ je Paket). Verglichen werden nur Pakete, die in beiden Listen
# stehen; Pakete nur in einer Variante (z. B. postgresql17 in dms-komplett) zählen nicht.
# Exit 0 = gleiche Versionen; Exit 1 = Abweichungen (je Paket eine Zeile auf stdout); Exit 2 = Liste fehlt oder leer.
set -u
export LC_ALL=C
a="${1:-}"; b="${2:-}"; na="${3:-A}"; nb="${4:-B}"

# Liste → Zeilen „<Name> <Version>“, sortiert nach Name.
lesen() {
  awk '
    /^P:/ { db = 1; p = substr($0, 3); next }
    /^V:/ { if (p != "") print p, substr($0, 3); p = ""; next }
    /^$/  { p = ""; next }
    !db && match($0, /-[0-9][^-]*-r[0-9]+$/) { print substr($0, 1, RSTART - 1), substr($0, RSTART + 1) }
  ' "$1" | sort -k1,1
}

for f in "$a" "$b"; do
  if [ -z "$f" ] || [ ! -s "$f" ]; then echo "Paketliste fehlt oder ist leer: '$f'" >&2; exit 2; fi
done
la=$(lesen "$a"); lb=$(lesen "$b")
if [ -z "$la" ] || [ -z "$lb" ]; then echo "Keine Pakete erkannt ($na: $a, $nb: $b)" >&2; exit 2; fi

abweichend=$(join <(printf '%s\n' "$la") <(printf '%s\n' "$lb") | awk -v na="$na" -v nb="$nb" '$2 != $3 { print $1 ": " $2 " (" na ") ≠ " $3 " (" nb ")" }')
gemeinsam=$(join <(printf '%s\n' "$la") <(printf '%s\n' "$lb") | wc -l)
if [ "$gemeinsam" -eq 0 ]; then echo "Keine gemeinsamen Pakete ($na, $nb) – falsche Listen?" >&2; exit 2; fi
if [ -n "$abweichend" ]; then
  printf '%s\n' "$abweichend"
  echo "$(printf '%s\n' "$abweichend" | wc -l) von $gemeinsam gemeinsamen Paketen weichen ab ($na, $nb)." >&2
  exit 1
fi
echo "$gemeinsam gemeinsame Pakete, alle in gleicher Version ($na, $nb)."
