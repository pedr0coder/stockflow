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
import { CategoriesService } from './categories.service';
import {
  CategoryDto,
  ChangeCategoryStatusDto,
  CreateCategoryDto,
  QueryCategoriesDto,
  UpdateCategoryDto,
} from './dto/category.dto';

/**
 * Categorias.
 *
 * Leitura para os três papéis, escrita para ADMIN e MANAGER (§5.4). Não há
 * DELETE: inativação preserva o vínculo com produtos e, por consequência, a
 * integridade do histórico.
 */
@ApiTags('Categorias')
@ApiBearerAuth('access-token')
@Controller('categories')
export class CategoriesController {
  constructor(private readonly categories: CategoriesService) {}

  @Get()
  @ApiOperation({ summary: 'Lista categorias' })
  @ApiOkResponse({ type: CategoryDto, isArray: true })
  findAll(@Query() query: QueryCategoriesDto): Promise<PageDto<CategoryDto>> {
    return this.categories.findAll(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalhe de uma categoria' })
  @ApiOkResponse({ type: CategoryDto })
  findOne(@Param('id', new ParseUUIDPipe({ version: '7' })) id: string): Promise<CategoryDto> {
    return this.categories.findOne(id);
  }

  @Post()
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  @ApiOperation({ summary: 'Cria categoria' })
  @ApiCreatedResponse({ type: CategoryDto })
  @ApiConflictResponse({ description: 'Nome já cadastrado' })
  create(@Body() dto: CreateCategoryDto): Promise<CategoryDto> {
    return this.categories.create(dto);
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  @ApiOperation({ summary: 'Atualiza categoria' })
  @ApiOkResponse({ type: CategoryDto })
  update(
    @Param('id', new ParseUUIDPipe({ version: '7' })) id: string,
    @Body() dto: UpdateCategoryDto,
  ): Promise<CategoryDto> {
    return this.categories.update(id, dto);
  }

  @Patch(':id/status')
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  @ApiOperation({
    summary: 'Ativa ou inativa categoria',
    description: 'Inativar categoria com produto ativo devolve 409 CATEGORY_HAS_PRODUCTS.',
  })
  @ApiOkResponse({ type: CategoryDto })
  @ApiConflictResponse({ description: 'CATEGORY_HAS_PRODUCTS' })
  changeStatus(
    @Param('id', new ParseUUIDPipe({ version: '7' })) id: string,
    @Body() dto: ChangeCategoryStatusDto,
  ): Promise<CategoryDto> {
    return this.categories.changeStatus(id, dto.isActive);
  }
}
