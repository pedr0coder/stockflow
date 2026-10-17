# 06 — MVP, Telas e Design System

## 6.1 Recorte do MVP

O critério de corte: **entra o que sustenta o fluxo completo de estoque e gera boa
discussão técnica; sai o que só aumenta superfície.**

### Dentro do MVP

| Módulo        | Escopo                                                            |
| ------------- | ----------------------------------------------------------------- |
| Autenticação  | Login, logout, refresh rotativo, `/me`, rotas protegidas          |
| RBAC          | 3 papéis verificados no backend por guard                         |
| Usuários      | CRUD por ADMIN, troca de papel, ativação/inativação               |
| Categorias    | CRUD + inativação                                                 |
| Fornecedores  | CRUD + inativação + produtos vinculados                           |
| Produtos      | CRUD, busca, filtro, ordenação, paginação, inativação, histórico  |
| Movimentações | Entrada, saída, ajuste, histórico imutável, transações            |
| Inventário    | Abrir, contar, divergência, aprovar, cancelar                     |
| Dashboard     | 4 indicadores reais + gráfico de 30 dias + movimentações recentes |
| Relatórios    | 6 relatórios, incluindo reconciliação                             |
| Auditoria     | Registro automático e tela de consulta (ADMIN)                    |
| Testes        | Unitários, integração e 2 fluxos E2E                              |
| Docs          | README, OpenAPI, ADRs                                             |
| Infra         | Docker Compose, GitHub Actions, deploy                            |

### Fora do MVP (roadmap declarado)

QR Code / código de barras · exportação CSV · recuperação de senha por e-mail ·
multi-tenancy · notificações · múltiplos depósitos · custo médio ponderado ·
permissões granulares por recurso · dark mode (avaliado na Fase 7) · app mobile.

Estão listados no README como _roadmap_, não como "em breve" escondendo lacuna.

## 6.2 Mapa de telas

```
/login                              público

/                                   AppShell (sidebar + header)
├── /dashboard                      indicadores, gráfico, últimas movimentações
├── /products                       tabela com busca, filtros, paginação
│   ├── /products/new               formulário
│   ├── /products/:id               detalhe + abas (dados | histórico)
│   └── /products/:id/edit
├── /categories                     tabela + modal de criação/edição
├── /suppliers
│   ├── /suppliers/new
│   └── /suppliers/:id              detalhe + produtos vinculados
├── /movements                      histórico global com filtros
│   └── /movements/new              entrada | saída | ajuste (tabs)
├── /inventories
│   ├── /inventories/new            seleção de produtos
│   └── /inventories/:id            contagem, divergências, aprovação
├── /reports                        seletor de relatório + resultado
├── /users                          ADMIN e MANAGER
├── /audit                          ADMIN
└── /profile                        dados próprios + troca de senha
```

Itens da sidebar são filtrados pelo papel — mas isso é **conveniência de UI**. A
autorização real está no backend; esconder o item não protege nada (§08).

## 6.3 Estados obrigatórios por tela

Toda tela que carrega dados implementa os quatro estados. Nenhum deles é opcional, e
nenhum é preenchido com dado falso.

| Estado      | Tratamento                                                                                |
| ----------- | ----------------------------------------------------------------------------------------- |
| **Loading** | Skeleton com a forma do conteúdo real (linhas de tabela, cards), não spinner centralizado |
| **Empty**   | Ícone, frase explicando o que aparece ali e ação primária ("Cadastrar produto")           |
| **Error**   | Mensagem derivada do `code` do erro + botão "Tentar novamente" que refaz a query          |
| **Success** | Conteúdo                                                                                  |

Distinção explícita entre _empty_ por ausência de cadastro e _empty_ por filtro sem
resultado — a segunda oferece "Limpar filtros", a primeira oferece cadastrar.

Ações destrutivas ou irreversíveis (inativar, cancelar inventário, aprovar inventário)
passam por `ConfirmDialog` que nomeia o efeito, não um "Tem certeza?" genérico.

## 6.4 Design System

Tokens em CSS via `@theme` do Tailwind v4 — a fonte única de verdade é o CSS, não um
objeto de configuração JS.

### Cores

Paleta neutra com **um** acento. Sem gradiente decorativo.

```css
@theme {
  --color-bg: oklch(100% 0 0);
  --color-surface: oklch(98.5% 0.002 247);
  --color-border: oklch(92.9% 0.004 247);
  --color-text: oklch(21% 0.006 285);
  --color-text-muted: oklch(55.2% 0.014 285);

  --color-primary: oklch(54.6% 0.215 262);
  --color-primary-fg: oklch(100% 0 0);

  --color-success: oklch(59.6% 0.145 163);
  --color-warning: oklch(68.1% 0.162 75);
  --color-danger: oklch(57.7% 0.215 27);
}
```

Semântica de estoque, usada de forma consistente em tabela, badge e dashboard:

| Situação       | Token        | Regra                          |
| -------------- | ------------ | ------------------------------ |
| Estoque normal | `text-muted` | `currentStock > minStock`      |
| Estoque baixo  | `warning`    | `0 < currentStock <= minStock` |
| Sem estoque    | `danger`     | `currentStock == 0`            |
| Entrada        | `success`    | `type == IN`                   |
| Saída          | `danger`     | `type == OUT`                  |
| Ajuste         | `warning`    | `type == ADJUSTMENT`           |

Cor nunca é o único portador de informação: cada badge tem rótulo em texto (§08.8).

### Tipografia

Inter (variável) para interface; `ui-monospace` para SKU, quantidade e ID — números em
tabela precisam de largura fixa para alinhar na coluna.

```
xs 0.75 · sm 0.875 · base 1 · lg 1.125 · xl 1.25 · 2xl 1.5 · 3xl 1.875 (rem)
```

Pesos: 400 corpo · 500 rótulo · 600 título. Nada acima de 600.

### Espaçamento, raio e sombra

Escala de 4px (`1 = 0.25rem`), usada sem exceção.

```
radius:  sm 0.375rem · md 0.5rem · lg 0.75rem
shadow:  sm (card)   · md (dropdown, popover)  · lg (modal)
```

Sombra marca elevação real. Card estático não recebe sombra — recebe borda de 1px. É o
que evita o visual de "painel genérico cheio de cards flutuando".

### Componentes compartilhados

| Componente                  | Responsabilidade                                              |
| --------------------------- | ------------------------------------------------------------- |
| `AppShell`                  | Sidebar colapsável + header + área de conteúdo                |
| `PageHeader`                | Título, descrição, breadcrumb, ação primária                  |
| `DataTable`                 | Tabela genérica: ordenação, paginação, skeleton, empty, error |
| `StatCard`                  | Indicador do dashboard: rótulo, valor, variação, ícone        |
| `StockBadge`                | Situação de estoque (cor + texto)                             |
| `MovementTypeBadge`         | Tipo de movimentação                                          |
| `ConfirmDialog`             | Confirmação de ação irreversível                              |
| `EmptyState` / `ErrorState` | Estados padronizados                                          |
| `FormField`                 | Rótulo, campo, hint, erro — integrado a React Hook Form       |

`DataTable` é construído sobre `@tanstack/react-table` (headless), então o markup e as
classes são do projeto, não impostos pela biblioteca.

### Feedback

Toast (sonner, via shadcn/ui) para resultado de ação; erro de formulário sempre junto ao
campo, nunca só em toast. Botão de submit entra em estado `pending` e fica desabilitado
durante a requisição, para impedir duplo envio — que, em movimentação, criaria dois
lançamentos.

## 6.5 Responsividade

| Faixa        | Comportamento                                                                   |
| ------------ | ------------------------------------------------------------------------------- |
| `< 640px`    | Sidebar vira drawer; tabela vira lista de cards; formulário em coluna única     |
| `640–1024px` | Sidebar em modo ícone; tabela com rolagem horizontal e colunas essenciais fixas |
| `> 1024px`   | Layout completo                                                                 |

Tabela em telas estreitas não vira rolagem horizontal pura: as colunas secundárias são
ocultadas e o registro vira card com os campos principais. Rolagem horizontal em celular
é o caminho fácil, não o correto.

## 6.6 Acessibilidade (meta verificável)

- Contraste mínimo AA (4.5:1 em texto normal) — verificado na Fase 7
- Navegação completa por teclado, incluindo modais com foco preso e `Esc` para fechar
- `aria-label` em botões apenas com ícone
- Erro de formulário associado ao campo por `aria-describedby` e anunciado por região live
- `:focus-visible` nunca removido
- Tabela com `<caption>`, `<th scope>` e `aria-sort` na coluna ordenada

Base técnica: os componentes do shadcn/ui usam Radix UI, que já implementa os papéis ARIA
e o gerenciamento de foco dos padrões de diálogo, menu e combobox. Isso é motivo de escolha
da biblioteca, não um extra.
