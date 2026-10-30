# Ein Image für Server und Weboberfläche (modularer Monolith).
# Zwei Ziele (#208): „dms“ (Standard, Datenbank extern) und „komplett“ (mit PostgreSQL im Container):
#   docker build -t dms .                         docker build --target komplett -t dms-komplett .

FROM node:22-alpine AS bau
WORKDIR /app
COPY package.json ./
COPY server/package.json server/
COPY web/package.json web/
RUN npm install --no-audit --no-fund
COPY tsconfig.base.json ./
COPY shared shared
COPY server server
COPY web web
RUN npm run build

FROM node:22-alpine AS laufzeit
LABEL org.opencontainers.image.source="https://github.com/motom001/dms" \
      org.opencontainers.image.licenses="AGPL-3.0-only"
# Texterkennung (#45): tesseract mit Deutsch (Englisch ist enthalten) und poppler für PDFs.
RUN apk add --no-cache tesseract-ocr tesseract-ocr-data-deu poppler-utils
# Stand des Images für die Versionsübersicht in der Werkbank (setzt GitHub Actions).
ARG DMS_COMMIT=""
ARG DMS_GEBAUT=""
ENV NODE_ENV=production \
    DMS_COMMIT=$DMS_COMMIT \
    DMS_GEBAUT=$DMS_GEBAUT
WORKDIR /app
COPY package.json ./
COPY server/package.json server/
COPY web/package.json web/
RUN npm install --omit=dev --workspace server --no-audit --no-fund && npm cache clean --force
COPY --from=bau /app/server/dist server/dist
COPY server/migrations server/migrations
COPY --from=bau /app/web/dist web/dist

# Feste Ordner (#115): /data/files, /data/geheim, /data/sicherung – zugeordnet nur über Volumes.
ENV PORT=3000
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
  CMD wget -qO- http://127.0.0.1:3000/api/gesundheit >/dev/null || exit 1
CMD ["node", "--enable-source-maps", "server/dist/index.js"]

# dms-komplett (#208): DMS und PostgreSQL 17 in einem Container. PostgreSQL ist nur innerhalb des
# Containers erreichbar (127.0.0.1, „trust“) – kein Passwort, das jemand kennen muss. tini startet das
# Skript, das erst PostgreSQL, dann das DMS startet und beim Stoppen beide sauber beendet.
FROM laufzeit AS komplett
RUN apk add --no-cache postgresql17 postgresql17-contrib tini su-exec
COPY deploy/komplett/start.sh /usr/local/bin/dms-komplett
RUN chmod 755 /usr/local/bin/dms-komplett
ENV DMS_VARIANTE=komplett
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s \
  CMD wget -qO- http://127.0.0.1:3000/api/gesundheit >/dev/null && pg_isready -q -h 127.0.0.1 -U dms -d dms || exit 1
# Zusätzlich zu /data/files, /data/geheim, /data/sicherung: /data/postgres.
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["/usr/local/bin/dms-komplett"]

# Standard-Ziel: nur das DMS, die Datenbank läuft daneben.
FROM laufzeit AS dms
