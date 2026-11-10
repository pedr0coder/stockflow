import type { Request, Response } from 'express';
import { describe, expect, it, vi } from 'vitest';
import {
  createClientIpMiddleware,
  PROXY_SECRET_HEADER,
  resolveClientIp,
  safeCompareSecrets,
} from './client-ip.middleware';

function mockRequest(options: {
  headers?: Record<string, string | string[] | undefined>;
  ip?: string;
  socketAddress?: string;
  url?: string;
  originalUrl?: string;
}): Request {
  const req = {
    headers: options.headers ?? {},
    ip: options.ip,
    url: options.url ?? '/api/v1/auth/login',
    originalUrl: options.originalUrl ?? options.url ?? '/api/v1/auth/login',
    socket: options.socketAddress ? { remoteAddress: options.socketAddress } : undefined,
  } as unknown as Request;

  return req;
}

interface MockResponseTarget {
  statusCode: number;
  sentBody: unknown;
  status(code: number): MockResponseTarget;
  json(body: unknown): MockResponseTarget;
}

function mockResponse(): Response & { sentBody?: unknown } {
  const res: MockResponseTarget = {
    statusCode: 200,
    sentBody: undefined,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(body: unknown) {
      this.sentBody = body;
      return this;
    },
  };
  return res as unknown as Response & { sentBody?: unknown };
}

describe('client-ip.middleware', () => {
  describe('safeCompareSecrets', () => {
    it('retorna false quando um dos segredos é indefinido ou vazio', () => {
      expect(safeCompareSecrets(undefined, 'secret')).toBe(false);
      expect(safeCompareSecrets('secret', undefined)).toBe(false);
      expect(safeCompareSecrets('', 'secret')).toBe(false);
      expect(safeCompareSecrets('secret', '')).toBe(false);
    });

    it('retorna false para segredos de tamanhos ou conteúdos diferentes', () => {
      expect(safeCompareSecrets('short', 'longer-secret')).toBe(false);
      expect(
        safeCompareSecrets('wrong-secret-value-32-chars-ok!!', 'valid-secret-value-32-chars-ok!!'),
      ).toBe(false);
    });

    it('retorna true quando os segredos coincidem perfeitamente', () => {
      expect(
        safeCompareSecrets('shared-proxy-secret-123456789012', 'shared-proxy-secret-123456789012'),
      ).toBe(true);
    });
  });

  describe('resolveClientIp', () => {
    const SECRET = 'test-proxy-secret-32-characters-ok';

    it('em requisição direta sem segredo, ignora X-Forwarded-For e usa o socket TCP real', () => {
      const req = mockRequest({
        headers: {
          'x-forwarded-for': '1.1.1.1, 203.0.113.50',
        },
        socketAddress: '203.0.113.50',
      });

      const { ip, isTrustedProxy } = resolveClientIp(req, SECRET);
      expect(ip).toBe('203.0.113.50');
      expect(isTrustedProxy).toBe(false);
    });

    it('em requisição direta com tentativa de falsificação de IP (spoofing), ignora headers forjados', () => {
      const req = mockRequest({
        headers: {
          'cf-connecting-ip': '1.2.3.4',
          'x-forwarded-for': '8.8.8.8, 9.9.9.9',
        },
        socketAddress: '198.51.100.99',
      });

      const { ip, isTrustedProxy } = resolveClientIp(req, SECRET);
      expect(ip).toBe('198.51.100.99');
      expect(isTrustedProxy).toBe(false);
    });

    it('em requisição direta com segredo inválido, recusa os headers de proxy e usa o socket real', () => {
      const req = mockRequest({
        headers: {
          [PROXY_SECRET_HEADER]: 'segredo-errado',
          'cf-connecting-ip': '1.2.3.4',
          'x-forwarded-for': '8.8.8.8',
        },
        socketAddress: '203.0.113.88',
      });

      const { ip, isTrustedProxy } = resolveClientIp(req, SECRET);
      expect(ip).toBe('203.0.113.88');
      expect(isTrustedProxy).toBe(false);
    });

    it('em requisição autenticada da Cloudflare Pages, extrai CF-Connecting-IP', () => {
      const req = mockRequest({
        headers: {
          [PROXY_SECRET_HEADER]: SECRET,
          'cf-connecting-ip': '198.51.100.25',
          'x-forwarded-for': '198.51.100.25, 172.70.50.1',
        },
        socketAddress: '172.70.50.1',
      });

      const { ip, isTrustedProxy } = resolveClientIp(req, SECRET);
      expect(ip).toBe('198.51.100.25');
      expect(isTrustedProxy).toBe(true);
    });

    it('em requisição autenticada, usa o primeiro salto de X-Forwarded-For se CF-Connecting-IP estiver ausente', () => {
      const req = mockRequest({
        headers: {
          [PROXY_SECRET_HEADER]: SECRET,
          'x-forwarded-for': '198.51.100.77, 172.70.50.1',
        },
        socketAddress: '172.70.50.1',
      });

      const { ip, isTrustedProxy } = resolveClientIp(req, SECRET);
      expect(ip).toBe('198.51.100.77');
      expect(isTrustedProxy).toBe(true);
    });

    it('rejeita IPs com formato inválido nos cabeçalhos mesmo com segredo', () => {
      const req = mockRequest({
        headers: {
          [PROXY_SECRET_HEADER]: SECRET,
          'cf-connecting-ip': 'not-a-valid-ip-address',
          'x-forwarded-for': '<script>alert(1)</script>, 172.70.50.1',
        },
        socketAddress: '172.70.50.1',
      });

      const { ip, isTrustedProxy } = resolveClientIp(req, SECRET);
      expect(ip).toBe('172.70.50.1');
      expect(isTrustedProxy).toBe(true);
    });

    it('suporta endereços IPv6 válidos encaminhados pelo proxy', () => {
      const req = mockRequest({
        headers: {
          [PROXY_SECRET_HEADER]: SECRET,
          'cf-connecting-ip': '2001:db8:85a3::8a2e:370:7334',
        },
        socketAddress: '172.70.50.1',
      });

      const { ip, isTrustedProxy } = resolveClientIp(req, SECRET);
      expect(ip).toBe('2001:db8:85a3::8a2e:370:7334');
      expect(isTrustedProxy).toBe(true);
    });

    it('normaliza prefixo ::ffff: em sockets IPv4-mapped', () => {
      const req = mockRequest({
        socketAddress: '::ffff:127.0.0.1',
      });

      const { ip, isTrustedProxy } = resolveClientIp(req, undefined);
      expect(ip).toBe('127.0.0.1');
      expect(isTrustedProxy).toBe(false);
    });
  });

  describe('createClientIpMiddleware', () => {
    const SECRET = 'configured-secret-32-chars-test';

    it('sobrescreve req.ip e remove o cabeçalho interno x-stockflow-proxy-secret', () => {
      const req = mockRequest({
        headers: {
          [PROXY_SECRET_HEADER]: SECRET,
          'cf-connecting-ip': '198.51.100.42',
        },
        socketAddress: '172.70.50.1',
      });
      const res = mockResponse();
      const next = vi.fn();

      const middleware = createClientIpMiddleware({ proxySecret: SECRET, isProduction: false });
      middleware(req, res, next);

      expect(req.ip).toBe('198.51.100.42');
      expect(req.headers[PROXY_SECRET_HEADER]).toBeUndefined();
      expect(next).toHaveBeenCalledTimes(1);
    });

    it('em produção, rejeita chamada direta sem segredo com HTTP 403 Forbidden', () => {
      const req = mockRequest({
        url: '/api/v1/auth/login',
        headers: {
          'x-forwarded-for': '1.1.1.1',
        },
        socketAddress: '203.0.113.99',
      });
      const res = mockResponse();
      const next = vi.fn();

      const middleware = createClientIpMiddleware({ proxySecret: SECRET, isProduction: true });
      middleware(req, res, next);

      expect(res.statusCode).toBe(403);
      expect(res.sentBody).toMatchObject({
        statusCode: 403,
        code: 'FORBIDDEN',
        message: 'Acesso direto não autorizado. Utilize o domínio oficial da aplicação.',
      });
      expect(next).not.toHaveBeenCalled();
    });

    it('em produção, permite rotas de health check sem segredo de proxy', () => {
      const req = mockRequest({
        url: '/api/v1/health/ready',
        originalUrl: '/api/v1/health/ready',
        socketAddress: '10.0.0.1',
      });
      const res = mockResponse();
      const next = vi.fn();

      const middleware = createClientIpMiddleware({ proxySecret: SECRET, isProduction: true });
      middleware(req, res, next);

      expect(res.statusCode).toBe(200);
      expect(res.sentBody).toBeUndefined();
      expect(next).toHaveBeenCalledTimes(1);
    });

    it('em desenvolvimento ou teste, permite acesso direto mas ignora X-Forwarded-For forjado', () => {
      const req = mockRequest({
        url: '/api/v1/auth/login',
        headers: {
          'x-forwarded-for': '198.51.100.1',
        },
        socketAddress: '127.0.0.1',
      });
      const res = mockResponse();
      const next = vi.fn();

      const middleware = createClientIpMiddleware({ proxySecret: undefined, isProduction: false });
      middleware(req, res, next);

      expect(res.statusCode).toBe(200);
      expect(res.sentBody).toBeUndefined();
      expect(req.ip).toBe('127.0.0.1');
      expect(next).toHaveBeenCalledTimes(1);
    });
  });
});
