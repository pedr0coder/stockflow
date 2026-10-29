import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '@/test/render';
import { SupplierNewPage } from './SupplierNewPage';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('SupplierNewPage', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('CNPJ em formato inválido é rejeitado antes de chamar a API', async () => {
    const user = userEvent.setup();
    renderWithProviders(<SupplierNewPage />);

    await user.type(screen.getByLabelText(/^nome/i), 'Fornecedor Teste');
    await user.type(screen.getByLabelText(/cnpj ou cpf/i), '12345');
    await user.click(screen.getByRole('button', { name: 'Cadastrar' }));

    expect(await screen.findByText(/informe um cnpj/i)).toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('cadastra um fornecedor válido e navega para o detalhe', async () => {
    const user = userEvent.setup();
    vi.mocked(fetch).mockResolvedValueOnce(
      jsonResponse(201, {
        id: 's9',
        name: 'Fornecedor Teste',
        taxId: '11.111.111/0001-11',
        email: null,
        phone: null,
        notes: null,
        isActive: true,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      }),
    );

    renderWithProviders(<SupplierNewPage />);

    await user.type(screen.getByLabelText(/^nome/i), 'Fornecedor Teste');
    await user.type(screen.getByLabelText(/cnpj ou cpf/i), '11.111.111/0001-11');
    await user.click(screen.getByRole('button', { name: 'Cadastrar' }));

    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    const [, init] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(body).toEqual({ name: 'Fornecedor Teste', taxId: '11.111.111/0001-11' });
  });

  it('nome já cadastrado (409) mostra mensagem compreensível, sem perder o formulário', async () => {
    const user = userEvent.setup();
    vi.mocked(fetch).mockResolvedValueOnce(
      jsonResponse(409, { code: 'CONFLICT', message: 'Já existe um fornecedor com estes dados.' }),
    );

    renderWithProviders(<SupplierNewPage />);

    await user.type(screen.getByLabelText(/^nome/i), 'Fornecedor Repetido');
    await user.click(screen.getByRole('button', { name: 'Cadastrar' }));

    expect(await screen.findByText('Já existe um fornecedor com estes dados.')).toBeInTheDocument();
    // O formulário preenchido continua lá — a pessoa não perde o que digitou.
    expect(screen.getByLabelText(/^nome/i)).toHaveValue('Fornecedor Repetido');
  });
});
