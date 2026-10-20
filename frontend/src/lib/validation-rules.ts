/**
 * Constantes de regra de validação.
 *
 * Espelham os valores do servidor, com os mesmos nomes. A duplicação é
 * deliberada e está registrada no [ADR-0002](../../../docs/adr/0002-validacao-backend.md):
 * validação de cliente e de servidor têm propósitos diferentes (experiência
 * contra segurança), e a de servidor **nunca** confia na de cliente.
 *
 * Compartilhar o schema entre os dois pacotes economizaria algumas linhas e
 * criaria acoplamento de build entre dois artefatos que hoje são deployáveis de
 * forma independente.
 *
 * A mitigação acordada para o risco de divergência: estas constantes ficam
 * neste arquivo, com os mesmos nomes do lado do servidor, e um teste de
 * integração da Fase 6 verifica que o backend rejeita o que o frontend rejeita.
 */

/** Política de senha da §8.1, alinhada ao NIST SP 800-63B. */
export const MIN_PASSWORD_LENGTH = 10;

/** `varchar(180)` da coluna `email` (docs/04-banco-de-dados.md §4.4). */
export const MAX_EMAIL_LENGTH = 180;
