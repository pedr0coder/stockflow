import { Injectable, NotFoundException } from '@nestjs/common';
import { v7 as uuidv7 } from 'uuid';
import { AuditAction, AuditService } from '../audit/audit.service';
import { buildPage, type PageDto } from '../common/dto/page.dto';
import { UniqueConstraintError } from '../common/errors/resource.errors';
import { resolveSortColumn, toSkipTake } from '../common/utils/pagination';
import { searchTerm } from '../common/utils/search';
import { PrismaService } from '../prisma/prisma.service';
import type { ProductDto } from '../products/dto/product.dto';
import {
  SUPPLIER_SORT_COLUMNS,
  type CreateSupplierDto,
  type QuerySuppliersDto,
  type SupplierDto,
  type UpdateSupplierDto,
} from './dto/supplier.dto';

const UNIQUE_VIOLATION = 'P2002';

@Injectable()
export class SuppliersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async findAll(query: QuerySuppliersDto): Promise<PageDto<SupplierDto>> {
    const sort = resolveSortColumn(query.sort, SUPPLIER_SORT_COLUMNS, 'name');
    const { skip, take } = toSkipTake(query.page, query.limit);

    const busca = searchTerm(query.search);

    const where = {
      ...(query.isActive !== undefined ? { isActive: query.isActive } : {}),
      ...(busca !== undefined
        ? {
            OR: [
              { name: { contains: busca, mode: 'insensitive' as const } },
              { taxId: { contains: busca, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };

    const [rows, total] = await Promise.all([
      this.prisma.supplier.findMany({ where, orderBy: { [sort]: query.order }, skip, take }),
      this.prisma.supplier.count({ where }),
    ]);

    return buildPage(rows, total, query.page, query.limit);
  }

  async findOne(id: string): Promise<SupplierDto> {
    const supplier = await this.prisma.supplier.findUnique({ where: { id } });

    if (!supplier) {
      throw new NotFoundException('Fornecedor não encontrado.');
    }

    return supplier;
  }

  /** Produtos vinculados ao fornecedor, paginados. */
  async findProducts(id: string, query: QuerySuppliersDto): Promise<PageDto<ProductDto>> {
    // Confirma a existência antes de listar: sem isso, um id inexistente
    // devolveria uma lista vazia, que o cliente leria como "fornecedor sem
    // produtos" em vez de "fornecedor não existe".
    await this.findOne(id);

    const { skip, take } = toSkipTake(query.page, query.limit);
    const where = { supplierId: id };

    const [rows, total] = await Promise.all([
      this.prisma.product.findMany({ where, orderBy: { name: 'asc' }, skip, take }),
      this.prisma.product.count({ where }),
    ]);

    return buildPage(rows as unknown as ProductDto[], total, query.page, query.limit);
  }

  async create(dto: CreateSupplierDto): Promise<SupplierDto> {
    try {
      const supplier = await this.prisma.supplier.create({
        data: { id: uuidv7(), ...dto },
      });

      await this.audit.record({
        action: AuditAction.SUPPLIER_CREATED,
        entity: 'Supplier',
        entityId: supplier.id,
        after: supplier,
      });

      return supplier;
    } catch (error) {
      throw this.translateUniqueViolation(error);
    }
  }

  async update(id: string, dto: UpdateSupplierDto): Promise<SupplierDto> {
    const before = await this.findOne(id);

    try {
      const supplier = await this.prisma.supplier.update({ where: { id }, data: { ...dto } });

      await this.audit.record({
        action: AuditAction.SUPPLIER_UPDATED,
        entity: 'Supplier',
        entityId: id,
        before,
        after: supplier,
      });

      return supplier;
    } catch (error) {
      throw this.translateUniqueViolation(error);
    }
  }

  /**
   * Ativa ou inativa.
   *
   * Diferente de categoria, não há guarda contra produtos vinculados: o
   * relacionamento de produto com fornecedor é opcional e usa `SetNull`
   * (docs/04-banco-de-dados.md §4.4). Inativar um fornecedor não deixa nenhum
   * produto em estado inválido, só registra que não se compra mais dele.
   */
  async changeStatus(id: string, isActive: boolean): Promise<SupplierDto> {
    const before = await this.findOne(id);

    const supplier = await this.prisma.supplier.update({ where: { id }, data: { isActive } });

    await this.audit.record({
      action: AuditAction.SUPPLIER_STATUS_CHANGED,
      entity: 'Supplier',
      entityId: id,
      before: { isActive: before.isActive },
      after: { isActive: supplier.isActive },
    });

    return supplier;
  }

  private translateUniqueViolation(error: unknown): unknown {
    if ((error as { code?: string }).code === UNIQUE_VIOLATION) {
      return new UniqueConstraintError('taxId', 'Já existe um fornecedor com este documento.');
    }

    return error;
  }
}
