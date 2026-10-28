import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../generated/prisma/enums';
import { MovementsReportQueryDto } from './dto/movements-report-query.dto';
import {
  DivergenceRowDto,
  InventoryReportRowDto,
  LowStockItemDto,
  MovementsReportRowDto,
  OutOfStockItemDto,
  ReconciliationRowDto,
} from './dto/report.dto';
import { ReportsService } from './reports.service';

/**
 * Relatórios (docs/17-plano-fase-5.md §17.4.4). `inventories` e `divergences`
 * restritos a A/M (RBAC §17.7.1); `stock-reconciliation` restrito a A.
 */
@ApiTags('Relatórios')
@ApiBearerAuth('access-token')
@Controller('reports')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get('low-stock')
  @ApiOperation({ summary: 'Produtos ativos com saldo baixo (0 < saldo <= mínimo)' })
  @ApiOkResponse({ type: LowStockItemDto, isArray: true })
  lowStock(): Promise<LowStockItemDto[]> {
    return this.reports.lowStock();
  }

  @Get('out-of-stock')
  @ApiOperation({ summary: 'Produtos ativos sem estoque' })
  @ApiOkResponse({ type: OutOfStockItemDto, isArray: true })
  outOfStock(): Promise<OutOfStockItemDto[]> {
    return this.reports.outOfStock();
  }

  @Get('movements')
  @ApiOperation({ summary: 'Movimentações agregadas por tipo e motivo no período' })
  @ApiOkResponse({ type: MovementsReportRowDto, isArray: true })
  movements(@Query() query: MovementsReportQueryDto): Promise<MovementsReportRowDto[]> {
    return this.reports.movements(query);
  }

  @Get('inventories')
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  @ApiOperation({ summary: 'Um resumo por inventário' })
  @ApiOkResponse({ type: InventoryReportRowDto, isArray: true })
  inventories(): Promise<InventoryReportRowDto[]> {
    return this.reports.inventories();
  }

  @Get('divergences')
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  @ApiOperation({ summary: 'Itens divergentes de inventários aprovados' })
  @ApiOkResponse({ type: DivergenceRowDto, isArray: true })
  divergences(): Promise<DivergenceRowDto[]> {
    return this.reports.divergences();
  }

  @Get('stock-reconciliation')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Saldo gravado contra saldo derivado do histórico' })
  @ApiOkResponse({ type: ReconciliationRowDto, isArray: true })
  stockReconciliation(): Promise<ReconciliationRowDto[]> {
    return this.reports.stockReconciliation();
  }
}
