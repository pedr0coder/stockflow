import { Injectable, NotFoundException } from '@nestjs/common';
import { v7 as uuidv7 } from 'uuid';
import { AuditAction, AuditService } from '../audit/audit.service';
import { buildPage, type PageDto } from '../common/dto/page.dto';
import { BusinessRuleError, SkuAlreadyExistsError } from '../common/errors/resource.errors';
import { resolveSortColumn, toSkipTake } from '../common/utils/pagination';
import { searchTerm } from '../common/utils/search';
import { PrismaService } from '../prisma/prisma.service';
import {
  PRODUCT_SORT_COLUMNS,
  type CreateProductDto,
  type ProductDto,
  type QueryProductsDto,
  type StockStatusFilter,
  type UpdateProductDto,
} from './dto/product.dto';

const UNIQUE_VIOLATION = 'P2002';
const FOREIGN_KEY_VIOLATION = 'P2003';

interface StockFilterRow {
  id: string;
}

@Injectable()
export class ProductsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async findAll(query: QueryProductsDto): Promise<PageDto<ProductDto>> {
    const sort = resolveSortColumn(query.sort, PRODUCT_SORT_COLUMNS, 'name');
    const { skip, take } = toSkipTake(query.page, query.limit);

    const busca = searchTerm(query.search);

    const where = {
      ...(query.categoryId !== undefined ? { categoryId: query.categoryId } : {}),
      ...(query.supplierId !== undefined ? { supplierId: query.supplierId } : {}),
      ...(query.isActive !== undefined ? { isActive: query.isActive } : {}),
      ...(busca !== undefined
        ? {
            OR: [
              // `contains` insensível vira ILIKE, que é o que aproveita o
              // índice GIN trigram criado na Fase 2 (docs/04 §4.4).
              { name: { contains: busca, mode: 'insensitive' as const } },
              { sku: { contains: busca.toUpperCase() } },
            ],
          }
        : {}),
      ...(query.stockStatus !== undefined
        ? { id: { in: await this.idsByStockStatus(query.stockStatus) } }
        : {}),
    };

    const [rows, total] = await Promise.all([
      this.prisma.product.findMany({ where, orderBy: { [sort]: query.order }, skip, take }),
      this.prisma.product.count({ where }),
    ]);

    return buildPage(rows as unknown as ProductDto[], total, query.page, query.limit);
  }

  async findOne(id: string): Promise<ProductDto> {
    const product = await this.prisma.product.findUnique({ where: { id } });

    if (!product) {
      throw new NotFoundException('Produto não encontrado.');
    }

    return product as unknown as ProductDto;
  }

  async create(dto: CreateProductDto): Promise<ProductDto> {
    try {
      const product = await this.prisma.product.create({
        data: {
          id: uuidv7(),
          sku: dto.sku,
          name: dto.name,
          categoryId: dto.categoryId,
          unit: dto.unit,
          ...(dto.description !== undefined ? { description: dto.description } : {}),
          ...(dto.supplierId !== undefined ? { supplierId: dto.supplierId } : {}),
          ...(dto.minStock !== undefined ? { minStock: dto.minStock } : {}),
          ...(dto.unitCost !== undefined ? { unitCost: dto.unitCost } : {}),
          // `currentStock` fica no padrão zero. Saldo só muda por movimentação,
          // e aceitar um saldo inicial aqui criaria estoque sem histórico que o
          // explique (docs/05-api.md §5.6).
        },
      });

      await this.audit.record({
        action: AuditAction.PRODUCT_CREATED,
        entity: 'Product',
        entityId: product.id,
        after: product,
      });

      return product as unknown as ProductDto;
    } catch (error) {
      throw this.translatePrismaError(error, dto.sku);
    }
  }

  async update(id: string, dto: UpdateProductDto): Promise<ProductDto> {
    const before = await this.findOne(id);

    try {
      const product = await this.prisma.product.update({ where: { id }, data: { ...dto } });

      await this.audit.record({
        action: AuditAction.PRODUCT_UPDATED,
        entity: 'Product',
        entityId: id,
        before,
        after: product,
      });

      return product as unknown as ProductDto;
    } catch (error) {
      throw this.translatePrismaError(error, dto.sku ?? '');
    }
  }

  /**
   * Ativa ou inativa.
   *
   * Não existe exclusão física: um produto com movimentação registrada não
   * pode desaparecer, porque isso destruiria a integridade do histórico
   * (docs/04-banco-de-dados.md §4.2). A inativação preserva tudo e apenas
   * retira o produto das novas operações.
   */
  async changeStatus(id: string, isActive: boolean): Promise<ProductDto> {
    const before = await this.findOne(id);

    const product = await this.prisma.product.update({ where: { id }, data: { isActive } });

    await this.audit.record({
      action: AuditAction.PRODUCT_STATUS_CHANGED,
      entity: 'Product',
      entityId: id,
      before: { isActive: before.isActive },
      after: { isActive: product.isActive },
    });

    return product as unknown as ProductDto;
  }

  /**
   * Ids dos produtos em cada situação de estoque.
   *
   * A comparação é entre duas **colunas** (`current_stock` e `min_stock`), e o
   * query builder do Prisma não expressa isso: ele compara coluna com valor.
   * Daí o SQL. As faixas seguem a tabela de semântica do design system
   * (docs/06-mvp-e-telas.md §6.4), e são as mesmas que o frontend usa para
   * pintar o badge.
   */
  private async idsByStockStatus(status: StockStatusFilter): Promise<string[]> {
    const rows = await this.stockStatusQuery(status);

    return rows.map((row) => row.id);
  }

  private stockStatusQuery(status: StockStatusFilter): Promise<StockFilterRow[]> {
    if (status === 'out') {
      return this.prisma.$queryRaw<StockFilterRow[]>`
        SELECT id FROM products WHERE current_stock = 0
      `;
    }

    if (status === 'low') {
      return this.prisma.$queryRaw<StockFilterRow[]>`
        SELECT id FROM products
         WHERE current_stock > 0 AND current_stock <= min_stock
      `;
    }

    return this.prisma.$queryRaw<StockFilterRow[]>`
      SELECT id FROM products WHERE current_stock > min_stock
    `;
  }

  private translatePrismaError(error: unknown, sku: string): unknown {
    const code = (error as { code?: string }).code;

    if (code === UNIQUE_VIOLATION) {
      return new SkuAlreadyExistsError(sku);
    }

    if (code === FOREIGN_KEY_VIOLATION) {
      // Categoria ou fornecedor inexistente. 422 e não 404: a requisição em si
      // estava bem formada, e o que a recusou foi a regra.
      return new BusinessRuleError('Categoria ou fornecedor informado não existe.');
    }

    return error;
  }
}
