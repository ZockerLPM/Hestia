# Debian-slim statt Alpine — Prisma 5 hat anhaltende libssl-Detection-
# Probleme auf Alpine 3.21 ARM64 ("Defaulting to openssl-1.1.x" obwohl
# OpenSSL 3 installiert ist). Debian liefert libssl3 ab Werk in der
# richtigen Variante und Prisma findet die Engine sauber.
FROM node:22-slim AS builder
WORKDIR /app

# openssl + ca-certificates sind in slim nicht garantiert dabei;
# ohne sie schlägt `prisma generate` fehl.
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm ci
COPY . .
RUN npx prisma generate
RUN npm run build


FROM node:22-slim
WORKDIR /app

# Runtime-Image braucht openssl + ca-certificates (für libssl3 dynamisch
# gelinkt von der Prisma-Query-Engine) und wget für den Healthcheck.
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates wget \
 && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma
COPY prisma ./prisma

RUN mkdir -p data
EXPOSE 3001

CMD ["sh", "-c", "npx prisma db push && node dist/index.js"]
