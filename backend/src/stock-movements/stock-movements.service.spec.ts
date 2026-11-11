import { describe, expect, it, vi } from 'vitest';
import { StockMovementsService } from './stock-movements.service';

function buildService() {
  const prisma = {
    stockMovement: {
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn().mockResolvedValue(null),
      count: vi.fn().mockResolvedValue(0),
    },
  };
  const audit = {
    recordInTransaction: vi.fn(),
  };
  const service = new StockMovementsService(prisma as never, audit as never);

  return { prisma, service };
}

const BASE_QUERY = { page: 1, limit: 20, order: 'desc' as const };

describe('StockMovementsService — relações incluídas (anti N+1 e exibição direta)', () => {
  it('findAll inclui autor e produto (id, nome, sku) na mesma consulta', async () => {
    const { prisma, service } = buildService();

    await service.findAll(BASE_QUERY);

    expect(prisma.stockMovement.findMany).toHaveBeenCalledTimes(1);
    const callArg = prisma.stockMovement.findMany.mock.calls[0]?.[0] as {
      include: {
        user: { select: { id: boolean; name: boolean } };
        product: { select: { id: boolean; name: boolean; sku: boolean } };
      };
    };

    expect(callArg.include).toEqual({
      user: { select: { id: true, name: true } },
      product: { select: { id: true, name: true, sku: true } },
    });
  });

  it('findByProduct inclui autor e produto', async () => {
    const { prisma, service } = buildService();

    await service.findByProduct('p-1', BASE_QUERY);

    expect(prisma.stockMovement.findMany).toHaveBeenCalledTimes(1);
    const callArg = prisma.stockMovement.findMany.mock.calls[0]?.[0] as {
      where: { productId: string };
      include: unknown;
    };

    expect(callArg.where.productId).toBe('p-1');
    expect(callArg.include).toEqual({
      user: { select: { id: true, name: true } },
      product: { select: { id: true, name: true, sku: true } },
    });
  });

  it('findOne inclui autor e produto', async () => {
    const { prisma, service } = buildService();
    prisma.stockMovement.findUnique.mockResolvedValue({
      id: 'm-1',
      productId: 'p-1',
      user: { id: 'u-1', name: 'User 1' },
      product: { id: 'p-1', name: 'Prod 1', sku: 'SKU-1' },
    });

    const result = await service.findOne('m-1');

    expect(prisma.stockMovement.findUnique).toHaveBeenCalledWith({
      where: { id: 'm-1' },
      include: {
        user: { select: { id: true, name: true } },
        product: { select: { id: true, name: true, sku: true } },
      },
    });
    expect(result.product).toEqual({ id: 'p-1', name: 'Prod 1', sku: 'SKU-1' });
  });
});
