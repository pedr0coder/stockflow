import { afterEach, describe, expect, it, vi } from 'vitest';
import { onRequest, resolveBackendOrigin, sanitizeSetCookieHeader } from './[[catchall]]';

describe('Cloudflare Pages Function proxy (/api/[[catchall]])', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('resolveBackendOrigin', () => {
    it('aceita origens HTTP e HTTPS válidas sem caminho extra', () => {
      expect(resolveBackendOrigin('https://stockflow-api.onrender.com')).toBe(
        'https://stockflow-api.onrender.com',
      );
      expect(resolveBackendOrigin('  https://stockflow-api.onrender.com/  ')).toBe(
        'https://stockflow-api.onrender.com',
      );
      expect(resolveBackendOrigin('http://localhost:3000')).toBe('http://localhost:3000');
    });

    it('rejeita valores vazios, protocolos inválidos, credenciais ou caminhos embutidos', () => {
      expect(resolveBackendOrigin(undefined)).toBeNull();
      expect(resolveBackendOrigin('')).toBeNull();
      expect(resolveBackendOrigin('ftp://stockflow-api.onrender.com')).toBeNull();
      expect(resolveBackendOrigin('https://user:pass@stockflow-api.onrender.com')).toBeNull();
      expect(resolveBackendOrigin('https://stockflow-api.onrender.com/api/v1')).toBeNull();
      expect(resolveBackendOrigin('nao-e-url')).toBeNull();
    });
  });

  describe('sanitizeSetCookieHeader', () => {
    it('preserva HttpOnly, Secure, SameSite=Strict e Path=/api/v1/auth removendo Domain', () => {
      const raw =
        'stockflow_refresh=abc123; Max-Age=604800; Domain=stockflow-api.onrender.com; Path=/api/v1/auth; HttpOnly; Secure; SameSite=Strict';
      expect(sanitizeSetCookieHeader(raw)).toBe(
        'stockflow_refresh=abc123; Max-Age=604800; Path=/api/v1/auth; HttpOnly; Secure; SameSite=Strict',
      );
    });
  });

  describe('onRequest', () => {
    it('retorna 502 BAD_GATEWAY no formato padrão quando BACKEND_ORIGIN está ausente', async () => {
      const req = new Request('https://stockflow.pages.dev/api/v1/health/ready');
      const res = await onRequest({ request: req, env: {} });

      expect(res.status).toBe(502);
      const body = (await res.json()) as {
        statusCode: number;
        code: string;
        path: string;
        requestId: string;
      };
      expect(body).toMatchObject({
        statusCode: 502,
        code: 'BAD_GATEWAY',
        path: '/api/v1/health/ready',
      });
      expect(typeof body.requestId).toBe('string');
    });

    it('encaminha POST /api/v1/auth/login com corpo, cabeçalhos, IP real e preserva Set-Cookie same-origin', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
        expect(input).toBe('https://stockflow-api.onrender.com/api/v1/auth/login');
        expect(init?.method).toBe('POST');

        const forwardedHeaders = new Headers(init?.headers);
        expect(forwardedHeaders.get('content-type')).toBe('application/json');
        expect(forwardedHeaders.get('x-forwarded-for')).toBe('203.0.113.42');
        expect(forwardedHeaders.get('cf-connecting-ip')).toBe('203.0.113.42');
        expect(forwardedHeaders.get('x-forwarded-host')).toBe('stockflow.pages.dev');
        expect(forwardedHeaders.get('x-forwarded-proto')).toBe('https');

        const rawBody = new TextDecoder().decode(init?.body as ArrayBuffer);
        expect(JSON.parse(rawBody)).toEqual({
          email: 'admin@stockflow.local',
          password: 'senha-segura-demo',
        });

        const headers = new Headers({
          'content-type': 'application/json; charset=utf-8',
          'x-request-id': 'req-upstream-1',
        });
        headers.append(
          'set-cookie',
          'stockflow_refresh=tok_1; Path=/api/v1/auth; Domain=stockflow-api.onrender.com; HttpOnly; Secure; SameSite=Strict',
        );

        return Promise.resolve(
          new Response(
            JSON.stringify({
              accessToken: 'jwt-access',
              expiresIn: 900,
              user: {
                id: 'u1',
                name: 'Ana Administradora',
                email: 'admin@stockflow.local',
                role: 'ADMIN',
              },
            }),
            { status: 200, headers },
          ),
        );
      });

      const req = new Request('https://stockflow.pages.dev/api/v1/auth/login', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'cf-connecting-ip': '203.0.113.42',
        },
        body: JSON.stringify({
          email: 'admin@stockflow.local',
          password: 'senha-segura-demo',
        }),
      });

      const res = await onRequest({
        request: req,
        env: { BACKEND_ORIGIN: 'https://stockflow-api.onrender.com' },
      });

      expect(fetchSpy).toHaveBeenCalledOnce();
      expect(res.status).toBe(200);
      expect(res.headers.get('set-cookie')).toContain('stockflow_refresh=tok_1');
      expect(res.headers.get('set-cookie')).toContain('SameSite=Strict');
      expect(res.headers.get('set-cookie')).not.toContain('Domain=');
    });

    it('encaminha cookie stockflow_refresh em POST /api/v1/auth/refresh e query string em GET', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
        expect(input).toBe(
          'https://stockflow-api.onrender.com/api/v1/products?page=1&limit=20&sort=name&order=asc',
        );
        const forwardedHeaders = new Headers(init?.headers);
        expect(forwardedHeaders.get('authorization')).toBe('Bearer token-123');
        expect(forwardedHeaders.get('cookie')).toBe('stockflow_refresh=refresh-xyz');

        return Promise.resolve(
          new Response(JSON.stringify({ data: [], meta: { page: 1 } }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          }),
        );
      });

      const req = new Request(
        'https://stockflow.pages.dev/api/v1/products?page=1&limit=20&sort=name&order=asc',
        {
          method: 'GET',
          headers: {
            authorization: 'Bearer token-123',
            cookie: 'stockflow_refresh=refresh-xyz',
          },
        },
      );

      const res = await onRequest({
        request: req,
        env: { BACKEND_ORIGIN: 'https://stockflow-api.onrender.com' },
      });

      expect(fetchSpy).toHaveBeenCalledOnce();
      expect(res.status).toBe(200);
    });

    it('bloqueia caminhos fora de /api/ ou com path traversal', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch');
      const req = new Request('https://stockflow.pages.dev/api/../secret');

      const res = await onRequest({
        request: req,
        env: { BACKEND_ORIGIN: 'https://stockflow-api.onrender.com' },
      });

      expect(fetchSpy).not.toHaveBeenCalled();
      expect(res.status).toBe(502);
    });

    it('encaminha x-stockflow-proxy-secret para autenticação mútua quando PROXY_SECRET está definido', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
        expect(input).toBe('https://stockflow-api.onrender.com/api/v1/auth/refresh');
        const forwardedHeaders = new Headers(init?.headers);
        expect(forwardedHeaders.get('x-stockflow-proxy-secret')).toBe('shared-secret-123');
        expect(forwardedHeaders.get('cf-connecting-ip')).toBe('198.51.100.25');

        return Promise.resolve(
          new Response(JSON.stringify({ accessToken: 'new-tok', expiresIn: 900 }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          }),
        );
      });

      const req = new Request('https://stockflow.pages.dev/api/v1/auth/refresh', {
        method: 'POST',
        headers: {
          'cf-connecting-ip': '198.51.100.25',
        },
      });

      const res = await onRequest({
        request: req,
        env: {
          BACKEND_ORIGIN: 'https://stockflow-api.onrender.com',
          PROXY_SECRET: 'shared-secret-123',
        },
      });

      expect(fetchSpy).toHaveBeenCalledOnce();
      expect(res.status).toBe(200);
    });

    it('retorna 502 BAD_GATEWAY estruturado quando o upstream falha por erro de rede', async () => {
      vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('connect ETIMEDOUT'));

      const req = new Request('https://stockflow.pages.dev/api/v1/dashboard/summary');
      const res = await onRequest({
        request: req,
        env: { BACKEND_ORIGIN: 'https://stockflow-api.onrender.com' },
      });

      expect(res.status).toBe(502);
      const body = await res.json();
      expect(body).toMatchObject({
        statusCode: 502,
        code: 'BAD_GATEWAY',
        path: '/api/v1/dashboard/summary',
      });
    });
  });
});
