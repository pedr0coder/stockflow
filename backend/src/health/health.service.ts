import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { PrismaService } from '../prisma/prisma.service';

export type DependencyState = 'up' | 'down';

export interface ReadinessResult {
  ready: boolean;
  database: DependencyState;
}

@Injectable()
export class HealthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(HealthService.name);
  }

  /**
   * Readiness: a aplicação consegue atender requisição **útil** agora?
   *
   * A diferença em relação ao liveness é a pergunta que cada um responde.
   * Liveness: "o processo está vivo?" (se não, reinicie). Readiness: "pode
   * receber tráfego?" (se não, tire do balanceador, mas não reinicie, porque
   * reiniciar não conserta um banco fora do ar).
   *
   * O erro é registrado em log mas **não** entra na resposta: a causa pode
   * conter host, usuário do banco ou detalhe do driver, e isso não vai para um
   * endpoint público (docs/05-api.md §5.12).
   */
  async checkReadiness(): Promise<ReadinessResult> {
    try {
      await this.prisma.ping();
      return { ready: true, database: 'up' };
    } catch (error) {
      this.logger.error({ err: error }, 'readiness falhou: banco inacessível');
      return { ready: false, database: 'down' };
    }
  }
}
