/**
 * Códigos de erro estáveis da API.
 *
 * Contrato com o frontend: ele decide a interface pelo `code`, **nunca** pela
 * string de `message`. Mensagem é texto para o usuário final e pode ser
 * reescrita a qualquer momento; `code` é identificador de máquina e mudar um
 * deles é breaking change.
 *
 * Referência: docs/05-api.md §5.1 e docs/02-arquitetura.md §2.6.
 */
export const ErrorCode = {
  // ── Transporte e validação ─────────────────────────────────────────────
  /** DTO inválido em forma. Acompanha `details` com o erro por campo. */
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  UNPROCESSABLE_ENTITY: 'UNPROCESSABLE_ENTITY',
  RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED',
  /** Último recurso. A resposta nunca carrega detalhe interno (§8.9). */
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',

  // ── Autenticação e autorização (Fase 4) ────────────────────────────────
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  USER_INACTIVE: 'USER_INACTIVE',
  EMAIL_ALREADY_EXISTS: 'EMAIL_ALREADY_EXISTS',
  REFRESH_TOKEN_REUSED: 'REFRESH_TOKEN_REUSED',
  FORBIDDEN_ROLE: 'FORBIDDEN_ROLE',

  // ── Cadastros (Fase 4) ─────────────────────────────────────────────────
  SKU_ALREADY_EXISTS: 'SKU_ALREADY_EXISTS',
  CATEGORY_HAS_PRODUCTS: 'CATEGORY_HAS_PRODUCTS',

  // ── Estoque e inventário (Fase 5) ──────────────────────────────────────
  INSUFFICIENT_STOCK: 'INSUFFICIENT_STOCK',
  PRODUCT_INACTIVE: 'PRODUCT_INACTIVE',
  INVALID_TYPE_REASON: 'INVALID_TYPE_REASON',
  INVENTORY_NOT_OPEN: 'INVENTORY_NOT_OPEN',
  INVENTORY_ALREADY_APPROVED: 'INVENTORY_ALREADY_APPROVED',
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

/**
 * Forma única de toda resposta de erro da API.
 *
 * O frontend trata um formato, não vários. Garantido pelo
 * `AllExceptionsFilter`, que é global.
 */
export interface ApiErrorResponse {
  statusCode: number;
  code: ErrorCode;
  /** Destinada ao usuário final, em português. */
  message: string;
  /** Contexto estruturado. Nunca contém stack trace nem mensagem do banco. */
  details?: unknown;
  timestamp: string;
  path: string;
  /** Mesmo id presente na linha de log, para investigar sem expor detalhe. */
  requestId: string;
}
