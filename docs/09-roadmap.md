# 09 — Roadmap de Execução

Cada fase termina com relatório no formato acordado e **aguarda autorização** antes da
seguinte. Nenhum commit é feito sem autorização explícita.

As estimativas são de esforço relativo, não de prazo — não conheço sua disponibilidade
semanal.

---

## Fase 1 — Planejamento ✅ (esta entrega)

Diagnóstico de ambiente, arquitetura, stack verificada, modelo de dados, contrato de API,
telas, design system, estratégia de testes, estratégia de segurança, roadmap, riscos e
ADRs. Nenhuma linha de código de aplicação.

**Bloqueio para a Fase 2:** era a decisão sobre o banco de dados local (R1).
**Resolvido em 2026-10-17:** WSL2 com Docker Desktop instalados e PostgreSQL 17.11
verificado por query (§1.4). A Fase 2 está liberada.

---

## Fase 2 — Fundação

**Objetivo:** tudo instalado, configurado e executando de ponta a ponta — sem
funcionalidade de negócio.

- `git init`, `.gitignore`, `.env.example`
- Backend: NestJS 12 + TS 6.0.3, `main.ts`, prefixo `/api/v1`, Swagger, Helmet, CORS,
  ValidationPipe global, filtro de exceção, Pino
- Validação de schema de ambiente no boot
- Prisma: `schema.prisma` completo (§04), primeira migration, `PrismaService`, seed
- Frontend: Vite 8 + React 19 + TS 6.0.3 + Tailwind 4 + shadcn/ui inicializado
- ESLint 9 flat config + Prettier nos dois lados
- Vitest configurado nos dois lados, com um teste real passando
- Docker Compose (Postgres + backend + frontend)
- GitHub Actions: lint, typecheck, test, build
- README inicial honesto (estado real, não aspiracional)

**Critério de aceite:** `docker compose up` sobe os três serviços; `/health/ready`
responde 200; frontend carrega; `npm run test` passa nos dois lados; migration aplica em
banco limpo; CI verde.

---

## Fase 3 — Design System e Shell

**Objetivo:** o app parece um produto antes de ter funcionalidade.

- Tokens de tema em `@theme` (cores, tipografia, espaçamento, raio, sombra)
- `AppShell`: sidebar colapsável, header, navegação por papel
- Componentes compartilhados: `PageHeader`, `DataTable`, `StatCard`, `StockBadge`,
  `MovementTypeBadge`, `ConfirmDialog`, `EmptyState`, `ErrorState`, `FormField`
- Tela de login (visual, ainda sem integração)
- Dashboard com layout e **skeletons** — sem número inventado
- React Router com rotas protegidas; React Query provider; Toaster
- Responsividade nas três faixas
- Testes de componente do `DataTable` e do `ConfirmDialog`

**Critério de aceite:** navegação completa pelo shell; os quatro estados visíveis em
tela de demonstração; layout correto em 375px, 768px e 1440px; nenhum dado falso na UI.

---

## Fase 4 — Backend: auth e cadastros

- Módulo `auth`: login, refresh rotativo, logout, `/me`; Argon2id; `RefreshToken`
- `JwtAuthGuard` + `RolesGuard` globais; `@Public()`, `@Roles()`, `@CurrentUser()`
- `users`, `categories`, `suppliers`, `products` completos (§05)
- Paginação, busca, filtro e ordenação com allowlist
- Rate limiting em `/auth`
- `AuditInterceptor` + módulo `audit` com redação testada
- Testes: unitários de serviço e guard; integração de auth, RBAC e CRUDs

**Critério de aceite:** suíte de auth, RBAC e CRUD passando com execução real; Swagger
completo; `passwordHash` ausente de toda resposta (com teste provando).

---

## Fase 5 — Estoque e inventário (fase crítica)

- `stock-movements`: entrada, saída, ajuste com UPDATE condicional atômico (§4.5)
- Transações, `stockBefore`/`stockAfter`, imutabilidade
- CHECK constraints em migration SQL
- `inventories`: abrir, contar, divergência, aprovar (transação única), cancelar
- Validação de combinação `type` × `reason`
- Relatórios (§5.10), incluindo reconciliação
- Dashboard com agregações SQL reais
- **Testes de concorrência** (§7.4) e todos os casos de divergência

**Critério de aceite:** teste de 5 saídas concorrentes sobre saldo 10 com exatamente 3
sucessos, 2 × 409, saldo final 1 e 3 movimentos; aprovação dupla de inventário com um 200
e um 409; reconciliação consistente após ~200 movimentações.

É a fase que não pode ser apressada. Se algo aqui ficar instável, as fases seguintes
herdam o problema.

---

## Fase 6 — Integração frontend ↔ backend

- `api-client` com refresh automático em 401 e fila de requisições durante o refresh
- Autenticação real: login, sessão, logout, rotas protegidas por papel
- Todas as telas ligadas à API via React Query
- Formulários com React Hook Form + Zod, erro junto ao campo
- Loading / empty / error / success em **todas** as telas
- Paginação, filtros e ordenação ligados aos parâmetros reais da API
- Mapa de `code` de erro → mensagem em português
- Remoção de todo mock remanescente
- Submit desabilitado durante requisição pendente

**Critério de aceite:** nenhum dado mockado no código; todo estado de tela verificado
manualmente, inclusive erro de rede e 403; criar produto → entrada → saída → histórico
funcionando na UI.

---

## Fase 7 — Qualidade

- Code review completo próprio: duplicação, `any`, função longa, acoplamento
- `tsc --noEmit` sem erro e sem supressão; ESLint sem warning
- Revisão de segurança contra o checklist da §08
- Performance: plano de consulta das listagens, índices em uso, N+1
- Acessibilidade: contraste AA, navegação por teclado, foco em modal, ARIA em tabela
- Responsividade revisada tela por tela
- E2E dos dois fluxos críticos (§7.5)
- Correção do que for encontrado e **relatório honesto do que não foi corrigido**

**Critério de aceite:** suíte completa verde com saída de comando registrada; nenhum erro
crítico conhecido em aberto; limitações documentadas.

---

## Fase 8 — Deploy

- Dockerfile de produção multi-stage (backend e frontend)
- Postgres gerenciado; `prisma migrate deploy` no pipeline
- Variáveis de ambiente no provedor; **nenhum segredo no repositório**
- CI/CD: deploy automático na `main` após CI verde
- Health check, logs estruturados, monitoramento básico de erro
- Usuário de demonstração para recrutadores (com dado fictício)

**Critério de aceite:** URL pública funcionando, login real, fluxo completo executável por
um terceiro, migrations aplicadas em banco limpo.

---

## Fase 9 — Portfólio

- README final: problema, solução, decisões, arquitetura, como rodar
- Screenshots e GIF do fluxo de estoque
- Diagrama de arquitetura e de banco
- Revisão dos ADRs com o que mudou durante a execução
- Seção de limitações conhecidas e roadmap futuro
- Preparação para entrevista: lista de perguntas prováveis e as respostas, com os números
  reais do projeto

---

## Pós-MVP (roadmap declarado no README)

Ordenado por relação valor/esforço:

1. Exportação CSV dos relatórios
2. Recuperação de senha por e-mail
3. QR Code / código de barras com leitura por câmera
4. Alerta automático de estoque baixo
5. Múltiplos depósitos
6. Custo médio ponderado e valorização de estoque
7. Multi-tenancy
8. Permissões granulares por recurso

Nada disso aparece na interface como botão inativo ou "em breve".
