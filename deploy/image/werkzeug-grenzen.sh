#!/bin/sh
# Grenzen für ein Dokumentwerkzeug (#1354), dann das Werkzeug an seine Stelle (exec, gleiche PID).
#   werkzeug-grenzen <speicher-kb|""> <rechenzeit-s> <dateigroesse-bloecke> <programm> [argumente …]
# Speicher als Adressraum (ulimit -v, leer = ohne Grenze), Rechenzeit (-t), größte Datei in Blöcken zu 512 Byte (-f).
# ulimit setzt weiche und harte Grenze; das Werkzeug kann sie nicht anheben. Gilt schon eine strengere, bleibt sie.
# Die Argumente des Werkzeugs gehen unverändert über "$@" weiter – keine Shell deutet sie.
# Aufgerufen vom Werkzeugdienst und ohne ihn von Ablago (server/src/prozesse/werkzeuggrenzen.ts).
# -v und -t stehen nicht in POSIX, busybox (Image), dash und bash kennen sie.
# shellcheck disable=SC3045
if [ -n "$1" ]; then ulimit -v "$1" 2>/dev/null || :; fi
# shellcheck disable=SC3045
ulimit -t "$2" 2>/dev/null || :
ulimit -f "$3" 2>/dev/null || :
shift 3
exec "$@"
