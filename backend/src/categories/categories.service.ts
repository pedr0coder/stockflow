import { Injectable, NotFoundException } from '@nestjs/common';
import { v7 as uuidv7 } from 'uuid';
import { AuditAction, AuditService } from '../audit/audit.service';
import { buildPage, type PageDto } from '../common/dto/page.dto';
import { CategoryHasProductsError, UniqueConstraintError } from '../common/errors/resource.errors';
import { resolveSortColumn, toSkipTake } from '../common/utils/pagination';
import { searchTerm } from '../common/utils/search';
import { PrismaService } from '../prisma/prisma.service';
import {
  CATEGORY_SORT_COLUMNS,
  type CategoryDto,
  type CreateCategoryDto,
  type QueryCategoriesDto,
  type UpdateCategoryDto,
} from './dto/category.dto';

const UNIQUE_VIOLATION = 'P2002';

interface DeactivationRow {
  id: string;
}

@Injectable()
export class CategoriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async findAll(query: QueryCategoriesDto): Promise<PageDto<CategoryDto>> {
    const sort = resolveSortColumn(query.sort, CATEGORY_SORT_COLUMNS, 'name');
    const { skip, take } = toSkipTake(query.page, query.limit);

    const busca = searchTerm(query.search);

    const where = {
      ...(query.isActive !== undefined ? { isActive: query.isActive } : {}),
      ...(busca !== undefined ? { name: { contains: busca, mode: 'insensitive' as const } } : {}),
    };

    const [rows, total] = await Promise.all([
      this.prisma.category.findMany({ where, orderBy: { [sort]: query.order }, skip, take }),
      this.prisma.category.count({ where }),
    ]);

    return buildPage(rows, total, query.page, query.limit);
  }

  async findOne(id: string): Promise<CategoryDto> {
    const category = await this.prisma.category.findUnique({ where: { id } });

    if (!category) {
      throw new NotFoundException('Categoria não encontrada.');
    }

    return category;
  }

  async create(dto: CreateCategoryDto): Promise<CategoryDto> {
    try {
      const category = await this.prisma.category.create({
        data: {
          id: uuidv7(),
          name: dto.name,
          ...(dto.description !== undefined ? { description: dto.description } : {}),
        },
      });

      await this.audit.record({
        action: AuditAction.CATEGORY_CREATED,
        entity: 'Category',
        entityId: category.id,
        after: category,
      });

      return category;
    } catch (error) {
      throw this.translateUniqueViolation(error);
    }
  }

  async update(id: string, dto: UpdateCategoryDto): Promise<CategoryDto> {
    const before = await this.findOne(id);

    try {
      const category = await this.prisma.category.update({ where: { id }, data: { ...dto } });

      await this.audit.record({
        action: AuditAction.CATEGORY_UPDATED,
        entity: 'Category',
        entityId: id,
        before,
        after: category,
      });

      return category;
    } catch (error) {
      throw this.translateUniqueViolation(error);
    }
  }

  /**
   * Ativa ou inativa a categoria.
   *
   * ┌────────────────────────────────────────────────────────────────────────┐
   * │ A inativação usa UPDATE CONDICIONAL, não "consultar e depois gravar".  │
   * │                                                                        │
   * │ A regra é que não se inativa categoria com produto ativo. Fazer um     │
   * │ `count` e depois o `update` deixaria a janela entre os dois aberta:    │
   * │ um produto criado nesse intervalo ficaria em uma categoria inativa, e  │
   * │ ninguém perceberia.                                                    │
   * │                                                                        │
   * │ É o mesmo raciocínio do ADR-0003, aplicado fora do estoque. A          │
   * │ verificação vive DENTRO da instrução que escreve.                      │
   * └────────────────────────────────────────────────────────────────────────┘
   */
  async changeStatus(id: string, isActive: boolean): Promise<CategoryDto> {
    const before = await this.findOne(id);

    if (isActive) {
      const category = await this.prisma.category.update({ where: { id }, data: { isActive } });
      await this.recordStatusChange(id, before.isActive, category.isActive);
      return category;
    }

    const rows = await this.prisma.$queryRaw<DeactivationRow[]>`
      UPDATE categories
         SET is_active = false, updated_at = now()
       WHERE id = ${id}::uuid
         AND NOT EXISTS (
           SELECT 1 FROM products
            WHERE products.category_id = categories.id
              AND products.is_active = true
         )
      RETURNING id
    `;

    if (rows.length === 0) {
      // Zero linhas com a categoria existindo significa que a subconsulta
      // encontrou produto ativo: a guarda funcionou.
      throw new CategoryHasProductsError();
    }

    const category = await this.findOne(id);
    await this.recordStatusChange(id, before.isActive, category.isActive);

    return category;
  }

  private async recordStatusChange(id: string, before: boolean, after: boolean): Promise<void> {
    await this.audit.record({
      action: AuditAction.CATEGORY_STATUS_CHANGED,
      entity: 'Category',
      entityId: id,
      before: { isActive: before },
      after: { isActive: after },
    });
  }

  private translateUniqueViolation(error: unknown): unknown {
    if ((error as { code?: string }).code === UNIQUE_VIOLATION) {
      return new UniqueConstraintError('name', 'Já existe uma categoria com este nome.');
    }

    return error;
  }
}
