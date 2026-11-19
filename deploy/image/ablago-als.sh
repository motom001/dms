#!/bin/sh
# Befehle im Container als Benutzer von Ablago (#1354), z. B. „docker exec <container> dms status“: Was sie anlegen,
# gehört so Ablago, und die Konsolendatei (nur für Ablago lesbar) ist lesbar. Ohne root unverändert.
if [ "$(id -u)" = 0 ] && [ "${PUID:-1000}" != 0 ]; then
  exec setpriv --reuid="${PUID:-1000}" --regid="${PGID:-1000}" --groups=61000 --no-new-privs -- env HOME=/tmp "$@"
fi
exec "$@"
