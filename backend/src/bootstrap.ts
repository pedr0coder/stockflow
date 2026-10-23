import { BadRequestException, HttpStatus, INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule, type OpenAPIObject } from '@nestjs/swagger';
import type { ValidationError } from 'class-validator';
import { Request, Response } from 'express';
import cookieParser from 'cookie-parser';
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

  /**
   * Leitura de cookie.
   *
   * O Express escreve cookie de forma nativa, mas nao popula `req.cookies`
   * sem este middleware. O refresh token vive em cookie httpOnly (ADR-0005),
   * entao sem isto o endpoint de refresh nao teria como le-lo.
   */
  app.use(cookieParser());

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
      exceptionFactory: validationExceptionFactory,
    }),
  );

  return app;
}

/**
 * Erro de validação com os campos NOMEADOS.
 *
 * ┌────────────────────────────────────────────────────────────────────────┐
 * │ O padrão do Nest devolve um array de frases:                           │
 * │                                                                        │
 * │   "details": { "fields": ["O nome deve ter no mínimo 2 caracteres."] } │
 * │                                                                        │
 * │ A chave se chama `fields` e não traz campo nenhum. Um formulário não    │
 * │ tem como saber em qual input pintar o erro, e sobraria casar a frase    │
 * │ por texto — que quebra na primeira vez que alguém reescrever a          │
 * │ mensagem. Com erro em dois campos, o cliente recebe duas frases e       │
 * │ nenhuma indicação de ordem.                                            │
 * │                                                                        │
 * │ Aqui o formato passa a ser objeto indexado pelo nome do campo:          │
 * │                                                                        │
 * │   "details": { "fields": { "name": ["O nome deve ter..."] } }           │
 * │                                                                        │
 * │ A mensagem legível continua vindo em `message`, no texto padrão do      │
 * │ status. Aninhamento (`endereco.cep`) sai com o caminho completo,        │
 * │ porque é como o cliente identifica o input.                            │
 * └────────────────────────────────────────────────────────────────────────┘
 */
export function validationExceptionFactory(errors: ValidationError[]): BadRequestException {
  return new BadRequestException({ fields: flattenValidationErrors(errors) });
}

function flattenValidationErrors(errors: ValidationError[], prefix = ''): Record<string, string[]> {
  const fields: Record<string, string[]> = {};

  for (const error of errors) {
    const path = prefix === '' ? error.property : `${prefix}.${error.property}`;
    const messages = Object.values(error.constraints ?? {});

    if (messages.length > 0) {
      fields[path] = messages;
    }

    if (error.children !== undefined && error.children.length > 0) {
      Object.assign(fields, flattenValidationErrors(error.children, path));
    }
  }

  return fields;
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
 * Documento OpenAPI gerado a partir dos DTOs e dos decorators das rotas.
 *
 * Separado de `setupSwagger` para que o teste de contrato possa conferir o
 * documento sem montar a página do Swagger UI. É este documento que
 * `contract.int-spec.ts` compara com a superfície de rotas aprovada: se
 * alguém adicionar, remover ou renomear uma rota, o teste aponta a diferença
 * antes de o cliente descobrir.
 */
export function buildOpenApiDocument(app: NestExpressApplication): OpenAPIObject {
  return SwaggerModule.createDocument(
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
}

/**
 * Monta a página do Swagger a partir do documento acima, então a documentação
 * não desatualiza em relação ao código.
 *
 * Separado de `configureApp` porque a suíte de integração não precisa gerar
 * OpenAPI em cada arquivo: é trabalho sem retorno.
 */
export function setupSwagger(app: NestExpressApplication): void {
  SwaggerModule.setup(DOCS_PATH, app, buildOpenApiDocument(app), {
    swaggerOptions: { persistAuthorization: true, tagsSorter: 'alpha', operationsSorter: 'alpha' },
    customSiteTitle: 'StockFlow API',
  });
}
