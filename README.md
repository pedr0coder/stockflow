# StockFlow

Plataforma de gerenciamento de estoque para pequenas e médias empresas.

> **Estado atual: Fase 4 implementada e verificada (backend de autenticação e cadastros).**
>
> O sistema **sobe de ponta a ponta** com um comando: PostgreSQL, API e frontend. O banco
> está modelado e migrado, e a API tem 31 rotas respondendo: login com refresh rotativo,
> RBAC com padrão de negar, CRUD de usuários, categorias, fornecedores e produtos, e log de
> auditoria somente leitura.
>
> São 487 testes reais: 128 unitários e 254 de integração no backend, estes contra um
> PostgreSQL de verdade, e 105 unitários no frontend. A suíte de integração exercita a mesma
> aplicação que roda em produção, não uma montagem de teste.
>
> A interface web tem shell completo: sidebar colapsável com navegação por papel, design
> system aplicado e as 22 rotas do mapa de telas navegando.
>
> **O frontend ainda não consome a API**, e nenhuma tela mostra dado de negócio. A ligação
> entre os dois é a Fase 6; movimentação de estoque é a Fase 5. Até lá a interface declara
> isso em cada tela: nenhum número, nome, registro ou data aparece sem vir de uma fonte
> real.
>
> Há uma pendência aberta registrada: em 2 de 20 execuções da suíte de integração o processo
> aborta e um arquivo deixa de rodar. A causa **não está no projeto** — o abort reproduz em
> um script Node comum, sem Vitest e sem nada deste repositório. Investigação, evidências e
> hipóteses descartadas em [docs/16-relatorio-fase-4.md](docs/16-relatorio-fase-4.md), §16.7.

## O problema

Controle de estoque em empresas pequenas costuma viver em planilha. Isso funciona até o
momento em que:

- duas pessoas editam a mesma planilha e um lançamento se perde;
- o saldo não explica a si mesmo, porque não há registro de quem retirou, quando e por quê;
- ninguém percebe que um item acabou antes de alguém precisar dele;
- a contagem física divergente do sistema é corrigida por cima, sem rastro;
- não há como responder "quanto saiu por perda no último trimestre?".

A causa comum é a mesma: **não existe histórico imutável** ligando cada alteração de saldo
a um autor, um motivo e um instante.

## A solução

O StockFlow trata o saldo como consequência, não como campo editável. Nenhuma tela permite
digitar um saldo: ele só muda por uma movimentação registrada (entrada, saída ou ajuste)
com autor, motivo, data, saldo anterior e saldo posterior. O histórico é imutável: erro se
corrige com um novo movimento, nunca reescrevendo o anterior.

Sobre essa base:

- cadastro de produtos, categorias e fornecedores;
- movimentação de estoque transacional, segura sob operações simultâneas;
- inventário cíclico com contagem, cálculo de divergência e aprovação;
- dashboard e relatórios a partir de dados reais;
- três perfis de acesso com permissão verificada no servidor;
- log de auditoria das ações relevantes.

## Stack

**Frontend** · React 19.3 · TypeScript 6.0.3 · Vite 8 · Tailwind CSS 4 · shadcn/ui ·
Lucide Icons

**Backend** · Node.js 24 · TypeScript 6.0.3 · NestJS 12 · Prisma 7.10.1 ·
PostgreSQL 17 · Swagger/OpenAPI · Argon2id · Pino

**Testes** · Vitest 5 · Supertest 7 · Testing Library

**Infra** · Docker Compose · GitHub Actions · ESLint 10 · Prettier

React Router, TanStack Query, React Hook Form, Zod e Playwright entram nas fases em que
são usados. Dependência sem uso não entra no `package.json`, e cada uma tem justificativa
registrada em [docs/03-stack.md](docs/03-stack.md), incluindo as que foram **avaliadas e
recusadas**.

## Como executar

Pré-requisitos: **Docker Desktop em execução**. Nada mais precisa estar instalado.

```bash
git clone <url-do-repositorio>
cd stockflow
cp .env.example .env
```

Preencha o `.env`. Gere cada segredo com:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

A aplicação **recusa subir** com segredo de menos de 32 caracteres, com `JWT_SECRET` igual
a `JWT_REFRESH_SECRET` ou com `*` em `CORS_ORIGINS`. Isso é validado no boot, não em
tempo de execução.

Depois:

```bash
docker compose up
```

| Serviço              | Endereço                                  |
| -------------------- | ----------------------------------------- |
| Frontend             | http://localhost:5173                     |
| API                  | http://localhost:3000/api/v1              |
| Documentação OpenAPI | http://localhost:3000/api/docs            |
| Health check         | http://localhost:3000/api/v1/health/ready |
| PostgreSQL           | localhost:5432                            |

As migrations são aplicadas automaticamente no boot da API.

### Modo híbrido (desenvolvimento diário)

Só o banco em container; API e frontend no host, com HMR rápido e depurador do editor
funcionando:

```bash
docker compose up -d db
npm run install:all
npm --prefix backend run prisma:generate
npm --prefix backend run prisma:deploy
npm --prefix backend run dev     # em um terminal
npm --prefix frontend run dev    # em outro
```

### Dados de exemplo

```bash
npm --prefix backend run seed
```

Cria 3 usuários (um por papel), 7 categorias, 5 fornecedores e 42 produtos, todos
fictícios. **Todos os produtos nascem com saldo zero**, porque saldo só muda por
movimentação e o service de movimentação é da Fase 5. O seed não insere histórico por fora
da regra de negócio.

## Variáveis de ambiente

Todas em [.env.example](.env.example), com descrição. Resumo:

| Variável                            | Para que serve                                            |
| ----------------------------------- | --------------------------------------------------------- |
| `DATABASE_URL`                      | Conexão do PostgreSQL                                     |
| `DATABASE_URL_TEST`                 | Banco separado da suíte de integração, que trunca tabelas |
| `JWT_SECRET` / `JWT_REFRESH_SECRET` | Segredos distintos, 32+ caracteres                        |
| `CORS_ORIGINS`                      | Allowlist de origens. Nunca `*`                           |
| `SEED_*_PASSWORD`                   | Senhas dos usuários fictícios do seed                     |
| `VITE_API_URL`                      | URL da API para o frontend                                |

O `.env` está no `.gitignore` desde o primeiro commit e o CI falha se algum arquivo de
ambiente for versionado.

## Banco de dados

PostgreSQL 17 com Prisma 7. Nove tabelas, cinco enums nativos, migrations versionadas.

| Comando                                    | O que faz                         |
| ------------------------------------------ | --------------------------------- |
| `npm --prefix backend run prisma:generate` | Gera o cliente (não é versionado) |
| `npm --prefix backend run prisma:migrate`  | Cria migration a partir do schema |
| `npm --prefix backend run prisma:deploy`   | Aplica migrations existentes      |
| `npm --prefix backend run prisma:studio`   | Abre o navegador de dados         |

Três pontos do modelo que não estão no `schema.prisma` e vivem em SQL escrito à mão dentro
da migration, porque o Prisma não os declara:

- extensão `pg_trgm` e índice GIN trigram em `products.name`, para busca por parte do nome;
- `CHECK (current_stock >= 0)`, `CHECK (min_stock >= 0)` e `CHECK (unit_cost >= 0)`;
- `CHECK (quantity > 0)` e `CHECK (stock_after >= 0)` em movimentações.

Detalhes em [docs/04-banco-de-dados.md](docs/04-banco-de-dados.md).

## Testes

```bash
npm --prefix backend run test       # unitários
npm --prefix backend run test:int   # integração, contra PostgreSQL real
npm --prefix frontend run test      # componente
```

A suíte de integração aplica as migrations sozinha e se recusa a rodar se
`DATABASE_URL_TEST` não apontar para um banco com `test` no nome. É uma trava deliberada:
a suíte trunca tabelas, e um erro de configuração apagaria o banco de desenvolvimento.

Resultado da última execução verificada está em
[docs/16-relatorio-fase-4.md](docs/16-relatorio-fase-4.md), §16.1. Nenhum resultado de teste
é relatado neste projeto sem execução real — e quando a execução não é limpa, como no caso
da §16.7, isso é relatado também.

## Arquitetura

```
stockflow/
├── backend/          NestJS: controller → service → PrismaService
│   ├── prisma/       schema, migrations, seed
│   └── src/
│       ├── common/   contrato de erro, filtro global
│       ├── config/   validação de ambiente no boot
│       ├── health/   liveness e readiness
│       └── prisma/   PrismaService
├── frontend/         React + Vite, design system por tokens CSS
├── docs/             planejamento, decisões e ADRs
├── docker/           init do Postgres
└── .github/workflows CI
```

Três camadas no backend, sem repositório sobre o Prisma e sem CQRS. A decisão de **não**
adotar essas camadas está justificada em [docs/02-arquitetura.md](docs/02-arquitetura.md):
a complexidade vai para onde o problema está (concorrência em movimentação de estoque) e
sai de todo o resto.

## Destaques técnicos

Os pontos onde este projeto tem engenharia de verdade, e não CRUD:

- **Concorrência em movimentação de estoque** (Fase 5) — saídas simultâneas não podem
  consumir mais do que existe. Resolvido com UPDATE condicional atômico em vez de
  ler-verificar-gravar, com transação e CHECK constraint como defesa em profundidade.
  O comportamento das três camadas já foi validado em SQL no PostgreSQL desta máquina
  ([docs/01-diagnostico.md §1.4](docs/01-diagnostico.md)); o teste com requisições
  paralelas reais é critério de aceite da Fase 5.
  → [ADR-0003](docs/adr/0003-estrategia-de-concorrencia.md)
- **Histórico imutável** — sem `PATCH` e sem `DELETE` em movimentações, por desenho.
- **Precisão numérica** — `Decimal(14,3)` no banco, `Decimal` na aplicação e string no
  JSON. Float em quantidade e custo é bug esperando acontecer.
- **Contrato único de erro** — toda resposta de erro tem a mesma forma, com `code` estável
  para o cliente decidir a interface, e `requestId` que liga a resposta à linha de log.
  Erro 5xx nunca vaza stack trace, e há teste provando.
- **Health check que diz a verdade** — `/health/ready` consulta o banco e responde 503
  quando ele está fora. Um endpoint que sempre responde 200 não informa nada.
- **RBAC verificado no servidor, com padrão de negar** — o `JwtAuthGuard` e o `RolesGuard`
  são globais, então rota nova nasce fechada: esquecer o decorator bloqueia o acesso em vez
  de liberá-lo. Esconder botão não é autorização, e a matriz de papéis é verificada por
  requisição real, não por teste do guard isolado.
- **Sessão em dois tokens** — access em memória por 15 minutos, refresh rotativo de 7 dias
  em cookie httpOnly com `SameSite=Strict` e detecção de reuso: apresentar um refresh já
  rotacionado derruba todas as sessões daquele usuário.
  → [ADR-0005](docs/adr/0005-armazenamento-de-token.md)
- **`passwordHash` omitido na origem** — o campo não vem de nenhuma consulta por padrão,
  configurado no próprio cliente Prisma. Quem precisa dele (só o login) pede
  explicitamente. O vazamento deixa de ser o comportamento padrão e passa a exigir uma
  linha que aparece em revisão.
- **Rate limit por par (origem, conta) no login** — só por IP permitiria testar uma senha
  em mil contas do mesmo endereço; só por e-mail permitiria bloquear a conta de outra
  pessoa de propósito.

## Documentação

| Documento                                               | Conteúdo                                            |
| ------------------------------------------------------- | --------------------------------------------------- |
| [01 — Diagnóstico](docs/01-diagnostico.md)              | Ambiente verificado por comando                     |
| [02 — Arquitetura](docs/02-arquitetura.md)              | Camadas, módulos, contrato de erro                  |
| [03 — Stack](docs/03-stack.md)                          | Versões verificadas e justificativa por dependência |
| [04 — Banco de dados](docs/04-banco-de-dados.md)        | Modelo, índices, constraints, concorrência          |
| [05 — API](docs/05-api.md)                              | Endpoints, papéis, códigos de erro                  |
| [06 — MVP e telas](docs/06-mvp-e-telas.md)              | Escopo, rotas, design system                        |
| [07 — Testes](docs/07-testes.md)                        | Casos por camada                                    |
| [08 — Segurança](docs/08-seguranca.md)                  | Implementado, fora de escopo e riscos aceitos       |
| [09 — Roadmap](docs/09-roadmap.md)                      | Fases e critérios de aceite                         |
| [10 — Riscos](docs/10-riscos.md)                        | Riscos técnicos e mitigações                        |
| [11 — Plano da Fase 2](docs/11-plano-fase-2.md)         | Ordem de implementação e critério de aceite         |
| [12 — Relatório da Fase 2](docs/12-relatorio-fase-2.md) | O que foi feito e o que foi executado               |
| [13 — Plano da Fase 3](docs/13-plano-fase-3.md)         | Escopo e as decisões de honestidade da interface    |
| [14 — Relatório da Fase 3](docs/14-relatorio-fase-3.md) | O que foi feito, medido e o que ficou em aberto     |
| [15 — Plano da Fase 4](docs/15-plano-fase-4.md)         | Escopo do backend, modelo de token e RBAC           |
| [16 — Relatório da Fase 4](docs/16-relatorio-fase-4.md) | Endpoints, defeitos encontrados e pendências        |
| [ADRs](docs/adr/)                                       | Decisões arquiteturais registradas                  |

## Roadmap

| Fase | Entrega                                        | Estado                            |
| ---- | ---------------------------------------------- | --------------------------------- |
| 1    | Planejamento, arquitetura, modelo de dados     | Concluída                         |
| 2    | Fundação: estrutura, banco, Docker, CI, testes | Concluída                         |
| 3    | Design system e shell da aplicação             | Concluída                         |
| 4    | Autenticação, RBAC e cadastros                 | **Verificada, aguardando commit** |
| 5    | Movimentação de estoque e inventário           |                                   |
| 6    | Integração frontend e backend                  |                                   |
| 7    | Qualidade, acessibilidade, performance         |                                   |
| 8    | Deploy e CI/CD                                 |                                   |
| 9    | Portfólio: README final, screenshots, demo     |                                   |

Fora do MVP, em ordem de prioridade: exportação CSV · recuperação de senha por e-mail ·
QR Code e código de barras com leitura por câmera · alerta automático de estoque baixo ·
múltiplos depósitos · custo médio ponderado · multi-tenancy.

Detalhes em [docs/09-roadmap.md](docs/09-roadmap.md).

## Limitações conhecidas

- **Nenhuma funcionalidade de negócio implementada.** Autenticação, cadastros e estoque
  são das Fases 4 e 5. A interface existe, e declara isso em cada tela.
- **A pré-visualização de interface precisa ser removida na Fase 6.** Ela permite navegar
  pelo shell sem backend, sem autenticar ninguém e sem exibir dado, e uma faixa fixa avisa
  disso. Os quatro arquivos envolvidos estão marcados no código.
- **O bundle cresceu 3,2 vezes** com React Router, TanStack Query, Radix e TanStack Table:
  de 71 kB para 227 kB comprimidos. Divisão de código por rota é escopo da Fase 7, e o
  número está registrado para comparação.
- **Nenhum teste E2E.** Os dois fluxos críticos atravessam login real e movimentação, que
  são das Fases 4 e 5. Playwright entra na Fase 7.
- **Contraste não foi medido formalmente.** A base estrutural de acessibilidade existe
  (`aria-sort`, `caption`, foco preso em modal, rótulo em texto em todo badge); a aferição
  AA é da Fase 7.
- O dashboard não tem gráfico, e `recharts` não foi instalado: uma biblioteca de gráficos
  para desenhar um retângulo vazio seria dependência sem justificativa.
- O seed cria cadastro sem movimentação, e todos os produtos ficam com saldo zero.
- Os `Dockerfile.dev` são de desenvolvimento: rodam como root, carregam devDependencies e
  não são imagem de produção. A imagem multi-stage é da Fase 8.
- A suíte de integração aborta o processo em 2 de 20 execuções no Windows, sem erro de
  asserção. O abort reproduz fora do Vitest e fora do código do projeto, em Node puro;
  Argon2, swc, Rolldown, supertest, Express, Nest, Prisma e antivírus estão descartados com
  evidência. Diagnóstico completo em
  [docs/16-relatorio-fase-4.md](docs/16-relatorio-fase-4.md), §16.7.
- Alterar papel ou inativar usuário revoga os refresh tokens, mas o access já emitido vale
  até expirar — uma janela de até 15 minutos. É consequência conhecida de JWT sem lista de
  revogação, e há teste que documenta a janela.
- O rate limit é em memória, por instância: duas instâncias atrás de um balanceador dobram
  o limite efetivo. Redis entra quando houver mais de uma.
- O log de auditoria vive no mesmo banco que ele audita. Quem tem acesso direto ao Postgres
  pode alterá-lo; mitigação real exigiria um sink externo append-only.

O CI está **verde nos quatro jobs**. A primeira execução reprovou no lint do frontend, por
uma dependência de tipos que o pacote usava sem declarar e que só resolvia por acidente de
layout de diretório na máquina de desenvolvimento. A causa raiz e a correção estão
registradas em [docs/12-relatorio-fase-2.md](docs/12-relatorio-fase-2.md), §12.8.

Limitações de segurança e riscos aceitos permanentes estão em
[docs/08-seguranca.md](docs/08-seguranca.md). O sistema não é nem será descrito como
"100% seguro".

## Licença

MIT
