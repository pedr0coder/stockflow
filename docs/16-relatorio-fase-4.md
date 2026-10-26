# 16. Relatório da Fase 4 — Backend: autenticação e cadastros

Fase planejada em [docs/15-plano-fase-4.md](15-plano-fase-4.md). Este documento registra o
que foi implementado, o que os testes encontraram, o que ficou fora e o que permanece
aberto.

---

## 16.1 Resumo verificado

Todos os números abaixo vêm de execução real, não de estimativa.

> Esta tabela é o retrato do **fechamento da implementação** (commit `10be336`). O estado
> atual, depois da estabilização, está na §16.11: a contagem de testes mudou e a auditoria
> de dependências passou por avisos novos e foi zerada de novo (§16.11.4).

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

**Resolvidas na estabilização (§16.11):**

- ~~Converter os `NotFoundException('...')` dos services em erros de domínio.~~ Feito:
  quatro classes em `common/errors/not-found.errors.ts`, mesmo status, `code` e mensagem.
  A lista de exclusão do filtro **continua existindo**, por um motivo que esta pendência
  não previa: `common/utils/pagination.ts` ainda lança `BadRequestException` com mensagem
  do projeto. Inverter a regra para "só mensagem de `DomainError`" exigiria converter esse
  caso também, e fica para quando houver outro motivo para mexer nele.
- ~~Limite de corpo explícito.~~ Feito: 16 KiB, declarado em `configureApp`.

**`GET /products/:id/movements`** — Fase 5, com o módulo de movimentação.

**Auditoria de dependências:** tratada na §16.11.4.

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

---

## 16.11 Estabilização pós-CI

Etapa feita depois de o CI (GitHub Actions, Linux) concluir com sucesso no commit
`10be336`. O resultado do CI foi **confirmado pelo responsável do projeto**; esta sessão
não tem acesso aos jobs do Actions e não o verificou por conta própria.

**O CI verde no Linux não prova que o defeito da §16.7 desapareceu.** O abort é
intermitente, e aparece (ou não) conforme a combinação de runtime e sistema. Um resultado
verde em outra plataforma é compatível com a hipótese de que o problema é específico do
Node 24.15.0 neste Windows, mas não a confirma. A pendência continua aberta nos termos da
§16.7.

### 16.11.1 O que mudou

| Item  | Antes                                                       | Depois                                                                                                        |
| ----- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| 404   | `NotFoundException('...')` lançada pelos services           | `CategoryNotFoundError`, `ProductNotFoundError`, `SupplierNotFoundError`, `UserNotFoundError` (`DomainError`) |
| Corpo | limite de 100 KiB herdado do padrão do Express, sem escolha | `REQUEST_BODY_LIMIT_BYTES` = 16 KiB, declarado em `configureApp`                                              |

**O contrato público não mudou** para os 404: mesmo status (404), mesmo `code`
(`NOT_FOUND`), mesma mensagem em português, mesmas chaves na resposta (sem `details`). Para
o corpo, o 413 e o `code` `PAYLOAD_TOO_LARGE` já existiam; o que mudou é o valor do teto,
de 100 KiB para 16 KiB, agora documentado em `docs/05-api.md` §5.1.

### 16.11.2 Decisões técnicas

**Uma classe por recurso, em vez de uma classe com o nome como parâmetro.** A mensagem
fica fixa e revisável num só arquivo, e o teste pode apontar para o erro exato. A base
`ResourceNotFoundError` carrega `code` e status, então uma quinta classe (Fase 5) é uma
linha. Sem `details`, de propósito: a resposta atual não os trazia e o id já está na URL.

**16 KiB, e não outro número.** Todo endpoint de escrita recebe um único recurso, nunca
lista, e cada campo de texto tem `MaxLength`. O maior corpo legítimo é o de produto, com
cerca de 1,5 mil caracteres; no pior caso de codificação (todo caractere escapado como
`\uXXXX`, 6 bytes) isso dá cerca de 9 KiB. O teto fica ~1,8x acima. O padrão de 100 KiB é
~11x o pior caso real, e o corpo é lido **antes** dos guards, então o custo vale também
para a rota pública de login. O cálculo está no comentário da constante.

**Quando o limite precisar subir.** Se aparecer endpoint legitimamente maior (importação
em lote), o caminho é um parser com limite próprio naquela rota, e não aumentar o teto
global.

**`urlencoded` continua registrado, com o mesmo teto.** A API só fala JSON, mas remover o
parser mudaria o comportamento (um formulário passaria a chegar como corpo vazio). Mantê-lo
com o padrão deixaria uma segunda herança silenciosa do mesmo valor que se queria declarar.

**O registro é por `app.useBodyParser`, antes do `init()`.** O Nest só instala os parsers
dele quando não encontra `jsonParser` e `urlencodedParser` já aplicados, então os nossos
substituem o padrão em vez de se somarem a ele. Ficou em `configureApp`, e portanto vale
idêntico em produção e nos testes.

**A lista de exclusão do filtro foi mantida.** Ver §16.8: o `BadRequestException` de
`pagination.ts` ainda depende dela. O comentário do filtro foi atualizado para refletir o
estado real, em vez de apontar uma pendência que não existe mais.

### 16.11.3 Testes

| Suíte                | Antes (§16.1) | Depois | Novos |
| -------------------- | ------------- | ------ | ----- |
| Unitários (backend)  | 128           | 147    | 19    |
| Integração (backend) | 254           | 293    | 39    |

Novos de integração:

- `test/not-found.int-spec.ts` (20): 14 rotas por id inexistente, em quatro recursos
  (`GET`, `PATCH`, `PATCH .../status`, `.../role`, `GET .../products`), cada uma verificando
  o contrato inteiro da resposta; mais ausência de 5xx e igualdade de resposta entre
  consulta e alteração.
- `test/security.int-spec.ts` (19): fronteira do limite byte a byte (exatamente 16 KiB
  passa o parser e cai na validação; 16 KiB + 1 é 413), forma do 413, limite antes da
  autenticação (login público e rota protegida sem token), `urlencoded`, e 12 formas de
  corpo ilegível, todas 4xx no contrato único: JSON truncado, vírgula sobrando, aspas
  simples, texto solto, string/número/`null` no topo, corpo vazio, array no lugar de
  objeto, charset fora de `utf-*` (415), `Content-Encoding` desconhecido (415) e
  `Content-Type` de texto.

Novos unitários: classes de erro (12), mapeamento no filtro (5), e o ramo de
`UsersService.changeOwnPassword` que não é alcançável por HTTP, porque a estratégia JWT
recusa o token de usuário apagado com 401 antes (2).

**Os testes têm dentes.** Removendo temporariamente o limite explícito, cinco casos passam
a falhar (os que fixam a fronteira, o 413 e o limite pré-autenticação). O caso antigo de
2 MB **não** falharia: passa com qualquer valor razoável, e por isso não prova que o
limite foi declarado.

**Três premissas minhas estavam erradas e foram corrigidas no teste, não no código:** a
regex que proibia `limit` casava com "limite", do texto do projeto; `charset=utf-7` é
aceito pelo `body-parser` (só recusa o que não começa com `utf-`), então o caso de charset
não suportado passou a usar `iso-8859-1`; e uma asserção sobre `'details' in erro` supunha
ausência de propriedade, quando a classe-base a declara com `undefined`. O que importa é a
chave não chegar à resposta, e isso é verificado no filtro e na integração.

### 16.11.4 Auditoria de dependências

Os avisos do `npm audit` eram novos em relação ao fechamento da implementação (a §16.1
dizia zero e já não valia). Foram tratados nesta etapa, sem `--force` e sem rebaixar
nenhum major.

**Versões, antes e depois**

| Pacote        | Antes | Depois | Como                                            | Advisory                             |
| ------------- | ----- | ------ | ----------------------------------------------- | ------------------------------------ |
| `body-parser` | 2.3.0 | 2.4.0  | `npm audit fix` (transitiva de `express` 5.2.1) | GHSA-27r3-jxmh-p828, alta            |
| `fast-uri`    | 3.1.8 | 3.1.9  | `npm audit fix`, no backend **e** na raiz       | quatro avisos, moderada              |
| `multer`      | 2.4.0 | 2.5.0  | `overrides` no `backend/package.json`           | GHSA-q7qp-rjg7-q26m, alta (CVSS 7.5) |

`express` (5.2.1), `@nestjs/*` (12.1.3), `typescript` e as demais dependências aprovadas
**não mudaram**. Os lockfiles têm três versões alteradas (mais as faixas declaradas de
`content-type`, `iconv-lite` e `qs` dentro do `body-parser`, que já estavam satisfeitas),
todas resolvidas no registro oficial do npm, todas no mesmo major.

**Resultado do `npm audit`**

| Local                  | Antes                   | Depois |
| ---------------------- | ----------------------- | ------ |
| raiz                   | 1 moderada              | 0      |
| backend (completo)     | 6 (1 moderada, 5 altas) | 0      |
| backend (`--omit=dev`) | 5 (1 moderada, 4 altas) | 0      |
| frontend               | 0                       | 0      |

**`body-parser` e `fast-uri`.** Correção direta, compatível, aplicada pelo `npm audit fix`.
O limite de 16 KiB (§16.11.2) não substituía isso: o aviso é de bytes sobrando depois de
um corpo comprimido, e a aplicação aceita corpo comprimido porque o Express infla por
padrão. A versão 2.4.0 corrige a causa.

**`multer`: investigação.**

- Cadeia: `@nestjs/core` e `@nestjs/testing` → `@nestjs/platform-express` → `multer`.
- O advisory vale para `multer >= 2.0.0, < 2.5.0` e só é explorável com **`fileFilter`
  assíncrono**: um aborto da requisição enquanto o filtro de outro arquivo ainda está
  pendente derruba o processo.
- **Não existe correção por atualização do Nest.** O `@nestjs/platform-express` 12.2.0,
  a versão mais recente da linha 12, ainda fixa `multer` exatamente em 2.4.0, como a
  12.1.3 instalada. A única saída do `npm audit fix --force` era instalar a 11.1.1, um
  rebaixamento de major, recusado.
- A correção adotada é um `overrides` de `multer` para 2.5.0, um bump de minor dentro do
  major 2, que é a versão corrigida publicada pelo próprio advisory.
- **Exposição real do StockFlow, antes da correção:** nenhuma que se consiga demonstrar.
  Não há `FileInterceptor`, `FilesInterceptor`, `fileFilter`, `multipart` nem upload em
  `src/` ou `test/`, e o teste de contrato não menciona `multipart`.
  O `multer` só é carregado quando um desses interceptors é usado. Isso é ausência de
  uso, e não prova de impossibilidade: a conclusão vale para o código atual.
- **Limitação que permanece.** O `override` é uma divergência declarada do que o Nest
  fixa. Ela é segura enquanto o `multer` 2.5.0 for compatível com a API que o Nest usa,
  e nada nele é exercitado por este projeto. Quando o Nest publicar uma versão que fixe
  `multer >= 2.5.0`, o `override` deve ser **removido**, para não esconder um
  descompasso futuro. O CI não tem passo de `npm audit`, então um aviso novo continuará
  sem derrubá-lo.

**Compatibilidade verificada.** Node 24.15.0, NestJS 12.1.3 e Express 5.2.1 inalterados;
`body-parser` 2.4.0 declara `node >= 18`; typecheck, lint, build, 147 testes unitários e
os 293 de integração rodam nas versões novas (a suíte de integração inclui os testes do
limite de corpo, que exercitam o `body-parser` diretamente).

### 16.11.5 Verificações executadas

| Verificação                       | Resultado                                                                                                                                                                       |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run lint` (raiz: back+front) | sem erro                                                                                                                                                                        |
| `npm run typecheck` (raiz)        | sem erro                                                                                                                                                                        |
| `npx prettier --check .`          | todos os arquivos conformes                                                                                                                                                     |
| Testes unitários (backend)        | 147 passando, 11 arquivos                                                                                                                                                       |
| `npm run build` (backend)         | sem erro                                                                                                                                                                        |
| `npm audit` (raiz, back, front)   | 0 vulnerabilidades nos três                                                                                                                                                     |
| Verificação de segredos           | limpa: só `.env.example` versionado, `.env` ignorado, nenhum padrão de token no diff, nos lockfiles ou em todo o histórico; todo `resolved` novo aponta para o registro oficial |
| Testes de integração (backend)    | 293 passando **quando o processo não aborta**; ver abaixo                                                                                                                       |

A suíte de integração rodou contra PostgreSQL 17 real (container `stockflow-db`), em Node
24.15.0 no Windows, a mesma combinação da §16.7. A primeira execução (código desta etapa,
antes da correção dos testes novos) teve 2 falhas, ambas em premissas dos testes descritas
na §16.11.3.

### 16.11.6 O abort do Node 24 no Windows, medido de novo

**Continua acontecendo, e não foi mascarado.** Todas as ocorrências têm a mesma
assinatura da §16.7: o worker sai com código `3221226505` (`0xC0000409`) no meio de um
arquivo de integração, o Vitest registra `Unhandled Error`, e o rodapé mostra `Errors`.
Nenhuma execução foi repetida para obter verde: cada uma está contada abaixo.

| Conjunto                                  | Execuções | Com abort | Taxa |
| ----------------------------------------- | --------- | --------- | ---- |
| Medição original (§16.7), 254 casos       | 20        | 2         | 10%  |
| Esta etapa, dependências **antigas**, 293 | 17        | 6         | 35%  |
| Esta etapa, dependências **novas**, 293   | 17        | 5         | 29%  |

(O conjunto "antigas" é o controle: o mesmo código, com os lockfiles revertidos e
`npm ci`, e depois restaurados e conferidos. Mais duas execuções iniciais, antes do
`npm audit fix`, passaram limpas e não entram na tabela.)

O que isso permite afirmar:

- **A atualização de dependências não causou nem agravou o abort.** Com as versões
  antigas a taxa foi igual ou maior. Com 17 execuções por lado a diferença entre 35% e 29%
  não é distinguível de ruído, e a conclusão é só "sem efeito detectável".
- **A taxa desta etapa é maior que a da §16.7, e não sei explicar por quê.** As
  diferenças são o tamanho da suíte (293 casos, e 39 deles com requisições a mais), a
  carga da máquina no momento e o acaso, com amostras pequenas. **Não está estabelecido**
  que a suíte maior piora o defeito, nem que ele piorou por outra causa.
- O arquivo abortado varia (`users`, `rbac`, `not-found`, entre outros), coerente com a
  hipótese da §16.7 de uma falha na camada de sockets do runtime, e não de um teste ou de
  uma dependência específica.

A pendência permanece **aberta e não resolvida**. O próximo passo continua sendo o
descrito na §16.7: o script mínimo em outra linha do Node.

### 16.11.7 Pendências restantes

1. **Abort intermitente do Node 24 no Windows** (§16.7, §16.11.6). Aberta, **não
   resolvida**, sem retry nem teste desativado. O CI verde no Linux não a fecha.
2. **`override` do `multer`** (§16.11.4): remover quando o Nest fixar `multer >= 2.5.0`.
3. **O CI não audita dependências.** Sugerido como passo do pipeline; não foi feito.
4. **Lista de exclusão do filtro** (§16.8): resíduo, ligado ao `BadRequestException` de
   `pagination.ts`.
5. **`GET /products/:id/movements`**: Fase 5.

### 16.11.8 Arquivos alterados nesta etapa

Código: `src/bootstrap.ts`, `src/common/errors/not-found.errors.ts` (novo),
`src/common/filters/all-exceptions.filter.ts` (comentário), e os quatro services
(`categories`, `products`, `suppliers`, `users`).

Testes: `src/common/errors/not-found.errors.spec.ts` (novo),
`src/common/filters/all-exceptions.filter.spec.ts`, `src/users/users.service.spec.ts`
(novo), `test/not-found.int-spec.ts` (novo), `test/security.int-spec.ts`.

Dependências: `backend/package.json` (`overrides`), `backend/package-lock.json` e
`package-lock.json`.

Documentação: este relatório, `docs/05-api.md` §5.1 e `docs/09-roadmap.md`.

Nenhuma alteração no frontend, nenhuma migration.

### 16.11.9 Verificação final antes de versionar

Feita sobre instalação limpa (`node_modules` removidos e `npm ci` na raiz e no backend):

- `npm ls multer` mostra `multer@2.5.0 overridden`, com `body-parser@2.4.0` e
  `fast-uri@3.1.9` na raiz e no backend. Lockfiles e árvore instalada sincronizados, sem
  item inválido ou ausente.
- `npm audit` (raiz, backend, frontend): 0 vulnerabilidades.
- Lint e typecheck (raiz), prettier e build do backend: sem erro.
- 147 unitários do backend e 105 do frontend (intocado) passando; 293 de integração
  passando nesta execução. Uma execução limpa **não** altera o que a §16.11.6 mediu.
- Diff revisado: sem segredo, sem arquivo temporário, sem `.only`, `.skip` ou depuração.

---

## 16.12 Encerramento da Fase 4

**A Fase 4 é encerrada com ressalva**, por decisão do responsável do projeto. O que isso
significa, sem arredondar:

- **Entregue e verificado:** autenticação, RBAC, cadastros, auditoria, erros padronizados,
  404 como erro de domínio, limite explícito de corpo (16 KiB), dependências sem aviso
  conhecido e CI em Linux concluído com sucesso no commit `10be336` (confirmado pelo
  responsável). O CI das alterações desta etapa só é dado como aprovado depois de
  verificado.
- **Ressalva aceita, não resolvida:** o abort intermitente do Node 24.15.0 no Windows
  (§16.7). O critério "suíte determinística" da §16.10 **continua não atendido** no
  ambiente local. A taxa foi medida entre 10% e 35% das execuções, a causa não foi
  estabelecida e o teste decisivo (outra linha do Node) não foi feito. O CI verde em
  Linux é compatível com uma causa específica do ambiente, mas não a comprova.
- **Pendências que seguem adiante:** as da §16.11.7.
