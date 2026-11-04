# 19 — Plano da Fase 7 (Qualidade)

> **Status deste documento:** planejamento aprovado para elaboração, aguardando autorização
> de implementação. Nenhuma linha de código, dependência, migration ou configuração foi
> alterada para produzir este plano. Toda alegação de "verificado no código" abaixo foi
> conferida por leitura direta do arquivo citado nesta sessão, não assumida da documentação
> anterior. O diagnóstico cruzou três investigações independentes nesta sessão — escopo no
> roadmap/ADRs/relatórios anteriores, leitura do código backend (segurança, RBAC, concorrência,
> CI/CD, infraestrutura de testes) e leitura do código frontend (bundle, cache, responsividade,
> acessibilidade) — e os itens das §19.2.1.1 e §19.2.4.1 foram acrescentados depois da primeira
> versão deste documento para incorporar os dois relatórios de código, evitando que o plano
> ficasse apenas na leitura de documentação.

## 19.0 Diagnóstico obrigatório — estado confirmado

| Item               | Valor confirmado                                                                      |
| ------------------ | ------------------------------------------------------------------------------------- |
| Diretório          | `C:\Users\pedro\Desktop\dev\stockflow`                                                |
| Branch             | `main`                                                                                |
| HEAD               | `2c6bbe2` — "docs: record marco 6c real results and final audit"                      |
| Remoto             | `origin` → `https://github.com/pedr0coder/stockflow.git`                              |
| Sincronização      | `main...origin/main`, sem divergência (CI confirmado verde pelo usuário neste commit) |
| Árvore de trabalho | limpa                                                                                 |

### 19.0.1 Escopo exato da Fase 7 segundo `docs/09-roadmap.md` (citação literal)

> "Code review completo próprio: duplicação, `any`, função longa, acoplamento
> `tsc --noEmit` sem erro e sem supressão; ESLint sem warning
> Revisão de segurança contra o checklist da §08
> Performance: plano de consulta das listagens, índices em uso, N+1
> Acessibilidade: contraste AA, navegação por teclado, foco em modal, ARIA em tabela
> Responsividade revisada tela por tela
> E2E dos dois fluxos críticos (§7.5)
> Correção do que for encontrado e **relatório honesto do que não foi corrigido**
>
> **Critério de aceite:** suíte completa verde com saída de comando registrada; nenhum erro
> crítico conhecido em aberto; limitações documentadas."

**Achado central deste diagnóstico, que precisa de uma decisão sua antes de qualquer
implementação:** o roadmap aprovado define E2E como **exatamente dois fluxos** —
`docs/07-testes.md §7.2` rotula a camada E2E da pirâmide como "(2)" e §7.5 os descreve por
extenso (ciclo de estoque; inventário). O prompt de autorização desta fase lista uma matriz
muito mais ampla (autenticação completa, RBAC entre os três papéis, cadastros, filtros,
relatórios, auditoria — por volta de 25 a 30 cenários). Por instrução sua explícita no mesmo
prompt ("não assuma que as tarefas sugeridas substituem o roadmap"), este plano trata:

- os **dois fluxos do §7.5** como escopo **aprovado e obrigatório** da Fase 7;
- a matriz ampliada como uma **extensão opcional**, tecnicamente desejável e descrita em
  detalhe na §19.5 deste documento, mas que **amplia o critério de aceite original** e
  portanto precisa da sua aprovação explícita como item avulso, não como parte implícita da
  Fase 7. Ver decisão D7-1 na §19.14.

O mesmo vale para os demais itens do seu prompt que vão além do checklist da §08 (observa­
bilidade com IDs de correlação e métricas, CI com captura de trace/screenshot, matriz de SO
no CI): cada um está classificado abaixo como "núcleo do roadmap" ou "extensão proposta",
nunca misturado.

### 19.0.2 Itens explicitamente fora desta fase (Fase 8/9, confirmado no roadmap)

Fase 8: Dockerfile de produção multi-stage, Postgres gerenciado, `prisma migrate deploy` no
pipeline, variáveis de ambiente no provedor, deploy automático, monitoramento básico, usuário
de demonstração. Fase 9: README final, screenshots/GIF, diagramas, revisão de ADRs,
preparação para entrevista. Nenhum destes é tocado neste plano nem será antecipado.

---

## 19.1 Inventário de cobertura de testes existente (medido, não estimado)

| Camada                        | Local                             | Estado em `2c6bbe2`                                                                                                                                                                                               |
| ----------------------------- | --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unitários backend             | `backend/src/**/*.spec.ts`        | 199 passando (medido nesta sessão)                                                                                                                                                                                |
| Integração backend            | `backend/test/**/*.int-spec.ts`   | 461 passando (medido nesta sessão, 1 execução limpa, sem abort)                                                                                                                                                   |
| Unitários/componente frontend | `frontend/src/**/*.test.{ts,tsx}` | 235 passando (medido nesta sessão)                                                                                                                                                                                |
| E2E                           | —                                 | **Não existe nenhum.** Nem Playwright nem outra ferramenta está instalada em nenhum `package.json` do repositório (confirmado por busca na árvore de dependências declaradas, não nos `node_modules` transitivos) |
| `test:e2e` como script        | —                                 | Não existe em `frontend/package.json` nem `backend/package.json`                                                                                                                                                  |

A pirâmide descrita em `07-testes.md §7.2` (E2E 2 / integração ~35 / unitário ~45) está
defasada em número absoluto — o projeto cresceu desde a Fase 1 — mas a **proporção e o
princípio continuam válidos**: nenhum teste unitário novo foi criado para substituir
verificação de concorrência ou transação, que seguem exclusivamente em integração.

---

## 19.2 Diagnóstico do estado atual — comprovado, risco potencial, melhoria opcional

Convenção usada abaixo: **🔵 comprovado** (lido no código ou medido por execução real nesta
sessão), **🟡 risco potencial** (inferido por análise, não observado falhando), **⚪ melhoria
opcional** (não é defeito, é ganho possível).

### 19.2.1 Segurança

| #   | Classificação        | Achado                                                                                                                                                                                                                                                                                                                                                          | Fonte                                                                                                      |
| --- | -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| S1  | 🔵 comprovado        | Nenhum guard ou middleware valida `Origin`/`Referer` em `auth.controller.ts` ou `bootstrap.ts`. Confirmado por leitura direta nesta sessão (`backend/src/auth/auth.controller.ts` inteiro, `refresh-cookie.ts` inteiro)                                                                                                                                         | `docs/18-plano-fase-6.md §18.7.4` já registrava isso; reconfirmado agora                                   |
| S2  | 🔵 comprovado        | `SameSite=Strict` é o único mecanismo de defesa primária contra CSRF nos dois endpoints que usam cookie (`/auth/refresh`, `/auth/logout`); `path: '/api/v1/auth'` reduz o escopo do cookie, mas não é CSRF per se                                                                                                                                               | `refresh-cookie.ts:33-50`                                                                                  |
| S3  | 🔵 comprovado        | Rate limit real no código: login 5/15min por IP+e-mail (`@Throttle({ default: { limit: 5, ttl: 15*60*1000 } })`), refresh 30/15min — bate com o documentado em `08-seguranca.md §8.7`                                                                                                                                                                           | `auth.controller.ts:48,75`                                                                                 |
| S4  | 🔵 comprovado        | CI não roda `npm audit` nem scanner de segredo além do `secrets-check` job (que só verifica se `.env` foi commitado e se `.env.example` tem valor preenchido — não varre o diff por padrão de segredo genérico)                                                                                                                                                 | `.github/workflows/ci.yml` (lido integralmente)                                                            |
| S5  | 🟡 risco potencial   | Nenhum guard de `Origin`/`Referer` significa que, teoricamente, um `<form>` em outro site ainda consegue **disparar** `POST /auth/refresh` ou `/auth/logout` com o cookie do usuário (SameSite=Strict previne isso na prática em navegadores modernos — o risco residual é de navegador legado ou extensão comprometida, fora do modelo de ameaça já declarado) | Análise sobre `S1`/`S2`, consistente com a avaliação já registrada em `18-plano-fase-6.md §18.7.3-§18.7.6` |
| S6  | ⚪ melhoria opcional | Adicionar guard de `Origin`/`Referer` como defesa em profundidade — custo baixo, mas o ganho real depende da topologia de deploy da Fase 8 (mesma origem vs. origem separada), ainda não decidida                                                                                                                                                               | `18-plano-fase-6.md §18.7.6`                                                                               |
| S7  | 🔵 comprovado        | `ValidationPipe` global com `whitelist`/`forbidNonWhitelisted`/`transform` confirmado em DTOs inspecionados (`CreateStockMovementDto`, `UpdateProductDto`); `currentStock` continua ausente do DTO de atualização de produto                                                                                                                                    | inspeção de `backend/src/products/dto/*.ts`, `backend/src/stock-movements/dto/*.ts`                        |
| S8  | 🔵 comprovado        | Os dois pontos de SQL via `$queryRaw` (UPDATE condicional de estoque, reconciliação) usam template tagged com parâmetro, não concatenação                                                                                                                                                                                                                       | inspeção de `stock-movements.service.ts`, `reports.service.ts`                                             |

### 19.2.1.1 Achados adicionais de segurança (cruzados com a auditoria de código desta sessão)

Os itens S1-S8 acima vieram da pesquisa de documentação. A leitura direta do código
backend feita em paralelo nesta mesma sessão confirmou ainda:

| #   | Classificação        | Achado                                                                                                                                                                                                                                                                                                                                                                                           | Fonte                                                                                                          |
| --- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| S9  | 🔵 comprovado        | Limite de corpo de requisição global de 16 KiB (json e urlencoded), abaixo do padrão de 100 KiB do Express, aplicado antes de qualquer guard — protege inclusive a rota pública `/auth/login`                                                                                                                                                                                                    | `backend/src/bootstrap.ts:39,124-125`                                                                          |
| S10 | 🟡 risco potencial   | `RolesGuard` permite qualquer usuário autenticado quando um handler **não** declara `@Roles()` — não é falha hoje (todos os endpoints sensíveis verificados usam o decorator), mas é armadilha de disciplina: endpoint novo sem `@Roles()` fica aberto por omissão, não por decisão                                                                                                              | `backend/src/common/guards/roles.guard.ts:28-66` (o próprio comentário nas linhas 13-19 reconhece isso)        |
| S11 | 🔵 comprovado        | Assimetria no tratamento de falha de auditoria: `AuditService.record()` (fora de transação) captura o erro e só registra um warning — a ação de negócio segue mesmo sem o registro de auditoria; `AuditService.recordInTransaction()` (dentro de transação) propaga o erro e desfaz a operação inteira. Nem toda ação de negócio tem a mesma garantia de que a falta de auditoria vai bloqueá-la | `backend/src/audit/audit.service.ts`; reproduzido no log de fault-injection do próprio `test:int` desta sessão |
| S12 | 🟡 risco potencial   | `AllExceptionsFilter` filtra mensagens de framework por lista de bloqueio (regex), não por lista de permissão — o próprio comentário no código admite "o defeito das listas de bloqueio": uma mensagem nova de uma exceção do NestJS/Prisma ainda não prevista pode escapar ao cliente sem ser filtrada                                                                                          | `backend/src/common/filters/all-exceptions.filter.ts:55-56,69-79`                                              |
| S13 | ⚪ melhoria opcional | Rate limiting cobre `/auth/login` e `/auth/refresh`, mas não `/auth/logout` nem `/auth/me` — risco baixo (nenhum dos dois altera saldo ou dado sensível em massa), mas é lacuna de consistência na defesa                                                                                                                                                                                        | `backend/src/auth/auth.controller.ts`                                                                          |

### 19.2.2 Estabilidade e concorrência

| #   | Classificação      | Achado                                                                                                                                                                                                                                                                                                                                                                                   | Fonte                                                                              |
| --- | ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| E1  | 🔵 comprovado      | A suíte de integração já roda com `pool: 'forks'`, `maxWorkers: 1`, `minWorkers: 1`, `fileParallelism: false` — ou seja, **um único processo, sem paralelismo entre arquivos**. O abort do Node 24/Windows ocorre mesmo nessa configuração serial                                                                                                                                        | `backend/vitest.config.int.mts:42-47`; histórico em `16-relatorio-fase-4.md §16.7` |
| E2  | 🟡 risco potencial | Como o abort já ocorre em execução serial, a causa provável não é disputa entre workers paralelos, e sim algo no ciclo de vida de um único processo: handle de socket não fechado, timer pendente, ou uma interação específica do runtime nativo do Node 24 com o scheduler do Windows. Isso é uma inferência, não uma causa confirmada — exige investigação dirigida (plano em §19.6.1) | Análise sobre E1                                                                   |
| E3  | 🔵 comprovado      | `MAX_CODE_ATTEMPTS = 25` no loop de geração de código de inventário; ao esgotar, lança um `Error` interno de guarda (inalcançável em teoria) que se tornaria um 500 genérico se algum dia disparado                                                                                                                                                                                      | `backend/src/inventories/inventories.service.ts:93,148,159`                        |
| E4  | 🔵 comprovado      | CI roda em `ubuntu-latest` nos três jobs (backend, frontend, format) — **não há Windows na matriz do CI**. Isso é consistente com o próprio roadmap, que já registra a falha como "do runner, não de asserção", e explica por que o CI em Linux nunca reproduz o problema                                                                                                                | `.github/workflows/ci.yml:27,57,155,193`                                           |
| E5  | 🔵 comprovado      | D14 (sem chave de idempotência) e D18/S9 (`movedSinceCount`) continuam como riscos aceitos, não resolvidos por esta fase — nenhuma mudança de regra de negócio está nesta proposta                                                                                                                                                                                                       | `docs/17-plano-fase-5.md §17.6.7, §17.7.5`                                         |

### 19.2.3 Performance

| #   | Classificação        | Achado                                                                                                                                                                                                                                              | Fonte                                              |
| --- | -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| P1  | 🔵 comprovado        | Build de produção gera um único chunk de 1.216,13 kB (357,75 kB gzip), com aviso nativo do Vite de chunk acima de 500 kB                                                                                                                            | saída real de `npm run build`, medida nesta sessão |
| P2  | 🔵 comprovado        | Zero ocorrências de `lazy(` em `frontend/src/router.tsx` — todas as 20+ rotas são importadas estaticamente, nenhuma divisão de código por rota existe                                                                                               | leitura de `router.tsx`                            |
| P3  | 🟡 risco potencial   | Sem medição de plano de consulta (`EXPLAIN`) feita ainda nesta fase para as listagens (produtos, movimentações, relatórios) nem para as agregações do dashboard — não há evidência de N+1 nem de ausência de índice, apenas ausência de verificação | nenhuma fonte ainda — item do plano, não achado    |
| P4  | ⚪ melhoria opcional | `recharts` é importado estaticamente no bundle do dashboard; code-splitting por rota reduziria o chunk inicial                                                                                                                                      | inspeção de `frontend/src/features/dashboard/`     |

### 19.2.4 Acessibilidade e UX

| #   | Classificação      | Achado                                                                                                                                                                                                                                                                                                                               | Fonte                                                                                      |
| --- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------ |
| A1  | 🔵 comprovado      | `DataTable` tem um modo de cartão para telas pequenas (`renderCard`, ativo abaixo do breakpoint `sm`), mas **apenas** `ProductsPage` e `SuppliersPage` o usam. Categorias, movimentações, inventários, relatórios, usuários e auditoria renderizam a tabela padrão (com `overflow-hidden`) em todas as larguras                      | `frontend/src/components/shared/DataTable.tsx:243-255`; busca por `renderCard` nas páginas |
| A2  | 🟡 risco potencial | Sem teste manual ainda nesta fase, não é possível afirmar que as tabelas sem `renderCard` ficam ilegíveis em 375px — algumas (inventário, por ex.) já usam rolagem horizontal **dentro do cartão** por decisão documentada (`18-plano-fase-6.md:1122`), o que pode ser aceitável. Precisa de revisão tela por tela, não de suposição | análise sobre A1                                                                           |
| A3  | 🟡 risco potencial | Nenhuma auditoria de contraste, foco em modal ou leitor de tela foi feita ainda com ferramenta (axe, Lighthouse) — o roadmap pede isso como atividade da própria Fase 7, não como algo já resolvido                                                                                                                                  | `09-roadmap.md`                                                                            |

### 19.2.4.1 Achados adicionais de acessibilidade e UX (cruzados com a auditoria de código desta sessão)

| #   | Classificação        | Achado                                                                                                                                                                                                                                                                                                                                                                                    | Fonte                                                                                                   |
| --- | -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| A4  | 🔵 comprovado        | Bug confirmado no `ProductPicker`: as opções da lista usam `aria-selected={false}` fixo (nunca reflete seleção real), pois depois de escolher um produto o componente troca para um ramo de exibição diferente, que não é mais a listbox — um leitor de tela nunca anuncia a opção como selecionada. Fechamento ao perder foco usa `setTimeout` de 150ms em vez de lógica baseada em foco | `frontend/src/features/products/components/ProductPicker.tsx:72-134` (linha 114 para o `aria-selected`) |
| A5  | 🔵 comprovado        | Não existe nenhum `ErrorBoundary` no frontend — um erro de renderização não tratado deixa a tela em branco em vez de um estado de erro recuperável. Erros de query já são tratados consistentemente via `ErrorState`/`DataTable`, mas isso não cobre erro de render                                                                                                                       | busca por `ErrorBoundary` em `frontend/src` — nenhum resultado                                          |
| A6  | ⚪ melhoria opcional | Nenhuma referência a `prefers-reduced-motion`/`motion-reduce`/`motion-safe` em todo o frontend — qualquer animação (toast, skeleton, transição) roda igual, independente da preferência do sistema                                                                                                                                                                                        | busca em `frontend/src` — nenhum resultado                                                              |

### 19.2.5 Observabilidade

| #   | Classificação        | Achado                                                                                                                                                                                                                       | Fonte                                                                     |
| --- | -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| O1  | 🔵 comprovado        | Pino (`nestjs-pino`) já configurado com `redact` de `authorization`, `cookie`, `password`, `token`, `refreshToken`, `secret`; `requestId` por requisição presente no log e na resposta de erro                               | `08-seguranca.md §8.9`, reconfirmado por não ter sido tocado nesta sessão |
| O2  | 🔵 comprovado        | Não existe rota de health check dedicada verificada nesta sessão alinhada ao `/health/ready` citado no critério de aceite da Fase 2 do roadmap — não foi re-verificada agora; item de confirmação, não de implementação nova | `09-roadmap.md:41`                                                        |
| O3  | ⚪ melhoria opcional | IDs de correlação já existem (`requestId`); métricas (contadores, latência por rota) não existem — é extensão, não item do roadmap-base da Fase 7                                                                            | análise                                                                   |

### 19.2.6 CI/CD

| #   | Classificação | Achado                                                                                                                                                                                                                         | Fonte                      |
| --- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------- |
| C1  | 🔵 comprovado | Pipeline real: `secrets-check → {backend, frontend, format}` em paralelo, cada um `needs: secrets-check`. Backend roda lint → typecheck → test unit → migrate → test:int → build, com serviço Postgres 17-alpine e healthcheck | `.github/workflows/ci.yml` |
| C2  | 🔵 comprovado | Não há etapa de E2E no CI (não existe ferramenta instalada, §19.1)                                                                                                                                                             | idem                       |
| C3  | 🔵 comprovado | Não há `npm audit` nem scanner de segredo de propósito geral no CI — a verificação de segredo é específica para `.env` versionado e para valor preenchido em `.env.example`, não um scan geral do diff                         | idem                       |
| C4  | 🔵 comprovado | `NODE_VERSION: '24.15.0'` único em todo pipeline, lido de `env`, consistente com `.nvmrc` e `engines` dos dois `package.json`                                                                                                  | idem                       |

---

## 19.3 Matriz de riscos priorizada (impacto × probabilidade)

| Risco                                                 | Impacto                                                                                    | Probabilidade                 | Severidade                         | Pendência desde                                  |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------ | ----------------------------- | ---------------------------------- | ------------------------------------------------ |
| Abort nativo Node 24/Windows em `test:int`            | Alto (mascarar falha real de CI local, afeta confiança no "verde")                         | Média-alta (histórico 10-35%) | 🔴                                 | Fase 4                                           |
| Ausência total de E2E                                 | Médio-alto (regressão de fluxo crítico não é pega por teste de unidade/integração isolado) | Certa hoje (zero E2E existe)  | 🔴                                 | Fase 1 (planejado desde o início)                |
| `Origin`/`Referer` ausente                            | Baixo (defesa redundante à `SameSite=Strict`, já avaliado)                                 | Baixa                         | 🟡                                 | Fase 6 (avaliado, não implementado)              |
| Bundle único de 1,2 MB sem code-splitting             | Médio (tempo de carregamento inicial, mais perceptível em rede lenta)                      | Certa (medido)                | 🟡                                 | Fase 3 (3,2× maior já registrado)                |
| Tabelas sem modo cartão fora de produtos/fornecedores | Baixo-médio (usabilidade, não corrompe dado)                                               | Média (depende da tela)       | 🟡                                 | Fases 6A-6C (novas telas herdam o padrão antigo) |
| Sem verificação de plano de consulta/índice           | Desconhecido ainda                                                                         | Desconhecida (não medido)     | ⚪ até medir                       | Nunca verificado                                 |
| S9 (movimentação durante inventário)                  | Alto em tese, mas quantificado e mitigado por sinal visível                                | Baixa, aceito provisoriamente | 🟡 (já registrado, não desta fase) | Fase 5, revisitado na Fase 6                     |
| D14 (sem idempotência)                                | Médio, aceito provisoriamente                                                              | Baixa                         | 🟡 (já registrado, não desta fase) | Fase 5                                           |
| Sem `npm audit`/scan de segredo no CI                 | Médio (depende só de execução manual, que pode ser esquecida)                              | Média                         | 🟡                                 | Desde o início do CI                             |

---

**Riscos adicionais identificados pela auditoria de código cruzada desta sessão (não estavam na matriz original):**

| Risco                                          | Impacto                                                                                                | Probabilidade                                    | Severidade | Pendência desde                         |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------ | ---------- | --------------------------------------- |
| `ProductPicker` com `aria-selected` incorreto  | Baixo-médio (usabilidade para leitor de tela, não corrompe dado)                                       | Certa (bug confirmado em código)                 | 🟡         | Marco 6C (componente novo)              |
| Ausência de `ErrorBoundary` no frontend        | Médio (erro de render não tratado quebra a tela inteira, sem recuperação)                              | Baixa (depende de erro de render não previsto)   | 🟡         | Desde o início do frontend              |
| Assimetria no tratamento de falha de auditoria | Médio (gravação de auditoria fora de transação pode falhar silenciosamente, deixando lacuna na trilha) | Baixa (exigiria falha de banco no momento exato) | 🟡         | Desde a implementação do `AuditService` |

---

## 19.4 Escopo e marcos propostos

Three incremental milestones, each implemented, reviewed and versioned separately after
your explicit authorization — exactly as every previous fase foi conduzida. A divisão abaixo
é a mesma hipótese do seu prompt (7A/7B/7C), ajustada ao que o diagnóstico encontrou e ao
escopo real do roadmap.

### Marco 7A — Qualidade de código, segurança (checklist §08) e E2E dos dois fluxos do roadmap

**Núcleo do roadmap, obrigatório.**

1. Code review próprio: duplicação, `any`, função longa, acoplamento — revisão manual guiada
   por ESLint (`no-explicit-any` já ligado?) e busca textual por `any`/funções longas.
2. `tsc --noEmit` sem erro em nenhum dos dois lados, sem supressão (`@ts-ignore`,
   `@ts-expect-error` não justificado); ESLint sem warning (hoje o CI não falha em warning,
   só em erro — decisão D7-2, §19.14).
3. Revisão de segurança item a item contra `08-seguranca.md` — não uma auditoria nova, uma
   conferência de que cada item ainda é verdade no código atual (ex.: §8.1 a §8.12).
4. Instalar Playwright (dependência nova — autorização explícita necessária, decisão D7-3) e
   escrever os **dois** fluxos do §7.5: ciclo de estoque e inventário, contra app real +
   Postgres de teste isolado, com fixture determinística e seed próprio (sem usar o seed de
   desenvolvimento).
5. Corrigir os bugs já confirmados nesta sessão de diagnóstico (não hipotéticos): S11
   (padronizar o tratamento de falha de `AuditService.record()` com `recordInTransaction()`,
   ou documentar a assimetria como intencional se houver razão) e A5 (adicionar um
   `ErrorBoundary` de topo, mínimo, sem redesenho).
6. Rodar tudo, registrar a saída real, corrigir o que for encontrado, documentar
   honestamente o que não for corrigido.

**Critério de aceite:** `tsc --noEmit` limpo nos dois lados; ESLint sem warning; os dois
fluxos E2E passando com saída de comando registrada; checklist §08 revisitado item a item com
veredito "confirmado" ou "divergência encontrada" por item.

### Marco 7B — Estabilidade, investigação do Node 24/Windows e extensão opcional de segurança

**Núcleo do roadmap (estabilidade) + extensões opcionais que dependem da sua decisão.**

1. Investigação reproduzível do abort (plano detalhado em §19.6.1) — isto é uma
   **investigação**, não uma correção garantida. Pode terminar em causa identificada e
   corrigida, em mitigação (não correção), ou em "causa não isolada, documentada como
   pendência técnica permanente" — as três saídas são aceitáveis, a terceira só não pode ser
   apresentada como "resolvido".
2. Revisão dos riscos de concorrência já aceitos (S9, D14, limite de 25 tentativas) — **sem
   alterar regra de negócio**, apenas confirmar que o comportamento documentado continua
   batendo com o código.
3. **Se autorizado** (decisão D7-1, extensão de escopo): ampliar a E2E para os fluxos
   adicionais do seu prompt (auth completo, RBAC entre papéis, cadastros, relatórios,
   auditoria).
4. **Se autorizado** (decisão D7-4): implementar o guard de `Origin`/`Referer` como defesa em
   profundidade, aceitando que seu ganho real depende de uma decisão de topologia de deploy
   que só a Fase 8 vai tomar.

**Critério de aceite:** relatório da investigação (mesmo que sem causa definitiva) com
metodologia reproduzível documentada; nenhuma regra de negócio alterada sem registro de
justificativa; itens opcionais, se autorizados, com os mesmos critérios de aceite que teriam
caso fossem núcleo.

### Marco 7C — Performance, acessibilidade, responsividade e observabilidade

**Núcleo do roadmap (performance/acessibilidade/responsividade) + observabilidade como
extensão opcional.**

1. Linha de base de performance medida (não estimada): tamanho de bundle atual (1.216 kB,
   já medido), tempo de build, `EXPLAIN ANALYZE` das consultas de listagem e do dashboard,
   contagem de requisições redundantes observada via devtools em 2-3 fluxos reais.
2. Code-splitting por rota (`React.lazy` + `Suspense`) como correção direta do P1/P2 — meta
   objetiva: chunk inicial abaixo do limite de aviso do Vite (500 kB) sem quebrar nenhuma
   rota.
3. Acessibilidade: revisão com `axe-core`/Lighthouse nas telas principais; navegação por
   teclado manual em formulários e modais; contraste AA nos tokens de tema atuais (conferir,
   não redesenhar); corrigir o bug confirmado A4 (`aria-selected` incorreto no
   `ProductPicker`).
4. Responsividade tela por tela em 375/768/1440px, incluindo decisão explícita (manter
   rolagem horizontal, ou estender `renderCard`) para cada tabela sem modo cartão hoje
   (categorias, movimentações, inventários, relatórios, usuários, auditoria) — decisão D7-5.
5. **Se autorizado** (decisão D7-6, extensão opcional): observabilidade adicional (métricas,
   não serviço pago) dentro do que já existe (Pino, `requestId`).

**Critério de aceite:** bundle inicial medido abaixo da meta definida na decisão D7-7;
checklist de acessibilidade com veredito por tela; responsividade confirmada ou corrigida
tela por tela, com decisão registrada por tabela.

---

## 19.5 Plano de testes E2E — detalhado

### 19.5.1 Infraestrutura (comum aos dois escopos, mínimo e ampliado)

- Playwright, rodando contra o frontend real servido pelo Vite e o backend real, com um
  banco Postgres de teste **isolado do de desenvolvimento e do de integração do backend**
  (`stockflow_e2e`, por exemplo) — nunca o `stockflow_test` usado pelo `test:int`, para que as
  duas suítes não disputem o mesmo schema se rodarem em paralelo algum dia.
- Fixture determinística: seed próprio do E2E (usuários de cada papel, produtos com saldo
  conhecido), nunca o seed de desenvolvimento, nunca dado "parecendo real" apresentado como
  se fosse.
- Isolamento entre testes: cada teste cria seus próprios dados (produto novo por teste, por
  exemplo) ou o banco é truncado e re-semeado entre arquivos — a decisão específica depende
  de medir o custo de truncar vs. o risco de um teste vazar estado para o outro; será
  decidida na implementação do 7A com a métrica real de tempo, não antes.
- Limpeza seedura do banco: nenhuma execução de E2E aponta para `DATABASE_URL` de produção —
  o schema de ambiente já recusa subir sem as variáveis certas (§8.8); a suíte E2E herda essa
  proteção.

### 19.5.2 Escopo mínimo aprovado (§7.5 do roadmap) — Marco 7A

**Fluxo 1 — ciclo de estoque** (login OPERATOR → dashboard real → cria produto → entrada 50
→ saída 20 → histórico com 2 movimentações na ordem certa → tenta saída de 100 → mensagem de
estoque insuficiente, saldo permanece 30).

**Fluxo 2 — inventário** (login MANAGER → abre inventário com 3 produtos → conta uma acima,
uma abaixo, uma igual → divergências calculadas na tela → aprova → saldos refletem os
ajustes → histórico de cada produto mostra o ajuste vinculado → inventário aparece `APPROVED`
com responsável).

### 19.5.3 Extensão proposta (requer decisão D7-1) — possível Marco 7B

Caso autorizada, a ordem de prioridade dentro da extensão (do mais crítico ao mais opcional,
para que um corte de tempo saiba onde parar):

1. Autenticação: login válido/inválido, sessão restaurada após reload, logout, RBAC 403 em
   ao menos um endpoint por papel negado (reaproveitando a matriz já testada em integração,
   agora pela interface).
2. Ciclo de cadastro: categoria → fornecedor → produto, com filtro e paginação na listagem.
3. Relatórios e auditoria: um indicador do dashboard bate com um movimento real criado no
   próprio teste; evento de auditoria aparece após uma ação real.

Cada um destes, se autorizado, seguiria o mesmo rigor de fixture/isolamento do item 19.5.1 —
nenhum dado fictício será apresentado como dado real da aplicação.

---

## 19.6 Plano de segurança e estabilidade

### 19.6.1 Investigação do abort Node 24/Windows — metodologia proposta

Achado-chave já confirmado (§19.2.2, E1): o abort ocorre mesmo com `maxWorkers: 1` e
`fileParallelism: false`, o que descarta "disputa entre workers em paralelo" como causa
isolada. A investigação proposta, em ordem (parar na primeira que isolar a causa):

1. **Reduzir a superfície:** reproduzir com um subconjunto cada vez menor da suíte
   (arquivo por arquivo) até achar se o abort é generalizado ou concentrado em um módulo
   específico (ex.: o relatório da Fase 4 já apontou `rbac.int-spec.ts` como o arquivo onde
   ocorreu da última vez — não é garantido que seja sempre o mesmo, isso também é parte do
   que a investigação precisa confirmar ou refutar).
2. **Isolar runtime vs. aplicação:** reproduzir o abort num script Node puro, sem NestJS, que
   apenas abre e fecha conexões HTTP/Postgres em sequência — o relatório da Fase 4 já
   registrou tê-lo reproduzido "num script Node bare, com zero código do projeto"; esta fase
   confirma se isso ainda é verdade na versão atual do Node (`24.15.0`, fixada desde então) ou
   se mudou.
3. **Instrumentar o encerramento:** usar `--trace-warnings` e inspecionar handles abertos
   (`process._getActiveHandles()` em modo de diagnóstico, não em produção) no momento do
   encerramento do processo de teste, para checar conexão HTTP ou do Prisma não finalizada.
4. **Testar a hipótese do `PrismaService` lifecycle:** confirmar se `onModuleDestroy`/
   `$disconnect` é aguardado antes do processo do Vitest finalizar, e se há uma janela de
   corrida entre o fechamento do pool de conexão e o encerramento do worker do Node.
5. **Registrar o resultado, qualquer que seja ele.** Se a causa não for isolada dentro do
   tempo razoável desta fase, o relatório final diz isso explicitamente — "investigado,
   causa não isolada, mitigação aplicada: X" ou "investigado, sem mitigação viável
   identificada" — nunca "corrigido" sem uma reprodução que comprove.

**Não será proposto** retry automático como substituto da correção (instrução explícita sua,
respeitada). Se um retry for sugerido em algum momento, será como paliativo declarado
explicitamente como tal, nunca como fechamento do risco.

### 19.6.2 Auditoria de segurança — checklist (núcleo §08, reconfirmação, não reinvenção)

| Item do checklist §08                       | Ação na Fase 7                                                                                                                                 |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| §8.1 Senhas                                 | Reconfirmar parâmetros Argon2id no código atual, sem alterar                                                                                   |
| §8.2 Tokens e sessão                        | Reconfirmar atributos do cookie, TTLs, rotação — já lido nesta sessão (`refresh-cookie.ts`), repetir a leitura no momento da execução do marco |
| §8.3 Autorização                            | Reconfirmar ordem dos guards globais, testar RBAC pela interface se a extensão E2E (D7-1) for aprovada                                         |
| §8.4 Validação de entrada                   | Spot-check em DTOs novos desde a Fase 6C (movimentações, inventários, usuários) — ainda não revisados sob esta ótica                           |
| §8.5 Banco de dados                         | Reconfirmar que não há novo ponto de `$queryRaw` fora dos dois já auditados                                                                    |
| §8.6 Transporte e cabeçalhos                | Reconfirmar Helmet/CORS no código atual                                                                                                        |
| §8.7 Rate limiting                          | Reconfirmar limites reais batem com o documentado (já feito nesta sessão de diagnóstico, repetir na execução)                                  |
| §8.8 Segredos                               | Reconfirmar que nenhum novo default de segredo entrou desde a Fase 6                                                                           |
| §8.9 Logs e auditoria                       | Reconfirmar redação em qualquer DTO novo (ex.: `users`)                                                                                        |
| §8.11/§8.12 Fora de escopo e riscos aceitos | Reafirmar a lista, sem fechar nenhum item silenciosamente                                                                                      |

### 19.6.3 Extensão opcional de segurança (decisão D7-4)

Guard de `Origin`/`Referer` nos dois endpoints de cookie — implementação de baixo custo já
desenhada em `18-plano-fase-6.md §18.7.4`, mas cujo ganho real depende da topologia de deploy
da Fase 8 (ainda não decidida). Recomendação deste plano: **esperar a Fase 8**, pelos mesmos
motivos já registrados — implementar agora é defesa em profundidade sem fechar uma lacuna
hoje aberta, e pode precisar de ajuste quando a topologia for decidida. Se você preferir
implementar já, é uma mudança pequena e isolada, cabe no Marco 7B.

---

## 19.7 Plano de performance — métricas e critérios objetivos

| Métrica                                      | Linha de base medida nesta sessão | Meta proposta                                                                                                                                                                                                                                   | Como medir (comando)                                                           |
| -------------------------------------------- | --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Tamanho do chunk principal (gzip)            | 357,75 kB                         | Reduzir para abaixo do limite de aviso do Vite (500 kB **não-gzip**, ou seja, já estamos sob o gzip; a meta real é eliminar o aviso, que é sobre o tamanho não comprimido de 1.216 kB) → meta: nenhum chunk individual acima de 500 kB não-gzip | `npm run build` (saída já imprime o aviso)                                     |
| Rotas com code-splitting                     | 0 de ~20                          | 100% das rotas de página (não dos componentes compartilhados)                                                                                                                                                                                   | contagem de `lazy(` em `router.tsx`                                            |
| Consultas de listagem com `EXPLAIN` revisado | 0 (não medido ainda)              | 100% das listagens paginadas (produtos, movimentações, relatórios) com plano de consulta documentado                                                                                                                                            | `EXPLAIN ANALYZE` manual, registrado no relatório final, não como script de CI |
| Requisições redundantes por fluxo            | não medido ainda                  | medir antes de propor correção — sem meta numérica até a linha de base existir, para não propor "ganho" sem dado                                                                                                                                | Network tab do devtools em 2-3 fluxos reais                                    |

**Nenhuma estimativa de ganho será apresentada como resultado medido.** Toda melhoria entra
no relatório final com o número antes e depois, ou como "não medido" se não houver tempo de
medir.

---

## 19.8 Plano de acessibilidade e UX (WCAG 2.2, nível AA quando aplicável)

| Área                         | Ação                                                                                                                                                                |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Navegação por teclado        | Percorrer manualmente formulários, menus e a sidebar com Tab/Shift+Tab/Enter/Escape em cada tela nova desde a Fase 6                                                |
| Foco em modais               | Confirmar `ConfirmDialog` e `Select` capturam e devolvem foco corretamente (já testado em componente na Fase 3 — reconfirmar, não redesenhar)                       |
| Rótulos de campo             | Spot-check nos formulários novos (movimentações, inventário, usuários) — já usam `FormField`, que amarra `label`/`id`; confirmar que nenhum campo escapou do padrão |
| Mensagens de erro acessíveis | Confirmar `role="alert"` nas mensagens de erro de formulário (padrão já usado, ex. `UserDetailPage.tsx`)                                                            |
| Contraste                    | Ferramenta automatizada (axe/Lighthouse) nos tokens de tema atuais — **sem redesenho**, só correção pontual se algo falhar AA                                       |
| Estados de carregamento      | Já existe skeleton em todas as telas (critério da Fase 6); reconfirmar, não recriar                                                                                 |
| Leitores de tela             | Teste manual com um leitor de tela (NVDA, já que o ambiente é Windows) em pelo menos um fluxo completo                                                              |
| Movimento reduzido           | Confirmar se alguma animação (toast, skeleton) respeita `prefers-reduced-motion` — se não, é correção pequena e pontual                                             |
| Responsividade               | 375/768/1440px, tela por tela, com decisão explícita por tabela sem `renderCard` (§19.2.4, A1) — ver decisão D7-5                                                   |

---

## 19.9 Estratégia de observabilidade

**Núcleo (reconfirmação, já existe):** Pino estruturado com redação, `requestId` por
requisição presente em log e resposta de erro, 5xx registra stack no log mas resposta
genérica ao cliente.

**Extensão proposta, só com autorização (D7-6):** contadores simples de requisição/latência
por rota, expostos apenas internamente (sem serviço pago, sem infraestrutura nova — por
exemplo, um middleware que loga duração por rota, já que o Pino já está no lugar). Health
check (`/health/ready`, já previsto desde a Fase 2) reconfirmado funcionando, não recriado.

---

## 19.10 Estratégia de CI/CD

**Núcleo do roadmap (verificação, pequenos ajustes):**

- Confirmar que lint/typecheck/test/build continuam todos vermelhos corretamente se algo
  quebrar (não é uma mudança, é uma reconfirmação pontual).
- Adicionar o job de E2E ao workflow (`.github/workflows/ci.yml`) **somente quando o Marco
  7A estiver implementado e aprovado** — rodando Playwright contra o frontend e o backend
  reais, com o mesmo padrão de serviço Postgres isolado já usado pelo job `backend`.
- Captura de trace/screenshot em falha do Playwright (recurso nativo da ferramenta, sem
  custo de infraestrutura extra) — artefato do job, não um serviço externo novo.

**Extensão opcional (decisão D7-8):** adicionar `npm audit --omit=dev` como etapa do job
`backend`/`frontend` (hoje só roda manualmente, como nesta própria auditoria de Marco 6C).
Risco de regressão: `npm audit` pode falhar o CI por uma vulnerabilidade em dependência
transitiva fora do nosso controle — proposta: reportar sem falhar o pipeline (ou falhar só
em severidade alta/crítica), decisão sua.

**Não proposto:** matriz de SO no CI (rodar Windows) — o próprio roadmap já trata a falha do
Windows como "do runner, não de asserção", e manter o CI só em Linux evita que o pipeline
público fique vermelho por um problema de ambiente já conhecido e não sob nosso controle
total. Se a investigação da §19.6.1 encontrar causa e correção, aí sim caberia reavaliar.

---

## 19.11 Arquivos previstos para criação ou alteração (quando implementado)

**Novos (Marco 7A, núcleo):**

```
frontend/e2e/fixtures/seed.ts
frontend/e2e/stock-cycle.spec.ts
frontend/e2e/inventory-approval.spec.ts
frontend/playwright.config.ts
frontend/package.json          # adiciona @playwright/test, script test:e2e
.github/workflows/ci.yml       # novo job e2e (só após 7A aprovado)
docs/20-relatorio-fase-7.md    # relatório final, criado ao fim, não antes
```

**Possíveis alterações (correção do que o code review encontrar, âmbito desconhecido até a
execução — não é possível listar arquivo por arquivo antes de revisar):** arquivos com `any`,
função longa ou acoplamento identificados durante o code review do Marco 7A.

**Marco 7C (se aprovado o code-splitting):** `frontend/src/router.tsx` (troca de import
estático por `lazy()` nas rotas de página), possivelmente `frontend/src/features/dashboard/`
se o Recharts entrar no split.

**Nenhuma migration, nenhum arquivo de schema do Prisma, nenhuma mudança de regra de negócio
está prevista em nenhum marco deste plano.**

---

## 19.12 Critérios objetivos de aceite por marco

| Marco | Critério de aceite                                                                                                                                                                                                                                                                                                                          |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 7A    | `tsc --noEmit` limpo nos dois lados · ESLint sem warning · checklist §08 revisitado item a item com veredito · 2 fluxos E2E do §7.5 passando, saída de comando registrada · S11 (assimetria de auditoria) e A5 (`ErrorBoundary`) corrigidos ou documentados como aceitos · relatório do code review com o que foi e o que não foi corrigido |
| 7B    | Relatório da investigação do abort com metodologia reproduzível, qualquer que seja a conclusão · nenhuma regra de negócio alterada sem justificativa registrada · itens opcionais aprovados (se houver) implementados com o mesmo rigor do núcleo                                                                                           |
| 7C    | Bundle inicial medido, com número antes/depois · checklist de acessibilidade com veredito por tela · A4 (`aria-selected` do `ProductPicker`) corrigido · responsividade confirmada ou corrigida tela por tela com decisão registrada por tabela sem `renderCard`                                                                            |

---

## 19.13 O que fica explicitamente para a Fase 8 e 9

- Dockerfile de produção, Postgres gerenciado, deploy automático, usuário de demonstração
  (Fase 8).
- A decisão de topologia de deploy que determina o ganho real da validação de
  `Origin`/`Referer` (Fase 8) — item S6/D7-4 pode ser revisitado ali se não for implementado
  agora.
- README final, screenshots, GIF, diagramas, revisão de ADRs, preparação de entrevista
  (Fase 9).
- Qualquer item do "Pós-MVP" do roadmap (CSV, recuperação de senha, QR code, múltiplos
  depósitos, custo médio ponderado, multi-tenancy, permissões granulares) — nenhum entra em
  consideração nesta fase.

---

## 19.14 Decisões que exigem sua aprovação explícita

| #    | Decisão                                                                                                                                                                | Opções                                                                                                              | Recomendação deste plano                                                                                           |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| D7-1 | Ampliar o escopo de E2E além dos 2 fluxos do §7.5                                                                                                                      | (a) manter só os 2 fluxos do roadmap · (b) ampliar para a matriz do seu prompt, como extensão explícita do Marco 7B | Nenhuma recomendação forte — é decisão de escopo/tempo sua; tecnicamente (b) agrega valor real de regressão        |
| D7-2 | ESLint "sem warning" — hoje o CI só falha em erro                                                                                                                      | (a) manter assim · (b) mudar o CI para falhar também em warning                                                     | (b), mas é mudança de configuração de CI que merece sua aprovação explícita antes de implementar                   |
| D7-3 | Instalar Playwright (nova dependência)                                                                                                                                 | aprovar/recusar                                                                                                     | Necessário para qualquer E2E — sem isso, o núcleo da Fase 7 (§7.5) não pode ser cumprido                           |
| D7-4 | Implementar guard de `Origin`/`Referer` agora ou esperar a Fase 8 decidir a topologia                                                                                  | (a) esperar Fase 8 · (b) implementar agora como defesa em profundidade                                              | (a), pelos motivos já registrados em `18-plano-fase-6.md §18.7.6`                                                  |
| D7-5 | Tabelas sem `renderCard` (categorias, movimentações, inventários, relatórios, usuários, auditoria): estender o padrão de cartão ou manter rolagem horizontal, por tela | decisão tela por tela, após revisão manual no Marco 7C                                                              | Sem recomendação única — depende da densidade de cada tabela, melhor decidir após a revisão visual real            |
| D7-6 | Observabilidade adicional (métricas de latência/contagem)                                                                                                              | aprovar/recusar como extensão opcional do 7C                                                                        | Opcional, baixo custo, não bloqueia nada                                                                           |
| D7-7 | Meta numérica de bundle inicial                                                                                                                                        | propor um número exato (ex.: abaixo de 500 kB não-gzip por chunk)                                                   | usar o próprio limiar de aviso do Vite como meta, por ser um número já reconhecido pela ferramenta, não arbitrário |
| D7-8 | `npm audit` no CI, e se sim, com que severidade falha o pipeline                                                                                                       | (a) não adicionar agora · (b) adicionar, só reportando · (c) adicionar, falhando em alta/crítica                    | (c), mas é mudança de pipeline que merece aprovação explícita                                                      |

---

## 19.15 Resumo executivo

A Fase 6 entregou um sistema funcional ponta a ponta, mas **zero testes E2E, zero
code-splitting, uma lacuna de defesa em profundidade conhecida e não implementada (CSRF por
`Origin`), e uma instabilidade de ambiente ainda não investigada metodicamente** — nenhum
destes é novo nesta sessão; todos já estavam registrados em documentos anteriores, e este
plano apenas reconfirma cada um deles por leitura direta do código atual, sem adicionar
suposição.

O roadmap aprovado define a Fase 7 de forma mais estreita (code review, checklist de
segurança já existente, performance por plano de consulta, acessibilidade básica, E2E de
dois fluxos) do que o seu prompt de autorização sugere (matriz E2E ampla, CI com múltiplas
camadas novas, observabilidade com métricas). Este plano separa os dois com clareza: o núcleo
do roadmap é a proposta para implementação direta; cada extensão tem uma decisão numerada
(D7-1 a D7-8) esperando sua escolha explícita antes de entrar em qualquer marco.

**Esforço relativo** (não é prazo): Marco 7A é o maior — instalar e configurar Playwright do
zero custa mais que escrever os dois cenários depois de pronto; o code review e a
reconfirmação de segurança são trabalho de leitura, não de escrita. Marco 7B depende
inteiramente de quanto tempo a investigação do abort consome — pode fechar rápido com causa
isolada, ou consumir a fase inteira sem uma conclusão definitiva, e isso precisa ser aceito
como possível desde já. Marco 7C é o mais previsível em esforço: code-splitting é mecânico,
acessibilidade é checklist, responsividade é revisão visual guiada.

**Principais riscos:** (1) o abort do Node 24/Windows pode não ter causa isolável dentro do
tempo da fase — aceito como resultado possível, não como falha do plano; (2) ampliar o E2E
sem necessidade pode consumir tempo desproporcional ao ganho, por isso está como decisão
separada, não embutida; (3) qualquer extensão de CI (E2E, audit) muda o tempo total do
pipeline — será medido e relatado, não ignorado.

**Pare e aguarde minha autorização** antes de implementar qualquer item — nenhuma linha de
código, dependência ou configuração foi alterada para produzir este documento.

---

## 19.16 Marco 7A — resultados reais (implementado e validado, aguardando autorização de versionamento)

> Nenhum commit nem push foi feito. Esta seção documenta o que foi implementado e
> verificado nesta sessão, para revisão antes do versionamento.

### 19.16.1 Qualidade de código

- Code review: zero `any`, zero supressão (`@ts-ignore`/`eslint-disable`) fora de código
  gerado pelo Prisma, zero duplicação relevante.
- `tsc --noEmit`/`tsc -b --noEmit`: limpo nos dois lados.
- **D7-2 aplicado**: warnings do ESLint medidos antes da decisão — já eram zero nos dois
  lados. `--max-warnings=0` aplicado em `backend/package.json` e `frontend/package.json`
  sem precisar corrigir nada antes.

### 19.16.2 Segurança — checklist `docs/08-seguranca.md` revisitado item a item

Todos os itens §8.1 a §8.12 reconfirmados por leitura direta do código nesta sessão (Argon2id
19 MiB/t=2/p=1, rotação de refresh, `ON DELETE RESTRICT`, rate limits, validação de ambiente,
redação de log). Nenhuma divergência de comportamento encontrada.

**Clareza de prosa em §8.3** (não é bug): o texto original misturava, numa frase só, a regra
de autenticação (`@Public()`, fecha por padrão) com a regra de papel (`@Roles()` ausente =
"autenticado basta", abre por padrão, decisão deliberada). Reescrito para separar as duas
regras explicitamente, com link direto para os três testes que as provam.

**S10 — cobertura de autorização por rota**
(`backend/src/common/guards/route-authorization.spec.ts`): descobre os controllers por
**duas vias independentes que precisam coincidir**: (1) varredura do sistema de arquivos
(`src/**/*.controller.ts`, confirmando por reflexão o watermark `@Controller()` do Nest) e
(2) travessia recursiva do grafo de módulos a partir de `AppModule` (`imports` e
`controllers`). Além disso, lê os metadados na mesma precedência real dos guards
(`handler` → `ControllerClass`), detecta decorators conflitantes (`@Public()` + `@Roles()`)
e inclui testes negativos permanentes em memória (com classes sintéticas `@Controller`)
provando que novos controllers/endpoints sem política revisada, alterações de decorator ou
decorators conflitantes quebram o teste imediatamente.

**Contagem de rotas corrigida**: o relatório anterior afirmou "45 rotas" — erro de contagem
manual no resumo (ou omissão na soma manual de `/reports` [6] e `/health` [2]: 53 − 8 = 45),
não uma lacuna real de cobertura. Contagem objetiva: os 11 controllers registrados em
`src/**/*.controller.ts` e em `AppModule` declaram exatamente **53** rotas HTTP, o mesmo
número de endpoints documentados em `docs/05-api.md` (§5.2 a §5.12) e em `ROTAS_REVISADAS`.
O teste-guarda trava sobre essas contagens (`controllers === 11`, `rotasReais === 53`).

**S11 (assimetria `record()`/`recordInTransaction()`)**: investigados os 23 pontos de
chamada reais. Não é um bug — é a decisão arquitetural **D3, aprovada na Fase 5**
(`docs/17-plano-fase-5.md §17.7.3`): operações críticas de estoque (`recordInTransaction`)
abortam se a auditoria falhar; cadastros simples (`record`) engolem o erro com log. Nenhuma
mudança de código — confirmação, não correção.

**S12 (filtro de exceções)**: investigada a inversão para allowlist recomendada
anteriormente. Descoberto, ao revisar os testes existentes do filtro, que vários pontos do
código lançam exceções com mensagens livres em português que dependem do comportamento atual
de blocklist — inverter exigiria catalogar todas essas mensagens, escopo maior que o
estimado. **Não implementado.** Risco permanece documentado e mitigado reativamente (como já
era, com histórico de dois vazamentos reais pegos e corrigidos dessa forma).

### 19.16.3 Isolamento do banco E2E — prova de recusa (negativa, sem tocar banco real)

Pedido explícito da revisão: provar que o mecanismo recusa dev/integração/qualquer outro
banco antes de conectar, migrar, truncar ou executar seeds, inclusive em execução direta.

- `selectE2eDatabaseUrl` e `runGlobalSetup` (`frontend/e2e/global-setup.ts`) — 13 testes
  (`frontend/e2e/global-setup.unit.test.ts`): extrai exclusivamente o nome do banco do
  `pathname` da URL Postgres (impedindo contorno por `"e2e"` na senha, usuário, host ou query
  string), proíbe explicitamente `stockflow` e `stockflow_test`, compara tanto a URL completa
  quanto o nome do banco extraído contra `DATABASE_URL` e `DATABASE_URL_TEST`, oculta a senha
  em mensagens de erro e comprova via `runGlobalSetup` que nenhum subprocesso (`migrate`,
  `reset`, `seed`) é disparado quando a URL é recusada.
- `playwright.config.ts` valida `DATABASE_URL_E2E` via `selectE2eDatabaseUrl` no carregamento
  da configuração, **antes** do Playwright iniciar os processos de `webServer` (evitando que
  o backend sequer abra conexão com banco indevido), e usa health check HTTP real
  (`/api/v1/health/ready` no backend e URL raiz no frontend).
- `assertE2eDatabaseUrl` (`backend/scripts/e2e-reset-db.ts`) — 13 testes
  (`backend/scripts/e2e-reset-db.spec.ts`): mesma extração estrita do nome do banco no
  `pathname`, verificação contra `DATABASE_URL_TEST`, `DATABASE_URL_DEV` e
  `DATABASE_URL_E2E`, mais teste de **execução direta em subprocesso** (`tsx scripts/e2e-reset-db.ts`)
  comprovando saída com `exit code 1` antes de tentar abrir conexão TCP.

**Limitações residuais do isolamento (sem declaração de isolamento absoluto)**:

1. A validação compara tanto a string completa quanto o nome do banco extraído do `pathname`,
   o que bloqueia URLs que apontem para o mesmo nome de banco usando hosts (`localhost` vs
   `127.0.0.1`), portas (`5432` vs túnel/porta mapeada) ou query strings diferentes. Porém,
   por ser uma inspeção sintática sem abrir conexão, ela não consegue detectar se dois nomes
   de banco _distintos_ na URL (por exemplo, um alias de PgBouncer/pooler externo) apontam
   para o mesmo banco físico no servidor, e recursará conservadoramente dois servidores
   distintos que usem o mesmo nome de banco.
2. Comandos manuais fora dos pontos de entrada protegidos (`prisma migrate deploy` ou
   `prisma db seed` invocados diretamente no terminal com `DATABASE_URL` adulterada) não
   passam por `selectE2eDatabaseUrl` nem por `assertE2eDatabaseUrl`.

### 19.16.4 CI — job E2E adicionado a `.github/workflows/ci.yml`

Job novo `e2e`, `needs: [backend, frontend]` (só roda depois que lint/typecheck/build já
passaram — evita gastar o tempo mais caro do pipeline num branch já quebrado por outro
motivo). Serviço Postgres efêmero próprio (`stockflow_e2e` com `pg_isready`), instala Chromium
(`--with-deps`), roda `npm run test:e2e` (com health check HTTP `/api/v1/health/ready`,
migration + truncate + seed via `global-setup.ts`), publica trace/screenshot/relatório HTML só
em falha (`actions/upload-artifact@v4`, `if: failure()`). `retries: 0` mantido (nenhum retry
automático mascarando instabilidade). Nenhum job existente (`secrets-check`, `backend`,
`frontend`, `format`) foi alterado — confirmado por diff.

**Não declarado aprovado**: o job foi validado localmente exercitando a mesma sequência de
`global-setup.ts` e `playwright.config.ts`, mas **não foi executado no GitHub Actions de
verdade** — isso exige um push, que aguarda autorização.

### 19.16.5 Evidência de execução real (revisão final do Marco 7A)

| Verificação                                           | Resultado                                                                                                                                                                                                                                                                                 |
| ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Backend lint (`--max-warnings=0`)                     | ✅ limpo (0 erros, 0 warnings)                                                                                                                                                                                                                                                            |
| Backend typecheck (`tsc --noEmit`)                    | ✅ limpo                                                                                                                                                                                                                                                                                  |
| Backend unit (`vitest run`)                           | ✅ 18 arquivos, 219/219 testes aprovados (incluindo 13 em `e2e-reset-db.spec.ts` e 7 em `route-authorization.spec.ts`)                                                                                                                                                                    |
| Backend build (`nest build`)                          | ✅ limpo                                                                                                                                                                                                                                                                                  |
| Backend integration (`test:int`)                      | ⚠️ 1ª execução abortou com `exit code 3221226505` em `rbac.int-spec.ts` (419/461); 2ª execução passou 17/17 arquivos, 461/461 testes (76,57s)                                                                                                                                             |
| Frontend lint (`--max-warnings=0`)                    | ✅ limpo (0 erros, 0 warnings)                                                                                                                                                                                                                                                            |
| Frontend typecheck (`tsc -b --noEmit`)                | ✅ limpo                                                                                                                                                                                                                                                                                  |
| Frontend unit (`vitest run`)                          | ✅ 36 arquivos, 257/257 testes aprovados (incluindo 13 em `global-setup.unit.test.ts`, 7 em `ProductPicker.test.tsx`, 2 em `ErrorBoundary.test.tsx`)                                                                                                                                      |
| Frontend build (`vite build`)                         | ✅ limpo (bundle 1.217,44 kB / 358,25 kB gzip — code-splitting é escopo do Marco 7C)                                                                                                                                                                                                      |
| E2E Playwright (2 fluxos em Chromium)                 | ✅ 2/2 aprovados em duas execuções consecutivas (26,0s e 24,9s)                                                                                                                                                                                                                           |
| Prettier (`npm run format:check`)                     | ✅ limpo (`All matched files use Prettier code style!`)                                                                                                                                                                                                                                   |
| `npm audit --omit=dev` (produção: backend e frontend) | ✅ 0 vulnerabilidades nos dois pacotes e na raiz                                                                                                                                                                                                                                          |
| `npm audit` (incluindo `devDependencies`)             | ⚠️ 13 avisos `moderate` em `backend` e `frontend` (`GHSA-g3hv-75wg-m249` em `minimatch <11.0.1`, transitiva de `eslint`/`typescript-eslint`/`@nestjs/cli`; 0 em dependências de produção; correção automática sugerida pelo npm faria downgrade breaking de `eslint`/`typescript-eslint`) |
| Varredura de segredos e `.env.example`                | ✅ nenhum `.env` versionado, nenhuma chave sensível preenchida em `.env.example`, nenhum segredo exposto                                                                                                                                                                                  |

### 19.16.6 Arquivos alterados neste marco

30 arquivos no total: 16 modificados e 14 novos (não rastreados). Nenhuma migration de
negócio, nenhuma mudança de regra transacional de estoque.

### 19.16.7 Pendências — explicitamente não resolvidas, não apresentadas como resolvidas

- **Node 24/Windows (`exit code 3221226505`)** — instabilidade nativa do worker em `test:int`
  continua presente (1 abort em 2 execuções na revisão final; 5 aborts em 7 execuções na
  sessão anterior). Investigação estruturada é escopo do Marco 7B (§19.6.1).
- **Advisory `GHSA-g3hv-75wg-m249` (`minimatch <11.0.1`, severidade `moderate`)** — afeta
  apenas ferramentas de desenvolvimento (`eslint`, `typescript-eslint`, `@nestjs/cli`);
  `npm audit --omit=dev` tem 0 vulnerabilidades. Resolver sem `--force` (que faria downgrade
  breaking) depende de atualização upstream do `typescript-eslint`/`eslint` ou `overrides`
  avaliado com autorização.
- **S12** — filtro global de exceções (`AllExceptionsFilter`) continua baseado em
  blocklist, não allowlist. Mitigado reativamente, não preventivamente.
- **S11** — diferença intencional (D3, Fase 5) entre auditoria _best-effort_
  (`record()`) e transacional (`recordInTransaction()`). Documentada, não é um risco a
  fechar.
- **CSRF / `Origin`/`Referer`** (D7-4) — decisão adiada para quando a topologia de deploy da
  Fase 8 for conhecida, conforme já registrado.
- **D7-1, D7-5, D7-6, D7-7, D7-8** — todos adiados conforme aprovado, nenhum tocado.
- **Job de E2E no CI** — configurado e validado localmente, mas **não confirmado em execução
  real do GitHub Actions**. Essa confirmação só existe depois de um push autorizado.
- Acessibilidade sistemática (axe/Lighthouse), performance (code-splitting, baseline de
  bundle) e responsividade — escopo do Marco 7C, nada antecipado.

**Aguardando autorização explícita para commit e push.** Nenhuma ação de versionamento foi
tomada.
