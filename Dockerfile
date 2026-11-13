# Ein Image für Server und Weboberfläche (modularer Monolith).
# Zwei Ziele (#208): „dms“ (Standard, Datenbank extern) und „komplett“ (mit PostgreSQL im Container):
#   docker build -t dms .                         docker build --target komplett -t dms-komplett .

# Basis-Images mit festem Digest (Scorecard „Pinned-Dependencies“): Ein ausgetauschtes Tag bei Docker Hub käme so nicht
# unbemerkt ins Image. Dependabot (Ökosystem docker) hebt Tag und Digest jede Woche per Pull Request.
FROM node:24-alpine@sha256:116b800c3754b440ee0aa3ed2f20f5bf3d99a554bfd9adeea09ea8017f6e85f5 AS bau
WORKDIR /app
# package-lock.json (#215): genau diese Versionen, reproduzierbar mit npm ci.
COPY package.json package-lock.json ./
COPY server/package.json server/
COPY web/package.json web/
RUN npm ci --no-audit --no-fund
COPY tsconfig.base.json ./
COPY shared shared
COPY server server
COPY web web
RUN npm run build

# Handbücher für die Offline-Hilfe (#219): alle vier und die Startseite, ohne Screenshots,
# ausgeliefert unter /hilfe/. Nur der gebaute Ordner kommt ins Image, nicht Python.
FROM python:3.15-alpine@sha256:0f9552bb28711333da16915ec146f5e6bb44a7fdac9ced15dc17c2e0206346dd AS hilfe
# Feste Versionen mit Hashes (#289), dieselben wie im Handbuch-Workflow.
COPY docs/handbuch/requirements.txt /tmp/requirements.txt
RUN pip install --no-cache-dir --disable-pip-version-check --require-hashes -r /tmp/requirements.txt
WORKDIR /src
COPY package.json ./
COPY docs/releases docs/releases
COPY docs/handbuch docs/handbuch
RUN python3 docs/handbuch/werkzeuge/offline.py /hilfe

FROM node:24-alpine@sha256:116b800c3754b440ee0aa3ed2f20f5bf3d99a554bfd9adeea09ea8017f6e85f5 AS laufzeit
# Name und Beschreibung (#687); die Image-Namen ghcr.io/motom001/dms und dms-komplett bleiben, damit Updates weiterlaufen.
LABEL org.opencontainers.image.title="Ablago" \
      org.opencontainers.image.description="Ablago – Dokumentenablage für zu Hause und kleine Betriebe" \
      org.opencontainers.image.url="https://ablago.app" \
      org.opencontainers.image.documentation="https://help.ablago.app" \
      org.opencontainers.image.source="https://github.com/motom001/dms" \
      org.opencontainers.image.licenses="Apache-2.0"
# Alpine-Pakete aktuell halten (#214): Das Datum gehört zur Cache-Kennung dieser Schicht, also holt der erste
# Bau jedes Tages die neuesten Pakete (sonst nähme der Build-Cache die alten). Früher war es die Kalenderwoche –
# dann blieben Korrekturen aus der Wochenmitte bis zum Montag im Cache hängen (libexpat, November 2026).
ARG APK_TAG=""
# poppler (#45): Textebene von PDFs (pdftotext), Vorschau- und Seitenbilder, Schwärzen, Verkleinern (pdftoppm).
# Keine Texterkennung im Image (#459): Scans und Fotos erkennt das Paket „Texterkennung“ aus dem Katalog
# (Tesseract als WebAssembly im Paket-Läufer); weitere Sprachen kommen als Zusatzpakete dazu.
# PDF verkleinern (#393): qpdf (Apache-2.0, Alpine „community“) optimiert die Struktur; die Bilder rechnet
# pdftoppm aus poppler-utils. Bewusst kein Ghostscript (AGPL). Fehlt qpdf, geht es auch ohne.
RUN echo "Alpine-Pakete Stand ${APK_TAG}" && apk upgrade --no-cache && apk add --no-cache poppler-utils qpdf
# Stand des Images für die Versionsübersicht in der Werkbank (setzt GitHub Actions).
ARG DMS_COMMIT=""
ARG DMS_GEBAUT=""
ENV NODE_ENV=production \
    DMS_COMMIT=$DMS_COMMIT \
    DMS_GEBAUT=$DMS_GEBAUT
WORKDIR /app
COPY package.json package-lock.json ./
COPY server/package.json server/
COPY web/package.json web/
# Danach npm, Yarn und Corepack entfernen (#220): Ablago braucht sie zur Laufzeit nicht, und sie
# bringen eigene Bibliotheken mit, deren Lücken sonst im Image stünden. Nur node selbst bleibt.
RUN npm ci --omit=dev --workspace server --no-audit --no-fund && npm cache clean --force \
  && rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack /opt/yarn-* \
     /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack /usr/local/bin/yarn /usr/local/bin/yarnpkg /root/.npm
COPY --from=bau /app/server/dist server/dist
COPY server/migrations server/migrations
# Schriften für Ablagos eigene PDFs (#826): Noto Sans und Noto Sans Mono, schon aufbereitet (server/werkzeuge/schriften/),
# zusammen 1,4 MB, mit der Lizenz (OFL.txt). Der Bau braucht dafür kein Python.
COPY server/schriften server/schriften
# Ablagos eigene Rundgänge, Tipps und die Ankerliste (#831, #832): YAML, liest der Server beim Start.
COPY shared/entdecken shared/entdecken
COPY --from=bau /app/web/dist web/dist
COPY --from=hilfe /hilfe web/dist/hilfe
# Befehl dms in der Konsole des Containers (#244): docker exec -it <container> dms hilfe
RUN printf '#!/bin/sh\nexec node /app/server/dist/dms.js "$@"\n' > /usr/local/bin/dms && chmod 755 /usr/local/bin/dms
# Lasttest selbst durchführen (#563): docker exec -it <Test-Container> dms-lasttest klein – nur gegen eine eigene
# Test-Installation; das Skript prüft das selbst. Ohne Abhängigkeiten, nur node.
# Ohne Konsole (#612): DMS_LASTTEST=klein|mittel|gross|extrem|alle – Ablago startet dieses Skript selbst und zeigt
# Fortschritt und Ergebnis unter seinem Port (server/src/lasttestmodus.ts).
COPY server/test/lasttest.mjs /app/lasttest/lasttest.mjs
RUN printf '#!/bin/sh\nexec node /app/lasttest/lasttest.mjs "$@"\n' > /usr/local/bin/dms-lasttest && chmod 755 /usr/local/bin/dms-lasttest
# Pakete mit dem Installer dieser Version prüfen (#1124), ohne Datenbank-Server und ohne Netz – für die CI von
# dms-registry: docker run --rm -v "$PWD/pakete:/pakete:ro" ghcr.io/motom001/dms:<version> pakete-pruefen /pakete/basis …
# Der Befehl ersetzt CMD; das Entrypoint-Skript von node (bzw. tini in dms-komplett) startet ihn direkt.
RUN printf '#!/bin/sh\nexec node --enable-source-maps /app/server/dist/pakete-pruefen.js "$@"\n' > /usr/local/bin/pakete-pruefen && chmod 755 /usr/local/bin/pakete-pruefen

# Feste Ordner (#115): /data/files, /data/geheim, /data/sicherung – zugeordnet nur über Volumes.
# Dazu /data/export (#797) für Exporte: ohne eigenes Volume im Container, nie im Sicherungsordner.
ENV PORT=3000
EXPOSE 3000
# Port wie der Server (PORT, Standard 3000) – sonst wäre ein Container mit eigener PORT-Einstellung „unhealthy“ (#321).
HEALTHCHECK --interval=30s --timeout=8s --start-period=20s \
  CMD wget -qO- "http://127.0.0.1:${PORT:-3000}/api/gesundheit" >/dev/null || exit 1
CMD ["node", "--enable-source-maps", "server/dist/index.js"]

# dms-komplett (#208): Ablago und PostgreSQL 17 in einem Container. PostgreSQL ist nur innerhalb des
# Containers erreichbar (127.0.0.1, „trust“) – kein Passwort, das jemand kennen muss. tini startet das
# Skript, das erst PostgreSQL, dann Ablago startet und beim Stoppen beide sauber beendet.
FROM laufzeit AS komplett
ARG APK_TAG=""
RUN echo "Alpine-Pakete Stand ${APK_TAG}" && apk upgrade --no-cache && apk add --no-cache postgresql17 postgresql17-contrib tini su-exec
COPY deploy/komplett/start.sh /usr/local/bin/dms-komplett
RUN chmod 755 /usr/local/bin/dms-komplett
ENV DMS_VARIANTE=komplett
HEALTHCHECK --interval=30s --timeout=8s --start-period=40s \
  CMD wget -qO- "http://127.0.0.1:${PORT:-3000}/api/gesundheit" >/dev/null && pg_isready -q -h 127.0.0.1 -U dms -d dms || exit 1
# Zusätzlich zu /data/files, /data/geheim, /data/sicherung: /data/postgres. Bewusst kein VOLUME (#943): Ein anonymes
# Volume ginge beim Neuanlegen mit docker run bzw. in NAS-Oberflächen trotzdem verloren und verdeckte die Warnung in der
# Werkbank – Begründung im Entwicklerhandbuch (Aufbau, „dms-komplett: Datenbank-Ordner“).
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["/usr/local/bin/dms-komplett"]

# Standard-Ziel: nur Ablago, die Datenbank läuft daneben.
FROM laufzeit AS dms
