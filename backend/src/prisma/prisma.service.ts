import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PinoLogger } from 'nestjs-pino';
import { PrismaClient } from '../generated/prisma/client';
import { EnvironmentVariables } from '../config/env.validation';

/**
 * Limite de conexões do pool.
 *
 * O Postgres tem `max_connections` finito (100 por padrão). Sem limite no
 * cliente, um pico de carga abre conexão até o banco recusar **todas**,
 * inclusive as do próprio processo de migration. Dez é folgado para uma
 * instância desta escala e deixa margem para a suíte de teste, o Prisma Studio
 * e um psql aberto ao mesmo tempo (docs/08-seguranca.md §8.5).
 */
const CONNECTION_POOL_MAX = 10;

/**
 * Timeout de conexão. Falhar em 10 segundos é melhor que pendurar a requisição
 * esperando um banco que não vai responder.
 */
const CONNECTION_TIMEOUT_MS = 10_000;

/**
 * Cliente Prisma único da aplicação, com ciclo de vida gerenciado pelo Nest.
 *
 * Não há camada de repositório por cima (docs/02-arquitetura.md §2.3): o
 * `PrismaClient` já é tipado e já parametriza SQL. Envolvê-lo em repositórios
 * por entidade reescreveria a API dele com menos recursos, e o único ganho real
 * (trocar de ORM) não é requisito deste produto.
 *
 * O Prisma 7 não embute mais o query engine em Rust: o acesso ao banco passa por
 * um **driver adapter** explícito, aqui o `@prisma/adapter-pg` sobre o driver
 * `pg`. É o que torna o pool configurável no próprio código, como acima.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor(
    config: ConfigService<EnvironmentVariables, true>,
    private readonly logger: PinoLogger,
  ) {
    const adapter = new PrismaPg({
      connectionString: config.get('DATABASE_URL', { infer: true }),
      max: CONNECTION_POOL_MAX,
      connectionTimeoutMillis: CONNECTION_TIMEOUT_MS,
    });

    super({ adapter });
    this.logger.setContext(PrismaService.name);
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
    this.logger.info({ poolMax: CONNECTION_POOL_MAX }, 'conectado ao banco');
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }

  /**
   * Verificação de disponibilidade usada pelo readiness probe.
   *
   * `SELECT 1` de propósito: é a consulta mais barata que ainda prova o caminho
   * inteiro (pool, socket, autenticação, resposta do servidor). Um health check
   * que só responde a si mesmo diria "pronto" com o banco caído, o que é pior
   * que não ter health check nenhum.
   */
  async ping(): Promise<void> {
    await this.$queryRaw`SELECT 1`;
  }
}
