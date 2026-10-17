#!/bin/sh
# Entrypoint da API em desenvolvimento.
#
# O healthcheck do compose já garante que o Postgres aceita conexão antes de o
# backend iniciar. A espera abaixo cobre o caso em que alguém sobe só este
# serviço, sem o compose, e é barata o suficiente para valer a redundância.
set -eu

DB_HOST="${DB_HOST:-db}"
DB_PORT="${DB_PORT:-5432}"

echo "aguardando ${DB_HOST}:${DB_PORT}..."
attempts=0
until nc -z "$DB_HOST" "$DB_PORT"; do
  attempts=$((attempts + 1))
  if [ "$attempts" -ge 60 ]; then
    echo "banco não respondeu em 60 tentativas. Abortando." >&2
    exit 1
  fi
  sleep 1
done

# `migrate deploy` e não `migrate dev`: deploy apenas aplica as migrations que
# existem. O `dev` pode gerar migration nova e pedir confirmação interativa,
# o que em container trava o boot.
echo "aplicando migrations..."
npx prisma migrate deploy

exec "$@"
