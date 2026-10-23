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
import { ProductDto } from '../products/dto/product.dto';
import {
  ChangeSupplierStatusDto,
  CreateSupplierDto,
  QuerySuppliersDto,
  SupplierDto,
  UpdateSupplierDto,
} from './dto/supplier.dto';
import { SuppliersService } from './suppliers.service';

/** Fornecedores. Leitura para os três papéis, escrita para ADMIN e MANAGER (§5.5). */
@ApiTags('Fornecedores')
@ApiBearerAuth('access-token')
@Controller('suppliers')
export class SuppliersController {
  constructor(private readonly suppliers: SuppliersService) {}

  @Get()
  @ApiOperation({ summary: 'Lista fornecedores' })
  @ApiOkResponse({ type: SupplierDto, isArray: true })
  findAll(@Query() query: QuerySuppliersDto): Promise<PageDto<SupplierDto>> {
    return this.suppliers.findAll(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalhe de um fornecedor' })
  @ApiOkResponse({ type: SupplierDto })
  findOne(@Param('id', new ParseUUIDPipe({ version: '7' })) id: string): Promise<SupplierDto> {
    return this.suppliers.findOne(id);
  }

  @Get(':id/products')
  @ApiOperation({ summary: 'Produtos vinculados ao fornecedor' })
  @ApiOkResponse({ type: ProductDto, isArray: true })
  findProducts(
    @Param('id', new ParseUUIDPipe({ version: '7' })) id: string,
    @Query() query: QuerySuppliersDto,
  ): Promise<PageDto<ProductDto>> {
    return this.suppliers.findProducts(id, query);
  }

  @Post()
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  @ApiOperation({ summary: 'Cria fornecedor' })
  @ApiCreatedResponse({ type: SupplierDto })
  @ApiConflictResponse({ description: 'Documento já cadastrado' })
  create(@Body() dto: CreateSupplierDto): Promise<SupplierDto> {
    return this.suppliers.create(dto);
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  @ApiOperation({ summary: 'Atualiza fornecedor' })
  @ApiOkResponse({ type: SupplierDto })
  update(
    @Param('id', new ParseUUIDPipe({ version: '7' })) id: string,
    @Body() dto: UpdateSupplierDto,
  ): Promise<SupplierDto> {
    return this.suppliers.update(id, dto);
  }

  @Patch(':id/status')
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  @ApiOperation({ summary: 'Ativa ou inativa fornecedor' })
  @ApiOkResponse({ type: SupplierDto })
  changeStatus(
    @Param('id', new ParseUUIDPipe({ version: '7' })) id: string,
    @Body() dto: ChangeSupplierStatusDto,
  ): Promise<SupplierDto> {
    return this.suppliers.changeStatus(id, dto.isActive);
  }
}
