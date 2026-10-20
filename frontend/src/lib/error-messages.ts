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
 * O mapa cobre o que pode aparecer em qualquer consulta. Os códigos de negócio
 * ganham tratamento na tela que os provoca, onde há contexto para explicá-los.
 */
const MESSAGE_BY_CODE: Readonly<Record<string, string>> = {
  UNAUTHORIZED: 'Sua sessão expirou. Entre novamente para continuar.',
  FORBIDDEN: 'Você não tem permissão para ver estas informações.',
  FORBIDDEN_ROLE: 'Seu perfil não permite acessar este recurso.',
  NOT_FOUND: 'O registro não foi encontrado. Ele pode ter sido removido.',
  RATE_LIMIT_EXCEEDED: 'Muitas tentativas em pouco tempo. Aguarde alguns minutos.',
  SERVICE_UNAVAILABLE: 'O serviço está indisponível no momento.',
  INTERNAL_ERROR: 'Ocorreu um erro inesperado ao carregar os dados.',
  VALIDATION_ERROR: 'Os filtros aplicados não são válidos.',
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
