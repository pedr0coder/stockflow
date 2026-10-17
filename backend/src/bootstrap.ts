import { HttpStatus, INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Request, Response } from 'express';
import helmet from 'helmet';
import { v7 as uuidv7 } from 'uuid';
import { ApiErrorResponse, ErrorCode } from './common/errors/error-codes';
import { EnvironmentVariables, parseCorsOrigins } from './config/env.validation';

/** Prefixo de toda a API. Ver docs/02-arquitetura.md §2.7. */
export const API_PREFIX = 'api/v1';
export const DOCS_PATH = 'api/docs';

/**
 * Configuração da aplicação, compartilhada entre produção e teste.
 *
 * Esta função existe para resolver um problema concreto: se o `main.ts`
 * registrasse Helmet, CORS, prefixo e ValidationPipe por conta própria, o teste
 * de integração montaria uma app **diferente** da que roda em produção. Um
 * `forbidNonWhitelisted` esquecido no teste faria a suíte aprovar um endpoint
 * que, em produção, rejeita a requisição — e o contrário também.
 *
 * Com a configuração em um só lugar, o teste de integração exercita o que o
 * cliente real recebe.
 */
export function configureApp(app: NestExpressApplication): INestApplication {
  const config = app.get(ConfigService<EnvironmentVariables, true>);

  // Não anunciar o stack (docs/08-seguranca.md §8.6).
  app.getHttpAdapter().getInstance().disable('x-powered-by');

  app.use(
    helmet({
      /**
       * A API responde JSON, então a CSP importa para uma única página: a do
       * Swagger UI, servida a partir daqui. O Swagger UI injeta estilo inline,
       * por isso `styleSrc` recebe `'unsafe-inline'`.
       *
       * O risco é aceitável nesse caso específico porque a página não renderiza
       * conteúdo vindo do usuário, então não há onde injetar. Em `scriptSrc`
       * `'unsafe-inline'` NÃO é concedido.
       */
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:'],
          connectSrc: ["'self'"],
          fontSrc: ["'self'", 'data:'],
          objectSrc: ["'none'"],
          frameAncestors: ["'none'"],
          baseUri: ["'self'"],
          formAction: ["'self'"],
        },
      },
      crossOriginEmbedderPolicy: false,
    }),
  );

  /**
   * CORS com allowlist explícita e `credentials: true`, porque o refresh token
   * trafega em cookie (ADR-0005). `origin: '*'` é incompatível com cookie de
   * credencial e abriria a API para qualquer site; a validação de ambiente
   * recusa `*` justamente para que isso não entre por configuração.
   */
  app.enableCors({
    origin: parseCorsOrigins(config.get('CORS_ORIGINS', { infer: true })),
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id'],
    exposedHeaders: ['X-Request-Id'],
    maxAge: 86_400,
  });

  /**
   * A versão vive no prefixo (`/api/v1`), e não no `enableVersioning` do Nest.
   *
   * O versionamento por URI do Nest serve para manter v1 e v2 no mesmo processo,
   * decidindo por rota qual atende. Não há v2, e enquanto não houver isso só
   * acrescentaria um `@Version()` em todo controller sem mudar a URL final.
   */
  app.setGlobalPrefix(API_PREFIX);

  app.useGlobalPipes(
    new ValidationPipe({
      /**
       * `whitelist` remove campo não declarado no DTO e `forbidNonWhitelisted`
       * **rejeita** a requisição em vez de ignorar em silêncio. É o que impede
       * mass assignment: enviar `role: ADMIN` num cadastro, ou `currentStock`
       * num PATCH de produto, retorna 400 em vez de ser descartado sem aviso
       * (docs/08-seguranca.md §8.4).
       */
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
    }),
  );

  return app;
}

/**
 * Handler de rota não encontrada, para caminhos **fora** do roteador do Nest.
 *
 * Por que isto existe: o `AllExceptionsFilter` só vê exceção que passou pelo
 * roteador do Nest. Uma requisição a um caminho fora do prefixo (`GET /health`
 * em vez de `GET /api/v1/health`) nunca chega lá e cai no handler padrão do
 * Express, que responde **HTML** com `Cannot GET /health`. Sem isto, a promessa
 * de "uma só forma de erro em toda a API" (docs/02-arquitetura.md §2.6) seria
 * falsa justamente no erro mais comum de quem está integrando: errar a URL.
 *
 * Precisa ser registrado **depois** de `app.init()`, porque é a ordem de
 * registro no Express que decide quem responde: antes das rotas, ele
 * interceptaria tudo.
 */
export function applyNotFoundHandler(app: NestExpressApplication): void {
  app.use((req: Request & { id?: string }, res: Response) => {
    const body: ApiErrorResponse = {
      statusCode: HttpStatus.NOT_FOUND,
      code: ErrorCode.NOT_FOUND,
      message: 'Recurso não encontrado.',
      timestamp: new Date().toISOString(),
      path: req.originalUrl ?? req.url,
      requestId: req.id ?? uuidv7(),
    };

    res.status(HttpStatus.NOT_FOUND).json(body);
  });
}

/**
 * Monta o Swagger a partir dos DTOs, então a documentação não desatualiza em
 * relação ao código.
 *
 * Separado de `configureApp` porque o teste de integração não precisa gerar
 * OpenAPI em cada execução: é trabalho sem retorno para a suíte. O conteúdo do
 * documento é verificado por um caso próprio, que chama esta função.
 */
export function setupSwagger(app: NestExpressApplication): void {
  const document = SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle('StockFlow API')
      .setDescription(
        'Gerenciamento de estoque com histórico imutável de movimentações.\n\n' +
          'Decimais trafegam como **string** no JSON para não perder precisão. ' +
          'Erros seguem um contrato único, com `code` estável para o cliente decidir a UI.',
      )
      .setVersion('0.1.0')
      .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }, 'access-token')
      .build(),
  );

  SwaggerModule.setup(DOCS_PATH, app, document, {
    swaggerOptions: { persistAuthorization: true, tagsSorter: 'alpha', operationsSorter: 'alpha' },
    customSiteTitle: 'StockFlow API',
  });
}
