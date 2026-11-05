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

## 19.16 Marco 7A — resultados reais (concluído, publicado em `origin/main` no commit `3c9f052` e aprovado no CI)

> **Status atualizado em 2026-11-05:** O Marco 7A foi oficialmente versionado e publicado em
> `origin/main` na sequência de commits `064cfbb..fa6fc47`, seguido do commit corretivo de CI
> `3c9f052` (`fix(ci): configure frontend api base for playwright e2e`, que adicionou
> `VITE_API_URL=/api/v1` no job `e2e` do GitHub Actions e em `frontend/playwright.config.ts`,
> além de diagnóstico explícito em `uiLogin`). A execução CI #12 do commit `3c9f052` no GitHub
> Actions foi confirmada 100% verde em todos os 5 jobs (`secrets-check`, `backend`, `frontend`,
> `format` e `e2e`). O registro original da implementação é preservado integralmente abaixo.

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
- **Job de E2E no CI** — configurado e validado localmente, e posteriormente **confirmado 100%
  verde no GitHub Actions** no commit `3c9f052` (CI #12), após a adição de
  `VITE_API_URL=/api/v1` no workflow e no `playwright.config.ts`.
- Acessibilidade sistemática (axe/Lighthouse), performance (code-splitting, baseline de
  bundle) e responsividade — escopo do Marco 7C, nada antecipado.

**Marco 7A oficialmente encerrado no commit `3c9f052`.**

---

## 19.17 Planejamento técnico detalhado do Marco 7B — Estabilidade, Segurança e Robustez

> **Histórico de aprovação (2026-11-05):** Planejamento revisado e aprovado pelo responsável com as
> decisões **D7B-1: Opção A** (aceitar temporariamente e documentar os 13 avisos `moderate` de
> `minimatch` em `devDependencies`, sem `overrides` cross-major e sem `npm audit fix --force`) e
> **D7B-2: Opção A** (escopo completo do Marco 7B: `M7B-1`, `M7B-2`, `M7B-3` e `M7B-4`), incorporando
> os 7 ajustes obrigatórios do plano registrados abaixo.

### 19.17.1 Estado inicial verificado

| Item                     | Valor verificado                                                                                                  |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------- |
| Diretório                | `C:\Users\pedro\Desktop\dev\stockflow`                                                                            |
| Branch / `HEAD`          | `main` / `3c9f052` (`3c9f05242f7113a64ab57a4992d01c0c1148e3c5`)                                                   |
| Sincronização `origin`   | `0 ahead / 0 behind` em relação a `origin/main`                                                                   |
| CI do `HEAD` (`3c9f052`) | 100% verde no GitHub Actions (`secrets-check`, `backend`, `frontend`, `format`, `e2e`)                            |
| Runtime local            | Node.js `v24.15.0` (Windows_NT 10.0.26200 x64), npm `11.12.1`                                                     |
| Test runner / ORM        | `vitest@5.0.5`, `prisma@7.10.1`, `@prisma/adapter-pg@7.10.1`, `pg@8.20.0`                                         |
| Migrations aplicadas     | 3 (`20261017071012_init`, `20261027000000_phase5a_stock_integrity`, `20261028000000_phase5b_inventory_integrity`) |

---

### 19.17.2 Prioridade P0 — Diagnóstico da instabilidade do Vitest em Node 24/Windows (`exit code 3221226505` / `0xC0000409`)

#### 1. Ambiente, versões e binários nativos

- **Runtime local**: `node.exe` `v24.15.0` (linha _Current_, V8 13.6, `libuv 1.51.0`, UCRT do
  Windows 11 build 26200).
- **Addons nativos `.node` carregados em `backend/node_modules`**:
  - `@node-rs/argon2-win32-x64-msvc` (`2.0.5`) — hash/verificação Argon2id (19 MiB, $t=2$, $p=1$).
  - `@swc/core-win32-x64-msvc` (`1.15.3`, via `unplugin-swc@1.5.9`) — transpilação TS e metadados
    de decorators nos workers.
  - `@rolldown/binding-win32-x64-msvc` e `lightningcss-win32-x64-msvc` — internos do Vite/Vitest.
- **Driver de banco**: `@prisma/adapter-pg@7.10.1` + `pg@8.20.0` (JavaScript puro sobre
  `node:net` / `node:tls`, sem binário Rust de query engine no runtime dos testes).

#### 2. Natureza do código de saída, momento da falha e enquadramento como hipótese técnica

- `3221226505` (inteiro sem sinal de 32 bits) corresponde exatamente a **`0xC0000409`**
  (`STATUS_STACK_BUFFER_OVERRUN` / `__fastfail(FAST_FAIL_FATAL_APP_EXIT)` no UCRT do Windows).
- Pela inspeção do código do `PoolRunner` do Vitest 5.0.5
  (`backend/node_modules/vitest/dist/chunks/index.1TqnEahn.js:5384-5390`), a mensagem emitida em
  todas as ocorrências históricas (`Worker exited unexpectedly with exit code 3221226505 during
STARTED state while running test file ...`) comprova que o abort ocorre **no meio da execução do
  arquivo de teste (`RunnerState.STARTED`)**, e **não** durante `RunnerState.STOPPING` (teardown
  do worker).
- Na bisseção realizada na Fase 4 (`docs/16-relatorio-fase-4.md §16.7`), o mesmo `0xC0000409`
  foi reproduzido no Windows em um script Node `24.15.0` mínimo utilizando **apenas `node:http`**
  (`http.createServer` + centenas de requisições loopback em `127.0.0.1` + `server.close()`), sem
  Vitest, sem SWC, sem NestJS, sem Prisma e sem `@node-rs/argon2`. No CI Linux (`ubuntu-latest`,
  Node 24), a taxa de ocorrência é **0%** em todas as execuções do projeto.
- **Ajuste obrigatório #1 (Hipótese técnica vs. causa raiz comprovada)**: Na ausência de um crash
  dump nativo simbolizado do `node.exe` (`WER LocalDumps` / pilha C++ do `libuv` / `ntdll`), a
  relação entre `0xC0000409`, `libuv`, reciclagem de sockets loopback e o runtime Node 24 no
  Windows deve ser tratada estritamente como **hipótese técnica fundamentada em evidências
  indiretas**, e **não** como causa raiz definitivamente comprovada.

#### 3. Amplificadores estruturais identificados na suíte de integração (`backend/test/`)

A leitura direta de `backend/test/helpers/app.ts`, `backend/src/auth/auth.service.ts` e das 17
suítes `.int-spec.ts` revelou fatores que aumentavam desnecessariamente o custo de preparação de
cenários (`beforeEach`) e o volume de operações nativas/HTTP por execução:

1. **Amplificador P0-A — Custo de `POST /api/v1/auth/login` e `Argon2id.verify()` em `createSession`
   (`backend/test/helpers/app.ts:184-192`)**:
   - Embora `createUser(prisma, role)` já memorizasse o hash Argon2id de `TEST_PASSWORD` uma vez
     por processo (`hashDaSenhaDeTeste()`, linhas 116–122), `createSession(app, prisma, role)`
     invocava `login(app, user)` (`POST /api/v1/auth/login`).
   - Cada chamada a `login(app, user)` abria uma requisição HTTP loopback via `supertest`,
     executava `AuthService.login()` — que chama `verify(user.passwordHash, password)` no addon
     nativo `@node-rs/argon2` (alocando 19 MiB por verificação) — e realizava 3 escritas adicionais
     no banco (`refresh_tokens`, `users.lastLoginAt` e `audit_logs` com `LOGIN_SUCCESS`).
   - A contagem exata nas 17 suítes de integração mostra **~894 chamadas a `createSession` por
     execução completa de `npm run test:int`** (sendo ~489 apenas em `rbac.int-spec.ts`, 108 em
     `stock-movements.int-spec.ts`, 87 em `inventories.int-spec.ts`, 54 em `catalog.int-spec.ts`,
     34 em `audit.int-spec.ts`, 30 em `users.int-spec.ts`, 24 em `reports.int-spec.ts`, 20 em
     `not-found.int-spec.ts`, 16 em `security.int-spec.ts`, 14 em `atomicity.int-spec.ts`, 10 em
     `duplicates.int-spec.ts` e 8 em `concurrency.int-spec.ts`). Isso representava **~894
     verificações nativas Argon2id (~17 GiB de alocação acumulada)**, **~894 requisições HTTP
     loopback** e **~2.682 escritas extras no PostgreSQL** apenas para preparar fixtures.
   - **Ajustes obrigatórios #2 e #3 (Mapeamento dos testes que dependem de login HTTP real e uso
     de JWT direto apenas como fixture)**:
     - **`auth.int-spec.ts` (29 testes)**: **não** utiliza `createSession`; todos os 29 testes
       chamam `createUser` + `login(app, user)` ou `POST /api/v1/auth/login` diretamente, cobrindo
       100% do fluxo HTTP de login, verificação Argon2id, cookies `HttpOnly`, rotação e detecção
       de reúso de refresh token, logout e `/auth/me`.
     - **`security.int-spec.ts`**: todos os testes de força bruta, rate limit, tamanho de payload e
       credenciais inválidas chamam `POST /api/v1/auth/login` diretamente.
     - **`users.int-spec.ts`**: todos os testes de login após troca de senha, bloqueio de usuário
       inativo e revogação de refresh token na troca de papel (linhas 235, 287, 308, 334, 372, 388,
       421, 422, 460) já chamam `login(app, usuario)` diretamente.
     - **`audit.int-spec.ts` e `rbac.int-spec.ts`**: em todo o repositório, apenas **2 testes**
       chamavam `createSession` e liam `sessao.refreshCookie`: `audit.int-spec.ts:312` (`it('logout')`)
       e `rbac.int-spec.ts:479` (`it('mas a renovação com o papel novo fecha a janela')`). Ambos
       foram ajustados para chamar explicitamente `createUser` + `login(app, usuario)`, exatamente
       como os testes vizinhos nos mesmos blocos `describe`.
     - Nos demais casos, `createSession` atua estritamente como **fixture de preparação de
       cenário**: cria o usuário no banco (com `passwordHash` Argon2id real) e emite o `accessToken`
       via `app.get(TokenService).signAccessToken(user.id, user.role).token`. Todas as requisições
       subsequentes continuam atravessando integralmente o pipeline HTTP real (`JwtAuthGuard`,
       `JwtStrategy` e `RolesGuard`).
2. **Amplificador P0-B — Fechamento seguro de conexões HTTP em `createTestApp().close()`
   (`backend/test/helpers/app.ts:68-80` — Ajuste obrigatório #4)**:
   - **Avaliação de risco de `closeAllConnections()`**: No `http.Server` do Node.js,
     `server.closeAllConnections()` encerra imediatamente tanto conexões ociosas quanto conexões
     ativas; se fosse chamado enquanto uma requisição ainda estivesse em execução, poderia abortar
     requisições em voo. Já `server.closeIdleConnections()` encerra exclusivamente conexões
     keep-alive ociosas (sem requisição em andamento).
   - **Uso seguro somente no teardown (`afterAll`)**: Em `createTestApp().close()` (invocado
     exclusivamente em `afterAll`), chamamos primeiro `server.closeIdleConnections?.()` antes de
     `await app.close()` (permitindo que `app.close()` drene qualquer trabalho residual e execute
     `onModuleDestroy` / `PrismaService.$disconnect()` sem interromper requisições em voo) e
     invocamos `server.closeAllConnections?.()` **somente após** a conclusão de `await app.close()`,
     garantindo que nenhum descritor residual permaneça aberto entre os arquivos da suíte.

#### 4. Limitações conhecidas e postura técnica (Ajuste obrigatório #7)

- A redução do custo de `createSession` e o endurecimento do teardown reduzem substancialmente o
  tempo da suíte e o volume de trabalho nativo/loopback por execução, mas **não eliminam a causa
  subjacente no runtime Node 24/Windows**.
- Nenhuma amostra finita de execuções permite declarar a instabilidade "resolvida". Os resultados
  empíricos reais da Subetapa 7B.1 (incluindo o tempo de cada rodada, a ocorrência de abort na 4ª
  execução e o risco residual) estão documentados integralmente na `§19.17.10`.

---

### 19.17.3 Prioridade P1 — Auditoria de segurança de dependências (`npm audit`)

#### 1. Diagnóstico completo dos 13 alertas `moderate`

| Escopo                                   | Comando                | Resultado                                                               |
| ---------------------------------------- | ---------------------- | ----------------------------------------------------------------------- |
| Produção (raiz, `backend`, `frontend`)   | `npm audit --omit=dev` | **0 vulnerabilidades** (`found 0 vulnerabilities` nas 3 árvores)        |
| Desenvolvimento (`backend` + `frontend`) | `npm audit`            | **13 alertas `moderate`** (8 em `backend`, 5 em `frontend`), 1 advisory |

- **Advisory único**: `GHSA-g3hv-75wg-m249` / `CVE-2026-118764` — _Denial of Service via
  Globparts Pattern Amplification_ no pacote `minimatch` (`< 11.0.1`), na função
  `firstPhasePreProcess()` quando `optimizationLevel >= 2` (o padrão é `1`) diante de padrões
  glob maliciosos com segmentos `**/..` profundamente aninhados.
- **Versão instalada**: `minimatch@10.2.6` (`"dev": true` em `backend/package-lock.json:6799` e
  `frontend/package-lock.json:5462`; ausente na raiz).
- **Cadeia de dependências (`npm ls minimatch`)**:
  - `backend`: `@nestjs/cli@12.0.8` → `minimatch@10.2.6`; `eslint@10.13.0`
    (`@eslint/config-array@0.23.5`) → `minimatch@10.2.6`; `typescript-eslint@8.71.2`
    (`@typescript-eslint/typescript-estree@8.71.2` e 5 pacotes irmãos `@typescript-eslint/*`) →
    `minimatch@10.2.6` (totalizando 8 nós reportados pelo `npm audit`).
  - `frontend`: `eslint@10.13.0` (`@eslint/config-array@0.23.5`) → `minimatch@10.2.6`;
    `typescript-eslint@8.71.2` (`@typescript-eslint/typescript-estree@8.71.2` e 3 pacotes irmãos)
    → `minimatch@10.2.6` (totalizando 5 nós reportados pelo `npm audit`).

#### 2. Impacto operacional real e opções técnicas

- **Exposição em produção**: **Nula (0%)**. `minimatch` é exclusivamente `devDependency`, não é
  empacotado em `backend/dist` nem em `frontend/dist` e jamais recebe dados HTTP ou entradas de
  usuários.
- **Exposição em desenvolvimento e CI**: **Desprezível**. `eslint`, `typescript-eslint` e
  `@nestjs/cli` avaliam apenas globs estáticos definidos nos arquivos de configuração versionados
  no próprio repositório (`eslint.config.mjs`, `tsconfig.json`, `nest-cli.json`), sem usar
  `optimizationLevel >= 2`.
- **Por que `npm audit fix` (sem `--force`) não aplica correção**: A correção foi lançada em
  `minimatch >= 11.0.1` (mudança de versão major `10.x → 11.x`), enquanto `eslint@10.13.0`,
  `typescript-eslint@8.71.2` e `@nestjs/cli@12.0.8` declaram faixa semver `^10.0.0` / `^10.2.2`.
  Executar `npm audit fix --force` faria downgrade disruptivo de `eslint`, `typescript-eslint` e
  `@nestjs/cli` (proibido pelas diretrizes do projeto).
- **Opções submetidas à decisão do responsável (Decisão D7B-1)**:
  - **Opção D7B-1a (Recomendada — Risco aceito e documentado em devDependencies, sem `overrides`
    forçado)**: Manter os lockfiles intactos, preservar `npm audit --omit=dev` (0
    vulnerabilidades) como critério de produção e registrar formalmente o aceite temporário de
    `GHSA-g3hv-75wg-m249` em ferramentas de lint/build até que `eslint`/`typescript-eslint`/
    `@nestjs/cli` atualizem sua faixa semver para `minimatch ^11.0.0`.
  - **Opção D7B-1b (Alternativa — `overrides` cirúrgico para `minimatch@^11.0.1` em
    `backend/package.json` e `frontend/package.json`)**: Como o `minimatch 11.0.x` manteve a
    mesma arquitetura dual ESM/CommonJS e a mesma API pública da `10.2.6` (adicionando apenas os
    tetos de segurança em `firstPhasePreProcess`), aplicar `"overrides": { "minimatch": "^11.0.1" }`
    elimina os 13 avisos `moderate` sem fazer downgrade de nenhuma ferramenta, validando em
    seguida `lint`, `typecheck`, `build` e todas as suítes de teste.

---

### 19.17.4 Prioridade P1 — Concorrência e integridade de estoque e inventário

#### 1. Revisão crítica das garantias implementadas

A inspeção linha a linha de `stock-movements.service.ts`, `stock-movements.sql.ts`,
`inventories.service.ts`, `inventories.sql.ts`, `schema.prisma` e das migrations `5A` e `5B`
confirmou que as garantias centrais do ADR-0003 e do plano da Fase 5 estão sólidas:

- **Movimentações (`IN`, `OUT`, `ADJUSTMENT`)**:
  - `applyIncrease`, `applyDecrease` e `applyAdjustment` realizam a checagem de estado
    (`is_active = true`, `current_stock >= quantity`, `current_stock <> finalQuantity`) e a
    atualização de `current_stock` na **mesma instrução SQL** dentro de transação interativa
    `ReadCommitted` (`timeout: 10_000`), retornando `stock_before` e `stock_after` diretamente do
    PostgreSQL (`RETURNING`).
  - `StockMovement` e `AuditService.recordInTransaction(tx, ...)` são gravados na mesma
    transação; falha em qualquer etapa reverte o saldo (provado em `atomicity.int-spec.ts`,
    `AT-1` a `AT-3`).
  - No banco: `CHECK (current_stock >= 0)`, `CHECK (quantity > 0)`, `CHECK (stock_after >= 0)`,
    `stock_movements_balance_coherent`, `stock_movements_type_reason_coherent` e trigger
    `stock_movements_immutable` (`SQLSTATE SF001`) impedindo `UPDATE` e `DELETE`.
- **Inventário (`open`, `recordCount`, `submit`, `approve`, `cancel`)**:
  - Exclusividade de produto em inventário não finalizado garantida no banco pelo índice único
    parcial `inventory_items_one_unfinalized_per_product` (`ON inventory_items (product_id) WHERE
in_progress`) + triggers `inventories_release_items_trigger` e
    `inventories_forbid_reopen_trigger` (`SQLSTATE SF002`) + 5 `CHECK` constraints de coerência.
  - Prevenção de deadlock: tanto o `INSERT ... SELECT FROM unnest(...) ORDER BY t.product_id` na
    abertura quanto o `SELECT ... ORDER BY ii.product_id ASC` na aprovação adquirem locks de
    produto sempre em ordem crescente de UUID.
  - Aprovação atômica (`approve`, `timeout: 30_000`): trava o cabeçalho com `UPDATE inventories
SET status = 'APPROVED' ... WHERE id = ... AND status = 'PENDING_APPROVAL' RETURNING id` (G1),
    aplica `applyInventoryDelta` por item divergente com `WHERE current_stock + delta >= 0`,
    cria `StockMovement` com `inventory_item_id` `@unique` (G2) e grava `recordInTransaction`. Se
    qualquer item resultar em saldo negativo, `throwApprovalInsufficientStock` lista todos os
    itens problemáticos e aborta a transação inteira (mantendo `PENDING_APPROVAL`).

#### 2. Achados técnicos e avaliação dos riscos documentados

1. **Lacuna de testes arquiteturais planejados na Fase 5 (`RG-6` e `G4` — `docs/17-plano-fase-5.md
§17.6.8, §17.7.3 e §17.10`)**:
   - O plano da Fase 5 especificou a criação de `backend/src/architecture.spec.ts` para garantir
     por teste automatizado que:
     - `RG-6`: `src/stock-movements/` e `src/inventories/` jamais chamem `audit.record(` (apenas
       `audit.recordInTransaction(`);
     - `G4`: apenas `InventoriesService.approve` invoque `applyInventoryDelta`;
     - Todo `$queryRaw` / `$executeRaw` de produção resida exclusivamente em arquivos `*.sql.ts`
       com tagged templates (nunca `$queryRawUnsafe` / `$executeRawUnsafe`).
   - A inspeção de `backend/src/` mostrou que `src/architecture.spec.ts` **nunca foi criado**.
     Implementá-lo no Marco 7B (Subetapa 7B.2) fecha essa lacuna sem alterar nenhuma regra de
     negócio.
2. **Comportamento no esgotamento de `MAX_CODE_ATTEMPTS = 25` na abertura de inventário
   (`backend/src/inventories/inventories.service.ts:94-142`)**:
   - Na remoção do `pg_advisory_xact_lock` na Fase 5B (`docs/17-plano-fase-5.md §17.18.1`), a
     geração de `code` (`INV-AAAA-NNNN`) passou a usar retry otimista sobre a constraint
     `inventories_code_key` (`23505`) com até `MAX_CODE_ATTEMPTS = 25` tentativas (comprovado em
     teste para 20 aberturas simultâneas). Se a 25ª tentativa colidir, o erro Prisma `P2002` é
     relançado e vira HTTP 500.
   - **Veredito**: Comportamento já documentado e aceito em `§17.18.1` (subir >25 inventários no
     mesmo milissegundo excede em ordens de grandeza a operação real de depósito). Mantido como
     **Risco aceito, com justificativa**.
3. **Riscos de negócio aceitos na Fase 5 (`D14` sem chave de idempotência em `POST /in` e
   `POST /out`; `S9`/`D18` movimentação física anterior à contagem registrada depois; `D9`
   ajuste de inventário em produto inativo)**:
   - Todos permanecem fielmente cobertos pelos testes de caracterização e integridade
     (`duplicates.int-spec.ts` `DUP-1` a `DUP-9`, `inventories.int-spec.ts` `S9` e `D9`) e pelos
     sinais operacionais (`movedSinceCount`, `movementsSinceCount`, `/reports/divergences`,
     `/reports/stock-reconciliation`). Classificados como **Risco aceito, com justificativa**, sem
     alteração de regra de negócio.

---

### 19.17.5 Prioridade P2 — Segurança e tratamento de erros

#### 1. `S11` — Assimetria entre `AuditService.record()` e `AuditService.recordInTransaction()`

- **Diagnóstico**: A diferença é deliberada (Decisão `D3` da Fase 5, testada em `AT-9` de
  `atomicity.int-spec.ts` e `audit.service.spec.ts`): `record()` é _best-effort_ para autenticação
  e cadastros (Fases 3 e 4), enquanto `recordInTransaction()` é transacional e obrigatório para
  estoque e inventário (Fase 5).
- **Lacuna encontrada**:
  1. Em `backend/src/audit/audit.service.ts`, a assinatura `record(input: RecordAuditInput)` aceita
     qualquer membro de `AuditAction`, permitindo que um desenvolvedor passe acidentalmente uma
     ação de estoque/inventário (`STOCK_MOVEMENT_CREATED`, `INVENTORY_*`) para o método
     não-transacional `record()`, que engoliria falhas silenciosamente fora da transação.
  2. Em `docs/08-seguranca.md §8.9`, o texto ainda descreve apenas o comportamento da Fase 4
     (_"Falha ao gravar auditoria é logada pelo Pino, mas não reverte a operação de negócio"_),
     omitindo `recordInTransaction()`.
- **Solução recomendada no Marco 7B**:
  - Segregar os tipos `TransactionalAuditAction` (`STOCK_MOVEMENT_CREATED` e `INVENTORY_*`) e
    `BestEffortAuditAction` em `audit.service.ts`, restringir `record()` em tempo de compilação
    (e com guarda defensiva em runtime) para recusar `TransactionalAuditAction`, adicionar o teste
    arquitetural `RG-6` em `src/architecture.spec.ts` e atualizar `docs/08-seguranca.md §8.9`.

#### 2. `S12` — `AllExceptionsFilter`: migração de blocklist (`FRAMEWORK_MESSAGES`) para allowlist estrita

- **Descoberta técnica central desta investigação**:
  - No Marco 7A (`§19.16.2`), havia sido estimado que migrar `AllExceptionsFilter` para allowlist
    seria complexo porque _"vários pontos do código lançam exceções `HttpException` com mensagens
    livres em português"_.
  - Uma varredura exaustiva em `backend/src/` (`git grep "Exception(" backend/src/`) demonstrou
    que **todos os services de domínio já lançam subclasses de `DomainError`**! Em todo o código
    de produção de `backend/src/`, existem apenas **3** instanciações de `HttpException`:
    1. `backend/src/auth/jwt.strategy.ts:46`: `throw new UnauthorizedException()` (sem mensagem
       própria — usa `STATUS_TO_MESSAGE[401]`).
    2. `backend/src/bootstrap.ts:180`: `new BadRequestException({ fields:
flattenValidationErrors(errors) })` (tratado pelo ramo `'fields' in payload`, que usa
       `STATUS_TO_MESSAGE[400]` e `details.fields`).
    3. `backend/src/common/utils/pagination.ts:29`:
       `throw new BadRequestException(\`Ordenação inválida: "${requested}". Valores aceitos: ${allowed.join(', ')}.\`)`!
- **Consequência**: `pagination.ts:29` é o **único** ponto de todo o backend que ainda lança
  `BadRequestException` com texto de negócio em vez de `DomainError`.
- **Solução recomendada no Marco 7B**:
  1. Criar `InvalidSortColumnError extends DomainError` (com `code = ErrorCode.VALIDATION_ERROR` e
     `httpStatus = HttpStatus.BAD_REQUEST`, preservando exatamente o mesmo status HTTP `400`, o
     mesmo `code: 'VALIDATION_ERROR'` e a mesma mensagem `'Ordenação inválida: "${requested}".
Valores aceitos: ...'`) e lançá-lo em `resolveSortColumn` (`pagination.ts:29`).
  2. Em `AllExceptionsFilter` (`backend/src/common/filters/all-exceptions.filter.ts`), remover a
     blocklist frágil por regex (`FRAMEWORK_MESSAGES`) e adotar **allowlist estrita**: apenas
     exceções de domínio (`isDomainError(exception)`) expõem `exception.message` no corpo da
     resposta; qualquer `HttpException` de framework/biblioteca/pipe/guard usa **sempre** a
     mensagem canônica de `STATUS_TO_MESSAGE[statusCode]` (preservando `details.fields` quando
     vier do `ValidationPipe`).
  3. Atualizar os 2 testes sintéticos de `all-exceptions.filter.spec.ts` (linhas 167–173 e
     266–272, herdados da Fase 4 antes da migração dos services para `DomainError`) e
     `pagination.spec.ts` para validar a política de allowlist.

#### 3. Validação e normalização de dados externos nos pontos de entrada (DTOs e `transform.ts`)

A inspeção completa dos 24 arquivos `*.dto.ts` e de `backend/src/common/utils/transform.ts`
revelou **três vulnerabilidades/defeitos reais de borda**:

1. **Defeito P2-V1 (Alto — HTTP 500 `INTERNAL_ERROR` e rollover silencioso em `@IsDateString()` de
   `QueryMovementsDto` e `MovementsReportQueryDto`)**:
   - **Problema e reprodução comprovada**: `QueryMovementsDto` (`dateFrom`, `dateTo`) e
     `MovementsReportQueryDto` (`dateFrom`, `dateTo`) usam `@IsDateString({})`. Por padrão no
     `class-validator` (`validator.isISO8601`), strings ISO como `'2026-W01'` (semana ISO) ou
     `'20260101'` (formato básico sem hífens) retornam **`true`** na validação, mas
     `new Date('2026-W01')` e `new Date('20260101')` no V8 retornam **`Invalid Date` (`NaN`)**!
     Ao chegar em `@prisma/adapter-pg` (`formatDateTime`), `Invalid Date` é serializado como
     `"NaN-NaN-NaN NaN:NaN:NaN"`, causando erro `22007` no PostgreSQL e resposta **HTTP 500
     `INTERNAL_ERROR`** para uma simples query string inválida do cliente! Além disso, datas de
     calendário inexistentes como `'2026-02-31'` passam em `@IsDateString({})` (`strict: false`
     por padrão) e sofrem rollover silencioso no V8 para `'2026-03-03'`.
   - **Solução**: Criar um validador dedicado `@IsIsoDateOrDateTime()` em
     `backend/src/common/utils/` (aceitando apenas `YYYY-MM-DD` estrito de calendário real ou
     datetime ISO 8601 estrito com `strict: true` + `strictSeparator: true` e verificando que
     `!Number.isNaN(new Date(value).getTime())` e que `YYYY-MM-DD` não sofreu rollover de mês/dia)
     e aplicá-lo em `QueryMovementsDto` e `MovementsReportQueryDto`.
2. **Defeito P2-V2 (Médio — `toIntValue` em `backend/src/common/utils/transform.ts:57-70` aceita
   lixo alfanumérico e trunca decimais silenciosamente)**:
   - **Problema e reprodução comprovada**: `toIntValue` chama `Number.parseInt(value, 10)` sem
     validar se a string inteira representa um inteiro. Em JavaScript,
     `Number.parseInt('10abc', 10)` retorna `10` e `Number.parseInt('15.9', 10)` retorna `15`.
     Assim, `?page=1abc`, `?limit=20xyz` ou `?days=15.9` passam por `@IsInt()` como `1`, `20` e
     `15` em vez de retornarem HTTP `400 VALIDATION_ERROR`.
   - **Solução**: Em `toIntValue`, verificar `/^-?\d+$/` sobre `value.trim()` antes do
     `Number.parseInt`; caso contrário, retornar o `value` original para que `@IsInt()` o rejeite
     com HTTP 400.
3. **Defeito P2-V3 (Baixo — Campos textuais opcionais sem `@Transform(trimValue)` em DTOs)**:
   - **Problema**: Enquanto `CreateCategoryDto`, `CreateMovementDto` e `CreateAdjustmentDto`
     higienizam strings com `@Transform(trimValue)`, os campos `OpenInventoryDto.note`,
     `CreateProductDto.description`, `CreateSupplierDto.phone`, `CreateSupplierDto.notes` e
     `QueryAuditDto.action`/`entity` não aplicam `@Transform(trimValue)`.
   - **Solução**: Adicionar `@Transform(trimValue)` nesses campos para padronizar a normalização
     de borda em todos os DTOs de entrada.

#### 4. Prevenção de regressões de autorização (`route-authorization.spec.ts`) e `Origin`/`Referer` (CSRF)

- **RBAC (`S10`)**: `backend/src/common/guards/route-authorization.spec.ts` (implementado no Marco
  7A) já audita todas as 53 rotas dos 11 controllers por dupla descoberta (`src/**/*.controller.ts`
  e grafo `AppModule`), bloqueia conflitos `@Public() + @Roles()` e possui 3 testes negativos
  permanentes em memória, complementado por `backend/test/rbac.int-spec.ts`. Nenhuma mudança
  adicional necessária.
- **`Origin`/`Referer` e CSRF (`S6` / `D7-4`)**: Mantido como **Adiável para a Fase 8**, pois a
  validação de `Origin`/`Referer` em `/api/v1/auth/refresh` e `/api/v1/auth/logout` depende da
  topologia final de deploy (mesma origem via proxy vs domínios separados), e as mitigações atuais
  (`SameSite=Strict`, `HttpOnly`, `Path=/api/v1/auth`, rotação single-use de refresh token e
  `Authorization: Bearer` obrigatório em todas as rotas mutáveis de negócio) já cobrem o modelo de
  ameaças atual.

---

### 19.17.6 Catálogo consolidado de propostas do Marco 7B (8 critérios de qualidade)

#### Item M7B-1 — Redução de churn de sockets loopback e Argon2id em `createSession` + `closeIdleConnections`/`closeAllConnections` no teardown de integração (P0)

1. **Problema observado**: O worker do Vitest em `npm run test:int` no Windows + Node `24.15.0`
   sofre abort nativo intermitente (`exit code 3221226505` / `0xC0000409`) durante a execução da
   suíte (`RunnerState.STARTED`), enquanto `createSession` executava ~894 chamadas a
   `POST /api/v1/auth/login` (~894 verificações nativas `@node-rs/argon2` de 19 MiB e ~2.682
   escritas extras no banco) apenas para preparar fixtures em `beforeEach`.
2. **Evidência / reprodução**: Histórico de execuções das Fases 4, 5 e 7A (1 abort em 2 execuções
   no Marco 7A; 3 em 7 na Fase 5B) + bisseção da Fase 4 (`docs/16-relatorio-fase-4.md §16.7`) +
   inspeção de `backend/test/helpers/app.ts:60-192` e `vitest/dist/chunks/index.1TqnEahn.js`.
3. **Severidade e impacto**: **P0 (Alta no ambiente local Windows)** — interrompe execuções locais
   de `test:int` e elevava o tempo da suíte para ~76,6s (embora não afete a produção nem o CI
   Linux).
4. **Solução recomendada (com ajustes obrigatórios #2, #3 e #4)**:
   - Em `backend/test/helpers/app.ts`:
     - Manter `createUser` com o hash Argon2id real de `TEST_PASSWORD` memorizado (`hashDaSenhaDeTeste()`).
     - Em `createSession`, usar a emissão direta de `accessToken` via
       `app.get(TokenService).signAccessToken(user.id, user.role).token` estritamente como **fixture
       de preparação de cenário**, eliminando ~892 chamadas HTTP `/api/v1/auth/login` e ~892
       verificações nativas Argon2id por rodada.
     - Preservar integralmente `login(app, user)` (`POST /api/v1/auth/login`) em todos os testes que
       verificam autenticação real, senha, rate limit, cookies e refresh token (`auth.int-spec.ts`,
       `security.int-spec.ts`, `users.int-spec.ts`, `audit.int-spec.ts` e `rbac.int-spec.ts:484`).
     - Em `createTestApp().close()` (executado exclusivamente em `afterAll`), invocar primeiro
       `server.closeIdleConnections?.()` antes de `await app.close()` e `server.closeAllConnections?.()`
       **somente após** `await app.close()`, evitando qualquer risco de encerrar requisições em voo.
   - Executar bateria controlada de medição ($N = 5$ execuções consecutivas de `npm run test:int`
     sem retries) e registrar todos os resultados reais e riscos residuais.
5. **Alternativas e trade-offs**:
   - _Alternativa 1_: Manter `createSession` fazendo `POST /api/v1/auth/login` em todos os ~894
     pontos — mantém ~17 GiB de alocação nativa Argon2id desnecessária por rodada.
   - _Alternativa 2_: Exigir troca imediata do Node local para Node 22 LTS — contorna o bug do
     runtime Node 24 no Windows, mas depende de intervenção externa no ambiente da máquina.
6. **Arquivos afetados**: `backend/test/helpers/app.ts`, `backend/test/audit.int-spec.ts` (linha 312)
   e `backend/test/rbac.int-spec.ts` (linha 479).
7. **Testes necessários para evitar regressão**: Execução completa das 17 suítes de integração
   (`461/461` testes verdes) em bateria controlada de 5 execuções consecutivas sem retries.
8. **Risco de incompatibilidade**: **Baixo** — restrito aos helpers de teste; nenhum código de
   produção é alterado.

- **Classificação**: **Obrigatório no 7B** (implementado na Subetapa `7B.1`).

---

#### Item M7B-2 — Migração de `AllExceptionsFilter` para allowlist estrita (`S12`) via `InvalidSortColumnError` (P2)

1. **Problema observado**: `AllExceptionsFilter` (`all-exceptions.filter.ts:31-38, 179-227`) usa
   uma blocklist de expressões regulares (`FRAMEWORK_MESSAGES`) para filtrar mensagens em inglês
   do NestJS/Express/`body-parser`/`ThrottlerGuard`. Qualquer mensagem futura de biblioteca ou
   middleware não prevista nas 5 regexes vaza para o cliente na resposta JSON.
2. **Evidência / reprodução**: Dois vazamentos reais já ocorreram na Fase 4 (`ThrottlerException:
Too Many Requests` e `Expected property name or '}' in JSON at position 1`), exigindo adição
   reativa de regexes em `FRAMEWORK_MESSAGES`. A varredura de `backend/src/` comprovou que
   `backend/src/common/utils/pagination.ts:29` (`resolveSortColumn`) é o **único** ponto de todo o
   backend que ainda lança `BadRequestException` com mensagem própria em vez de `DomainError`.
3. **Severidade e impacto**: **Média (Segurança / Prevenção de vazamento de informação — §8.10)**.
4. **Solução recomendada (com ajuste obrigatório #6)**:
   - Criar `InvalidSortColumnError extends DomainError` (`code = ErrorCode.VALIDATION_ERROR`,
     `httpStatus = HttpStatus.BAD_REQUEST`) e usá-lo em `resolveSortColumn` (`pagination.ts:29`),
     preservando exatamente a mesma mensagem, status `400` e código `VALIDATION_ERROR`.
   - Simplificar `AllExceptionsFilter` para **allowlist estrita**: somente `isDomainError(exception)`
     expõe `exception.message`; qualquer `HttpException` ou erro de middleware com status 4xx usa
     `STATUS_TO_MESSAGE[statusCode]` (preservando `details.fields` para erros do
     `ValidationPipe`), mantendo inalterado o contrato público de erro (`statusCode`, `code`,
     `message`, `details`, `timestamp`, `path`, `requestId`) e jamais expondo detalhes internos de
     exceções inesperadas.
5. **Alternativas e trade-offs**:
   - _Alternativa_: Manter a blocklist `FRAMEWORK_MESSAGES` e apenas adicionar novas regexes
     quando um vazamento for descoberto — rejeitada porque a conversão de `pagination.ts:29` para
     `DomainError` custa ~15 linhas e fecha a classe inteira de vulnerabilidade preventivamente.
6. **Arquivos afetados**: `backend/src/common/utils/pagination.ts`,
   `backend/src/common/utils/pagination.spec.ts`,
   `backend/src/common/filters/all-exceptions.filter.ts`,
   `backend/src/common/filters/all-exceptions.filter.spec.ts`.
7. **Testes necessários para evitar regressão**: Testes unitários em
   `all-exceptions.filter.spec.ts` comprovando que qualquer `HttpException` arbitrária (mesmo sem
   bater nas antigas regexes de `FRAMEWORK_MESSAGES`) recebe a mensagem segura de
   `STATUS_TO_MESSAGE`, enquanto `DomainError` e `InvalidSortColumnError` expõem suas mensagens em
   português; mais suíte de integração completa (`contract.int-spec.ts`, `security.int-spec.ts`).
8. **Risco de incompatibilidade**: **Muito baixo** — o contrato HTTP (`statusCode`, `code`,
   `message`, `details`) permanece 100% idêntico para todas as rotas existentes.

- **Classificação**: **Obrigatório no 7B** (Subetapa `7B.2`).

---

#### Item M7B-3 — Blindagem de `AuditService` (`S11`) e criação de `src/architecture.spec.ts` (`RG-6` e `G4`) (P1/P2)

1. **Problema observado**:
   - `AuditService.record()` aceita em sua tipagem qualquer `AuditAction`, permitindo que ações
     transacionais críticas (`STOCK_MOVEMENT_CREATED`, `INVENTORY_*`) sejam passadas por engano ao
     método _best-effort_ fora de transação.
   - O arquivo `backend/src/architecture.spec.ts` (previsto em `docs/17-plano-fase-5.md §17.6.8 G4`,
     `§17.7.3 RG-6` e `§17.10`) não foi criado na Fase 5.
   - `docs/08-seguranca.md §8.9` ainda descreve apenas o comportamento _best-effort_ da Fase 4.
2. **Evidência / reprodução**: Inspeção de `backend/src/audit/audit.service.ts:62-97`, ausência de
   `backend/src/architecture.spec.ts` e leitura de `docs/08-seguranca.md:145-153`.
3. **Severidade e impacto**: **Média (Integridade de trilha de auditoria e prevenção de regressão
   arquitetural)**.
4. **Solução recomendada**:
   - Em `backend/src/audit/audit.service.ts`: dividir `AuditAction` em tipos
     `TransactionalAuditAction` (`STOCK_MOVEMENT_CREATED` e `INVENTORY_*`) e
     `BestEffortAuditAction`, tipar `record()` para aceitar apenas `BestEffortAuditAction` (com
     guarda em runtime caso chamado via cast inseguro) e `recordInTransaction()` para exigir
     transação.
   - Criar `backend/src/architecture.spec.ts` verificando: (a) `RG-6`: `stock-movements` e
     `inventories` nunca invocam `.record(`; (b) `G4`: apenas `InventoriesService` invoca
     `applyInventoryDelta`; (c) nenhum arquivo em `backend/src/` usa `$queryRawUnsafe` ou
     `$executeRawUnsafe`, e todo `$queryRaw`/`$executeRaw` de domínio reside em `*.sql.ts`.
   - Atualizar `docs/08-seguranca.md §8.9` e `§8.5` para refletir fielmente a arquitetura atual.
5. **Alternativas e trade-offs**:
   - _Alternativa_: Confiar apenas em code review manual — inferior a uma trava de compilação +
     teste unitário que roda em <50 ms.
6. **Arquivos afetados**: `backend/src/audit/audit.service.ts`,
   `backend/src/audit/audit.service.spec.ts`, `backend/src/architecture.spec.ts` (novo),
   `docs/08-seguranca.md`.
7. **Testes necessários para evitar regressão**: Casos unitários em `audit.service.spec.ts` e
   `architecture.spec.ts` + suíte de integração `atomicity.int-spec.ts` (`AT-1` a `AT-9`).
8. **Risco de incompatibilidade**: **Nulo** — nenhuma chamada válida existente em `backend/src/`
   viola a separação (verificado nos 23 pontos de chamada).

- **Classificação**: **Obrigatório no 7B** (Subetapa `7B.2`).

---

#### Item M7B-4 — Correção de validação de datas ISO (`@IsDateString`) e inteiros (`toIntValue`) + normalização `trimValue` nos DTOs de entrada (P2)

1. **Problema observado**:
   - **P2-V1**: `@IsDateString({})` em `QueryMovementsDto` e `MovementsReportQueryDto` aceita
     strings ISO como `'2026-W01'` e `'20260101'` que geram `Invalid Date` em JavaScript e causam
     **HTTP 500 (`22007: invalid input syntax for type timestamp with time zone: "NaN-NaN-NaN..."`)**
     no PostgreSQL, além de aceitar datas inexistentes como `'2026-02-31'` (que sofrem rollover
     silencioso para `'2026-03-03'`).
   - **P2-V2**: `toIntValue` (`backend/src/common/utils/transform.ts:57-70`) usa
     `Number.parseInt(value, 10)` sem checar `/^-?\d+$/`, convertendo `'10abc'` em `10` e `'15.9'`
     em `15` em vez de recusar com HTTP 400.
   - **P2-V3**: `OpenInventoryDto.note`, `CreateProductDto.description`,
     `CreateSupplierDto.phone`/`notes` e `QueryAuditDto.action`/`entity` não aplicam
     `@Transform(trimValue)`.
2. **Evidência / reprodução**: Comprovado via execução direta de `isDateString` (`class-validator`)
   e `new Date()` no Node `24.15.0` e leitura de `@prisma/adapter-pg/dist/index.js:389-393` e
   `backend/src/common/utils/transform.ts:57-70`.
3. **Severidade e impacto**: **Média-Alta** — um parâmetro de query string malformado (`?dateFrom=20260101`
   ou `?dateFrom=2026-W01`) provoca HTTP 500 `INTERNAL_ERROR` e alerta de erro no servidor em vez
   de HTTP 400 `VALIDATION_ERROR`.
4. **Solução recomendada (com ajuste obrigatório #5)**:
   - Criar o decorator `@IsIsoDateOrDateTime()` (em `backend/src/common/utils/date.validators.ts`)
     que exige string ISO estrita (`YYYY-MM-DD` real sem rollover de calendário ou ISO 8601
     datetime com `strict: true` e `strictSeparator: true` cuja conversão por `new Date()` seja
     finita), preservando todos os formatos válidos já aceitos e os contratos públicos existentes,
     e aplicá-lo em `QueryMovementsDto` (`dateFrom`, `dateTo`) e `MovementsReportQueryDto`
     (`dateFrom`, `dateTo`).
   - Endurecer `toIntValue` em `backend/src/common/utils/transform.ts` para aceitar apenas strings
     que casem com `/^-?\d+$/` (após `trim()`), preservando o valor original caso contrário para
     que `@IsInt()` gere HTTP 400.
   - Adicionar `@Transform(trimValue)` nos campos textuais opcionais de `OpenInventoryDto`,
     `CreateProductDto`, `CreateSupplierDto` e `QueryAuditDto`.
5. **Alternativas e trade-offs**:
   - _Alternativa_: Tratar `Invalid Date` apenas dentro dos services — inferior a barrar na borda
     do DTO (`ValidationPipe`), onde todos os erros de entrada retornam `400 VALIDATION_ERROR` com
     `details.fields`.
6. **Arquivos afetados**: `backend/src/common/utils/transform.ts`,
   `backend/src/common/utils/transform.spec.ts` (novo),
   `backend/src/common/utils/date.validators.ts` (novo),
   `backend/src/common/utils/date.validators.spec.ts` (novo),
   `backend/src/stock-movements/dto/query-movements.dto.ts`,
   `backend/src/reports/dto/movements-report-query.dto.ts`,
   `backend/src/inventories/dto/open-inventory.dto.ts`,
   `backend/src/products/dto/product.dto.ts`,
   `backend/src/suppliers/dto/supplier.dto.ts`,
   `backend/src/audit/dto/query-audit.dto.ts`.
7. **Testes necessários para evitar regressão**: Testes unitários para `toIntValue` (`'10abc'`,
   `'1.5'`, `''`, `'42'`) e `@IsIsoDateOrDateTime()` cobrindo limites de calendário (`'2024-02-29'`
   bissexto válido vs `'2026-02-29'`, `'2026-02-31'`, `'2026-04-31'`), formatos sem separador/semana
   (`'2026-W01'`, `'20260101'`), fuso horário (`'2026-10-01T12:00:00Z'`, `'2026-10-01T12:00:00-03:00'`)
   e comportamento de `dateFrom`/`dateTo` em integração (`reports.int-spec.ts` e
   `stock-movements.int-spec.ts`).
8. **Risco de incompatibilidade**: **Muito baixo** — entradas válidas (`YYYY-MM-DD`, ISO 8601
   datetime completo e inteiros válidos) continuam aceitas exatamente como antes.

- **Classificação**: **Aprovado no escopo do 7B (Decisão D7B-2: Opção A — Subetapa `7B.2`)**.

---

#### Item M7B-5 — Resolução dos 13 alertas `moderate` de `minimatch` (`GHSA-g3hv-75wg-m249`) em `devDependencies` (P1)

1. **Problema observado**: `npm audit` reporta 13 ocorrências `moderate` de `GHSA-g3hv-75wg-m249`
   sobre `minimatch@10.2.6` (transitiva de `eslint@10.13.0`, `typescript-eslint@8.71.2` e
   `@nestjs/cli@12.0.8`), enquanto `npm audit --omit=dev` reporta **0 vulnerabilidades**.
2. **Evidência / reprodução**: `npm audit --omit=dev` e `npm ls minimatch` em `backend` e
   `frontend`.
3. **Severidade e impacto**: **Baixa / Nula em produção** (afeta exclusivamente ferramentas de
   lint e build local/CI sob padrões glob maliciosos com `optimizationLevel >= 2`).
4. **Decisão aprovada (D7B-1: Opção A)**:
   - Aceitar temporariamente e documentar o risco em `devDependencies`, sem aplicar `overrides`
     cross-major nem `npm audit fix --force`. Manter o acompanhamento de correções upstream e os
     resultados do `npm audit` completo e do `npm audit --omit=dev` visíveis nesta documentação.
5. **Alternativas e trade-offs**: `npm audit fix --force` causaria downgrade breaking de `eslint` e
   `typescript-eslint`; `overrides` cross-major foi descartado em favor da estabilidade dos
   lockfiles.
6. **Arquivos afetados**: Apenas `docs/19-plano-fase-7.md` (nenhum `package.json` ou lockfile
   alterado).
7. **Testes necessários para evitar regressão**: Verificação contínua de `npm audit --omit=dev`
   (0 vulnerabilidades).
8. **Risco de incompatibilidade**: **Nulo**.

- **Classificação**: **Risco aceito, com justificativa (Decisão D7B-1: Opção A)**.

---

#### Item M7B-6 — Guard de `Origin`/`Referer` em `/auth/refresh` e `/auth/logout` (`S6` / `D7-4`) e riscos de negócio da Fase 5 (`D14`, `S9`/`D18`, `D9`, `MAX_CODE_ATTEMPTS`)

1. **Problema observado**:
   - `S6` / `D7-4`: Validação adicional de `Origin`/`Referer` para endpoints que leem o cookie
     `refresh_token`.
   - `D14`, `S9`/`D18`, `D9` e `MAX_CODE_ATTEMPTS = 25`: Limites operacionais e decisões de
     domínio já estabelecidos na Fase 5.
2. **Evidência / reprodução**: Documentados em `docs/17-plano-fase-5.md §17.6.6, §17.6.7, §17.7.5,
§17.13, §17.18.1` e `docs/19-plano-fase-7.md §19.5.2, §19.13`.
3. **Severidade e impacto**: **Baixa** — já mitigados por `SameSite=Strict`, `HttpOnly`,
   `Path=/api/v1/auth`, rotação single-use de refresh token, `Authorization: Bearer` nas rotas de
   negócio e invariantes SQL/transacionais do estoque.
4. **Solução recomendada**:
   - Manter `S6`/`D7-4` (`Origin`/`Referer`) **Adiável para a Fase 8**, quando a topologia real de
     deploy (mesma origem vs origens distintas) for definida.
   - Manter `D14`, `S9`/`D18`, `D9` e `MAX_CODE_ATTEMPTS = 25` como **Risco aceito, com
     justificativa**, preservando integralmente as regras de negócio e os contratos de API.
5. **Alternativas e trade-offs**: Antecipar `Origin`/`Referer` agora exigiria assumir uma
   topologia de deploy que pode mudar na Fase 8.
6. **Arquivos afetados**: Nenhum no Marco 7B.
7. **Testes necessários para evitar regressão**: Suítes existentes (`auth.int-spec.ts`,
   `duplicates.int-spec.ts`, `inventories.int-spec.ts`).
8. **Risco de incompatibilidade**: **Nulo**.

- **Classificação**: **Adiável para a Fase 8** (`S6`/`D7-4`) e **Risco aceito, com justificativa**
  (`D14`, `S9`/`D18`, `D9`, `MAX_CODE_ATTEMPTS`).

---

### 19.17.7 Quadro-resumo de classificação das propostas do Marco 7B

| ID        | Proposta                                                                                                                    | Prioridade | Classificação                                                                   |
| --------- | --------------------------------------------------------------------------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------- |
| **M7B-1** | Mitigação de custo de `createSession` + `closeIdleConnections`/`closeAllConnections` no teardown + medição empírica ($N=5$) | **P0**     | **Obrigatório no 7B** (Concluído em `7B.1`)                                     |
| **M7B-2** | Migração de `AllExceptionsFilter` para allowlist estrita (`S12`) via `InvalidSortColumnError` em `pagination.ts`            | **P2**     | **Obrigatório no 7B** (Subetapa `7B.2`)                                         |
| **M7B-3** | Segregação de tipos/guarda em `AuditService` (`S11`), criação de `src/architecture.spec.ts` (`RG-6`/`G4`) e doc             | **P1/P2**  | **Obrigatório no 7B** (Subetapa `7B.2`)                                         |
| **M7B-4** | Validador estrito `@IsIsoDateOrDateTime()` (evita HTTP 500), endurecimento de `toIntValue` e `trimValue` em DTOs            | **P2**     | **Aprovado no 7B — Decisão D7B-2: Opção A** (Subetapa `7B.2`)                   |
| **M7B-5** | Tratamento dos 13 alertas `moderate` de `minimatch` (`GHSA-g3hv-75wg-m249`) em `devDependencies` (Decisão D7B-1)            | **P1**     | **Risco aceito, com justificativa — Decisão D7B-1: Opção A**                    |
| **M7B-6** | Validação de `Origin`/`Referer` (`S6`/`D7-4`) e limites documentados da Fase 5 (`D14`, `S9`/`D18`, `D9`)                    | **P1/P2**  | **Adiável para a Fase 8** (`S6`) / **Risco aceito, com justificativa** (Fase 5) |

---

### 19.17.8 Divisão aprovada para execução do Marco 7B e critérios objetivos de aceite

#### Subetapa 7B.1 — Estabilidade da suíte de integração no Windows (`M7B-1`)

- **Escopo**:
  - Refatorar `backend/test/helpers/app.ts` (`createSession` usando `TokenService.signAccessToken`
    como fixture de preparação de cenário e `closeIdleConnections`/`closeAllConnections` em
    `createTestApp().close()`), ajustando os 2 únicos pontos de chamada que liam
    `sessao.refreshCookie` (`audit.int-spec.ts:312` e `rbac.int-spec.ts:479`) para usar
    explicitamente `login(app, user)`.
  - Executar bateria controlada de $N = 5$ execuções consecutivas de `npm run test:int` (sem
    retries) e registrar tempos, falhas/aborts e risco residual.
- **Critério de aceite**:
  - Suíte `461/461` preservando cobertura real de autenticação e autorização; redução mensurável de
    custo e duração; registro honesto da amostra estatística e de qualquer abort observado, sem
    declarar a instabilidade do runtime como "resolvida".

#### Subetapa 7B.2 — Segurança, `AllExceptionsFilter` em allowlist, blindagem `S11` e validação de entrada (`M7B-2`, `M7B-3`, `M7B-4`)

- **Escopo**:
  - Converter `resolveSortColumn` (`pagination.ts:29`) para `InvalidSortColumnError extends
DomainError` e mudar `AllExceptionsFilter` de blocklist (`FRAMEWORK_MESSAGES`) para allowlist
    estrita (`S12`), preservando o contrato público de erro.
  - Restringir `AuditService.record()` a `BestEffortAuditAction` (`S11`), criar
    `backend/src/architecture.spec.ts` (`RG-6`, `G4` e guarda de SQL cru) e atualizar
    `docs/08-seguranca.md §8.5` e `§8.9`.
  - Implementar `@IsIsoDateOrDateTime()`, endurecer `toIntValue` em `transform.ts` e adicionar
    `@Transform(trimValue)` nos campos textuais pendentes dos DTOs (`M7B-4`), com testes unitários
    e de integração cobrindo limites de calendário, fuso horário e `dateFrom`/`dateTo`.
- **Critério de aceite**:
  - `npm test` (unitários + arquitetura), `npm run test:int` (integração), `npm run lint`,
    `npm run typecheck` e `npm run build` 100% verdes; nenhum `HttpException` genérico vaza
    mensagem interna; datas malformadas (`2026-W01`, `20260101`, `2026-02-31`) e inteiros
    malformados (`10abc`, `15.9`) retornam `400 VALIDATION_ERROR` (e nunca `500`).

#### Subetapa 7B.3 — Validação final ponta a ponta, documentação e revisão para commit/push

- **Escopo**:
  - Executar a bateria completa de verificação (`lint`, `typecheck`, `test`, `test:int`, `build`,
    `test:e2e` Playwright, `format:check`, `npm audit --omit=dev`).
  - Consolidar o relatório final do Marco 7B em `docs/19-plano-fase-7.md` e aguardar autorização
    explícita do responsável antes de qualquer commit ou push.

---

### 19.17.9 Decisões aprovadas do Marco 7B

| #         | Decisão                                                                                          | Deliberação aprovada pelo responsável (2026-11-05)                                                                                                  |
| --------- | ------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| **D7B-1** | Tratamento dos 13 alertas `moderate` de `minimatch` (`GHSA-g3hv-75wg-m249`) em `devDependencies` | **Opção A aprovada**: aceitar temporariamente e documentar o risco em `devDependencies`, sem `overrides` cross-major e sem `npm audit fix --force`. |
| **D7B-2** | Escopo de implementação do Marco 7B                                                              | **Opção A aprovada**: implementar o escopo completo (`M7B-1`, `M7B-2`, `M7B-3` e `M7B-4`) dividido nas subetapas `7B.1`, `7B.2` e `7B.3`.           |

---

### 19.17.10 Execução e resultados reais da Subetapa 7B.1 (2026-11-05)

#### 1. Baseline antes da alteração

- **Custo de sessão por execução de `npm run test:int`**:
  - ~894 chamadas a `createSession(app, prisma, role)` distribuídas em 12 das 17 suítes de
    integração (com destaque para `rbac.int-spec.ts` com ~489 chamadas, `stock-movements.int-spec.ts`
    com 108, `inventories.int-spec.ts` com 87 e `catalog.int-spec.ts` com 54).
  - Cada chamada executava `POST /api/v1/auth/login` via `supertest` + `Argon2id.verify()` nativo
    (19 MiB) + 3 escritas no PostgreSQL (`refresh_tokens`, `users.lastLoginAt`, `audit_logs`).
- **Tempo e estabilidade de referência antes da Subetapa 7B.1**:
  - Duração quando concluída sem abort no Marco 7A (`§19.16.5`, já com memoização do hash Argon2id
    em `createUser`, mas ainda executando `login` HTTP + `Argon2id.verify()` em `createSession`):
    **`76,57s`** (`rbac.int-spec.ts` levando ~15–20s). _(Nota de consistência: o patamar histórico
    anterior de ~`98s` referia-se à Fase 4 antes da memoização de `hashDaSenhaDeTeste()` em
    `createUser`; por isso, todas as comparações de ganho da Subetapa 7B.1 adotam exclusivamente o
    baseline compatível de `76,57s` do Marco 7A)._
  - Taxa histórica de abort (`exit code 3221226505` / `0xC0000409`): 1 abort em 2 execuções no
    Marco 7A (`50%`, abortando em `rbac.int-spec.ts`) e 5 aborts em 7 execuções na sessão anterior
    (`§19.16.7`).

#### 2. Alterações mínimas implementadas na Subetapa 7B.1

1. **`backend/test/helpers/app.ts`**:
   - Em `createTestApp().close()`: adicionada chamada a `server.closeIdleConnections?.()` antes de
     `await app.close()` e `server.closeAllConnections?.()` **após** `await app.close()` no
     teardown (`afterAll`), evitando qualquer interrupção de requisições em voo e garantindo
     liberação completa de sockets entre arquivos.
   - Em `createSession(app, prisma, role)`: substituída a chamada a `login(app, user)` pela emissão
     direta do `accessToken` via `app.get(TokenService).signAccessToken(user.id, user.role)` como
     fixture de preparação de cenário (`refreshCookie: ''`), mantendo o `createUser(prisma, role)`
     com `passwordHash` Argon2id real no banco e `login(app, user)` intacto para autenticação HTTP
     completa.
2. **`backend/test/audit.int-spec.ts` (linha 312) e `backend/test/rbac.int-spec.ts` (linha 479)**:
   - Os 2 únicos testes da suíte que usavam `createSession` e dependiam de `sessao.refreshCookie`
     (`it('logout')` em `audit.int-spec.ts` e `it('mas a renovação com o papel novo fecha a janela')`
     em `rbac.int-spec.ts`) passaram a chamar explicitamente `createUser` + `login(app, usuario)`,
     alinhados aos demais testes de sessão HTTP dos mesmos arquivos.
3. **Nenhum arquivo de produção (`backend/src/`, `frontend/src/`, `prisma/`, `package.json`) foi
   modificado.**

#### 3. Resultados da bateria controlada de 5 execuções consecutivas de `npm run test:int` (sem retries)

| Rodada | Arquivos aprovados | Testes aprovados | Duração total | Tempo de `rbac.int-spec.ts` | Ocorrência de `0xC0000409` (`3221226505`)                                        |
| ------ | ------------------ | ---------------- | ------------- | --------------------------- | -------------------------------------------------------------------------------- |
| **#1** | `17 / 17`          | `461 / 461`      | **`59,16s`**  | `4,20s`                     | ✅ Nenhuma (`exit code 0`)                                                       |
| **#2** | `17 / 17`          | `461 / 461`      | **`58,35s`**  | ~`4,2s`                     | ✅ Nenhuma (`exit code 0`)                                                       |
| **#3** | `17 / 17`          | `461 / 461`      | **`59,22s`**  | ~`4,2s`                     | ✅ Nenhuma (`exit code 0`)                                                       |
| **#4** | `16 / 17`          | `428 / 461`      | **`59,77s`**  | ~`4,2s`                     | ⚠️ 1 abort no worker durante `test/security.int-spec.ts` (`RunnerState.STARTED`) |
| **#5** | `17 / 17`          | `461 / 461`      | **`59,48s`**  | ~`4,2s`                     | ✅ Nenhuma (`exit code 0`)                                                       |

- **Demais verificações executadas na Subetapa 7B.1**:
  - `npm --prefix backend test` (unitários): **18/18 arquivos, 219/219 testes aprovados** (`4,93s`).
  - `npm --prefix backend run lint`: **0 erros, 0 warnings**.
  - `npm --prefix backend run typecheck`: **0 erros**.
  - `npm --prefix backend run build`: **concluído sem erros**.
  - `npm run format:check`: **100% em conformidade com Prettier**.

#### 4. Análise crítica, limitações estatísticas e risco residual

1. **Ganho mensurável de desempenho e eliminação do gargalo em `rbac.int-spec.ts`**:
   - A duração média da suíte caiu de **`76,57s`** para **`59,20s`** (redução consistente de
     **`-17,37s` / `-22,7%`** por execução completa).
   - O arquivo `rbac.int-spec.ts` (que concentrava ~489 chamadas a `createSession` e havia abortado
     no Marco 7A) caiu de ~15–20s para **`4,20s`** e passou em **`5/5` (`100%`)** das rodadas.
2. **Amostra estatística limitada e comprovação empírica do risco residual (Ajustes #1 e #7)**:
   - Em $N = 5$ execuções consecutivas da suíte completa (totalizando $5 \times 17 = 85$ execuções
     de arquivos de teste em workers), **4 de 5 rodadas completas (`80%`)** e **84 de 85 arquivos
     (`98,8%`)** terminaram com `exit code 0`.
   - A ocorrência de 1 abort (`exit code 3221226505`) na Rodada #4 dentro de
     `test/security.int-spec.ts` (arquivo que dispara dezenas de requisições HTTP diretas para
     testar rate limit, brute-force, payloads grandes e headers de segurança) comprova
     empiricamente que:
     - a instabilidade **não** era causada pelo `@node-rs/argon2` em `createSession`; e
     - o problema **não está resolvido em definitivo** por otimizações nos helpers de teste, pois o
       abort nativo permanece reproduzível de forma intermitente no runtime `node.exe` `v24.15.0`
       no Windows (`Windows_NT 10.0.26200 x64`), enquanto no CI Linux (`ubuntu-latest`) a taxa de
       falha permanece `0%`.
   - **Risco residual documentado**: No ambiente local Windows com Node `24.15.0`, persiste uma
     probabilidade residual (~1 em 5 rodadas completas / ~1,2% por arquivo na amostra $N=5$) de o
     worker sofrer abort nativo `0xC0000409`. Nenhuma configuração de retry automático foi
     adicionada para não mascarar falhas.

**Subetapa 7B.1 concluída e aprovada pelo responsável.**

---

### 19.17.11 Execução e resultados reais da Subetapa 7B.2 (2026-11-05)

#### 1. Implementações realizadas (`M7B-2`, `M7B-3` e `M7B-4`)

1. **`M7B-2` (`S12` — `AllExceptionsFilter` em allowlist estrita via `InvalidSortColumnError`)**:
   - Em `backend/src/common/utils/pagination.ts`: criada e exportada `InvalidSortColumnError extends DomainError` (`code = ErrorCode.VALIDATION_ERROR`, `httpStatus = HttpStatus.BAD_REQUEST`) e lançada em `resolveSortColumn`, preservando 100% do contrato HTTP (`400`, `VALIDATION_ERROR`, mesma mensagem).
   - Em `backend/src/common/filters/all-exceptions.filter.ts`: removida a blocklist por regex `FRAMEWORK_MESSAGES` / `isFrameworkMessage` e adotada **allowlist estrita**: apenas erros de domínio (`isDomainError(exception)`) expõem `exception.message` e `exception.details`; qualquer `HttpException` 4xx usa sempre a mensagem canônica de `STATUS_TO_MESSAGE[statusCode]` (preservando `details.fields` quando oriunda do `ValidationPipe`), e qualquer `HttpException` 5xx retorna `500 INTERNAL_ERROR` com `GENERIC_SERVER_MESSAGE` sem `details`.
   - Atualizados `backend/src/common/utils/pagination.spec.ts` e `backend/src/common/filters/all-exceptions.filter.spec.ts` (30 casos unitários).
2. **`M7B-3` (`S11` — Blindagem de `AuditService`, criação de `src/architecture.spec.ts` e atualização de `docs/08-seguranca.md`)**:
   - Em `backend/src/audit/audit.service.ts`: segregados `TRANSACTIONAL_AUDIT_ACTIONS` (`TransactionalAuditAction`: `STOCK_MOVEMENT_CREATED` e `INVENTORY_*`) e `BestEffortAuditAction = Exclude<AuditAction, TransactionalAuditAction>`. O método `record()` foi restrito em tempo de compilação a `RecordAuditInput<BestEffortAuditAction>` e recebeu guarda defensiva em runtime (antes do `try/catch`) que lança erro caso uma ação transacional seja passada via cast inseguro.
   - Em `backend/src/audit/audit.service.spec.ts`: adicionados 6 casos parametrizados (`it.each(TRANSACTIONAL_AUDIT_ACTIONS)`) comprovando a recusa em runtime.
   - Criado `backend/src/architecture.spec.ts` verificando os 4 invariantes arquiteturais sobre `backend/src/`:
     - `RG-6`: `stock-movements/` e `inventories/` jamais invocam `.record(`;
     - `G4`: apenas `inventories/inventories.service.ts` invoca `applyInventoryDelta` (definido em `inventories/inventories.sql.ts`);
     - `SQL seguro`: nenhum arquivo de produção usa `$queryRawUnsafe`, `$executeRawUnsafe` ou chamada não-tagged (`$queryRaw(...)` / `$executeRaw(...)`);
     - `SQL parametrizado`: `$queryRaw` e `$executeRaw` residem apenas em `*.sql.ts` e na allowlist auditada (`prisma.service.ts`, `token.service.ts`, `categories.service.ts`, `products.service.ts`).
   - Atualizado `docs/08-seguranca.md` (`§8.5` e `§8.9`).
3. **`M7B-4` (Validação estrita `@IsIsoDateOrDateTime()`, endurecimento de `toIntValue` e normalização `trimValue` em DTOs)**:
   - Criado `backend/src/common/utils/date.validators.ts` (`isIsoDateOrDateTimeString` e `@IsIsoDateOrDateTime()`) que exige `YYYY-MM-DD` real do calendário Gregoriano (sem rollover silencioso como `'2026-02-31'` ou `'2026-02-29'`) ou datetime ISO 8601 estrito com separador `T` (`strict: true`, `strictSeparator: true`) cuja conversão por `new Date()` seja finita, bloqueando entradas como `'2026-W01'` e `'20260101'` que causavam HTTP 500 no PostgreSQL.
   - Aplicado `@IsIsoDateOrDateTime()` em `QueryMovementsDto` (`dateFrom`, `dateTo`) e `MovementsReportQueryDto` (`dateFrom`, `dateTo`).
   - Endurecido `toIntValue` em `backend/src/common/utils/transform.ts` para aceitar apenas strings que casem com `/^-?\d+$/` após `trim()`, preservando o valor original para que `@IsInt()` rejeite `'10abc'` ou `'15.9'` com HTTP 400.
   - Adicionado `@Transform(trimValue)` nos campos textuais opcionais de `OpenInventoryDto` (`note`), `CreateProductDto` (`description`), `CreateSupplierDto` (`phone`, `notes`) e `QueryAuditDto` (`action`, `entity`).
   - Criados os testes unitários `backend/src/common/utils/date.validators.spec.ts` (32 testes) e `backend/src/common/utils/transform.spec.ts` (10 testes) e adicionados testes de integração em `backend/test/reports.int-spec.ts` e `backend/test/stock-movements.int-spec.ts`.

#### 2. Resultados reais das verificações da Subetapa 7B.2

| Verificação                                      | Resultado                                                                                                                                                     |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm --prefix backend test` (unitários + arq.)   | ✅ **21/21 arquivos, 273/273 testes aprovados** (`3,65s`, incluindo 4 em `architecture.spec.ts`, 32 em `date.validators.spec.ts` e 10 em `transform.spec.ts`) |
| `npm --prefix backend run test:int` (integração) | ✅ **17/17 arquivos, 462/462 testes aprovados** (`60,66s`, 0 aborts)                                                                                          |
| `npm --prefix backend run lint`                  | ✅ **0 erros, 0 warnings**                                                                                                                                    |
| `npm --prefix backend run typecheck`             | ✅ **0 erros**                                                                                                                                                |
| `npm --prefix backend run build`                 | ✅ **concluído sem erros**                                                                                                                                    |
| `npm run format:check`                           | ✅ **limpo (`All matched files use Prettier code style!`)**                                                                                                   |

**Subetapa 7B.2 concluída e aprovada pelo responsável.**

---

### 19.17.12 Auditoria final, validação ponta a ponta e preparação para publicação (Subetapa 7B.3 — 2026-11-05)

#### 1. Auditoria crítica do diff completo do Marco 7B

| Eixo auditado                        | Verificação realizada                                                                                                                                                                                                                                | Resultado   |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| **Autenticação e sessões de teste**  | `createSession` emite o `accessToken` pelo `TokenService.signAccessToken` apenas como fixture; `auth.int-spec.ts` (29 testes), `security.int-spec.ts`, `users.int-spec.ts`, `audit.int-spec.ts` e `rbac.int-spec.ts:484` usam `login(app, user)`     | ✅ Aprovado |
| **Tratamento de erros (`S12`)**      | `AllExceptionsFilter` opera em allowlist estrita: só `isDomainError(exception)` expõe `exception.message`/`details`; qualquer `HttpException` 4xx/5xx ou erro inesperado usa mensagem canônica sem vazar SQL, stack, paths ou detalhes de biblioteca | ✅ Aprovado |
| **Auditoria e arquitetura (`S11`)**  | `AuditService.record()` rejeita `TransactionalAuditAction` em compilação e em runtime; `src/architecture.spec.ts` valida `RG-6`, `G4` e SQL parametrizado em todas as 42 unidades de código de produção                                              | ✅ Aprovado |
| **Validação de entradas (`M7B-4`)**  | `@IsIsoDateOrDateTime()` valida datas reais e fuso horário e bloqueia `'2026-W01'`, `'20260101'`, `'2026-02-29'` e `'2026-02-31'` com HTTP 400 (nunca 500); `toIntValue` bloqueia `'10abc'` e `'15.9'`; `trimValue` aplicado nos DTOs pendentes      | ✅ Aprovado |
| **Integridade de escopo e arquivos** | Nenhuma migration (`prisma/migrations/`), nenhum `package.json`/lockfile e nenhum workflow (`.github/workflows/ci.yml`) foi modificado; nenhum `.env` ou segredo exposto                                                                             | ✅ Aprovado |

#### 2. Bateria completa de validação executada na Subetapa 7B.3

| Camada / Escopo               | Comando                                                                           | Resultado real                                                                                                                                       |
| ----------------------------- | --------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Backend — Lint**            | `npm --prefix backend run lint`                                                   | ✅ **0 erros, 0 warnings**                                                                                                                           |
| **Backend — Typecheck**       | `npm --prefix backend run typecheck`                                              | ✅ **0 erros**                                                                                                                                       |
| **Backend — Unitários + Arq** | `npm --prefix backend test`                                                       | ✅ **21/21 arquivos, 273/273 testes aprovados** (`3,65s`)                                                                                            |
| **Backend — Integração**      | `npm --prefix backend run test:int`                                               | ✅ **17/17 arquivos, 462/462 testes aprovados** (`60,66s`, 0 aborts; + bateria `7B.1` de 5 execuções consecutivas: 4/5 completas)                    |
| **Backend — Build**           | `npm --prefix backend run build`                                                  | ✅ **concluído sem erros**                                                                                                                           |
| **Frontend — Lint**           | `npm --prefix frontend run lint`                                                  | ✅ **0 erros, 0 warnings**                                                                                                                           |
| **Frontend — Typecheck**      | `npm --prefix frontend run typecheck`                                             | ✅ **0 erros**                                                                                                                                       |
| **Frontend — Unitários**      | `npm --prefix frontend test`                                                      | ✅ **36/36 arquivos, 258/258 testes aprovados** (`22,68s`)                                                                                           |
| **Frontend — Build**          | `npm --prefix frontend run build`                                                 | ✅ **concluído sem erros** (`dist/assets/index-*.js`: `1.217,44 kB` / `358,25 kB` gzip — code-splitting é escopo do Marco 7C)                        |
| **E2E Playwright (`e2e`)**    | `npm --prefix frontend run test:e2e`                                              | ✅ **2/2 fluxos aprovados** (`26,8s` em Chromium contra `stockflow_e2e` isolado: `inventory-approval.spec.ts` `6,6s` e `stock-cycle.spec.ts` `8,2s`) |
| **Formatação (Prettier)**     | `npm run format:check`                                                            | ✅ **limpo (`All matched files use Prettier code style!`)**                                                                                          |
| **Audit de produção**         | `npm audit --omit=dev` (raiz, `backend` e `frontend`)                             | ✅ **0 vulnerabilidades** nas 3 árvores (`found 0 vulnerabilities`)                                                                                  |
| **Audit completo (dev)**      | `npm audit` (`backend` e `frontend`)                                              | ⚠️ **13 avisos `moderate`** (`GHSA-g3hv-75wg-m249` em `minimatch@10.2.6`, `devDependencies` apenas — **Risco aceito em D7B-1: Opção A**)             |
| **Segredos e `.env`**         | `git ls-files` + checagem de chaves `SECRET`/`PASSWORD`/`TOKEN` em `.env.example` | ✅ **Apenas `.env.example` e `frontend/.env.example` rastreados; nenhum segredo preenchido**                                                         |

**Contagem total de testes automatizados do projeto ao final do Marco 7B:**

- Backend unitários e arquiteturais: **273 testes** (21 arquivos)
- Backend integração (PostgreSQL real): **462 testes** (17 arquivos)
- Frontend unitários e componentes: **258 testes** (36 arquivos)
- E2E Playwright (Chromium + PostgreSQL `stockflow_e2e`): **2 fluxos completos** (2 arquivos)
- **Total geral**: **995 testes/fluxos automatizados** (`100%` verdes).

#### 3. Inventário final de arquivos do Marco 7B (24 arquivos: 20 modificados + 4 novos)

- **Modificados (20)**:
  1. `backend/src/audit/audit.service.ts`
  2. `backend/src/audit/audit.service.spec.ts`
  3. `backend/src/audit/dto/query-audit.dto.ts`
  4. `backend/src/common/filters/all-exceptions.filter.ts`
  5. `backend/src/common/filters/all-exceptions.filter.spec.ts`
  6. `backend/src/common/utils/pagination.ts`
  7. `backend/src/common/utils/pagination.spec.ts`
  8. `backend/src/common/utils/transform.ts`
  9. `backend/src/inventories/dto/open-inventory.dto.ts`
  10. `backend/src/products/dto/product.dto.ts`
  11. `backend/src/reports/dto/movements-report-query.dto.ts`
  12. `backend/src/stock-movements/dto/query-movements.dto.ts`
  13. `backend/src/suppliers/dto/supplier.dto.ts`
  14. `backend/test/audit.int-spec.ts`
  15. `backend/test/helpers/app.ts`
  16. `backend/test/rbac.int-spec.ts`
  17. `backend/test/reports.int-spec.ts`
  18. `backend/test/stock-movements.int-spec.ts`
  19. `docs/08-seguranca.md`
  20. `docs/19-plano-fase-7.md`
- **Novos (4)**: 21. `backend/src/architecture.spec.ts` 22. `backend/src/common/utils/date.validators.ts` 23. `backend/src/common/utils/date.validators.spec.ts` 24. `backend/src/common/utils/transform.spec.ts`

#### 4. Riscos residuais e pendências explicitamente registrados

1. **Abort nativo intermitente `0xC0000409` (`exit code 3221226505`) em Node `24.15.0` no Windows**:
   - Mitigado em tempo (`-22,7%`, de `76,57s` para `~59,20s`) e custo de setup (`rbac.int-spec.ts` em `4,20s` com `5/5` aprovações), mas **não eliminado em definitivo** no runtime Windows (1 ocorrência em 5 rodadas na Subetapa `7B.1`, em `security.int-spec.ts`; 0 ocorrências na rodada da `7B.2`/`7B.3`; `0%` de ocorrência no CI Linux).
2. **13 avisos `moderate` de `minimatch@10.2.6` (`GHSA-g3hv-75wg-m249`) em `devDependencies`**:
   - Aceitos temporariamente conforme **Decisão D7B-1: Opção A**, com `npm audit --omit=dev` mantendo **0 vulnerabilidades** em produção.
3. **Itens de fases/marcos futuros (não pertencentes ao Marco 7B)**:
   - Acessibilidade sistemática, code-splitting de bundle do frontend e responsividade: escopo do **Marco 7C**.
   - Guard de `Origin`/`Referer` em `/auth/refresh` e `/auth/logout` (`S6`/`D7-4`) e demais itens de deploy (`D7-1`, `D7-5`, `D7-6`, `D7-7`, `D7-8`): escopo da **Fase 8**.

#### 5. Checklist de preparação para publicação (`origin/main`)

- [x] `HEAD` base confirmado em `3c9f052` (`main`, sincronizado com `origin/main`).
- [x] Todas as suítes (`backend unit`, `backend int`, `frontend unit`, `frontend e2e`), `lint`, `typecheck`, `build` e `format:check` aprovadas.
- [x] Diff restrito exclusivamente aos 24 arquivos do Marco 7B (nenhuma migration, lockfile ou workflow tocado).
- [x] Decisões `D7B-1: Opção A` e `D7B-2: Opção A` e riscos residuais documentados com transparência (incluindo que o abort nativo `0xC0000409` em Node `24.15.0`/Windows permanece não resolvido).
- [x] Autorização do responsável concedida para versionamento em commits lógicos (`7f8374d`, `95d882c`, `c7d9d4d`, `4bb530f`) e `git push origin main`.
- [x] GitHub Actions CI #13 do commit `4bb530f` confirmado 100% verde (jobs `backend`, `frontend`, `format`, `secrets-check` e `e2e`).

**Marco 7B oficialmente encerrado após confirmação do GitHub Actions CI #13 (`4bb530f`) 100% verde.**

---

## 19.18 Planejamento técnico detalhado do Marco 7C — Performance, Acessibilidade e Responsividade

### 19.18.1 Contexto, baseline inicial e escopo do Marco 7C

- **Repositório**: `C:\Users\pedro\Desktop\dev\stockflow`
- **Branch**: `main`
- **HEAD-base verificado**: `4bb530f` (`4bb530f6227c3f7978fdbdb1b2f25e01c5c468cc` — `docs: record marco 7b audit and validation results`), sincronizado com `origin/main` e com GitHub Actions CI #13 confirmado 100% verde.
- **Baseline de testes automatizados**: **995 verificações automatizadas** (`273` testes unitários/arquiteturais de backend, `462` testes de integração de backend, `258` testes unitários/componentes de frontend e `2` fluxos E2E Playwright).
- **Status de itens originalmente listados no §19.7 (`A4` e `A5`)**:
  - **`A4` (`ProductPicker.tsx` — navegação por teclado, `aria-selected`, `aria-activedescendant` e remoção de `setTimeout` no `onBlur`)**: **já implementado e testado no Marco 7A** (`frontend/src/components/shared/ProductPicker.tsx` e `ProductPicker.spec.tsx`). Permanece apenas adicionar `aria-label` quando `ProductPicker` é usado fora de `FormField` na barra de filtros de `MovementsPage.tsx`.
  - **`A5` (`ErrorBoundary.tsx` no topo da árvore React)**: **já implementado e testado no Marco 7A** (`frontend/src/components/shared/ErrorBoundary.tsx`, `ErrorBoundary.spec.tsx` e `frontend/src/main.tsx`).
- **Restrições estritas do Marco 7C**:
  - Não alterar migrations existentes nem criar novas migrations ou índices sem evidência empírica.
  - Não quebrar contratos HTTP, autenticação JWT/refresh, RBAC (`ProtectedRoute`, `RoleGuard`), regras de negócio de estoque ou invariantes de auditoria.
  - Preservar a identidade visual do StockFlow (Design System atual baseado em tokens OKLCH em `frontend/src/index.css`), sem redesign desnecessário.

---

### 19.18.2 Prioridade 1 — Performance Frontend (Radiografia do Bundle e Code-Splitting)

#### 1. Diagnóstico empírico do bundle atual (`vite build`)

O build de produção atual (`npm --prefix frontend run build`) emite um **único chunk JavaScript de `1.217,44 kB` (`1.188,9 KiB`, `358,25 kB` gzip)** (`dist/assets/index-*.js`), disparando o alerta do Vite (`Some chunks are larger than 500 kB after minification`).

A inspeção programática da árvore de módulos do Rolldown/Vite revelou a composição exata do bundle minificado:

| Grupo / Dependência                                                                         | Módulos | Tamanho minificado (`KiB`) | Participação no bundle | Onde é utilizado                                                        |
| :------------------------------------------------------------------------------------------ | ------: | -------------------------: | ---------------------: | :---------------------------------------------------------------------- |
| **`recharts` + `d3-*` + `victory-vendor`**                                                  |     304 |           **`302,27 KiB`** |              **25,4%** | **Exclusivamente** em `MovementsChart.tsx` (`DashboardPage.tsx`)        |
| **Transitivos do Recharts (`es-toolkit`, `@reduxjs/toolkit`, `immer`, `reselect`, `clsx`)** |     105 |           **`~83,00 KiB`** |               **7,0%** | **Exclusivamente** em `recharts` (`MovementsChart.tsx`)                 |
| **`react` + `react-dom` + `scheduler`**                                                     |      15 |           **`201,96 KiB`** |              **17,0%** | Core da aplicação (todas as rotas)                                      |
| **Código da aplicação (`frontend/src/**` — 19 páginas + componentes + API)**                |     113 |           **`146,80 KiB`** |              **12,3%** | Importado 100% de forma estática em `frontend/src/router.tsx`           |
| **`zod` + `react-hook-form` + `@hookform/resolvers`**                                       |      72 |           **`124,84 KiB`** |              **10,5%** | Formulários e schemas de validação                                      |
| **`radix-ui` + `@floating-ui` + `react-remove-scroll` + `sonner` + `vaul`**                 |     160 |          **`~115,00 KiB`** |               **9,7%** | Primitivos de UI (`Dialog`, `Sheet`, `Select`, `DropdownMenu`, `Toast`) |
| **`react-router` (`v7`)**                                                                   |      32 |            **`90,45 KiB`** |               **7,6%** | Roteamento SPA (`router.tsx`)                                           |
| **`@tanstack/react-query` + `@tanstack/react-table`**                                       |     101 |            **`68,56 KiB`** |               **5,8%** | Cache HTTP e tabelas (`DataTable.tsx`)                                  |
| **`lucide-react` (ícones c/ tree-shaking) + utilitários (`tailwind-merge`, `cva`)**         |      72 |           **`~56,00 KiB`** |               **4,7%** | Ícones e estilização                                                    |
| **Total**                                                                                   | **974** |         **`1.188,91 KiB`** |             **100,0%** | Chunk monolítico único (`1.217,44 kB`)                                  |

**Causas raízes comprovadas:**

1. **Zero `React.lazy` em `frontend/src/router.tsx`**: todas as **19 páginas** (`LoginPage`, `DashboardPage`, `CategoriesPage`, `ProductsPage`, `ProductNewPage`, `ProductDetailPage`, `ProductEditPage`, `SuppliersPage`, `SupplierNewPage`, `SupplierDetailPage`, `MovementsPage`, `MovementNewPage`, `InventoriesPage`, `InventoryNewPage`, `InventoryDetailPage`, `ReportsPage`, `UsersPage`, `UserNewPage`, `UserDetailPage`, `AuditPage`, `DesignSystemPage`, `NotFoundPage`) são importadas estaticamente no topo de `router.tsx`.
2. **Acoplamento estático do `recharts` (`~385 KiB` somando `d3-*` e `es-toolkit`/`@reduxjs/toolkit`)**: `DashboardPage.tsx` importa `MovementsChart.tsx` estaticamente, forçando o download e parse de toda a engine gráfica mesmo na tela de `/login` ou em fluxos operacionais (`/products`, `/movements`, `/inventories`).

#### 2. Estratégia técnica proposta (`M7C-1`)

1. **Code-splitting por rota em `frontend/src/router.tsx`**:
   - Manter `AuthLayout`, `AppShell`, `ProtectedRoute` e `RoleGuard` importados **sincronamente** no chunk principal para garantir que a verificação de sessão (`useAuth`), os guards de RBAC e o esqueleto estrutural (`Header` + `Sidebar`) nunca sofram atraso ou flicker.
   - Converter as páginas de rota em `React.lazy(...)` envolvidas por um wrapper `<Suspense fallback={<PageLoader />}>` silencioso e acessível (`role="status"`, `aria-live="polite"`, respeitando o layout de `AppShell`).
2. **Lazy loading isolado do gráfico (`MovementsChart.tsx`) em `DashboardPage.tsx`**:
   - Importar `MovementsChart` via `React.lazy` dentro de `DashboardPage.tsx`, usando `<Suspense fallback={<Skeleton className="h-[280px] w-full" />}>`. Assim, os KPIs (`StatCard`) e a tabela de movimentações recentes renderizam imediatamente enquanto o chunk de `recharts` carrega em paralelo apenas quando o Dashboard é aberto.
3. **Particionamento determinístico de vendor chunks (`manualChunks`) em `frontend/vite.config.ts` (Decisão `D7-7`)**:
   - Separar chunks estáveis de bibliotecas (`vendor-react`, `vendor-ui`, `vendor-forms`, `vendor-query-table`, `vendor-charts`) para maximizar cache HTTP de longo prazo e garantir que **nenhum chunk individual ultrapasse `500 kB`**, eliminando o warning do Vite sem suprimir `chunkSizeWarningLimit`.

---

### 19.18.3 Prioridade 2 — Performance Backend (Medições `EXPLAIN (ANALYZE, BUFFERS)` e Análise de Consultas)

#### 1. Catálogo de índices existentes e metodologia de medição

O banco `stockflow_e2e` (PostgreSQL 17 em container Docker local) possui **38 índices ativos** cobrindo todas as chaves primárias, constraints únicas e caminhos críticos de leitura:

- `products`: `products_pkey (id)`, `products_sku_key (sku)`, `products_is_active_name_idx (is_active, name)`, `products_name_trgm_idx USING gin (name gin_trgm_ops)`, `products_category_id_idx (category_id)`, `products_supplier_id_idx (supplier_id)`.
- `stock_movements`: `stock_movements_pkey (id)`, `stock_movements_created_at_idx (created_at DESC)`, `stock_movements_product_id_created_at_idx (product_id, created_at DESC)`, `stock_movements_type_created_at_idx (type, created_at DESC)`, `stock_movements_user_id_idx (user_id)`, `stock_movements_inventory_item_id_key (inventory_item_id)`.
- `inventories` e `inventory_items`: `inventories_pkey (id)`, `inventories_code_key (code)`, `inventories_status_started_at_idx (status, started_at DESC)`, `inventory_items_pkey (id)`, `inventory_items_inventory_id_product_id_key (inventory_id, product_id)`, `inventory_items_product_id_idx (product_id)`, `inventory_items_one_unfinalized_per_product (product_id) WHERE in_progress`.
- `audit_logs`: `audit_logs_pkey (id)`, `audit_logs_created_at_idx (created_at DESC)`, `audit_logs_action_idx (action)`, `audit_logs_entity_entity_id_idx (entity, entity_id)`, `audit_logs_user_id_created_at_idx (user_id, created_at DESC)`.
- `categories`, `suppliers`, `users`, `refresh_tokens`: índices compostos `(is_active, name)` / `(is_active, role)` e chaves únicas.

Como o dataset de desenvolvimento/teste cabe em poucas páginas de `8 kB` (`46` produtos, `72` movimentações, `86` logs de auditoria), o otimizador de custo do PostgreSQL escolhe `Seq Scan` quando toda a tabela reside em `1–2` buffers de memória (`shared hit=1..2`). Para comprovar se os índices existentes cobrem as consultas em escala de produção, cada consulta crítica foi medida em dois modos:

1. **Planner padrão (`enable_seqscan = on`)**;
2. **Verificação forçada de cobertura de índice (`SET LOCAL enable_seqscan = off` em transação `READ ONLY`)**.

#### 2. Resultados reais de `EXPLAIN (ANALYZE, BUFFERS)` nas 14 consultas críticas

| ID      | Endpoint / Consulta Crítica                                    | Plano (Default Planner)                                                        | Tempo (Default) | Plano (`enable_seqscan = off` — Escala)                                                                                          |     Buffers / Tempo (Escala) | Diagnóstico de Índice                                                                  |
| :------ | :------------------------------------------------------------- | :----------------------------------------------------------------------------- | --------------: | :------------------------------------------------------------------------------------------------------------------------------- | ---------------------------: | :------------------------------------------------------------------------------------- |
| **Q1**  | `GET /products?isActive=true&sort=name&order=asc`              | `Sort (top-N heapsort)` -> `Seq Scan on products`                              |      `0,067 ms` | `Limit` -> **`Index Scan using products_is_active_name_idx`** (sem `Sort` em memória!)                                           |  `shared hit=2` / `0,094 ms` | ✅ Coberto por `products_is_active_name_idx`                                           |
| **Q2**  | `GET /products?search=parafuso` (`ILIKE` em `name`/`sku`)      | `Sort` -> `Seq Scan on products`                                               |      `0,069 ms` | `Index Scan using products_is_active_name_idx` + filtro textual (`products_name_trgm_idx` disponível p/ `name ILIKE`)            |  `shared hit=2` / `0,057 ms` | ✅ Coberto (`products_is_active_name_idx` + `products_name_trgm_idx`)                  |
| **Q3**  | `GET /products?stockStatus=low` (`current_stock <= min_stock`) | `Sort` -> `Seq Scan on products`                                               |      `0,034 ms` | `Index Scan using products_is_active_name_idx` + `Filter: (current_stock > 0 AND current_stock <= min_stock)`                    |  `shared hit=2` / `0,033 ms` | ✅ Coberto (B-Tree padrão não indexa comparação entre 2 colunas variáveis; ver abaixo) |
| **Q4**  | `GET /stock-movements?page=1&limit=20`                         | `Incremental Sort` -> **`Index Scan using stock_movements_created_at_idx`**    |      `0,137 ms` | `Incremental Sort` -> **`Index Scan using stock_movements_created_at_idx`** + `Memoize Index Scan on users_pkey`                 |  `shared hit=6` / `0,067 ms` | ✅ Coberto por `stock_movements_created_at_idx`                                        |
| **Q5**  | `GET /products/:id/movements`                                  | `Sort` -> `Seq Scan on stock_movements`                                        |      `0,043 ms` | **`Bitmap Index Scan on stock_movements_product_id_created_at_idx`**                                                             |  `shared hit=3` / `0,061 ms` | ✅ Coberto por `stock_movements_product_id_created_at_idx`                             |
| **Q6**  | `GET /stock-movements?type=OUT&dateFrom=...`                   | `Sort` -> `Seq Scan on stock_movements`                                        |      `0,038 ms` | **`Bitmap Index Scan on stock_movements_type_created_at_idx`**                                                                   |  `shared hit=3` / `0,137 ms` | ✅ Coberto por `stock_movements_type_created_at_idx`                                   |
| **Q7**  | `GET /inventories?status=OPEN`                                 | `Hash Join` -> **`Bitmap Index Scan on inventories_status_started_at_idx`**    |      `0,118 ms` | `Nested Loop` -> **`Bitmap Index Scan on inventories_status_started_at_idx`** + `Index Scan using users_pkey`                    |  `shared hit=2` / `0,067 ms` | ✅ Coberto por `inventories_status_started_at_idx`                                     |
| **Q8**  | `GET /audit?page=1&limit=20`                                   | `Limit` -> **`Index Scan using audit_logs_created_at_idx`**                    |      `0,134 ms` | `Limit` -> **`Index Scan using audit_logs_created_at_idx`**                                                                      |  `shared hit=3` / `0,035 ms` | ✅ Coberto por `audit_logs_created_at_idx`                                             |
| **Q9**  | `GET /dashboard/summary` (4 subconsultas KPI)                  | 4 `InitPlan` (`Seq Scan` em `products` [1 pág.] e `stock_movements` [2 págs.]) |      `0,119 ms` | `Index Only Scan` / `Index Scan on products_is_active_name_idx` + `Bitmap Index Scan on stock_movements_type_created_at`         |  `shared hit=9` / `0,134 ms` | ✅ Coberto (4 subqueries em 1 único roundtrip SQL; `0,119 ms`)                         |
| **Q10** | `GET /dashboard/movements-chart?days=30`                       | `Sort` -> `HashAggregate` -> `Seq Scan on stock_movements`                     |      `0,208 ms` | `HashAggregate` -> **`Bitmap Index Scan on stock_movements_created_at_idx`**                                                     |  `shared hit=3` / `0,085 ms` | ✅ Coberto por `stock_movements_created_at_idx`                                        |
| **Q11** | `GET /dashboard/recent-movements?limit=10`                     | `Incremental Sort` -> **`Index Scan using stock_movements_created_at_idx`**    |      `0,176 ms` | `Incremental Sort` -> **`Index Scan using stock_movements_created_at_idx`** + `Memoize` em `products_pkey`/`users_pkey`          | `shared hit=20` / `0,110 ms` | ✅ Coberto por `stock_movements_created_at_idx`                                        |
| **Q12** | `GET /reports/movements`                                       | `Sort` -> `HashAggregate` -> `Seq Scan on stock_movements`                     |      `0,090 ms` | `HashAggregate` -> **`Bitmap Index Scan on stock_movements_created_at_idx`**                                                     |  `shared hit=3` / `0,097 ms` | ✅ Coberto por `stock_movements_created_at_idx`                                        |
| **Q13** | `GET /reports/inventories`                                     | `Sort` -> `HashAggregate` -> `Hash Left/Right Join`                            |      `0,142 ms` | `HashAggregate` -> `Merge Left Join` usando `inventory_items_pkey`, `stock_movements_inventory_item_id_key` e `inventories_pkey` |  `shared hit=8` / `0,287 ms` | ✅ Coberto pelos índices de FK/UK                                                      |
| **Q14** | `GET /reports/stock-reconciliation`                            | `Sort` -> `Hash Join` -> `HashAggregate` em `stock_movements`                  |      `0,103 ms` | `Merge Join` -> `GroupAggregate` via **`Index Scan using stock_movements_product_id_created_at_idx`** + `products_pkey`          |  `shared hit=7` / `0,105 ms` | ✅ Coberto por `stock_movements_product_id_created_at_idx`                             |

**Conclusão sobre índices no banco de dados**:

- **Nenhum novo índice ou migration é necessário.** Todas as 14 consultas críticas executam entre **`0,034 ms` e `0,287 ms`** e já dispõem de índices B-Tree/GIN adequados para quando a cardinalidade crescer.

#### 3. Dois gargalos reais de acesso a dados identificados na aplicação (sem criar índices)

Embora os índices do PostgreSQL estejam completos, a auditoria conjunta backend/frontend revelou **dois padrões ineficientes de consulta na camada de aplicação**:

1. **Ineficiência no backend — Tripla query com materialização de todos os UUIDs em memória em `ProductsService.findAll` quando `stockStatus` é filtrado (`backend/src/products/products.service.ts:53-55, 161-184`)**:
   - **Problema e evidência**: quando `GET /api/v1/products?stockStatus=low|out|ok` é chamado, `this.idsByStockStatus(query.stockStatus)` executa uma primeira query `$queryRaw` (`SELECT id FROM products WHERE ...`) **sem `LIMIT` e sem filtrar por `categoryId`/`supplierId`/`isActive`**, carrega todos os UUIDs na memória do Node e injeta `where.id = { in: ids }` tanto em `prisma.product.findMany` quanto em `prisma.product.count`. Isso gera **3 roundtrips ao banco** e serializa um array potencialmente grande de UUIDs duas vezes como parâmetros de bind (`$1, $2, ...`).
   - **Adicionalmente**, para `stockStatus=out` (`current_stock = 0`), a condição é uma igualdade simples com constante (`currentStock: new Prisma.Decimal(0)`) que o Prisma suporta nativamente no `WhereInput` sem precisar de `$queryRaw`! E para `low` (`current_stock > 0 AND current_stock <= min_stock`) e `ok` (`current_stock > min_stock`), se mantivermos o filtro ou a consulta, podemos otimizar `stockStatus=out` diretamente no `Prisma.ProductWhereInput` (eliminando a 3ª query) e restringir `idsByStockStatus` apenas às linhas ativas/filtradas.
2. **Gargalo crítico N+1 HTTP entre Frontend e Backend na tela de Detalhe do Inventário (`InventoryDetailPage.tsx` + `InventoryProductCell.tsx`)**:
   - **Problema e evidência**: em `backend/src/inventories/inventories.sql.ts:350-369` (`readItemsDetail`), a query SQL do backend **já faz `JOIN products p ON p.id = ii.product_id`** para ler `p.current_stock`. Contudo, ela seleciona apenas `ii.product_id` e não retorna `p.sku` nem `p.name`. Como consequência, em `frontend/src/features/inventories/components/InventoryProductCell.tsx:16`, cada célula da tabela dispara `useProductQuery(productId)` (`GET /api/v1/products/:id`).
   - **Impacto real medido**: `InventoryDetailPage.tsx:259` usa `pageSize={50}` (e um inventário suporta até `MAX_INVENTORY_PRODUCTS = 200`). Ao abrir um inventário com 50 itens, o navegador dispara **1 requisição `GET /inventories/:id` + 50 requisições individuais `GET /products/:id`** (totalizando **51 requisições HTTP simultâneas** na abertura de uma única tela, podendo atingir até 101 requisições se o usuário paginar e esbarrar no `ThrottlerGuard` global de `100 req/60s`!).
   - **Solução cirúrgica e retrocompatível (`M7C-2`)**: incluir `p.sku AS product_sku, p.name AS product_name` na projeção do `JOIN products p` que **já existe** em `readItemsDetail` (`backend/src/inventories/inventories.sql.ts:350-369`), expor `productSku?: string` e `productName?: string` como campos adicionais opcionais em `InventoryItemDto` (100% retrocompatível com contratos existentes) e fazer `InventoryProductCell.tsx` renderizar `productName` e `productSku` diretamente quando presentes (usando `useProductQuery` apenas como fallback se ausentes). O número de requisições HTTP ao abrir `InventoryDetailPage` cai de **51 para 1** (`-98%`).

---

### 19.18.4 Prioridade 3 — Acessibilidade (WCAG 2.2 AA, Teclado, Foco, Modais e Automação)

#### 1. Auditoria matemática de contraste WCAG 2.2 AA nos tokens OKLCH (`frontend/src/index.css`)

Convertendo os tokens primitivos `:root` de `frontend/src/index.css` (`OKLCH -> Oklab -> sRGB linear -> luminância relativa WCAG 2.1/2.2`), inclusive com composição alfa (`/10`, isto é, `10%` sobre `--sf-bg`), obtivemos os seguintes contrastes exatos:

| Token CSS (`index.css`) | Valor atual              | Uso no sistema                                                                                               | Contraste c/ `--sf-bg` (branco) | Contraste sobre tint `/10` (`bg-(--color-*)/10`) | Status WCAG AA (texto `< 18pt`: mín. `4,5:1`)  |
| :---------------------- | :----------------------- | :----------------------------------------------------------------------------------------------------------- | ------------------------------: | -----------------------------------------------: | :--------------------------------------------- |
| `--sf-text`             | `oklch(21% 0.006 285)`   | Texto primário em páginas, tabelas e modais                                                                  |                   **`17,73:1`** |                                                — | ✅ Aprovado (AAA)                              |
| `--sf-text-muted`       | `oklch(55.2% 0.014 285)` | Rótulos secundários, cabeçalhos de tabela e dicas                                                            |                    **`4,83:1`** |                           **`4,62:1`** (surface) | ✅ Aprovado (AA `>= 4,5:1`)                    |
| `--sf-primary`          | `oklch(54.6% 0.215 262)` | Botões primários (texto branco `--sf-primary-fg`) e links                                                    |                    **`5,16:1`** |                                     **`4,50:1`** | ✅ Aprovado (AA `>= 4,5:1`)                    |
| **`--sf-success`**      | `oklch(59.6% 0.145 163)` | `MovementTypeBadge` (`Entrada`), `InventoriesPage` (`Aprovado`), `StatCard` (`tone="success"`)               |                    **`3,67:1`** |                                     **`3,25:1`** | ❌ **REPROVADO AA (`< 4,5:1`)**                |
| **`--sf-warning`**      | `oklch(68.1% 0.162 75)`  | `StockBadge` (`Estoque baixo`), `MovementTypeBadge` (`Ajuste`), `InventoriesPage`, `ReportsPage`, `StatCard` |                    **`2,93:1`** |                                     **`2,66:1`** | ❌ **REPROVADO AA (`< 4,5:1` e `< 3,0:1`)**    |
| **`--sf-danger`**       | `oklch(57.7% 0.215 27)`  | `StockBadge` (`Sem estoque`), `MovementTypeBadge` (`Saída`), banners de erro (`bg-(--color-danger)/10`)      |                    **`4,83:1`** |                                     **`4,14:1`** | ❌ **REPROVADO AA sobre `/10` (`4,14 < 4,5`)** |

**Ajuste cirúrgico de luminosidade (`L`) mantendo os mesmos matizes (`H = 163`, `75`, `27`) e a identidade visual (`M7C-3`):**

| Token CSS (`index.css`) | Valor atual              | Valor proposto         | Novo contraste c/ `--sf-bg` (e texto branco em botão sólido) | Novo contraste sobre tint `/10` | Resultado WCAG 2.2 AA        |
| :---------------------- | :----------------------- | :--------------------- | -----------------------------------------------------------: | ------------------------------: | :--------------------------- |
| `--sf-success`          | `oklch(59.6% 0.145 163)` | `oklch(50% 0.145 163)` |                                                 **`5,33:1`** |                    **`4,63:1`** | ✅ **Aprovado (`>= 4,5:1`)** |
| `--sf-warning`          | `oklch(68.1% 0.162 75)`  | `oklch(52% 0.145 75)`  |                                                 **`5,61:1`** |                    **`4,89:1`** | ✅ **Aprovado (`>= 4,5:1`)** |
| `--sf-danger`           | `oklch(57.7% 0.215 27)`  | `oklch(53% 0.215 27)`  |                                                 **`5,90:1`** |                    **`4,92:1`** | ✅ **Aprovado (`>= 4,5:1`)** |

> Com `L = 53%` em `--sf-danger`, os botões destrutivos sólidos (`bg-destructive text-white`) também sobem de `4,83:1` para **`5,90:1`**, e os badges/banners com fundo `bg-destructive/10 text-destructive` sobem de `4,14:1` para **`4,92:1`**.

#### 2. Lacunas de semântica ARIA, teclado, foco e modais encontradas no código

1. **Link "Pular para o conteúdo" ausente em `AppShell.tsx`**:
   - Em `frontend/src/components/layout/AppShell.tsx:66`, `<main ref={contentRef} id="conteudo" tabIndex={-1}>` já foi preparado com comentário explícito para receber um skip link, mas a âncora `<a href="#conteudo" className="sr-only focus:not-sr-only ...">Pular para o conteúdo</a>` no topo do `AppShell` nunca foi adicionada.
2. **13 componentes `<SelectTrigger>` (combobox) e 1 `ProductPicker` sem nome acessível (`aria-label`) nas barras de filtro (violação WCAG 4.1.2 `button-name` / `select-name`)**:
   - `DashboardPage.tsx:141`: seletor de período (`7 dias`, `30 dias`, `90 dias`).
   - `ProductsPage.tsx:220, 240, 258`: filtros de categoria, situação de estoque e status.
   - `CategoriesPage.tsx:171`: filtro de status da categoria.
   - `SuppliersPage.tsx:182`: filtro de status do fornecedor.
   - `MovementsPage.tsx:141` (`ProductPicker` de filtro sem `aria-label`), `157` (filtro de tipo) e `176` (filtro de motivo).
   - `InventoriesPage.tsx:118`: filtro de status do inventário.
   - `ReportsPage.tsx:308`: seletor do tipo de relatório.
   - `UsersPage.tsx:119, 139`: filtros de perfil e status.
   - `UserDetailPage.tsx:224`: seletor de alteração de perfil (`Role`).
3. **Perda de `aria-describedby` e `aria-invalid` em 5 `<SelectTrigger>` dentro de `<FormField>`**:
   - `FormField.tsx:46-50` injeta `{ id, 'aria-describedby', 'aria-invalid' }` via render prop. Porém, em `ProductForm.tsx` (linhas `107`, `143`, `169` — unidade, categoria, fornecedor), `MovementEntryForm.tsx` (linha `142` — motivo) e `UserNewPage.tsx` (linha `94` — perfil), o `<SelectTrigger>` recebe apenas `id={field.id}`, descartando `aria-describedby` (nos 5 casos) e `aria-invalid` (em 4 casos). Basta repassar `aria-describedby={field['aria-describedby']}` e `aria-invalid={field['aria-invalid']}` ao `<SelectTrigger>`.
4. **Acessibilidade de modais/drawers (`Sidebar.tsx` e `sheet.tsx`)**:
   - Em `frontend/src/components/layout/Sidebar.tsx:48-54`, o `<SheetContent>` do menu mobile possui `<SheetTitle className="sr-only">Menu de navegação</SheetTitle>`, mas não possui `<SheetDescription className="sr-only">`, gerando warning de acessibilidade do Radix Dialog.
   - Em `frontend/src/components/ui/sheet.tsx:77`, o botão de fechar anuncia `<span className="sr-only">Close</span>` em inglês em vez de `"Fechar"` (e sem `aria-label` explícito).
5. **Célula de contagem de inventário (`InventoryCountCell.tsx`)**:
   - Em `frontend/src/features/inventories/components/InventoryCountCell.tsx:67-91`, o `<Input>` numérico não referencia o `<span role="alert">` de erro via `aria-describedby`, não permite submeter a contagem com a tecla `Enter` (`onKeyDown`), e seu `aria-label` usa o UUID cru (`Quantidade contada para o item ${item.id}`) em vez do nome/SKU do produto quando disponível.

#### 3. Avaliação de ferramentas de auditoria (`axe-core` e Lighthouse — Decisão `D7C-1`)

- **`axe-core` em testes de componentes (`vitest-axe`) vs E2E (`@axe-core/playwright`)**:
  - Os testes de componentes rodam em `jsdom`, que **não calcula layout nem `getComputedStyle` real para cores OKLCH/composição alfa** — portanto, o `axe-core` em `jsdom` valida apenas regras de marcação ARIA/DOM (`button-name`, `label`, `aria-valid-attr`), mas **não valida contraste real (`color-contrast`)**.
  - Já no **Playwright (Chromium real)**, o motor Blink calcula estilos e contrastes reais. Além disso, o Playwright permite injetar ou executar verificação de regras WCAG 2.2 AA diretamente nas páginas reais renderizadas com banco `stockflow_e2e`.
  - **Nota sobre dependências (`npm audit`)**: qualquer adição de pacote npm em `devDependencies` deve ser avaliada contra a política de zero novas vulnerabilidades do repositório. Podemos:
    - **Opção A (Recomendada)**: validar automaticamente nos testes unitários/componentes (Vitest) as invariantes de marcação acessível (presença de `aria-label`, `aria-describedby`, `aria-invalid`, skip link, contraste matemático dos tokens CSS em `index.css` via teste dedicado) **sem instalar novas dependências npm** (preservando `package-lock.json` intacto), e executar auditoria `axe-core`/Lighthouse via script de inspeção descartável no Chromium durante a Subetapa `7C.3`.
    - **Opção B**: instalar `@axe-core/playwright` em `frontend/package.json` (`devDependencies`) e integrá-lo à suíte E2E (`frontend/e2e/`).

---

### 19.18.5 Prioridade 4 — Responsividade (`375px`, `768px` e `1440px` — Decisão `D7-5`)

#### 1. Auditoria das telas principais nos 3 breakpoints (`375px`, `768px`, `1440px`)

| Tela / Fluxo                                  | `375px` (Mobile `< 640px`)                                                                                                                                                                                                | `768px` (Tablet `md`)                                                         | `1440px` (Desktop `xl`)                        | Problemas encontrados em `375px` / `768px`                                                                                                     |
| :-------------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | :---------------------------------------------------------------------------- | :--------------------------------------------- | :--------------------------------------------------------------------------------------------------------------------------------------------- |
| **`AppShell` + `Sidebar` + `Header`**         | Sidebar oculta (`hidden md:flex`); botão hambúrguer no `Header` abre `Sheet` lateral (`w-60`). Padding `p-4`.                                                                                                             | Sidebar fixa visível (`w-60`) + botão de colapsar (`w-16`). Padding `md:p-6`. | Sidebar expandida (`w-60`) + área útil ampla.  | Falta skip link `#conteudo` e `SheetDescription` no drawer mobile.                                                                             |
| **`DashboardPage`**                           | KPIs em `grid-cols-1` (`sm:grid-cols-2`), gráfico `h-[280px]`, tabela de recentes.                                                                                                                                        | KPIs em `2x2` (`sm:grid-cols-2`), gráfico fluido.                             | KPIs em `lg:grid-cols-4`.                      | Tabela de movimentações recentes (6 colunas) exige scroll horizontal em `375px`; `renderCard` no `DataTable` elimina o scroll horizontal.      |
| **`ProductsPage`**                            | Possui `renderCard` no `DataTable`; filtros empilham (`flex-col sm:flex-row`).                                                                                                                                            | Tabela de 6 colunas com `overflow-x-auto`.                                    | Tabela completa visível sem scroll.            | Em `375px`, os 3 `<SelectTrigger>` de filtro têm `w-44`/`w-48`/`w-36` fixos em vez de `w-full sm:w-*`.                                         |
| **`CategoriesPage`**                          | **Sem `renderCard`**: tabela de 5 colunas (incluindo botões `Editar`/`Inativar`) força scroll horizontal em `375px`.                                                                                                      | Tabela cabe confortavelmente.                                                 | Tabela completa.                               | Falta `renderCard` mobile (com botões de ação `Editar` e `Inativar`/`Reativar`) e `w-full sm:w-36` no filtro.                                  |
| **`SuppliersPage`**                           | Possui `renderCard` no `DataTable`.                                                                                                                                                                                       | Tabela de 6 colunas.                                                          | Tabela completa.                               | Filtro de status com `w-36` fixo em vez de `w-full sm:w-36`.                                                                                   |
| **`MovementsPage` + `MovementNewPage`**       | **Sem `renderCard`**: tabela de 7 colunas força scroll horizontal intenso em `375px`. No filtro de período, 2 `<Input type="date">` lado a lado ficam espremidos (`~150px` cada).                                         | Filtros em grid `md:grid-cols-2`; tabela com scroll leve.                     | Filtros em `xl:grid-cols-4`; tabela completa.  | Falta `renderCard` em `MovementsPage`; par de `<Input type="date">` em `MovementsPage.tsx:190` precisa de `flex-col sm:flex-row`.              |
| **`InventoriesPage` + `InventoryDetailPage`** | `InventoriesPage` **sem `renderCard`** (5 colunas). Em `InventoryDetailPage.tsx:195`, a barra de ações do `PageHeader` (` Badge` + `Enviar p/ aprovação` + `Cancelar`) **não tem `flex-wrap`**, podendo estourar `375px`. | Cabeçalho e cards de resumo (`sm:grid-cols-4`) bem distribuídos.              | Tabela de contagem operacional ampla.          | Falta `renderCard` em `InventoriesPage`; falta `flex-wrap` nas ações de `InventoryDetailPage.tsx:195`; resumo `sm:grid-cols-2 lg:grid-cols-4`. |
| **`ReportsPage`**                             | Seletor `SelectTrigger className="w-72"` fixo e par de `<Input type="date">` lado a lado (`ReportsPage.tsx:242`) estouram ou espremem em `375px`.                                                                         | Filtros quebram linha com `flex-wrap`.                                        | 6 relatórios tabulares analíticos completos.   | Ajustar seletor para `w-full sm:w-72` e datas para `flex-col sm:flex-row` em `ReportsPage.tsx`.                                                |
| **`UsersPage` + `UserDetailPage`**            | `UsersPage` **sem `renderCard`** (5 colunas). Em `UserDetailPage.tsx:198`, a linha com `SelectTrigger className="w-48"` + botão `Inativar` não tem `flex-wrap`.                                                           | Layout em 2 colunas (`lg:grid-cols-3` em desktop).                            | Completo.                                      | Adicionar `renderCard` em `UsersPage`, `w-full sm:w-*` nos filtros e `flex-wrap` em `UserDetailPage.tsx:198`.                                  |
| **`AuditPage`**                               | **Sem `renderCard`**: tabela de 5 colunas + botão `Ver` exige scroll horizontal em `375px`.                                                                                                                               | Filtros em `sm:grid-cols-2` e tabela legível.                                 | Filtros em `lg:grid-cols-5` e tabela completa. | Adicionar `renderCard` em `AuditPage` (com botão `Ver` abrindo o `Sheet` de detalhes da auditoria).                                            |

#### 2. Matriz de decisão para `D7-5` (Tabelas Mobile `< 640px`: `renderCard` vs `overflow-x-auto`)

O componente `DataTable.tsx` já possui suporte nativo e testado à prop opcional `renderCard?: (row: TData) => ReactNode` (renderizando cards empilhados em `< 640px` (`sm:hidden`) e mantendo a `Table` em `>= 640px` (`hidden sm:block`)).

Propomos a seguinte regra arquitetural clara para **D7-5**:

1. **Listagens de navegação e consulta operacional (`ProductsPage`, `SuppliersPage`, `CategoriesPage`, `MovementsPage`, `InventoriesPage`, `UsersPage`, `AuditPage` e `DashboardPage` [movimentações recentes])**: usar **`renderCard` mobile (`< 640px`)**, garantindo leitura vertical imediata sem scroll horizontal em `375px` e preservando todas as ações da linha (`Editar`/`Inativar` em Categorias; `Ver` detalhes em Auditoria; links para detalhe/produto nas demais).
2. **Tabelas densas de edição inline ou comparação analítica multicolunar (`InventoryDetailPage` [tabela de contagem física com input numérico por linha] e `ReportsPage` [6 relatórios analíticos comparativos])**: manter **tabela com `overflow-x-auto`** (já provido por `components/ui/table.tsx`), garantindo que a digitação sequencial de contagens e a comparação de colunas numéricas permaneçam alinhadas.

---

### 19.18.6 Prioridade 5 — Qualidade Visual, Hierarquia e Fluidez (`prefers-reduced-motion`)

1. **Respeito global a `prefers-reduced-motion: reduce` (`A6`)**:
   - Atualmente, `frontend/src/index.css` não declara regras para `@media (prefers-reduced-motion: reduce)`, fazendo com que `Skeleton` (`animate-pulse`), transições de abertura/fechamento de modais (`tw-animate-css` em `Sheet`, `AlertDialog`, `Select`, `DropdownMenu`) e a transição de largura da `Sidebar` (`transition-[width] duration-150`) executem animações mesmo quando o sistema operacional solicita redução de movimento.
   - **Solução**: adicionar em `frontend/src/index.css` uma regra global `@media (prefers-reduced-motion: reduce)` que reduz `animation-duration`, `transition-duration` e `scroll-behavior` para valores instantâneos (`0.01ms !important` / `auto !important`).
2. **Consistência de transições de carregamento em rotas lazy (`PageLoader`)**:
   - Ao introduzir `React.lazy` nas rotas (`M7C-1`), o fallback `<Suspense>` utilizará um componente `PageLoader` discreto e consistente com o `Skeleton` do Design System (com `role="status"` e `aria-label="Carregando página"`), evitando saltos de layout (CLS) dentro do `AppShell`.

---

### 19.18.7 Catálogo consolidado de propostas do Marco 7C (`M7C-1` a `M7C-5`)

#### Proposta `M7C-1` — Code-splitting por rota, lazy loading de `MovementsChart` e otimização de chunks (`D7-6` e `D7-7`)

- **Problema**: bundle único de `1.217,44 kB` (`358,25 kB` gzip) carregado integralmente em qualquer rota (inclusive `/login`), contendo `~385 KiB` do `recharts` + `d3-*` + `es-toolkit` usados em apenas 1 componente (`MovementsChart.tsx`) e todas as 19 páginas importadas estaticamente em `router.tsx`.
- **Evidência**: saída do `vite build` (`dist/assets/index-*.js` com `1.217,44 kB` e warning `> 500 kB`) e análise de módulos do Rolldown (§19.18.2).
- **Benefício esperado**: redução de **> 50%** no JavaScript transferido/parseado na carga inicial de `/login` e das rotas operacionais; isolamento de `recharts` em chunk sob demanda; eliminação do warning de `> 500 kB` do Vite.
- **Risco**: Baixo. `ProtectedRoute`, `RoleGuard`, `AuthLayout` e `AppShell` permanecem síncronos; testes existentes de `router.tsx` e páginas continuam funcionando com `findBy*` / `waitFor`.
- **Arquivos afetados**:
  - `frontend/src/router.tsx`
  - `frontend/src/features/dashboard/pages/DashboardPage.tsx`
  - `frontend/vite.config.ts`
- **Critérios de aceite mensuráveis**:
  1. `npm --prefix frontend run build` conclui **sem nenhum warning** de chunk `> 500 kB`.
  2. O chunk de entrada inicial (`index-*.js`) + chunks síncronos iniciais somam **menos de `550 kB` minificados** (redução `>= 50%` frente aos `1.217,44 kB` atuais).
  3. `recharts` + `d3-*` ficam isolados em chunk próprio carregado apenas quando `DashboardPage` renderiza `MovementsChart`.
  4. Todos os testes unitários/componentes do frontend e os 2 fluxos E2E Playwright passam sem regressão de autenticação ou navegação.

#### Proposta `M7C-2` — Eliminação do N+1 HTTP em `InventoryDetailPage` e otimização de `stockStatus` em `ProductsService`

- **Problema**:
  1. Ao abrir `InventoryDetailPage`, a página faz `1` request para `GET /inventories/:id` e até **`50` requests paralelos** para `GET /products/:id` via `InventoryProductCell.tsx`, embora `readItemsDetail` (`backend/src/inventories/inventories.sql.ts:350-369`) **já faça `JOIN products p ON p.id = ii.product_id`**.
  2. Em `ProductsService.findAll` (`backend/src/products/products.service.ts:53-55, 161-184`), o filtro `stockStatus=out` executa uma 3ª query `$queryRaw` desnecessária (`SELECT id FROM products WHERE current_stock = 0`) em vez de filtrar diretamente `currentStock: new Prisma.Decimal(0)` no `WhereInput`, e `idsByStockStatus` para `low`/`ok` não restringe por `isActive`/`categoryId`/`supplierId`.
- **Evidência**: inspeção de `backend/src/inventories/inventories.sql.ts:350-369`, `frontend/src/features/inventories/components/InventoryProductCell.tsx:16` e `backend/src/products/products.service.ts:161-184`.
- **Benefício esperado**: queda de **51 para 1 requisição HTTP** (`-98%`) ao abrir um inventário de 50 itens (eliminando também o risco de atingir o `ThrottlerGuard` de `100 req/60s` em inventários grandes) e redução de 3 para 2 queries SQL em `GET /products?stockStatus=out`.
- **Risco**: Muito baixo. `productSku` e `productName` são adicionados de forma aditiva/opcional em `InventoryItemDto` (mantendo fallback em `InventoryProductCell.tsx`), sem alterar migrations nem quebrar contratos existentes.
- **Arquivos afetados**:
  - `backend/src/inventories/inventories.sql.ts`
  - `backend/src/inventories/dto/inventory-response.dto.ts`
  - `backend/src/inventories/inventories.service.spec.ts`
  - `backend/src/products/products.service.ts`
  - `backend/src/products/products.service.spec.ts`
  - `frontend/src/features/inventories/api/inventories.types.ts`
  - `frontend/src/features/inventories/components/InventoryProductCell.tsx`
  - `frontend/src/features/inventories/components/InventoryCountCell.tsx`
  - `frontend/src/features/inventories/pages/InventoryDetailPage.tsx`
  - `frontend/src/features/inventories/pages/InventoryDetailPage.spec.tsx`
- **Critérios de aceite mensuráveis**:
  1. `GET /api/v1/inventories/:id` inclui `productSku` e `productName` em cada item de `items`.
  2. `InventoryProductCell` renderiza nome e SKU imediatamente sem disparar `GET /api/v1/products/:id` quando `productName`/`productSku` estão presentes no item.
  3. `GET /api/v1/products?stockStatus=out` executa apenas `findMany` + `count` (2 queries em vez de 3), mantendo 100% dos testes unitários e de integração de produtos e inventários verdes.

#### Proposta `M7C-3` — Conformidade WCAG 2.2 AA: Contraste OKLCH, Skip Link, Labels de Filtros, `FormField` ARIA e Modais

- **Problema**:
  1. Tokens `--sf-success` (`3,25:1` sobre `/10`), `--sf-warning` (`2,66:1` sobre `/10`) e `--sf-danger` (`4,14:1` sobre `/10`) reprovam no critério WCAG 2.2 AA (`1.4.3 Contrast Minimum >= 4,5:1`).
  2. Falta o link `"Pular para o conteúdo"` apontando para `#conteudo` em `AppShell.tsx`.
  3. 13 `<SelectTrigger>` e 1 `ProductPicker` em barras de filtro não possuem `aria-label`.
  4. 5 `<SelectTrigger>` dentro de `<FormField>` (`ProductForm`, `MovementEntryForm`, `UserNewPage`) não repassam `aria-describedby` e `aria-invalid`.
  5. `Sidebar.tsx` mobile `SheetContent` não possui `SheetDescription` e `sheet.tsx` usa `"Close"` em inglês.
  6. `InventoryCountCell.tsx` não associa a mensagem de erro via `aria-describedby` nem submete com `Enter`.
- **Evidência**: cálculo matemático de luminância OKLCH (§19.18.4.1) e inspeção linha a linha dos componentes (§19.18.4.2).
- **Benefício esperado**: 100% dos tokens semânticos de cor com contraste `>= 4,5:1` tanto sobre fundo branco quanto sobre fundos tint `/10`; navegação por teclado e leitores de tela completos em todas as telas, filtros, formulários e modais.
- **Risco**: Muito baixo. As alterações de cor preservam exatamente os matizes originais (`H = 163`, `75`, `27`), ajustando apenas a luminosidade `L`. Os atributos `aria-*` não alteram seletores de texto visível usados nos testes existentes.
- **Arquivos afetados**:
  - `frontend/src/index.css`
  - `frontend/src/components/layout/AppShell.tsx`
  - `frontend/src/components/layout/Sidebar.tsx`
  - `frontend/src/components/ui/sheet.tsx`
  - `frontend/src/features/dashboard/pages/DashboardPage.tsx`
  - `frontend/src/features/products/pages/ProductsPage.tsx`
  - `frontend/src/features/products/components/ProductForm.tsx`
  - `frontend/src/features/categories/pages/CategoriesPage.tsx`
  - `frontend/src/features/suppliers/pages/SuppliersPage.tsx`
  - `frontend/src/features/movements/pages/MovementsPage.tsx`
  - `frontend/src/features/movements/components/MovementEntryForm.tsx`
  - `frontend/src/features/inventories/pages/InventoriesPage.tsx`
  - `frontend/src/features/inventories/components/InventoryCountCell.tsx`
  - `frontend/src/features/reports/pages/ReportsPage.tsx`
  - `frontend/src/features/users/pages/UsersPage.tsx`
  - `frontend/src/features/users/pages/UserDetailPage.tsx`
  - `frontend/src/features/users/pages/UserNewPage.tsx`
- **Critérios de aceite mensuráveis**:
  1. Contraste calculado de `--sf-success`, `--sf-warning` e `--sf-danger` é **`>= 4,5:1`** tanto sobre `--sf-bg` quanto sobre `bg-(--color-*)/10` (verificado por teste unitário matemático dedicado).
  2. Todo `<SelectTrigger>` e `ProductPicker` da aplicação possui nome acessível (`aria-label` ou `<label htmlFor>` associado) e todo `<SelectTrigger>` em `<FormField>` propaga `aria-describedby` e `aria-invalid`.
  3. Pressionar `Tab` no início de qualquer página autenticada foca o link `"Pular para o conteúdo"` (`href="#conteudo"`).

#### Proposta `M7C-4` — Responsividade em `375px`, `768px` e `1440px` e Cards Mobile em Listagens (`D7-5`)

- **Problema**:
  1. Apenas 2 de 8 listagens operacionais (`ProductsPage` e `SuppliersPage`) implementam `renderCard` no `DataTable` para `< 640px` (`375px`); `CategoriesPage`, `MovementsPage`, `InventoriesPage`, `UsersPage`, `AuditPage` e a tabela de recentes de `DashboardPage` forçam scroll horizontal em telas de `375px`.
  2. Em `375px`, os seletores de filtro com largura fixa (`w-72` em `ReportsPage`, `w-52` em `InventoriesPage`, `w-48`/`w-44`/`w-36` nas demais), os pares de `<Input type="date">` lado a lado (`MovementsPage.tsx:190` e `ReportsPage.tsx:242`) e os grupos de botões sem `flex-wrap` (`InventoryDetailPage.tsx:195` e `UserDetailPage.tsx:198`) espremem ou estouram o viewport horizontal.
- **Evidência**: auditoria de classes Tailwind e estrutura de layout nas páginas (§19.18.5).
- **Benefício esperado**: zero overflow horizontal de página (`document.documentElement.scrollWidth <= window.innerWidth`) em `375px`, `768px` e `1440px`; visualização nativa em cards no mobile (`< 640px`) para todas as listagens operacionais, preservando todas as ações (`Editar`/`Inativar`, `Ver`, links de detalhe).
- **Risco**: Baixo. `DataTable.tsx` já renderiza simultaneamente a lista de cards (`sm:hidden`) e a tabela (`hidden sm:block`) ou condicional conforme suporte existente; importante garantir nos cards mobile que os botões/links não dupliquem conflitos nos testes unitários que buscam por role/texto.
  - **Cuidado técnico importante para testes unitários**: como `DataTable.tsx:242-255` renderiza `<div className="space-y-2 sm:hidden">{renderCard}</div>` **e** `<div className="hidden sm:block"><Table/></div>` ao mesmo tempo no DOM (porque CSS media queries não removem nós do DOM no `jsdom`), nas páginas `ProductsPage` e `SuppliersPage` os testes já convivem com isso porque o card usa um único `<Link>` e os testes usam `getAllByText` ou seletores de linha (`role="row"`). Nas páginas `CategoriesPage`, `UsersPage`, `AuditPage`, `MovementsPage`, `InventoriesPage` e `DashboardPage`, devemos verificar cuidadosamente se algum `.spec.tsx` usa `getByText` (que falharia se o mesmo texto aparecer no card `sm:hidden` e na `Table` `hidden sm:block`). Se um `.spec.tsx` usar `getByText` estrito, podemos ou usar `matchMedia` no `DataTable` para renderizar `renderCard` apenas quando `window.matchMedia('(max-width: 639px)').matches` for `true` (com fallback CSS), **ou** ajustar/validar os testes. Renderizar condicionalmente no `DataTable` via hook leve `useIsMobile()` (ou `matchMedia` sincronizado) além das classes CSS evita duplicar o número de nós no DOM em desktop e mantém 100% de compatibilidade com todos os `getByText` existentes!
- **Arquivos afetados**:
  - `frontend/src/components/shared/DataTable.tsx` (avaliar otimização de renderização mobile/desktop)
  - `frontend/src/features/dashboard/pages/DashboardPage.tsx`
  - `frontend/src/features/categories/pages/CategoriesPage.tsx`
  - `frontend/src/features/products/pages/ProductsPage.tsx`
  - `frontend/src/features/suppliers/pages/SuppliersPage.tsx`
  - `frontend/src/features/movements/pages/MovementsPage.tsx`
  - `frontend/src/features/inventories/pages/InventoriesPage.tsx`
  - `frontend/src/features/inventories/pages/InventoryDetailPage.tsx`
  - `frontend/src/features/reports/pages/ReportsPage.tsx`
  - `frontend/src/features/users/pages/UsersPage.tsx`
  - `frontend/src/features/users/pages/UserDetailPage.tsx`
  - `frontend/src/features/audit/pages/AuditPage.tsx`
- **Critérios de aceite mensuráveis**:
  1. Em `375px`, `768px` e `1440px`, nenhuma página apresenta overflow horizontal involuntário no `body`/`documentElement`.
  2. Todas as listagens de navegação possuem visualização responsiva limpa em `375px`, com ações acessíveis por toque/teclado.
  3. 100% dos testes de páginas existentes (`*.spec.tsx`) e novos testes passam.

#### Proposta `M7C-5` — Qualidade Visual e Fluidez (`prefers-reduced-motion` e `PageLoader`)

- **Problema**: animações CSS (`animate-pulse`, `tw-animate-css`, transições de largura da `Sidebar`) não respeitam `@media (prefers-reduced-motion: reduce)` (`A6`), e o carregamento assíncrono de rotas lazy requer um estado visual consistente com o Design System.
- **Evidência**: ausência de `prefers-reduced-motion` em `frontend/src/index.css`.
- **Benefício esperado**: respeito integral à preferência de redução de movimento do sistema operacional (WCAG 2.3.3 / boas práticas de UX) e transição suave entre rotas lazy.
- **Risco**: Nenhum.
- **Arquivos afetados**:
  - `frontend/src/index.css`
  - `frontend/src/components/shared/PageLoader.tsx` (novo componente leve de fallback `<Suspense>`)
- **Critérios de aceite mensuráveis**:
  1. Regra `@media (prefers-reduced-motion: reduce)` presente em `frontend/src/index.css` desativando animações/transições contínuas.
  2. Fallback `PageLoader` acessível (`role="status"`, `aria-label="Carregando página"`) integrado ao `router.tsx`.

---

### 19.18.8 Divisão do Marco 7C em Subetapas de Execução e Pontos de Parada

Para manter controle rigoroso de escopo e verificação incremental, a execução do Marco 7C será dividida em **3 subetapas sequenciais**:

#### Subetapa `7C.1` — Performance Frontend (`M7C-1`) e Performance Backend/N+1 (`M7C-2`)

1. Implementar `PageLoader.tsx`, converter rotas de `frontend/src/router.tsx` para `React.lazy` + `<Suspense>`, isolar `MovementsChart` com `React.lazy` em `DashboardPage.tsx` e configurar `manualChunks` em `frontend/vite.config.ts`.
2. Medir o novo `vite build` e comprovar a redução do chunk inicial e a ausência de chunks `> 500 kB`.
3. Incluir `product_sku` e `product_name` no `JOIN` já existente de `readItemsDetail` (`backend/src/inventories/inventories.sql.ts`), atualizar `InventoryItemDto` e `InventoryProductCell.tsx` para eliminar as 50 requisições HTTP N+1 em `InventoryDetailPage`, e otimizar o filtro `stockStatus=out` em `ProductsService.findAll`.
4. Executar testes unitários de backend, integração de backend e unitários de frontend.
5. **Ponto de parada 1**: apresentar métricas comparativas antes/depois (bundle e queries/requests) e aguardar revisão (ou prosseguir se autorizado).

#### Subetapa `7C.2` — Acessibilidade WCAG 2.2 AA (`M7C-3`), Responsividade (`M7C-4`) e Qualidade Visual (`M7C-5`)

1. Ajustar os 3 tokens OKLCH (`--sf-success`, `--sf-warning`, `--sf-danger`) e adicionar `@media (prefers-reduced-motion: reduce)` em `frontend/src/index.css`.
2. Adicionar o skip link `"Pular para o conteúdo"` em `AppShell.tsx`, `SheetDescription` em `Sidebar.tsx` e tradução `"Fechar"` em `sheet.tsx`.
3. Adicionar `aria-label` nos 13 `<SelectTrigger>` e no `ProductPicker` das barras de filtro, propagar `aria-describedby` e `aria-invalid` nos 5 `<SelectTrigger>` dentro de `<FormField>`, e melhorar `InventoryCountCell.tsx` (`aria-describedby` no erro + tecla `Enter`).
4. Implementar os ajustes de responsividade em `375px`/`768px`/`1440px` (`renderCard` mobile nas listagens operacionais e correção de larguras fixas/`flex-wrap` nas barras de filtro e cabeçalhos).
5. Criar testes automatizados cobrindo o contraste matemático WCAG AA dos tokens de `index.css`, o skip link, os atributos ARIA dos filtros/formulários e o comportamento responsivo.
6. **Ponto de parada 2**: apresentar os resultados reais da suíte de testes e aguardar revisão.

#### Subetapa `7C.3` — Auditoria Final Ponta a Ponta (Playwright E2E, Verificação Multi-Viewport/Acessibilidade e Documentação)

1. Revisar o diff completo do Marco 7C.
2. Executar a bateria completa de verificação:
   - `npm --prefix backend run lint`, `typecheck`, `test`, `test:int` e `build`;
   - `npm --prefix frontend run lint`, `typecheck`, `test` e `build`;
   - `npm --prefix frontend run test:e2e` (Playwright com Chromium real + banco `stockflow_e2e`);
   - Verificação automatizada em Chromium real nos viewports `375x812`, `768x1024` e `1440x900` (checando `scrollWidth <= innerWidth` e regras de acessibilidade);
   - `npm run format:check` e `npm audit --omit=dev`.
3. Atualizar a documentação técnica (`docs/19-plano-fase-7.md` e documentos correlatos se aplicável) com todas as evidências finais.
4. **Ponto de parada 3**: apresentar o relatório final da Subetapa `7C.3` e aguardar autorização explícita antes de qualquer commit ou push.

---

### 19.18.9 Decisões Abertas para Deliberação antes da Execução do Marco 7C

#### Decisão `D7C-1` — Automação de verificações de acessibilidade (ferramentas e dependências)

- **Opção A (Recomendada)**: Não adicionar novas dependências ao `package-lock.json` (mantendo a árvore npm intacta e sem novos alertas de `npm audit`). Implementar testes unitários/componentes no Vitest para validar matematicamente os contrastes WCAG 2.2 AA dos tokens OKLCH de `index.css` e as invariantes ARIA (`aria-label`, `aria-describedby`, `aria-invalid`, skip link, modais), além de executar auditoria em Chromium real (Playwright) durante a Subetapa `7C.3`.
- **Opção B**: Instalar `@axe-core/playwright` em `frontend/package.json` (`devDependencies`) e adicionar asserções `AxeBuilder` diretamente nos testes E2E em `frontend/e2e/`.

#### Decisão `D7C-2` (consolida `D7-5`, `D7-6` e `D7-7`) — Escopo técnico do Marco 7C

- **Opção A (Recomendada)**: Aprovar o escopo completo `M7C-1` a `M7C-5`:
  1. **`D7-6` / `D7-7` (`M7C-1`)**: Code-splitting por rota com `React.lazy` em `router.tsx`, lazy loading de `MovementsChart` em `DashboardPage.tsx` e particionamento `manualChunks` em `vite.config.ts` para manter todos os chunks `< 500 kB`.
  2. **Performance Backend/N+1 (`M7C-2`)**: Nenhuma criação de índice/migration (cobertura atual comprovada via `EXPLAIN (ANALYZE, BUFFERS)`); eliminação do N+1 HTTP em `InventoryDetailPage` enriquecendo `readItemsDetail` com `productSku`/`productName` e otimização de `stockStatus=out` em `ProductsService`.
  3. **Acessibilidade e Qualidade Visual (`M7C-3` e `M7C-5`)**: Ajuste de luminosidade OKLCH de `--sf-success`, `--sf-warning` e `--sf-danger` para `>= 4,5:1`, skip link `#conteudo`, `aria-label` nos 13 filtros `SelectTrigger`, `aria-describedby`/`aria-invalid` nos `SelectTrigger` de `FormField`, melhorias em `Sidebar`/`sheet`/`InventoryCountCell` e suporte a `@media (prefers-reduced-motion: reduce)`.
  4. **`D7-5` (`M7C-4`)**: Uso de `renderCard` mobile (`< 640px`) nas listagens operacionais de consulta (`Products`, `Suppliers`, `Categories`, `Movements`, `Inventories`, `Users`, `Audit` e recentes do `Dashboard`) — usando detecção `matchMedia` em `DataTable` para não duplicar nós no DOM em desktop — e manutenção de tabela com `overflow-x-auto` nas telas de contagem inline (`InventoryDetailPage`) e relatórios analíticos (`ReportsPage`), além de ajustes de `flex-wrap`/larguras em `375px`.
- **Opção B**: Executar apenas um subconjunto (especificar quais propostas de `M7C-1` a `M7C-5` devem ser incluídas ou ajustadas).

---

### 19.18.10 Decisões Aprovadas e Estado Atual do Marco 7C

- **`D7C-1`: Opção B Aprovada (Automatização da acessibilidade com `@axe-core/playwright`)**:
  - Aprovada a inclusão de `@axe-core/playwright` como `devDependency` **somente na Subetapa `7C.2` ou `7C.3`** (não instalar antecipadamente na `7C.1`), após verificar versão estável compatível, impacto no lockfile e ausência de vulnerabilidades conhecidas, mantendo também testes de teclado, foco, navegação e contraste.
- **`D7C-2`: Opção A Aprovada (Escopo completo `M7C-1` a `M7C-5`)**:
  - Aprovada a divisão em subetapas `7C.1`, `7C.2` e `7C.3` com parada e revisão entre cada uma.
  - Em `M7C-2` (`ProductsService.findAll`), substituir a consulta auxiliar de IDs por filtro direto `currentStock = 0` no Prisma para `stockStatus=out` (preservando `low` e `ok` intactos e validando combinações com `isActive`, categoria, fornecedor, busca, paginação e ordenação).
  - Documentada a limitação de que a medição das 14 consultas via `EXPLAIN (ANALYZE, BUFFERS)` foi realizada em base pequena de desenvolvimento/teste (`46` produtos, `72` movimentações), não demonstrando desempenho sob carga volumosa (nenhum índice ou migration será criado no Marco 7C; eventuais benchmarks com dados sintéticos ficam restritos a ambiente isolado sem operações destrutivas).
- **Status de execução do Marco 7C**:
  - **Planejamento técnico concluído e aprovado.**
  - **Subetapa `7C.1` (Performance Frontend e Backend/N+1): concluída, auditada e com suítes unitárias, typecheck, lint e builds 100% aprovados.** Validação de integração/E2E delegada ao GitHub Actions devido à ausência de PostgreSQL no host local.
  - **Subetapas `7C.2` e `7C.3`: pendentes de autorização.**

---

### 19.18.11 Execução e resultados reais da Subetapa 7C.1 (2026-11-05)

#### 1. Implementações realizadas na Subetapa 7C.1

1. **Frontend — Code-Splitting por rota e isolamento de dependências (`M7C-1` / `D7-6` / `D7-7`)**:
   - `frontend/src/components/shared/PageLoader.tsx`: componente de carregamento intermediário com semântica de acessibilidade (`role="status"`, `aria-live="polite"` e texto acessível `"Carregando página…"`), renderizado dentro da área de conteúdo de `AppShell`.
   - `frontend/src/router.tsx`: migração de todas as 22 páginas da aplicação para carregamento sob demanda via `React.lazy` envolvidas por `<Suspense fallback={<PageLoader />}>`. A casca estrutural e de segurança (`AuthLayout`, `AppShell`, `ProtectedRoute` e `RoleGuard`) permanece síncrona no chunk principal, garantindo ausência de flickers e avaliação imediata de sessão/RBAC.
   - `frontend/src/features/dashboard/pages/DashboardPage.tsx`: isolamento de `MovementsChart` via `React.lazy` com fallback de `<Skeleton className="h-[280px] w-full" />`, desacoplando a biblioteca `recharts` do caminho crítico de renderização dos indicadores e movimentações recentes.
   - `frontend/vite.config.ts`: configuração de particionamento determinístico via Rolldown `build.rolldownOptions.output.codeSplitting` com `includeDependenciesRecursively: false` e grupos ordenados por prioridade (`vendor-sync`, `vendor-charts`, `vendor-react`, `vendor-forms`, `vendor-query`, `vendor-table`). `react-is` foi encapsulado em `vendor-charts` e `use-sync-external-store` em `vendor-sync`, eliminando qualquer ciclo estático entre chunks e mantendo todos os chunks estritamente abaixo do limite de 500 kB do Vite sem suprimir alertas.

2. **Backend & Frontend — Eliminação do N+1 em Inventários e Otimização de `stockStatus=out` (`M7C-2`)**:
   - `backend/src/inventories/inventories.sql.ts`: projeção de `p.sku AS product_sku` e `p.name AS product_name` na query `readItemsDetail`, aproveitando o `JOIN products p ON p.id = ii.product_id` preexistente sem introduzir queries adicionais.
   - `backend/src/inventories/dto/inventory.dto.ts`: inclusão dos campos opcionais `productSku` e `productName` em `InventoryItemDto`, preservando rigorosamente `expectedQty`, `divergence`, `currentStock` e os demais campos preexistentes.
   - `backend/src/inventories/inventories.service.ts`: mapeamento de `product_sku` e `product_name` para o DTO na leitura de detalhe (`toItemDto`).
   - `frontend/src/features/inventories/api.ts`: enriquecimento da tipagem `InventoryItem` com `productSku?: string` e `productName?: string`.
   - `frontend/src/features/inventories/components/InventoryProductCell.tsx`: consumo direto das propriedades do item quando disponíveis, eliminando as chamadas individuais assíncronas `GET /api/v1/products/:id`. O componente `LookupProductCell` foi mantido exclusivamente como fallback seguro para dados legados ou respostas de contagem.
   - `backend/src/products/products.service.ts`: filtro direto `currentStock: new Prisma.Decimal(0)` para `stockStatus === 'out'`, compondo diretamente com o `WHERE` principal e reduzindo de 3 para 2 queries SQL (`findMany` + `count`). As regras para `low` e `ok` foram preservadas intactas via `idsByStockStatus`.

#### 2. Métricas empíricas de performance antes/depois da Subetapa 7C.1

| Métrica / Dimensão                                                                        | Baseline Marco 7B (`vite build`)                                                | Subetapa 7C.1 (`vite build`)                                                   | Variação / Ganho                                          |
| :---------------------------------------------------------------------------------------- | :------------------------------------------------------------------------------ | :----------------------------------------------------------------------------- | :-------------------------------------------------------- |
| **Carga inicial JavaScript (entrada + preloads estáticos)**                               | `1.217,44 kB` minificado (`358,25 kB` gzip)                                     | **`541,89 kB`** minificado (**`172,01 kB`** gzip)                              | **`-55,5%` minificado** (**`-52,0%` gzip**)               |
| **Maior chunk isolado do bundle**                                                         | `1.217,44 kB` (`dist/assets/index-*.js`)                                        | **`368,32 kB`** (`vendor-charts-*.js`, sob demanda)                            | **`-69,7%`** (abaixo do teto de 500 kB)                   |
| **Chunks acima do limite de 500 kB**                                                      | 1 chunk (com warning do Vite)                                                   | **0 chunks** (alerta do Vite eliminado sem flags permissivas)                  | **Conforme critério de aceite D7-7**                      |
| **Presença de `recharts` / `d3-*` na rota inicial (`/login` e `/dashboard` sem gráfico)** | Sim (acoplado no chunk monolítico)                                              | **Não** (`vendor-charts` transferido apenas quando `MovementsChart` renderiza) | Isolado sob demanda                                       |
| **Ciclos estáticos entre chunks gerados**                                                 | N/A (chunk único)                                                               | **0 ciclos** (verificado via DFS estático no grafo)                            | Grafo estático 100% acíclico                              |
| **Requisições HTTP ao abrir inventário de 50 itens (`InventoryDetailPage`)**              | 1 (`GET /inventories/:id`) + 50 (`GET /products/:id`) = **51 requisições HTTP** | **1 requisição HTTP** (`GET /inventories/:id` com dados embutidos)             | **`-98,0%` requisições HTTP** (eliminação total do N+1)   |
| **Queries SQL executadas em `GET /products?stockStatus=out`**                             | 3 queries (`queryRaw` auxiliar de IDs + `findMany` + `count`)                   | **2 queries** (`findMany` + `count` com filtro direto `currentStock = 0`)      | **`-33,3%` consultas SQL** (eliminação da query auxiliar) |

#### 3. Resultados reais dos testes automatizados e verificações

- **Backend Unitário & Arquitetural**: **279 testes passando** em 22 arquivos de teste (`npm --prefix backend run test`, duração `15,21s`).
  - Inclui novo arquivo `backend/src/products/products.service.spec.ts` com 6 testes validando o filtro direto de `stockStatus=out`, ausência de `$queryRaw`, composição com filtros de categoria, ativo, fornecedor e busca, e manutenção do comportamento de `low`, `ok` e busca sem filtro.
- **Frontend Unitário & Componentes**: **263 testes passando** em 38 arquivos de teste (`npm --prefix frontend run test`, duração `62,98s`).
  - Inclui novos testes: `PageLoader.test.tsx` (1 teste), `InventoryProductCell.test.tsx` (3 testes) e novo cenário em `InventoryDetailPage.test.tsx` comprovando ausência de requisições a produtos na carga e após mutação de contagem.
- **Backend Lint & Typecheck**:
  - `npm --prefix backend run lint` (`eslint . --max-warnings=0`): 0 erros, 0 warnings.
  - `npm --prefix backend run typecheck` (`tsc --noEmit`): 0 erros.
- **Frontend Lint & Typecheck**:
  - `npm --prefix frontend run lint` (`eslint . --max-warnings=0`): 0 erros, 0 warnings.
  - `npm --prefix frontend run typecheck` (`tsc -b --noEmit`): 0 erros.
- **Builds de Produção**:
  - `npm --prefix backend run build` (`nest build`): build concluído com código 0.
  - `npm --prefix frontend run build` (`vite build`): build concluído com código 0 em 1,42s, sem warnings de chunk size.
- **Formatação de Código**:
  - `npx prettier --check` nos arquivos alterados e novos: 100% formatados.
- **Verificação de Regressão de Autenticação / RBAC**:
  - Inspeção e testes confirmaram que `ProtectedRoute` e `RoleGuard` continuam atuando de forma estritamente síncrona, prevenindo vazamento de interface ou bypass de autenticação no router SPA.

#### 4. Limitações operacionais do ambiente e testes pendentes

- **Ambiente de Execução Local**:
  - Máquina Windows de desenvolvimento sem serviço nativo do PostgreSQL nem runtime Docker instalado no sistema operacional.
- **Testes Pendentes de Execução**:
  - Suíte de Integração do Backend: 462 testes de integração (`backend/test/**/*.int-spec.ts`), incluindo os testes atualizados em `inventories.int-spec.ts` e `catalog.int-spec.ts`.
  - Suíte E2E do Frontend: 2 fluxos Playwright E2E (`frontend/e2e/`).
- **Postura Técnica e Critério de Aceite**:
  - Em conformidade estrita com as diretrizes do projeto, **não se declara como aprovado o que não foi executado localmente**. A aprovação da Subetapa 7C.1 neste momento cobre a integridade estática, unitária e de empacotamento, ficando a validação ponta a ponta formal vinculada à execução completa e verde dos jobs de integração e E2E no GitHub Actions CI #14.

#### 5. Inventário de arquivos alterados e novos na Subetapa 7C.1

- **Arquivos modificados (10)**:
  - `backend/src/inventories/dto/inventory.dto.ts`
  - `backend/src/inventories/inventories.service.ts`
  - `backend/src/inventories/inventories.sql.ts`
  - `backend/src/products/products.service.ts`
  - `backend/test/catalog.int-spec.ts`
  - `backend/test/inventories.int-spec.ts`
  - `frontend/src/features/dashboard/pages/DashboardPage.tsx`
  - `frontend/src/features/inventories/api.ts`
  - `frontend/src/features/inventories/components/InventoryProductCell.tsx`
  - `frontend/src/features/inventories/pages/InventoryDetailPage.test.tsx`
  - `frontend/src/features/inventories/pages/InventoryDetailPage.tsx`
  - `frontend/src/router.tsx`
  - `frontend/vite.config.ts`
  - `docs/19-plano-fase-7.md`
- **Arquivos novos (4)**:
  - `backend/src/products/products.service.spec.ts`
  - `frontend/src/components/shared/PageLoader.tsx`
  - `frontend/src/components/shared/PageLoader.test.tsx`
  - `frontend/src/features/inventories/components/InventoryProductCell.test.tsx`
