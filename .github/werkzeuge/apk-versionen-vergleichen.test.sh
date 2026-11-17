#!/usr/bin/env bash
# Test für apk-versionen-vergleichen.sh (#1397): gemeinsame Pakete beider Varianten in gleicher Version.
set -u
cd "$(dirname "$0")" || exit 1; s=./apk-versionen-vergleichen.sh; d=$(mktemp -d); f=0
erwarte() { local soll=$1; shift; local ist=0; "$s" "$@" >/dev/null 2>&1 || ist=$?; [ "$ist" = "$soll" ] || { echo "FEHLER: $* → $ist, erwartet $soll"; f=1; }; }
# Ausschnitt aus /lib/apk/db/installed (weitere Felder wie A:, T:, D: stören nicht).
db() { local p v; for e in "$@"; do p=${e%%=*}; v=${e#*=}; printf 'C:Q1abc=\nP:%s\nV:%s\nA:x86_64\nT:Paket %s\n\n' "$p" "$v" "$p"; done; }
db musl=1.2.5-r10 nss=3.124-r0 poppler-utils=25.10.0-r0 font-dejavu=2.37-r6 > "$d/dms"
db musl=1.2.5-r10 nss=3.124-r0 poppler-utils=25.10.0-r0 font-dejavu=2.37-r6 postgresql17=17.7-r0 > "$d/komplett"
db musl=1.2.5-r10 nss=3.133-r0 poppler-utils=25.10.0-r0 font-dejavu=2.37-r6 postgresql17=17.7-r0 > "$d/neuer"
db openssl=3.5.4-r0 > "$d/fremd"
: > "$d/leer"
printf 'musl-1.2.5-r10\nnss-3.124-r0\npoppler-utils-25.10.0-r0\nfont-dejavu-2.37-r6\n' > "$d/info"
printf 'musl-1.2.5-r10\nnss-3.133-r0\npy3-foo-2-1.0-r1\n' > "$d/info-neuer"
erwarte 0 "$d/dms" "$d/komplett" dms dms-komplett   # Pakete nur in dms-komplett zählen nicht
erwarte 1 "$d/dms" "$d/neuer" dms dms-komplett      # nss 3.124 gegen 3.133 (#1397)
erwarte 0 "$d/info" "$d/komplett"                   # Ausgabe von „apk info -v“ gegen die Datenbank
erwarte 1 "$d/info" "$d/info-neuer"
erwarte 2 "$d/dms" "$d/leer"                        # leere Liste
erwarte 2 "$d/dms" /gibt/es/nicht
erwarte 2 "$d/dms"
erwarte 2 "$d/dms" "$d/fremd"                       # nichts gemeinsam: falsche Liste
# Die Abweichung nennt Paket und beide Versionen.
zeile=$("$s" "$d/dms" "$d/neuer" dms dms-komplett 2>/dev/null)
[ "$zeile" = "nss: 3.124-r0 (dms) ≠ 3.133-r0 (dms-komplett)" ] || { echo "FEHLER: Meldung '$zeile'"; f=1; }
# Namen mit Ziffern nach einem Bindestrich („py3-foo-2“) bleiben ganz.
zeile=$(printf 'py3-foo-2-1.0-r1\n' > "$d/a"; printf 'py3-foo-2-1.1-r0\n' > "$d/b"; "$s" "$d/a" "$d/b" 2>/dev/null)
[ "$zeile" = "py3-foo-2: 1.0-r1 (A) ≠ 1.1-r0 (B)" ] || { echo "FEHLER: Meldung '$zeile'"; f=1; }
rm -rf "$d"; [ "$f" = 0 ] && echo "apk-versionen-vergleichen: alle Fälle richtig"; exit $f
