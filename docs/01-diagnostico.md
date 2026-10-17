# 01 — Diagnóstico do Ambiente

> Primeiro levantamento em 2026-10-17 (Fase 1).
> **Revalidado em 2026-10-17 após a instalação do WSL2, Docker Desktop e PostgreSQL.**
> Todos os valores abaixo foram obtidos por comando, não presumidos nem aceitos por relato.

## 1.1 Diretório de trabalho

| Item            | Resultado                                                             |
| --------------- | --------------------------------------------------------------------- |
| Caminho         | `C:\Users\pedro\Desktop\dev\stockflow`                                |
| Conteúdo        | `README.md` e `docs/` (entrega da Fase 1). Nenhum código de aplicação |
| Repositório Git | Não inicializado (`git rev-parse` retorna _not a git repository_)     |

**Conclusão:** projeto _greenfield_. Não há código legado, não há risco de sobrescrever
nada e não há restrição de compatibilidade herdada.

O projeto fica em `dev/stockflow/` e não na raiz `dev/`, porque `dev/` é uma pasta genérica
de trabalho. A raiz do repositório Git será `stockflow/`.

## 1.2 Ferramentas instaladas

Estado após a instalação do WSL2 e do Docker Desktop. A coluna de versão traz a saída real
do comando.

| Ferramenta        | Versão detectada              | Situação                             |
| ----------------- | ----------------------------- | ------------------------------------ |
| Node.js           | v24.15.0                      | OK, Active LTS                       |
| npm               | 11.12.1                       | OK                                   |
| Git               | 2.55.0.windows.5              | OK                                   |
| Docker Engine     | 29.8.2 (build 7fc2dff)        | OK                                   |
| Docker Compose    | v5.6.0 (plugin)               | OK                                   |
| WSL2              | Ubuntu, versão 2, em execução | OK                                   |
| PostgreSQL        | 17.11 em container            | OK, verificado por query             |
| Python            | 3.12                          | Presente, não é requisito do projeto |
| pnpm              | ausente                       | Não necessário, usaremos npm         |
| GitHub CLI (`gh`) | ausente                       | Opcional                             |

| Sistema                    | Valor                      |
| -------------------------- | -------------------------- |
| SO                         | Windows 11 Pro 10.0.26200  |
| Virtualização              | `HypervisorPresent = True` |
| Disco livre (C:)           | 127,9 GB de 953 GB         |
| Shell                      | PowerShell 5.1 e Git Bash  |
| `process.versions.modules` | 137 (ABI do Node 24)       |

### Recursos alocados ao WSL2

`%USERPROFILE%\.wslconfig`:

```ini
[wsl2]
memory=8GB
processors=6

[experimental]
autoMemoryReclaim=gradual
```

Confirmado pelo próprio daemon do Docker, que é quem consome esses recursos:

```
docker info --format '{{.ServerVersion}} | {{.OperatingSystem}} | {{.OSType}} | CPUs={{.NCPU}} | Mem={{.MemTotal}}'
29.8.2 | Docker Desktop | linux | CPUs=6 | Mem=8330014720
```

8.330.014.720 bytes equivalem a 7,76 GiB, que é o valor esperado para `memory=8GB`
descontando a reserva do kernel. `autoMemoryReclaim=gradual` devolve memória ociosa ao
Windows, o que importa porque a suíte de integração sobe e derruba Postgres com frequência.

Distribuições registradas:

```
wsl -l -v
  NAME               STATE     VERSION
* Ubuntu             Running   2
  docker-desktop     Running   2
```

A distro `docker-desktop` é criada pelo próprio Docker Desktop e é onde o daemon roda. A
`Ubuntu` fica disponível para uso direto, mas o projeto não depende dela: todos os comandos
deste repositório rodam no Windows (PowerShell ou Git Bash) falando com o daemon por socket.

## 1.3 Toolchain nativo (impacto em dependências)

```
Get-Command cl.exe  -> nao encontrado
where python        -> C:\Users\pedro\AppData\Local\Programs\Python\Python312\python.exe
```

**Este bloqueio continua válido.** Não há compilador C++ (MSVC Build Tools) instalado, e a
instalação do Docker não muda isso: `npm install` roda no Windows, não dentro do container.
Qualquer dependência que compile via `node-gyp` falhará nesta máquina.

**Dependências afetadas e descartadas por isso:**

- `argon2` (0.45.1), módulo nativo node-gyp
- `bcrypt` (6.0.0), módulo nativo node-gyp

**Substituto escolhido:** `@node-rs/argon2` (2.2.2), implementado em Rust e distribuído com
binários pré-compilados via NAPI. Não requer toolchain local. Ver
[ADR-0004](adr/0004-hash-de-senha.md).

## 1.4 Banco de dados local: resolvido

O bloqueio R1 da Fase 1 (ausência de Docker, WSL2 e PostgreSQL) está **resolvido** pela
opção A recomendada em [10-riscos.md](10-riscos.md#r1): WSL2 com Docker Desktop. Isso
preserva a paridade entre desenvolvimento, CI e produção e mantém o `docker-compose.yml`
como caminho real de execução, não como arquivo não verificado no repositório.

### Verificação executada

Container descartável, imagem `postgres:17-alpine` (a mesma que o `docker-compose.yml` vai
usar), criado e removido durante a validação:

```
docker run --name sf-pg-verify -e POSTGRES_PASSWORD=*** -e POSTGRES_DB=stockflow_probe \
           -p 55432:5432 -d postgres:17-alpine

docker exec sf-pg-verify pg_isready -U postgres
/var/run/postgresql:5432 - accepting connections

docker exec sf-pg-verify psql -U postgres -d stockflow_probe -tAc "SELECT version();"
PostgreSQL 17.11 on x86_64-pc-linux-musl, compiled by gcc (Alpine 15.2.0) 15.2.0, 64-bit
```

### Extensões necessárias ao modelo (§4.4)

O índice GIN trigram em `products.name` depende da extensão `pg_trgm`. Confirmado que ela
está disponível na imagem e que a criação funciona:

```
SELECT name, default_version FROM pg_available_extensions
 WHERE name IN ('pg_trgm','pgcrypto','btree_gin');
 btree_gin | 1.3
 pg_trgm   | 1.6
 pgcrypto  | 1.3

CREATE EXTENSION IF NOT EXISTS pg_trgm;
 pg_trgm | 1.6
```

`gen_random_uuid()` respondeu sem `pgcrypto`, porque é função nativa desde o PostgreSQL 13.
A aplicação gera UUIDv7 no lado do Node (§4.2), então o default do banco serve apenas de
rede de segurança.

### Mecanismo de concorrência validado no SQL

Antes de construir a Fase 5 sobre o [ADR-0003](adr/0003-estrategia-de-concorrencia.md), as
três camadas de defesa foram testadas direto no banco, em uma tabela `numeric(14,3)` com
CHECK de não-negatividade:

```sql
-- 1. UPDATE condicional com saldo suficiente: 1 linha, saldos vindos do banco
UPDATE probe_products SET current_stock = current_stock - 3.000
 WHERE id = '...' AND is_active = true AND current_stock >= 3.000
RETURNING current_stock + 3.000 AS stock_before, current_stock AS stock_after;

 stock_before | stock_after
--------------+-------------
       10.000 |       7.000
(1 row)

-- 2. UPDATE condicional sem saldo: 0 linhas, nenhuma escrita
UPDATE probe_products SET current_stock = current_stock - 100.000
 WHERE id = '...' AND current_stock >= 100.000
RETURNING current_stock;

(0 rows)
UPDATE 0

-- 3. CHECK como última barreira: UPDATE sem a guarda é recusado pelo banco
UPDATE probe_products SET current_stock = current_stock - 100.000 WHERE id = '...';

ERROR: new row for relation "probe_products" violates check constraint
       "probe_stock_non_negative"
DETAIL: Failing row contains (..., -93.000, t, ...)
```

Os três comportamentos previstos no ADR-0003 se confirmam no PostgreSQL 17.11 desta
máquina. Isso não substitui o teste de concorrência da Fase 5, que precisa de requisições
HTTP paralelas de verdade: valida apenas que a primitiva de banco em que o teste se apoia
se comporta como o desenho supõe.

### Limpeza

```
docker rm -f sf-pg-verify
docker ps -a --filter "name=sf-pg"   -> nenhum resultado
```

A imagem `postgres:17-alpine` (424 MB) foi mantida em cache de propósito: é a imagem do
`docker-compose.yml`, e deixá-la baixada economiza o primeiro `docker compose up`.

## 1.5 Identidade Git configurada

```
user.name  = pedr0coder
user.email = pedrocortezmissao@gmail.com
```

Confere com o autor do projeto. Nenhuma alteração de autoria será feita, e nenhum trailer
de ferramenta será adicionado aos commits.

## 1.6 Checklist de diagnóstico

- [x] Diretório inspecionado
- [x] Estado do repositório confirmado (não inicializado)
- [x] Versões de runtime verificadas por comando
- [x] Toolchain nativo verificado (ausência de MSVC confirmada e contornada)
- [x] Identidade Git verificada
- [x] Espaço em disco verificado
- [x] Virtualização confirmada habilitada
- [x] WSL2 em execução, versão 2, com recursos alocados
- [x] Docker Engine e Docker Compose respondendo
- [x] **PostgreSQL 17.11 verificado por query**
- [x] **Extensão `pg_trgm` confirmada disponível**
- [x] **Primitiva de concorrência do ADR-0003 validada em SQL**
- [x] Container de verificação removido

Nenhum bloqueio de ambiente permanece aberto. A Fase 2 está liberada do ponto de vista de
infraestrutura local.
