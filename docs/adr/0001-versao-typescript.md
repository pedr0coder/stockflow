# ADR-0001 — TypeScript 6.0.3 em vez de 7.x

**Data:** 2026-10-17 · **Status:** Aceito

## Contexto

`typescript@latest` é **7.0.2** — o porte nativo do compilador (escrito em Go). Seria a
escolha natural de um `npm install typescript`.

Verificação no registro npm:

```
npm view typescript dist-tags                        -> latest: 7.0.2
npm view @nestjs/cli dependencies.typescript         -> ~6.0.2
npm view @nestjs/swagger peerDependencies.typescript -> ^5.5.0 || ^6.0.0
```

Dois problemas concretos:

1. `@nestjs/swagger@12.0.2` **não declara suporte a TypeScript 7**. Instalar 7.x gera
   conflito de peer dependency, que só passaria com `--legacy-peer-deps`.
2. O TypeScript 7.0 não expõe a Compiler API programática, e `nest build` é consumidora
   dessa API. O build do NestJS não funcionaria.

O NestJS também depende de `experimentalDecorators` e `emitDecoratorMetadata` para
injeção de dependência por construtor. O suporte a esses flags existe no porte nativo, mas
isso não resolve o item 2.

## Decisão

**TypeScript 6.0.3** no backend e no frontend.

O frontend não tem a restrição do NestJS e poderia usar 7.x, mas usará 6.0.3 também: uma
única versão de linguagem no repositório evita divergência de comportamento de compilação
entre os dois pacotes e torna a configuração explicável em uma linha.

## Consequências

**Positivas**

- Toolchain do NestJS funciona sem flag de contorno
- Sem `--legacy-peer-deps` — nenhuma dívida técnica escondida no `npm install`
- TS 6.0.3 é estável e suportado

**Negativas**

- Sem o ganho de velocidade de compilação do compilador nativo
- Será necessário reavaliar quando o NestJS declarar suporte a TS 7

**Revisão:** quando `@nestjs/swagger` e `@nestjs/cli` declararem suporte a TypeScript 7.
Até então, `typescript` fica fixado e fora de atualização automática.
