import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { LoggerModule } from 'nestjs-pino';
import { IncomingMessage, ServerResponse } from 'node:http';
import { v7 as uuidv7 } from 'uuid';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { EnvironmentVariables, NodeEnv, validateEnv } from './config/env.validation';
import { HealthModule } from './health/health.module';
import { PrismaModule } from './prisma/prisma.module';

/**
 * Campos removidos de toda linha de log.
 *
 * Lista explícita, e não heurística por nome: uma heurística que procura
 * "password" dentro da chave deixaria passar `pwd` e redigiria `passwordPolicy`
 * sem motivo. Senha, token e segredo nunca aparecem em log
 * (docs/08-seguranca.md §8.9).
 */
const REDACTED_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers["set-cookie"]',
  'res.headers["set-cookie"]',
  'req.body.password',
  'req.body.currentPassword',
  'req.body.newPassword',
  'req.body.token',
  'req.body.refreshToken',
  'req.body.accessToken',
  '*.passwordHash',
  '*.tokenHash',
];

@Module({
  imports: [
    /**
     * `validate` roda antes de qualquer provider ser instanciado: config
     * inválida derruba o boot em vez de virar `undefined` no meio de uma
     * requisição (docs/08-seguranca.md §8.8).
     *
     * `envFilePath` aponta para a RAIZ do repositório. Um único `.env` serve o
     * compose, o backend e o Prisma CLI; duas cópias de um arquivo de segredo
     * divergem em uma semana. Dentro do container o arquivo não existe e as
     * variáveis vêm do ambiente, que é o comportamento desejado.
     */
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      envFilePath: ['../.env', '.env'],
      validate: validateEnv,
    }),

    LoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<EnvironmentVariables, true>) => {
        const isDevelopment = config.get('NODE_ENV', { infer: true }) === NodeEnv.Development;

        return {
          pinoHttp: {
            level: config.get('LOG_LEVEL', { infer: true }),

            /**
             * UUIDv7 em vez do contador padrão do pino-http.
             *
             * O contador reinicia a cada restart do processo, então dois erros
             * diferentes podem ter o mesmo id. O v7 é único e ordenável por
             * tempo, o que torna a busca no log por intervalo trivial.
             */
            genReqId: (req: IncomingMessage, res: ServerResponse): string => {
              const existing = req.headers['x-request-id'];
              const id = typeof existing === 'string' && existing.length > 0 ? existing : uuidv7();
              // Devolvido ao cliente para que ele possa citá-lo ao relatar um erro.
              res.setHeader('x-request-id', id);
              return id;
            },

            redact: { paths: REDACTED_PATHS, censor: '[REDIGIDO]' },

            /**
             * JSON em produção, porque é o que um agregador de log consome.
             * Linha colorida em desenvolvimento, porque JSON cru no terminal
             * não é legível por humano.
             */
            ...(isDevelopment
              ? {
                  transport: {
                    target: 'pino-pretty',
                    options: {
                      singleLine: true,
                      translateTime: 'HH:MM:ss.l',
                      ignore: 'pid,hostname',
                    },
                  },
                }
              : {}),

            // O health check do orquestrador bate a cada poucos segundos e
            // afogaria o log útil.
            autoLogging: {
              ignore: (req: IncomingMessage) => req.url?.startsWith('/api/v1/health') === true,
            },
          },
        };
      },
    }),

    PrismaModule,
    HealthModule,
  ],
  providers: [
    /**
     * Registrado como provider e não por `app.useGlobalFilters()` para que o
     * filtro participe da injeção de dependência e receba o logger. Um filtro
     * instanciado à mão não teria acesso ao container.
     */
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule {}
