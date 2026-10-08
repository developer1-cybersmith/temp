FROM node:20-slim AS builder

WORKDIR /app

# Install all dependencies (including dev for tsc)
COPY package.json package-lock.json ./
RUN npm ci

# Copy source and build
COPY tsconfig.json ./
COPY src/ ./src/
COPY database/ ./database/
RUN NODE_OPTIONS="--max-old-space-size=1024" npm run build

# Production stage
FROM node:20-slim

WORKDIR /app

# Install ffmpeg for WAV→OGG/Opus audio conversion (TTS voice replies)
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/database ./database

# Create auth sessions directory
RUN mkdir -p /app/auth_sessions_v2

EXPOSE 3005

ENV NODE_ENV=production
ENV PORT=3005

CMD ["node", "dist/server.js"]
