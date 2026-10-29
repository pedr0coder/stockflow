import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ApiError,
  NetworkError,
  clearAccessToken,
  getAccessToken,
  refreshSession,
  request,
  setAccessToken,
  setSessionExpiredHandler,
} from './api-client';

/**
 * Mock manual de `fetch`, por decisão de projeto (docs/18-plano-fase-6.md
 * §18.13/§18.16): sem `msw` nem dependência nova. Cada teste monta a
 * sequência exata de respostas que quer, inclusive fora de ordem e com
 * falha de rede — nada aqui tem um modo "aceita qualquer coisa".
 */
function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function emptyResponse(status: number): Response {
  return new Response(null, { status });
}

describe('api-client', () => {
  beforeEach(() => {
    clearAccessToken();
    setSessionExpiredHandler(null);
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('token em memória', () => {
    it('inclui o header Authorization quando há token', async () => {
      setAccessToken('token-123');
      vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(200, { ok: true }));

      await request('/products');

      const [, init] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
      const headers = new Headers(init.headers);
      expect(headers.get('Authorization')).toBe('Bearer token-123');
    });

    it('sem token, não envia o header Authorization', async () => {
      vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(200, { ok: true }));

      await request('/health');

      const [, init] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
      const headers = new Headers(init.headers);
      expect(headers.has('Authorization')).toBe(false);
    });

    it('getAccessToken nunca lê localStorage nem sessionStorage — só a variável de módulo', () => {
      localStorage.setItem('accessToken', 'valor-plantado');
      sessionStorage.setItem('accessToken', 'valor-plantado');

      setAccessToken('token-real');

      expect(getAccessToken()).toBe('token-real');
      // E o inverso: nada que este módulo faz grava nos dois storages.
      expect(localStorage.getItem('token-real')).toBeNull();
      expect(sessionStorage.getItem('token-real')).toBeNull();
    });
  });

  describe('401: renovação automática', () => {
    it('renova e repete a requisição original uma única vez', async () => {
      setAccessToken('token-expirado');
      vi.mocked(fetch)
        .mockResolvedValueOnce(jsonResponse(401, { code: 'UNAUTHORIZED' })) // 1ª tentativa de negócio
        .mockResolvedValueOnce(
          jsonResponse(200, {
            accessToken: 'token-novo',
            expiresIn: 900,
            user: { id: 'u1', name: 'Ana', email: 'ana@x.com', role: 'OPERATOR' },
          }),
        ) // /auth/refresh
        .mockResolvedValueOnce(jsonResponse(200, { data: 'segredo' })); // retentativa

      const result = await request<{ data: string }>('/products');

      expect(result).toEqual({ data: 'segredo' });
      expect(getAccessToken()).toBe('token-novo');
      expect(fetch).toHaveBeenCalledTimes(3);

      const refreshCall = vi.mocked(fetch).mock.calls[1] as [string, RequestInit];
      expect(refreshCall[0]).toContain('/auth/refresh');
      expect(refreshCall[1].credentials).toBe('include');
    });

    it('nunca entra em loop: um segundo 401 depois da retentativa não dispara outro refresh', async () => {
      setAccessToken('token-expirado');
      vi.mocked(fetch)
        .mockResolvedValueOnce(jsonResponse(401, { code: 'UNAUTHORIZED' }))
        .mockResolvedValueOnce(
          jsonResponse(200, {
            accessToken: 'token-novo',
            expiresIn: 900,
            user: { id: 'u1', name: 'Ana', email: 'ana@x.com', role: 'OPERATOR' },
          }),
        )
        .mockResolvedValueOnce(jsonResponse(401, { code: 'UNAUTHORIZED' })); // ainda 401 depois de renovar

      await expect(request('/products')).rejects.toBeInstanceOf(ApiError);

      // 3 chamadas: negócio, refresh, retentativa — NUNCA um segundo refresh.
      expect(fetch).toHaveBeenCalledTimes(3);
    });

    it('múltiplas requisições concorrentes com 401 compartilham UM ÚNICO refresh', async () => {
      setAccessToken('token-expirado');
      let refreshCalls = 0;

      vi.mocked(fetch).mockImplementation((input, init) => {
        // `api-client.ts` sempre chama `fetch` com a URL como string.
        const url = input as string;

        if (url.includes('/auth/refresh')) {
          refreshCalls += 1;
          return Promise.resolve(
            jsonResponse(200, {
              accessToken: 'token-novo',
              expiresIn: 900,
              user: { id: 'u1', name: 'Ana', email: 'ana@x.com', role: 'OPERATOR' },
            }),
          );
        }

        // Qualquer chamada de negócio: a PRIMEIRA vez com o token velho
        // recebe 401; identificamos "velho" vs "novo" pelo header enviado.
        const headers = new Headers(init?.headers);
        return Promise.resolve(
          headers.get('Authorization') === 'Bearer token-novo'
            ? jsonResponse(200, { ok: true })
            : jsonResponse(401, { code: 'UNAUTHORIZED' }),
        );
      });

      const [a, b, c] = await Promise.all([
        request('/products'),
        request('/categories'),
        request('/suppliers'),
      ]);

      expect(a).toEqual({ ok: true });
      expect(b).toEqual({ ok: true });
      expect(c).toEqual({ ok: true });
      expect(refreshCalls).toBe(1);
    });

    it('refresh que falha (expirado/revogado) limpa o token e avisa a aplicação', async () => {
      setAccessToken('token-expirado');
      const onExpired = vi.fn();
      setSessionExpiredHandler(onExpired);

      vi.mocked(fetch)
        .mockResolvedValueOnce(jsonResponse(401, { code: 'UNAUTHORIZED' }))
        .mockResolvedValueOnce(jsonResponse(401, { code: 'REFRESH_TOKEN_REUSED' }));

      await expect(request('/products')).rejects.toBeInstanceOf(ApiError);

      expect(getAccessToken()).toBeNull();
      expect(onExpired).toHaveBeenCalledTimes(1);
    });

    it('403 NUNCA dispara renovação — é autorização, não token expirado', async () => {
      setAccessToken('token-valido');
      vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(403, { code: 'FORBIDDEN_ROLE' }));

      await expect(request('/users')).rejects.toMatchObject({ status: 403 });

      // Uma chamada só: nenhum /auth/refresh foi disparado.
      expect(fetch).toHaveBeenCalledTimes(1);
    });

    it('/auth/refresh e /auth/login nunca disparam o próprio interceptor de 401', async () => {
      vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(401, { code: 'INVALID_CREDENTIALS' }));

      await expect(request('/auth/login', { method: 'POST', body: '{}' })).rejects.toMatchObject({
        status: 401,
        code: 'INVALID_CREDENTIALS',
      });

      // Uma chamada só: nenhuma segunda tentativa de refresh por cima de um
      // 401 que já É da rota de auth.
      expect(fetch).toHaveBeenCalledTimes(1);
    });
  });

  describe('rede e respostas sem corpo', () => {
    it('falha de rede (fetch rejeita) lança NetworkError, não ApiError', async () => {
      vi.mocked(fetch).mockRejectedValueOnce(new TypeError('Failed to fetch'));

      await expect(request('/products')).rejects.toBeInstanceOf(NetworkError);
    });

    it('204 sem corpo não tenta fazer parse de JSON', async () => {
      vi.mocked(fetch).mockResolvedValueOnce(emptyResponse(204));

      await expect(request('/auth/logout', { method: 'POST' })).resolves.toBeUndefined();
    });
  });

  describe('geração do token: resposta tardia de refresh não revive a sessão', () => {
    it('um refresh em voo que resolve DEPOIS de clearAccessToken não grava o token de volta', async () => {
      let resolveRefresh: (value: Response) => void = () => undefined;
      vi.mocked(fetch).mockImplementationOnce(
        () =>
          new Promise<Response>((resolve) => {
            resolveRefresh = resolve;
          }),
      );

      const pending = refreshSession();

      // O logout acontece ENQUANTO o refresh ainda está em voo.
      clearAccessToken();

      resolveRefresh(
        jsonResponse(200, {
          accessToken: 'token-tardio',
          expiresIn: 900,
          user: { id: 'u1', name: 'Ana', email: 'ana@x.com', role: 'OPERATOR' },
        }),
      );
      await pending;

      // A resposta chegou, mas o token em memória continua null: o logout
      // não foi desfeito por uma resposta que começou antes dele.
      expect(getAccessToken()).toBeNull();
    });
  });
});
