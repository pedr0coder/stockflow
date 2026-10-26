import { ClassSerializerInterceptor, Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR, Reflector } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import { IncomingMessage, ServerResponse } from 'node:http';
import { v7 as uuidv7 } from 'uuid';
import { AuthModule } from './auth/auth.module';
import { AuditModule } from './audit/audit.module';
import { CategoriesModule } from './categories/categories.module';
import { ProductsModule } from './products/products.module';
import { StockMovementsModule } from './stock-movements/stock-movements.module';
import { SuppliersModule } from './suppliers/suppliers.module';
import { UsersModule } from './users/users.module';
import { AuditInterceptor } from './common/interceptors/audit.interceptor';
import { DecimalSerializerInterceptor } from './common/interceptors/decimal-serializer.interceptor';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { AppThrottlerGuard } from './common/guards/app-throttler.guard';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';
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

    /**
     * Rate limit em memoria.
     *
     * Um unico throttler nomeado `default`, com a janela de um minuto. O
     * limite efetivo depende do metodo e e resolvido pelo `AppThrottlerGuard`
     * (leitura 300, escrita 100). As rotas de autenticacao tem limites
     * proprios, muito mais estritos, e sao puladas por aquele guard.
     *
     * Limitacao conhecida e ja registrada na secao 8.12: o armazenamento e em
     * memoria, entao com mais de uma instancia o limite passa a ser por
     * instancia. Corrigir exigiria store compartilhado, que nao se justifica
     * nesta escala.
     */
    ThrottlerModule.forRoot({
      throttlers: [{ name: 'default', ttl: 60_000, limit: 300 }],
    }),

    PrismaModule,
    HealthModule,
    AuthModule,
    AuditModule,
    UsersModule,
    CategoriesModule,
    SuppliersModule,
    ProductsModule,
    StockMovementsModule,
  ],
  providers: [
    /**
     * Registrado como provider e nao por `app.useGlobalFilters()` para que o
     * filtro participe da injecao de dependencia e receba o logger. Um filtro
     * instanciado a mao nao teria acesso ao container.
     */
    { provide: APP_FILTER, useClass: AllExceptionsFilter },

    /**
     * ORDEM IMPORTANTE.
     *
     * Os guards rodam na ordem em que sao declarados. O `JwtAuthGuard` precisa
     * vir antes do `RolesGuard`, porque e ele que popula `request.user`: sem
     * isso o segundo nao teria papel nenhum para verificar e negaria tudo.
     *
     * O padrao e NEGAR. Toda rota nova nasce protegida, e abrir exige
     * `@Public()` explicito (docs/08-seguranca.md secao 8.3).
     */
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_GUARD, useClass: AppThrottlerGuard },

    /**
     * Auditoria antes da serializacao: o interceptor precisa ver o resultado
     * do handler como ele saiu do service, nao a versao ja filtrada.
     */
    { provide: APP_INTERCEPTOR, useClass: AuditInterceptor },

    /**
     * Segunda camada de protecao do `passwordHash`.
     *
     * A primeira e a omissao global na configuracao do cliente Prisma, que
     * impede o campo de sair do banco. Esta aqui garante que `@Exclude()` nas
     * entidades seja respeitado na serializacao.
     */
    {
      provide: APP_INTERCEPTOR,
      useFactory: (reflector: Reflector) => new ClassSerializerInterceptor(reflector),
      inject: [Reflector],
    },

    /**
     * Converte `Decimal` em string. REGISTRADO POR ÚLTIMO, de propósito.
     *
     * Interceptors rodam na ordem de registro na ida e na ordem INVERSA na
     * volta. Registrado antes do serializador, este rodaria depois dele, e aí
     * já seria tarde: o `ClassSerializerInterceptor` transforma a instância de
     * `Decimal` em objeto simples, e a conversão deixaria de reconhecê-la.
     *
     * Foi exatamente o que aconteceu na primeira tentativa, e a API devolvia
     * `{"s":1,"e":1,"d":[10]}` no lugar de `"10.000"`.
     */
    { provide: APP_INTERCEPTOR, useClass: DecimalSerializerInterceptor },
  ],
})
export class AppModule {}
