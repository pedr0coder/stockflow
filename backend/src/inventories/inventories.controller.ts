import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
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
import { CountItemDto } from './dto/count-item.dto';
import { InventoryApprovalResultDto, InventoryDto, InventoryItemDto } from './dto/inventory.dto';
import { OpenInventoryDto } from './dto/open-inventory.dto';
import { QueryInventoriesDto } from './dto/query-inventories.dto';
import { InventoriesService } from './inventories.service';

/**
 * Ciclo de inventário (docs/05-api.md, marco 5B).
 *
 * Abrir, aprovar e cancelar: só ADMIN e MANAGER (D17, D9). Contar e enviar: os
 * três papéis, porque a contagem física é trabalho operacional.
 */
@ApiTags('Inventários')
@ApiBearerAuth('access-token')
@Controller('inventories')
export class InventoriesController {
  constructor(private readonly inventories: InventoriesService) {}

  @Get()
  @ApiOperation({ summary: 'Lista inventários, paginada e filtrável por status' })
  @ApiOkResponse({ type: InventoryDto, isArray: true })
  findAll(@Query() query: QueryInventoriesDto): Promise<PageDto<InventoryDto>> {
    return this.inventories.findAll(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalhe do inventário, com itens e divergências' })
  @ApiOkResponse({ type: InventoryDto })
  findOne(@Param('id', new ParseUUIDPipe({ version: '7' })) id: string): Promise<InventoryDto> {
    return this.inventories.findOne(id);
  }

  @Post()
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  @ApiOperation({ summary: 'Abre um inventário e seleciona de 1 a 200 produtos' })
  @ApiCreatedResponse({ type: InventoryDto })
  @ApiConflictResponse({ description: 'PRODUCT_IN_OPEN_INVENTORY' })
  @ApiUnprocessableEntityResponse({ description: 'produto inexistente na seleção' })
  open(
    @Body() dto: OpenInventoryDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<InventoryDto> {
    return this.inventories.open(dto, user.id);
  }

  @Patch(':id/items/:itemId/count')
  @ApiOperation({ summary: 'Registra a quantidade contada de um item' })
  @ApiOkResponse({ type: InventoryItemDto })
  @ApiConflictResponse({ description: 'INVENTORY_NOT_OPEN' })
  recordCount(
    @Param('id', new ParseUUIDPipe({ version: '7' })) id: string,
    @Param('itemId', new ParseUUIDPipe({ version: '7' })) itemId: string,
    @Body() dto: CountItemDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<InventoryItemDto> {
    return this.inventories.recordCount(id, itemId, dto, user.id);
  }

  @Post(':id/submit')
  @ApiOperation({ summary: 'Encerra a contagem e envia para aprovação' })
  @ApiOkResponse({ type: InventoryDto })
  @ApiConflictResponse({ description: 'INVENTORY_NOT_OPEN' })
  @ApiUnprocessableEntityResponse({ description: 'nenhum item contado' })
  submit(
    @Param('id', new ParseUUIDPipe({ version: '7' })) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<InventoryDto> {
    return this.inventories.submit(id, user.id);
  }

  @Post(':id/approve')
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  @ApiOperation({ summary: 'Aprova o inventário e aplica os ajustes de saldo por delta' })
  @ApiOkResponse({ type: InventoryApprovalResultDto })
  @ApiConflictResponse({
    description: 'INVENTORY_ALREADY_APPROVED, INVENTORY_INVALID_STATE ou INSUFFICIENT_STOCK',
  })
  approve(
    @Param('id', new ParseUUIDPipe({ version: '7' })) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<InventoryApprovalResultDto> {
    return this.inventories.approve(id, user.id);
  }

  @Post(':id/cancel')
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  @ApiOperation({ summary: 'Cancela o inventário, preservando o histórico' })
  @ApiOkResponse({ type: InventoryDto })
  @ApiConflictResponse({ description: 'INVENTORY_ALREADY_APPROVED ou INVENTORY_INVALID_STATE' })
  cancel(
    @Param('id', new ParseUUIDPipe({ version: '7' })) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<InventoryDto> {
    return this.inventories.cancel(id, user.id);
  }
}
