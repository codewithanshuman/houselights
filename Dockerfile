FROM node:24-slim AS adapter-build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY scripts/build-qloo-worker.mjs ./scripts/build-qloo-worker.mjs
RUN npm run build:worker

FROM node:24-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .
COPY --from=adapter-build /app/build ./build
RUN mkdir -p /var/data/houselights && chown -R node:node /app /var/data/houselights
USER node
ENV PORT=8080
ENV HOST=0.0.0.0
ENV NODE_ENV=production
ENV PUBLIC_DEMO=1
ENV DATA_DIR=/var/data/houselights
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server/index.mjs"]
