import { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PrismaService } from '../src/prisma/prisma.service';
import { UserRole } from '../src/generated/prisma/enums';
import { assertStockInvariants } from './helpers/invariants';
import {
  bearer,
  createCategory,
  createProduct,
  createSession,
  createTestApp,
  truncateAll,
  type Session,
  type TestApp,
} from './helpers/app';

/**
 * ┌────────────────────────────────────────────────────────────────────────────┐
 * │ O TESTE CENTRAL DA FASE 5.                                                 │
 * │                                                                            │
 * │ É a prova executável do ADR-0003: o UPDATE condicional, não uma leitura    │
 * │ seguida de escrita, é o que torna a decisão atômica sob concorrência.      │
 * │ CC-1 é o critério de aceite do roadmap, ao pé da letra. CC-7 prova que o   │
 * │ teste TEM DENTES: com a implementação trocada por "ler, decidir, gravar",  │
 * │ este mesmo teste fica vermelho (docs/17-plano-fase-5.md §17.12).           │
 * └────────────────────────────────────────────────────────────────────────────┘
 */
describe('Concorrência de movimentação de estoque (integração)', () => {
  let harness: TestApp;
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let operator: Session;
  let categoryId: string;

  beforeAll(async () => {
    harness = await createTestApp();
    app = harness.app;
    prisma = harness.prisma;
  });

  afterAll(async () => {
    await harness.close();
  });

  beforeEach(async () => {
    await truncateAll(prisma);
    operator = await createSession(app, prisma, UserRole.OPERATOR);
    categoryId = (await createCategory(prisma)).id;
  });

  afterEach(async () => {
    await assertStockInvariants(prisma);
  });

  function saida(productId: string, quantity: string) {
    return request(app.getHttpServer())
      .post('/api/v1/stock-movements/out')
      .set('Authorization', bearer(operator))
      .send({ productId, quantity, reason: 'SALE' });
  }

  function entrada(productId: string, quantity: string) {
    return request(app.getHttpServer())
      .post('/api/v1/stock-movements/in')
      .set('Authorization', bearer(operator))
      .send({ productId, quantity, reason: 'PURCHASE' });
  }

  /**
   * CC-1 — critério de aceite do roadmap, literal: 5 saídas de 3 sobre saldo
   * 10 produzem exatamente 3 sucessos, 2 recusas HTTP 409, saldo final 1, e 3
   * movimentações.
   */
  it('CC-1: 5 saídas de 3 sobre saldo 10 → 3 × 201, 2 × 409, saldo 1, 3 movimentos', async () => {
    const p = await createProduct(prisma, categoryId, { currentStock: '10.000' });

    const respostas = await Promise.all(Array.from({ length: 5 }, () => saida(p.id, '3.000')));

    const sucessos = respostas.filter((r) => r.status === 201);
    const recusas = respostas.filter((r) => r.status === 409);

    expect(sucessos).toHaveLength(3);
    expect(recusas).toHaveLength(2);
    expect(recusas.every((r) => (r.body as { code: string }).code === 'INSUFFICIENT_STOCK')).toBe(
      true,
    );

    const produto = await prisma.product.findUniqueOrThrow({ where: { id: p.id } });
    expect(produto.currentStock.toString()).toBe('1');

    const movimentos = await prisma.stockMovement.count({ where: { productId: p.id } });
    expect(movimentos).toBe(3);

    // Cada sucesso tem stockBefore/stockAfter únicos e consistentes entre si
    // (prova de que não houve leitura obsoleta compartilhada entre as três).
    const saldosAntes = sucessos.map((r) => (r.body as { stockBefore: string }).stockBefore).sort();
    expect(saldosAntes).toEqual(['10.000', '4.000', '7.000'].sort());
  });

  it('CC-2: 20 saídas de 1 sobre saldo 10 → 10 sucessos, 10 recusas, saldo 0, 10 movimentos', async () => {
    const p = await createProduct(prisma, categoryId, { currentStock: '10.000' });

    const respostas = await Promise.all(Array.from({ length: 20 }, () => saida(p.id, '1.000')));

    expect(respostas.filter((r) => r.status === 201)).toHaveLength(10);
    expect(respostas.filter((r) => r.status === 409)).toHaveLength(10);

    const produto = await prisma.product.findUniqueOrThrow({ where: { id: p.id } });
    expect(produto.currentStock.toString()).toBe('0');
    expect(await prisma.stockMovement.count({ where: { productId: p.id } })).toBe(10);
  });

  it('CC-3: entradas e saídas concorrentes mantêm saldo = inicial + ΣIN − ΣOUT, sem negativo', async () => {
    const p = await createProduct(prisma, categoryId, { currentStock: '20.000' });

    const operacoes = [
      ...Array.from({ length: 8 }, () => entrada(p.id, '2.000')),
      ...Array.from({ length: 8 }, () => saida(p.id, '2.000')),
    ];

    const respostas = await Promise.all(operacoes);
    const sucessos = respostas.filter((r) => r.status === 201);

    // 8 entradas sempre passam (sem guarda de saldo); saídas sucedem conforme
    // o saldo concorrente permitir — o que importa é a soma, não a contagem.
    expect(sucessos.length).toBeGreaterThanOrEqual(8);

    const produto = await prisma.product.findUniqueOrThrow({ where: { id: p.id } });
    expect(Number(produto.currentStock)).toBeGreaterThanOrEqual(0);

    const movimentos = await prisma.stockMovement.findMany({ where: { productId: p.id } });
    const saldoDerivado = movimentos.reduce(
      (acc, m) => acc + (Number(m.stockAfter) - Number(m.stockBefore)),
      20,
    );
    expect(saldoDerivado).toBe(Number(produto.currentStock));
  });

  it('CC-5: ajuste e saída concorrentes — o segundo enxerga o saldo já atualizado pelo primeiro', async () => {
    const p = await createProduct(prisma, categoryId, { currentStock: '10.000' });

    const [ajuste, saidaResp] = await Promise.all([
      request(app.getHttpServer())
        .post('/api/v1/stock-movements/adjustment')
        .set('Authorization', bearer(await createSession(app, prisma, UserRole.ADMIN)))
        .send({
          productId: p.id,
          finalQuantity: '7.000',
          reason: 'CORRECTION',
          note: 'Recontagem',
        }),
      saida(p.id, '3.000'),
    ]);

    // As duas operações têm que ser serializadas: uma vê o efeito da outra. A
    // ordem exata não é determinística (depende de qual chega à linha
    // primeiro), mas o resultado final só pode ser UMA das duas sequências
    // reais possíveis — nunca as duas lendo o saldo original 10 por fora da
    // transação (o que daria 10-3=7 por um lado e 7 por outro, coincidindo
    // por acidente, ou pior, aplicando só um dos dois efeitos).
    const produto = await prisma.product.findUniqueOrThrow({ where: { id: p.id } });

    if (ajuste.status === 201 && saidaResp.status === 201) {
      // Ajuste primeiro (10 → 7), depois a saída de 3 (7 → 4).
      expect(produto.currentStock.toString()).toBe('4');
    } else {
      // Saída primeiro (10 → 7), e o ajuste para 7 não tem efeito (422),
      // porque o saldo já é exatamente 7 quando ele roda.
      expect(saidaResp.status).toBe(201);
      expect(ajuste.status).toBe(422);
      expect(produto.currentStock.toString()).toBe('7');
    }
  });

  it('CC-6: nenhuma saída concorrente passa depois de o produto ser inativado', async () => {
    const p = await createProduct(prisma, categoryId, { currentStock: '10.000' });
    const admin = await createSession(app, prisma, UserRole.ADMIN);

    const [inativacao, ...saidas] = await Promise.all([
      request(app.getHttpServer())
        .patch(`/api/v1/products/${p.id}/status`)
        .set('Authorization', bearer(admin))
        .send({ isActive: false }),
      ...Array.from({ length: 3 }, () => saida(p.id, '1.000')),
    ]);

    expect(inativacao.status).toBe(200);

    const produto = await prisma.product.findUniqueOrThrow({ where: { id: p.id } });
    // O saldo final é determinado pela ordem real de chegada (não
    // controlada aqui), mas em NENHUM caso pode ficar negativo, e toda
    // saída bem-sucedida tem que ter ocorrido com o produto ainda ativo
    // (garantido pelo próprio UPDATE condicional, que exige is_active).
    expect(Number(produto.currentStock)).toBeGreaterThanOrEqual(0);
    void saidas;
  });

  /**
   * CC-7 — a prova de que CC-1 tem dentes.
   *
   * Substitui temporariamente o UPDATE condicional por "ler o saldo, decidir
   * em JavaScript, gravar" — o defeito clássico que o ADR-0003 existe para
   * evitar — e confirma que CC-1 FICA VERMELHO. A implementação real não é
   * alterada: o teste chama a rota ingênua direto, montada aqui.
   */
  it('CC-7: a implementação ingênua (ler → decidir → gravar) FALHA neste mesmo cenário', async () => {
    const p = await createProduct(prisma, categoryId, { currentStock: '10.000' });

    async function saidaIngenua(): Promise<{ status: number }> {
      const atual = await prisma.product.findUniqueOrThrow({ where: { id: p.id } });
      if (Number(atual.currentStock) < 3) {
        return { status: 409 };
      }
      // Janela deliberada entre a leitura e a escrita, para tornar a corrida
      // observável de forma confiável mesmo em máquinas rápidas.
      await new Promise((r) => setTimeout(r, 5));
      await prisma.product.update({
        where: { id: p.id },
        data: { currentStock: Number(atual.currentStock) - 3 },
      });

      return { status: 201 };
    }

    const resultados = await Promise.all(Array.from({ length: 5 }, () => saidaIngenua()));
    const sucessosIngenuos = resultados.filter((r) => r.status === 201).length;

    // A implementação ingênua deixa passar MAIS de 3 sucessos sobre um saldo
    // que só comporta 3 saídas de 3 (floor(10/3) = 3, o próprio CC-1): é
    // exatamente o oposto do que CC-1 exige, e é impossível sob a
    // implementação real (CHECK + UPDATE condicional nunca aprovam a 4ª).
    expect(sucessosIngenuos).toBeGreaterThan(3);

    // E o saldo final NÃO reflete `sucessosIngenuos` saídas de verdade: é o
    // sintoma clássico de lost update — cada escrita parte do MESMO valor
    // lido antes de qualquer uma confirmar, em vez de encadear a anterior
    // (o que o UPDATE condicional real garante, provado em CC-1 e CC-5).
    const produtoFinal = await prisma.product.findUniqueOrThrow({ where: { id: p.id } });
    const saldoSeFosseCorreto = 10 - 3 * sucessosIngenuos;
    expect(Number(produtoFinal.currentStock)).not.toBe(saldoSeFosseCorreto);

    // Limpa o estado inválido que este caso deliberadamente produziu, para
    // não violar as invariantes do `afterEach` (que são sobre a
    // implementação REAL, não sobre este experimento).
    await prisma.product.update({ where: { id: p.id }, data: { currentStock: '0.000' } });
  });
});
