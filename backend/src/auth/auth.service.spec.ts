import { describe, expect, it, vi, beforeEach } from 'vitest';
import { hash } from '@node-rs/argon2';
import { AuthService, ARGON2_OPTIONS } from './auth.service';
import { InvalidCredentialsError, UserInactiveError } from '../common/errors/auth.errors';
import { AuditAction } from '../audit/audit.service';
import { UserRole } from '../generated/prisma/enums';

describe('AuthService (isolado)', () => {
  let authService: AuthService;
  const mockFindUnique = vi.fn();
  const mockUpdate = vi.fn();
  const mockIssuePair = vi.fn();
  const mockAuditRecord = vi.fn();

  const validPassword = 'SenhaForteCorreta123!';
  let passwordHash: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    passwordHash = await hash(validPassword, ARGON2_OPTIONS);

    const mockPrisma = {
      user: {
        findUnique: mockFindUnique,
        update: mockUpdate.mockResolvedValue({}),
      },
    };

    const mockTokens = {
      issuePair: mockIssuePair.mockResolvedValue({
        accessToken: 'access-token-123',
        refreshToken: 'refresh-token-456',
      }),
    };

    const mockAudit = {
      record: mockAuditRecord.mockResolvedValue({}),
    };

    const mockLogger = {
      setContext: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };

    authService = new AuthService(
      mockPrisma as never,
      mockTokens as never,
      mockAudit as never,
      mockLogger as never,
    );
  });

  it('autentica com sucesso quando e-mail e senha são válidos', async () => {
    mockFindUnique.mockResolvedValue({
      id: '01a157b0-c11b-70a6-a6e6-1ff6ec827ab5',
      name: 'Bruno Gerente',
      email: 'gerente@stockflow.local',
      passwordHash,
      role: UserRole.MANAGER,
      isActive: true,
    });

    const result = await authService.login('GERENTE@STOCKFLOW.LOCAL ', validPassword);

    expect(mockFindUnique).toHaveBeenCalledWith({
      where: { email: 'gerente@stockflow.local' },
      omit: { passwordHash: false },
    });
    expect(mockIssuePair).toHaveBeenCalledWith(
      '01a157b0-c11b-70a6-a6e6-1ff6ec827ab5',
      UserRole.MANAGER,
      {},
    );
    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: '01a157b0-c11b-70a6-a6e6-1ff6ec827ab5' },
      data: { lastLoginAt: expect.any(Date) as Date },
    });
    expect(mockAuditRecord).toHaveBeenCalledWith({
      action: AuditAction.LOGIN_SUCCESS,
      actorId: '01a157b0-c11b-70a6-a6e6-1ff6ec827ab5',
      actorEmail: 'gerente@stockflow.local',
      entity: 'User',
      entityId: '01a157b0-c11b-70a6-a6e6-1ff6ec827ab5',
    });
    expect(result.user).toEqual({
      id: '01a157b0-c11b-70a6-a6e6-1ff6ec827ab5',
      name: 'Bruno Gerente',
      email: 'gerente@stockflow.local',
      role: UserRole.MANAGER,
    });
    expect(result.pair.accessToken).toBe('access-token-123');
  });

  it('lança InvalidCredentialsError e registra LOGIN_FAILED quando a senha é incorreta', async () => {
    mockFindUnique.mockResolvedValue({
      id: '01a157b0-c11b-70a6-a6e6-1ff6ec827ab5',
      name: 'Bruno Gerente',
      email: 'gerente@stockflow.local',
      passwordHash,
      role: UserRole.MANAGER,
      isActive: true,
    });

    await expect(
      authService.login('gerente@stockflow.local', 'SenhaIncorreta999!'),
    ).rejects.toThrow(InvalidCredentialsError);

    expect(mockAuditRecord).toHaveBeenCalledWith({
      action: AuditAction.LOGIN_FAILED,
      actorEmail: 'gerente@stockflow.local',
      actorId: '01a157b0-c11b-70a6-a6e6-1ff6ec827ab5',
    });
    expect(mockIssuePair).not.toHaveBeenCalled();
  });

  it('lança InvalidCredentialsError e registra LOGIN_FAILED quando o usuário não existe', async () => {
    mockFindUnique.mockResolvedValue(null);

    await expect(authService.login('inexistente@stockflow.local', validPassword)).rejects.toThrow(
      InvalidCredentialsError,
    );

    expect(mockAuditRecord).toHaveBeenCalledWith({
      action: AuditAction.LOGIN_FAILED,
      actorEmail: 'inexistente@stockflow.local',
    });
    expect(mockIssuePair).not.toHaveBeenCalled();
  });

  it('lança UserInactiveError e registra motivo quando o usuário está inativo', async () => {
    mockFindUnique.mockResolvedValue({
      id: '01a157b0-c11b-70a6-a6e6-1ff6ec827ab5',
      name: 'Bruno Gerente',
      email: 'gerente@stockflow.local',
      passwordHash,
      role: UserRole.MANAGER,
      isActive: false,
    });

    await expect(authService.login('gerente@stockflow.local', validPassword)).rejects.toThrow(
      UserInactiveError,
    );

    expect(mockAuditRecord).toHaveBeenCalledWith({
      action: AuditAction.LOGIN_FAILED,
      actorId: '01a157b0-c11b-70a6-a6e6-1ff6ec827ab5',
      actorEmail: 'gerente@stockflow.local',
      after: { reason: 'USER_INACTIVE' },
    });
    expect(mockIssuePair).not.toHaveBeenCalled();
  });

  it('hashPassword utiliza as opções padrão do Argon2id', async () => {
    const hashed = await AuthService.hashPassword(validPassword);
    expect(hashed).toContain('$argon2id$');
    expect(hashed).toContain('m=19456,t=2,p=1');
  });
});
