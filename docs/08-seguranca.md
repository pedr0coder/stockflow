# 08 — Segurança

> O StockFlow **não é** um sistema "100% seguro". Nenhum é. Este documento registra o que
> foi implementado, o que foi deliberadamente deixado de fora e quais riscos permanecem
> conhecidos e aceitos.

## 8.1 Senhas

**Argon2id** via `@node-rs/argon2` (2.2.2).

| Parâmetro   | Valor                             | Motivo                                                                    |
| ----------- | --------------------------------- | ------------------------------------------------------------------------- |
| Algoritmo   | Argon2id                          | Recomendação atual da OWASP; resistente a GPU e a ataque de canal lateral |
| Memória     | 19 MiB                            | Mínimo da OWASP para Argon2id                                             |
| Iterações   | 2                                 | Par recomendado com 19 MiB                                                |
| Paralelismo | 1                                 |                                                                           |
| Salt        | gerado pela biblioteca, por senha | Impede rainbow table e revela senhas iguais                               |

O hash carrega os próprios parâmetros, o que permite aumentá-los no futuro e re-hashear no
login sem migração de banco.

Política mínima: 10 caracteres, com verificação contra uma lista de senhas comuns. **Sem**
exigência de símbolo obrigatório ou troca periódica — ambas são desaconselhadas pelo
NIST SP 800-63B porque empurram o usuário para padrões previsíveis.

Senha nunca aparece em log, em resposta de API, em mensagem de erro ou em audit log.

## 8.2 Tokens e sessão

| Token        | Duração | Onde fica                                        | Por quê                                            |
| ------------ | ------- | ------------------------------------------------ | -------------------------------------------------- |
| Access (JWT) | 15 min  | memória do JS (nunca `localStorage`)             | Token em `localStorage` é legível por qualquer XSS |
| Refresh      | 7 dias  | cookie `httpOnly` + `Secure` + `SameSite=Strict` | Inacessível ao JavaScript da página                |

- Refresh é **rotativo**: cada uso emite um novo e revoga o anterior.
- Só o **hash SHA-256** do refresh é persistido. Vazamento do banco não entrega sessões.
- Reuso de um refresh já rotacionado indica roubo de token: a resposta é 401
  `REFRESH_TOKEN_REUSED` e **toda a cadeia de sessões daquele usuário é revogada**.
- Payload do JWT contém `sub`, `role` e `jti` — nunca e-mail, nome ou dado pessoal, porque
  JWT é apenas assinado, não criptografado, e qualquer um pode decodificá-lo.
- Segredos de access e refresh são **distintos**.

**Trade-off assumido:** o papel vai dentro do access token, então rebaixar um usuário leva
até 15 minutos para surtir efeito. A alternativa — consultar o banco a cada requisição —
foi recusada porque custaria uma query por request para mitigar uma janela de 15 min em um
sistema interno. Ações de ADMIN (alterar papel, inativar usuário) revogam os refresh
tokens do alvo imediatamente, o que limita a janela ao access já emitido.

## 8.3 Autorização

Dois guards globais, nesta ordem: `JwtAuthGuard` → `RolesGuard`.

```ts
@Roles(UserRole.ADMIN, UserRole.MANAGER)
@Post('adjustment')
createAdjustment(@Body() dto: CreateAdjustmentDto, @CurrentUser() user: AuthUser) { }
```

Decisões:

- O padrão é **negar**. Rota sem `@Roles` exige autenticação; rota pública precisa de
  `@Public()` explícito. Esquecer o decorator fecha a rota, não a abre.
- A verificação está no **backend**. Esconder o item da sidebar é conveniência de UI, não
  segurança: a API é chamável diretamente, e a matriz de RBAC da §7.4 é testada por
  requisição real com token de cada papel.
- Usuário não acessa recurso de outro usuário: `PATCH /users/me/password` opera sobre
  `req.user.sub`, nunca sobre um id vindo do corpo.

## 8.4 Validação de entrada

`ValidationPipe` global com:

```ts
{ whitelist: true, forbidNonWhitelisted: true, transform: true }
```

- `whitelist` remove campo não declarado no DTO;
- `forbidNonWhitelisted` rejeita a requisição em vez de ignorar silenciosamente — é o que
  impede _mass assignment_ (enviar `role: ADMIN` no cadastro, ou `currentStock` no `PATCH`
  de produto).
- Toda rota com `:id` valida UUID por `ParseUUIDPipe`.
- Decimais chegam como string e são validados por regex de escala antes de virar `Decimal`.

## 8.5 Banco de dados

- **SQL Injection:** todo acesso passa pelo Prisma, que parametriza. Os dois pontos de
  `$queryRaw` (UPDATE condicional de estoque e reconciliação) usam **template tagged** com
  parâmetros — nunca concatenação de string. Isso é verificado em code review e é a única
  exceção auditada ao uso do query builder.
- Usuário do banco da aplicação **não** é superusuário e não tem DDL em produção;
  migrations rodam com credencial separada no deploy.
- `ON DELETE RESTRICT` em `StockMovement.userId` e `.productId`: autor e produto de uma
  movimentação não podem desaparecer.
- CHECK constraints (§4.4) como última barreira contra saldo negativo.
- Connection pool limitado, para que carga não esgote as conexões do Postgres.

## 8.6 Transporte e cabeçalhos

- **Helmet** com CSP restritiva, `X-Content-Type-Options: nosniff`, `frame-ancestors: none`
  e HSTS em produção.
- **CORS** com allowlist explícita de origem por ambiente e `credentials: true`.
  Nunca `origin: '*'` — seria incompatível com cookie de credencial e abriria a API.
- HTTPS obrigatório em produção; cookie `Secure` depende disso.
- `app.disable('x-powered-by')` — não anunciar o stack.

## 8.7 Rate limiting

| Endpoint             | Limite                     |
| -------------------- | -------------------------- |
| `POST /auth/login`   | 5 / 15 min por IP + e-mail |
| `POST /auth/refresh` | 30 / 15 min por IP         |
| Escrita em geral     | 100 / min por usuário      |
| Leitura em geral     | 300 / min por usuário      |

A chave do limite de login combina IP **e** e-mail: só IP permitiria enumerar senhas de
muitas contas de um mesmo IP; só e-mail permitiria bloquear a conta de outra pessoa de
propósito.

## 8.8 Segredos e configuração

- `.env` **no `.gitignore`**, desde o primeiro commit.
- `.env.example` versionado, com todas as chaves e **nenhum valor real**.
- Schema de validação de ambiente no boot: a aplicação **não sobe** sem `JWT_SECRET`,
  `JWT_REFRESH_SECRET` e `DATABASE_URL`, e recusa segredo com menos de 32 caracteres.
- Sem valor padrão de segredo no código — um default de desenvolvimento é exatamente o que
  acaba em produção.
- Em produção, as variáveis vêm do provedor de hospedagem, não de arquivo.
- Antes de qualquer commit, verificação de segredo acidental no diff.

## 8.9 Logs e auditoria

- Pino com `redact` para `authorization`, `cookie`, `password`, `token`, `refreshToken`,
  `secret`.
- `requestId` por requisição, presente no log e na resposta de erro — permite investigar um
  erro relatado pelo usuário sem expor detalhe interno a ele.
- 5xx registra stack no log; a **resposta** traz apenas mensagem genérica e `requestId`.
- Audit log nunca grava senha, hash, token ou segredo (§4.4), por uma função de redação
  única e testada.
- Audit log é somente leitura pela API, restrito a ADMIN.

**Limitação registrada:** o audit log é gravado no mesmo banco que ele audita. Um ADMIN com
acesso direto ao Postgres pode alterá-lo. Mitigação real exigiria _write-only sink_ externo
(append-only em outro serviço), fora do escopo deste MVP. Está registrado como risco aceito
em [10-riscos.md](10-riscos.md#r6).

## 8.10 Frontend

- Nada de `dangerouslySetInnerHTML`; React escapa por padrão.
- Access token em memória (§8.2) — fora do alcance de XSS persistente.
- CSP restringe origem de script.
- Mensagem de erro exibida ao usuário vem de um mapa de `code` conhecido; `message` do
  servidor nunca é injetada como HTML.
- Variável de ambiente do frontend contém apenas a URL da API. **Build de frontend é
  público** — qualquer "segredo" ali não é segredo.

## 8.11 Fora do escopo (declarado, não esquecido)

| Item                              | Por quê                                                                    |
| --------------------------------- | -------------------------------------------------------------------------- |
| MFA / 2FA                         | Valor real, mas custo alto para um MVP de portfólio                        |
| Recuperação de senha por e-mail   | Exige provedor de e-mail; está no roadmap                                  |
| SSO / OAuth                       | Não há requisito                                                           |
| Criptografia em repouso por campo | Não há dado pessoal sensível além de e-mail                                |
| WAF, proteção DDoS                | Camada de infraestrutura, não de aplicação                                 |
| Pentest formal                    | Fora do alcance; nenhuma afirmação de auditoria será feita                 |
| Conformidade LGPD completa        | Há e-mail e nome; não houve análise jurídica, e isso é dito explicitamente |

## 8.12 Riscos conhecidos e aceitos

1. Papel dentro do JWT → janela de até 15 min em rebaixamento (§8.2).
2. Audit log no mesmo banco → ADMIN com acesso direto pode alterá-lo (§8.9).
3. Rate limit em memória → com múltiplas instâncias, o limite é por instância. Correção
   seria store compartilhado (Redis); não justificado nesta escala.
4. Sem bloqueio de conta após N falhas → decisão consciente: bloqueio é vetor de negação de
   serviço contra usuário legítimo. O rate limit por IP+e-mail é a mitigação escolhida.
5. `currentStock` denormalizado → divergência é possível por bug futuro; mitigado por
   transação, CHECK e relatório de reconciliação testado (§4.4).

Nenhum destes é apresentado como resolvido. Estão aqui para serem discutidos.
