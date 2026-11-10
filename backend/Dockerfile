# Imagem multi-stage de PRODUÇÃO da API (Fase 8, docs/20-plano-fase-8.md).
#
# `bookworm-slim` (glibc) conforme ADR-0004 (`@node-rs/argon2` binário NAPI).
FROM node:24.15.0-bookworm-slim AS builder

RUN apt-get update \
  && apt-get install --no-install-recommends --yes openssl \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json tsconfig.build.json nest-cli.json prisma7.config.ts ./
COPY prisma ./prisma
COPY src ./src

RUN npx prisma generate && npm run build

FROM node:24.15.0-bookworm-slim AS runner

RUN apt-get update \
  && apt-get install --no-install-recommends --yes openssl \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

ENV NODE_ENV=production

COPY --from=builder --chown=node:node /app/package.json /app/package-lock.json ./
COPY --from=builder --chown=node:node /app/node_modules ./node_modules
COPY --from=builder --chown=node:node /app/dist ./dist
COPY --from=builder --chown=node:node /app/prisma ./prisma
COPY --from=builder --chown=node:node /app/prisma7.config.ts ./prisma7.config.ts

USER node

EXPOSE 3000

CMD ["npm", "run", "start:deploy"]
