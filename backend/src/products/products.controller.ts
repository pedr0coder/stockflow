import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Roles } from '../common/decorators/roles.decorator';
import type { PageDto } from '../common/dto/page.dto';
import { UserRole } from '../generated/prisma/enums';
import { MovementDto } from '../stock-movements/dto/movement.dto';
import { QueryMovementsDto } from '../stock-movements/dto/query-movements.dto';
import { StockMovementsService } from '../stock-movements/stock-movements.service';
import {
  ChangeProductStatusDto,
  CreateProductDto,
  ProductDto,
  QueryProductsDto,
  UpdateProductDto,
} from './dto/product.dto';
import { ProductsService } from './products.service';

/**
 * Produtos.
 *
 * Leitura para os três papéis, escrita para ADMIN e MANAGER (§5.6).
 *
 * `GET /products/:id/movements` chegou na Fase 5 (adiado da Fase 4 por
 * decisão registrada em docs/15-plano-fase-4.md §15.3, item I1): lê o
 * histórico pelo `StockMovementsService`, e não duplica a lógica de consulta.
 *
 * Não há DELETE. Inativação preserva o histórico.
 */
@ApiTags('Produtos')
@ApiBearerAuth('access-token')
@Controller('products')
export class ProductsController {
  constructor(
    private readonly products: ProductsService,
    private readonly movements: StockMovementsService,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'Lista produtos',
    description: 'Busca por nome ou SKU, filtros por categoria, fornecedor e situação de estoque.',
  })
  @ApiOkResponse({ type: ProductDto, isArray: true })
  findAll(@Query() query: QueryProductsDto): Promise<PageDto<ProductDto>> {
    return this.products.findAll(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalhe de um produto' })
  @ApiOkResponse({ type: ProductDto })
  findOne(@Param('id', new ParseUUIDPipe({ version: '7' })) id: string): Promise<ProductDto> {
    return this.products.findOne(id);
  }

  @Get(':id/movements')
  @ApiOperation({
    summary: 'Histórico de movimentações do produto',
    description: 'Produto sem movimentação devolve lista vazia, não 404.',
  })
  @ApiOkResponse({ type: MovementDto, isArray: true })
  async findMovements(
    @Param('id', new ParseUUIDPipe({ version: '7' })) id: string,
    @Query() query: QueryMovementsDto,
  ): Promise<PageDto<MovementDto>> {
    // 404 do PRODUTO vem daqui, antes de qualquer consulta ao histórico —
    // senão um id inexistente devolveria página vazia em vez de 404.
    await this.products.findOne(id);

    return this.movements.findByProduct(id, query);
  }

  @Post()
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  @ApiOperation({
    summary: 'Cria produto',
    description: 'O saldo inicial é sempre zero: saldo só muda por movimentação.',
  })
  @ApiCreatedResponse({ type: ProductDto })
  @ApiConflictResponse({ description: 'SKU_ALREADY_EXISTS' })
  create(@Body() dto: CreateProductDto): Promise<ProductDto> {
    return this.products.create(dto);
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  @ApiOperation({
    summary: 'Atualiza dados cadastrais',
    description: 'currentStock não é aceito aqui e devolve 400 se enviado.',
  })
  @ApiOkResponse({ type: ProductDto })
  @ApiConflictResponse({ description: 'SKU_ALREADY_EXISTS' })
  update(
    @Param('id', new ParseUUIDPipe({ version: '7' })) id: string,
    @Body() dto: UpdateProductDto,
  ): Promise<ProductDto> {
    return this.products.update(id, dto);
  }

  @Patch(':id/status')
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  @ApiOperation({ summary: 'Ativa ou inativa produto' })
  @ApiOkResponse({ type: ProductDto })
  changeStatus(
    @Param('id', new ParseUUIDPipe({ version: '7' })) id: string,
    @Body() dto: ChangeProductStatusDto,
  ): Promise<ProductDto> {
    return this.products.changeStatus(id, dto.isActive);
  }
}
