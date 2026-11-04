#!/bin/bash
# Cria o banco usado pela suíte E2E (Marco 7A).
#
# Roda uma única vez, no primeiro boot do container com o volume vazio — igual
# a "01-create-test-database.sh". Banco separado do de desenvolvimento E do de
# integração: a suíte E2E sobe a aplicação real e interage por HTTP de ponta a
# ponta, e reutilizar qualquer um dos outros dois bancos arriscaria apagar
# trabalho do dia ou colidir com a suíte de integração se as duas rodarem ao
# mesmo tempo (docs/19-plano-fase-7.md §19.5.1).
set -euo pipefail

E2E_DB="${POSTGRES_E2E_DB:-stockflow_e2e}"

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-SQL
	CREATE DATABASE "${E2E_DB}" OWNER "${POSTGRES_USER}";
SQL

echo "banco E2E criado: ${E2E_DB}"
