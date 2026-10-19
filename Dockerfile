# Образ сайта: сначала собирается страница, затем остаётся только то, что нужно для запуска.

FROM node:24-bookworm-slim AS web
WORKDIR /web
COPY client/package.json client/package-lock.json ./
RUN npm ci
COPY client/ ./
RUN npm run build

FROM node:24-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=8090

COPY invoice/package.json invoice/package-lock.json /app/invoice/
RUN npm ci --omit=dev --prefix /app/invoice

COPY invoice/src /app/invoice/src
COPY invoice/fonts /app/invoice/fonts
COPY invoice/data /app/invoice/data
COPY server /app/server
COPY data /app/data
COPY --from=web /web/dist /app/client/dist
COPY porsche.jpg /app/client/dist/porsche.jpg

EXPOSE 8090
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:8090/api/orders').then((r)=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server/index.js"]
