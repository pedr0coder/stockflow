import { SetMetadata, type CustomDecorator } from '@nestjs/common';
import type { UserRole } from '../../generated/prisma/enums';

export const ROLES_KEY = 'roles';

/**
 * Papéis autorizados a executar a ação.
 *
 * Rota autenticada **sem** este decorator é acessível a qualquer papel: a
 * ausência significa "basta estar autenticado", não "qualquer um entra". O
 * `JwtAuthGuard` já barrou quem não tem token antes de o `RolesGuard` rodar.
 *
 * O tipo vem do enum do Prisma, e não de uma string solta: assim, acrescentar
 * um papel no banco quebra a compilação em todo lugar que precisa decidir
 * sobre ele, em vez de silenciosamente negar acesso.
 */
export const Roles = (...roles: UserRole[]): CustomDecorator<string> =>
  SetMetadata(ROLES_KEY, roles);
