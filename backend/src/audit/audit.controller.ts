import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../common/decorators/roles.decorator';
import { buildPage, type PageDto } from '../common/dto/page.dto';
import { resolveSortColumn, toSkipTake } from '../common/utils/pagination';
import { UserRole } from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';
import { AUDIT_SORT_COLUMNS, QueryAuditDto } from './dto/query-audit.dto';
import { AuditLogDto } from './dto/audit-log.dto';

/**
 * Consulta do log de auditoria.
 *
 * ┌────────────────────────────────────────────────────────────────────────┐
 * │ SOMENTE LEITURA, POR DESENHO.                                          │
 * │                                                                        │
 * │ Não existe POST, PATCH nem DELETE aqui, e não é esquecimento: um       │
 * │ endpoint capaz de alterar o log anularia o propósito dele              │
 * │ (docs/05-api.md §5.11). Há caso de teste afirmando que essas rotas     │
 * │ não existem.                                                           │
 * │                                                                        │
 * │ Limitação conhecida e aceita: o log vive no mesmo banco que ele        │
 * │ audita, então quem tem acesso direto ao Postgres pode alterá-lo.       │
 * │ Mitigação real exigiria sink externo append-only, fora do escopo do    │
 * │ MVP (docs/10-riscos.md R6).                                            │
 * └────────────────────────────────────────────────────────────────────────┘
 */
@ApiTags('Auditoria')
@ApiBearerAuth('access-token')
@Controller('audit')
export class AuditController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @Roles(UserRole.ADMIN)
  @ApiOperation({
    summary: 'Log global de auditoria',
    description: 'Somente ADMIN. Ordenado do mais recente para o mais antigo por padrão.',
  })
  @ApiOkResponse({ type: AuditLogDto, isArray: true })
  async findAll(@Query() query: QueryAuditDto): Promise<PageDto<AuditLogDto>> {
    const sort = resolveSortColumn(query.sort, AUDIT_SORT_COLUMNS, 'createdAt');
    const { skip, take } = toSkipTake(query.page, query.limit);

    const where = {
      ...(query.action !== undefined ? { action: query.action } : {}),
      ...(query.entity !== undefined ? { entity: query.entity } : {}),
      ...(query.userId !== undefined ? { userId: query.userId } : {}),
    };

    const [rows, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        // O padrão é decrescente: em log, o que interessa é o que acabou de
        // acontecer, não o primeiro registro de 2026.
        orderBy: { [sort]: query.sort === undefined ? 'desc' : query.order },
        skip,
        take,
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return buildPage(rows as AuditLogDto[], total, query.page, query.limit);
  }

  @Get(':entity/:entityId')
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  @ApiOperation({
    summary: 'Histórico de uma entidade',
    description: 'ADMIN e MANAGER. Serve à aba de histórico da tela do registro, na Fase 6.',
  })
  @ApiOkResponse({ type: AuditLogDto, isArray: true })
  async findForEntity(
    @Param('entity') entity: string,
    @Param('entityId', new ParseUUIDPipe({ version: '7' })) entityId: string,
    @Query() query: QueryAuditDto,
  ): Promise<PageDto<AuditLogDto>> {
    const { skip, take } = toSkipTake(query.page, query.limit);
    const where = { entity, entityId };

    const [rows, total] = await Promise.all([
      this.prisma.auditLog.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take }),
      this.prisma.auditLog.count({ where }),
    ]);

    return buildPage(rows as AuditLogDto[], total, query.page, query.limit);
  }
}
