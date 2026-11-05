import {
  ArgumentsHost,
  BadRequestException,
  HttpException,
  HttpStatus,
  NotFoundException,
} from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DomainError } from '../errors/domain.error';
import { ApiErrorResponse, ErrorCode } from '../errors/error-codes';
import {
  CategoryNotFoundError,
  ProductNotFoundError,
  SupplierNotFoundError,
  UserNotFoundError,
} from '../errors/not-found.errors';
import { InvalidSortColumnError } from '../utils/pagination';
import { AllExceptionsFilter } from './all-exceptions.filter';

/** Erro de negócio concreto, só para o teste. */
class InsufficientStockErrorFake extends DomainError {
  override readonly code = ErrorCode.INSUFFICIENT_STOCK;
  override readonly httpStatus = HttpStatus.CONFLICT;

  constructor(available: string, requested: string) {
    super('Estoque insuficiente para a saída solicitada.', { available, requested });
  }
}

interface Captured {
  status: number;
  body: ApiErrorResponse;
}

function makeHost(options: { url?: string; id?: string } = {}): {
  host: ArgumentsHost;
  captured: Captured;
} {
  const captured = { status: 0, body: {} as ApiErrorResponse };

  const response = {
    status(code: number) {
      captured.status = code;
      return this;
    },
    json(payload: ApiErrorResponse) {
      captured.body = payload;
      return this;
    },
  };

  const request = {
    originalUrl: options.url ?? '/api/v1/stock-movements/out',
    url: '/stock-movements/out',
    method: 'POST',
    id: options.id ?? '01a148b9-0000-7000-8000-000000000001',
  };

  const host = {
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => response,
    }),
  } as unknown as ArgumentsHost;

  return { host, captured };
}

describe('AllExceptionsFilter', () => {
  let filter: AllExceptionsFilter;
  let logger: {
    setContext: ReturnType<typeof vi.fn>;
    error: ReturnType<typeof vi.fn>;
    warn: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    logger = { setContext: vi.fn(), error: vi.fn(), warn: vi.fn() };
    // O filtro só usa setContext, error e warn do logger.
    filter = new AllExceptionsFilter(logger as never);
  });

  describe('erro de domínio', () => {
    it('usa o code, o status e os details do próprio erro', () => {
      const { host, captured } = makeHost();

      filter.catch(new InsufficientStockErrorFake('8.000', '12.500'), host);

      expect(captured.status).toBe(HttpStatus.CONFLICT);
      expect(captured.body.code).toBe(ErrorCode.INSUFFICIENT_STOCK);
      expect(captured.body.message).toBe('Estoque insuficiente para a saída solicitada.');
      expect(captured.body.details).toEqual({ available: '8.000', requested: '12.500' });
    });

    it('registra 4xx como warn, não como error: é comportamento esperado da API', () => {
      const { host } = makeHost();

      filter.catch(new InsufficientStockErrorFake('1.000', '2.000'), host);

      expect(logger.warn).toHaveBeenCalledOnce();
      expect(logger.error).not.toHaveBeenCalled();
    });
  });

  describe('erro inesperado', () => {
    it('responde 500 com mensagem genérica', () => {
      const { host, captured } = makeHost();

      filter.catch(new Error('conexão recusada em db:5432 para o usuário stockflow'), host);

      expect(captured.status).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
      expect(captured.body.code).toBe(ErrorCode.INTERNAL_ERROR);
      expect(captured.body.message).toBe('Erro interno. Tente novamente em alguns instantes.');
    });

    it('não vaza detalhe interno, stack nem nome de host na resposta', () => {
      const { host, captured } = makeHost();
      const leaky = new Error('relation "users" does not exist em db:5432');

      filter.catch(leaky, host);

      const serialized = JSON.stringify(captured.body);
      expect(serialized).not.toContain('users');
      expect(serialized).not.toContain('db:5432');
      expect(serialized).not.toContain('Error:');
      expect(captured.body).not.toHaveProperty('stack');
      expect(captured.body.details).toBeUndefined();
    });

    it('manda o erro completo para o log, onde ele é necessário', () => {
      const { host } = makeHost();
      const original = new Error('falha real');

      filter.catch(original, host);

      expect(logger.error).toHaveBeenCalledOnce();
      expect(logger.error.mock.calls[0]?.[0]).toMatchObject({ err: original });
    });

    it('trata valor lançado que não é Error', () => {
      const { host, captured } = makeHost();

      filter.catch('string solta', host);

      expect(captured.status).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
      expect(captured.body.code).toBe(ErrorCode.INTERNAL_ERROR);
    });
  });

  describe('erro de validação do ValidationPipe', () => {
    it('move o array de mensagens para details e usa uma frase única em message', () => {
      const { host, captured } = makeHost();
      const pipeError = new BadRequestException([
        'quantity must be a positive number',
        'reason must be a valid enum value',
      ]);

      filter.catch(pipeError, host);

      expect(captured.status).toBe(HttpStatus.BAD_REQUEST);
      expect(captured.body.code).toBe(ErrorCode.VALIDATION_ERROR);
      expect(captured.body.message).toBe('Dados inválidos. Verifique os campos informados.');
      expect(captured.body.details).toEqual({
        fields: ['quantity must be a positive number', 'reason must be a valid enum value'],
      });
    });

    it('usa a mensagem canônica do status quando uma HttpException traz string solta (allowlist S12)', () => {
      const { host, captured } = makeHost();

      filter.catch(new BadRequestException('Invalid byte sequence in middleware X'), host);

      expect(captured.status).toBe(HttpStatus.BAD_REQUEST);
      expect(captured.body.code).toBe(ErrorCode.VALIDATION_ERROR);
      expect(captured.body.message).toBe('Dados inválidos. Verifique os campos informados.');
      expect(captured.body.details).toBeUndefined();
    });

    it('preserva a mensagem de InvalidSortColumnError por ser DomainError legítimo', () => {
      const { host, captured } = makeHost();

      filter.catch(new InvalidSortColumnError('passwordHash', ['name', 'sku']), host);

      expect(captured.status).toBe(HttpStatus.BAD_REQUEST);
      expect(captured.body.code).toBe(ErrorCode.VALIDATION_ERROR);
      expect(captured.body.message).toBe(
        'Ordenação inválida: "passwordHash". Valores aceitos: name, sku.',
      );
    });
  });

  /**
   * Erro que não é `HttpException`, mas carrega status, pela convenção
   * `http-errors` que o `body-parser` segue.
   *
   * Antes destes casos, corpo acima do limite e JSON malformado caíam no 500
   * genérico: o cliente que esqueceu uma vírgula recebia "Erro interno. Tente
   * novamente", e cada erro de cliente entrava no alerta de 5xx.
   */
  describe('erro de middleware com status próprio', () => {
    it('aproveita o status 4xx de um Error comum', () => {
      const { host, captured } = makeHost();
      const tooLarge = Object.assign(new Error('request entity too large'), {
        status: HttpStatus.PAYLOAD_TOO_LARGE,
      });

      filter.catch(tooLarge, host);

      expect(captured.status).toBe(HttpStatus.PAYLOAD_TOO_LARGE);
      expect(captured.body.code).toBe(ErrorCode.PAYLOAD_TOO_LARGE);
      expect(captured.body.message).toBe('Corpo da requisição acima do limite aceito.');
    });

    it('aceita statusCode além de status', () => {
      const { host, captured } = makeHost();

      filter.catch(Object.assign(new Error('x'), { statusCode: 400 }), host);

      expect(captured.status).toBe(HttpStatus.BAD_REQUEST);
    });

    it('IGNORA status 5xx de origem desconhecida', () => {
      const { host, captured } = makeHost();

      filter.catch(Object.assign(new Error('falha interna detalhada'), { status: 503 }), host);

      // Se o erro é nosso, a mensagem não deve vazar o que aconteceu: cai no
      // 500 genérico, e o detalhe fica no log.
      expect(captured.status).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
      expect(captured.body.message).not.toContain('detalhada');
    });

    it('nunca usa a mensagem da biblioteca na resposta', () => {
      const { host, captured } = makeHost();
      const tooLarge = Object.assign(new Error('request entity too large'), { status: 413 });

      filter.catch(tooLarge, host);

      expect(captured.body.message).not.toContain('entity');
    });
  });

  /**
   * Mensagens escritas pelo framework não vão para o cliente.
   *
   * Os dois primeiros casos abaixo vazavam de verdade: o throttler respondia
   * com o nome da própria classe, e o corpo malformado citava a posição no
   * buffer.
   */
  describe('mensagem de framework', () => {
    it('substitui a do throttler, que traz o nome da classe', () => {
      const { host, captured } = makeHost();

      filter.catch(
        new HttpException('ThrottlerException: Too Many Requests', HttpStatus.TOO_MANY_REQUESTS),
        host,
      );

      expect(captured.body.message).toBe('Muitas tentativas. Aguarde alguns minutos.');
      expect(captured.body.code).toBe(ErrorCode.RATE_LIMIT_EXCEEDED);
    });

    it('substitui a do parser de JSON, que cita posição no buffer', () => {
      const { host, captured } = makeHost();

      filter.catch(
        new BadRequestException("Expected property name or '}' in JSON at position 1"),
        host,
      );

      expect(captured.body.message).toBe('Dados inválidos. Verifique os campos informados.');
    });

    it('substitui "Unexpected end of JSON input"', () => {
      const { host, captured } = makeHost();

      filter.catch(new BadRequestException('Unexpected end of JSON input'), host);

      expect(captured.body.message).not.toContain('JSON');
    });

    it('substitui qualquer HttpException de framework ou biblioteca (mesmo sem casar regex antiga)', () => {
      const { host, captured } = makeHost();

      filter.catch(
        new NotFoundException('Upstream adapter failed to resolve route /internal/debug'),
        host,
      );

      expect(captured.status).toBe(HttpStatus.NOT_FOUND);
      expect(captured.body.code).toBe(ErrorCode.NOT_FOUND);
      expect(captured.body.message).toBe('Recurso não encontrado.');
    });

    it('nunca vaza detalhes de HttpException 5xx', () => {
      const { host, captured } = makeHost();

      filter.catch(
        new HttpException(
          { message: 'Pool exhausted at postgres://stockflow@10.0.0.5:5432', fields: ['secret'] },
          HttpStatus.SERVICE_UNAVAILABLE,
        ),
        host,
      );

      expect(captured.status).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
      expect(captured.body.code).toBe(ErrorCode.INTERNAL_ERROR);
      expect(captured.body.message).toBe('Erro interno. Tente novamente em alguns instantes.');
      expect(captured.body.details).toBeUndefined();
    });
  });

  describe('erro de recurso inexistente (DomainError)', () => {
    it.each([
      new CategoryNotFoundError(),
      new ProductNotFoundError(),
      new SupplierNotFoundError(),
      new UserNotFoundError(),
    ])('$name responde 404 com a mensagem do projeto, sem details', (erro) => {
      const { host, captured } = makeHost({ url: '/api/v1/products/abc' });

      filter.catch(erro, host);

      expect(captured.status).toBe(HttpStatus.NOT_FOUND);
      expect(captured.body.statusCode).toBe(HttpStatus.NOT_FOUND);
      expect(captured.body.code).toBe(ErrorCode.NOT_FOUND);
      expect(captured.body.message).toBe(erro.message);
      expect('details' in captured.body).toBe(false);
    });

    it('é registrado como 4xx esperado, não como falha do servidor', () => {
      const { host } = makeHost();

      filter.catch(new ProductNotFoundError(), host);

      expect(logger.warn).toHaveBeenCalledTimes(1);
      expect(logger.error).not.toHaveBeenCalled();
    });
  });

  describe('erro de validação com campos nomeados', () => {
    it('repassa o objeto indexado pelo nome do campo', () => {
      const { host, captured } = makeHost();

      filter.catch(
        new BadRequestException({ fields: { name: ['O nome deve ter no mínimo 2 caracteres.'] } }),
        host,
      );

      expect(captured.body.details).toEqual({
        fields: { name: ['O nome deve ter no mínimo 2 caracteres.'] },
      });
      // A frase legível continua vindo do status, não do array de campos.
      expect(captured.body.message).toBe('Dados inválidos. Verifique os campos informados.');
    });
  });

  describe('rota inexistente', () => {
    it('substitui a mensagem do framework pelo texto em português', () => {
      const { host, captured } = makeHost({ url: '/api/v1/nao-existe' });

      filter.catch(new NotFoundException('Cannot GET /api/v1/nao-existe'), host);

      expect(captured.status).toBe(HttpStatus.NOT_FOUND);
      expect(captured.body.code).toBe(ErrorCode.NOT_FOUND);
      expect(captured.body.message).toBe('Recurso não encontrado.');
    });
  });

  describe('contrato da resposta', () => {
    it('traz sempre os campos do contrato único', () => {
      const { host, captured } = makeHost({ url: '/api/v1/products' });

      filter.catch(new NotFoundException(), host);

      expect(Object.keys(captured.body).sort()).toEqual(
        ['code', 'message', 'path', 'requestId', 'statusCode', 'timestamp'].sort(),
      );
    });

    it('usa originalUrl no path, para incluir o prefixo /api/v1', () => {
      const { host, captured } = makeHost({ url: '/api/v1/products/abc' });

      filter.catch(new NotFoundException(), host);

      expect(captured.body.path).toBe('/api/v1/products/abc');
    });

    it('propaga o requestId da requisição', () => {
      const id = '01a148b9-1111-7000-8000-000000000002';
      const { host, captured } = makeHost({ id });

      filter.catch(new Error('qualquer'), host);

      expect(captured.body.requestId).toBe(id);
    });

    it('gera um requestId quando a requisição não tem um', () => {
      const captured = { status: 0, body: {} as ApiErrorResponse };
      const host = {
        switchToHttp: () => ({
          getRequest: () => ({ originalUrl: '/api/v1/x', method: 'GET' }),
          getResponse: () => ({
            status(code: number) {
              captured.status = code;
              return this;
            },
            json(payload: ApiErrorResponse) {
              captured.body = payload;
              return this;
            },
          }),
        }),
      } as unknown as ArgumentsHost;

      filter.catch(new Error('sem id'), host);

      // Formato UUID com o dígito de versão 7 na posição esperada.
      expect(captured.body.requestId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
      );
    });

    it('timestamp é ISO 8601 válido', () => {
      const { host, captured } = makeHost();

      filter.catch(new Error('qualquer'), host);

      expect(new Date(captured.body.timestamp).toISOString()).toBe(captured.body.timestamp);
    });
  });
});
