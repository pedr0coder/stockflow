# 14 — Relatório da Fase 3 (Design System e Shell)

**Data:** 2026-10-20 · **Status:** concluída

> Nenhum resultado abaixo foi escrito sem execução. Onde há saída de comando, ela é a
> saída real. Onde algo não foi verificado, está dito que não foi.

## 14.1 O que foi entregue

| Área                       | Entregue                                                        |
| -------------------------- | --------------------------------------------------------------- |
| Design system              | Tokens em três camadas no `index.css`: primitivas, nomes e base |
| Shell                      | `AppShell` com sidebar colapsável, cabeçalho e área de conteúdo |
| Navegação                  | 10 itens agrupados, filtrados por papel                         |
| Componentes compartilhados | 11, cada um com os estados que o §6.3 exige                     |
| Componentes de base        | 16 gerados pelo CLI do shadcn/ui                                |
| Roteamento                 | 22 entradas de rota, com rota protegida e redirecionamento      |
| Telas                      | Login, dashboard, design system, 17 marcadores de fase e 404    |
| Testes                     | 105 no frontend, em 10 arquivos                                 |

### Telas

| Rota                     | Conteúdo                                                                             |
| ------------------------ | ------------------------------------------------------------------------------------ |
| `/login`                 | Formulário validado com Zod, erro junto ao campo, bloco separado de pré-visualização |
| `/dashboard`             | Layout final com quatro indicadores e dois painéis, **todos em estado vazio**        |
| `/design-system`         | Catálogo dos componentes e os quatro estados lado a lado                             |
| 17 rotas das Fases 4 e 5 | `PhasePlaceholder` com o cabeçalho real e a fase que entrega                         |
| `*`                      | Página não encontrada, com caminho de volta                                          |

## 14.2 As três decisões de honestidade, como ficaram

As três estavam registradas em [13-plano-fase-3.md §13.4](13-plano-fase-3.md) e foram
aprovadas antes da implementação.

**Login.** Submeter credenciais válidas **não cria sessão**. A tela exibe uma mensagem
dizendo que a autenticação é da Fase 4 e a ligação com a API é da Fase 6. A
pré-visualização fica em bloco separado, com divisor, título próprio e a frase "Não
autentica ninguém, não consulta a API e não exibe dado real". Há teste cobrindo que
submeter não inicia sessão de nenhum tipo.

**Dashboard.** Nenhum número. Cada indicador informa o que falta para ele existir. Os
skeletons foram construídos e aparecem em `/design-system` e nos testes, que é onde existe
carregamento de verdade.

**Marcadores de fase.** "Esta tela chega na Fase 4", mais a frase do que ela vai entregar.
Nenhum dado, nenhum botão sem efeito.

## 14.3 Defeitos encontrados e corrigidos

Seis, nenhum contornado.

**1. O `DataTable` perdia a página ao paginar.** As props `columns` e `data` eram
espalhadas direto na chamada do `useTable`, criando referência nova a cada renderização. A
tabela reprocessava os dados e voltava para a primeira página. Pego por teste; corrigido
com `useMemo`.

**2. `localeCompare` com ordenação numérica não compara decimais.** A colação numérica do
ECMA-402 compara sequências de dígitos, não números fracionários: ela considera `'0.000'`
maior que `'0'`. Na prática, um produto com saldo zero era classificado como "estoque
baixo" em vez de "sem estoque". Pego por teste; levou a escrever `lib/decimal.ts`, um
comparador exato que não passa por `number`, com 10 casos próprios.

**3. Os rótulos sumiam no drawer de celular.** A regra de ocultar rótulo era responsiva
(`hidden lg:inline`) e o drawer a herdava, ficando só com ícones apesar de ter 256px de
largura. Pego no navegador; corrigido trocando o booleano `collapsed` por três estados
explícitos de visibilidade.

**4. A rolagem persistia ao trocar de rota.** Quem rola o conteúdo é o `main`, não a
janela, então nem o navegador nem o `ScrollRestoration` do React Router atuam. Sair do fim
de uma tela longa e abrir outra deixava a pessoa no meio da página nova.

**5. `/profile` era rota órfã.** Ela consta no mapa de telas (§6.2) e tem rota, mas não
estava na sidebar nem em lugar nenhum: só era alcançável digitando a URL. Pego na revisão
de consistência entre rotas e navegação; ligada ao menu do usuário.

**6. Uma dependência entrou por acidente.** Ver §14.4.

## 14.4 O incidente com o CLI do shadcn/ui

Registrado porque o modo de falha é instrutivo.

O CLI resolve o alias `@` lendo o `tsconfig.json` da raiz do pacote. Depois da correção do
CI da Fase 2, os `paths` passaram a viver em `tsconfig.app.json`, e o arquivo da raiz
virou apenas um arquivo de solução com referências. O CLI não achou o alias e, em vez de
falhar, **seguiu em frente tratando os aliases como caminhos e nomes literais**:

- gravou os 16 componentes em uma pasta chamada literalmente `@`;
- escreveu `import { cn } from "cn"` em todos eles, em vez de `@/lib/utils`;
- e **instalou do npm um pacote chamado `cn`**, porque o import apontava para um nome de
  pacote válido.

O pacote `cn` (0.5.0) existe de verdade e é legítimo, mas nada no projeto o usava: todo
`cn` do código vem de `@/lib/utils`. Ele entrou no `package.json` por acidente, não por
decisão, o que viola a regra de não aceitar dependência sem justificativa (requisito 4 do
projeto). Foi removido.

**Correções aplicadas:**

| Problema                            | Correção                                                                                             |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Pasta `@`                           | Arquivos movidos para `src/components/ui/`, pasta removida                                           |
| `from "cn"`                         | Substituído por `@/lib/utils` nos 15 arquivos afetados                                               |
| Pacote `cn` instalado               | Desinstalado; `package.json` e lockfile limpos                                                       |
| Alias não resolvido pela ferramenta | `paths` expostos no `tsconfig.json` da raiz do pacote, inertes para o `tsc` por causa de `files: []` |
| `next-themes` trazido pelo toaster  | Removido; o componente foi reescrito com tema fixo, já que dark mode é da Fase 7                     |

O `index.css` **não** foi sobrescrito, que era o risco registrado no plano (§13.10).

A lição: uma ferramenta de geração de código que não resolve um alias pode falhar
silenciosamente e deixar resíduo em três lugares diferentes, incluindo o manifesto de
dependências. Vale conferir o `git status` e o `package.json` depois de cada execução.

## 14.5 Testes executados

Saída real dos comandos, nesta máquina, em 2026-10-20.

```
$ npm --prefix frontend run test
 Test Files  10 passed (10)
      Tests  105 passed (105)

$ npm --prefix backend run test
 Test Files  2 passed (2)
      Tests  28 passed (28)

$ npm --prefix backend run test:int
 Test Files  1 passed (1)
      Tests  17 passed (17)
```

**150 testes no projeto, todos passando.** Nenhum marcado como `skip`.

| Suíte                                      | Casos | O que cobre                                                                                                                                                                                                               |
| ------------------------------------------ | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DataTable` **(exigido pelo roadmap)**     | 23    | Skeleton; vazio por ausência e vazio por filtro; erro com código, identificador e nova tentativa; ordenação alternando com `aria-sort`; ordenação por teclado; paginação com limites; `caption` e `scope`; lista de cards |
| `ConfirmDialog` **(exigido pelo roadmap)** | 10    | **Cancelar não executa**; `Esc` não executa; confirma uma única vez; foco entra no diálogo e volta ao gatilho; título nomeia o efeito; duplo clique bloqueado                                                             |
| `decimal`                                  | 10    | Igualdade entre formas diferentes, grandeza, fração alinhada, negativos, precisão além do float                                                                                                                           |
| `format`                                   | 15    | Casas decimais, locale, precisão que o float perderia, entrada inválida devolvida como veio                                                                                                                               |
| `FormField`                                | 10    | `aria-describedby` para dica e erro, `aria-invalid`, obrigatório em texto, ids distintos                                                                                                                                  |
| `LoginPage`                                | 11    | Validação e, principalmente, que **submeter não cria sessão**                                                                                                                                                             |
| `stock-status`                             | 8     | As três faixas e as bordas                                                                                                                                                                                                |
| `SidebarNav`                               | 8     | Matriz de papéis, grupo vazio descartado, rótulo preservado no modo ícone                                                                                                                                                 |
| `ProtectedRoute`                           | 5     | Redirecionamento, sessão válida, e o estado de carregamento que evita piscar o login                                                                                                                                      |
| `StockBadge`                               | 4     | Rótulo em texto, não só cor                                                                                                                                                                                               |

Dois casos são **documentação executável**: o último de `SidebarNav` e o último de
`ProtectedRoute` existem para registrar, no código, que filtrar menu e proteger rota são
conveniência de interface e **não autorização**.

## 14.6 Verificação manual

O que teste automatizado não cobre bem, feito no navegador com captura de tela.

| Verificação                               | Resultado                                                                 |
| ----------------------------------------- | ------------------------------------------------------------------------- |
| 1440px                                    | Sidebar completa, rótulos e títulos de grupo visíveis                     |
| 768px                                     | Sidebar em modo ícone, cards em duas colunas                              |
| 375px                                     | Sidebar vira drawer, coluna única, sem rolagem horizontal                 |
| Drawer em 375px                           | Abre pelo cabeçalho, mostra rótulos e grupos, fecha ao navegar            |
| Troca de papel                            | Em `Operador`, 8 itens; em `Administrador`, o grupo Administração aparece |
| Recarregar com sessão de pré-visualização | Volta ao login, como o ADR-0005 descreve                                  |
| Marcador de fase                          | `/products` mostra o cabeçalho real e "Esta tela chega na Fase 4"         |
| Console do navegador                      | Nenhum erro em nenhuma rota visitada                                      |

## 14.7 Qualidade e segurança

```
formatação          OK
frontend lint       OK        backend lint       OK
frontend typecheck  OK        backend typecheck  OK
frontend build      OK        backend build      OK

npm audit (raiz)        0 vulnerabilidades
npm audit (frontend)    0 vulnerabilidades
npm audit (backend)     0 vulnerabilidades

secrets-check   .env não versionado · apenas .env.example · sem valor de segredo
```

Nenhuma supressão de regra foi usada: não há `eslint-disable`, `@ts-ignore` nem `any` no
código escrito nesta fase. Os componentes gerados pelo CLI ficam fora do lint e do Prettier
por configuração, desde a Fase 2.

## 14.8 Consistência entre rotas e navegação

Conferida item a item, conforme pedido na validação.

|                                          |                                                            |
| ---------------------------------------- | ---------------------------------------------------------- |
| Entradas de rota                         | 22                                                         |
| Itens na sidebar                         | 10                                                         |
| Itens da sidebar com rota correspondente | 10 de 10                                                   |
| Rotas fora da sidebar                    | `/login`, `/` (redireciona), `*`, `/profile` e 8 sub-rotas |

`/profile` é alcançada pelo menu do usuário. As sub-rotas (`products/new`, `products/:id`,
`suppliers/:id` e as demais) são alcançadas a partir da tela que as origina, que ainda não
existe: por isso não têm ponto de entrada hoje, e por isso não aparecem em menu nenhum.

## 14.9 Tamanho do bundle

Medido no build de produção, antes e depois da fase.

|                       | Fase 2    | Fase 3    | Variação |
| --------------------- | --------- | --------- | -------- |
| JavaScript            | 227,15 kB | 736,66 kB | **3,2×** |
| JavaScript comprimido | 71,44 kB  | 227,39 kB | **3,2×** |
| CSS                   | 9,94 kB   | 47,88 kB  | 4,8×     |
| CSS comprimido        | 2,90 kB   | 8,79 kB   | 3,0×     |

O crescimento vem de quatro dependências que a fase trouxe: React Router, TanStack Query,
Radix (via shadcn/ui) e TanStack Table. Todas estavam previstas na stack aprovada e todas
têm uso real no código.

**Isto é uma limitação aberta.** 227 kB comprimidos para um aplicativo que ainda não tem
funcionalidade de negócio é muito, e o build já emite aviso de chunk acima de 500 kB. O
caminho é divisão de código por rota, com `lazy` e `Suspense`, o que isolaria o
`/design-system` e as telas pesadas do carregamento inicial.

Não foi feito agora de propósito: performance é o escopo da Fase 7, e otimizar antes de
existirem as telas reais significaria medir o problema errado. O número fica registrado
aqui para comparação na Fase 7.

## 14.10 Limitações desta entrega

1. **O bundle cresceu 3,2 vezes** e o build avisa sobre o tamanho do chunk. Divisão por
   rota é o caminho, e é escopo da Fase 7. Ver §14.9.

2. **Nenhum teste E2E.** Os dois fluxos do §7.5 atravessam login real, movimentação e
   inventário, que são das Fases 4 e 5. Escrever E2E agora significaria testar a
   pré-visualização, que vai ser deletada. Playwright entra na Fase 7, como planejado.

3. **A pré-visualização de interface precisa ser REMOVIDA na Fase 6.** São quatro pontos,
   todos marcados no topo do arquivo com aviso em destaque:

   | Arquivo                               | O que sai                        |
   | ------------------------------------- | -------------------------------- |
   | `features/auth/ui-preview-auth.tsx`   | O arquivo inteiro                |
   | `components/layout/PreviewBanner.tsx` | O arquivo inteiro                |
   | `features/auth/pages/LoginPage.tsx`   | O bloco `PreviewAccess`          |
   | `components/layout/Header.tsx`        | O componente `PreviewRoleSelect` |

   Sai também o campo `isPreview` de `AuthContextValue` e o `UiPreviewContext`. O
   `AuthProvider` real implementa o mesmo contrato, e nenhum outro consumidor muda. A
   remoção é item de aceite da Fase 6.

4. **Contraste não foi medido formalmente.** O que existe hoje é a base estrutural de
   acessibilidade: `aria-sort`, `caption`, `scope`, foco preso em diálogo e devolvido ao
   gatilho, rótulo em texto em todo badge, erro associado ao campo por `aria-describedby`.
   A aferição de contraste AA é da Fase 7.

5. **O dashboard não tem gráfico.** A área existe no layout, em estado vazio, e `recharts`
   não foi instalado. Uma biblioteca de gráficos para desenhar um retângulo vazio seria
   dependência sem justificativa. Entra na Fase 6, com dado real.

6. **Nenhuma chamada à API de negócio.** Esta fase é inteiramente de interface. O backend
   não foi tocado: `git status` em `backend/` ficou vazio do início ao fim.

7. **A tela `/design-system` tem registros de exemplo.** São exemplos do componente de
   tabela, e a própria tela declara isso em texto antes deles. Não há indicador de negócio
   com número inventado em lugar nenhum.

## 14.11 Próxima etapa

**Fase 4 — Backend: autenticação e cadastros**, conforme [09-roadmap.md](09-roadmap.md):
módulo `auth` com login, refresh rotativo, logout e `/me`; Argon2id e `RefreshToken`;
`JwtAuthGuard` e `RolesGuard` globais com `@Public()`, `@Roles()` e `@CurrentUser()`;
`users`, `categories`, `suppliers` e `products` completos; paginação, busca, filtro e
ordenação com allowlist; rate limiting em `/auth`; `AuditInterceptor` e o módulo `audit`
com redação testada.

**Aguardando autorização para iniciar.**
