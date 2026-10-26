import { Injectable } from '@nestjs/common';
import { v7 as uuidv7 } from 'uuid';
import { AuditAction, AuditService } from '../audit/audit.service';
import { buildPage, type PageDto } from '../common/dto/page.dto';
import {
  ProductNotFoundError,
  StockMovementNotFoundError,
} from '../common/errors/not-found.errors';
import { BusinessRuleError } from '../common/errors/resource.errors';
import {
  InsufficientStockError,
  InvalidTypeReasonError,
  ProductInactiveError,
} from '../common/errors/stock.errors';
import { formatDecimalField } from '../common/utils/decimal-scale';
import { ALLOWED_REASONS, isReasonAllowed } from '../common/utils/movement-rules';
import { PG_NUMERIC_OVERFLOW, pgErrorCode } from '../common/utils/pg-error';
import { resolveSortColumn, toSkipTake } from '../common/utils/pagination';
import { MovementType } from '../generated/prisma/enums';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateAdjustmentDto } from './dto/create-adjustment.dto';
import { CreateMovementDto } from './dto/create-movement.dto';
import type { MovementDto } from './dto/movement.dto';
import { MOVEMENT_SORT_COLUMNS, type QueryMovementsDto } from './dto/query-movements.dto';
import {
  applyAdjustment,
  applyDecrease,
  applyIncrease,
  readProductState,
} from './stock-movements.sql';

/** Inclusão padrão: o autor, só o necessário para exibição. */
const WITH_USER = { user: { select: { id: true, name: true } } } as const;

/** Transação do ADR-0003: nível declarado explicitamente, não herdado do padrão do driver. */
const MOVEMENT_TX_OPTIONS = {
  isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
  timeout: 10_000,
} as const;

/** Os dois tipos que `createSimple` trata: entrada e saída (o ajuste tem fluxo próprio). */
type SimpleMovementType = typeof MovementType.IN | typeof MovementType.OUT;

@Injectable()
export class StockMovementsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async createIn(dto: CreateMovementDto, userId: string): Promise<MovementDto> {
    return this.createSimple(MovementType.IN, dto, userId);
  }

  async createOut(dto: CreateMovementDto, userId: string): Promise<MovementDto> {
    return this.createSimple(MovementType.OUT, dto, userId);
  }

  /**
   * Ajuste manual, para a quantidade final (valor absoluto — ADR-0003).
   *
   * `quantity` gravada no movimento é a MAGNITUDE `|stockAfter - stockBefore|`,
   * calculada com aritmética do `Prisma.Decimal` retornado pelo banco — nunca
   * com `number` (docs/17-plano-fase-5.md §17.5.9). Um ajuste sem efeito (o
   * saldo já é o valor pedido) é recusado pelo próprio `WHERE` da instrução
   * (zero linhas), e vira 422.
   */
  async createAdjustment(dto: CreateAdjustmentDto, userId: string): Promise<MovementDto> {
    if (!isReasonAllowed(MovementType.ADJUSTMENT, dto.reason)) {
      throw new InvalidTypeReasonError(
        MovementType.ADJUSTMENT,
        dto.reason,
        ALLOWED_REASONS[MovementType.ADJUSTMENT],
      );
    }

    try {
      const movement = await this.prisma.$transaction(async (tx) => {
        const rows = await applyAdjustment(tx, dto.productId, dto.finalQuantity);
        const row = rows[0];

        if (!row) {
          const state = await readProductState(tx, dto.productId);

          if (!state) {
            throw new ProductNotFoundError();
          }
          if (!state.is_active) {
            throw new ProductInactiveError(dto.productId);
          }
          throw new BusinessRuleError('O ajuste não altera o saldo atual do produto.', {
            current: formatDecimalField(state.current_stock, 'currentStock'),
          });
        }

        const magnitude = row.stock_after.minus(row.stock_before).abs();

        const created = await tx.stockMovement.create({
          data: {
            id: uuidv7(),
            productId: dto.productId,
            type: MovementType.ADJUSTMENT,
            reason: dto.reason,
            quantity: magnitude,
            stockBefore: row.stock_before,
            stockAfter: row.stock_after,
            userId,
            note: dto.note,
            ...(dto.referenceDoc !== undefined ? { referenceDoc: dto.referenceDoc } : {}),
          },
          include: WITH_USER,
        });

        await this.audit.recordInTransaction(tx, {
          action: AuditAction.STOCK_MOVEMENT_CREATED,
          entity: 'StockMovement',
          entityId: created.id,
          actorId: userId,
          after: {
            type: MovementType.ADJUSTMENT,
            reason: dto.reason,
            quantity: formatDecimalField(magnitude, 'quantity'),
            stockBefore: formatDecimalField(row.stock_before, 'stockBefore'),
            stockAfter: formatDecimalField(row.stock_after, 'stockAfter'),
          },
        });

        return created;
      }, MOVEMENT_TX_OPTIONS);

      return movement as unknown as MovementDto;
    } catch (error) {
      throw this.translateOverflow(error);
    }
  }

  async findAll(query: QueryMovementsDto): Promise<PageDto<MovementDto>> {
    return this.list(query, undefined);
  }

  /** Histórico de um produto específico, usado por `GET /products/:id/movements`. */
  async findByProduct(productId: string, query: QueryMovementsDto): Promise<PageDto<MovementDto>> {
    return this.list(query, productId);
  }

  async findOne(id: string): Promise<MovementDto> {
    const movement = await this.prisma.stockMovement.findUnique({
      where: { id },
      include: WITH_USER,
    });

    if (!movement) {
      throw new StockMovementNotFoundError();
    }

    return movement as unknown as MovementDto;
  }

  private async createSimple(
    type: SimpleMovementType,
    dto: CreateMovementDto,
    userId: string,
  ): Promise<MovementDto> {
    if (!isReasonAllowed(type, dto.reason)) {
      throw new InvalidTypeReasonError(type, dto.reason, ALLOWED_REASONS[type]);
    }

    try {
      const movement = await this.prisma.$transaction(async (tx) => {
        const rows =
          type === MovementType.IN
            ? await applyIncrease(tx, dto.productId, dto.quantity)
            : await applyDecrease(tx, dto.productId, dto.quantity);

        const row = rows[0];

        if (!row) {
          return this.classifyBalanceFailure(tx, dto.productId, type, dto.quantity);
        }

        const created = await tx.stockMovement.create({
          data: {
            id: uuidv7(),
            productId: dto.productId,
            type,
            reason: dto.reason,
            quantity: dto.quantity,
            stockBefore: row.stock_before,
            stockAfter: row.stock_after,
            userId,
            ...(dto.note !== undefined ? { note: dto.note } : {}),
            ...(dto.referenceDoc !== undefined ? { referenceDoc: dto.referenceDoc } : {}),
          },
          include: WITH_USER,
        });

        await this.audit.recordInTransaction(tx, {
          action: AuditAction.STOCK_MOVEMENT_CREATED,
          entity: 'StockMovement',
          entityId: created.id,
          actorId: userId,
          after: {
            type,
            reason: dto.reason,
            quantity: dto.quantity,
            stockBefore: formatDecimalField(row.stock_before, 'stockBefore'),
            stockAfter: formatDecimalField(row.stock_after, 'stockAfter'),
          },
        });

        return created;
      }, MOVEMENT_TX_OPTIONS);

      return movement as unknown as MovementDto;
    } catch (error) {
      throw this.translateOverflow(error);
    }
  }

  /**
   * Zero linhas não diz por quê (ADR-0003). Lê o estado do produto DENTRO da
   * mesma transação para escolher o erro certo, e sempre lança — nunca
   * retorna normalmente (docs/17-plano-fase-5.md §17.5.3).
   */
  private async classifyBalanceFailure(
    tx: Prisma.TransactionClient,
    productId: string,
    type: SimpleMovementType,
    quantity: string,
  ): Promise<never> {
    const state = await readProductState(tx, productId);

    if (!state) {
      throw new ProductNotFoundError();
    }
    if (!state.is_active) {
      throw new ProductInactiveError(productId);
    }
    if (type === MovementType.OUT) {
      throw new InsufficientStockError(
        productId,
        formatDecimalField(state.current_stock, 'currentStock'),
        quantity,
      );
    }

    // Entrada não tem guarda de saldo: zero linhas com produto ativo e
    // existente não deveria acontecer. Se acontecer, é defeito a investigar,
    // e 500 é a resposta correta — não um código de negócio inventado.
    throw new Error(
      `UPDATE condicional de entrada devolveu zero linhas para produto ativo ${productId}.`,
    );
  }

  /** Corpo além do que `numeric(14,3)` comporta vira 422, não 500 (docs/17 §17.5.6). */
  private translateOverflow(error: unknown): unknown {
    if (pgErrorCode(error) === PG_NUMERIC_OVERFLOW) {
      return new BusinessRuleError('A quantidade informada é grande demais para este produto.');
    }

    return error;
  }

  private async list(
    query: QueryMovementsDto,
    productId: string | undefined,
  ): Promise<PageDto<MovementDto>> {
    const sort = resolveSortColumn(query.sort, MOVEMENT_SORT_COLUMNS, 'createdAt');
    const { skip, take } = toSkipTake(query.page, query.limit);
    const where = this.buildWhere(query, productId);

    const [rows, total] = await Promise.all([
      this.prisma.stockMovement.findMany({
        where,
        // Desempate por id decrescente: UUIDv7 é ordenado por tempo, então o
        // desempate preserva a ordem cronológica mesmo quando duas linhas
        // compartilham o mesmo valor de `sort` (docs/17 §17.4.1).
        orderBy: [{ [sort]: query.sort === undefined ? 'desc' : query.order }, { id: 'desc' }],
        skip,
        take,
        include: WITH_USER,
      }),
      this.prisma.stockMovement.count({ where }),
    ]);

    return buildPage(rows as unknown as MovementDto[], total, query.page, query.limit);
  }

  private buildWhere(
    query: QueryMovementsDto,
    productIdOverride: string | undefined,
  ): Prisma.StockMovementWhereInput {
    const productId = productIdOverride ?? query.productId;
    const dateFrom = query.dateFrom !== undefined ? parseDateFromStart(query.dateFrom) : undefined;
    const dateTo = query.dateTo !== undefined ? parseDateToExclusive(query.dateTo) : undefined;

    return {
      ...(productId !== undefined ? { productId } : {}),
      ...(query.type !== undefined ? { type: query.type } : {}),
      ...(query.reason !== undefined ? { reason: query.reason } : {}),
      ...(query.userId !== undefined ? { userId: query.userId } : {}),
      ...(dateFrom !== undefined || dateTo !== undefined
        ? {
            createdAt: {
              ...(dateFrom !== undefined ? { gte: dateFrom } : {}),
              ...(dateTo !== undefined ? { lt: dateTo } : {}),
            },
          }
        : {}),
    };
  }
}

/** `true` para `"2026-10-01"`, `false` para uma data-e-hora ISO completa. */
function isDateOnly(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

/** Início do intervalo. Para data sem horário, `Date` já interpreta como meia-noite UTC. */
function parseDateFromStart(value: string): Date {
  return new Date(value);
}

/**
 * Fim do intervalo, EXCLUSIVO (docs/17-plano-fase-5.md, decisão D16).
 *
 * Para data sem horário, soma um dia: `dateTo=2026-10-31` passa a incluir o
 * dia 31 inteiro (o filtro usa `lt`, então o limite vira `2026-11-01T00:00Z`).
 * Para data-e-hora completa, o instante informado já é o limite exato.
 */
function parseDateToExclusive(value: string): Date {
  const date = new Date(value);

  if (isDateOnly(value)) {
    date.setUTCDate(date.getUTCDate() + 1);
  }

  return date;
}
