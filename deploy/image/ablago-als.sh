#!/bin/sh
# Befehle im Container als Benutzer von Ablago (#1354), z. B. „docker exec <container> dms status“: Was sie anlegen,
# gehört so Ablago, und die Konsolendatei (nur für Ablago lesbar) ist lesbar. Ohne root unverändert.
# Die Kennung hat das Start-Skript gewählt (#1466: ohne PUID/PGID wie der Datenordner) und im Merker abgelegt;
# docker exec kennt nur die Umgebung der Compose-Datei. Ohne Merker wie bisher PUID/PGID bzw. 1000.
k=""
[ -r "${DMS_RECHTE_MERKER:-/var/lib/ablago/rechte}/kennung" ] && read -r k _ < "${DMS_RECHTE_MERKER:-/var/lib/ablago/rechte}/kennung"
case "$k" in [0-9]*:[0-9]*) u=${k%%:*} g=${k#*:} ;; *) u=${PUID:-1000} g=${PGID:-1000} ;; esac
case "$u$g" in *[!0-9]*) u=${PUID:-1000} g=${PGID:-1000} ;; esac
if [ "$(id -u)" = 0 ] && [ "$u" != 0 ]; then
  exec setpriv --reuid="$u" --regid="$g" --groups=61000 --no-new-privs -- env HOME=/tmp "$@"
fi
exec "$@"
