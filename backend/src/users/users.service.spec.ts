import { describe, expect, it, vi } from 'vitest';
import { UserNotFoundError } from '../common/errors/not-found.errors';
import { UsersService } from './users.service';

/**
 * O ramo "o usuário do token não existe mais" de `changeOwnPassword` não tem
 * como ser alcançado por HTTP: a estratégia JWT recusa o token de um usuário
 * apagado com 401 antes de a rota rodar. Só aconteceria numa corrida entre a
 * validação do token e a leitura, que a integração não consegue provocar de
 * forma determinística. Por isso o caso fica aqui, com o Prisma substituído.
 */
describe('UsersService.changeOwnPassword', () => {
  it('lança UserNotFoundError, e não uma exceção do framework, quando o usuário sumiu', async () => {
    const prisma = { user: { findUnique: vi.fn().mockResolvedValue(null) } };
    const service = new UsersService(prisma as never, {} as never, {} as never);

    const chamada = service.changeOwnPassword('0199a000-0000-7000-8000-000000000000', {
      currentPassword: 'senha-atual-longa',
      newPassword: 'senha-nova-bem-grande',
    });

    await expect(chamada).rejects.toBeInstanceOf(UserNotFoundError);
    await expect(chamada).rejects.toMatchObject({
      httpStatus: 404,
      code: 'NOT_FOUND',
      message: 'Usuário não encontrado.',
    });
  });

  it('busca pelo id do token, e nenhuma escrita acontece quando o usuário não existe', async () => {
    const update = vi.fn();
    const prisma = { user: { findUnique: vi.fn().mockResolvedValue(null), update } };
    const service = new UsersService(prisma as never, {} as never, {} as never);

    await service
      .changeOwnPassword('0199a000-0000-7000-8000-000000000001', {
        currentPassword: 'senha-atual-longa',
        newPassword: 'senha-nova-bem-grande',
      })
      .catch(() => undefined);

    expect(prisma.user.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: '0199a000-0000-7000-8000-000000000001' } }),
    );
    expect(update).not.toHaveBeenCalled();
  });
});
