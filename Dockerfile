# Ein Image für Server und Weboberfläche (modularer Monolith).

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

FROM node:22-alpine
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

ENV PORT=3000 \
    FILES_DIR=/data/files \
    DMS_SCHLUESSEL_DATEI=/data/geheim/dms.schluessel
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
  CMD wget -qO- http://127.0.0.1:3000/api/gesundheit >/dev/null || exit 1
CMD ["node", "--enable-source-maps", "server/dist/index.js"]
