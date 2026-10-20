# 13 — Plano de Execução da Fase 3 (Design System e Shell)

> Objetivo do roadmap aprovado: **o app parece um produto antes de ter funcionalidade.**
>
> Ao final desta fase, qualquer pessoa navega pelo sistema inteiro, vê a interface real em
> três larguras de tela e encontra os quatro estados de carregamento tratados. E não vê um
> único número inventado.

## 13.1 A restrição que governa a fase

A Fase 3 constrói interface antes de existir API de negócio. É exatamente a situação em
que um projeto de portfólio costuma mentir: preenche o dashboard com dados falsos, mostra
uma tabela com registros fictícios e dá a impressão de um sistema pronto.

Este projeto já se comprometeu com o contrário (§6.3 e requisito 8 do briefing). Então a
regra desta fase é literal:

> **Nenhum componente exibe valor que não tenha vindo de uma fonte real.**
> Onde não há fonte, há _empty state_ dizendo que não há.

Isso tem três consequências de desenho, resolvidas na §13.4: o que a tela de login faz ao
ser submetida, o que o dashboard mostra sem dados, e o que acontece ao navegar para uma
tela cuja funcionalidade é de outra fase.

## 13.2 O que entra e o que não entra

### Dentro da Fase 3

| Item                                                                                                                               | Origem                 |
| ---------------------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| Tokens de tema aplicados em componentes reais                                                                                      | Roadmap §Fase 3        |
| `AppShell`: sidebar colapsável, header, navegação filtrada por papel                                                               | Roadmap §Fase 3        |
| `PageHeader`, `DataTable`, `StatCard`, `StockBadge`, `MovementTypeBadge`, `ConfirmDialog`, `EmptyState`, `ErrorState`, `FormField` | Roadmap §Fase 3        |
| Tela de login visual, sem integração                                                                                               | Roadmap §Fase 3        |
| Dashboard com layout, sem número inventado                                                                                         | Roadmap §Fase 3        |
| React Router com rotas protegidas, React Query provider, Toaster                                                                   | Roadmap §Fase 3        |
| Responsividade em 375px, 768px e 1440px                                                                                            | Roadmap §Fase 3 e §6.5 |
| Testes de componente do `DataTable` e do `ConfirmDialog`                                                                           | Roadmap §Fase 3        |

### Fora da Fase 3

| Item                                                                                                   | Fase             |
| ------------------------------------------------------------------------------------------------------ | ---------------- |
| Qualquer chamada à API de negócio, autenticação real, sessão real                                      | 4 e 6            |
| Telas de produtos, categorias, fornecedores, movimentação, inventário, relatórios, auditoria, usuários | 4 a 6            |
| Gráfico do dashboard com dados (e a dependência `recharts`)                                            | 6                |
| Dark mode                                                                                              | 7, conforme §6.4 |
| Auditoria completa de acessibilidade e contraste                                                       | 7                |
| E2E com Playwright                                                                                     | 7, conforme §7.5 |

**Por que `recharts` fica de fora:** o gráfico do dashboard só tem o que desenhar quando
houver movimentação, que é da Fase 5, e dado real na tela, que é da Fase 6. Instalar uma
biblioteca de gráficos agora para renderizar um retângulo vazio seria dependência sem
justificativa (requisito 4 do briefing). A área do gráfico existe no layout, com _empty
state_.

## 13.3 Dependências a adicionar

Todas já previstas na stack aprovada ([03-stack.md §3.4](03-stack.md)). Versões conferidas
no registro npm e com os _peers_ compatíveis com React 19.3.1 verificados.

| Pacote                  | Versão  | Por que entra **agora**                                                                      |
| ----------------------- | ------- | -------------------------------------------------------------------------------------------- |
| `react-router`          | 8.4.0   | Rotas, layout aninhado e rotas protegidas. Peer declara `react >=19.2.7`.                    |
| `@tanstack/react-query` | 5.104.3 | O provider entra agora porque o `QueryClient` é parte do shell. As queries chegam na Fase 6. |
| `@tanstack/react-table` | 9.3.1   | Base headless do `DataTable`: ordenação e paginação sem markup imposto.                      |
| `react-hook-form`       | 7.90.0  | Requisito do `FormField` e do formulário de login.                                           |
| `zod`                   | 4.6.7   | Schema de validação do formulário, com o tipo inferido do mesmo schema.                      |
| `@hookform/resolvers`   | 5.9.2   | Ponte entre os dois. Declara suporte a `zod ^4` e `react-hook-form ^7.55`.                   |
| `sonner`                | 2.0.8   | Toaster, via shadcn/ui, para feedback de ação (§6.4).                                        |

Componentes do shadcn/ui a gerar pelo CLI, que trazem as dependências do Radix como efeito:
`button`, `input`, `label`, `form`, `card`, `table`, `badge`, `skeleton`, `separator`,
`dropdown-menu`, `alert-dialog`, `sheet`, `tooltip`, `sonner`, `select`, `avatar`.

O shadcn/ui **não** é dependência: o CLI copia o código para `src/components/ui/`, que já
está fora do lint e do Prettier por configuração.

## 13.4 As três decisões de honestidade

São os pontos onde "interface sem backend" encosta na regra de não mentir. Cada um precisa
de decisão explícita antes de escrever código.

### Decisão 1: o que a tela de login faz ao ser submetida

O roadmap pede login "visual, ainda sem integração". O problema: para cumprir o critério
de aceite "navegação completa pelo shell", é preciso entrar no app. Uma tela que finge
autenticar criaria exatamente a sessão falsa que a regra proíbe.

**Decisão:** o `AuthProvider` nasce com a **forma final** da interface que a Fase 6 vai
implementar (`user`, `role`, `isLoading`, `signIn`, `signOut`). Na Fase 3 a implementação é
um `UiPreviewAuthProvider`, e ele é explícito sobre o que é:

- O formulário de login valida com Zod e exibe erro junto ao campo, que é o comportamento
  real sendo construído.
- Submeter **não** autentica. Entra um botão separado e nomeado
  **"Visualizar a interface (sem backend)"**, com seletor de papel, que define uma sessão
  somente de interface.
- Enquanto essa sessão estiver ativa, uma **faixa fixa no topo** diz que a interface está
  em pré-visualização e que não há autenticação nem dados reais. A faixa não é fechável.

Na Fase 6 o `UiPreviewAuthProvider` é **deletado**, não adaptado, e o `AuthProvider` real
ocupa o mesmo contrato. O seletor de papel e a faixa saem junto.

**Por que isso não é dado falso:** não há afirmação de que alguém está autenticado nem de
que algum dado é verdadeiro. É um modo de pré-visualização nomeado como tal. O seletor de
papel ainda rende um ganho: é como se demonstra e se testa a filtragem da sidebar por
papel, que é entrega desta fase.

### Decisão 2: o que o dashboard mostra sem fonte de dados

O roadmap diz "layout e skeletons, sem número inventado". _Skeleton_ permanente também é
mentira: ele comunica "carregando", e nada está carregando.

**Decisão:**

- Os componentes de _skeleton_ são construídos e ficam exercitados na tela de demonstração
  e nos testes, que é onde o estado de carregamento realmente existe.
- O **dashboard em si** renderiza o layout final com cada indicador em _empty state_
  explícito, dizendo que o indicador aparece quando houver movimentação registrada.
- A área do gráfico segue a mesma regra.

Na Fase 6, quando a query entrar, o _skeleton_ passa a aparecer enquanto ela está pendente,
sem que o layout mude.

### Decisão 3: o que acontece ao navegar para uma tela de outra fase

O critério de aceite pede navegação completa pelo shell, e o mapa de telas (§6.2) tem
quinze rotas. Treze delas pertencem às Fases 4 a 6. Deixar o item da sidebar sem destino
seria botão sem função, que o §6.4 proíbe.

**Decisão:** toda rota do §6.2 existe e navega. As que ainda não têm funcionalidade
renderizam um componente `PhasePlaceholder` com o `PageHeader` real da tela e uma frase
nomeando a fase que a entrega, por exemplo "O cadastro de produtos chega na Fase 4".

Isso é diferente de "em breve": é um estado de desenvolvimento, datado e verificável contra
o roadmap do próprio repositório. Nenhum deles exibe dado.

## 13.5 Ordem de implementação

Cada bloco só começa depois que o anterior roda. A ordem segue dependência técnica.

### Bloco A — Fundação do frontend

| #   | Entrega                                                                                  |
| --- | ---------------------------------------------------------------------------------------- |
| A1  | Instalar as dependências da §13.3 e gerar os componentes do shadcn/ui                    |
| A2  | `src/app/providers.tsx`: `QueryClientProvider` com defaults explícitos, `Toaster`        |
| A3  | `src/lib/format.ts`: data, decimal e moeda em pt-BR                                      |
| A4  | Revisar `src/index.css`: confirmar que o CLI do shadcn não sobrescreveu o bloco `@theme` |

A4 existe porque o CLI do shadcn escreve no arquivo de CSS, e o bloco `@theme` é a fonte
única de verdade do tema (§6.4). Um `init` que o reescrevesse apagaria o design system.

### Bloco B — Componentes compartilhados

Construídos antes das telas, porque as telas são composição deles. Cada um nasce com os
estados que o §6.3 exige.

| #   | Componente                        | Responsabilidade                                                                                  |
| --- | --------------------------------- | ------------------------------------------------------------------------------------------------- |
| B1  | `EmptyState`, `ErrorState`        | Ícone, frase explicativa e ação primária. Distinguem ausência de cadastro de filtro sem resultado |
| B2  | `PageHeader`                      | Título, descrição, breadcrumb, ação primária                                                      |
| B3  | `StatCard`                        | Rótulo, valor, variação, ícone, e os estados de carregamento e vazio                              |
| B4  | `StockBadge`, `MovementTypeBadge` | Situação de estoque e tipo de movimentação, sempre com rótulo em texto                            |
| B5  | `ConfirmDialog`                   | Confirmação que **nomeia o efeito**, não um "Tem certeza?" genérico                               |
| B6  | `FormField`                       | Rótulo, campo, dica e erro, associados por `aria-describedby`                                     |
| B7  | `DataTable`                       | Ordenação, paginação, e os quatro estados integrados                                              |
| B8  | `PhasePlaceholder`                | Estado de tela ainda não entregue (Decisão 3)                                                     |

`DataTable` fica por último do bloco porque usa `EmptyState`, `ErrorState` e os skeletons.

### Bloco C — Shell e roteamento

| #   | Entrega                                                                       |
| --- | ----------------------------------------------------------------------------- |
| C1  | `src/features/auth/auth-context.tsx` e `UiPreviewAuthProvider` (Decisão 1)    |
| C2  | `src/app/layouts/AuthLayout.tsx` e `AppShell.tsx`                             |
| C3  | Sidebar colapsável com navegação filtrada por papel                           |
| C4  | Header com breadcrumb, seletor de papel da pré-visualização e menu do usuário |
| C5  | `PreviewBanner`: faixa fixa de pré-visualização                               |
| C6  | `src/router.tsx` com `ProtectedRoute` e todas as rotas do §6.2                |
| C7  | `src/main.tsx` passa a montar `providers` e `router`                          |

### Bloco D — Telas da fase

| #   | Tela                 | Conteúdo                                                                    |
| --- | -------------------- | --------------------------------------------------------------------------- |
| D1  | `/login`             | Formulário validado por Zod, erro junto ao campo, botão de pré-visualização |
| D2  | `/dashboard`         | Layout final com indicadores e gráfico em _empty state_ (Decisão 2)         |
| D3  | `/design-system`     | Galeria de componentes e os quatro estados lado a lado                      |
| D4  | Demais rotas do §6.2 | `PhasePlaceholder` com o `PageHeader` real                                  |

`/design-system` não é enfeite: é a tela que torna o critério de aceite "os quatro estados
visíveis em tela de demonstração" verificável em um lugar só, e é material direto de
entrevista.

### Bloco E — Responsividade e acessibilidade

| #   | Entrega                                                                                           |
| --- | ------------------------------------------------------------------------------------------------- |
| E1  | `< 640px`: sidebar vira drawer; `DataTable` vira lista de cards; formulário em coluna única       |
| E2  | `640px a 1024px`: sidebar em modo ícone; tabela com colunas secundárias ocultas                   |
| E3  | `> 1024px`: layout completo                                                                       |
| E4  | Navegação por teclado, foco preso em modal, `Esc` para fechar, `aria-label` em botão só com ícone |

A tabela em tela estreita **não** vira rolagem horizontal: as colunas secundárias são
ocultadas e o registro vira card (§6.5). Rolagem horizontal em celular é o caminho fácil,
não o correto.

### Bloco F — Testes

Detalhados na §13.7.

## 13.6 Arquivos

### Criados

```
frontend/src/
├── app/
│   ├── providers.tsx
│   └── layouts/
│       ├── AppShell.tsx
│       └── AuthLayout.tsx
├── components/
│   ├── ui/                          (gerado pelo CLI do shadcn)
│   ├── layout/
│   │   ├── Sidebar.tsx
│   │   ├── SidebarNav.tsx
│   │   ├── Header.tsx
│   │   └── PreviewBanner.tsx
│   └── shared/
│       ├── PageHeader.tsx
│       ├── DataTable.tsx
│       ├── DataTableSkeleton.tsx
│       ├── StatCard.tsx
│       ├── StockBadge.tsx
│       ├── MovementTypeBadge.tsx
│       ├── ConfirmDialog.tsx
│       ├── EmptyState.tsx
│       ├── ErrorState.tsx
│       ├── FormField.tsx
│       └── PhasePlaceholder.tsx
├── features/
│   ├── auth/
│   │   ├── auth-context.tsx
│   │   ├── ui-preview-auth.tsx
│   │   ├── schemas.ts
│   │   └── pages/LoginPage.tsx
│   └── dashboard/
│       └── pages/DashboardPage.tsx
├── pages/
│   ├── DesignSystemPage.tsx
│   └── NotFoundPage.tsx
├── lib/
│   ├── format.ts
│   └── nav-items.ts
├── types/
│   └── auth.ts
└── router.tsx
```

Testes: `DataTable.test.tsx`, `ConfirmDialog.test.tsx`, `StockBadge.test.tsx`,
`FormField.test.tsx`, `SidebarNav.test.tsx`, `ProtectedRoute.test.tsx`,
`LoginPage.test.tsx`, `format.test.ts`.

### Modificados

| Arquivo                     | Mudança                                                               |
| --------------------------- | --------------------------------------------------------------------- |
| `frontend/src/main.tsx`     | Passa a montar providers e router                                     |
| `frontend/src/App.tsx`      | **Removido.** A tela de status da Fase 2 some, substituída pelo shell |
| `frontend/src/App.test.tsx` | Removido junto                                                        |
| `frontend/src/index.css`    | Tokens complementares, se a construção dos componentes revelar falta  |
| `frontend/package.json`     | Dependências da §13.3                                                 |
| `frontend/components.json`  | Ajuste de alias se o CLI exigir                                       |
| `README.md`                 | Estado real ao fim da fase                                            |
| `docs/09-roadmap.md`        | Fase 3 marcada como concluída                                         |

**Sobre remover `App.tsx`:** ele cumpriu o papel de provar que o frontend alcança a API, e
esse papel passa a ser do `/health` consumido pela Fase 6. Mantê-lo seria tela órfã. O
conteúdo da verificação não se perde: a tela de demonstração herda a exibição de estado
real, e os testes de estado de erro migram para os componentes compartilhados.

### Backend

**Nenhuma alteração.** A Fase 3 é inteiramente frontend. Se algo exigir mudança no backend,
isso é sinal de escopo vazando e será levantado antes de implementar.

## 13.7 Regras, segurança e validações

### Regras de negócio refletidas na interface

Não há regra de negócio nova nesta fase. A interface apenas **representa** regras que já
estão decididas, e três delas aparecem como componente:

| Regra                                           | Onde aparece        | Fonte |
| ----------------------------------------------- | ------------------- | ----- |
| Situação de estoque: normal, baixo, sem estoque | `StockBadge`        | §6.4  |
| Tipo de movimentação: entrada, saída, ajuste    | `MovementTypeBadge` | §6.4  |
| Permissão por papel na navegação                | `SidebarNav`        | §6.2  |

Cor **nunca** é o único portador de informação: todo badge carrega rótulo em texto. Isso é
requisito de acessibilidade (§6.6), não preferência estética.

### Segurança

O ponto central desta fase é o que ela **não** é:

> Filtrar item de sidebar por papel é **conveniência de interface, não autorização.**

Está dito no §8.3 e será repetido como comentário no código do `SidebarNav`, porque é
exatamente o tipo de coisa que alguém lê errado seis meses depois. A autorização real é
verificada no servidor, por guard, e é entrega da Fase 4.

Outras decisões de segurança desta fase:

| Item                      | Decisão                                                                                                                                                            |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Token                     | Nenhum token é manipulado na Fase 3. O `AuthProvider` de pré-visualização não emite, não guarda e não lê credencial                                                |
| `localStorage`            | Não é usado para sessão. A sessão de pré-visualização vive em memória, e recarregar a página volta ao login, que é o comportamento do access token real (ADR-0005) |
| `dangerouslySetInnerHTML` | Não é usado em lugar nenhum                                                                                                                                        |
| Mensagem de erro          | Vem de mapa de `code` conhecido, nunca injetada como HTML (§8.10)                                                                                                  |
| Variável de ambiente      | Continua apenas `VITE_API_URL`. Build de frontend é público                                                                                                        |

### Validações

Apenas o formulário de login tem entrada nesta fase. Zod com React Hook Form:

| Campo      | Regra                                                       | Motivo                                   |
| ---------- | ----------------------------------------------------------- | ---------------------------------------- |
| `email`    | Obrigatório, formato de e-mail, normalizado para minúsculas | Espelha a normalização do backend (§4.4) |
| `password` | Obrigatório, mínimo de 10 caracteres                        | Espelha a política do §8.1               |

As constantes de regra ficam em um arquivo próprio com os mesmos nomes e valores do lado do
servidor, conforme a mitigação acordada no [ADR-0002](adr/0002-validacao-backend.md). A
validação de cliente existe para experiência; a de servidor, para segurança. A de servidor
nunca confia na de cliente.

## 13.8 Estratégia de testes

Segue o princípio do §7.1: cobrir o que, se quebrar, causa dano. Em interface, isso
significa comportamento observável, não estrutura interna.

### Unitários e de componente (Vitest e Testing Library)

Nenhuma assertiva olha estado interno ou nome de componente. Tudo passa pelo que a pessoa
vê e pelo papel acessível do elemento, para que a interface possa ser reescrita sem
reescrever o teste.

| Alvo                                       | Casos                                                                                                                                                                                                                                                                           |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DataTable` **(exigido pelo roadmap)**     | Skeleton enquanto carrega; _empty_ por ausência de cadastro; _empty_ por filtro, com ação de limpar; `ErrorState` com botão que refaz a consulta; ordenação alterna e marca `aria-sort`; paginação avança, volta e desabilita nos limites; `<caption>` e `<th scope>` presentes |
| `ConfirmDialog` **(exigido pelo roadmap)** | Cancelar **não** executa a ação; confirmar executa uma vez; `Esc` fecha sem executar; foco preso no diálogo; foco volta ao gatilho ao fechar; o texto nomeia o efeito                                                                                                           |
| `StockBadge`                               | Classifica os três estados pelos limites corretos; o rótulo em texto existe, provando que a cor não é o único portador                                                                                                                                                          |
| `FormField`                                | Erro do Zod aparece junto ao campo; `aria-describedby` liga erro e campo; `aria-invalid` é marcado                                                                                                                                                                              |
| `SidebarNav`                               | Para cada papel, os itens visíveis são exatamente os previstos; e um teste que documenta que ocultar item não é autorização                                                                                                                                                     |
| `ProtectedRoute`                           | Sem sessão redireciona para `/login`; com sessão renderiza; respeita o estado de carregamento sem piscar a tela de login                                                                                                                                                        |
| `LoginPage`                                | Campo vazio bloqueia o envio; e-mail inválido mostra erro; senha curta mostra erro; submeter não cria sessão                                                                                                                                                                    |
| `format.ts`                                | Decimal em pt-BR; data em `timestamptz` convertida para horário local; valor com três casas preservado como string                                                                                                                                                              |

O caso de `format.ts` com decimal existe pelo mesmo motivo do backend: falhar se alguém
trocar o tratamento de string por `number` (§R8).

### Integração

**Não se aplica nesta fase**, e isso é uma afirmação, não um esquecimento. Teste de
integração neste projeto significa API real e PostgreSQL real (§7.4). A Fase 3 não chama
API de negócio. A suíte de integração existente do backend continua rodando no CI sem
alteração.

### E2E

**Não se aplica nesta fase.** Os dois fluxos E2E do §7.5 atravessam login real,
movimentação e inventário, que existem a partir da Fase 5. Playwright entra na Fase 7,
como planejado. Escrever E2E agora significaria testar a pré-visualização, que vai ser
deletada.

### Verificação manual registrada

O que teste automatizado não cobre bem, e que será feito com registro no relatório da fase:

- Layout em 375px, 768px e 1440px, tela por tela
- Navegação completa só com teclado, do login até a última rota
- Contraste dos tokens aferido nos pares de cor em uso

## 13.9 Critérios objetivos de aceite

Nenhum item é marcado sem evidência no relatório final.

### Funcionais

- [ ] Todas as quinze rotas do §6.2 navegam, nenhuma em branco e nenhuma quebrada
- [ ] A sidebar colapsa e expande, e o estado persiste durante a navegação
- [ ] Trocar o papel na pré-visualização muda os itens visíveis da sidebar, e a mudança
      corresponde à matriz do §6.2
- [ ] O formulário de login bloqueia envio inválido e mostra o erro junto ao campo
- [ ] Submeter o login **não** cria sessão nem navega para o dashboard
- [ ] A faixa de pré-visualização está visível em toda rota autenticada e não é fechável
- [ ] Recarregar a página com sessão de pré-visualização volta ao login

### De honestidade

- [ ] **Nenhum número, nome, registro ou data aparece na interface sem fonte real**
- [ ] Nenhum _skeleton_ permanente: onde não há carregamento, há _empty state_
- [ ] Toda rota sem funcionalidade nomeia a fase que a entrega
- [ ] Nenhum botão sem efeito

### De qualidade

- [ ] Os quatro estados visíveis lado a lado em `/design-system`
- [ ] Layout correto em 375px, 768px e 1440px, com captura de tela de cada faixa
- [ ] Navegação completa por teclado, incluindo abrir e fechar modal com foco preso
- [ ] `aria-sort` na coluna ordenada e `<caption>` na tabela
- [ ] `npm run lint` limpo
- [ ] `npm run typecheck` sem erro e sem supressão
- [ ] `npm run test` passando, com os casos da §13.8
- [ ] `npm run build` gerando `dist`
- [ ] Backend segue verde: 28 unitários, 17 de integração, lint, typecheck e build
- [ ] CI verde nos quatro jobs
- [ ] Nenhuma dependência instalada sem justificativa registrada

## 13.10 Riscos desta fase

| Risco                                                           | Mitigação                                                                                                                                                                          |
| --------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| O CLI do shadcn sobrescrever o bloco `@theme` do `index.css`    | Conferir o arquivo logo após o primeiro `add` (A4), e usar os tokens do projeto nos componentes gerados em vez das variáveis padrão do shadcn                                      |
| `react-router` 8 ter API diferente da documentação de terceiros | Usar a documentação oficial como fonte, conforme §R10                                                                                                                              |
| A pré-visualização de interface sobreviver à Fase 6             | O provider fica em arquivo próprio, `ui-preview-auth.tsx`, com remoção listada como item de aceite da Fase 6. Um teste verifica que a faixa aparece, e esse teste é deletado junto |
| Crescimento do bundle com os componentes do Radix               | Medir e registrar o tamanho no relatório da fase, para comparação futura                                                                                                           |
| Escopo vazar para Fase 4 ao construir telas                     | Toda rota sem funcionalidade usa `PhasePlaceholder`. Se alguma exigir chamada à API, é sinal de vazamento e para                                                                   |
| Interface bonita escondendo que não há produto                  | É o motivo de as três decisões da §13.4 existirem por escrito                                                                                                                      |

## 13.11 Commits previstos

Nenhum commit sem autorização. Quando houver, a sequência proposta:

```
chore(frontend): add routing, data and form dependencies
feat(frontend): add shared ui components with required states
feat(frontend): add data table with sorting and pagination
feat(frontend): add app shell with collapsible sidebar and header
feat(frontend): add router with protected routes
feat(frontend): add login screen with client side validation
feat(frontend): add dashboard layout with empty states
feat(frontend): add design system showcase page
test(frontend): add component tests for shared ui
docs: update readme and roadmap for phase 3
```
