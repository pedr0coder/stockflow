# ADR-0004 — Argon2id via @node-rs/argon2

**Data:** 2026-10-17 · **Status:** Aceito

## Contexto

Duas restrições simultâneas: escolher um algoritmo de hash adequado e uma implementação que
instale nesta máquina.

A máquina de desenvolvimento **não tem compilador C++** (§1.3):

```
where cl.exe -> não encontrado
```

Candidatos e seu modo de instalação:

| Pacote            | Versão | Instalação                            |
| ----------------- | ------ | ------------------------------------- |
| `argon2`          | 0.45.1 | compila via node-gyp → **falha aqui** |
| `bcrypt`          | 6.0.0  | compila via node-gyp → **falha aqui** |
| `bcryptjs`        | 3.0.3  | JS puro, instala em qualquer lugar    |
| `@node-rs/argon2` | 2.2.2  | Rust + binário pré-compilado (NAPI)   |

## Decisão

**`@node-rs/argon2@2.2.2`**, com Argon2id e os parâmetros mínimos da OWASP:

```
memória     19 MiB
iterações   2
paralelismo 1
salt        gerado por senha pela biblioteca
```

## Justificativa

A escolha é melhor em duas dimensões ao mesmo tempo, não um contorno:

**Instalação** — binários pré-compilados via NAPI para Node 24 em Windows, Linux e macOS.
Não exige toolchain nativo na máquina de desenvolvimento nem no runner de CI, nem na
imagem Docker.

**Segurança** — Argon2id é a recomendação atual da OWASP para hash de senha. Ao contrário
do bcrypt, é _memory-hard_: aumentar o custo em memória encarece desproporcionalmente o
ataque por GPU e ASIC. O bcrypt também tem o limite de 72 bytes na senha, que silenciosamente
trunca entradas mais longas.

`bcryptjs` (JS puro) foi recusado por ser consideravelmente mais lento que a implementação
nativa para o mesmo custo — o que, para não degradar o tempo de login, levaria a reduzir o
fator de custo, enfraquecendo exatamente o que se quer proteger.

O hash gerado carrega os próprios parâmetros, o que permite elevá-los no futuro e
re-hashear a senha no login seguinte, sem migração de banco.

## Consequências

**Positivas**

- `npm install` funciona nesta máquina, no CI e no Docker sem build tools
- Algoritmo alinhado à recomendação atual
- Parâmetros ajustáveis sem migração

**Negativas**

- Dependência de binário pré-compilado: uma plataforma nova exigiria verificar se há
  binário publicado
- 19 MiB de memória por verificação de senha — com o rate limit de login da §8.7 (5 por
  15 min), não é vetor de exaustão de memória

**Nota de política:** a política de senha segue o NIST SP 800-63B — mínimo de 10
caracteres e verificação contra lista de senhas comuns, **sem** exigência de símbolo
obrigatório nem troca periódica, porque ambas empurram o usuário para padrões previsíveis.
