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
ENV NODE_ENV=production
WORKDIR /app
COPY package.json ./
COPY server/package.json server/
COPY web/package.json web/
RUN npm install --omit=dev --workspace server --no-audit --no-fund && npm cache clean --force
COPY --from=bau /app/server/dist server/dist
COPY server/migrations server/migrations
COPY --from=bau /app/web/dist web/dist

ENV PORT=3000 \
    FILES_DIR=/data/files
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
  CMD wget -qO- http://127.0.0.1:3000/api/gesundheit >/dev/null || exit 1
CMD ["node", "--enable-source-maps", "server/dist/index.js"]
