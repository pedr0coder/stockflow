# ADR-0002 — class-validator no backend, Zod no frontend

**Data:** 2026-10-17 · **Status:** Aceito

## Contexto

A preferência declarada era Zod em todo o projeto — uma única biblioteca de schema, tipos
inferidos, validação compartilhável.

Verificação da ponte entre Zod e NestJS:

```
npm view nestjs-zod version          -> 5.5.0
npm view nestjs-zod peerDependencies
{ "@nestjs/common": "^10.0.0 || ^11.0.0",
  "@nestjs/swagger": "^7.4.2 || ^8.0.0 || ^11.0.0" }
```

O projeto usa **NestJS 12**. A versão atual de `nestjs-zod` para em NestJS 11, e usá-la
exigiria `--legacy-peer-deps` — instalar uma biblioteca fora da faixa que ela própria
declara suportar, apostando que nada mudou na API interna do Nest 12.

Uma alternativa seria escrever um `ZodValidationPipe` próprio. Funciona para validar, mas
`@nestjs/swagger` gera o OpenAPI a partir dos metadados de decorator dos DTOs: com Zod puro,
a documentação da API sairia vazia ou exigiria descrever cada schema duas vezes.

## Decisão

- **Backend:** `class-validator` + `class-transformer`, a via oficialmente integrada ao
  `@nestjs/swagger`.
- **Frontend:** **Zod 4.6.7** com React Hook Form, onde ele é de fato a melhor ferramenta.

## Consequências

**Positivas**

- Sem `--legacy-peer-deps`
- OpenAPI gerado automaticamente dos DTOs — documentação que não desatualiza
- `class-transformer` permite excluir `passwordHash` da serialização por decorator
- Cada lado usa a ferramenta que o ecossistema dele suporta de verdade

**Negativas**

- Duas bibliotecas de validação no repositório
- Regra de validação duplicada entre frontend e backend (ex. tamanho mínimo de senha)

A duplicação é aceita por dois motivos: validação de cliente e de servidor têm propósitos
diferentes (experiência × segurança), e a de servidor **nunca** pode confiar na de cliente.
Compartilhar o schema economizaria algumas linhas e criaria acoplamento entre os dois
pacotes, que hoje são deployáveis de forma independente.

**Mitigação:** as constantes de regra (tamanhos, limites) ficam em um arquivo por lado, com
o mesmo nome e os mesmos valores, e um teste de integração verifica que o backend rejeita o
que o frontend rejeita.

**Revisão:** quando `nestjs-zod` declarar suporte a NestJS 12 — avaliar a migração do
backend na Fase 9 ou depois, nunca no meio da implementação.
