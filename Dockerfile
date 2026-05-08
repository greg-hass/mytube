# Frontend build stage
FROM node:20-alpine AS frontend-builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# Backend dependency stage
FROM node:20-alpine AS backend-deps

WORKDIR /app/server

COPY server/package*.json ./
RUN npm ci --omit=dev

# Production stage: nginx serves the PWA, Node serves /api behind nginx.
FROM node:20-alpine

RUN apk add --no-cache nginx curl

WORKDIR /app

COPY --from=frontend-builder /app/dist /usr/share/nginx/html
COPY --from=backend-deps /app/server/node_modules /app/server/node_modules
COPY server /app/server
COPY nginx.conf /etc/nginx/http.d/default.conf
COPY docker/start.sh /usr/local/bin/start-youtube-subscriptions

RUN chmod +x /usr/local/bin/start-youtube-subscriptions \
  && mkdir -p /run/nginx /app/server/data

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -fsS http://localhost/api/videos/status >/dev/null || exit 1

EXPOSE 80
VOLUME ["/app/server/data"]

CMD ["start-youtube-subscriptions"]
