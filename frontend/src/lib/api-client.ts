/**
 * Cliente HTTP central da aplicação.
 *
 * Um módulo com funções, não uma classe: não há estado por instância que
 * justifique objeto, e um módulo é testável sem precisar instanciar nada
 * (docs/18-plano-fase-6.md §18.5).
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ O access token mora AQUI, em variável de módulo — não em `useState`, não  │
 * │ em contexto do React, não em `localStorage`/`sessionStorage`.             │
 * │                                                                          │
 * │ Precisa estar disponível para o interceptor de 401 mesmo fora de uma      │
 * │ árvore de componentes (uma mutação do React Query roda fora de qualquer   │
 * │ render). Os componentes leem o USUÁRIO pelo contexto de autenticação      │
 * │ (`features/auth/auth-context.ts`); nunca leem o token.                    │
 * └──────────────────────────────────────────────────────────────────────────┘
 */

/** URL relativa de propósito (docs/18-plano-fase-6.md §18.1, achado 3): o proxy do Vite em
 * desenvolvimento e o mesmo domínio em produção dependem de nunca montar uma origem
 * absoluta aqui. */
const API_BASE = import.meta.env.VITE_API_URL;

let accessToken: string | null = null;

/**
 * Geração do token, incrementada a cada `clearAccessToken()`.
 *
 * Existe para uma corrida específica: uma renovação já em voo quando o
 * logout acontece. Sem isto, a resposta TARDIA de um `/auth/refresh` que
 * começou antes do logout chegaria depois, e `performRefresh` gravaria um
 * token de volta em memória — a sessão "voltaria" sozinha depois de
 * encerrada. `clearAccessToken` muda a geração; `performRefresh` só grava se
 * a geração não tiver mudado desde que a chamada começou.
 */
let tokenGeneration = 0;

export function setAccessToken(token: string): void {
  accessToken = token;
}

export function clearAccessToken(): void {
  accessToken = null;
  tokenGeneration += 1;
}

/** Exportado só para teste. Nenhum componente de produção precisa ler o token. */
export function getAccessToken(): string | null {
  return accessToken;
}

/**
 * Forma única de erro de resposta da API, espelhando `docs/02-arquitetura.md §2.6`.
 *
 * `code` é o campo estável — a interface decide o texto por ele (`error-messages.ts`),
 * nunca por `message`, que é texto para humano e pode ser reescrito no servidor.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string | undefined;
  readonly details: unknown;

  constructor(status: number, code: string | undefined, message: string, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

/**
 * Erro de REDE — distinto de `ApiError`: aqui não houve resposta HTTP nenhuma
 * (servidor fora do ar, sem conexão). A tela trata os dois casos de forma
 * diferente (docs/18-plano-fase-6.md §18.6): rede nunca desloga ninguém.
 */
export class NetworkError extends Error {
  constructor() {
    super('Falha de rede.');
    this.name = 'NetworkError';
  }
}

interface ApiErrorBody {
  code?: string;
  message?: string;
  details?: unknown;
}

/**
 * Avisa a aplicação que a sessão acabou de verdade (refresh falhou).
 *
 * Função de registro, não um EventEmitter: só existe UM interessado possível
 * (o `AuthProvider`), então um único slot basta e evita a complexidade de uma
 * lista de assinantes que nunca vai ter um segundo assinante.
 */
type SessionExpiredHandler = () => void;
let onSessionExpired: SessionExpiredHandler | null = null;

export function setSessionExpiredHandler(handler: SessionExpiredHandler | null): void {
  onSessionExpired = handler;
}

/**
 * Rotas de autenticação nunca passam pelo interceptor de 401 delas mesmas:
 * sem esta exclusão, um 401 de `/auth/login` (credencial errada) tentaria
 * renovar a sessão antes de reportar a credencial errada, e um 401 de
 * `/auth/refresh` (cookie expirado) entraria em recursão.
 */
function isAuthRoute(path: string): boolean {
  return path.startsWith('/auth/');
}

interface AuthTokenPayload {
  accessToken: string;
  expiresIn: number;
  user: { id: string; name: string; email: string; role: string };
}

/**
 * A ÚNICA renovação em voo por vez, compartilhada entre QUALQUER chamador —
 * o interceptor de 401 de uma requisição de negócio e o boot do app
 * (`AuthProvider`) usam a MESMA promessa quando coincidem no tempo.
 *
 * Sem isto, duas requisições de negócio recebendo 401 ao mesmo tempo
 * disparariam dois `POST /auth/refresh`; o segundo chegaria ao servidor como
 * reuso de um refresh já rotacionado pelo primeiro e devolveria
 * `REFRESH_TOKEN_REUSED`, revogando a cadeia inteira (ADR-0005) — a sessão
 * morreria por causa da própria tentativa de renová-la.
 */
let refreshPromise: Promise<AuthTokenPayload> | null = null;

async function performRefresh(): Promise<AuthTokenPayload> {
  const generationAtStart = tokenGeneration;

  const response = await fetch(`${API_BASE}/auth/refresh`, {
    method: 'POST',
    credentials: 'include',
  });

  if (!response.ok) {
    throw await toApiError(response);
  }

  const payload = (await response.json()) as AuthTokenPayload;

  // Um logout aconteceu enquanto esta chamada estava em voo: a geração mudou,
  // então esta resposta é tardia e NÃO deve reviver o token em memória. O
  // payload ainda é devolvido (uma retentativa de requisição de negócio já em
  // andamento pode precisar dele), mas o estado global do módulo não muda.
  if (tokenGeneration === generationAtStart) {
    setAccessToken(payload.accessToken);
  }

  return payload;
}

/**
 * Renova a sessão, deduplicada.
 *
 * Exportada: é chamada tanto pelo `AuthProvider` no boot do app (a PRIMEIRA
 * tentativa de restaurar a sessão, não disparada por nenhum 401) quanto
 * internamente por `request()` quando uma chamada de negócio recebe 401.
 */
export function refreshSession(): Promise<AuthTokenPayload> {
  refreshPromise ??= performRefresh().finally(() => {
    refreshPromise = null;
  });

  return refreshPromise;
}

async function toApiError(response: Response): Promise<ApiError> {
  let body: ApiErrorBody = {};

  try {
    body = (await response.json()) as ApiErrorBody;
  } catch {
    // Corpo vazio ou não-JSON (ex.: 204, ou um erro fora do AllExceptionsFilter).
    // Cai no texto genérico abaixo; não é um caso para propagar outro erro.
  }

  return new ApiError(
    response.status,
    body.code,
    body.message ?? 'Ocorreu um erro inesperado.',
    body.details,
  );
}

export interface RequestOptions {
  /** Nunca true por engano: usado pelas próprias rotas de auth e pelo retry único. */
  skipAuthRetry?: boolean;
}

/**
 * Requisição tipada contra a API.
 *
 * Decimal nunca é convertido aqui: o corpo chega e sai como o backend o
 * serializa (string), e quem lê o campo decide se formata — nunca `Number()`
 * em quantidade ou custo (o mesmo cuidado do backend, do lado do cliente).
 */
export async function request<T>(
  path: string,
  init: RequestInit = {},
  options: RequestOptions = {},
): Promise<T> {
  const headers = new Headers(init.headers);

  if (!headers.has('Content-Type') && init.body !== undefined) {
    headers.set('Content-Type', 'application/json');
  }

  const token = getAccessToken();

  if (token !== null && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  let response: Response;

  try {
    response = await fetch(`${API_BASE}${path}`, {
      ...init,
      headers,
      ...(isAuthRoute(path) ? { credentials: 'include' } : {}),
    });
  } catch {
    throw new NetworkError();
  }

  // Nunca em resposta a 403: FORBIDDEN_ROLE é uma decisão de autorização, não
  // de token expirado, e tentar renovar a sessão não mudaria o papel de
  // ninguém (docs/18-plano-fase-6.md, instrução explícita desta revisão).
  if (response.status === 401 && !options.skipAuthRetry && !isAuthRoute(path)) {
    try {
      await refreshSession();
    } catch {
      clearAccessToken();
      onSessionExpired?.();
      throw new ApiError(
        401,
        'UNAUTHORIZED',
        'Sua sessão expirou. Entre novamente para continuar.',
      );
    }

    // Uma ÚNICA retentativa: `skipAuthRetry: true` impede um segundo 401 (ex.:
    // o token novo também é recusado por algum outro motivo) de entrar em
    // loop tentando renovar de novo.
    return request<T>(path, init, { skipAuthRetry: true });
  }

  if (!response.ok) {
    throw await toApiError(response);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}
