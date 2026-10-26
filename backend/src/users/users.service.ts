import { Injectable } from '@nestjs/common';
import { verify } from '@node-rs/argon2';
import { v7 as uuidv7 } from 'uuid';
import { AuditAction, AuditService } from '../audit/audit.service';
import { AuthService } from '../auth/auth.service';
import { TokenService } from '../auth/token.service';
import { InvalidCredentialsError } from '../common/errors/auth.errors';
import { UserNotFoundError } from '../common/errors/not-found.errors';
import { BusinessRuleError, EmailAlreadyExistsError } from '../common/errors/resource.errors';
import { buildPage, type PageDto } from '../common/dto/page.dto';
import { resolveSortColumn, toSkipTake } from '../common/utils/pagination';
import { searchTerm } from '../common/utils/search';
import { PrismaService } from '../prisma/prisma.service';
import type { UserRole } from '../generated/prisma/enums';
import {
  USER_SORT_COLUMNS,
  type ChangePasswordDto,
  type CreateUserDto,
  type QueryUsersDto,
  type UpdateUserDto,
  type UserDto,
} from './dto/user.dto';

/** Código do Prisma para violação de índice único. */
const UNIQUE_VIOLATION = 'P2002';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: TokenService,
    private readonly audit: AuditService,
  ) {}

  async findAll(query: QueryUsersDto): Promise<PageDto<UserDto>> {
    const sort = resolveSortColumn(query.sort, USER_SORT_COLUMNS, 'name');
    const { skip, take } = toSkipTake(query.page, query.limit);

    const busca = searchTerm(query.search);

    const where = {
      ...(query.role !== undefined ? { role: query.role } : {}),
      ...(query.isActive !== undefined ? { isActive: query.isActive } : {}),
      ...(busca !== undefined
        ? {
            OR: [
              { name: { contains: busca, mode: 'insensitive' as const } },
              { email: { contains: busca, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };

    const [rows, total] = await Promise.all([
      this.prisma.user.findMany({ where, orderBy: { [sort]: query.order }, skip, take }),
      this.prisma.user.count({ where }),
    ]);

    return buildPage(rows, total, query.page, query.limit);
  }

  async findOne(id: string): Promise<UserDto> {
    const user = await this.prisma.user.findUnique({ where: { id } });

    if (!user) {
      throw new UserNotFoundError();
    }

    return user;
  }

  async create(dto: CreateUserDto): Promise<UserDto> {
    const passwordHash = await AuthService.hashPassword(dto.password);

    try {
      const user = await this.prisma.user.create({
        data: {
          id: uuidv7(),
          name: dto.name,
          email: dto.email,
          role: dto.role,
          passwordHash,
        },
      });

      await this.audit.record({
        action: AuditAction.USER_CREATED,
        entity: 'User',
        entityId: user.id,
        // `after` passa pela redação antes de ir ao banco. Mesmo que o hash
        // viesse na entidade, ele não chegaria ao log.
        after: user,
      });

      return user;
    } catch (error) {
      throw this.translateUniqueViolation(error, dto.email);
    }
  }

  async update(id: string, dto: UpdateUserDto): Promise<UserDto> {
    const before = await this.findOne(id);

    try {
      const user = await this.prisma.user.update({ where: { id }, data: { ...dto } });

      await this.audit.record({
        action: AuditAction.USER_UPDATED,
        entity: 'User',
        entityId: id,
        before,
        after: user,
      });

      return user;
    } catch (error) {
      throw this.translateUniqueViolation(error, dto.email ?? '');
    }
  }

  /**
   * Altera o papel e **encerra as sessões** do alvo.
   *
   * As duas coisas acontecem na mesma transação: atualizar o papel sem revogar
   * deixaria o usuário operando com o papel antigo enquanto o refresh durasse,
   * que são sete dias.
   *
   * Revogar o refresh **não** invalida o access já emitido, que vale por até
   * 15 minutos. A distinção está detalhada em docs/15-plano-fase-4.md §15.5, e
   * é consequência conhecida de JWT sem lista de revogação (§8.12).
   */
  async changeRole(id: string, role: UserRole, actorId: string): Promise<UserDto> {
    const before = await this.findOne(id);

    if (before.id === actorId && before.role !== role) {
      // Um administrador que se rebaixa sozinho pode deixar o sistema sem
      // nenhum ADMIN, e sem ninguém capaz de promover outro.
      throw new BusinessRuleError('Você não pode alterar o próprio papel.');
    }

    const user = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.user.update({ where: { id }, data: { role } });

      await tx.refreshToken.updateMany({
        where: { userId: id, revokedAt: null },
        data: { revokedAt: new Date() },
      });

      return updated;
    });

    await this.audit.record({
      action: AuditAction.USER_ROLE_CHANGED,
      entity: 'User',
      entityId: id,
      before: { role: before.role },
      after: { role: user.role },
    });

    return user;
  }

  /** Ativa ou inativa, revogando as sessões quando inativa. */
  async changeStatus(id: string, isActive: boolean, actorId: string): Promise<UserDto> {
    const before = await this.findOne(id);

    if (before.id === actorId && !isActive) {
      throw new BusinessRuleError('Você não pode desativar a própria conta.');
    }

    const user = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.user.update({ where: { id }, data: { isActive } });

      if (!isActive) {
        await tx.refreshToken.updateMany({
          where: { userId: id, revokedAt: null },
          data: { revokedAt: new Date() },
        });
      }

      return updated;
    });

    await this.audit.record({
      action: AuditAction.USER_STATUS_CHANGED,
      entity: 'User',
      entityId: id,
      before: { isActive: before.isActive },
      after: { isActive: user.isActive },
    });

    return user;
  }

  /**
   * Troca a própria senha.
   *
   * `userId` vem do token, nunca do corpo ou da URL (docs/08-seguranca.md
   * §8.3). Não existe caminho para trocar a senha de outra pessoa.
   *
   * A senha atual é exigida: sem isso, um access token roubado permitiria
   * tomar a conta de forma permanente, trocando a senha.
   */
  async changeOwnPassword(userId: string, dto: ChangePasswordDto): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      omit: { passwordHash: false },
    });

    if (!user) {
      throw new UserNotFoundError();
    }

    const matches = await verify(user.passwordHash, dto.currentPassword).catch(() => false);

    if (!matches) {
      throw new InvalidCredentialsError();
    }

    const passwordHash = await AuthService.hashPassword(dto.newPassword);

    await this.prisma.user.update({ where: { id: userId }, data: { passwordHash } });

    // Trocar a senha encerra as outras sessões: se a troca foi motivada por
    // suspeita de acesso indevido, manter as sessões antigas ativas anularia
    // o efeito.
    await this.tokens.revokeAllForUser(userId);

    await this.audit.record({
      action: AuditAction.USER_PASSWORD_CHANGED,
      entity: 'User',
      entityId: userId,
      // Nenhuma senha, nenhum hash. Só o fato de ter acontecido.
    });
  }

  /**
   * Traduz violação de unicidade no erro de domínio certo.
   *
   * A tradução acontece aqui, e não em um filtro global, porque é este service
   * que sabe que o único índice único deste modelo é o e-mail. Um filtro
   * genérico teria de adivinhar.
   */
  private translateUniqueViolation(error: unknown, email: string): unknown {
    const code = (error as { code?: string }).code;

    if (code === UNIQUE_VIOLATION) {
      return new EmailAlreadyExistsError(email);
    }

    return error;
  }
}
