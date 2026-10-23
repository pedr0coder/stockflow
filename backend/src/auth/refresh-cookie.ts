import type { CookieOptions, Response } from 'express';
import { parseDuration } from './token.service';

/**
 * Nome do cookie de refresh.
 *
 * Nomeado, e não genérico como `token` ou `session`: nome genérico é o que
 * script automatizado procura primeiro.
 */
export const REFRESH_COOKIE_NAME = 'stockflow_refresh';

/**
 * Caminho em que o cookie é enviado.
 *
 * Restringir a `/api/v1/auth` significa que o navegador **não envia** o cookie
 * em nenhuma requisição de negócio. Duas consequências: ele não aparece em log
 * de requisição comum, e não há como ele participar de um CSRF contra um
 * endpoint de escrita, porque não chega lá.
 */
export const REFRESH_COOKIE_PATH = '/api/v1/auth';

/**
 * Opções do cookie de refresh, em um lugar só.
 *
 * Definir e apagar precisam usar **exatamente** os mesmos `path`, `sameSite`,
 * `secure` e `domain`: o navegador só remove um cookie quando esses atributos
 * coincidem. Divergir deixaria o cookie vivo no navegador apontando para um
 * registro já revogado, e o usuário veria "sessão inválida" a cada tentativa
 * sem entender por quê.
 *
 * Cada atributo e o motivo dele estão em docs/15-plano-fase-4.md §15.5.
 */
export function refreshCookieOptions(isProduction: boolean): CookieOptions {
  return {
    // Tira o token do alcance do JavaScript. É a razão de existir desta
    // escolha de arquitetura (ADR-0005): XSS não alcança o refresh.
    httpOnly: true,

    // O navegador recusa cookie `Secure` em HTTP, e em desenvolvimento não há
    // TLS. Nunca desligado em produção.
    secure: isProduction,

    // Defesa principal contra CSRF: o navegador não envia o cookie em
    // requisição originada de outro site. `strict` e não `lax`, porque não há
    // fluxo de retorno de terceiro que precise dele em navegação de topo.
    sameSite: 'strict',

    path: REFRESH_COOKIE_PATH,
  };
}

/** Grava o cookie com o prazo alinhado ao registro no banco. */
export function setRefreshCookie(
  response: Response,
  token: string,
  ttl: string,
  isProduction: boolean,
): void {
  response.cookie(REFRESH_COOKIE_NAME, token, {
    ...refreshCookieOptions(isProduction),
    // Espelha a expiração gravada em `refresh_tokens.expires_at`. Se
    // divergirem, o cookie some antes do registro expirar, ou o contrário.
    maxAge: parseDuration(ttl),
  });
}

/** Apaga o cookie usando os mesmos atributos com que foi criado. */
export function clearRefreshCookie(response: Response, isProduction: boolean): void {
  response.clearCookie(REFRESH_COOKIE_NAME, refreshCookieOptions(isProduction));
}
