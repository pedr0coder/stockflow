import { HttpStatus } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { isDomainError } from './domain.error';
import { ErrorCode } from './error-codes';
import {
  CategoryNotFoundError,
  ProductNotFoundError,
  ResourceNotFoundError,
  SupplierNotFoundError,
  UserNotFoundError,
} from './not-found.errors';

/**
 * A tabela é o contrato público dos 404 de recurso: código HTTP, `code` e
 * mensagem que o cliente recebia quando os services lançavam
 * `NotFoundException('...')`. Trocar a classe de erro não pode mudar nenhum dos
 * três, e este é o teste que quebra se mudar.
 */
const CASES = [
  {
    nome: 'CategoryNotFoundError',
    criar: () => new CategoryNotFoundError(),
    mensagem: 'Categoria não encontrada.',
  },
  {
    nome: 'ProductNotFoundError',
    criar: () => new ProductNotFoundError(),
    mensagem: 'Produto não encontrado.',
  },
  {
    nome: 'SupplierNotFoundError',
    criar: () => new SupplierNotFoundError(),
    mensagem: 'Fornecedor não encontrado.',
  },
  {
    nome: 'UserNotFoundError',
    criar: () => new UserNotFoundError(),
    mensagem: 'Usuário não encontrado.',
  },
] as const;

describe('erros de recurso inexistente', () => {
  it.each(CASES)('$nome preserva status, code e mensagem do contrato', ({ criar, mensagem }) => {
    const erro = criar();

    expect(erro.httpStatus).toBe(HttpStatus.NOT_FOUND);
    expect(erro.code).toBe(ErrorCode.NOT_FOUND);
    expect(erro.message).toBe(mensagem);
  });

  it.each(CASES)('$nome é DomainError e não carrega details', ({ criar }) => {
    const erro = criar();

    // O campo existe na classe-base com valor `undefined`, então `'details' in
    // erro` seria verdadeiro e não diz nada. O que importa é o valor: o filtro
    // só copia `details` para a resposta quando ele não é `undefined`, e a
    // ausência da chave na resposta é verificada no teste do filtro e na
    // integração.
    expect(isDomainError(erro)).toBe(true);
    expect(erro).toBeInstanceOf(ResourceNotFoundError);
    expect(erro.details).toBeUndefined();
  });

  it.each(CASES)('$nome tem o nome da própria classe, para o log', ({ criar, nome }) => {
    expect(criar().name).toBe(nome);
  });
});
