import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser, type AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import type { PageDto } from '../common/dto/page.dto';
import { UserRole } from '../generated/prisma/enums';
import {
  ChangePasswordDto,
  ChangeRoleDto,
  ChangeStatusDto,
  CreateUserDto,
  QueryUsersDto,
  UpdateUserDto,
  UserDto,
} from './dto/user.dto';
import { UsersService } from './users.service';

/**
 * Gestão de usuários.
 *
 * Matriz de papéis da docs/05-api.md §5.3: ADMIN e MANAGER leem, só ADMIN
 * escreve. A troca da própria senha é acessível a qualquer papel autenticado.
 *
 * **Ordem das rotas importa.** `me/password` é declarado antes de `:id` para
 * que o roteador não tente interpretar "me" como um identificador.
 */
@ApiTags('Usuários')
@ApiBearerAuth('access-token')
@ApiForbiddenResponse({ description: 'FORBIDDEN_ROLE' })
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Patch('me/password')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Troca a própria senha',
    description:
      'Exige a senha atual. Opera sempre sobre o usuário do token, nunca sobre um id ' +
      'informado. Encerra as demais sessões.',
  })
  @ApiNoContentResponse()
  changeOwnPassword(
    @CurrentUser() actor: AuthenticatedUser,
    @Body() dto: ChangePasswordDto,
  ): Promise<void> {
    return this.users.changeOwnPassword(actor.id, dto);
  }

  @Get()
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  @ApiOperation({ summary: 'Lista usuários' })
  @ApiOkResponse({ type: UserDto, isArray: true })
  findAll(@Query() query: QueryUsersDto): Promise<PageDto<UserDto>> {
    return this.users.findAll(query);
  }

  @Get(':id')
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  @ApiOperation({ summary: 'Detalhe de um usuário' })
  @ApiOkResponse({ type: UserDto })
  findOne(@Param('id', new ParseUUIDPipe({ version: '7' })) id: string): Promise<UserDto> {
    return this.users.findOne(id);
  }

  @Post()
  @Roles(UserRole.ADMIN)
  @ApiOperation({
    summary: 'Cria usuário',
    description: 'Não há cadastro público: usuários são criados por ADMIN (§5.2).',
  })
  @ApiCreatedResponse({ type: UserDto })
  @ApiConflictResponse({ description: 'EMAIL_ALREADY_EXISTS' })
  create(@Body() dto: CreateUserDto): Promise<UserDto> {
    return this.users.create(dto);
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN)
  @ApiOperation({
    summary: 'Atualiza nome e e-mail',
    description: 'Papel e senha têm endpoints próprios, para serem auditados em separado.',
  })
  @ApiOkResponse({ type: UserDto })
  @ApiConflictResponse({ description: 'EMAIL_ALREADY_EXISTS' })
  update(
    @Param('id', new ParseUUIDPipe({ version: '7' })) id: string,
    @Body() dto: UpdateUserDto,
  ): Promise<UserDto> {
    return this.users.update(id, dto);
  }

  @Patch(':id/role')
  @Roles(UserRole.ADMIN)
  @ApiOperation({
    summary: 'Altera o papel',
    description:
      'Revoga as sessões do alvo. O access token já emitido continua válido por até ' +
      '15 minutos, conforme o ADR-0005.',
  })
  @ApiOkResponse({ type: UserDto })
  changeRole(
    @Param('id', new ParseUUIDPipe({ version: '7' })) id: string,
    @Body() dto: ChangeRoleDto,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<UserDto> {
    return this.users.changeRole(id, dto.role, actor.id);
  }

  @Patch(':id/status')
  @Roles(UserRole.ADMIN)
  @ApiOperation({
    summary: 'Ativa ou inativa',
    description: 'Inativar revoga as sessões e impede a renovação, mesmo com refresh válido.',
  })
  @ApiOkResponse({ type: UserDto })
  changeStatus(
    @Param('id', new ParseUUIDPipe({ version: '7' })) id: string,
    @Body() dto: ChangeStatusDto,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<UserDto> {
    return this.users.changeStatus(id, dto.isActive, actor.id);
  }
}
