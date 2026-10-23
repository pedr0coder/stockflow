# 15 — Plano de Execução da Fase 4 (Backend: autenticação e cadastros)

> Objetivo do roadmap aprovado: entregar **autenticação real, RBAC verificado no servidor
> e os quatro cadastros completos**, com auditoria automática.
>
> É a fase em que o sistema deixa de ser interface e passa a ter regra. Também é a fase em
> que a promessa central da §8.3 precisa virar código verificável: esconder botão não é
> autorização.

## 15.1 Estado verificado do repositório

Conferido antes de planejar.

| Item                 | Estado                |
| -------------------- | --------------------- |
| Branch               | `main`                |
| `HEAD`               | `f560687`             |
| `origin/main`        | `f560687`             |
| Sincronia            | atrás 0, à frente 0   |
| Árvore de trabalho   | limpa                 |
| Commits              | 30                    |
| Arquivos versionados | 147                   |
| CI                   | verde nos quatro jobs |

Backend hoje: 15 arquivos TypeScript em `src`, com `config`, `common/errors`,
`common/filters`, `prisma` e `health`. Nenhum módulo de domínio existe ainda.

## 15.2 Escopo aprovado

Transcrito do roadmap, sem alteração:

- Módulo `auth`: login, refresh rotativo, logout, `/me`; Argon2id; `RefreshToken`
- `JwtAuthGuard` + `RolesGuard` globais; `@Public()`, `@Roles()`, `@CurrentUser()`
- `users`, `categories`, `suppliers`, `products` completos (§05)
- Paginação, busca, filtro e ordenação com allowlist
- Rate limiting em `/auth`
- `AuditInterceptor` + módulo `audit` com redação testada
- Testes: unitários de serviço e guard; integração de auth, RBAC e CRUDs

### Fora da Fase 4

| Item                                                        | Fase                              |
| ----------------------------------------------------------- | --------------------------------- |
| Movimentação de estoque, inventário, relatórios, dashboard  | 5                                 |
| Qualquer alteração no frontend, inclusive consumir esta API | 6                                 |
| Recuperação de senha por e-mail                             | pós-MVP, exige provedor de e-mail |
| Cadastro público de usuário                                 | fora do MVP, por decisão da §5.2  |

## 15.3 Inconsistências encontradas antes de implementar

Nove pontos levantados na auditoria entre documentação e código. Três precisam de decisão
sua; os outros seis são registro.

### Precisam de decisão

**I1. `GET /products/:id/movements` não cabe na Fase 4.**

A §5.6 lista esse endpoint entre os de produtos, e o roadmap diz "produtos completos
(§05)". Mas ele lê `StockMovement`, cujo módulo é da Fase 5. Implementá-lo agora
significaria criar meio módulo de movimentação fora da fase dele.

**Proposta:** adiar esse endpoint para a Fase 5, junto do módulo que o alimenta. Os outros
cinco endpoints de `/products` entram completos agora. Registrado aqui para que "produtos
completos" não seja lido depois como promessa não cumprida.

**I2. `@Exclude()` sozinho não garante que `passwordHash` nunca vaze.**

A §5.3 e o critério de aceite dizem que `passwordHash` nunca é serializado, "garantido por
`@Exclude()` na entidade". Dois problemas: o `ClassSerializerInterceptor` **não está
configurado** hoje, e mesmo configurado ele só age sobre instâncias de classe, enquanto o
Prisma devolve objetos simples. Bastaria um service devolver o objeto cru do Prisma para o
hash sair na resposta.

**Proposta: defesa em duas camadas, com a primeira mais forte que a do documento.**

A primeira é omitir o campo **na origem**. O Prisma 7 aceita omissão global por modelo nas
opções do cliente, o que foi verificado no cliente gerado deste projeto:

```ts
new PrismaClient({ adapter, omit: { user: { passwordHash: true } } });
```

Com isso o campo deixa de vir do banco por padrão, em qualquer consulta, em qualquer
service, escrito por qualquer pessoa. O módulo de autenticação, que precisa dele para
conferir a senha, passa a **pedir explicitamente** com `omit: { passwordHash: false }`. O
vazamento deixa de ser o comportamento padrão e passa a exigir uma linha deliberada.

A segunda camada é a prevista no documento: entidades com `@Exclude()` e o
`ClassSerializerInterceptor` ligado globalmente.

A terceira é o teste: assertiva direta sobre o corpo de cada resposta que envolve usuário.

**I3. A chave de revogação em cadeia precisa ser definida.**

O ADR-0005 diz que o reuso de um refresh já rotacionado revoga "toda a cadeia daquele
usuário". O campo `replacedById` existe no schema, mas como coluna simples, não como
auto-relação: não dá para percorrer a cadeia com um `include`.

**Proposta:** revogar **todos os refresh tokens ativos daquele usuário**, que é literalmente
o que o ADR descreve e é a resposta correta a um indício de roubo de token. O
`replacedById` continua sendo gravado, porque é ele que permite detectar o reuso e, depois,
reconstruir a cadeia numa investigação. Sem mudança de schema.

### Registro, sem decisão pendente

**I4. `@nestjs/throttler` está instalado e não configurado.** Previsto desde a Fase 2 e é
trabalho desta fase.

**I5. As rotas de health precisam de `@Public()`.** Já há comentário no
`health.controller.ts` avisando. Quando os guards virarem globais, o health check do
orquestrador passaria a receber 401. É item de aceite desta fase.

**I6. O `common/` ainda não tem a estrutura da §2.4.** Faltam `decorators/`, `guards/`,
`interceptors/` e `dto/`. Não é divergência: é o trabalho desta fase.

**I7. O `ValidationPipe` está inline no `bootstrap.ts`, e a §2.4 previa `common/pipes/`.**
A pasta era para pipe **próprio**, e o que existe é configuração do pipe do framework, que
pertence à composição da aplicação. Fica como está; a §2.4 será ajustada no fim da fase.

**I8. A sidebar mostra `/audit` só para ADMIN, e a §5.11 dá `GET /audit/:entity/:entityId`
a ADMIN e MANAGER.** Não é conflito: a tela global de auditoria é de ADMIN, e o MANAGER
consulta o histórico de uma entidade específica a partir da tela dela, na Fase 6.

**I9. `UserRole` existe no Prisma e também em `frontend/src/types/auth.ts`.** Duplicação
deliberada, pelo mesmo raciocínio do ADR-0002: os dois pacotes são deployáveis de forma
independente, e compartilhar tipo criaria acoplamento de build. Um teste de contrato na
Fase 6 verifica que os valores coincidem.

## 15.4 Endpoints

Transcritos da §05, com a coluna de fase para deixar explícito o que fica de fora.

### `/auth`

| Método | Rota            | Papéis      | Observação                                  |
| ------ | --------------- | ----------- | ------------------------------------------- |
| POST   | `/auth/login`   | público     | Access no corpo, refresh em cookie httpOnly |
| POST   | `/auth/refresh` | cookie      | Rotaciona e emite novo access               |
| POST   | `/auth/logout`  | autenticado | Revoga o refresh atual, responde 204        |
| GET    | `/auth/me`      | autenticado | Usuário atual e papel                       |

### `/users`

| Método | Rota                 | Papéis      |
| ------ | -------------------- | ----------- |
| GET    | `/users`             | A, M        |
| GET    | `/users/:id`         | A, M        |
| POST   | `/users`             | A           |
| PATCH  | `/users/:id`         | A           |
| PATCH  | `/users/:id/role`    | A           |
| PATCH  | `/users/:id/status`  | A           |
| PATCH  | `/users/me/password` | autenticado |

### `/categories`

| Método | Rota                                         | Papéis  |
| ------ | -------------------------------------------- | ------- |
| GET    | `/categories` · `/categories/:id`            | A, M, O |
| POST   | `/categories`                                | A, M    |
| PATCH  | `/categories/:id` · `/categories/:id/status` | A, M    |

### `/suppliers`

| Método | Rota                                                        | Papéis  |
| ------ | ----------------------------------------------------------- | ------- |
| GET    | `/suppliers` · `/suppliers/:id` · `/suppliers/:id/products` | A, M, O |
| POST   | `/suppliers`                                                | A, M    |
| PATCH  | `/suppliers/:id` · `/suppliers/:id/status`                  | A, M    |

### `/products`

| Método | Rota                      | Papéis  | Fase           |
| ------ | ------------------------- | ------- | -------------- |
| GET    | `/products`               | A, M, O | 4              |
| GET    | `/products/:id`           | A, M, O | 4              |
| POST   | `/products`               | A, M    | 4              |
| PATCH  | `/products/:id`           | A, M    | 4              |
| PATCH  | `/products/:id/status`    | A, M    | 4              |
| GET    | `/products/:id/movements` | A, M, O | **5** (ver I1) |

### `/audit`

| Método | Rota                       | Papéis |
| ------ | -------------------------- | ------ |
| GET    | `/audit`                   | A      |
| GET    | `/audit/:entity/:entityId` | A, M   |

Somente leitura. Não existe rota de escrita nem de exclusão: um endpoint capaz de alterar
o log anularia o propósito dele.

### Reconciliação da contagem

A primeira versão deste plano dizia 26, e a lista acima soma 29. O erro era do total, não
da lista. Contagem conferida contra a §05, recurso a recurso:

| Recurso       | Nesta fase | Detalhe                                                     |
| ------------- | ---------- | ----------------------------------------------------------- |
| `/auth`       | 4          | login, refresh, logout, me                                  |
| `/users`      | 7          | lista, detalhe, criar, editar, papel, status, senha própria |
| `/categories` | 5          | lista, detalhe, criar, editar, status                       |
| `/suppliers`  | 6          | lista, detalhe, produtos vinculados, criar, editar, status  |
| `/products`   | 5          | lista, detalhe, criar, editar, status                       |
| `/audit`      | 2          | log global, log por entidade                                |
| **Total**     | **29**     |                                                             |

Fora desta fase, da §05: `GET /products/:id/movements` (adiado para a Fase 5, ver I1) e os
endpoints de movimentação, inventário, dashboard e relatórios, que já eram da Fase 5.

Somando os 2 de health que já existem, a API terá **31 rotas** ao fim da Fase 4. Um caso de
integração afirma esse número contra o documento OpenAPI, para que a contagem pare de
depender de quem soma.

## 15.5 Autenticação real

Implementa o [ADR-0005](adr/0005-armazenamento-de-token.md) sem desvio.

### Os dois tokens

| Token        | Duração | Onde fica                                        | Transporte                     |
| ------------ | ------- | ------------------------------------------------ | ------------------------------ |
| Access (JWT) | 15 min  | memória do JS no cliente                         | header `Authorization: Bearer` |
| Refresh      | 7 dias  | cookie `httpOnly` + `Secure` + `SameSite=Strict` | automático pelo navegador      |

`Secure` é condicionado ao ambiente, porque em desenvolvimento não há HTTPS. O cookie tem
`path` restrito a `/api/v1/auth/refresh`: ele não é enviado em nenhuma outra requisição,
o que reduz a superfície de CSRF ao único endpoint que o consome.

### Payload do JWT

`sub`, `role`, `jti` e nada mais. Sem e-mail, sem nome. JWT é assinado, não criptografado,
e qualquer pessoa com o token consegue ler o conteúdo. Há teste decodificando o token e
afirmando que não há dado pessoal nele.

### Fluxo de login

1. Normaliza o e-mail para minúsculas e busca o usuário, **pedindo explicitamente** o
   `passwordHash` (ver I2).
2. Verifica a senha com Argon2id.
3. Usuário inexistente e senha errada produzem a **mesma** resposta, 401
   `INVALID_CREDENTIALS`. Dizer "usuário não encontrado" permitiria enumerar contas.
4. Usuário inativo produz 401 `USER_INACTIVE`. É informação que o próprio titular precisa
   para saber que deve falar com o administrador, e não revela existência a terceiro além
   do que o login já revelaria.
5. Emite access e refresh, grava **apenas o hash SHA-256** do refresh, atualiza
   `lastLoginAt` e registra `LOGIN_SUCCESS` na auditoria.

**Sobre o tempo de resposta:** quando o usuário não existe, não há hash para verificar, e
responder imediatamente revelaria a ausência pela diferença de tempo. O service executa uma
verificação Argon2id contra um hash descartável nesse caso, para que o custo seja
comparável. É mitigação parcial e será documentada como tal: equalização perfeita de tempo
não é alcançável em Node.

### Rotação e detecção de reuso

Cada uso do refresh emite um novo e revoga o anterior, gravando `replacedById`. Revogar o
antigo e criar o novo acontecem na **mesma transação**: sem isso, uma falha no meio
deixaria o usuário sem nenhum token válido ou com dois.

Apresentar um refresh já rotacionado é indício de roubo: a resposta é 401
`REFRESH_TOKEN_REUSED` e **todos os refresh ativos daquele usuário são revogados** (I3).

### Configuração do cookie de refresh

O cookie é a peça que sustenta o ADR-0005, então cada atributo está aqui com o motivo.

| Atributo   | Valor                                          | Por quê                                                                                                                                                                                                         |
| ---------- | ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `httpOnly` | `true`                                         | **Sempre.** É o atributo que tira o token do alcance do JavaScript. Sem ele, qualquer XSS na página lê o refresh e ganha sete dias de sessão. É a razão de existir desta escolha de arquitetura                 |
| `secure`   | `true` em produção, `false` em desenvolvimento | O navegador recusa cookie `Secure` em HTTP, e em desenvolvimento não há TLS. Condicionado ao ambiente, nunca desligado em produção                                                                              |
| `sameSite` | `strict`                                       | Defesa principal contra CSRF: o navegador não envia o cookie em requisição originada de outro site. `strict` e não `lax`, porque não há fluxo de retorno de terceiro que precise do cookie em navegação de topo |
| `path`     | `/api/v1/auth`                                 | Restringe o envio às rotas de autenticação. Em toda requisição de negócio o cookie **não é enviado**, o que reduz a exposição e elimina a chance de ele participar de um CSRF em endpoint de escrita            |
| `maxAge`   | 7 dias, igual ao `JWT_REFRESH_TTL`             | Espelha a expiração gravada no banco. Se divergirem, o cookie some antes do registro expirar, ou o contrário                                                                                                    |
| `domain`   | não definido                                   | Sem `domain`, o cookie fica restrito ao host exato. Defini-lo o estenderia a todos os subdomínios                                                                                                               |

O nome do cookie é `stockflow_refresh`. Nome genérico como `token` facilita a vida de
script automatizado que procura padrões conhecidos.

**O cookie nunca carrega o que está no banco.** O que vai para o navegador é o token; o que
vai para `refresh_tokens.token_hash` é o SHA-256 dele. Vazamento do dump não entrega sessão
ativa.

### Logout

Três coisas acontecem, nesta ordem:

1. O refresh apresentado é revogado no banco, com `revoked_at` preenchido.
2. O cookie é apagado usando **exatamente os mesmos** `path`, `sameSite` e `secure` do
   original. O navegador só remove um cookie quando esses atributos coincidem: divergir
   deixaria o cookie vivo no navegador, apontando para um registro já revogado.
3. Responde 204, sem corpo.

Logout com cookie ausente ou já revogado **também responde 204**. É operação idempotente: o
estado desejado, não ter sessão, foi alcançado de qualquer forma, e responder 401 só
atrapalharia quem clicou duas vezes.

### Revogar refresh não é invalidar access

Esta distinção é a mais importante desta fase, e é onde promessa de segurança costuma ser
maior do que a implementação entrega.

|                    | Refresh token                                                       | Access token (JWT)                                                    |
| ------------------ | ------------------------------------------------------------------- | --------------------------------------------------------------------- |
| Onde o estado vive | **No banco**, em `refresh_tokens`                                   | **Em lugar nenhum**: toda a informação está dentro do token, assinada |
| Como se valida     | Consulta o registro pelo hash e confere `revoked_at` e `expires_at` | Verifica a assinatura e a expiração, sem tocar no banco               |
| Dá para revogar?   | **Sim, imediatamente.** Uma linha no banco                          | **Não.** O servidor não guarda nada que possa ser apagado             |
| Duração            | 7 dias                                                              | 15 minutos                                                            |

Um JWT é verificável sem estado: é exatamente isso que o torna barato, e exatamente isso
que o torna irrevogável. Revogar exigiria consultar uma lista de bloqueio a cada
requisição, o que devolveria ao banco a consulta que o JWT existe para evitar.

**Consequência prática, declarada:**

> Revogar os refresh tokens de alguém encerra a capacidade de **renovar** a sessão, não a
> sessão em andamento. O access já emitido continua válido até expirar, por **até 15
> minutos**.

### O que acontece ao alterar papel ou inativar usuário

Ambas as operações fazem a mesma coisa, em uma transação:

1. Atualizam o usuário.
2. Revogam **todos** os refresh tokens ativos dele.
3. Registram a ação na auditoria.

A partir daí, a linha do tempo é esta:

```
t+0s    ADMIN rebaixa Ana de MANAGER para OPERATOR
        -> papel atualizado no banco
        -> refresh tokens de Ana revogados

t+0s    Ana continua com um access token que diz role MANAGER.
        Ele e valido, foi assinado por nos, e nao temos como desfazer isso.
        Ana ainda consegue criar produto.

t+15m   O access de Ana expira. O cliente tenta renovar.
        O refresh foi revogado -> 401.
        Ana volta ao login e entra como OPERATOR.
```

A janela máxima é o tempo de vida do access, **15 minutos**. Em média, metade disso.

**Por que aceitamos isso.** A alternativa seria consultar o banco a cada requisição para
reconferir papel e situação, trocando uma consulta por requisição para fechar uma janela de
15 minutos em um sistema interno de estoque. O ADR-0005 já registrou esse trade-off e a
§8.12 já o lista como risco conhecido e aceito. Este plano não reabre a decisão: apenas a
descreve com precisão, para que ninguém leia "revogamos as sessões" e entenda "encerramos o
acesso agora".

**Para inativação há uma proteção adicional que não custa consulta extra.** O endpoint de
refresh confere `isActive` antes de emitir novo par, então o usuário inativo não renova nem
que tivesse um refresh válido. A janela existe apenas para o access corrente.

**Se um dia a janela precisar ser menor**, o caminho não é lista de bloqueio: é reduzir o
tempo de vida do access, que é configuração (`JWT_ACCESS_TTL`), ao custo de mais requisições
de refresh. Fica registrado como opção, não como pendência.

### Rotação sob concorrência

Duas requisições de refresh com o mesmo token podem chegar ao mesmo tempo, e isso não é
hipotético: duas abas da aplicação com o access expirado renovam juntas.

Ler o token, conferir se está revogado e depois gravar seria o mesmo _lost update_ que o
[ADR-0003](adr/0003-estrategia-de-concorrencia.md) descreve para estoque, com o mesmo
desfecho: as duas requisições leem "não revogado", as duas passam, e duas cadeias de sessão
válidas nascem do mesmo token. Uma delas fica órfã e nunca será revogada.

**A solução é a mesma técnica, aplicada aqui:** a verificação e a escrita acontecem na mesma
instrução.

```sql
UPDATE refresh_tokens
   SET revoked_at = now(), replaced_by_id = $novo
 WHERE token_hash = $hash
   AND revoked_at IS NULL
   AND expires_at > now()
RETURNING user_id;
```

- **1 linha** devolvida: esta requisição ganhou a corrida e é a única autorizada a emitir o
  novo par.
- **0 linhas**: ou o token não existe, ou já estava revogado, ou expirou. Em qualquer caso,
  esta requisição não emite nada.

O `UPDATE` e a criação do registro novo ficam na mesma transação, pelo mesmo motivo do
estoque: se a criação falhar, o token antigo não pode ficar revogado sem substituto.

**O efeito colateral honesto.** Com detecção de reuso, a requisição que perde a corrida é
indistinguível de um token roubado, e a política manda revogar a cadeia inteira. Na prática,
duas abas renovando ao mesmo tempo derrubam a sessão do usuário legítimo.

É um incômodo real e conhecido de rotação com detecção de reuso. **Preferimos o falso
positivo ao falso negativo:** tratar reuso como aceitável abriria a porta para o caso que a
detecção existe para pegar. O usuário refaz o login; o atacante com token roubado perde o
acesso.

A mitigação que **não** vamos adotar agora, e o motivo: uma janela de tolerância, em que o
token recém-rotacionado continua aceito por alguns segundos, resolveria as duas abas e
abriria exatamente a janela que a detecção fecha. Fica registrada como alternativa avaliada
e recusada.

## 15.6 RBAC

### Dois guards globais

`JwtAuthGuard` e depois `RolesGuard`, registrados como `APP_GUARD`.

**O padrão é negar.** Rota sem decorator exige autenticação. Rota pública precisa de
`@Public()` explícito. Esquecer o decorator fecha a rota, não abre: é a direção correta
para um erro de distração.

### Decorators

| Decorator        | Função                                                         |
| ---------------- | -------------------------------------------------------------- |
| `@Public()`      | Marca a rota como aberta. Usado em `/health` e `/auth/login`   |
| `@Roles(...)`    | Papéis que podem executar a ação                               |
| `@CurrentUser()` | Injeta o usuário do token, sem o controller tocar em `Request` |

`@CurrentUser()` existe para que o service continue sem conhecer HTTP, como manda a §2.3.

### A matriz

Derivada da §05, e é ela que os testes verificam:

| Ação                                               | ADMIN | MANAGER | OPERATOR |
| -------------------------------------------------- | ----- | ------- | -------- |
| Ler cadastros (produtos, categorias, fornecedores) | sim   | sim     | sim      |
| Criar e editar cadastros                           | sim   | sim     | **não**  |
| Listar e ver usuários                              | sim   | sim     | **não**  |
| Criar usuário, alterar papel, ativar e inativar    | sim   | **não** | **não**  |
| Trocar a própria senha                             | sim   | sim     | sim      |
| Ler o log global de auditoria                      | sim   | **não** | **não**  |
| Ler auditoria de uma entidade                      | sim   | sim     | **não**  |

### Acesso a recurso de outro usuário

`PATCH /users/me/password` opera sobre `req.user.sub`, nunca sobre um id vindo do corpo ou
da URL. Há caso de teste tentando trocar a senha de outra pessoa.

## 15.7 Validação, erros e transações

### Validação

O `ValidationPipe` global já está configurado desde a Fase 2 com `whitelist`,
`forbidNonWhitelisted` e `transform`. É o que impede _mass assignment_: enviar
`isActive` em um cadastro, ou `currentStock` em um `PATCH` de produto, devolve 400 em vez
de ser descartado em silêncio.

Nesta fase entram:

- DTOs por operação, com `class-validator`, conforme o ADR-0002;
- `ParseUUIDPipe` em toda rota com `:id`;
- `PaginationQueryDto` comum, com `limit` limitado a 100 no servidor;
- **allowlist de ordenação por recurso**: `sort` fora da lista devolve 400. Campo arbitrário
  na query seria superfície de ataque e de erro;
- normalização na borda: e-mail para minúsculas, SKU para maiúsculas.

### Erros

O contrato único e o `AllExceptionsFilter` já existem. Esta fase adiciona as classes
concretas de erro de domínio, cada uma com seu `code` e status:

| Erro                       | Código                  | Status |
| -------------------------- | ----------------------- | ------ |
| `InvalidCredentialsError`  | `INVALID_CREDENTIALS`   | 401    |
| `UserInactiveError`        | `USER_INACTIVE`         | 401    |
| `RefreshTokenReusedError`  | `REFRESH_TOKEN_REUSED`  | 401    |
| `ForbiddenRoleError`       | `FORBIDDEN_ROLE`        | 403    |
| `EmailAlreadyExistsError`  | `EMAIL_ALREADY_EXISTS`  | 409    |
| `SkuAlreadyExistsError`    | `SKU_ALREADY_EXISTS`    | 409    |
| `CategoryHasProductsError` | `CATEGORY_HAS_PRODUCTS` | 409    |

**Conflito de unicidade:** o Prisma devolve `P2002` para violação de índice único. O erro é
capturado **no service**, que sabe qual campo falhou e lança o erro de domínio certo. Um
filtro global para `P2002` teria de adivinhar se o conflito foi de e-mail, SKU ou documento,
e adivinharia errado em algum caso.

### Transações

Quatro operações desta fase não podem ficar pela metade:

| Operação              | Por quê                                                                                                           |
| --------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Rotação do refresh    | Revogar o antigo e criar o novo é uma coisa só                                                                    |
| Detecção de reuso     | Revogar a cadeia inteira do usuário é tudo ou nada                                                                |
| Alteração de papel    | Atualizar o papel e revogar os refresh do alvo andam juntos: sem isso, o usuário mantém sessão com o papel antigo |
| Inativação de usuário | Mesmo raciocínio: inativar sem revogar deixa a sessão viva                                                        |

A inativação de categoria com produtos ativos **não** usa transação: usa a mesma técnica do
[ADR-0003](adr/0003-estrategia-de-concorrencia.md), um UPDATE condicionado ao estado, para
que a verificação e a escrita não possam ser separadas por uma criação de produto
concorrente. É a primeira aplicação daquele raciocínio fora do estoque, e é boa preparação
para a Fase 5.

## 15.8 Banco de dados

**Nenhuma migration nesta fase.**

As seis tabelas de que a Fase 4 precisa já existem, criadas na migration inicial:

| Tabela           | Situação                                                |
| ---------------- | ------------------------------------------------------- |
| `users`          | pronta, inclusive `last_login_at`                       |
| `refresh_tokens` | pronta, inclusive `token_hash` único e `replaced_by_id` |
| `categories`     | pronta                                                  |
| `suppliers`      | pronta                                                  |
| `products`       | pronta, com índice GIN trigram em `name`                |
| `audit_logs`     | pronta                                                  |

A busca por nome em `GET /products?search=` usa `contains` com modo insensível, que o
Prisma traduz para `ILIKE`, e é o que aproveita o índice trigram criado na Fase 2.

Se algo nesta fase exigir mudança de schema, é sinal de que o modelo da Fase 1 tinha uma
lacuna, e isso será levantado antes de implementar, não contornado com uma coluna nova.

## 15.9 Dependências

**Uma única dependência nova:** `cookie-parser@1.4.7` e `@types/cookie-parser@1.4.10`.

Justificativa: o Express 5 escreve cookie com `res.cookie()` de forma nativa, mas **não lê**
`req.cookies` sem middleware. O `POST /auth/refresh` precisa ler o cookie httpOnly, que é a
peça central do ADR-0005. Sem isso, o refresh teria de trafegar no corpo, o que desfaria a
proteção contra XSS que motivou a decisão.

Todo o resto já está instalado desde a Fase 2 e foi conferido: `@nestjs/jwt`,
`@nestjs/passport`, `passport`, `passport-jwt`, `@types/passport-jwt`, `@nestjs/throttler`,
`class-validator`, `class-transformer`, `@node-rs/argon2` e `uuid`.

Nenhuma dependência no frontend.

## 15.10 Arquivos

### Backend: criados

```
backend/src/
├── common/
│   ├── decorators/
│   │   ├── public.decorator.ts
│   │   ├── roles.decorator.ts
│   │   └── current-user.decorator.ts
│   ├── dto/
│   │   ├── pagination-query.dto.ts
│   │   └── page.dto.ts
│   ├── errors/
│   │   ├── auth.errors.ts
│   │   └── resource.errors.ts
│   ├── guards/
│   │   ├── jwt-auth.guard.ts
│   │   ├── roles.guard.ts
│   │   └── roles.guard.spec.ts
│   ├── interceptors/
│   │   └── audit.interceptor.ts
│   └── utils/
│       ├── redact.ts
│       ├── redact.spec.ts
│       └── pagination.ts
│
├── auth/
│   ├── auth.module.ts
│   ├── auth.controller.ts
│   ├── auth.service.ts  ·  auth.service.spec.ts
│   ├── token.service.ts ·  token.service.spec.ts
│   ├── jwt.strategy.ts
│   ├── login-throttler.guard.ts
│   ├── dto/  (login, refresh-response, me-response)
│   └── entities/auth-user.entity.ts
│
├── users/        módulo, controller, service + spec, 5 DTOs, entity
├── categories/   mesma forma
├── suppliers/    mesma forma
├── products/     mesma forma
└── audit/        módulo, controller, service + spec, query DTO, entity
```

Testes de integração: `test/auth.int-spec.ts`, `test/rbac.int-spec.ts`,
`test/users.int-spec.ts`, `test/catalog.int-spec.ts`, `test/audit.int-spec.ts`, mais
auxiliares em `test/helpers/`.

### Backend: modificados

| Arquivo                            | Mudança                                                                                                                        |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `src/app.module.ts`                | Importa os seis módulos novos; registra `APP_GUARD` (dois), `APP_INTERCEPTOR` (auditoria e serialização) e o `ThrottlerModule` |
| `src/bootstrap.ts`                 | `cookie-parser`; `ClassSerializerInterceptor`; Swagger com os papéis documentados                                              |
| `src/prisma/prisma.service.ts`     | Omissão global de `passwordHash` (I2)                                                                                          |
| `src/health/health.controller.ts`  | `@Public()` nas duas rotas (I5)                                                                                                |
| `src/common/errors/error-codes.ts` | Sem mudança prevista: os 12 códigos já estão lá                                                                                |
| `backend/package.json`             | `cookie-parser`                                                                                                                |

### Banco de dados

Nenhum arquivo. Ver §15.8.

### Frontend

**Nenhum arquivo.** A Fase 4 é inteiramente de backend, e a integração é da Fase 6. Se algo
exigir mudança no frontend, é escopo vazando e será levantado antes.

### Documentação

`docs/02-arquitetura.md` (ajuste do I7), `docs/05-api.md` (nota do I1), `docs/16-relatorio-fase-4.md`,
`README.md` e `docs/09-roadmap.md` ao final da fase.

## 15.11 Ordem de implementação

Cada bloco só começa depois que o anterior roda, com seus testes.

| #   | Bloco             | Conteúdo                                                                                                                              |
| --- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| A   | Transversal       | Decorators, DTO de paginação, erros de domínio, utilitário de redação, omissão global do `passwordHash`, `ClassSerializerInterceptor` |
| B   | Autenticação      | `TokenService`, `JwtStrategy`, `AuthService`, controller, guards globais, `@Public()` no health                                       |
| C   | Rate limiting     | `ThrottlerModule` e o guard de login com chave por IP e e-mail                                                                        |
| D   | Auditoria         | Interceptor, redação, módulo de leitura                                                                                               |
| E   | Usuários          | CRUD, troca de papel, ativação, troca da própria senha                                                                                |
| F   | Categorias        | CRUD e inativação condicionada                                                                                                        |
| G   | Fornecedores      | CRUD, inativação, produtos vinculados                                                                                                 |
| H   | Produtos          | CRUD, busca, filtros, ordenação com allowlist, inativação                                                                             |
| I   | Integração e RBAC | Suíte ponta a ponta e a matriz completa                                                                                               |

A auditoria vem **antes** dos cadastros de propósito: assim cada CRUD já nasce auditado, em
vez de receber auditoria depois, quando é fácil esquecer uma rota.

Dentro de cada bloco: DTO, service, teste unitário do service, controller, teste de
integração. O teste entra junto, não ao final da fase.

## 15.12 Estratégia de testes

Segue a §07. A proporção é deliberada: mais integração que o usual, porque as invariantes
deste sistema vivem no banco e no pipeline HTTP.

### Unitários

| Alvo                 | Casos principais                                                                                                                |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `RolesGuard`         | Matriz completa da §15.6, para os três papéis; rota sem `@Roles` exige só autenticação; rota com `@Public()` passa sem token    |
| `TokenService`       | Gera par; hash SHA-256 persistido e nunca o token em claro; rotação revoga o anterior; reuso detectado; token expirado recusado |
| `AuthService`        | Credencial válida; senha errada; usuário inexistente; usuário inativo; e-mail normalizado antes da busca                        |
| `UsersService`       | E-mail duplicado; e-mail normalizado; troca de senha exigindo a atual; não permite rebaixar o próprio papel                     |
| `CategoriesService`  | Nome duplicado; inativar com produto ativo                                                                                      |
| `ProductsService`    | SKU duplicado; SKU normalizado; `sort` fora da allowlist; `limit` acima de 100                                                  |
| `redact`             | Dado aninhado, array, chave em maiúsculas, `null`, e as oito chaves sensíveis da §4.4                                           |
| `PaginationQueryDto` | `limit` acima de 100, `page` zero ou negativa                                                                                   |

### Integração, com PostgreSQL real

Autenticação, RBAC ponta a ponta, cada CRUD e a auditoria. A suíte de RBAC faz
**requisição real com token de cada papel** para cada ação sensível: é ela que testa o que
de fato protege o sistema, porque erro de decorator só aparece com o guard montado na rota.

### Casos negativos e de segurança

São os que importam. Lista explícita, para que nenhum caia fora por esquecimento:

**Autenticação**

- senha errada devolve 401 `INVALID_CREDENTIALS`
- usuário inexistente devolve **a mesma** resposta da senha errada
- usuário inativo devolve 401 `USER_INACTIVE`
- resposta de login **não contém** `passwordHash` (assertiva direta no corpo)
- o JWT emitido **não contém** e-mail nem nome (token decodificado no teste)
- rota protegida sem token devolve 401
- token expirado devolve 401
- token assinado com o **segredo do refresh** devolve 401, provando a separação de segredos
- token com payload adulterado devolve 401
- refresh ausente devolve 401
- refresh já rotacionado devolve 401 `REFRESH_TOKEN_REUSED` **e** revoga a cadeia
- refresh de usuário já inativado não renova

**Concorrência na rotação do refresh**

O teste central de autenticação, no mesmo espírito do teste de concorrência de estoque da
§7.4. Duas requisições simultâneas com o mesmo refresh:

```ts
const resultados = await Promise.all([
  request(app).post('/api/v1/auth/refresh').set('Cookie', cookie),
  request(app).post('/api/v1/auth/refresh').set('Cookie', cookie),
]);

// exatamente uma ganha
expect(resultados.filter((r) => r.status === 200)).toHaveLength(1);
expect(resultados.filter((r) => r.status === 401)).toHaveLength(1);
```

E as assertivas sobre o estado que ficou no banco:

- exatamente **um** registro novo de refresh foi criado, e não dois
- o token original está revogado, com `replacedById` apontando para esse único registro
- a perdedora foi tratada como reuso, então **toda a cadeia do usuário está revogada**
- o access emitido pela vencedora também deixa de poder renovar, porque a cadeia caiu

Com N requisições paralelas em vez de duas, o resultado é o mesmo: uma vencedora, N-1
tratadas como reuso. O teste roda com 5 para cobrir o caso geral.

Este teste falha de forma determinística se a rotação for implementada como ler, conferir e
gravar. É a prova executável da §15.5.

- logout revoga, e o refresh seguinte falha
- sexta tentativa de login em 15 minutos devolve 429

**Autorização**

- a matriz inteira, com token real de cada papel
- OPERATOR não cria produto, categoria, fornecedor nem usuário
- MANAGER não cria usuário, não altera papel e não lê o log global
- trocar a senha de outra pessoa não é possível, nem pelo corpo nem pela URL
- alterar o papel revoga as sessões do alvo

**Entrada**

- `POST /users` com `isActive` ou `passwordHash` no corpo devolve 400
- `PATCH /products/:id` com `currentStock` devolve 400
- `sort=password` devolve 400
- `limit=500` é limitado a 100
- `:id` que não é UUID devolve 400
- e-mail com maiúsculas é normalizado antes de gravar e antes de buscar

**Auditoria**

- login bem-sucedido grava `LOGIN_SUCCESS`
- login falho grava a tentativa com `userId` nulo e o e-mail preservado
- criação de usuário grava o registro **sem** `passwordHash` em `after`, com assertiva
  direta sobre o JSON gravado
- alteração de papel é registrada com estado anterior e posterior
- não existe rota de escrita nem de exclusão em `/audit`

### E2E

**Não se aplica nesta fase.** Os dois fluxos do §7.5 atravessam a interface, que só consome
esta API na Fase 6. Playwright entra na Fase 7, como planejado.

## 15.13 A pré-visualização da Fase 3

Pergunta direta: **tudo permanece, sem exceção, até a Fase 6.**

| Elemento                                                                       | Permanece | Sai em |
| ------------------------------------------------------------------------------ | --------- | ------ |
| `features/auth/ui-preview-auth.tsx`                                            | sim       | Fase 6 |
| `components/layout/PreviewBanner.tsx`                                          | sim       | Fase 6 |
| Bloco `PreviewAccess` do login                                                 | sim       | Fase 6 |
| `PreviewRoleSelect` no cabeçalho                                               | sim       | Fase 6 |
| `isPreview` no contrato de sessão                                              | sim       | Fase 6 |
| `PhasePlaceholder` de produtos, categorias, fornecedores, usuários e auditoria | sim       | Fase 6 |

O motivo é simples: a Fase 4 entrega a API, e a Fase 6 é que liga a interface a ela.
Remover a pré-visualização agora deixaria o frontend sem forma nenhuma de navegar, porque
não haveria nem o provedor real nem o antigo.

A troca na Fase 6 é feita de uma vez: o `AuthProvider` real implementa o mesmo
`AuthContextValue`, os quatro arquivos acima são deletados, `isPreview` sai do contrato, e
nenhum outro consumidor muda. É o que o contrato ter nascido na forma final comprou.

**Os marcadores de fase de movimentações, inventários e relatórios continuam até a Fase 6
também**, porque a API deles é da Fase 5.

## 15.14 Riscos

| Risco                                                                               | Mitigação                                                                                                                 |
| ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Guards globais derrubam o health check e o CI não percebe                           | `@Public()` nas duas rotas, com caso de integração afirmando 200 **sem** token                                            |
| A omissão global do `passwordHash` quebra o login, que precisa do campo             | Opt-in explícito no `AuthService`, com teste de login passando e teste afirmando que o campo não vem nas demais consultas |
| Rate limit em memória conta por instância                                           | Risco já aceito e registrado na §8.12. Correção seria store compartilhado, não justificado nesta escala                   |
| O teste de rate limit polui os outros, deixando o limite estourado                  | Store do throttler reiniciado entre arquivos, e o caso de 429 isolado em bloco próprio                                    |
| Enumeração de conta pelo tempo de resposta                                          | Verificação Argon2id contra hash descartável quando o usuário não existe; documentado como mitigação parcial              |
| `exactOptionalPropertyTypes` atrita com DTOs de `PATCH`, onde todo campo é opcional | Tipos com `\| undefined` explícito, como já foi resolvido no `FormField` da Fase 3                                        |
| Swagger desatualizado em relação às rotas                                           | Gerado dos DTOs; caso de integração afirma que as 31 rotas aparecem no documento                                          |
| Escopo vazar para a Fase 5 pelo endpoint de movimentações                           | Decisão I1, tomada antes de começar                                                                                       |
| Auditoria registrar segredo por engano                                              | Função de redação única e testada, aplicada em um só ponto                                                                |

## 15.15 Critérios objetivos de aceite

### Funcionais

- [ ] Login com credencial do seed devolve access token e grava cookie httpOnly
- [ ] `/auth/me` devolve o usuário e o papel a partir do token
- [ ] Refresh rotaciona, e o token anterior deixa de funcionar
- [ ] Reuso de refresh rotacionado devolve 401 e revoga a cadeia do usuário
- [ ] Logout revoga, e o refresh seguinte falha
- [ ] Os 29 endpoints respondem conforme a §05, e o OpenAPI lista 31 rotas
- [ ] Paginação devolve `meta` completo e correto com 25 registros e `limit=10`
- [ ] Busca de produto por nome parcial e por SKU funciona
- [ ] Inativar categoria com produto ativo devolve 409 `CATEGORY_HAS_PRODUCTS`
- [ ] Toda ação relevante aparece no log de auditoria

### De segurança

- [ ] **`passwordHash` ausente de toda resposta da API**, com teste provando
- [ ] **`passwordHash` ausente de todo registro de auditoria**, com assertiva sobre o JSON
- [ ] O JWT não carrega e-mail nem nome
- [ ] Token assinado com o segredo errado é recusado
- [ ] A matriz de RBAC inteira passa, com requisição real por papel
- [ ] Rota sem decorator exige autenticação
- [ ] `/health` e `/health/ready` respondem 200 **sem** token
- [ ] Sexta tentativa de login em 15 minutos devolve 429
- [ ] Mass assignment bloqueado nos dois casos listados na §15.12

### De qualidade

- [ ] `npm run lint` limpo, sem supressão
- [ ] `npm run typecheck` sem erro e sem `any`
- [ ] `npm run test` e `npm run test:int` passando, com a saída registrada
- [ ] `npm run build` gerando `dist`
- [ ] Swagger completo em `/api/docs`, com os papéis documentados e 31 rotas listadas
- [ ] Frontend intacto: `git status` em `frontend/` vazio ao fim da fase
- [ ] Nenhuma migration nova, conforme §15.8
- [ ] CI verde nos quatro jobs

## 15.16 Commits previstos

Nenhum commit sem autorização. A sequência proposta:

```
chore(backend): add cookie parser for the refresh token
feat(backend): add shared decorators, pagination and domain errors
feat(auth): add token service with rotation and reuse detection
feat(auth): add login, refresh, logout and me endpoints
feat(backend): enforce authentication and roles with global guards
feat(auth): add rate limiting on authentication endpoints
feat(audit): add audit interceptor with field redaction
feat(users): add user management with role and status changes
feat(categories): add category crud with guarded deactivation
feat(suppliers): add supplier crud with linked products
feat(products): add product crud with search, filters and sorting
test(backend): add rbac matrix and integration suites
docs: add phase 4 report and update api notes
```
