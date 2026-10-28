import { Injectable } from '@nestjs/common';
import { v7 as uuidv7 } from 'uuid';
import { AuditAction, AuditService } from '../audit/audit.service';
import { buildPage, type PageDto } from '../common/dto/page.dto';
import {
  InventoryAlreadyApprovedError,
  InventoryInvalidStateError,
  InventoryNotOpenError,
  InventoryApprovalInsufficientStockError,
  NoItemsCountedError,
  ProductInOpenInventoryError,
  ProductsNotFoundForInventoryError,
} from '../common/errors/inventory.errors';
import {
  InventoryItemNotFoundError,
  InventoryNotFoundError,
} from '../common/errors/not-found.errors';
import { BusinessRuleError } from '../common/errors/resource.errors';
import { formatDecimalField } from '../common/utils/decimal-scale';
import { PG_NUMERIC_OVERFLOW, PG_UNIQUE_VIOLATION, pgErrorCode } from '../common/utils/pg-error';
import { toSkipTake } from '../common/utils/pagination';
import { MovementReason, MovementType, InventoryStatus } from '../generated/prisma/enums';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CountItemDto } from './dto/count-item.dto';
import type {
  InventoryAdjustmentDto,
  InventoryApprovalResultDto,
  InventoryDto,
  InventoryItemDto,
} from './dto/inventory.dto';
import { OpenInventoryDto } from './dto/open-inventory.dto';
import { QueryInventoriesDto } from './dto/query-inventories.dto';
import {
  applyInventoryDelta,
  cancelInventory,
  insertInventory,
  insertInventoryItems,
  lockInventoryForApproval,
  nextInventoryCode,
  readDivergentItems,
  readExistingProductIds,
  readInventoryState,
  readItemState,
  readItemsDetail,
  readProductStocks,
  readRetainingInventories,
  recordCount,
  submitInventory,
} from './inventories.sql';

const WITH_USERS = {
  createdBy: { select: { id: true, name: true } },
  approvedBy: { select: { id: true, name: true } },
} as const;

/** Transação do marco 5B: mesmo isolamento do 5A, timeout maior (teto de 200 itens, §17.5.7). */
const INVENTORY_TX_OPTIONS = {
  isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
  timeout: 30_000,
} as const;

@Injectable()
export class InventoriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Abre o inventário, com retentativa limitada por conflito de CÓDIGO.
   *
   * Nenhum advisory lock serializa esta operação (revisão pós-5A, registrada
   * em `inventories.sql.ts`, `nextInventoryCode`): duas aberturas de produtos
   * diferentes não esperam uma pela outra. A única colisão possível é as duas
   * calcularem o MESMO próximo código do ano — resolvida relançando a
   * transação inteira com um código recalculado, nunca reaproveitando estado
   * da tentativa anterior.
   *
   * O teto é generoso de propósito, mas É FINITO e PODE SE ESGOTAR: sob N
   * aberturas verdadeiramente simultâneas (um "thundering herd" de abertura
   * de inventário, cenário de teste de estresse, não de uso real), cada
   * rodada de colisão deixa passar só UMA (as demais esperam o commit da que
   * ganhou e só depois recebem 23505), então o pior caso teórico precisa de
   * até N rodadas — medido e verde com N=20 no teste de concorrência
   * (`inventories.int-spec.ts`). Com N > `MAX_CODE_ATTEMPTS` colidindo no
   * MESMO número, a abertura que esgota as tentativas propaga o erro de
   * unicidade (23505) como 500, em vez de ter sucesso — uma limitação aceita,
   * não uma garantia de convergência sob concorrência arbitrariamente alta.
   * Fica registrada aqui e em docs/17-plano-fase-5.md §17.18.1.
   */
  async open(dto: OpenInventoryDto, userId: string): Promise<InventoryDto> {
    const MAX_CODE_ATTEMPTS = 25;

    for (let attempt = 1; attempt <= MAX_CODE_ATTEMPTS; attempt += 1) {
      try {
        const inventory = await this.prisma.$transaction(async (tx) => {
          const existing = await readExistingProductIds(tx, dto.productIds);
          const existingIds = new Set(existing.map((row) => row.id));
          const missing = dto.productIds.filter((id) => !existingIds.has(id));

          if (missing.length > 0) {
            throw new ProductsNotFoundForInventoryError(missing);
          }

          const inventoryId = uuidv7();
          const code = await nextInventoryCode(tx);
          const itemIds = dto.productIds.map(() => uuidv7());

          await insertInventory(tx, inventoryId, code, userId, dto.note);
          const inserted = await insertInventoryItems(tx, inventoryId, itemIds, dto.productIds);

          if (inserted.length < dto.productIds.length) {
            const insertedSet = new Set(inserted);
            const retainedProductIds = dto.productIds.filter((id) => !insertedSet.has(id));
            const retaining = await readRetainingInventories(tx, retainedProductIds);

            throw new ProductInOpenInventoryError(
              retaining.map((row) => ({
                productId: row.product_id,
                inventoryId: row.inventory_id,
              })),
            );
          }

          const inactiveProductIds = existing.filter((row) => !row.is_active).map((row) => row.id);

          await this.audit.recordInTransaction(tx, {
            action: AuditAction.INVENTORY_OPENED,
            entity: 'Inventory',
            entityId: inventoryId,
            actorId: userId,
            after: {
              code,
              productIds: dto.productIds,
              ...(inactiveProductIds.length > 0 ? { inactiveProductIds } : {}),
            },
          });

          return tx.inventory.findUniqueOrThrow({
            where: { id: inventoryId },
            include: WITH_USERS,
          });
        }, INVENTORY_TX_OPTIONS);

        return this.toDto(inventory);
      } catch (error) {
        if (this.isCodeConflict(error) && attempt < MAX_CODE_ATTEMPTS) {
          continue;
        }

        throw error;
      }
    }

    // Inalcançável: o laço sempre retorna ou lança antes de terminar as
    // tentativas. Só aqui para o TypeScript ver uma função que não "cai pro
    // fim" sem valor.
    throw new Error('open: esgotou as tentativas de código sem retornar nem lançar.');
  }

  /** `23505` especificamente em `inventories_code_key` — qualquer outro 23505 propaga. */
  private isCodeConflict(error: unknown): boolean {
    return (
      pgErrorCode(error) === PG_UNIQUE_VIOLATION &&
      error instanceof Error &&
      error.message.includes('inventories_code_key')
    );
  }

  async findAll(query: QueryInventoriesDto): Promise<PageDto<InventoryDto>> {
    const { skip, take } = toSkipTake(query.page, query.limit);
    const where = query.status !== undefined ? { status: query.status } : {};

    const [rows, total] = await Promise.all([
      this.prisma.inventory.findMany({
        where,
        orderBy: [{ startedAt: query.order }, { id: 'desc' }],
        skip,
        take,
        include: WITH_USERS,
      }),
      this.prisma.inventory.count({ where }),
    ]);

    return buildPage(
      rows.map((row) => this.toDto(row)),
      total,
      query.page,
      query.limit,
    );
  }

  async findOne(id: string): Promise<InventoryDto> {
    const inventory = await this.prisma.inventory.findUnique({
      where: { id },
      include: WITH_USERS,
    });

    if (!inventory) {
      throw new InventoryNotFoundError();
    }

    const itemRows = await readItemsDetail(this.prisma, id);

    return this.toDto(
      inventory,
      itemRows.map((row) => this.toItemDto(row)),
    );
  }

  async recordCount(
    inventoryId: string,
    itemId: string,
    dto: CountItemDto,
    userId: string,
  ): Promise<InventoryItemDto> {
    const item = await this.prisma.$transaction(async (tx) => {
      const rows = await recordCount(tx, inventoryId, itemId, userId, dto.countedQty);
      const row = rows[0];

      if (!row) {
        const [itemExists] = await readItemState(tx, inventoryId, itemId);

        if (!itemExists) {
          throw new InventoryItemNotFoundError();
        }

        const state = await readInventoryState(tx, inventoryId);

        throw new InventoryNotOpenError(state?.status ?? 'DESCONHECIDO');
      }

      await this.audit.recordInTransaction(tx, {
        action: AuditAction.INVENTORY_COUNT_RECORDED,
        entity: 'InventoryItem',
        entityId: row.id,
        actorId: userId,
        before:
          row.old_counted_qty === null
            ? undefined
            : { countedQty: formatDecimalField(row.old_counted_qty, 'countedQty') },
        after: {
          countedQty: formatDecimalField(row.counted_qty, 'countedQty'),
          expectedQty: formatDecimalField(row.expected_qty, 'expectedQty'),
        },
      });

      return row;
    }, INVENTORY_TX_OPTIONS);

    const divergence = item.counted_qty.minus(item.expected_qty);

    return {
      id: item.id,
      productId: item.product_id,
      expectedQty: formatDecimalField(item.expected_qty, 'expectedQty'),
      countedQty: formatDecimalField(item.counted_qty, 'countedQty'),
      divergence: formatDecimalField(divergence, 'quantity'),
      countedAt: item.counted_at,
      countedBy: null,
      currentStock: null,
      movedSinceCount: null,
      movementsSinceCount: null,
    };
  }

  async submit(inventoryId: string, userId: string): Promise<InventoryDto> {
    const inventory = await this.prisma.$transaction(async (tx) => {
      const rows = await submitInventory(tx, inventoryId);

      if (!rows[0]) {
        await this.classifySubmitOrCancelFailure(tx, inventoryId, 'submit');
      }

      await this.audit.recordInTransaction(tx, {
        action: AuditAction.INVENTORY_SUBMITTED,
        entity: 'Inventory',
        entityId: inventoryId,
        actorId: userId,
        after: { status: InventoryStatus.PENDING_APPROVAL },
      });

      return tx.inventory.findUniqueOrThrow({ where: { id: inventoryId }, include: WITH_USERS });
    }, INVENTORY_TX_OPTIONS);

    return this.toDto(inventory);
  }

  async cancel(inventoryId: string, userId: string): Promise<InventoryDto> {
    const inventory = await this.prisma.$transaction(async (tx) => {
      const rows = await cancelInventory(tx, inventoryId);

      if (!rows[0]) {
        await this.classifySubmitOrCancelFailure(tx, inventoryId, 'cancel');
      }

      await this.audit.recordInTransaction(tx, {
        action: AuditAction.INVENTORY_CANCELLED,
        entity: 'Inventory',
        entityId: inventoryId,
        actorId: userId,
        after: { status: InventoryStatus.CANCELLED },
      });

      return tx.inventory.findUniqueOrThrow({ where: { id: inventoryId }, include: WITH_USERS });
    }, INVENTORY_TX_OPTIONS);

    return this.toDto(inventory);
  }

  async approve(inventoryId: string, userId: string): Promise<InventoryApprovalResultDto> {
    try {
      const result = await this.prisma.$transaction(async (tx) => {
        const locked = await lockInventoryForApproval(tx, inventoryId, userId);

        if (!locked[0]) {
          const state = await readInventoryState(tx, inventoryId);

          if (!state) {
            throw new InventoryNotFoundError();
          }
          if (state.status === InventoryStatus.APPROVED) {
            throw new InventoryAlreadyApprovedError();
          }

          throw new InventoryInvalidStateError(state.status, InventoryStatus.APPROVED);
        }

        const divergent = await readDivergentItems(tx, inventoryId);
        const adjustments: InventoryAdjustmentDto[] = [];

        for (const item of divergent) {
          const delta = item.counted_qty.minus(item.expected_qty);
          const rows = await applyInventoryDelta(tx, item.product_id, delta.toString());
          const row = rows[0];

          if (!row) {
            return this.throwApprovalInsufficientStock(tx, inventoryId, divergent);
          }

          const movementId = uuidv7();

          await tx.stockMovement.create({
            data: {
              id: movementId,
              productId: item.product_id,
              type: MovementType.ADJUSTMENT,
              reason: MovementReason.INVENTORY_ADJUSTMENT,
              quantity: delta.abs(),
              stockBefore: row.stock_before,
              stockAfter: row.stock_after,
              userId,
              inventoryItemId: item.id,
            },
          });

          // `movedSinceCount`: o saldo já se afastou do que a contagem via ANTES
          // de este delta ser aplicado — é o `stockBefore` deste UPDATE menos o
          // `expectedQty` congelado na contagem (D18, §17.6.7).
          const movedSinceCount = row.stock_before.minus(item.expected_qty);

          adjustments.push({
            inventoryItemId: item.id,
            productId: item.product_id,
            appliedDelta: formatDecimalField(delta, 'quantity'),
            movedSinceCount: formatDecimalField(movedSinceCount, 'quantity'),
            stockBefore: formatDecimalField(row.stock_before, 'stockBefore'),
            stockAfter: formatDecimalField(row.stock_after, 'stockAfter'),
            movementId,
          });
        }

        await this.audit.recordInTransaction(tx, {
          action: AuditAction.INVENTORY_APPROVED,
          entity: 'Inventory',
          entityId: inventoryId,
          actorId: userId,
          after: {
            adjustedItemsCount: adjustments.length,
            adjustments: adjustments.map((a) => ({
              productId: a.productId,
              appliedDelta: a.appliedDelta,
            })),
          },
        });

        const inventory = await tx.inventory.findUniqueOrThrow({
          where: { id: inventoryId },
          include: WITH_USERS,
        });

        return { inventory, adjustments };
      }, INVENTORY_TX_OPTIONS);

      return {
        inventory: this.toDto(result.inventory),
        adjustments: result.adjustments,
        adjustedItemsCount: result.adjustments.length,
      };
    } catch (error) {
      throw this.translateOverflow(error);
    }
  }

  private async classifySubmitOrCancelFailure(
    tx: Prisma.TransactionClient,
    inventoryId: string,
    action: 'submit' | 'cancel',
  ): Promise<never> {
    const state = await readInventoryState(tx, inventoryId);

    if (!state) {
      throw new InventoryNotFoundError();
    }

    if (action === 'submit') {
      if (state.status !== InventoryStatus.OPEN && state.status !== InventoryStatus.COUNTING) {
        throw new InventoryNotOpenError(state.status);
      }

      throw new NoItemsCountedError();
    }

    if (state.status === InventoryStatus.APPROVED) {
      throw new InventoryAlreadyApprovedError();
    }

    throw new InventoryInvalidStateError(state.status, InventoryStatus.CANCELLED);
  }

  private async throwApprovalInsufficientStock(
    tx: Prisma.TransactionClient,
    _inventoryId: string,
    divergent: {
      id: string;
      product_id: string;
      expected_qty: Prisma.Decimal;
      counted_qty: Prisma.Decimal;
    }[],
  ): Promise<never> {
    const stocks = await readProductStocks(
      tx,
      divergent.map((item) => item.product_id),
    );
    const stockByProduct = new Map(stocks.map((row) => [row.id, row.current_stock]));

    const problems = divergent
      .map((item) => {
        const delta = item.counted_qty.minus(item.expected_qty);
        const current = stockByProduct.get(item.product_id) ?? new Prisma.Decimal(0);
        const projected = current.plus(delta);

        return { item, delta, current, projected };
      })
      .filter(({ projected }) => projected.lessThan(0))
      .map(({ item, delta, current }) => ({
        productId: item.product_id,
        inventoryItemId: item.id,
        available: formatDecimalField(current, 'currentStock'),
        requested: formatDecimalField(delta.abs(), 'quantity'),
        expectedQty: formatDecimalField(item.expected_qty, 'expectedQty'),
        countedQty: formatDecimalField(item.counted_qty, 'countedQty'),
      }));

    throw new InventoryApprovalInsufficientStockError(problems);
  }

  private translateOverflow(error: unknown): unknown {
    if (pgErrorCode(error) === PG_NUMERIC_OVERFLOW) {
      return new BusinessRuleError('Um dos ajustes de inventário é grande demais para o produto.');
    }

    return error;
  }

  private toDto(
    inventory: {
      id: string;
      code: string;
      status: InventoryStatus;
      note: string | null;
      startedAt: Date;
      closedAt: Date | null;
      approvedAt: Date | null;
      createdBy: { id: string; name: string };
      approvedBy: { id: string; name: string } | null;
    },
    items?: InventoryItemDto[],
  ): InventoryDto {
    return {
      id: inventory.id,
      code: inventory.code,
      status: inventory.status,
      note: inventory.note,
      startedAt: inventory.startedAt,
      closedAt: inventory.closedAt,
      createdBy: inventory.createdBy,
      approvedBy: inventory.approvedBy,
      approvedAt: inventory.approvedAt,
      ...(items !== undefined ? { items } : {}),
    };
  }

  private toItemDto(row: {
    id: string;
    product_id: string;
    expected_qty: Prisma.Decimal | null;
    counted_qty: Prisma.Decimal | null;
    counted_at: Date | null;
    counted_by_id: string | null;
    counted_by_name: string | null;
    current_stock: Prisma.Decimal;
    movements_since_count: number;
  }): InventoryItemDto {
    const counted = row.counted_qty !== null && row.expected_qty !== null;

    return {
      id: row.id,
      productId: row.product_id,
      expectedQty:
        row.expected_qty === null ? null : formatDecimalField(row.expected_qty, 'expectedQty'),
      countedQty:
        row.counted_qty === null ? null : formatDecimalField(row.counted_qty, 'countedQty'),
      divergence:
        counted && row.counted_qty !== null && row.expected_qty !== null
          ? formatDecimalField(row.counted_qty.minus(row.expected_qty), 'quantity')
          : null,
      countedAt: row.counted_at,
      countedBy:
        row.counted_by_id !== null && row.counted_by_name !== null
          ? { id: row.counted_by_id, name: row.counted_by_name }
          : null,
      currentStock: counted ? formatDecimalField(row.current_stock, 'currentStock') : null,
      movedSinceCount:
        counted && row.expected_qty !== null
          ? formatDecimalField(row.current_stock.minus(row.expected_qty), 'quantity')
          : null,
      movementsSinceCount: counted ? row.movements_since_count : null,
    };
  }
}
