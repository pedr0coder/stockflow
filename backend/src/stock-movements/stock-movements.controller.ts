import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { CurrentUser, type AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import type { PageDto } from '../common/dto/page.dto';
import { UserRole } from '../generated/prisma/enums';
import { CreateAdjustmentDto } from './dto/create-adjustment.dto';
import { CreateMovementDto } from './dto/create-movement.dto';
import { MovementDto } from './dto/movement.dto';
import { QueryMovementsDto } from './dto/query-movements.dto';
import { StockMovementsService } from './stock-movements.service';

/**
 * Movimentações de estoque (docs/05-api.md §5.7).
 *
 * Entrada e saída: os três papéis. Ajuste manual: só ADMIN e MANAGER — é o que
 * o ADR-0003 chama de "autorização explícita" para alterar o saldo fora de
 * uma entrada ou saída físicas.
 *
 * Sem `PATCH` nem `DELETE`: o histórico é imutável por desenho
 * (docs/04-banco-de-dados.md §4.4), e uma requisição a esses métodos cai no
 * 404 padrão de rota inexistente.
 */
@ApiTags('Movimentações de estoque')
@ApiBearerAuth('access-token')
@Controller('stock-movements')
export class StockMovementsController {
  constructor(private readonly movements: StockMovementsService) {}

  @Get()
  @ApiOperation({ summary: 'Histórico de movimentações, paginado e filtrável' })
  @ApiOkResponse({ type: MovementDto, isArray: true })
  findAll(@Query() query: QueryMovementsDto): Promise<PageDto<MovementDto>> {
    return this.movements.findAll(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalhe de uma movimentação' })
  @ApiOkResponse({ type: MovementDto })
  findOne(@Param('id', new ParseUUIDPipe({ version: '7' })) id: string): Promise<MovementDto> {
    return this.movements.findOne(id);
  }

  @Post('in')
  @ApiOperation({ summary: 'Registra uma entrada de estoque' })
  @ApiCreatedResponse({ type: MovementDto })
  @ApiConflictResponse({ description: 'PRODUCT_INACTIVE' })
  @ApiUnprocessableEntityResponse({ description: 'INVALID_TYPE_REASON' })
  createIn(
    @Body() dto: CreateMovementDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<MovementDto> {
    return this.movements.createIn(dto, user.id);
  }

  @Post('out')
  @ApiOperation({ summary: 'Registra uma saída de estoque' })
  @ApiCreatedResponse({ type: MovementDto })
  @ApiConflictResponse({ description: 'INSUFFICIENT_STOCK ou PRODUCT_INACTIVE' })
  @ApiUnprocessableEntityResponse({ description: 'INVALID_TYPE_REASON' })
  createOut(
    @Body() dto: CreateMovementDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<MovementDto> {
    return this.movements.createOut(dto, user.id);
  }

  @Post('adjustment')
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  @ApiOperation({
    summary: 'Ajusta o saldo para a quantidade final informada',
    description: 'Reservado a ADMIN e MANAGER: é a autorização explícita do ADR-0003.',
  })
  @ApiCreatedResponse({ type: MovementDto })
  @ApiConflictResponse({ description: 'PRODUCT_INACTIVE' })
  @ApiUnprocessableEntityResponse({ description: 'INVALID_TYPE_REASON ou ajuste sem efeito' })
  createAdjustment(
    @Body() dto: CreateAdjustmentDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<MovementDto> {
    return this.movements.createAdjustment(dto, user.id);
  }
}
