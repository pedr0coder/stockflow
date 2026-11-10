# 20 — Plano e Preparação da Fase 8 (Deploy em Produção / Demonstração)

## 20.1 Objetivo e Escopo da Fase 8

Colocar o **StockFlow** em execução pública gratuita, contínua e auditável para avaliação de portfólio, preservando todas as invariantes arquiteturais, transacionais e de segurança construídas até a Fase 7 (`CI #20` 100% verde).

### Provedores escolhidos (custo zero, sem expiração de 30 dias)

| Camada                                | Serviço                                | Motivo técnico da escolha                                                                                                                                                                                              |
| :------------------------------------ | :------------------------------------- | :--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Frontend SPA + Proxy de Borda**     | **Cloudflare Pages + Pages Functions** | CDN global gratuita, suporte nativo a SPA (`_redirects`) e **Pages Functions** (`frontend/functions/api/[[catchall]].ts`) para proxy reverso same-origin de `/api/*`.                                                  |
| **Backend API (NestJS 12 / Node 24)** | **Render Free Web Service**            | Suporte direto a Node 24 / Docker (`render.yaml` e `backend/Dockerfile`), health check nativo (`/api/v1/health/ready`) e deploy contínuo na branch `main`.                                                             |
| **Banco de Dados (PostgreSQL 17)**    | **Neon Free Serverless Postgres**      | PostgreSQL 17 gerenciado gratuito **sem expiração de 30 dias** (diferente do Render Postgres Free), suporte a extensão `pg_trgm`, conexão com pooler (`DATABASE_URL`) e conexão direta para migrations (`DIRECT_URL`). |

---

## 20.2 Decisões Técnicas e Auditoria dos 7 Pontos Críticos

### 1. Proxy Cloudflare Pages Functions e Autenticação por Cookies (`SameSite=Strict`)

- **O problema de hospedagem separada**:
  - Conforme `docs/08-seguranca.md §8.2` e `ADR-0005`, o refresh token trafega no cookie `stockflow_refresh` com os atributos `HttpOnly; Secure; SameSite=Strict; Path=/api/v1/auth` (`backend/src/auth/refresh-cookie.ts`).
  - Como `*.pages.dev` (Cloudflare Pages) e `*.onrender.com` (Render) estão em domínios públicos distintos (eTLD+1 diferentes), uma requisição `fetch` direta do navegador no Cloudflare Pages para o Render seria _cross-site_, e o navegador bloquearia o envio do cookie `SameSite=Strict`.
- **Solução implementada (`frontend/functions/api/[[catchall]].ts`)**:
  - O frontend mantém `VITE_API_URL=/api/v1` (URL relativa, idêntica ao ambiente de desenvolvimento).
  - Toda requisição a `/api/*` no domínio do Cloudflare Pages é interceptada pela Pages Function `frontend/functions/api/[[catchall]].ts`, que encaminha a chamada para `env.BACKEND_ORIGIN` (`https://<servico>.onrender.com`).
  - A Pages Function:
    1. Valida `BACKEND_ORIGIN` e bloqueia qualquer tentativa de _path traversal_ (`..`, `//`) ou escape de origem (prevenção de SSRF);
    2. Encaminha método, query string, corpo e cabeçalhos relevantes (`Authorization`, `Cookie`, `Content-Type`, `Accept`, `User-Agent`, `X-Request-Id`), além de preencher `X-Forwarded-For` a partir de `CF-Connecting-IP`;
    3. Repassa os cabeçalhos `Set-Cookie` da resposta do NestJS (`getSetCookie()`), removendo eventual atributo `Domain=` para que o cookie `stockflow_refresh` seja gravado como _host-only_ na origem do Cloudflare Pages;
    4. Em caso de indisponibilidade ou _cold start_ prolongado do upstream, devolve erro JSON estruturado no contrato único da API (`statusCode: 502`, `code: 'BAD_GATEWAY'`, `message`, `timestamp`, `path`, `requestId`).

### 2. Compatibilidade do NestJS com Render Free e Segurança de IP na Cadeia de Proxies

- **Bind e Porta**: `backend/src/main.ts` lê `PORT` via `ConfigService` e escuta em `0.0.0.0` (`await app.listen(port, '0.0.0.0')`).
- **Health Check**: `backend/src/health/health.controller.ts` expõe `@Public() GET /api/v1/health` (liveness) e `@Public() GET /api/v1/health/ready` (readiness com `SELECT 1` no PostgreSQL), configurado em `render.yaml` (`healthCheckPath: /api/v1/health/ready`).
- **Diagnóstico da Cadeia de Proxies (Cloudflare Pages Functions → Render → NestJS)**:
  - **Mecânica do Express com `trust proxy = 1`**: o Express (via biblioteca `proxy-addr`) confia em exatamente 1 salto a partir do socket (`req.socket.remoteAddress`, que é o roteador interno do Render). Em seguida, analisa `X-Forwarded-For` da direita para a esquerda e para no salto 1 (o endereço que abriu conexão com o Render).
  - **O Risco da Chamada via Cloudflare Pages com `trust proxy = 1` isolado**:
    - O visitante legítimo (`198.51.100.25`) acessa o Cloudflare Pages.
    - A Pages Function encaminha a requisição com `X-Forwarded-For: 198.51.100.25`.
    - A conexão TCP com o Render parte do IP de saída do worker da Cloudflare (`172.70.x.x`).
    - O balanceador do Render anexa esse IP: `X-Forwarded-For: 198.51.100.25, 172.70.x.x`.
    - Com `trust proxy = 1`, o Express para em `172.70.x.x` (o IP da Cloudflare).
    - **Impacto**: todos os usuários legítimos compartilhariam o mesmo IP. No `RefreshThrottlerGuard` (`30 req / 15 min por IP`), 30 refreshes somados de toda a aplicação esgotariam a cota de todos os clientes; no `LoginThrottlerGuard` (`5 / 15 min por IP+email`), 5 erros de senha em uma conta travariam o login daquela conta para qualquer outro usuário na Cloudflare.
  - **O Risco do `trust proxy = 2` ou Confiança Cega em Cabeçalhos em Acesso Direto**:
    - Se `trust proxy` fosse elevado para `2`, um atacante chamando a URL pública `*.onrender.com` diretamente com `X-Forwarded-For: 1.1.1.1` faria o Express confiar no IP do atacante como salto 1 e adotar `1.1.1.1` como `req.ip`.
    - Da mesma forma, confiar cegamente em `CF-Connecting-IP` permitiria que qualquer atacante chamando o Render diretamente forjasse `CF-Connecting-IP: 1.1.1.1`, contornando os limites de login e refresh indefinidamente.
  - **Solução Implementada: Autenticação Mútua de Borda via `x-stockflow-proxy-secret`**:
    - A Pages Function (`frontend/functions/api/[[catchall]].ts`) anexa o cabeçalho `x-stockflow-proxy-secret` contendo o valor de `env.PROXY_SECRET`, além de repassar o IP real obtido com exclusividade da borda Cloudflare (`CF-Connecting-IP`).
    - O backend registra o middleware `createClientIpMiddleware` (`backend/src/common/middleware/client-ip.middleware.ts`):
      1. Se o cabeçalho coincidir com `PROXY_SECRET` (verificado em tempo constante com `timingSafeEqual`), a requisição é reconhecida como originada do nosso proxy oficial, e o IP repassado (`cf-connecting-ip` ou primeiro salto de `x-forwarded-for`) é adotado em `req.ip`.
      2. Se a requisição NÃO contiver o segredo correto (acesso direto ao Render por robôs, curl ou atacantes), cabeçalhos forjados são ignorados e o IP é fixado no endereço real da conexão TCP (`Render-Client-IP` ou `req.ip` via `trust proxy = 1`), impedindo spoofing de IP.
      3. O cabeçalho `x-stockflow-proxy-secret` é removido imediatamente da requisição para não vazar downstream.
      4. Em ambiente local/CI (onde `PROXY_SECRET` não é configurado), o sistema opera em fallback transparente com `req.ip` nativo.

### 3. Configuração do Prisma 7 com Neon PostgreSQL

- **Runtime (`backend/src/prisma/prisma.service.ts`)**:
  - Utiliza `@prisma/adapter-pg` (`PrismaPg`) com `CONNECTION_POOL_MAX = 10` e `CONNECTION_TIMEOUT_MS = 10_000` (10s, suficiente para absorver o _cold start_ de 3–5s do compute serverless do Neon Free após inatividade).
- **CLI e Migrations (`backend/prisma7.config.ts`)**:
  - Atualizado `datasource.url` para `process.env['DIRECT_URL'] ?? process.env['DATABASE_URL']`.
  - No Neon PostgreSQL, `DATABASE_URL` pode apontar para o endpoint com pooler (`-pooler...neon.tech?sslmode=require`), enquanto `DIRECT_URL` aponta para a conexão direta exigida pelo `prisma migrate deploy`. Nos ambientes local e CI (onde `DIRECT_URL` não é definida), o fallback para `DATABASE_URL` preserva 100% de compatibilidade.

### 4. Execução Segura de `prisma migrate deploy`

- No plano gratuito do Render não há suporte a `preDeployCommand`.
- Adicionado o script `"start:deploy": "prisma migrate deploy && node dist/main.js"` em `backend/package.json` (usado tanto no `render.yaml` quanto no `CMD` do `backend/Dockerfile` multi-stage).
- No `render.yaml`, o `buildCommand` utiliza `npm ci --include=dev && npm run prisma:generate && npm run build`, garantindo que `prisma`, `dotenv`, `@nestjs/cli`, `@swc/core` e `typescript` estejam presentes mesmo quando `NODE_ENV=production` está definida no serviço.

### 5. Segurança das Contas e dos Dados de Demonstração (`backend/prisma/seed-demo.ts`)

- O script de desenvolvimento `backend/prisma/seed.ts` **mantém intacta** a trava `assertAmbienteDeDesenvolvimento()` que recusa `NODE_ENV=production`.
- Para popular o banco público de demonstração de portfólio de forma deliberada e auditável, foi criado `backend/prisma/seed-demo.ts` (`npm --prefix backend run seed:demo`), protegido por três barreiras testadas unitariamente em `backend/prisma/seed-demo.spec.ts`:
  1. **Opt-in explícito**: exige `ALLOW_DEMO_SEED=true` no ambiente (em `render.yaml`, o valor padrão é `'false'`, devendo ser habilitado apenas para a execução inicial ou reset planejado).
  2. **Isolamento de banco**: recusa executar contra `stockflow_test` ou `stockflow_e2e` e oculta credenciais (`:***@`) em qualquer mensagem de erro.
  3. **Política estrita de senhas**: lê `DEMO_ADMIN_PASSWORD`, `DEMO_MANAGER_PASSWORD` e `DEMO_OPERATOR_PASSWORD` (com fallback para `SEED_*_PASSWORD`), exige entre 10 e 128 caracteres (`docs/08-seguranca.md §8.1`) e bloqueia senhas triviais (`1234567890`, `Password123`, `admin12345`, etc.).
  4. **Integridade transacional**: cria/atualiza os 3 perfis (`ADMIN`, `MANAGER`, `OPERATOR`), 7 categorias, 5 fornecedores fictícios (`.invalid`), 41 produtos, lança as movimentações pelo `StockMovementsService` real (mantendo `GET /api/v1/reports/stock-reconciliation` com `0` divergências) e abre 1 inventário de demonstração em status `COUNTING` pelo `InventoriesService` real.

### 6. Funcionamento das Rotas React (SPA)

- Adicionado `frontend/public/_redirects` com a regra `/* /index.html 200`.
- Durante `npm --prefix frontend run build`, o Vite copia `_redirects` para `frontend/dist/_redirects`, garantindo que qualquer navegação direta ou recarregamento (`F5`) em rotas do `createBrowserRouter` (`/dashboard`, `/products`, `/inventories/:id`, `/reports`, `/login`) sirva `index.html` com status `200`, enquanto `/api/*` é processado prioritariamente pela Pages Function.

### 7. Compatibilidade com o GitHub Actions Existente (`.github/workflows/ci.yml`)

- O job `secrets-check` em `.github/workflows/ci.yml` exige que nenhuma chave contendo `SECRET`, `PASSWORD` ou `TOKEN` tenha valor preenchido em `.env.example`. Todas as novas chaves de senha (`DEMO_ADMIN_PASSWORD=`, `DEMO_MANAGER_PASSWORD=`, `DEMO_OPERATOR_PASSWORD=`) foram declaradas vazias em `.env.example`.
- `frontend/tsconfig.node.json` e `frontend/vite.config.ts` foram atualizados para incluir `frontend/functions/`, garantindo que `npm --prefix frontend run lint`, `typecheck` e `test` validem o código e os testes unitários da Pages Function no CI.

---

## 20.3 Inventário de Arquivos da Fase 8

### Arquivos novos criados (8)

- [`frontend/functions/api/[[catchall]].ts`](../frontend/functions/api/[[catchall]].ts) — Proxy reverso same-origin para `/api/*` no Cloudflare Pages Functions.
- [`frontend/functions/api/catchall.unit.test.ts`](../frontend/functions/api/catchall.unit.test.ts) — Suíte de testes unitários do proxy (`resolveBackendOrigin`, `sanitizeSetCookieHeader`, `onRequest`).
- [`frontend/public/_redirects`](../frontend/public/_redirects) — Regra de fallback SPA para o Cloudflare Pages.
- [`backend/src/common/middleware/client-ip.middleware.ts`](../backend/src/common/middleware/client-ip.middleware.ts) — Resolução segura de IP e mitigação de spoofing com autenticação mútua de proxy.
- [`backend/src/common/middleware/client-ip.middleware.spec.ts`](../backend/src/common/middleware/client-ip.middleware.spec.ts) — Suíte de testes unitários da resolução de IP e timingSafeEqual.
- [`backend/prisma/seed-demo.ts`](../backend/prisma/seed-demo.ts) — Script idempotente e protegido (`ALLOW_DEMO_SEED=true`) para semear o ambiente de demonstração.
- [`backend/prisma/seed-demo.spec.ts`](../backend/prisma/seed-demo.spec.ts) — Testes unitários e de subprocesso das travas de segurança de `seed-demo.ts`.
- [`backend/Dockerfile`](../backend/Dockerfile) — Imagem Docker multi-stage de produção (Node 24.15.0 Bookworm Slim, usuário não-root `node`).
- [`render.yaml`](../render.yaml) — Blueprint de deploy do serviço web no Render Free.
- [`docs/20-plano-fase-8.md`](20-plano-fase-8.md) — Este documento de planejamento, arquitetura e runbook da Fase 8.

### Arquivos existentes atualizados (10)

- [`backend/src/bootstrap.ts`](../backend/src/bootstrap.ts) — Habilita `trust proxy` (`1` salto) e registra `createClientIpMiddleware(proxySecret)`.
- [`backend/src/config/env.validation.ts`](../backend/src/config/env.validation.ts) — Adiciona `PROXY_SECRET?: string` opcional ao schema do ambiente.
- [`backend/src/config/env.validation.spec.ts`](../backend/src/config/env.validation.spec.ts) — Teste de validação para `PROXY_SECRET`.
- [`backend/test/security.int-spec.ts`](../backend/test/security.int-spec.ts) — Teste de regressão comprovando que forjar XFF ou CF-Connecting-IP em acesso direto não burla o rate limit.
- [`backend/prisma7.config.ts`](../backend/prisma7.config.ts) — Suporte a `DIRECT_URL ?? DATABASE_URL` para migrations no Neon PostgreSQL.
- [`backend/prisma/seed.ts`](../backend/prisma/seed.ts) — Exporta catálogo e plano determinístico de movimentos para reúso sem duplicação em `seed-demo.ts` e guarda `main()` com `require.main === module`.
- [`backend/package.json`](../backend/package.json) — Adiciona scripts `start:deploy` e `seed:demo`.
- [`backend/eslint.config.mjs`](../backend/eslint.config.mjs) — Inclui `prisma/seed-demo.ts` na regra `no-console: 'off'` de scripts de CLI.
- [`backend/vitest.config.mts`](../backend/vitest.config.mts) — Inclui `prisma/**/*.spec.ts` na descoberta de testes unitários.
- [`frontend/tsconfig.node.json`](../frontend/tsconfig.node.json) — Inclui `functions` no typecheck e lint do projeto Node/Edge.
- [`frontend/vite.config.ts`](../frontend/vite.config.ts) — Inclui `functions/**/*.unit.test.ts` na execução do Vitest.
- [`.env.example`](../.env.example) — Documenta `DIRECT_URL`, `ALLOW_DEMO_SEED`, `DEMO_*_PASSWORD`, `BACKEND_ORIGIN` e `PROXY_SECRET`.

---

## 20.4 Runbook das Etapas que Dependem de Serviços Externos

Após o commit e push para `origin/main` (e confirmação do GitHub Actions verde), execute os 3 passos abaixo nos painéis dos provedores:

### Passo 1 — Banco de Dados no Neon Free (PostgreSQL 17)

1. Crie um projeto no **Neon** (`https://console.neon.tech`) com **PostgreSQL 17** na mesma região do Render (ex.: `AWS us-west-2 (Oregon)` ou `us-east-1`).
2. Copie as duas strings de conexão fornecidas pelo Neon (ambas com `?sslmode=require`):
   - **Pooled connection** (`...-pooler...neon.tech/neondb?sslmode=require`) → será usada em `DATABASE_URL`.
   - **Direct connection** (`...neon.tech/neondb?sslmode=require`, sem `-pooler`) → será usada em `DIRECT_URL`.

### Passo 2 — Backend API no Render Free

1. No painel do **Render** (`https://dashboard.render.com`), crie um **Web Service** conectado ao repositório `pedr0coder/stockflow` (ou use **New → Blueprint** lendo `render.yaml`).
2. Caso configure manualmente sem Blueprint:
   - **Root Directory**: `backend`
   - **Runtime**: `Node`
   - **Build Command**: `npm ci --include=dev && npm run prisma:generate && npm run build`
   - **Start Command**: `npm run start:deploy`
   - **Health Check Path**: `/api/v1/health/ready`
3. Preencha as variáveis de ambiente secretas no Render:
   - `DATABASE_URL`: URL _pooled_ do Neon (`?sslmode=require`)
   - `DIRECT_URL`: URL _direct_ do Neon (`?sslmode=require`)
   - `JWT_SECRET`: string aleatória de 48+ bytes (`node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"`)
   - `JWT_REFRESH_SECRET`: outra string aleatória distinta de 48+ bytes
   - `CORS_ORIGINS`: URL pública do projeto no Cloudflare Pages (ex.: `https://stockflow.pages.dev`)
   - `PROXY_SECRET`: string aleatória de 32+ bytes compartilhada com a Cloudflare Pages Function
   - `DEMO_ADMIN_PASSWORD`, `DEMO_MANAGER_PASSWORD`, `DEMO_OPERATOR_PASSWORD`: senhas fortes (`>= 10` caracteres) para as contas de demonstração.
4. Após o primeiro deploy ficar `Live` e `/api/v1/health/ready` responder `200 OK`:
   - Para popular os dados fictícios de demonstração, execute uma única vez (localmente apontando `DIRECT_URL` para o Neon, ou via job inicial):
     ```bash
     ALLOW_DEMO_SEED=true npm --prefix backend run seed:demo
     ```
   - Mantenha `ALLOW_DEMO_SEED=false` no ambiente permanente de execução.

### Passo 3 — Frontend + Proxy no Cloudflare Pages

1. No painel da **Cloudflare** (`Workers & Pages → Create application → Pages → Connect to Git`), selecione `pedr0coder/stockflow` (branch `main`).
2. Configure o build:
   - **Root directory**: `frontend`
   - **Build command**: `npm run build`
   - **Build output directory**: `dist`
3. Em **Settings → Environment variables (Production & Preview)**, defina:
   - `NODE_VERSION`: `24.15.0`
   - `VITE_API_URL`: `/api/v1`
   - `BACKEND_ORIGIN`: URL pública do serviço no Render (ex.: `https://stockflow-api.onrender.com`, sem barra final e sem `/api/v1`).
   - `PROXY_SECRET`: exatamente o mesmo valor definido no Render (para que o proxy assine as requisições autenticadas para o NestJS).
4. Faça o deploy e valide:
   - Abertura de `/login` e autenticação real;
   - Presença do cookie `stockflow_refresh` (`HttpOnly; Secure; SameSite=Strict; Path=/api/v1/auth`) no domínio `*.pages.dev`;
   - Recarregamento (`F5`) em `/dashboard`, `/products`, `/inventories` e `/reports` mantendo a sessão ativa via `/api/v1/auth/refresh`.

---

## 20.5 Itens Dependentes da Infraestrutura Real para Validação Pós-Deploy

Alguns comportamentos dependem das características específicas de rede dos provedores em produção e devem ser auditados após o deploy público:

1. **Validação da Cadeia de IP no Render Live Logs**:
   - Disparar uma chamada direta ao Render com curl forjando `X-Forwarded-For` e `CF-Connecting-IP`:
     ```bash
     curl -i -H "X-Forwarded-For: 1.1.1.1" -H "CF-Connecting-IP: 2.2.2.2" https://<servico>.onrender.com/api/v1/health
     ```
   - Confirmar nos logs do Render que o IP registrado não é `1.1.1.1` nem `2.2.2.2`, mas sim o IP público real da máquina de teste (via `Render-Client-IP` / `trust proxy = 1`).
2. **Validação do Proxy Autenticado via Cloudflare Pages**:
   - Acessar o frontend na Cloudflare Pages (`https://<projeto>.pages.dev/api/v1/health`), abrir o log do Render e confirmar que o IP do cliente é o IP do navegador (repassado pela Pages Function com `x-stockflow-proxy-secret`), e não o IP interno da Cloudflare.
3. **Comportamento do `Render-Client-IP` sob o Balanceador do Render**:
   - Verificar nos logs de auditoria se o cabeçalho `Render-Client-IP` está sendo consistentemente preenchido pelo roteador do Render em requisições diretas.
4. **Cold Start do Neon Serverless e Timeout**:
   - Acessar a aplicação após 10 minutos de inatividade (quando o compute do Neon entra em sleep) e confirmar que o `connectionTimeoutMillis: 10_000` em `PrismaPg` é suficiente para acordar o banco sem disparar `502 Bad Gateway` no proxy Cloudflare.
