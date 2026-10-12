FROM node:22-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .
ENV PORT=8080
ENV HOST=0.0.0.0
EXPOSE 8080
CMD ["node", "server/index.mjs"]
