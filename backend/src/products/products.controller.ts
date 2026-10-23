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
 * `GET /products/:id/movements` não está aqui: ele lê movimentações, cujo
 * módulo é da Fase 5. A decisão de adiá-lo está registrada em
 * docs/15-plano-fase-4.md §15.3, item I1.
 *
 * Não há DELETE. Inativação preserva o histórico.
 */
@ApiTags('Produtos')
@ApiBearerAuth('access-token')
@Controller('products')
export class ProductsController {
  constructor(private readonly products: ProductsService) {}

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
