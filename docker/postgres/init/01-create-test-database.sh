#!/bin/bash
# Cria o banco usado pela suíte de integração.
#
# Roda uma única vez, no primeiro boot do container com o volume vazio.
# Banco de teste separado porque a suíte trunca tabelas entre os casos: apontá-la
# para o banco de desenvolvimento apagaria o trabalho do dia.
set -euo pipefail

TEST_DB="${POSTGRES_TEST_DB:-stockflow_test}"

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-SQL
	CREATE DATABASE "${TEST_DB}" OWNER "${POSTGRES_USER}";
SQL

echo "banco de teste criado: ${TEST_DB}"
