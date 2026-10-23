import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import type { Request } from 'express';

/**
 * Rate limit do refresh: 30 por 15 minutos, por endereço (§8.7).
 *
 * A chave é só o IP, e não IP mais identidade, por um motivo simples: quem
 * chama este endpoint ainda não está autenticado, e o único identificador
 * disponível é o cookie, que é exatamente o que um atacante estaria tentando
 * adivinhar. Usar o cookie como chave daria a ele controle sobre o próprio
 * orçamento.
 *
 * Trinta em quinze minutos é folgado para uso legítimo: o access dura 15
 * minutos, então uma sessão honesta renova duas vezes nesse intervalo, mesmo
 * com várias abas.
 */
@Injectable()
export class RefreshThrottlerGuard extends ThrottlerGuard {
  protected override getTracker(req: Record<string, unknown>): Promise<string> {
    const ip = typeof req['ip'] === 'string' ? req['ip'] : 'desconhecido';

    return Promise.resolve(`refresh:${ip}`);
  }
}

/** Tipo auxiliar para o controller, que lê `request.ip`. */
export type RequestWithIp = Request;
