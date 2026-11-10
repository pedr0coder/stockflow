/**
 * Proxy reverso same-origin no Cloudflare Pages Functions (`/api/*` → `BACKEND_ORIGIN`).
 *
 * Por que este proxy existe (ADR-0005 e docs/20-plano-fase-8.md):
 *   1. O cookie de refresh (`stockflow_refresh`) é emitido pelo backend com
 *      `HttpOnly; Secure; SameSite=Strict; Path=/api/v1/auth`
 *      (`backend/src/auth/refresh-cookie.ts`).
 *   2. Em hospedagem gratuita separada (frontend em `*.pages.dev` e API em
 *      `*.onrender.com`), os dois subdomínios pertencem a eTLD+1 distintos na
 *      Public Suffix List. Uma chamada direta do navegador para `onrender.com`
 *      seria cross-site, e o navegador bloquearia o envio de um cookie
 *      `SameSite=Strict`.
 *   3. Com esta Pages Function, o navegador conversa exclusivamente com a
 *      própria origem do Cloudflare Pages (`VITE_API_URL=/api/v1`), mantendo a
 *      sessão 100% same-origin sem precisar enfraquecer `SameSite=Strict` para
 *      `SameSite=None`.
 */

export interface PagesFunctionEnv {
  readonly BACKEND_ORIGIN?: string | undefined;
  readonly PROXY_SECRET?: string | undefined;
}

export interface PagesFunctionContext {
  readonly request: Request;
  readonly env: PagesFunctionEnv;
}

const FORWARDED_REQUEST_HEADERS = [
  'accept',
  'accept-language',
  'authorization',
  'content-type',
  'cookie',
  'if-modified-since',
  'if-none-match',
  'user-agent',
  'x-request-id',
] as const;

const FORWARDED_RESPONSE_HEADERS = [
  'cache-control',
  'content-type',
  'etag',
  'retry-after',
  'vary',
  'x-ratelimit-limit',
  'x-ratelimit-remaining',
  'x-ratelimit-reset',
  'x-request-id',
] as const;

/**
 * Valida e normaliza `BACKEND_ORIGIN` (ex.: `https://stockflow-api.onrender.com`).
 * Recusa strings vazias, protocolos não-HTTP(S), credenciais embutidas ou caminhos extras.
 */
export function resolveBackendOrigin(rawOrigin: string | undefined): string | null {
  const trimmed = rawOrigin?.trim();
  if (!trimmed) {
    return null;
  }

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      return null;
    }
    if (parsed.username !== '' || parsed.password !== '') {
      return null;
    }
    if ((parsed.pathname !== '/' && parsed.pathname !== '') || parsed.search !== '') {
      return null;
    }
    return parsed.origin;
  } catch {
    return null;
  }
}

/**
 * Remove eventual atributo `Domain=...` do cabeçalho `Set-Cookie` recebido do
 * upstream para garantir que o cookie `stockflow_refresh` seja gravado como
 * host-only na origem do Cloudflare Pages.
 */
export function sanitizeSetCookieHeader(rawCookie: string): string {
  return rawCookie
    .split(';')
    .map((part) => part.trim())
    .filter((part) => part.length > 0 && !/^domain\s*=/i.test(part))
    .join('; ');
}

function buildGatewayErrorResponse(
  statusCode: 502 | 504,
  code: 'BAD_GATEWAY' | 'GATEWAY_TIMEOUT',
  message: string,
  path: string,
  requestId: string,
): Response {
  const body = {
    statusCode,
    code,
    message,
    timestamp: new Date().toISOString(),
    path,
    requestId,
  };

  return new Response(JSON.stringify(body), {
    status: statusCode,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'x-request-id': requestId,
    },
  });
}

export async function onRequest(context: PagesFunctionContext): Promise<Response> {
  const { request, env } = context;
  const incomingUrl = new URL(request.url);
  const requestPath = `${incomingUrl.pathname}${incomingUrl.search}`;
  const requestId = request.headers.get('x-request-id')?.trim() || crypto.randomUUID();

  const backendOrigin = resolveBackendOrigin(env.BACKEND_ORIGIN);
  if (backendOrigin === null) {
    return buildGatewayErrorResponse(
      502,
      'BAD_GATEWAY',
      'Serviço de API não configurado no proxy de borda.',
      incomingUrl.pathname,
      requestId,
    );
  }

  // Proteção contra path traversal / open proxy: apenas caminhos sob `/api/`
  // e estritamente resolvidos para a mesma origem `backendOrigin` são aceitos.
  if (
    !incomingUrl.pathname.startsWith('/api/') ||
    incomingUrl.pathname.startsWith('//') ||
    incomingUrl.pathname.includes('..')
  ) {
    return buildGatewayErrorResponse(
      502,
      'BAD_GATEWAY',
      'Caminho de API inválido.',
      incomingUrl.pathname,
      requestId,
    );
  }

  const targetUrl = new URL(requestPath, backendOrigin);
  if (targetUrl.origin !== backendOrigin || !targetUrl.pathname.startsWith('/api/')) {
    return buildGatewayErrorResponse(
      502,
      'BAD_GATEWAY',
      'Destino de proxy inválido.',
      incomingUrl.pathname,
      requestId,
    );
  }

  const upstreamHeaders = new Headers();
  for (const headerName of FORWARDED_REQUEST_HEADERS) {
    const value = request.headers.get(headerName);
    if (value !== null) {
      upstreamHeaders.set(headerName, value);
    }
  }

  upstreamHeaders.set('x-request-id', requestId);
  upstreamHeaders.set('x-forwarded-host', incomingUrl.host);
  upstreamHeaders.set('x-forwarded-proto', incomingUrl.protocol.replace(/:$/, ''));

  const clientIp =
    request.headers.get('cf-connecting-ip')?.trim() ??
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  if (clientIp) {
    upstreamHeaders.set('x-forwarded-for', clientIp);
    upstreamHeaders.set('cf-connecting-ip', clientIp);
  }

  const proxySecret = env.PROXY_SECRET?.trim();
  if (proxySecret) {
    upstreamHeaders.set('x-stockflow-proxy-secret', proxySecret);
  }

  const method = request.method.toUpperCase();
  const hasBody = method !== 'GET' && method !== 'HEAD';
  const bodyBuffer = hasBody ? await request.arrayBuffer() : undefined;

  let upstreamResponse: Response;
  try {
    upstreamResponse = await fetch(targetUrl.toString(), {
      method,
      headers: upstreamHeaders,
      ...(bodyBuffer !== undefined && bodyBuffer.byteLength > 0 ? { body: bodyBuffer } : {}),
      redirect: 'manual',
    });
  } catch {
    return buildGatewayErrorResponse(
      502,
      'BAD_GATEWAY',
      'Não foi possível conectar ao servidor da API. Tente novamente em instantes.',
      incomingUrl.pathname,
      requestId,
    );
  }

  const responseHeaders = new Headers();
  for (const headerName of FORWARDED_RESPONSE_HEADERS) {
    const value = upstreamResponse.headers.get(headerName);
    if (value !== null) {
      responseHeaders.set(headerName, value);
    }
  }

  if (!responseHeaders.has('x-request-id')) {
    responseHeaders.set('x-request-id', requestId);
  }

  const setCookies =
    typeof upstreamResponse.headers.getSetCookie === 'function'
      ? upstreamResponse.headers.getSetCookie()
      : [];

  if (setCookies.length > 0) {
    for (const cookie of setCookies) {
      responseHeaders.append('set-cookie', sanitizeSetCookieHeader(cookie));
    }
  } else {
    const singleCookie = upstreamResponse.headers.get('set-cookie');
    if (singleCookie !== null) {
      responseHeaders.append('set-cookie', sanitizeSetCookieHeader(singleCookie));
    }
  }

  return new Response(upstreamResponse.body, {
    status: upstreamResponse.status,
    statusText: upstreamResponse.statusText,
    headers: responseHeaders,
  });
}
