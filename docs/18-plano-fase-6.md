# 18 — Plano da Fase 6 (Integração frontend ↔ backend)

> **Este documento é planejamento. Nenhuma linha de código foi escrita, nenhuma dependência
> foi instalada, nenhuma migration foi executada e nenhum arquivo de pré-visualização foi
> removido.** Toda afirmação sobre o estado atual do código vem de leitura direta dos
> arquivos, não da documentação — onde os dois discordaram, está dito abaixo.

## 18.1 Diagnóstico executado

Antes de propor qualquer coisa, confirmado:

| Item               | Estado                                                                                    |
| ------------------ | ----------------------------------------------------------------------------------------- |
| Diretório          | `C:\Users\pedro\Desktop\dev\stockflow`                                                    |
| Branch / `HEAD`    | `main` / `6f61833`                                                                        |
| `origin`           | `https://github.com/pedr0coder/stockflow.git`, sincronizado (0 à frente, 0 atrás)         |
| Árvore de trabalho | limpa                                                                                     |
| CI do `HEAD`       | concluído com sucesso (confirmado pelo responsável)                                       |
| Fase 5             | declarada aprovada e encerrada, com as ressalvas técnicas documentadas em §17.17 e §17.18 |

Lidos: `09-roadmap.md`, `06-mvp-e-telas.md`, `02-arquitetura.md`, `05-api.md`, `08-seguranca.md`,
`03-stack.md`, `07-testes.md`, `14-relatorio-fase-3.md`, `16-relatorio-fase-4.md`,
`17-plano-fase-5.md` (§17.17–17.18), ADR-0002, ADR-0005. Inspecionado diretamente: todo
`frontend/src` (42 arquivos), `backend/test/contract.int-spec.ts` (a lista real de 53 rotas),
`backend/src/common/errors/error-codes.ts`, `backend/src/auth/*`, `backend/src/bootstrap.ts`,
`backend/vite.config.ts` → `frontend/vite.config.ts`, `.env.example`.

### Divergências entre documentação e código, encontradas e registradas

| #   | Onde                              | O que a doc diz                                | O que o código faz                                                                                                                          | Decisão                                                                                        |
| --- | --------------------------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| 1   | `docs/05-api.md §5.1`             | Lista 13 códigos de erro de negócio            | `error-codes.ts` tem **15**: faltam `INVENTORY_INVALID_STATE` e `PRODUCT_IN_OPEN_INVENTORY` (adicionados no marco 5B, doc nunca atualizada) | Tratar os 15 reais no mapa de mensagens (§18.6); atualizar `05-api.md` como tarefa do bloco 6A |
| 2   | nenhuma doc menciona              | —                                              | O cookie de refresh tem `path: '/api/v1/auth'` (não `/`) — o navegador só o envia para rotas de auth, nunca em requisição de negócio        | Nenhuma mudança necessária; **favorável**, registrado em §18.5                                 |
| 3   | nenhuma doc menciona              | —                                              | `vite.config.ts` já faz proxy de `/api` → backend em dev, então não há CORS real em desenvolvimento (`VITE_API_URL=/api/v1`, relativo)      | O `api-client.ts` deve usar a URL relativa, nunca montar origem absoluta                       |
| 4   | `03-stack.md`                     | `recharts` 3.10.1 já aprovado para o dashboard | Não está em `package.json` ainda                                                                                                            | Instalação autorizada no bloco 6B, sem pedir aprovação de novo (já aprovada)                   |
| 5   | `14-relatorio-fase-3.md §14.10.3` | Lista 4 pontos de pré-visualização a remover   | Confirmado linha a linha no código (§18.4) — a lista está certa e completa                                                                  | Nenhuma mudança                                                                                |

Nenhuma outra divergência relevante encontrada. O contrato de erro (`§2.6`), a convenção de
decimal como string, a paginação e o RBAC por papel no backend batem com o que o frontend já
assume no tipo `AuthContextValue` e no `nav-items.ts`.

## 18.2 Escopo exato da Fase 6, e exclusões

Fonte: `docs/09-roadmap.md` (seção "Fase 6") e `docs/06-mvp-e-telas.md §6.2`.

### Dentro do escopo

- Cliente HTTP centralizado e tipado, com refresh automático em 401 e fila de requisições
  durante o refresh.
- Autenticação real: login, sessão, renovação, logout, rotas protegidas (por sessão e por
  papel).
- Todas as 22 rotas do mapa de telas ligadas à API real via React Query — nenhum mock
  remanescente.
- Formulários com React Hook Form + Zod, erro junto ao campo.
- Os quatro estados (loading/empty/error/success) em toda tela que carrega dado.
- Paginação, filtros e ordenação ligados aos parâmetros reais de cada endpoint.
- Mapa de `code` → mensagem em português, estendido com os códigos de negócio da Fase 5
  (estoque e inventário).
- Remoção dos quatro pontos de pré-visualização (§18.4).
- Submit desabilitado durante requisição pendente, em toda ação de escrita.
- Gráfico do dashboard com `recharts` (já aprovado), usando só dado real.

### Fora do escopo — explicitamente, e por quê

| Item                                                | Pertence a                            | Por quê                                                                                        |
| --------------------------------------------------- | ------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Testes E2E com Playwright                           | Fase 7                                | `07-testes.md §7.5`: os dois fluxos exigem app real + Postgres, e é onde o roadmap os coloca   |
| Divisão de bundle por rota (`lazy`/`Suspense`)      | Fase 7                                | `14-relatorio-fase-3.md §14.9`: medir o problema antes de existir tela real seria medir errado |
| Aferição formal de contraste AA                     | Fase 7                                | `06-mvp-e-telas.md §6.6`: "verificado na Fase 7"                                               |
| Dark mode                                           | Fase 7                                | `06-mvp-e-telas.md §6.1` ("avaliado na Fase 7")                                                |
| Exportação CSV dos relatórios                       | Pós-MVP                               | `09-roadmap.md`, item 1 do pós-MVP                                                             |
| Recuperação de senha, QR code, multi-depósito, etc. | Pós-MVP                               | `09-roadmap.md`                                                                                |
| Revisão de segurança formal contra o checklist      | Fase 7                                | `09-roadmap.md`, Fase 7                                                                        |
| Qualquer alteração de contrato de API               | fora de qualquer fase sem autorização | Instrução explícita desta rodada                                                               |

Nada do que seria "antecipação de fase" entra no plano abaixo.

## 18.3 Mapa tela → endpoint

Os 53 endpoints reais (extraídos de `backend/test/contract.int-spec.ts`, não da documentação),
agrupados pela tela que os consome.

### Autenticação (4 rotas) — bloco 6A

| Rota                 | Tela / componente                         |
| -------------------- | ----------------------------------------- |
| `POST /auth/login`   | `LoginPage`                               |
| `POST /auth/refresh` | boot do app (`AuthProvider`), fila de 401 |
| `POST /auth/logout`  | menu do usuário (`Header`)                |
| `GET /auth/me`       | boot do app, depois do refresh            |

### Usuários (7 rotas) — bloco 6C (administrativo)

| Rota                           | Tela                             |
| ------------------------------ | -------------------------------- |
| `GET /users`, `GET /users/:id` | `/users` (lista + detalhe/modal) |
| `POST /users`                  | `/users` → formulário de criação |
| `PATCH /users/:id`             | edição                           |
| `PATCH /users/:id/role`        | ação na linha (ADMIN)            |
| `PATCH /users/:id/status`      | ação na linha (ADMIN)            |
| `PATCH /users/me/password`     | `/profile`                       |

### Categorias (5 rotas) — bloco 6B

`GET /categories`, `GET /categories/:id`, `POST`, `PATCH`, `PATCH .../status` → `/categories`
(tabela + modal, conforme o mapa de telas, que não reserva rota própria de criação para
categoria).

### Fornecedores (6 rotas) — bloco 6B

`GET /suppliers`, `GET /suppliers/:id`, `GET /suppliers/:id/products`, `POST`, `PATCH`,
`PATCH .../status` → `/suppliers`, `/suppliers/new`, `/suppliers/:id` (a lista de produtos
vinculados usa `GET /suppliers/:id/products` dentro do detalhe).

### Produtos (6 rotas) — bloco 6B

`GET /products` (com `search`, `categoryId`, `supplierId`, `isActive`, `stockStatus`),
`GET /products/:id`, `GET /products/:id/movements`, `POST`, `PATCH`, `PATCH .../status` →
`/products`, `/products/new`, `/products/:id` (abas dados/histórico), `/products/:id/edit`.

### Movimentações (5 rotas) — bloco 6C

`GET /stock-movements` (filtros `productId`, `type`, `reason`, `userId`, `dateFrom`,
`dateTo`), `GET /stock-movements/:id`, `POST .../in`, `POST .../out`,
`POST .../adjustment` → `/movements` (histórico), `/movements/new` (abas entrada | saída |
ajuste — ajuste só visível para A/M).

### Inventários (7 rotas) — bloco 6C

`GET /inventories`, `GET /inventories/:id`, `POST /inventories`,
`PATCH /inventories/:id/items/:itemId/count`, `POST .../submit`, `POST .../approve`,
`POST .../cancel` → `/inventories`, `/inventories/new`, `/inventories/:id` (contagem,
divergências — incluindo `movedSinceCount` do item, §18.12 item S9 — aprovação e
cancelamento, estes dois só para A/M).

### Dashboard (3 rotas) — bloco 6B

`GET /dashboard/summary`, `GET /dashboard/movements-chart`, `GET /dashboard/recent-movements`
→ `/dashboard` (4 indicadores, gráfico `recharts`, lista de últimas movimentações).

### Relatórios (6 rotas) — bloco 6C

`GET /reports/low-stock`, `/out-of-stock`, `/movements`, `/inventories` (A/M),
`/divergences` (A/M), `/stock-reconciliation` (A) → `/reports` (seletor de relatório +
resultado; os três últimos só aparecem no seletor para quem tem o papel).

### Auditoria (2 rotas) — bloco 6C

`GET /audit` (A), `GET /audit/:entity/:entityId` (A, M) → `/audit`.

### Infraestrutura (2 rotas)

`GET /health`, `GET /health/ready` — não consumidas pela interface de negócio; já usadas
pelo Docker Compose (Fase 2). Nenhuma tela as chama.

**Total: 51 rotas de negócio + 2 de infraestrutura = 53.** Nenhuma rota sem tela, nenhuma
tela sem rota — exceto `/design-system` (vitrine interna, sem endpoint) e `/login` (usa
`/auth/login`).

## 18.4 Arquivos e componentes

### Remover (confirmado linha a linha no código atual)

| Arquivo                               | Ação                                                                                                                                         |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `features/auth/ui-preview-auth.tsx`   | Arquivo inteiro                                                                                                                              |
| `components/layout/PreviewBanner.tsx` | Arquivo inteiro                                                                                                                              |
| `features/auth/pages/LoginPage.tsx`   | Remover o bloco de pré-visualização (import de `useUiPreview`, `Select` de papel, `Separator`, e o JSX associado) — mantém o formulário real |
| `components/layout/Header.tsx`        | Remover a função `PreviewRoleSelect` e sua chamada condicional por `isPreview`                                                               |
| `app/layouts/AppShell.tsx`            | Remover o import e uso de `PreviewBanner`/`isPreview`                                                                                        |
| `app/providers.tsx`                   | Trocar `UiPreviewAuthProvider` pelo `AuthProvider` real                                                                                      |
| `features/auth/auth-context.ts`       | Remover `UiPreviewContext`, `useUiPreview`, `UiPreviewControls`                                                                              |
| `types/auth.ts`                       | Remover o campo `isPreview` de `AuthContextValue`; acrescentar `signIn`                                                                      |

### Criar

```
frontend/src/
├── lib/
│   └── api-client.ts                 # fetch tipado, refresh automático, fila de 401
├── features/auth/
│   ├── auth-provider.tsx             # AuthProvider real (login, logout, boot, refresh)
│   ├── api.ts                        # login, logout, me
│   └── RoleGuard.tsx                 # proteção de rota por papel (UX, não autorização)
├── features/{categories,suppliers,products,movements,inventories,reports,users,audit}/
│   ├── api.ts                        # funções de fetch, tipadas pelos DTOs reais
│   ├── queries.ts                    # hooks de React Query (useXQuery, useXMutation)
│   ├── schemas.ts                    # Zod, para os formulários do módulo
│   ├── types.ts                      # tipos de resposta, espelhando os DTOs do backend
│   ├── components/                   # tabela de colunas, formulário, badges específicos
│   └── pages/                        # uma por rota do mapa de telas
├── features/dashboard/
│   ├── api.ts / queries.ts
│   └── components/MovementsChart.tsx # recharts
└── lib/
    └── decimal.ts (já existe)        # reaproveitado para exibir quantidade sem perder precisão
```

### Alterar

| Arquivo                        | Mudança                                                                                               |
| ------------------------------ | ----------------------------------------------------------------------------------------------------- |
| `router.tsx`                   | Substituir cada `PlaceholderRoute` entregue nesta fase pela página real; `RoleGuard` nas rotas de A/M |
| `lib/error-messages.ts`        | Acrescentar os 15 códigos reais de `error-codes.ts` (item 1 de §18.1)                                 |
| `lib/nav-items.ts`             | Zerar `deliveredInPhase` dos itens entregues (campo já existe para isto)                              |
| `components/layout/Header.tsx` | Menu do usuário chama `signOut` real (que chama `POST /auth/logout`)                                  |
| `.env.example`                 | Nenhuma mudança — `VITE_API_URL` e `VITE_PROXY_TARGET` já cobrem o cliente real                       |

Nenhum componente de `components/shared/` ou `components/ui/` muda de forma: eles já foram
desenhados para dado real (skeleton, empty, error, paginação) desde a Fase 3.

## 18.5 Arquitetura do cliente HTTP e da sessão

### `lib/api-client.ts`

Uma função central, não uma classe: o projeto não tem estado por instância que justifique
objeto.

```ts
async function request<T>(path: string, init?: RequestInit): Promise<T>;
```

- Monta a URL a partir de `VITE_API_URL` (relativa — item 3 de §18.1), nunca concatena
  origem absoluta: isso preserva o proxy do Vite em dev e funciona sem mudança nenhuma
  quando a Fase 8 colocar os dois serviços atrás do mesmo domínio.
- Acrescenta `Authorization: Bearer <access>` quando há access em memória.
- Decimal nunca é convertido: a resposta é repassada como string, igual ao contrato (§5.7).
- Em 401 **que não seja da própria chamada de login/refresh**: dispara o refresh (com
  deduplicação — próxima subseção) e repete a requisição original uma única vez. Uma
  segunda falha depois do refresh é 401 definitivo → desloga.
- Erro de rede (sem resposta) é distinto de 401/403: mensagem "sem conexão", não "sessão
  expirada".
- Lança um erro tipado (`ApiError`) com `code`, `status`, `details` — nunca `message` do
  servidor interpolada como HTML (`08-seguranca.md §8.10`).

### Access token: onde mora

Em uma variável de módulo dentro de `api-client.ts` (não em `useState` de React, não em
contexto): o valor precisa estar disponível para o interceptor de 401 mesmo fora de uma
árvore de componentes (ex.: uma mutação disparada por um efeito). O `AuthProvider` chama
`setAccessToken()`/`clearAccessToken()` exportados deste módulo; os componentes leem o
usuário pelo contexto, nunca o token.

### Renovação concorrente (item 6.6.5 da autorização)

Problema: duas queries em paralelo recebem 401 ao mesmo tempo (access expirou); sem
controle, duas chamadas a `/auth/refresh` disparam, e o ADR-0005 já prevê rotação — a
**segunda** chegaria como reuso de um refresh já rotacionado pela primeira e devolveria
`REFRESH_TOKEN_REUSED`, derrubando a sessão à força.

Solução: uma promessa única em memória (`refreshPromise: Promise<void> | null`). A primeira
chamada que recebe 401 cria a promessa e chama `/auth/refresh`; qualquer chamada
subsequente que receba 401 **enquanto a promessa existir** aguarda a mesma promessa em vez
de disparar outra. Resolvida (ou rejeitada) a promessa, ela é limpa. Isto é a "fila de
requisições durante o refresh" que o roadmap pede, implementada como deduplicação de
promessa, não como fila literal de itens — mais simples e com a mesma garantia.

### Boot da aplicação

1. `AuthProvider` monta com `user = null`, `isLoading = true`.
2. Dispara `POST /auth/refresh` (o cookie, se existir, vai automaticamente).
3. Sucesso → `GET /auth/me` → `user` populado, `isLoading = false`.
4. Falha (sem cookie, ou cookie inválido/expirado) → `user = null`, `isLoading = false` —
   sem toast de erro: não ter sessão ao abrir o app é o caso normal, não uma falha.
5. `ProtectedRoute` (já implementado, inalterado) usa `isLoading`/`isAuthenticated` exatamente
   como já faz hoje contra a pré-visualização.

### Logout

`POST /auth/logout` (idempotente, 204 mesmo sem cookie — já implementado assim no
backend) → limpa o access em memória → `user = null` → redireciona para `/login`. Chamado
mesmo se a requisição falhar (rede fora do ar): a sessão LOCAL sempre encerra; o cookie no
servidor fica para expirar pelo TTL se a chamada não chegou.

### RBAC na interface

Dois níveis, nenhum dos dois é autorização real:

1. **Sidebar** (`nav-items.ts`, já implementado): item não aparece para quem não tem o
   papel.
2. **`RoleGuard`** (novo): envolve a rota na árvore do `router.tsx`. Quem navega direto para
   uma URL de papel que não tem (ex.: OPERATOR em `/audit`) vê uma tela "Você não tem
   permissão para acessar esta página", não um 403 cru nem um redirecionamento silencioso
   para o dashboard — a pessoa precisa entender por que a página não abriu.

Os dois existem **só para não mostrar um botão que o backend vai recusar**. A verificação
real é a resposta 403 da API, tratada no cliente HTTP e exibida pelo mapa de mensagens.

## 18.6 Tratamento de 401/403 e mapa de erros

| Situação                                                                      | Tratamento                                                                                   |
| ----------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| 401 em qualquer chamada de negócio, access ainda não expirado comprovadamente | Tenta refresh (com deduplicação) e repete a chamada original uma vez                         |
| 401 depois do refresh (ou refresh falhou)                                     | Desloga, redireciona para `/login`, guarda a rota de origem (o `ProtectedRoute` já faz isso) |
| 403 (`FORBIDDEN_ROLE`, `FORBIDDEN`)                                           | Toast com a mensagem do código; a tela de origem **não** tenta de novo automaticamente       |
| `REFRESH_TOKEN_REUSED`                                                        | Trata como 401 definitivo — a cadeia já foi revogada no servidor, não há o que renovar       |
| Erro de rede (sem resposta HTTP)                                              | Mensagem "sem conexão", botão "tentar novamente" (reaproveitando `ErrorState`), sem deslogar |

`lib/error-messages.ts` ganha os 15 códigos reais; os específicos de negócio
(`INSUFFICIENT_STOCK`, `PRODUCT_INACTIVE`, `INVALID_TYPE_REASON`, `INVENTORY_NOT_OPEN`,
`INVENTORY_ALREADY_APPROVED`, `INVENTORY_INVALID_STATE`, `PRODUCT_IN_OPEN_INVENTORY`,
`SKU_ALREADY_EXISTS`, `CATEGORY_HAS_PRODUCTS`, `EMAIL_ALREADY_EXISTS`) recebem tratamento
**na tela que os provoca**, com o `details` do erro (ex.: `available`/`requested` de
`INSUFFICIENT_STOCK`), como o próprio arquivo já declara ser a intenção.

## 18.7 CORS, cookies e CSRF — análise detalhada (atualizada após revisão)

A revisão pediu explicitamente para não tratar `Path=/api/v1/auth` como suficiente por si
só. Esta seção substitui a tabela anterior por uma análise camada a camada: o que cada
mecanismo de fato protege, o que ele **não** protege, e onde a lacuna residual fica.

### 18.7.1 O que CORS protege, e o que não protege

**Confusão comum, afastada de propósito:** CORS não é uma defesa contra CSRF. CORS é
imposto pelo **navegador do lado da leitura da resposta** — ele decide se o JavaScript que
fez a chamada pode LER o resultado, não se o servidor deve ACEITAR a requisição. Um
formulário HTML simples (`<form method="POST">`), ou uma tag `<img>`/`<script>` apontando
para uma URL, nunca passa pelo CORS: o navegador envia a requisição (com cookie, se
`SameSite` permitir) e o servidor a processa normalmente — o atacante só não consegue ler a
resposta, o que não importa para um ataque de CSRF cujo objetivo é o **efeito colateral da
escrita**, não a leitura do corpo.

Por isso `CORS_ORIGINS` + `credentials: true` (já implementado) protegem **a leitura por
JavaScript de outra origem**, relevante para roubo de dado via XHR/fetch cross-site, mas
**não são a proteção contra CSRF**. Essa proteção vem inteiramente de `SameSite`, abaixo.

### 18.7.2 O que `SameSite=Strict` + `Path` realmente garantem

| Atributo            | Garantia                                                                                                                                                                                                                                                                                      | Residual                                                                                                                                                    |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SameSite=Strict`   | O navegador **não envia o cookie** em nenhuma requisição originada de um site diferente — nem em navegação de topo (clique em link), nem em formulário, nem em `fetch`/XHR, nem em `<img>`/`<script>`. Isto é a defesa primária e, por si só, já neutraliza CSRF clássico                     | Só protege o que o NAVEGADOR do usuário trata corretamente; não protege contra um navegador ou extensão comprometidos (fora do modelo de ameaça de uma SPA) |
| `Path=/api/v1/auth` | Mesmo em um cenário hipotético onde `SameSite` falhasse ou fosse contornado (ex.: um subdomínio do próprio site, fora do escopo deste projeto de origem única), o cookie **só acompanha requisições para este path** — nunca para uma rota de negócio (`/products`, `/stock-movements`, etc.) | Não reduz o risco sobre os DOIS endpoints que o usam (`/auth/refresh`, `/auth/logout`) — é escopo, não eliminação                                           |
| `HttpOnly`          | Protege contra leitura do cookie por XSS — não é uma proteção de CSRF, é a proteção de ADR-0005 contra roubo de token                                                                                                                                                                         | N/A para CSRF                                                                                                                                               |
| `Secure`            | Impede o cookie de viajar em texto claro (sem TLS) — proteção de transporte, não de CSRF                                                                                                                                                                                                      | Condicionado a produção, correto                                                                                                                            |

**Conclusão honesta:** `Path` reduz a SUPERFÍCIE (só 2 endpoints em risco, não toda a API),
mas quem de fato elimina o CSRF nesses 2 endpoints é o `SameSite=Strict`. Os dois atributos
têm papéis diferentes e nenhum substitui o outro.

### 18.7.3 O pior caso, se `SameSite=Strict` falhar (navegador antigo, bug, etc.)

Mesmo nesse cenário degradado, o dano está limitado por desenho (já registrado no
ADR-0005, reafirmado aqui com mais detalhe):

- **`POST /auth/refresh` forjado:** o atacante só consegue fazer o navegador da vítima
  rotacionar a PRÓPRIA sessão da vítima. Não há leitura de dado (CORS bloqueia a leitura da
  resposta) nem escrita de negócio. O efeito observável seria, no limite, deslogar a vítima
  mais vezes que o normal — um incômodo, não uma violação de confidencialidade ou
  integridade de dado.
- **`POST /auth/logout` forjado:** desloga a vítima. Mesmo perfil de dano: disponibilidade
  (DoS de sessão), não confidencialidade.
- Nenhum dos dois pode ser usado para fazer a vítima executar uma operação de **negócio**
  (criar movimento, aprovar inventário): essas rotas exigem o access token no header
  `Authorization`, que um `<form>` ou `<img>` forjado não tem como definir — isso é
  CSRF-imune por construção, independente de `SameSite`.

### 18.7.4 Validação de origem — avaliada, não implementada nesta fase

Camada de defesa em profundidade adicional, comum em guias OWASP: verificar o cabeçalho
`Origin` (ou `Referer`, como alternativa) no servidor, nos dois endpoints que usam cookie,
recusando um valor que não esteja na mesma allowlist do CORS.

**Verificado no código atual: não existe.** Nenhum guard ou middleware lê `Origin`/`Referer`
em `auth.controller.ts` ou em `bootstrap.ts` além do que o CORS já inspeciona para decidir
os cabeçalhos de resposta (o que, como a §18.7.1 explica, não impede a requisição de
chegar).

**Isto seria uma mudança no backend de autenticação.** Por instrução explícita desta
revisão, não implemento sem justificar e pedir aprovação — então aqui está a avaliação, sem
a implementação:

| Aspecto                | Avaliação                                                                                                                                                                                                                                           |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Ganho real             | Pequeno, dado que `SameSite=Strict` já neutraliza o cenário principal (§18.7.2) e o pior caso residual já é de baixo impacto (§18.7.3)                                                                                                              |
| Custo de implementação | Baixo: um guard que compara `request.headers.origin` contra `CORS_ORIGINS` nos dois endpoints, ou globalmente                                                                                                                                       |
| Risco de regressão     | Precisa tratar corretamente requisições sem `Origin` (alguns clientes legítimos, como chamadas de servidor a servidor, não enviam) — superfície pequena, mas é mudança em caminho de autenticação                                                   |
| Recomendação           | **Defesa em profundidade legítima, mas não necessária para o 6A funcionar com segurança equivalente ao que o ADR-0005 já garante.** Registro a recomendação; **pergunto explicitamente** se deseja autorizá-la como item avulso (não bloqueia o 6A) |

### 18.7.5 Resumo do que já existe, sem mudança proposta

| Item                                        | Estado real, verificado no código                                                                                                                                |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CORS em desenvolvimento                     | Não há, de fato: `vite.config.ts` faz proxy de `/api`, então o navegador fala só com a origem do Vite (item 3, §18.1)                                            |
| CORS em produção (fora do proxy)            | `CORS_ORIGINS` allowlist + `credentials: true`, já configurado (`bootstrap.ts`); `*` é recusado na validação de ambiente                                         |
| Cookie `path`                               | `/api/v1/auth` — escopo reduzido (§18.7.2), não é a eliminação do CSRF                                                                                           |
| `SameSite`                                  | `Strict` — a defesa primária real contra CSRF (§18.7.2); porta diferente no mesmo `localhost` ainda é mesmo "site" (eTLD+1 ignora porta), funciona em dev também |
| `Secure`                                    | Condicionado a `NODE_ENV=production` (correto: não há TLS em dev)                                                                                                |
| Validação de `Origin`/`Referer` no servidor | **Não existe hoje** (§18.7.4) — avaliada, recomendação registrada, aguardando sua decisão                                                                        |
| Renovação concorrente                       | Resolvida no cliente por deduplicação de promessa (§18.5) — sem isso, dois refresh simultâneos acionariam `REFRESH_TOKEN_REUSED`                                 |
| Sessão revogada (rebaixamento, inativação)  | Já documentado como risco aceito no ADR-0005 (janela de até 15 min); a interface não tem como mitigar além do que já existe                                      |
| Token em log ou armazenamento persistente   | Access só em variável de módulo (nunca `localStorage`); nenhum `console.log` de token é proposto em nenhum arquivo deste plano                                   |

**Nenhum mecanismo de autenticação existente é alterado pelo Marco 6A.** O plano consome o
que já está construído; a única lacuna identificada (validação de `Origin`) fica registrada
como recomendação avulsa, não como bloqueio.

### 18.7.6 Topologia de deploy prevista e o que ela muda na avaliação de `Origin`/`Referer`

A imagem de produção multi-stage é explicitamente assunto da Fase 8 (comentário no topo de
`docker-compose.yml`) — hoje não existe uma topologia de produção construída, só a de
desenvolvimento (proxy do Vite, §18.7.5). Isto importa para a avaliação de §18.7.4 porque o
ganho de validar `Origin`/`Referer` no servidor depende de QUEM serve o frontend em relação
à API:

- **Se a Fase 8 servir o frontend e a API sob a MESMA origem** (um reverse proxy único na
  frente dos dois, como o próprio proxy do Vite já simula em dev) — cenário mais provável,
  dado que é o que já torna `VITE_API_URL=/api/v1` relativo correto tanto em dev quanto em
  produção (§18.19) — o navegador nunca trata a chamada como cross-site em primeiro lugar, e
  `SameSite=Strict` já cobre o caso que importa. Validar `Origin` no servidor neste cenário é
  defesa em profundidade pura: reduz ainda mais a superfície do pior caso de §18.7.3, mas não
  fecha uma lacuna que hoje está aberta.
- **Se a Fase 8 servir o frontend de uma origem DIFERENTE da API** (ex.: um CDN para os
  estáticos e a API em outro host/porta) — cenário que exigiria trocar `VITE_API_URL` para
  uma URL absoluta, mudança que este plano explicitamente não autoriza fazer sem decisão
  própria — o `CORS_ORIGINS` já precisaria ganhar a origem real de produção de qualquer
  forma, e aí validar `Origin`/`Referer` no servidor passa a ter um ganho mais concreto: é a
  mesma allowlist que o CORS já mantém, aplicada numa camada que um `<form>`/`<img>` forjado
  não consegue contornar (ao contrário da leitura de resposta, que o CORS já cobre).

**Conclusão para o registro de pendência:** a decisão de implementar a validação de
`Origin`/`Referer` deveria esperar a Fase 8 definir qual das duas topologias será usada — o
ganho muda de "defesa em profundidade" para "camada com efeito prático mensurável" dependendo
dessa escolha, que ainda não foi tomada. Até lá, o risco residual continua o mesmo descrito em
§18.7.3 (baixo impacto, sem violação de confidencialidade ou integridade de dado de negócio).

## 18.8 Cache e invalidação (React Query)

- `QueryClient` já configurado (`app/providers.tsx`, Fase 3): `staleTime` 5 min,
  `refetchOnWindowFocus: false`, `retry: 1` em query e `0` em mutação — **mantido sem
  alteração**, as justificativas já registradas continuam válidas.
- Chave de query por módulo: `['products', { page, filters }]`, `['product', id]`,
  `['product', id, 'movements', { page }]` etc. — convenção única, para que invalidar por
  prefixo (`['products']`) alcance lista e detalhe.
- **Depois de toda mutação de escrita, invalidação explícita** (nunca atualização
  otimista): criar/editar produto invalida `['products']` e, se houver detalhe aberto,
  `['product', id]`; uma movimentação invalida `['product', id]`, `['product', id,
'movements']`, `['stock-movements']` e `['dashboard']`; aprovar inventário invalida
  `['inventories']`, `['inventory', id]` e todos os `['product', ...]` dos itens ajustados.
- **Por que nunca atualização otimista aqui:** o próprio núcleo da Fase 5 é que o saldo
  decidido no servidor pode diferir do que a tela "acha" que vai acontecer (saldo
  insuficiente, produto inativado entre a leitura e o clique, aprovação concorrente). Uma
  atualização otimista mostraria um número que o servidor pode recusar um instante depois.
  Invalidar e buscar de novo é mais lento em alguns milissegundos e certo sempre.

## 18.9 Fluxos de UX para operações críticas

| Operação                   | Fluxo                                                                                                                                                                                                                                                                                                                                                                |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Entrada / saída de estoque | Formulário com produto (busca), quantidade (decimal, validada por Zod no mesmo padrão do backend), motivo (enum filtrado por tipo). Submit desabilitado durante a requisição. 409 `INSUFFICIENT_STOCK` mostra o `available`/`requested` reais junto ao campo de quantidade, não só em toast                                                                          |
| Ajuste manual              | Só visível para A/M (`RoleGuard` + ausência na UI para OPERATOR); exige nota (campo obrigatório, como o DTO já exige)                                                                                                                                                                                                                                                |
| Abrir inventário           | Seleção de produtos (até 200, com contador visível); `PRODUCT_IN_OPEN_INVENTORY` lista, por produto, qual inventário já o retém                                                                                                                                                                                                                                      |
| Contar item                | Campo de quantidade por item; exibe `expectedQty` (ou "ainda não contado"); recontagem permitida enquanto `OPEN`/`COUNTING`, com aviso de que o valor anterior será substituído                                                                                                                                                                                      |
| Enviar para aprovação      | `ConfirmDialog` nomeando o efeito ("Encerra a contagem; não será possível registrar novas contagens"); 422 sem nenhum item contado é mensagem, não erro genérico                                                                                                                                                                                                     |
| Aprovar inventário         | Mostra a lista de divergências e, por item, `movedSinceCount` quando diferente de zero, **antes** do clique (§18.12, risco S9); `ConfirmDialog`; 409 de saldo insuficiente lista todos os itens problemáticos de uma vez (o backend já devolve assim)                                                                                                                |
| Cancelar inventário        | `ConfirmDialog` ("O histórico de contagem é preservado, mas a contagem não pode ser retomada")                                                                                                                                                                                                                                                                       |
| Qualquer ação de escrita   | Botão de submit em estado `pending`, desabilitado, com rótulo que indica progresso ("Salvando…"). **Isto reduz o duplo clique acidental do mesmo usuário; não é chave de idempotência e não impede duas requisições de fontes diferentes (duas abas, um reenvio de rede) — risco aceito e documentado em D14/RA-1 (§17.7.5 da Fase 5), que a interface não resolve** |

## 18.10 Arquitetura frontend (resumo das decisões, todas já aprovadas em `03-stack.md`/`02-arquitetura.md`)

- Cliente HTTP: `fetch` nativo envolvido em `api-client.ts` — nenhuma biblioteca nova (nem
  axios, nem ky): não está na stack aprovada e `fetch` cobre o que o projeto precisa.
- TanStack Query para todo estado de servidor; nenhum estado de servidor duplicado em
  `useState`/contexto.
- React Hook Form + Zod em todo formulário; os mesmos limites de validação do DTO do
  backend (ex.: `minLength`, `maxLength`, o padrão decimal de 3 casas) replicados no schema
  Zod, para erro imediato sem round-trip — mas a validação do backend continua sendo a que
  de fato decide, nunca confiar só no client-side.
- React Router, rotas já existentes reaproveitadas; `RoleGuard` é a única peça nova de
  roteamento.
- `recharts` 3.10.1 (já aprovado) para o gráfico do dashboard — única dependência nova desta
  fase, e só para o que já estava planejado.
- Decimal: `lib/decimal.ts` (já existe, da Fase 3) formata e compara sem passar por
  `number` — reaproveitado em toda exibição de quantidade e custo, nunca reescrito.

## 18.11 Matriz de testes e critérios de aceite

### Testes (frontend)

| Tipo                                  | Cobertura                                                                                                                                                                                                                                                                    |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unitário / utilitário                 | `api-client` (montagem de header, deduplicação de refresh, tratamento de 401/403/rede), mapa de erros                                                                                                                                                                        |
| Componente                            | Formulários (erro do Zod junto ao campo), `RoleGuard` (redireciona/mostra mensagem conforme o papel), submit desabilitado durante pending                                                                                                                                    |
| Integração de frontend (API simulada) | Fluxos de tela com `fetch` interceptado de forma controlada (ex.: `msw` **se** for aprovado — ver decisão pendente em §18.13; do contrário, mock manual de `fetch`) — **isto não é teste de integração de backend**, é a interação componente↔cliente HTTP↔resposta simulada |
| Autenticação                          | Boot com e sem cookie válido; refresh automático em 401; fila/deduplicação sob duas falhas simultâneas; logout limpa estado                                                                                                                                                  |
| RBAC na interface                     | Item de sidebar ausente por papel (já testado, `SidebarNav.test.tsx`); `RoleGuard` bloqueando navegação direta                                                                                                                                                               |
| Cache                                 | Mutação de produto invalida a lista; mutação de movimentação invalida produto e dashboard                                                                                                                                                                                    |
| Concorrência / 409                    | Simulação de `INSUFFICIENT_STOCK` e `INVENTORY_ALREADY_APPROVED` exibindo a mensagem certa, sem crash                                                                                                                                                                        |
| Preservação                           | Toda a suíte atual do frontend (105 testes, Fase 3) e do backend (199 unitários + 461 de integração, Fase 5) continua verde, sem desativar nenhum caso                                                                                                                       |

### E2E, lint, typecheck, build, Prettier, segurança, CI

- E2E: **não entra nesta fase** (§18.2). A estrutura de providers e rotas fica pronta para
  os dois fluxos do `07-testes.md §7.5` quando a Fase 7 os escrever.
- `lint`/`typecheck`/`build`/`prettier --check` nos dois lados, `npm audit` nas três árvores
  (raiz, backend, frontend), verificação de segredos — a mesma bateria das Fases 2 a 5,
  sem exceção nova.
- GitHub Actions: nenhuma mudança de workflow proposta; o CI já roda os dois lados.

### Critério de aceite (do roadmap, literal)

> Nenhum dado mockado no código; todo estado de tela verificado manualmente, inclusive erro
> de rede e 403; criar produto → entrada → saída → histórico funcionando na UI.

Adicionado por este plano, como critério objetivo e verificável por marco (§18.14):

- `grep` por `UiPreview`, `isPreview`, `PreviewBanner`, `PreviewRoleSelect` no código do
  frontend devolve zero ocorrências ao final do bloco 6A.
- As 51 rotas de negócio de §18.3 têm pelo menos um teste de integração de frontend (API
  simulada) exercitando sucesso e pelo menos um erro relevante.
- Nenhum `localStorage.setItem`/`sessionStorage.setItem` com token em todo o código do
  frontend (verificável por `grep`).

## 18.12 Impacto das pendências técnicas conhecidas na interface

| Pendência (Fase 5)                                                                                  | Impacto na UI e na mensagem ao usuário                                                                                                                                                                                                                                                                                          |
| --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Instabilidade do Node 24 no Windows (não resolvida)                                                 | Não afeta a interface em produção — é um defeito do **runner de teste** local, não do servidor. Nenhuma mensagem ao usuário é necessária; registrado aqui só porque a instrução pediu explicitamente que não fosse omitido                                                                                                      |
| Teto de 25 tentativas na geração de código de inventário (pode se esgotar sob concorrência extrema) | Sob esgotamento, a API devolve 500 genérico. A tela de abertura de inventário trata 500 como "erro inesperado, tente novamente" (padrão já definido em `06-mvp-e-telas.md §6.3`) — **não** uma mensagem dizendo "muitas pessoas abrindo inventário ao mesmo tempo", porque isso vazaria detalhe de implementação que pode mudar |
| Ausência de chave de idempotência (D14/RA-1)                                                        | O botão desabilitado durante pending (§18.9) reduz o acidente do mesmo clique duplo, mas **a interface nunca afirma, em texto nenhum, que a operação é garantidamente única** — duas abas ou um reenvio de rede ainda duplicam, e isso é um risco aceito do backend, não algo que a Fase 6 resolve                              |
| Risco S9 (movimentação física registrada depois da contagem)                                        | A tela de aprovação de inventário **precisa** exibir `movedSinceCount` por item, destacado quando diferente de zero, com um texto curto explicando que o saldo já se moveu desde a contagem — é o único canal que o sistema tem para alguém revisar antes de aprovar (D18/RA-2, §17.6.7 do plano da Fase 5)                     |
| Testes de concorrência não implementados individualmente (EX-1 a EX-8, D9-1 a D9-4, CC-4)           | Nenhum impacto direto na UI: são lacunas de teste do backend, não de comportamento. Mencionado para registro, não para ação nesta fase                                                                                                                                                                                          |

Nenhuma destas pendências é tratada como "corrigida" por este plano — cada uma continua
exatamente como está documentada na Fase 5.

## 18.13 Decisões — aprovadas, com condições

Todas as cinco foram revisadas e aprovadas, com condição em duas delas. Registradas como
decididas; a implementação do 6A segue estas regras.

| #   | Decisão                      | Resolução                                                                                                                                                                                                                                                                                                                                     |
| --- | ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Simulação de rede para teste | **Aprovada a opção B, com condição:** mock manual de `globalThis.fetch`, sem dependência nova. Os mocks precisam, adicionalmente, simular requisições concorrentes, respostas fora de ordem (a segunda chamada resolve antes da primeira) e falha de rede — não só o caminho feliz. Detalhado em §18.16                                       |
| 2   | Ordem 6A → 6B → 6C           | **Aprovada**, com a exigência de que cada marco tenha validação e aprovação independentes antes do próximo começar — já era o protocolo das Fases 4 e 5, mantido aqui                                                                                                                                                                         |
| 3   | `RoleGuard`                  | **Aprovada a opção de página dedicada.** Nenhum redirecionamento silencioso para `/dashboard`; uma página de acesso negado (403) nomeada, consistente com `EmptyState`/`ErrorState`. A autorização efetiva permanece no backend — a página é só a reação da interface a um papel que ela já sabe (pela sessão) que não serve para aquela rota |
| 4   | `docs/05-api.md`             | **Aprovada.** Corrigida nesta revisão (§18.1, achado 1) — a lista de códigos agora tem os 15 reais, conferidos direto em `error-codes.ts`                                                                                                                                                                                                     |
| 5   | `recharts`                   | **Aprovada.** Instalação só no Marco 6B, junto do commit que escreve a tela do gráfico — não no 6A                                                                                                                                                                                                                                            |

Nenhuma outra decisão de arquitetura fica pendente para o início do 6A. A validação de
`Origin` (§18.7.4) continua como recomendação avulsa, não decidida ainda — não bloqueia o
6A, que não depende dela.

## 18.14 Ordem incremental de implementação

A divisão sugerida na autorização (6A/6B/6C) bate com a dependência real entre módulos;
mantida, com os blocos detalhados.

### 6A — Fundação da integração

Cliente HTTP (`api-client.ts`), `AuthProvider` real, boot com refresh, logout, `RoleGuard`,
substituição das 8 alterações/remoções de §18.4 ligadas à pré-visualização, mapa de erros
estendido (15 códigos). **Nenhuma tela de negócio ainda** — só o alicerce.

**Critério de aceite do 6A:** login real funciona contra a API; recarregar a página
restaura a sessão (ou não, honestamente, se não houver cookie); logout revoga a sessão no
servidor; zero referência a `UiPreview`/`isPreview`/`PreviewBanner`/`PreviewRoleSelect` no
código; suíte de teste do 6A verde.

### 6B — Cadastros e dashboard

Categorias, fornecedores, produtos (nesta ordem, pela dependência de referência), depois
dashboard (que lê produtos e movimentações, ainda que a tela de movimentações em si seja
do bloco 6C — o dashboard só _lê_, não depende da tela existir).

**Critério de aceite do 6B:** CRUD completo de categoria, fornecedor e produto pela
interface, com os quatro estados em cada tela; dashboard com os 4 indicadores, gráfico de
30 dias e últimas movimentações, todos com dado real (ou estado vazio real, nunca número
inventado).

### 6C — Operações, inventários, relatórios e administrativo

Movimentações (entrada/saída/ajuste/histórico), inventários (ciclo completo), relatórios,
usuários e auditoria — nesta ordem, porque movimentações e inventários são o núcleo de
negócio que o roadmap prioriza, e relatórios/auditoria são leitura sobre o que as fases
anteriores já expõem.

**Critério de aceite do 6C (= critério de aceite da Fase 6 inteira, do roadmap):** criar
produto → entrada → saída → histórico funcionando na UI; abrir inventário → contar →
enviar → aprovar funcionando na UI; nenhum dado mockado; todo estado de tela verificado
manualmente, inclusive erro de rede e 403.

Cada bloco termina com: testes, verificação manual dos quatro estados, revisão do diff, e
**autorização explícita antes do commit** — o mesmo protocolo das Fases 4 e 5.

## 18.16 Estratégia de mock manual de `fetch` (detalhe da decisão 1 de §18.13)

Sem `msw` nem qualquer outra dependência. Um helper de teste substitui
`globalThis.fetch` por uma implementação controlada por caso, capaz de:

- **Responder por sequência de chamada**, não só por URL — necessário para simular duas
  chamadas concorrentes ao mesmo endpoint com respostas diferentes.
- **Resolver fora de ordem**: a implementação aceita uma lista de promessas controladas
  (`resolve`/`reject` expostos ao teste) para que o teste decida explicitamente qual
  requisição "volta" primeiro — é o que prova que a deduplicação de refresh (§18.5) não
  depende da ordem de chegada das respostas.
- **Simular falha de rede** (`fetch` rejeitando, não resolvendo com status de erro) — caso
  distinto de um 401/403, que é uma resposta HTTP válida.
- **Nunca mascarar um caso que falha**: o helper não tem um modo "aceita qualquer coisa";
  uma chamada não esperada pelo teste falha o teste com uma mensagem nomeando a URL não
  prevista, em vez de devolver uma resposta genérica de sucesso.

## 18.17 Correção aplicada: `docs/05-api.md`

Decisão 4 de §18.13 executada nesta revisão: `docs/05-api.md §5.1` atualizada com os 15
códigos de erro reais de `backend/src/common/errors/error-codes.ts`, incluindo
`INVENTORY_INVALID_STATE` e `PRODUCT_IN_OPEN_INVENTORY` (achado 1, §18.1), que a versão
anterior não tinha. Mudança de documentação apenas — nenhuma alteração de contrato.

## 18.18 Resumo para decisão

- **Escopo:** 51 rotas de negócio + a fundação de autenticação, em 3 blocos incrementais.
- **Nenhuma mudança de contrato de API, de mecanismo de autenticação ou de arquitetura
  aprovada.**
- **Uma dependência nova:** `recharts` 3.10.1, já pré-aprovada em `03-stack.md`, instalada
  só no 6B (§18.13, decisão 5).
- **As cinco decisões de §18.13 estão aprovadas**, com as condições registradas ali: mock
  manual de `fetch` cobrindo concorrência/fora-de-ordem/falha de rede (§18.16); validação
  independente por marco; `RoleGuard` com página dedicada de acesso negado; `05-api.md`
  corrigida (§18.17); `recharts` só no 6B.
- **CSRF, revisado em profundidade (§18.7):** `SameSite=Strict` é a defesa real; `Path`
  reduz escopo, não substitui `SameSite`; CORS não é defesa de CSRF (comum confundir os
  dois). Validação de `Origin` no servidor é avaliada como recomendação avulsa, não
  decidida, e não bloqueia o 6A.
- **Maior risco do plano:** a renovação concorrente de token (§18.5) — se a deduplicação de
  promessa não for bem implementada, duas chamadas simultâneas podem acionar
  `REFRESH_TOKEN_REUSED` e derrubar sessões à força. Mitigação: teste dedicado no 6A antes
  de qualquer tela de negócio depender do cliente HTTP.
- **Pendências técnicas da Fase 5 permanecem exatamente como estão** — nenhuma é
  "resolvida" por este plano; o impacto de cada uma na interface está em §18.12.
- **Autorizado para implementação: exclusivamente o Marco 6A.** 6B e 6C aguardam a
  validação e a autorização independentes de cada marco anterior.

Aguardo sua autorização explícita, e as respostas de §18.13, antes de iniciar a
implementação do bloco 6A.

## 18.19 Marco 6A — resultados reais (implementado, validado, aguardando aprovação para versionar)

Autorização de implementação recebida e executada **exclusivamente** para o Marco 6A, nos
termos de §18.13/§18.18. Nenhum código de negócio do backend foi alterado; nenhuma
dependência nova foi instalada. Nada foi commitado — a árvore de trabalho continua aberta
para revisão.

### Arquivos alterados

Novos: `frontend/src/lib/api-client.ts` (+ `.test.ts`), `frontend/src/lib/error-messages.ts`
(expandido) `+ .test.ts`, `frontend/src/features/auth/api.ts`, `auth-provider.tsx`
`+ .test.tsx`, `RoleGuard.tsx` `+ .test.tsx`, `frontend/src/pages/ForbiddenPage.tsx`.
Modificados: `router.tsx` (RoleGuard nas rotas administrativas), `auth-context.ts`,
`types/auth.ts`, `app/providers.tsx`, `app/layouts/AppShell.tsx`, `components/layout/Header.tsx`,
`features/auth/pages/LoginPage.tsx` `+ .test.tsx`, `features/auth/ProtectedRoute.test.tsx`,
`docs/05-api.md` (decisão 4 de §18.13). Removidos: `ui-preview-auth.tsx`, `PreviewBanner.tsx` —
nenhum resquício (import, componente ou referência) da pré-visualização da Fase 3 permanece no
código de produção; duas menções remanescentes são comentários de documentação explicando a
substituição.

### Testes executados

148 testes de frontend, todos passando (`npx vitest run`), incluindo a suíte nova deste marco
(58 testes em `api-client.test.ts`, `auth-provider.test.tsx`, `RoleGuard.test.tsx`,
`error-messages.test.ts`, mais a reescrita de `LoginPage.test.tsx`/`ProtectedRoute.test.tsx`).
Cobertos, com mock manual de `fetch` no limite de rede (nunca mockando os módulos internos —
§18.16): login válido/inválido; token em memória (nunca em `localStorage`/`sessionStorage`,
inclusive com valores "plantados" nesses storages para provar que o cliente nunca os lê);
renovação automática após 401 com uma única retentativa; proteção contra loop (um segundo 401
pós-retentativa não aciona novo refresh); **renovação concorrente** — três requisições
simultâneas com 401 compartilham exatamente um `/auth/refresh`; refresh que falha encerra a
sessão e aciona o handler de sessão expirada; **403 nunca aciona refresh** (é autorização, não
token expirado); rotas `/auth/*` nunca dispara o próprio interceptor; falha de rede distinta de
erro de API; resposta 204 sem tentativa de parse; **geração de token** — uma resposta de
refresh que chega depois de um `clearAccessToken()` (logout) não revive o token; boot com e sem
cookie válido; **logout durante boot em andamento** — a resposta tardia do boot não restaura a
sessão; RoleGuard deixando passar o papel certo, bloqueando com página nomeada de acesso
negado, e oferecendo caminho de volta.

Backend não foi alterado nesta revisão; não foi re-executada a suíte de 199 testes
unitários + 461 de integração porque nenhum arquivo do backend mudou — não há o que
revalidar ali além do comportamento observável pela API, que foi exercitado diretamente
(próxima seção).

### Evidência de autenticação real (backend + PostgreSQL via Docker, sem expor segredos)

Subida a stack real (`docker compose up -d db`, schema já migrado, contas de desenvolvimento
já semeadas) e o backend NestJS. Validado via HTTP direto e via navegador:

- **Login real**: `POST /auth/login` com a conta `admin@stockflow.local` → `200`, corpo com
  `accessToken` (JWT, confirmado por tamanho, nunca impresso), `expiresIn: 900` e `user`.
- **Cookie de refresh**: `Set-Cookie` inspecionado nos headers brutos —
  `HttpOnly; SameSite=Strict; Path=/api/v1/auth; Max-Age=604800`, `Secure` ausente apenas
  porque o dev roda em HTTP sem TLS (`secure: isProduction` em `refresh-cookie.ts`, não é
  falha — é o comportamento correto fora de produção).
- **`GET /auth/me`** com o access token → `200`, devolve o usuário autenticado.
- **`POST /auth/refresh`** usando só o cookie (sem access token) → `200`, novo `accessToken`
  **rotacionado** (diferente do anterior) e o mesmo usuário.
- **Logout e revogação**: `POST /auth/logout` → `204`; tentativa de refresh **depois** do
  logout → `401 UNAUTHORIZED`, confirmando que o token foi revogado no servidor, não só
  esquecido no cliente.
- **CORS/CSRF na configuração real**: requisição com `Origin` não autorizada processa no
  servidor (CORS não impede o processamento — só a leitura da resposta por JavaScript de
  outra origem, §18.7.1) e não recebe `Access-Control-Allow-Origin`; requisição com a origem
  de desenvolvimento autorizada (`CORS_ORIGINS` do `.env`) recebe
  `Access-Control-Allow-Origin` + `Access-Control-Allow-Credentials: true`. Confirma a análise
  de §18.7: a defesa real contra CSRF é o `SameSite=Strict` do cookie, não o CORS.
- **Navegação protegida no navegador**: login real com a conta `gerente@stockflow.local`
  (MANAGER) → dashboard renderizado com o nome real do usuário; sidebar mostra "Usuários" mas
  oculta "Auditoria" (matriz de `nav-items.ts`); navegação direta para `/audit` como MANAGER
  → página dedicada "Acesso não permitido" (não redirecionamento silencioso); recarregamento
  completo da página em `/dashboard` restaura a sessão só pelo cookie, com
  `localStorage`/`sessionStorage` vazios o tempo todo (confirmado via
  `Object.keys(localStorage)`/`Object.keys(sessionStorage)`); logout pelo menu → volta para
  `/login`; tentativa de voltar a `/dashboard` depois → redirecionado para `/login` (sessão
  de fato encerrada, não só escondida na UI).

Nenhuma credencial, token ou valor de cookie foi exposto nesta documentação ou em qualquer
saída de terminal — apenas presença/ausência, tamanho e atributos foram registrados.

### Qualidade

`eslint .` sem erros; `tsc -b --noEmit` sem erros; `vite build` concluído (714 kB no bundle
principal — aviso de tamanho de chunk pré-existente, não introduzido por este marco);
`prettier --check` limpo nos arquivos deste marco (os 18 arquivos com aviso restantes são
`components/ui/*` gerados pelo shadcn/ui e `dist/*`, pré-existentes, fora do escopo); `npm
audit` → 0 vulnerabilidades; varredura de segredos no diff → nenhum valor sensível, apenas o
parâmetro `password: string` de uma assinatura de tipo. Nenhum aborto do Node 24/Windows
ocorreu nesta rodada de testes.

### Problema encontrado e corrigido durante a validação

`frontend/.env` não existia — `VITE_API_URL` ficava `undefined` no navegador, gerando
`POST http://localhost:5173/undefined/auth/login` (404). Não é uma regressão do Marco 6A: o
arquivo nunca existiu neste checkout (está no `.gitignore`, como esperado para configuração
local). Criado com `VITE_API_URL=/api/v1` — o valor relativo exigido pelo proxy do Vite
(§18.5, nunca uma URL absoluta). Após a correção, login, refresh, `/auth/me`, logout e RBAC
funcionaram de ponta a ponta no navegador real.

Dois bugs encontrados e corrigidos nos próprios testes (não no código de produção) durante
esta revisão: (1) o mock de `fetch` do teste de deduplicação concorrente lia os headers do
objeto errado (`input as Request` em vez de `init.headers`) — `api-client.ts` sempre chama
`fetch(url, init)` com a URL como string; (2) vazamento de estado entre testes de
`auth-provider.test.tsx` por não reiniciar o token em memória a cada teste
(`clearAccessToken()` ausente do `beforeEach`).

### Pendências

- A recomendação avulsa de validação de `Origin`/`Referer` no servidor (§18.7.1, não
  bloqueante) segue sem decisão — não foi implementada nesta revisão, por não estar no escopo
  autorizado do Marco 6A nem alterar o backend sem aprovação explícita.
- O aviso de chunk de build (>500 kB) é pré-existente e não foi endereçado, por ser assunto de
  divisão de código, fora do escopo de autenticação do 6A.
- Marcos 6B e 6C continuam não iniciados, aguardando esta aprovação.

### Critérios de aceite de §18.11 — status

Login, logout, renovação (simples e concorrente), RBAC/RoleGuard, sessão restaurada só por
cookie, ausência de tokens em armazenamento do navegador e tratamento de 401/403/rede: todos
verificados, por teste automatizado e por validação manual contra o backend real. Pronto para
revisão e aprovação explícita antes de qualquer commit.

### Revisão final, pós-aprovação condicionada

Aprovação recebida condicionada a uma segunda rodada de verificação. Itens conferidos nesta
rodada, além do que já está registrado acima:

- **Diretório/branch/remoto/sincronização:** `C:\Users\pedro\Desktop\dev\stockflow`, branch
  `main`, remoto `origin` → `github.com/pedr0coder/stockflow.git`, `main...origin/main` sem
  divergência (`git fetch` + `git status -sb`), HEAD em `6f61833`.
- **Todo arquivo alterado/criado/removido pertence só ao Marco 6A** — `git diff` de cada
  arquivo modificado revisado linha a linha nesta rodada; nenhuma mudança fora de
  autenticação/RBAC/remoção de pré-visualização.
- **`frontend/.env` permanece ignorado** (`git check-ignore -v` confirma, via `.gitignore:7`).
  Criado `frontend/.env.example`, que não existia: o `.env.example` da raiz já documentava
  `VITE_API_URL`/`VITE_PROXY_TARGET` para o modo completo (`docker compose up`), mas não havia
  um para o diretório do frontend, que é o que o Vite de fato lê no modo híbrido
  (`docker compose up -d db` + `npm run dev` no host) — o mesmo modo em que `frontend/.env`
  estava faltando e quebrou o login na validação anterior.
- **Proxy do Vite e `VITE_API_URL`:** confirmado em `vite.config.ts` que `/api` é
  redirecionado para `VITE_PROXY_TARGET` (padrão `http://localhost:3000`, ou
  `http://backend:3000` dentro da rede Docker); `docker-compose.yml` já define
  `VITE_API_URL: /api/v1` para o modo completo, mesmo valor relativo usado em
  `frontend/.env`/`.env.example`. Nenhuma URL absoluta em nenhum lugar do projeto. A Fase 8
  (imagem de produção) ainda não existe — §18.7.6 registra como a topologia que ela escolher
  (mesma origem vs. origem separada) muda a avaliação da validação de `Origin`/`Referer`.
- **Renovação concorrente, logout com requisição em andamento, proteção contra restauração
  indevida:** `api-client.ts` e `auth-provider.tsx` relidos integralmente nesta rodada (não
  só os testes). Confirmado: `refreshPromise` único compartilhado entre o interceptor de 401
  e o boot (`refreshSession`); `tokenGeneration` incrementado em `clearAccessToken` e
  conferido antes de `performRefresh` gravar o token, descartando respostas tardias
  pós-logout; `epochRef` no `AuthProvider` com a mesma proteção na camada React, para boot,
  `signIn` e o handler de sessão expirada; `signOut` encerra o estado local de forma síncrona
  e incondicional antes de disparar (sem aguardar) a chamada de revogação ao servidor.
- **Nenhum resquício de pré-visualização nem import órfão:** varredura de
  `isPreview|UiPreview|PreviewBanner|PreviewRoleSelect|ui-preview-auth` no código-fonte só
  encontra comentários de documentação explicando a remoção; `noUnusedLocals`/
  `noUnusedParameters` ligados em `tsconfig.app.json`/`tsconfig.node.json`, e `tsc -b
--noEmit` (o mesmo comando do build) passa sem erro, o que descarta import não usado por
  construção.
- **CSRF, `Origin`/`Referer` e topologia de deploy:** registrado em detalhe no novo §18.7.6.
- **Verificações finais re-executadas nesta rodada:** `eslint .` sem erros; `tsc --noEmit` e
  `tsc -b --noEmit` (o do build, mais estrito) sem erros; `vitest run` do frontend → 148/148;
  `vite build` → sucesso; `prettier --check` limpo em todos os arquivos deste marco;
  `npm audit` → 0 vulnerabilidades; varredura de segredos no diff completo → limpa.
- **Backend — testes executados de verdade nesta rodada, não assumidos:**
  `npm run test` (unitário) → **199/199 passando**; `npm run test:int` (integração, contra o
  PostgreSQL real do Docker) → **461/461 passando**, em 17 arquivos. As linhas `TE001` que
  aparecem no log são falhas injetadas de propósito por testes de resiliência (nome do teste:
  "falha injetada para teste (AT)") — fazem parte do `AllExceptionsFilter` sendo exercitado
  deliberadamente, não erros reais. `git status` do diretório `backend/` permanece vazio antes
  e depois da execução: nenhum arquivo de backend foi tocado por este marco nem pela rodada de
  testes.
- **Correção de tipo encontrada durante o build desta revisão** (registrada aqui por
  completude, já estava corrigida antes do relatório anterior): `tsc -b --noEmit` (que o
  `npm run build` usa, mais estrito que o `tsc --noEmit` solto por causa de
  `exactOptionalPropertyTypes`) apontou que `credentials: init.credentials` em `request()`
  podia passar `undefined` explicitamente, o que o tipo `RequestInit` sob essa flag não aceita.
  Corrigido espalhando `...(isAuthRoute(path) ? { credentials: 'include' } : {})` em vez de
  atribuir a chave sempre — mesmo comportamento (rotas de auth forçam `include`; as demais
  preservam o que `init` trouxer), sem a chave `undefined` explícita.

Todas as dez verificações pedidas nesta rodada foram executadas e confirmadas. Autorização
de commit/push recebida e condicionada a elas — condições satisfeitas.

## 18.20 Marco 6B — resultados reais (implementado, validado, aguardando revisão)

Autorização recebida exclusivamente para o Marco 6B: produtos, categorias, fornecedores e
dashboard, conectados à API real. Nenhum módulo de negócio do backend foi alterado; nenhuma
migration foi executada; `recharts` 3.10.1 instalado, exatamente a versão já pré-aprovada em
`03-stack.md`. Nada foi commitado.

### 18.20.1 Diagnóstico inicial — divergências encontradas entre contrato e implementação

- **`DataTable` (Fase 3) paginava e ordenava só no cliente** — correto quando `data` era o
  conjunto inteiro (sem API real), errado para uma API que pagina no servidor. Resolvido
  estendendo o componente com um modo `server` opcional (`pageIndex`/`pageCount`/
  `onPageChange`, `sorting`/`onSortingChange`), usando `manualPagination`/`manualSorting` do
  `@tanstack/react-table` — comportamento padrão sem a prop é preservado, os 24 testes
  originais do componente continuam passando sem alteração.
- **Os 4 indicadores do dashboard (placeholder da Fase 3) não batiam com `DashboardSummaryDto`
  real.** O placeholder previa "Produtos cadastrados" e "Itens em estoque"; o backend calcula
  `activeProducts`, `lowStock`, `outOfStock`, `movementsLast30Days` — não existe um agregado de
  soma de itens em estoque, e "cadastrados" contaria inativos, que o backend exclui. Resolvido
  renomeando os 4 cards para o que a API de fato calcula, sem alterar o backend nem inventar um
  endpoint novo.
- Os demais contratos (produtos, categorias, fornecedores — endpoints, DTOs, RBAC, códigos de
  erro) foram conferidos direto no código-fonte do backend e batem exatamente com
  `docs/05-api.md §5.4–5.6, §5.9` — nenhuma outra divergência encontrada desta vez.

### 18.20.2 Telas e funcionalidades implementadas

- **Categorias** (`/categories`): listagem com filtro de situação, criação/edição por painel
  lateral (`Sheet` — o mapa de telas não reserva rota própria de criação), ativação/inativação
  com `CATEGORY_HAS_PRODUCTS` (409) exibido como mensagem compreensível.
- **Fornecedores** (`/suppliers`, `/suppliers/new`, `/suppliers/:id`): listagem com busca
  (debounce de 400ms) e filtro de situação, cadastro em página própria, edição inline no
  detalhe, produtos vinculados via `GET /suppliers/:id/products`, ativação/inativação.
- **Produtos** (`/products`, `/products/new`, `/products/:id`, `/products/:id/edit`): listagem
  com busca, filtro por categoria/situação de estoque/situação, ordenação por coluna
  (servidor), cadastro e edição com seleção de categoria/fornecedor/unidade, detalhe em abas
  (Dados / Histórico, com `GET /products/:id/movements`), ativação/inativação.
  **`currentStock` não aparece em nenhum formulário** — nem como campo, nem no corpo da
  requisição (confirmado por teste, §18.20.4).
- **Dashboard** (`/dashboard`): 4 indicadores reais, gráfico de movimentações por período
  (7/30/90 dias, `recharts`, cores por tipo IN/OUT/ADJUSTMENT) e lista de movimentações
  recentes — tudo de `GET /dashboard/summary`, `/movements-chart`, `/recent-movements`.
- Responsividade: listagens de produtos e fornecedores ganharam visão em cartão para telas
  estreitas (`renderCard` do `DataTable`), que delega as ações (editar/inativar) para a página
  de detalhe — Categorias manteve rolagem horizontal da tabela, porque não tem página de
  detalhe para onde delegar as ações em cartão, e removê-las do cartão tiraria a função de
  ADMIN/MANAGER no celular.

### 18.20.3 Endpoints consumidos

Todos os 20 endpoints de produtos/categorias/fornecedores/dashboard do mapa de telas
(§18.3): `GET/POST/PATCH /categories[/:id][/status]` (5), `GET/POST/PATCH
/suppliers[/:id][/status]` + `GET /suppliers/:id/products` (6), `GET/POST/PATCH
/products[/:id][/status]` + `GET /products/:id/movements` (6), `GET /dashboard/summary`,
`/movements-chart`, `/recent-movements` (3).

### 18.20.4 Arquivos criados ou modificados

Novos: `lib/pagination.ts`, `lib/query-keys.ts`, `lib/query-error.ts`,
`lib/use-debounced-value.ts`, `components/ui/tabs.tsx`, `features/categories/*` (api, schemas,
queries, componente de formulário, página, teste), `features/suppliers/*` (idem + página de
detalhe), `features/products/*` (idem + páginas de edição e detalhe), `features/dashboard/api.ts`,
`queries.ts`, `components/MovementsChart.tsx`, `pages/DashboardPage.test.tsx`.
Modificados: `components/shared/DataTable.tsx` (+teste, modo `server`), `router.tsx` (rotas
reais substituindo os placeholders), `lib/nav-items.ts` (`deliveredInPhase: null`),
`features/dashboard/pages/DashboardPage.tsx` (dado real), `test/render.tsx` (+
`renderWithProviders`, `createTestQueryClient`), `test/setup.ts` (polyfill de
`hasPointerCapture`/`scrollIntoView`, exigido pelo Radix `Select` em jsdom),
`frontend/package.json`/`package-lock.json` (`recharts` 3.10.1).

### 18.20.5 Testes executados e resultados

**191 testes de frontend, todos passando** (148 do Marco 6A + 4 do modo `server` do
`DataTable` + 39 novos deste marco: 8 categorias, 12 fornecedores, 16 produtos — incluindo os
dois testes dedicados a provar que `currentStock` nunca é enviado, nem no `POST` nem no
`PATCH`, e que o campo SKU fica desabilitado na edição — 6 dashboard). Cobertos: listagem,
busca com debounce, filtros, paginação e ordenação pelo servidor; cadastro e edição com
validação Zod espelhando os limites reais do DTO (incluindo o padrão de CNPJ/CPF e os
decimais de 3/4 casas); erro de API (`CATEGORY_HAS_PRODUCTS`, `CONFLICT`, erro genérico)
exibido como mensagem compreensível, sem perder o formulário preenchido; RBAC ocultando
criação/edição/inativação para OPERATOR; invalidação do React Query após mutação; dashboard
com dado real simulado só no teste; estados de carregamento/vazio/erro em toda tela;
formatação decimal (nunca `Number()`) e de data em pt-BR; ausência de `currentStock` editável;
toda a suíte de autenticação do Marco 6A, sem regressão.

**Backend, executado de verdade nesta revisão** (não assumido): `npm run test` → **199/199**;
`npm run test:int` → **461/461** (17 arquivos; as linhas `TE001` no log são falha injetada de
propósito por teste de resiliência, não erro real). `git status` do diretório `backend/`
permanece vazio antes e depois — nenhum arquivo tocado.

### 18.20.6 Evidência da integração real (backend + PostgreSQL via Docker)

Validado no navegador, logado como `gerente@stockflow.local` (MANAGER) e depois
`operador@stockflow.local` (OPERATOR), contra o backend e o PostgreSQL reais:

- Categorias, fornecedores e produtos carregam da API, com paginação e filtros reais
  (confirmado por `read_page`/`get_page_text`, não só captura de tela).
- Criado um produto de teste (`TEST-6B-002`) pela interface: SKU enviado em minúsculas,
  devolvido em maiúsculas pelo backend (`trimUpperValue`) — confirma que a normalização é do
  servidor, a interface não precisa replicá-la. Produto inativado em seguida pela própria
  interface, para não deixar dado de teste poluindo a base de desenvolvimento.
- Detalhe de produto: aba Histórico mostrando movimentações reais (tipo, motivo, saldo após,
  responsável); categoria e fornecedor resolvidos pelo nome, não só pelo id.
- Detalhe de fornecedor: produtos vinculados reais via `GET /suppliers/:id/products`; edição
  inline testada (valores pré-preenchidos corretos, cancelada sem gravar para não alterar
  dado do seed).
- Dashboard: os 4 indicadores com valores reais (42 produtos ativos, 65 movimentações em 30
  dias, 7 em estoque baixo, 6 sem estoque no momento da validação), gráfico renderizado com
  barras reais por tipo, lista de movimentações recentes com produto/quantidade/autor reais.
- RBAC confirmado nos dois sentidos: a interface oculta criar/editar/inativar para OPERATOR
  nas três telas de cadastro (confirmado por leitura do DOM, não só visual); e, independente
  da interface, uma chamada direta `POST /products` com token de OPERATOR foi tentada por
  `curl` e o servidor recusou com `403` — a interface nunca é a única barreira.
- Responsividade verificada em 375px, 768px e 1440px: produtos e fornecedores mudam para
  cartão abaixo de `sm`, sem rolagem horizontal; categorias mantêm tabela com rolagem
  horizontal (razão em §18.20.2); dashboard empilha os indicadores em coluna única no celular.

Nenhuma credencial, token ou cookie foi exposto nesta documentação ou em qualquer saída de
terminal.

### 18.20.7 Qualidade

`eslint .` sem erros; `tsc -b --noEmit` (o do build, com `exactOptionalPropertyTypes`) sem
erros — corrigidas 6 ocorrências onde um valor `boolean | undefined` ou uma função opcional
eram atribuídos a uma prop opcional sem o spread condicional que a flag exige (mesma classe de
problema já documentada no Marco 6A); `vite build` concluído (bundle principal cresceu de 714kB
para 1165kB só por causa do `recharts`, esperado); `prettier --check` limpo em todos os
arquivos deste marco; `npm audit` → 0 vulnerabilidades nos três projetos (raiz, backend,
frontend); varredura de segredos no diff completo → limpa.

**Aborto do Node 24/Windows: ocorreu na auditoria final, antes do versionamento.** Na primeira
execução de `npm run test:int` desta rodada, o worker de `rbac.int-spec.ts` saiu com o código
`3221226505` (`0xC0000409`/`STATUS_STACK_BUFFER_OVERRUN`) — a mesma assinatura de `abort()`
nativo já investigada e documentada desde `docs/16-relatorio-fase-4.md §16.7` (Node 24.15.0 +
libuv neste Windows, taxa intermitente de ~10%, reproduzida até em um script Node sem nada
deste repositório). Uma segunda execução, sem nenhuma mudança, terminou limpa: 461/461. Os dois
resultados ficam registrados aqui, não só o segundo — `backend/` tem zero arquivo alterado por
este marco, então o abort não é uma regressão desta revisão, e **não está "corrigido"**: é a
pendência aberta de `16.7`, que continua aberta.

- `DataTableSkeleton` usa "Carregando `<legenda>`" como nome acessível do `<table>` — um teste
  que espera pela tabela carregada precisa do nome exato, não só `role: 'table'`, ou resolve
  cedo demais no esqueleto. Corrigido nos testes de produtos e fornecedores.
- `getByLabelText('Nome')`/`('SKU')` falhavam porque o rótulo do `FormField` concatena
  `*(obrigatório)` ao texto — o mesmo padrão já visto no Marco 6A (`LoginPage.test.tsx` usa
  regex por isso). Corrigido para `/^nome/i`/`/^sku/i`, consistente com a convenção existente.
- `vi.mocked(fetch).mockImplementation` ordenado por sequência de chamada, em vez de por URL,
  quebrou quando duas consultas paralelas (`/categories` + `/products`) não chegavam na ordem
  assumida pelo teste. Corrigido despachando por URL, não por posição — mais robusto a mudanças
  futuras na ordem de disparo dos hooks.
- `Select` do Radix lança `hasPointerCapture is not a function` em jsdom (API real de
  navegador, ausente no ambiente de teste) — corrigido com um polyfill mínimo em
  `test/setup.ts`, reaproveitado por todo teste futuro que abra um `Select`.
- Seis erros de `exactOptionalPropertyTypes` só visíveis no `tsc -b` do build (não no `tsc
--noEmit` solto): `isActive: boolean | undefined` atribuído a um parâmetro `isActive?:
boolean`, e `onClearFilters: (() => void) | undefined` atribuído a uma prop opcional.
  Corrigidos com spread condicional (`...(valor !== undefined ? {...} : {})`), igual ao padrão
  já estabelecido no Marco 6A para o mesmo tipo de erro.

### 18.20.9 Limitações e pendências

- Categorias mantêm rolagem horizontal da tabela em tela estreita, por não ter página de
  detalhe própria para onde delegar as ações do cartão (razão completa em §18.20.2) — não é
  um descumprimento do critério de responsividade, é uma escolha registrada: a alternativa
  (cartão sem ação nenhuma) seria pior para ADMIN/MANAGER no celular.
- `DataTable` ganhou um modo `server`, mas a ordenação por coluna só foi conectada de fato na
  tela de produtos (a única com `sort` exposto na API e na interface); categorias e
  fornecedores ordenam sempre por nome, porque suas telas não expõem controle de ordenação —
  não é uma lacuna, é escopo: nenhuma tela perdeu uma funcionalidade que deveria ter.
- Marcos 6C (movimentações, inventários, relatórios, usuários/auditoria) e Fase 7 continuam
  não iniciados, aguardando esta aprovação.

### 18.20.10 Critérios de aceite do 6B (§18.18) — status

"CRUD completo de categoria, fornecedor e produto pela interface, com os quatro estados em
cada tela; dashboard com os 4 indicadores, gráfico de 30 dias e últimas movimentações, todos
com dado real (ou estado vazio real, nunca número inventado)": todos verificados, por teste
automatizado e por validação manual contra o backend e o PostgreSQL reais. Pronto para
revisão e aprovação explícita antes de qualquer commit.
