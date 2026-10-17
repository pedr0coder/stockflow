# 10 — Riscos Técnicos

Classificação: **impacto** × **probabilidade**. Riscos são listados para serem decididos,
não para constar.

---

## R1 — Ausência de banco de dados local 🟢 RESOLVIDO

**Impacto:** alto · **Probabilidade:** era certa (já havia ocorrido) · **Situação: resolvido em 2026-10-17**

Docker, WSL2 e PostgreSQL não estavam instalados, e isso bloqueava a Fase 2, que precisa de
um banco acessível.

### Resolução adotada: opção A

WSL2 com Docker Desktop, a opção recomendada abaixo. Estado verificado por comando e
registrado em [01-diagnostico.md §1.4](01-diagnostico.md):

| Item                  | Resultado verificado                                                  |
| --------------------- | --------------------------------------------------------------------- |
| WSL2                  | Ubuntu, versão 2, em execução                                         |
| Virtualização         | `HypervisorPresent = True`                                            |
| Docker Engine         | 29.8.2                                                                |
| Docker Compose        | v5.6.0                                                                |
| PostgreSQL            | 17.11, `SELECT version()` executado em container `postgres:17-alpine` |
| Extensão `pg_trgm`    | disponível (1.6) e criada com sucesso                                 |
| Recursos do WSL2      | 8 GB de RAM e 6 processadores, confirmados via `docker info`          |
| Primitiva do ADR-0003 | UPDATE condicional e CHECK validados em SQL                           |

O risco de virtualização desabilitada na BIOS, levantado como ressalva da opção A, não se
concretizou. As opções B e C ficaram desnecessárias.

**Risco residual:** nenhum bloqueante. Permanecem dois pontos de atenção menores, ambos de
baixo impacto: o Docker Desktop precisa estar em execução antes de `npm run test:int`, e o
primeiro `docker compose up` em outra máquina baixa a imagem do Postgres (424 MB). Os dois
entram no README como pré-requisito, não como problema.

### Opções avaliadas na decisão (registro histórico)

**A — WSL2 + Docker Desktop** _(recomendada)_

```
+ Entrega exatamente o docker-compose.yml que o plano prevê
+ Paridade entre desenvolvimento, CI e produção
+ "git clone && docker compose up" é um diferencial real no portfólio
− Exige privilégio de administrador e reinicialização
− ~10 GB em disco (há 138 GB livres)
− Risco de virtualização desabilitada na BIOS (não foi possível verificar sem elevação)
```

```bash
wsl --install
```

Depois, reiniciar e instalar o Docker Desktop.

**B — PostgreSQL nativo para Windows**

```
+ Instalação rápida, sem reinicialização, ~300 MB
+ Desbloqueia a Fase 2 imediatamente
− docker-compose.yml iria para o repositório sem ter sido executado localmente
  (eu o marcaria como não verificado — não afirmaria que funciona)
− Divergência entre a máquina de desenvolvimento e o CI
```

**C — Postgres gerenciado em nuvem (Neon, Supabase — plano gratuito)**

```
+ Zero instalação local
+ O mesmo banco serve para o deploy da Fase 8
− Depende de internet para desenvolver
− Latência em cada teste de integração (a suíte fica perceptivelmente mais lenta)
− Exige criação de conta (você precisa fazer isso, não eu)
```

**Recomendação: A.** O custo é pontual (uma instalação, uma reinicialização) e o retorno é
permanente: paridade de ambiente, Docker Compose de fato testado e um `docker compose up`
que funciona na máquina de qualquer pessoa que abrir seu repositório. B e C deixariam uma
assimetria que eu teria de documentar como não verificada.

Se a virtualização estiver desabilitada na BIOS, A falha e a alternativa passa a ser B.

**Resultado:** a opção A foi executada e verificada. Ver a resolução no início desta seção.

---

## R2 — TypeScript 7 no ecossistema NestJS 🟡

**Impacto:** alto · **Probabilidade:** média (mitigado)

`typescript@latest` é 7.0.2, mas `@nestjs/swagger@12.0.2` declara peer
`^5.5.0 || ^6.0.0` e `@nestjs/cli@12.0.8` depende de `~6.0.2`. O TS 7 (porte nativo) também
não expõe a Compiler API que o `nest build` consome.

**Mitigação:** TypeScript **6.0.3** fixado nos dois pacotes ([ADR-0001](adr/0001-versao-typescript.md)).
`npm install typescript` sem versão explícita é o erro a evitar.

**Risco residual:** nenhum relevante. TS 6 é estável e suportado.

---

## R3 — `prisma@latest` é release candidate 🟡

**Impacto:** alto · **Probabilidade:** alta se não houver cuidado

A tag `latest` de `prisma` aponta para `8.0.0-rc.23`, enquanto `@prisma/client` aponta para
`7.10.1`. Instalar sem versão explícita produz CLI e client desalinhados.

**Mitigação:** versões **exatas** `7.10.1` em ambos; `package-lock.json` versionado;
`npm ci` no CI. Dependabot, se ativado, não atualizará Prisma automaticamente.

**Observação:** a GA do Prisma 8 está prevista para outubro de 2026 — pode sair durante o
projeto. Migrar no meio da implementação não traria benefício; a decisão é ficar no 7.10.1
até a Fase 9, e registrar a migração como item de roadmap.

---

## R4 — Dependência nativa sem toolchain de compilação 🟢

**Impacto:** médio · **Probabilidade:** resolvida

`argon2` e `bcrypt` compilam via node-gyp, e não há MSVC Build Tools nesta máquina (§1.3).

**Mitigação:** `@node-rs/argon2` (Rust, binário pré-compilado via NAPI). Também é a escolha
tecnicamente melhor — Argon2id é a recomendação atual da OWASP
([ADR-0004](adr/0004-hash-de-senha.md)).

**Atenção futura:** qualquer nova dependência nativa deve ser verificada antes de entrar.

---

## R5 — Concorrência em movimentação de estoque 🔴

**Impacto:** crítico (corrompe dado de negócio) · **Probabilidade:** alta em implementação ingênua

É o risco central do produto. Saídas simultâneas podem aprovar mais do que existe em
estoque e deixar o saldo errado (§4.5).

**Mitigação em três camadas:** UPDATE condicional atômico; transação envolvendo saldo e
movimento; CHECK `current_stock >= 0` no Postgres.

**Verificação:** teste de integração com 5 saídas paralelas que falha de forma
determinística em implementação ingênua (§7.4). Não é mitigado por revisão de código, é
mitigado por teste executável.

---

## R6 — Audit log alterável por quem tem acesso ao banco 🟡

**Impacto:** médio · **Probabilidade:** baixa

O log de auditoria fica no mesmo PostgreSQL que ele audita. Um ADMIN com acesso direto ao
banco pode alterá-lo.

**Mitigação parcial:** API somente leitura; sem rota de escrita ou exclusão; usuário da
aplicação sem privilégio de DDL.

**Risco aceito.** Mitigação real exigiria _sink_ externo append-only, o que está fora do
escopo. Registrado em §8.9 — não será apresentado como resolvido.

---

## R7 — Escopo maior que o tempo disponível 🟠

**Impacto:** alto (projeto inacabado é pior que projeto pequeno e pronto) · **Probabilidade:** média

É o risco mais comum em projeto de portfólio, e o requisito 19 já o reconhece: qualidade e
conclusão valem mais que quantidade.

**Mitigação:**

- fases com critério de aceite e aprovação explícita, impedindo avanço sobre base instável;
- QR Code, CSV e recuperação de senha já estão **fora** do MVP;
- se o tempo apertar, o corte segue esta ordem: relatórios avançados → tela de auditoria →
  módulo de inventário. Autenticação, RBAC, produtos e movimentação **não** são cortáveis:
  são o núcleo técnico e o conteúdo das entrevistas.

---

## R8 — Precisão numérica 🟢

**Impacto:** alto · **Probabilidade:** resolvida por desenho

`number` em JavaScript é IEEE-754. Usá-lo para quantidade ou custo acumula erro.

**Mitigação:** `Decimal` no Postgres, `Prisma.Decimal` na aplicação, **string** no JSON
(§5.7). Teste de divergência com decimais (`7.250` vs `7.500`) existe para falhar se
alguém trocar por `number`.

---

## R9 — Desalinhamento entre `currentStock` e o histórico 🟡

**Impacto:** alto · **Probabilidade:** baixa

`currentStock` é denormalizado (§4.4). Bug futuro pode fazê-lo divergir da soma dos
movimentos.

**Mitigação:** atualização sempre na mesma transação; CHECK no banco; `GET
/reports/stock-reconciliation`; teste de integração que roda ~200 movimentações e confere a
igualdade.

---

## R10 — Versões muito recentes do frontend 🟢

**Impacto:** baixo · **Probabilidade:** baixa

Vite 8, React 19.3, Tailwind 4.3 e React Router 8 são versões recentes; documentação de
terceiros e respostas em fórum frequentemente se referem a versões anteriores.

**Mitigação:** usar a documentação oficial como fonte, não tutorial. Tailwind v4 mudou para
configuração CSS-first (`@theme`) e o shadcn/ui substituiu `tailwindcss-animate` por
`tw-animate-css` — ambos já previstos. Nenhuma das versões tem incompatibilidade declarada
entre si.

---

## R11 — Deploy com custo 🟢

**Impacto:** baixo · **Probabilidade:** média

Plano gratuito de hospedagem costuma hibernar o serviço, o que faz o primeiro acesso de um
recrutador demorar.

**Mitigação:** avaliar na Fase 8; se houver hibernação, o README avisa e o ambiente de
demonstração fica documentado. Um aviso honesto é melhor que um recrutador achando que o
app está quebrado.

---

## Resumo

| #   | Risco                   | Severidade | Situação                                  |
| --- | ----------------------- | ---------- | ----------------------------------------- |
| R5  | Concorrência de estoque | 🔴         | Mitigação desenhada e testável            |
| R7  | Escopo × tempo          | 🟠         | Fases e ordem de corte definidas          |
| R2  | TypeScript 7            | 🟡         | Resolvido (TS 6.0.3)                      |
| R3  | Prisma RC               | 🟡         | Resolvido (7.10.1 exato)                  |
| R6  | Audit log alterável     | 🟡         | Aceito e documentado                      |
| R9  | Saldo × histórico       | 🟡         | Mitigado e testado                        |
| R1  | Banco local ausente     | 🟢         | **Resolvido (WSL2 + Docker, verificado)** |
| R4  | Dependência nativa      | 🟢         | Resolvido (@node-rs/argon2)               |
| R8  | Precisão numérica       | 🟢         | Resolvido por desenho                     |
| R10 | Versões recentes        | 🟢         | Monitorado                                |
| R11 | Custo de deploy         | 🟢         | Fase 8                                    |

Nenhum risco bloqueante permanece aberto. O risco de maior severidade em aberto é o R5, que
não é um problema de ambiente mas o núcleo técnico do produto, e cuja mitigação só é
considerada válida quando o teste de concorrência da Fase 5 passar de verdade.
