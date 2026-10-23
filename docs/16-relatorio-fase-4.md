# 16. Relatório da Fase 4 — Backend: autenticação e cadastros

Fase planejada em [docs/15-plano-fase-4.md](15-plano-fase-4.md). Este documento registra o
que foi implementado, o que os testes encontraram, o que ficou fora e o que permanece
aberto.

---

## 16.1 Resumo verificado

Todos os números abaixo vêm de execução real, não de estimativa.

| Verificação                     | Resultado                              |
| ------------------------------- | -------------------------------------- |
| `npm run lint` (back + front)   | sem erro                               |
| `npm run typecheck`             | sem erro                               |
| `npx prettier --check .`        | todos os arquivos conformes            |
| Testes unitários (backend)      | 128 passando, 9 arquivos               |
| Testes de integração (backend)  | 254 passando, 8 arquivos               |
| Testes unitários (frontend)     | 105 passando, 10 arquivos — intocados  |
| `npm run build` (back + front)  | sem erro                               |
| `npm audit` (raiz, back, front) | 0 vulnerabilidades                     |
| Migrations novas nesta fase     | nenhuma                                |
| Alterações no frontend          | nenhuma (`git status frontend/` vazio) |
| Rotas implementadas             | 31, conferidas uma a uma contra o §5   |

Os testes de integração rodam contra **PostgreSQL real**, no banco `stockflow_test`, com a
mesma aplicação que roda em produção: `configureApp` é compartilhada, então a suíte
exercita o mesmo pipeline de guards, pipes e cabeçalhos que o cliente recebe.

Há uma instabilidade conhecida, descrita na §16.7. Ela não é falha de teste e não está no
projeto: o processo aborta na camada de sockets do runtime, e a investigação reproduz o
abort em um script Node comum, sem Vitest e sem nada deste repositório. Está registrada
como pendência aberta, com as evidências.

---

## 16.2 Endpoints implementados

31 rotas. A docs/05-api.md documenta 32 nas seções desta fase (§5.2 a §5.6, §5.11 e
§5.12); `GET /products/:id/movements` foi adiada para a Fase 5 por decisão aprovada, pois
devolve histórico de movimentação e o histórico não existe antes do módulo que o produz.

```
32 documentadas − 1 adiada = 31 implementadas
```

A conta não é afirmação: `backend/test/contract.int-spec.ts` lê o documento OpenAPI gerado
e compara método e caminho, um por um. Falha nas duas direções — rota que falta e rota que
sobra — e também afirma que a rota adiada **não** responde.

### Autenticação — §5.2

| Método | Rota            | Acesso      |
| ------ | --------------- | ----------- |
| POST   | `/auth/login`   | público     |
| POST   | `/auth/refresh` | cookie      |
| POST   | `/auth/logout`  | público     |
| GET    | `/auth/me`      | autenticado |

`logout` é público de propósito: sair não deveria exigir access token válido, senão quem
tem o access expirado e o refresh vivo não conseguiria encerrar a sessão.

### Usuários — §5.3

| Método | Rota                 | Papéis      |
| ------ | -------------------- | ----------- |
| GET    | `/users`             | A, M        |
| GET    | `/users/:id`         | A, M        |
| POST   | `/users`             | A           |
| PATCH  | `/users/:id`         | A           |
| PATCH  | `/users/:id/role`    | A           |
| PATCH  | `/users/:id/status`  | A           |
| PATCH  | `/users/me/password` | autenticado |

A troca de senha é `me/password`, não `:id/password`: o id vem do token, e não existe
caminho para trocar a senha de outra pessoa — nem para o ADMIN. Um `:id` ali seria a
superfície óbvia de escalonamento.

### Categorias — §5.4, Fornecedores — §5.5, Produtos — §5.6

| Método | Rota                      | Papéis  |
| ------ | ------------------------- | ------- |
| GET    | `/categories`             | A, M, O |
| GET    | `/categories/:id`         | A, M, O |
| POST   | `/categories`             | A, M    |
| PATCH  | `/categories/:id`         | A, M    |
| PATCH  | `/categories/:id/status`  | A, M    |
| GET    | `/suppliers`              | A, M, O |
| GET    | `/suppliers/:id`          | A, M, O |
| GET    | `/suppliers/:id/products` | A, M, O |
| POST   | `/suppliers`              | A, M    |
| PATCH  | `/suppliers/:id`          | A, M    |
| PATCH  | `/suppliers/:id/status`   | A, M    |
| GET    | `/products`               | A, M, O |
| GET    | `/products/:id`           | A, M, O |
| POST   | `/products`               | A, M    |
| PATCH  | `/products/:id`           | A, M    |
| PATCH  | `/products/:id/status`    | A, M    |

Não existe `DELETE` em recurso nenhum, e não é esquecimento: um produto com movimentação
registrada não pode desaparecer sem destruir a integridade do histórico (§4.2). A
inativação preserva tudo e apenas retira o registro das novas operações.

### Auditoria — §5.11, Infraestrutura — §5.12

| Método | Rota                       | Papéis  |
| ------ | -------------------------- | ------- |
| GET    | `/audit`                   | A       |
| GET    | `/audit/:entity/:entityId` | A, M    |
| GET    | `/health`                  | público |
| GET    | `/health/ready`            | público |

A auditoria é somente leitura por desenho. Há caso de teste afirmando que `POST`, `PATCH`
e `DELETE` em `/audit` não são rota: um endpoint capaz de alterar o log anularia o
propósito dele.

---

## 16.3 Testes executados

### Unitários — 128 casos

| Arquivo                                        | O que protege                                |
| ---------------------------------------------- | -------------------------------------------- |
| `common/utils/decimal-scale.spec.ts`           | o mapa de escalas não divergir do schema     |
| `common/utils/search.spec.ts`                  | escape dos curingas do `LIKE`                |
| `common/utils/redact.spec.ts`                  | nenhum segredo e nenhum `Decimal` cru no log |
| `common/utils/pagination.spec.ts`              | allowlist de ordenação, cálculo de páginas   |
| `common/interceptors/decimal-serializer...`    | decimal como string, na escala do contrato   |
| `common/filters/all-exceptions.filter.spec.ts` | forma única do erro, sem vazar o interior    |
| `auth/token.service.spec.ts`                   | emissão, prazo e hash do refresh             |
| `config/env.validation.spec.ts`                | recusa de configuração inválida no boot      |

### Integração — 254 casos, PostgreSQL real

| Arquivo                | Casos | Foco                                                  |
| ---------------------- | ----- | ----------------------------------------------------- |
| `rbac.int-spec.ts`     | 53    | matriz de papéis por requisição real                  |
| `catalog.int-spec.ts`  | 50    | CRUD, validação, mass assignment, paginação, filtros  |
| `audit.int-spec.ts`    | 34    | existência do registro, ausência de dado sensível     |
| `auth.int-spec.ts`     | 34    | login, token, cookie, rotação, concorrência           |
| `users.int-spec.ts`    | 29    | papel, inativação, troca de senha                     |
| `security.int-spec.ts` | 21    | cabeçalhos, rate limit, entrada hostil, forma do erro |
| `health.int-spec.ts`   | 17    | sondas e documento OpenAPI                            |
| `contract.int-spec.ts` | 16    | as 31 rotas contra o contrato                         |

Pontos que valem registro:

**A matriz de RBAC é verificada por requisição, não por unidade.** Testar o `RolesGuard`
isolado provaria que ele compara papéis; não provaria que está plugado na rota, que é o
defeito que de fato acontece. Com o guard global e padrão de negar, esquecer o `@Roles`
fecha a rota em vez de abri-la, e a suíte confirma isso caso a caso.

**O 403 vem antes da existência do recurso e antes da validação do corpo.** Se a
autorização rodasse depois da busca, a diferença entre 403 e 404 diria a quem não tem
permissão se um id existe. A ordem está fixada por teste.

**A rotação concorrente foi revalidada.** Quatro casos: duas requisições simultâneas e
exatamente uma vence; exatamente um registro novo é criado, não dois; a perdedora é
tratada como reuso e derruba a cadeia; com cinco requisições paralelas o resultado é o
mesmo (uma vence, quatro recebem 401). A revogação e a inserção acontecem na mesma
transação — não só por atomicidade, mas por **ordenação**: criar o registro novo depois do
commit abriria uma janela em que a perdedora já revogou a cadeia e só então o vencedor
insere o token novo, que nasceria ativo. Esse defeito existiu e foi pego por este teste.

**A ausência de dado sensível é verificada no JSON inteiro**, não campo a campo: campo a
campo deixa passar exatamente o campo que ninguém pensou em conferir.

---

## 16.4 Defeitos encontrados pelos testes

Cinco defeitos reais, todos encontrados por caso de teste escrito nesta fase e todos
corrigidos. Nenhum deles aparecia no caminho de sucesso.

### 1. A auditoria de produto não existia, e falhava em silêncio

`AuditService.record()` engole a própria exceção de propósito: falha ao gravar o log não
deve derrubar uma operação já concluída, senão o usuário teria a ação revertida por causa
do registro dela. O preço é que o log pode falhar sem que nada reclame.

Foi o que aconteceu. O snapshot de produto levava `Prisma.Decimal`, e o percurso genérico
de `redactSensitive` o achatava em `{ constructor, s, e, d }`. O Prisma recusa gravar uma
função em coluna `Json`, a exceção era engolida, e **criar e alterar produto não deixavam
rastro nenhum**.

O comentário em `redact.ts` afirmava que `Decimal` era tratado. Só `Date` tinha guarda.

Corrigido convertendo `Decimal` em texto no snapshot, pela mesma função que a resposta
HTTP usa — um log com `10.5` ao lado de uma resposta com `"10.500"` obrigaria quem
investiga um incidente a decidir qual dos dois é o valor real.

### 2. `REFRESH_REUSE_DETECTED` estava na lista de ações e nada o emitia

O evento mais sensível do modelo de tokens. A detecção de reuso derrubava todas as sessões
do usuário e **não gravava nada**: quem investigasse um incidente veria as sessões caírem
sem motivo registrado.

O registro passou a acontecer em `TokenService.handleFailedRotation`, onde se sabe de quem
era o token — quem apresenta um refresh roubado não está autenticado, então o contexto da
requisição não tem autor.

### 3. `search=%` ignorava o filtro

O `contains` do Prisma monta `ILIKE '%' || $1 || '%'` com o termo parametrizado, então não
há injeção. Só que `%` e `_` são curingas **dentro** do padrão, e o Prisma não os escapa:

```
?search=%    →  ILIKE '%%%'    →  casa com tudo
?search=a_c  →  ILIKE '%a_c%'  →  casa com "abc", "axc", "a1c"
```

Duas consequências. A busca mente: procurar o produto "Desconto 50%" por `50%` devolvia o
catálogo inteiro. E o filtro deixava de ser filtro, com um caractere. Corrigido com escape
em um ponto único, aplicado aos quatro recursos que têm busca.

### 4. Erro de middleware do Express virava 500

O `body-parser` segue a convenção `http-errors`: lança um `Error` comum com `status`, não
uma `HttpException`. O filtro só reconhecia `HttpException`, então dois casos cotidianos
caíam no 500 genérico:

- corpo acima do limite (413)
- JSON malformado (400)

O cliente que esquecia uma vírgula no JSON recebia "Erro interno. Tente novamente" — que é
falso e manda a pessoa procurar no lugar errado — e cada erro de cliente entrava no alerta
de 5xx como falha de servidor.

### 5. Mensagens de framework vazavam na resposta

O contrato (§2.6) diz que `message` é texto para o usuário final, em português. Duas
mensagens passavam direto:

```
ThrottlerException: Too Many Requests
Expected property name or '}' in JSON at position 1
```

A primeira entrega o nome da classe do guard; a segunda, posição no buffer. O filtro já
tratava um caso desses (`Cannot GET /x`) com uma regex pontual; a verificação passou a ser
uma lista, documentada como lista de exclusão e com a alternativa registrada como
pendência (§16.8).

---

## 16.5 Decisões tomadas

**Escala do decimal vem da coluna, por nome de campo.** `Decimal.toString()` devolve `"0"`
para saldo zero, e o contrato promete `"0.000"`. A escala correta é a da coluna que gerou o
valor, e o valor não a carrega: `Decimal(14,3)` e `Decimal(14,4)` produzem o mesmo objeto
para o número 10. O serializador só tem o nome do campo, então é por ele que a escala é
decidida. O risco óbvio — coluna nova que ninguém registra — é coberto por um teste que lê
`schema.prisma` e falha se o mapa e o banco divergirem. O mapa não se mantém sozinho; o
teste o obriga.

**Erro de validação indexado pelo nome do campo.** O padrão do Nest devolve `details:
{ fields: [frases] }`: a chave se chama `fields` e não traz campo nenhum. Um formulário não
tem como saber em qual input pintar o erro. Passou a ser `{ fields: { name: [...] } }`.
Mudança de contrato, registrada na §5.1 — sem custo de compatibilidade, porque o frontend
só consome a API na Fase 6.

**Guarda de ambiente no seed.** Idempotência e segurança de reexecução são coisas
diferentes: o seed é idempotente (upsert por chave natural, senha nunca reescrita, saldo
nunca zerado em execução repetida), mas criava contas de demonstração com senha de
desenvolvimento em qualquer banco. Passou a recusar `NODE_ENV=production`. Os parâmetros
do Argon2 e a política de senha, que estavam duplicados no seed, passaram a vir das
constantes únicas do módulo de auth — era a dívida que o próprio arquivo registrava para
quando a Fase 4 chegasse.

**`PAYLOAD_TOO_LARGE` como código de erro próprio**, em vez de cair no genérico de 400: o
cliente precisa distinguir "seus dados estão errados" de "seu corpo é grande demais".

**Hash da senha de teste calculado uma vez por processo.** Todo usuário de teste usa a
mesma senha, então o hash é o mesmo, e Argon2id aloca 19 MiB por chamada de propósito
(ADR-0004). Calcular uma vez não enfraquece nada: o hash gravado é um Argon2id real, com os
parâmetros reais, e o login continua verificando-o de verdade a cada caso — a verificação é
o que está sob teste, e essa não é compartilhada. Entrou como tentativa de explicar o abort
da §16.7 e não o explicou; ficou porque é melhor do mesmo jeito.

---

## 16.6 Limitações aceitas

Nenhuma delas é defeito a corrigir: são consequências conhecidas de decisões registradas.

**Janela de até 15 minutos entre revogar e deixar de valer.** Alterar papel ou inativar
usuário revoga os refresh tokens, mas **não** invalida o access já emitido: ele vale até
expirar. É consequência de JWT sem lista de revogação (§8.12), detalhada em §15.5 do
plano, e há caso de teste que documenta a janela em vez de esconder. Uma lista de revogação
exigiria consulta ao banco por requisição, que é exatamente o custo que o JWT existe para
evitar.

**Rotação com detecção de reuso derruba duas abas que renovam ao mesmo tempo.** Não há como
distinguir a aba que perdeu a corrida de um token roubado. A política é tratar como roubo:
preferimos o falso positivo ao falso negativo.

**Rate limit em memória, por instância.** Duas instâncias atrás de um balanceador dobram o
limite efetivo. Redis entra quando houver mais de uma instância (§8.12).

**O log de auditoria vive no mesmo banco que ele audita.** Quem tem acesso direto ao
Postgres pode alterá-lo. Mitigação real exigiria sink externo append-only (R6).

**O papel vem do token enquanto ele durar.** Promover alguém no banco não dá acesso ao
token antigo, e rebaixar não o retira. Dois casos de teste fixam o comportamento nas duas
direções, para que seja decisão registrada e não surpresa.

**A resposta HTTP não distingue conta inexistente de senha errada**, de propósito — senão
daria para descobrir quais e-mails existem testando um por um. O log distingue, e é o que
permite ver que uma conta específica está sob ataque.

---

## 16.7 Pendência aberta: o processo aborta de forma intermitente

**Isto não é falha de teste. É o processo morrendo, e o problema não está no projeto.**

A suíte de integração às vezes termina com exit code `0xC0000409`
(`STATUS_STACK_BUFFER_OVERRUN`, que no Windows é também o código do `abort()` da CRT), com
**stderr completamente vazio**, nenhum erro de JavaScript, nenhuma asserção falhando e
nenhum evento no WER. A ausência de evento no WER é informação: `__fastfail` não passa pelo
relatório de erro do Windows, então a assinatura é de `abort()` nativo deliberado, não de
exceção de hardware.

### Medição

Vinte execuções consecutivas da suíte completa, com o código desta fase:

| Execuções | Resultado                                     |
| --------- | --------------------------------------------- |
| 18 de 20  | `254 passed (254)`, sem erro                  |
| 2 de 20   | processo abortado, um arquivo deixou de rodar |

Taxa de 10%. As duas execuções com abort foram a 11 e a 17, perdendo 2 e 5 casos.

### O experimento que mudou a investigação

A primeira rodada de hipóteses olhou para dentro do projeto — Argon2, listeners TCP,
transformação de módulos. Nenhuma delas se sustentou quando o ciclo da suíte foi
reproduzido **fora do Vitest**: um script que sobe a app Nest, faz requisições, fecha e
repete, rodando contra o `dist/` já compilado pelo `nest build`.

Esse script aborta com a mesma assinatura. Isso elimina, de uma vez, o Vitest, o `@swc/core`
e o Rolldown: nenhum dos três participa da execução de código compilado.

A partir daí a redução foi por bissecção, cada cenário com três a oito execuções de 20 a 200
ciclos:

| Cenário                                          | Abortou | Conclusão                       |
| ------------------------------------------------ | ------- | ------------------------------- |
| App Nest + Prisma + Argon2 + requisições         | 2 de 3  | reproduz fora do Vitest         |
| **Sem** Argon2 (hash fixo)                       | 3 de 3  | Argon2 descartado               |
| **Sem** requisições (app sobe, escreve, fecha)   | 0 de 3  | precisa do tráfego HTTP         |
| Sem app Nest (só Prisma + Argon2)                | 0 de 3  | consistente                     |
| Express puro + supertest, sem middleware         | 1 de 3  | Nest, pino e helmet descartados |
| `http.createServer` puro + supertest             | 1 de 3  | Express descartado              |
| `http.createServer` puro + cliente `http` nativo | 1 de 6  | supertest descartado            |

O mínimo reproduzível não tem nada do projeto dentro: **Node 24.15.0 no Windows, criando um
servidor HTTP, fazendo algumas dezenas de requisições, fechando o servidor e repetindo.**

### Causa provável, com o que a sustenta

O abort está na camada de sockets do runtime — Node 24.15.0 com libuv 1.51.0 — neste
Windows 11 build 26200, sob rotatividade alta de conexões TCP. O que sustenta isso:

- reproduz sem Vitest, sem Express, sem supertest, sem Nest, sem Prisma e sem Argon2;
- `abort()` nativo com stderr vazio: não há caminho de JavaScript que produza isso;
- o cenário sem tráfego HTTP nunca abortou, em nenhuma configuração;
- não há LSP de terceiro no catálogo Winsock e a proteção em tempo real do Defender está
  desligada, então não há hook externo em socket para explicar a falha;
- `--report-on-fatalerror` não produz relatório, consistente com `__fastfail`, que não passa
  pelo manipulador de erro fatal do Node.

Não dá para apontar a linha exata de libuv sem um dump nativo, e obter um exigiria alterar
configuração do sistema (`LocalDumps` no registro). Isso não foi feito: é mudança de máquina
do usuário, fora do escopo da fase.

### Um experimento que foi invalidado, e o que sobrou dele

Com o tráfego HTTP identificado como necessário, a hipótese seguinte foi a rotatividade de
conexões. A suíte abre cerca de 650 conexões de loopback por execução — medido por
TIME_WAIT, contra 17 de baseline com a máquina parada — e um agente com `keepAlive`
reduz 200 requisições de 200 conexões para 1.

A primeira comparação deu 0 de 6 nos dois braços, e estava **errada**: o braço "sem
keep-alive" passava `agent: undefined`, que cai no `globalAgent` do Node — e esse tem
`keepAlive` ligado por padrão desde o Node 19. Os dois braços eram o mesmo teste. Com
`agent: false`, que desliga o pool de verdade, os braços passaram a abrir 12.000 e 200
conexões por execução:

| Braço                               | Abortou |
| ----------------------------------- | ------- |
| sem pool (12.000 conexões/execução) | 1 de 8  |
| com pool (200 conexões/execução)    | 0 de 8  |

Direcionalmente consistente com a rotatividade importar, e **sem poder estatístico para
afirmar**: com taxa base na casa de 10%, oito execuções por braço não distinguem um efeito
real de variação. Fica registrado como hipótese não resolvida, não como causa.

### O que NÃO ficou estabelecido

- O gatilho exato dentro do Node ou do libuv. Apontá-lo exigiria um dump nativo, e obtê-lo
  exigiria habilitar `LocalDumps` no registro do Windows — alteração na máquina, fora do
  escopo desta fase e não feita.
- Se reduzir a rotatividade de conexões reduz a taxa. O experimento acima é sugestivo e
  insuficiente.

### Hipóteses descartadas, com a evidência de cada descarte

| Hipótese                                        | Como foi descartada                                                                 |
| ----------------------------------------------- | ----------------------------------------------------------------------------------- |
| Vazamento de conexão do Postgres                | conexões medidas durante a suíte: pico de 2, zero entre arquivos                    |
| Volume de hashes Argon2 no mesmo processo       | cenário sem Argon2 abortou 3 de 3                                                   |
| `@swc/core` ou Rolldown na transformação        | reproduz contra o `dist/` compilado, onde nenhum dos dois roda                      |
| Vitest, pool de workers ou `isolate`            | reproduz em script Node comum, sem Vitest                                           |
| supertest                                       | reproduz com o cliente `http` nativo                                                |
| Express, Nest, pino-http, helmet, cookie-parser | reproduz com `http.createServer` puro                                               |
| Exaustão de portas efêmeras                     | pico de 39 conexões em TIME_WAIT, com 64.511 portas disponíveis                     |
| Teto de memória do processo                     | RSS entre 85 MB e 260 MB no momento do abort, e execuções limpas chegaram mais alto |
| Antivírus ou LSP hookando Winsock               | nenhum LSP de terceiro; Defender em tempo real desligado                            |
| Código de um arquivo de teste específico        | cada arquivo passa indefinidamente quando roda sozinho                              |

### Correção de um registro anterior

A versão anterior desta seção atribuía a melhora na taxa ao fim da rotatividade de portas
efêmeras. **Essa atribuição estava errada:** a medição mostrou pico de 39 conexões em
TIME_WAIT contra 64.511 portas disponíveis, então nunca houve exaustão, e a diferença
observada entre as baterias cabe na variação da própria medição.

A mudança que a originou — a app de teste escutar uma vez por arquivo, em vez de o supertest
abrir uma porta por requisição — foi mantida, mas pelo que ela é de fato: um listener por
arquivo em lugar de centenas é simplesmente melhor, e reduziu a duração da suíte. Não é
correção da causa raiz, e não está sendo apresentada como tal.

### O que NÃO foi feito, de propósito

Nenhum teste foi desativado, nenhuma falha foi silenciada e nenhuma repetição automática
(`retry`) foi configurada. Repetir até passar transformaria um abort de runtime em verde, o
que é pior do que a instabilidade: esconderia a única evidência de que algo está errado.

### Situação e próximo passo

**A investigação está encerrada por decisão, não por conclusão.** Fica como pendência
documentada.

O próximo passo, quando houver interesse em retomá-la, é o teste decisivo que não foi
feito: rodar o script mínimo em outra linha do Node — 24 LTS mais recente ou 22 LTS — e
comparar a taxa. Se a taxa cair a zero, confirma a suspeita de que o defeito é da
combinação Node 24.15.0 / libuv 1.51.0 com este build do Windows; se não cair, a suspeita
morre e sobra o dump nativo. Trocar a linha do Node mexe no `.nvmrc` e na matriz do CI, que
são decisões de ambiente.

Enquanto a pendência existir, a limitação vale: **uma execução com `Errors` no rodapé não é
verde**, mesmo que a linha de testes diga "passed", e a Fase 4 não deve ser declarada
encerrada enquanto isso for verdade.

---

## 16.8 Outras pendências

**Converter os `NotFoundException('...')` dos services em erros de domínio.** Hoje a
mensagem em português chega ao cliente porque o filtro mantém mensagem que não casa com os
padrões de framework. É uma lista de exclusão, e a próxima mensagem de framework não
estará nela. Com todo erro próprio sendo `DomainError`, a regra se inverte: só mensagem
declarada pelo projeto é usada, e o resto cai no texto padrão do status.

**Limite de corpo explícito.** O 413 hoje vem do padrão do Express (100 kB). O valor
deveria ser decisão declarada no `configureApp`, não herança silenciosa.

**`GET /products/:id/movements`** — Fase 5, com o módulo de movimentação.

---

## 16.9 Arquivos alterados

80 caminhos. Resumo por área:

| Área               | O que entrou                                                        |
| ------------------ | ------------------------------------------------------------------- |
| `src/auth/`        | login, rotação, logout, `/me`, estratégia JWT, guards de rate limit |
| `src/users/`       | CRUD, troca de papel, inativação, troca da própria senha            |
| `src/categories/`  | CRUD e inativação com UPDATE condicional                            |
| `src/suppliers/`   | CRUD, inativação, produtos do fornecedor                            |
| `src/products/`    | CRUD, inativação, filtro por situação de estoque                    |
| `src/audit/`       | serviço, contexto por `AsyncLocalStorage`, consulta somente leitura |
| `src/common/`      | guards, decorators, DTOs de paginação, erros, interceptors, utils   |
| `src/prisma/`      | omissão global de `passwordHash`                                    |
| `src/bootstrap.ts` | factory de erro de validação, documento OpenAPI extraído            |
| `prisma/seed.ts`   | guarda de produção, constantes unificadas                           |
| `backend/test/`    | seis arquivos de integração novos, helpers e fixtures               |
| `docs/`            | §5.1 e §5.7 atualizadas, este relatório                             |

Nenhuma migration nova: o schema da Fase 2 já previa `users`, `refresh_tokens` e
`audit_logs`. Nenhuma alteração no frontend.

---

## 16.10 Critérios de aceite

| Critério (§15)                                       | Situação                                                  |
| ---------------------------------------------------- | --------------------------------------------------------- |
| 31 rotas respondendo conforme o §5                   | atendido, conferido por teste de contrato                 |
| RBAC com padrão de negar                             | atendido, matriz verificada por requisição real           |
| Nenhuma exposição de senha, hash ou token            | atendido, verificado no JSON inteiro em resposta e em log |
| Transações e concorrência tratadas                   | atendido; um defeito de ordenação encontrado e corrigido  |
| Testes unitários, de integração e de segurança reais | atendido, 382 casos contra banco real                     |
| Auditoria das ações de escrita                       | atendido; dois defeitos encontrados e corrigidos          |
| Validação de entrada e prevenção de mass assignment  | atendido, com casos negativos por recurso                 |
| Erros padronizados                                   | atendido; dois vazamentos corrigidos                      |
| Nenhuma alteração no frontend                        | atendido                                                  |
| Suíte determinística                                 | **não atendido** — ver §16.7                              |

Nenhum teste foi desativado, nenhuma regra de lint foi suprimida e nenhuma validação foi
enfraquecida para obter resultado verde. Os cinco defeitos da §16.4 foram corrigidos no
código, não nos testes; nos três casos em que a premissa do teste estava errada, o teste
foi corrigido e o motivo está no comentário dele.
