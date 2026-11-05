import { describe, expect, it, vi } from 'vitest';
import { Prisma } from '../generated/prisma/client';
import { ProductsService } from './products.service';

/**
 * M7C-2: `stockStatus=out` deixou de usar a consulta auxiliar de ids
 * (`SELECT id FROM products WHERE current_stock = 0`) e passou a filtrar
 * `currentStock = 0` direto no `WHERE` do Prisma. O comportamento observável
 * (quais produtos voltam) é coberto pela integração em `catalog.int-spec.ts`;
 * aqui fica o que a integração não enxerga: QUANTAS consultas rodam e COMO o
 * filtro compõe com os demais.
 */
function buildService() {
  const prisma = {
    product: {
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
    },
    $queryRaw: vi.fn().mockResolvedValue([{ id: 'p-low-1' }, { id: 'p-low-2' }]),
  };
  const service = new ProductsService(prisma as never, {} as never);

  return { prisma, service };
}

const BASE_QUERY = { page: 1, limit: 20, order: 'asc' as const };

describe('ProductsService.findAll — stockStatus', () => {
  it('out: filtra currentStock = 0 direto no Prisma, sem consulta SQL auxiliar', async () => {
    const { prisma, service } = buildService();

    await service.findAll({ ...BASE_QUERY, stockStatus: 'out' } as never);

    expect(prisma.$queryRaw).not.toHaveBeenCalled();
    expect(prisma.product.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.product.count).toHaveBeenCalledTimes(1);

    const { where } = prisma.product.findMany.mock.calls[0]?.[0] as {
      where: { currentStock: Prisma.Decimal; id?: unknown };
    };
    expect(where.currentStock).toBeInstanceOf(Prisma.Decimal);
    expect(where.currentStock.equals(0)).toBe(true);
    expect(where).not.toHaveProperty('id');
    // `findMany` e `count` recebem exatamente o mesmo filtro.
    expect(prisma.product.count).toHaveBeenCalledWith({ where });
  });

  it('out: compõe com isActive, categoria, fornecedor e busca no mesmo WHERE', async () => {
    const { prisma, service } = buildService();

    await service.findAll({
      ...BASE_QUERY,
      stockStatus: 'out',
      isActive: true,
      categoryId: 'cat-1',
      supplierId: 'sup-1',
      search: 'parafuso',
    } as never);

    const { where } = prisma.product.findMany.mock.calls[0]?.[0] as {
      where: Record<string, unknown>;
    };
    expect(where).toMatchObject({ isActive: true, categoryId: 'cat-1', supplierId: 'sup-1' });
    expect(where).toHaveProperty('OR');
    expect(where['currentStock']).toBeInstanceOf(Prisma.Decimal);
  });

  it('out: preserva paginação e ordenação', async () => {
    const { prisma, service } = buildService();

    await service.findAll({
      page: 3,
      limit: 10,
      order: 'desc',
      sort: 'sku',
      stockStatus: 'out',
    } as never);

    expect(prisma.product.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 20, take: 10, orderBy: { sku: 'desc' } }),
    );
  });

  it.each(['low', 'ok'] as const)(
    '%s: mantém a consulta SQL auxiliar e filtra por id (comportamento intacto)',
    async (stockStatus) => {
      const { prisma, service } = buildService();

      await service.findAll({ ...BASE_QUERY, stockStatus });

      expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
      const { where } = prisma.product.findMany.mock.calls[0]?.[0] as {
        where: Record<string, unknown>;
      };
      expect(where['id']).toEqual({ in: ['p-low-1', 'p-low-2'] });
      expect(where).not.toHaveProperty('currentStock');
    },
  );

  it('sem stockStatus: nenhum filtro de saldo e nenhuma consulta auxiliar', async () => {
    const { prisma, service } = buildService();

    await service.findAll({ ...BASE_QUERY });

    expect(prisma.$queryRaw).not.toHaveBeenCalled();
    const { where } = prisma.product.findMany.mock.calls[0]?.[0] as {
      where: Record<string, unknown>;
    };
    expect(where).not.toHaveProperty('currentStock');
    expect(where).not.toHaveProperty('id');
  });
});
