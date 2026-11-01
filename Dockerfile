# Ein Image für Server und Weboberfläche (modularer Monolith).
# Zwei Ziele (#208): „dms“ (Standard, Datenbank extern) und „komplett“ (mit PostgreSQL im Container):
#   docker build -t dms .                         docker build --target komplett -t dms-komplett .

FROM node:24-alpine AS bau
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
FROM python:3.12-alpine AS hilfe
# Feste Versionen mit Hashes (#289), dieselben wie im Handbuch-Workflow.
COPY docs/handbuch/requirements.txt /tmp/requirements.txt
RUN pip install --no-cache-dir --disable-pip-version-check --require-hashes -r /tmp/requirements.txt
WORKDIR /src
COPY package.json ./
COPY docs/releases docs/releases
COPY docs/handbuch docs/handbuch
RUN python3 docs/handbuch/werkzeuge/offline.py /hilfe

FROM node:24-alpine AS laufzeit
LABEL org.opencontainers.image.source="https://github.com/motom001/dms" \
      org.opencontainers.image.licenses="Apache-2.0"
# Alpine-Pakete aktuell halten (#214): Die Kalenderwoche gehört zur Cache-Kennung dieser Schicht,
# also holt jeder Bau in einer neuen Woche die neuesten Pakete (sonst nähme der Build-Cache ewig die alten).
ARG APK_WOCHE=""
# Texterkennung (#45): tesseract mit Deutsch und Englisch und poppler für PDFs. Englisch ist ein eigenes
# Paket (#395: vorher fehlte es still). osd: Lage und Schrift erkennen, gedrehte Seiten richtig lesen.
# Weitere Sprachen: eigenes Image mit „apk add tesseract-ocr-data-fra“ o. Ä. (Admin-Handbuch → Texterkennung).
RUN echo "Alpine-Pakete Stand ${APK_WOCHE}" && apk upgrade --no-cache && apk add --no-cache tesseract-ocr tesseract-ocr-data-deu tesseract-ocr-data-eng tesseract-ocr-data-osd poppler-utils
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
# Danach npm, Yarn und Corepack entfernen (#220): Das DMS braucht sie zur Laufzeit nicht, und sie
# bringen eigene Bibliotheken mit, deren Lücken sonst im Image stünden. Nur node selbst bleibt.
RUN npm ci --omit=dev --workspace server --no-audit --no-fund && npm cache clean --force \
  && rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack /opt/yarn-* \
     /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack /usr/local/bin/yarn /usr/local/bin/yarnpkg /root/.npm
COPY --from=bau /app/server/dist server/dist
COPY server/migrations server/migrations
COPY --from=bau /app/web/dist web/dist
COPY --from=hilfe /hilfe web/dist/hilfe
# Befehl dms in der Konsole des Containers (#244): docker exec -it <container> dms hilfe
RUN printf '#!/bin/sh\nexec node /app/server/dist/dms.js "$@"\n' > /usr/local/bin/dms && chmod 755 /usr/local/bin/dms

# Feste Ordner (#115): /data/files, /data/geheim, /data/sicherung – zugeordnet nur über Volumes.
ENV PORT=3000
EXPOSE 3000
# Port wie der Server (PORT, Standard 3000) – sonst wäre ein Container mit eigener PORT-Einstellung „unhealthy“ (#321).
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
  CMD wget -qO- "http://127.0.0.1:${PORT:-3000}/api/gesundheit" >/dev/null || exit 1
CMD ["node", "--enable-source-maps", "server/dist/index.js"]

# dms-komplett (#208): DMS und PostgreSQL 17 in einem Container. PostgreSQL ist nur innerhalb des
# Containers erreichbar (127.0.0.1, „trust“) – kein Passwort, das jemand kennen muss. tini startet das
# Skript, das erst PostgreSQL, dann das DMS startet und beim Stoppen beide sauber beendet.
FROM laufzeit AS komplett
ARG APK_WOCHE=""
RUN echo "Alpine-Pakete Stand ${APK_WOCHE}" && apk upgrade --no-cache && apk add --no-cache postgresql17 postgresql17-contrib tini su-exec
COPY deploy/komplett/start.sh /usr/local/bin/dms-komplett
RUN chmod 755 /usr/local/bin/dms-komplett
ENV DMS_VARIANTE=komplett
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s \
  CMD wget -qO- "http://127.0.0.1:${PORT:-3000}/api/gesundheit" >/dev/null && pg_isready -q -h 127.0.0.1 -U dms -d dms || exit 1
# Zusätzlich zu /data/files, /data/geheim, /data/sicherung: /data/postgres.
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["/usr/local/bin/dms-komplett"]

# Standard-Ziel: nur das DMS, die Datenbank läuft daneben.
FROM laufzeit AS dms
