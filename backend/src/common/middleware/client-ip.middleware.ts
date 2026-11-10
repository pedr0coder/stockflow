import { createHash, timingSafeEqual } from 'node:crypto';
import { isIP } from 'node:net';
import { HttpStatus } from '@nestjs/common';
import type { Request, Response } from 'express';
import { v7 as uuidv7 } from 'uuid';

/**
 * Cabeçalho interno utilizado na autenticação mútua entre o proxy de borda
 * (Cloudflare Pages Functions) e o backend (NestJS no Render).
 */
export const PROXY_SECRET_HEADER = 'x-stockflow-proxy-secret';

/**
 * Comparação em tempo constante entre dois segredos utilizando digest SHA-256.
 * Impede vazamento de caracteres por canal lateral de temporização (timing attacks).
 */
export function safeCompareSecrets(
  incoming: string | undefined,
  expected: string | undefined,
): boolean {
  if (!incoming || !expected) {
    return false;
  }
  const hashIncoming = createHash('sha256').update(incoming).digest();
  const hashExpected = createHash('sha256').update(expected).digest();
  return timingSafeEqual(hashIncoming, hashExpected);
}

export interface ResolvedClientInfo {
  readonly ip: string;
  readonly isTrustedProxy: boolean;
}

/**
 * Resolve o IP real do cliente com base na autenticação do proxy de borda.
 *
 * ┌────────────────────────────────────────────────────────────────────────────┐
 * │ Mecânica da Cadeia de Proxies (Fase 8):                                    │
 * │                                                                            │
 * │ 1. Via Cloudflare Pages Functions (Legítimo):                              │
 * │    O cliente conecta ao Cloudflare Pages, que extrai `CF-Connecting-IP`   │
 * │    e anexa `x-stockflow-proxy-secret` (`PROXY_SECRET`). O Render recebe    │
 * │    da Cloudflare. Ao validar o segredo compartilhado, confiamos no IP      │
 * │    repassado pela nossa Pages Function (`cf-connecting-ip` ou primeiro    │
 * │    salto de XFF), evitando que todos os usuários compartilhem a mesma      │
 * │    cota de rate limit do IP de saída da Cloudflare.                        │
 * │                                                                            │
 * │ 2. Acesso Direto a `*.onrender.com` (sem passar pela Cloudflare):          │
 * │    Sem o segredo compartilhado, o backend NUNCA confia em cabeçalhos      │
 * │    forjados pelo cliente (`X-Forwarded-For`, `CF-Connecting-IP`, etc são   │
 * │    ignorados). O IP resolvido é estritamente o endereço real do socket TCP │
 * │    (`req.socket.remoteAddress`). Em produção, acessos diretos a rotas de   │
 * │    negócio/autenticação são sumariamente rejeitados com HTTP 403.          │
 * │                                                                            │
 * │ 3. Ambiente Local / CI / Testes:                                           │
 * │    Quando `isProduction` é falso, requisições diretas são permitidas para  │
 * │    desenvolvimento e testes locais, mas cabeçalhos forjados continuam      │
 * │    sendo ignorados para evitar bypass de rate limit.                       │
 * └────────────────────────────────────────────────────────────────────────────┘
 */
export function resolveClientIp(req: Request, configuredSecret?: string): ResolvedClientInfo {
  const secretHeader = req.headers[PROXY_SECRET_HEADER];
  const incomingSecret =
    typeof secretHeader === 'string'
      ? secretHeader
      : Array.isArray(secretHeader)
        ? secretHeader[0]
        : undefined;

  const isTrustedProxy = safeCompareSecrets(incomingSecret, configuredSecret);

  if (isTrustedProxy) {
    // 1. Prioridade no proxy autenticado: cf-connecting-ip
    const cfConnectingIp =
      typeof req.headers['cf-connecting-ip'] === 'string'
        ? req.headers['cf-connecting-ip'].trim()
        : undefined;
    if (cfConnectingIp && isIP(cfConnectingIp) !== 0) {
      return { ip: cfConnectingIp, isTrustedProxy: true };
    }

    // 2. Primeiro IP em X-Forwarded-For (o IP do cliente injetado pela Pages Function)
    const xff =
      typeof req.headers['x-forwarded-for'] === 'string'
        ? req.headers['x-forwarded-for']
        : Array.isArray(req.headers['x-forwarded-for'])
          ? req.headers['x-forwarded-for'][0]
          : undefined;
    if (xff) {
      const clientIp = xff.split(',')[0]?.trim();
      if (clientIp && isIP(clientIp) !== 0) {
        return { ip: clientIp, isTrustedProxy: true };
      }
    }
  }

  // Acesso direto sem proxy confiável ou ambiente sem segredo configurado:
  // NUNCA confia em cabeçalhos enviados pelo cliente (X-Forwarded-For, CF-Connecting-IP).
  // Apenas o socket remoto TCP reflete o endereço real não-forjável.
  const rawSocketIp = req.socket?.remoteAddress?.trim();
  const normalizedSocketIp = rawSocketIp?.replace(/^::ffff:/, '');
  if (normalizedSocketIp && isIP(normalizedSocketIp) !== 0) {
    return { ip: normalizedSocketIp, isTrustedProxy };
  }

  return { ip: 'desconhecido', isTrustedProxy };
}

export interface ClientIpMiddlewareOptions {
  readonly proxySecret?: string | undefined;
  readonly isProduction?: boolean | undefined;
}

/**
 * Middleware Express para normalizar `req.ip` e rejeitar acessos diretos não autorizados em produção.
 */
export function createClientIpMiddleware(options: ClientIpMiddlewareOptions = {}) {
  const { proxySecret, isProduction = false } = options;

  return (req: Request, res: Response, next: () => void): void => {
    const { ip, isTrustedProxy } = resolveClientIp(req, proxySecret);

    // Remove o cabeçalho de segredo interno para não vazar downstream
    delete req.headers[PROXY_SECRET_HEADER];

    // Em produção, se o proxy estiver configurado, rejeita chamadas diretas que não passem
    // pelo proxy autenticado da Cloudflare, exceto rotas de health check da infraestrutura.
    if (isProduction && proxySecret) {
      const requestPath = req.originalUrl ?? req.url ?? '';
      const isHealthCheck = requestPath.startsWith('/api/v1/health');

      if (!isTrustedProxy && !isHealthCheck) {
        const requestId =
          typeof req.headers['x-request-id'] === 'string'
            ? req.headers['x-request-id']
            : ((req as Request & { id?: string }).id ?? uuidv7());

        res.status(HttpStatus.FORBIDDEN).json({
          statusCode: HttpStatus.FORBIDDEN,
          code: 'FORBIDDEN',
          message: 'Acesso direto não autorizado. Utilize o domínio oficial da aplicação.',
          timestamp: new Date().toISOString(),
          path: requestPath,
          requestId,
        });
        return;
      }
    }

    Object.defineProperty(req, 'ip', {
      value: ip,
      configurable: true,
      writable: true,
    });

    next();
  };
}
