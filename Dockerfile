# StockPulse: one container serves the built app and the API (port 3001).
# Build:  docker build -t stockpulse .
# Run:    docker run -d --name stockpulse -p 3001:3001 --env-file .env -v stockpulse-data:/app/data stockpulse
FROM node:24-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
# The app talks to the API on its own origin
ENV VITE_API_BASE=/api
RUN npm run build

FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=3001 ALERTS_FILE=/app/data/alerts.json
COPY package*.json ./
RUN npm ci --omit=dev
COPY server ./server
# server/alertEngine.js shares its alert rules with the browser code
COPY src/data/alerts.js src/data/alertStore.js ./src/data/
COPY --from=build /app/dist ./dist
RUN mkdir -p /app/data && chown -R node:node /app
USER node
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD wget -qO- http://127.0.0.1:3001/api/health || exit 1
CMD ["node", "server/index.js"]
