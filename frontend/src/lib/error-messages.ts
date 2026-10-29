/**
 * Mensagens de erro da API, por código.
 *
 * O frontend decide o texto pelo `code`, **nunca** pela string de `message` que
 * veio do servidor (docs/02-arquitetura.md §2.6). Dois motivos:
 *
 *   1. `message` é texto para o usuário final e pode ser reescrito no servidor
 *      a qualquer momento; `code` é identificador estável, parte do contrato.
 *   2. Nada vindo da rede é renderizado como HTML (docs/08-seguranca.md §8.10).
 *      Resolver o texto localmente fecha essa porta por construção.
 *
 * O mapa cobre o que pode aparecer em qualquer consulta, incluindo os 15 códigos de
 * negócio reais de `backend/src/common/errors/error-codes.ts` (conferidos direto no
 * código-fonte, não copiados de uma doc — docs/18-plano-fase-6.md §18.1, achado 1). Uma
 * tela com contexto específico (ex.: `INSUFFICIENT_STOCK` com `available`/`requested`) pode
 * sobrescrever com `override`; o que está aqui é o texto de segurança para quando não há.
 */
const MESSAGE_BY_CODE: Readonly<Record<string, string>> = {
  // Transporte e validação.
  VALIDATION_ERROR: 'Os dados informados não são válidos.',
  UNAUTHORIZED: 'Sua sessão expirou. Entre novamente para continuar.',
  FORBIDDEN: 'Você não tem permissão para ver estas informações.',
  NOT_FOUND: 'O registro não foi encontrado. Ele pode ter sido removido.',
  CONFLICT: 'A operação não pode ser concluída por um conflito com o estado atual.',
  UNPROCESSABLE_ENTITY: 'A operação não é permitida pelas regras do sistema.',
  PAYLOAD_TOO_LARGE: 'Os dados enviados são grandes demais.',
  RATE_LIMIT_EXCEEDED: 'Muitas tentativas em pouco tempo. Aguarde alguns minutos.',
  INTERNAL_ERROR: 'Ocorreu um erro inesperado ao carregar os dados.',
  SERVICE_UNAVAILABLE: 'O serviço está indisponível no momento.',

  // Autenticação e autorização.
  INVALID_CREDENTIALS: 'E-mail ou senha incorretos.',
  USER_INACTIVE: 'Esta conta está inativa.',
  EMAIL_ALREADY_EXISTS: 'Já existe uma conta com este e-mail.',
  REFRESH_TOKEN_REUSED: 'Sua sessão foi encerrada por segurança. Entre novamente.',
  FORBIDDEN_ROLE: 'Seu perfil não permite acessar este recurso.',

  // Cadastros.
  SKU_ALREADY_EXISTS: 'Já existe um produto com este SKU.',
  CATEGORY_HAS_PRODUCTS: 'Esta categoria tem produtos ativos. Mova-os antes de inativá-la.',

  // Estoque e inventário (Fase 5).
  INSUFFICIENT_STOCK: 'Estoque insuficiente para esta operação.',
  PRODUCT_INACTIVE: 'Este produto está inativo.',
  INVALID_TYPE_REASON: 'O motivo informado não é válido para este tipo de movimentação.',
  INVENTORY_NOT_OPEN: 'Este inventário não está aberto para esta operação.',
  INVENTORY_ALREADY_APPROVED: 'Este inventário já foi aprovado.',
  INVENTORY_INVALID_STATE: 'Esta transição não é permitida a partir do estado atual.',
  PRODUCT_IN_OPEN_INVENTORY: 'Um ou mais produtos já estão em outro inventário em andamento.',
};

export const FALLBACK_ERROR_MESSAGE = 'Não foi possível carregar os dados.';

/**
 * Resolve o texto a partir do código.
 *
 * Um código desconhecido cai no texto genérico em vez de exibir o próprio
 * código: "INTERNAL_ERROR" na tela não ajuda quem está usando o sistema.
 */
export function messageForCode(code?: string, override?: string): string {
  if (override !== undefined && override.length > 0) {
    return override;
  }

  if (code !== undefined && code in MESSAGE_BY_CODE) {
    return MESSAGE_BY_CODE[code] ?? FALLBACK_ERROR_MESSAGE;
  }

  return FALLBACK_ERROR_MESSAGE;
}
