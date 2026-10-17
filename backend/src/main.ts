import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import {
  API_PREFIX,
  DOCS_PATH,
  applyNotFoundHandler,
  configureApp,
  setupSwagger,
} from './bootstrap';
import { EnvironmentVariables } from './config/env.validation';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    /**
     * Guarda os logs do boot até o logger do Pino estar pronto. Sem isto, as
     * primeiras linhas sairiam no formato padrão do Nest e as seguintes em
     * JSON, o que quebra o parse do agregador de log.
     */
    bufferLogs: true,
  });

  app.useLogger(app.get(Logger));

  // Mesma configuração que o teste de integração aplica. Ver src/bootstrap.ts.
  configureApp(app);

  /**
   * Swagger fica disponível em todos os ambientes de propósito: este é um
   * projeto de portfólio e a API navegável é parte do que se quer mostrar.
   *
   * Trade-off assumido: expõe a superfície completa da API. Aceitável porque
   * toda rota de negócio exige autenticação e autorização verificadas no
   * servidor, e porque conhecer os endpoints não é o que protege um sistema.
   */
  setupSwagger(app);

  /**
   * `init()` explícito antes do handler de 404.
   *
   * `listen()` chamaria `init()` por dentro, e aí o middleware entraria antes
   * das rotas e interceptaria tudo. A ordem de registro no Express é o que
   * decide quem responde. Ver `applyNotFoundHandler`.
   */
  await app.init();
  applyNotFoundHandler(app);

  const port = app.get(ConfigService<EnvironmentVariables, true>).get('PORT', { infer: true });

  // '0.0.0.0' e não o padrão: dentro de um container, escutar apenas em
  // localhost torna a porta inalcançável do host mesmo com -p publicado.
  await app.listen(port, '0.0.0.0');

  app
    .get(Logger)
    .log(`API em http://localhost:${port}/${API_PREFIX} · docs em /${DOCS_PATH}`, 'Bootstrap');
}

void bootstrap();
