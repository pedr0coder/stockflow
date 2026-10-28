import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { DashboardService } from './dashboard.service';
import { MovementsChartQueryDto } from './dto/movements-chart-query.dto';
import { RecentMovementsQueryDto } from './dto/recent-movements-query.dto';
import { DashboardSummaryDto, MovementsChartPointDto, RecentMovementDto } from './dto/summary.dto';

/** Dashboard (docs/17-plano-fase-5.md §17.4.4): só leitura, os três papéis. */
@ApiTags('Dashboard')
@ApiBearerAuth('access-token')
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get('summary')
  @ApiOperation({
    summary: 'Resumo: produtos ativos, estoque baixo, sem estoque, movimentações em 30 dias',
  })
  @ApiOkResponse({ type: DashboardSummaryDto })
  summary(): Promise<DashboardSummaryDto> {
    return this.dashboard.summary();
  }

  @Get('movements-chart')
  @ApiOperation({ summary: 'Série diária de movimentações por tipo' })
  @ApiOkResponse({ type: MovementsChartPointDto, isArray: true })
  movementsChart(@Query() query: MovementsChartQueryDto): Promise<MovementsChartPointDto[]> {
    return this.dashboard.movementsChart(query.days);
  }

  @Get('recent-movements')
  @ApiOperation({ summary: 'Últimas movimentações' })
  @ApiOkResponse({ type: RecentMovementDto, isArray: true })
  recentMovements(@Query() query: RecentMovementsQueryDto): Promise<RecentMovementDto[]> {
    return this.dashboard.recentMovements(query.limit);
  }
}
