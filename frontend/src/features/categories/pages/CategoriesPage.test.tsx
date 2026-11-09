import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '@/test/render';
import { CategoriesPage } from './CategoriesPage';

/**
 * Mock manual de `fetch`, no limite de rede (docs/18-plano-fase-6.md
 * §18.13/§18.16) — a mesma estratégia do Marco 6A, estendida aos domínios de
 * cadastro. Nunca mocka `features/categories/api.ts` diretamente: o que estes
 * testes exercitam é a tela de verdade, com o cliente HTTP de verdade por
 * baixo, só a rede é trocada.
 */
function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function page(data: unknown[], overrides: Partial<{ total: number }> = {}) {
  const total = overrides.total ?? data.length;

  return {
    data,
    meta: {
      page: 1,
      limit: 20,
      total,
      totalPages: Math.max(1, Math.ceil(total / 20)),
      hasNext: false,
      hasPrev: false,
    },
  };
}

const CATEGORIA_FERRAMENTAS = {
  id: 'c1',
  name: 'Ferramentas',
  description: 'Ferramentas manuais e elétricas.',
  isActive: true,
  createdAt: '2026-01-10T00:00:00.000Z',
  updatedAt: '2026-01-10T00:00:00.000Z',
};

/**
 * Em jsdom, tabela (`hidden sm:block`) e lista de cards (`sm:hidden`) coexistem
 * no DOM (M7C-4). Asserções da tabela ficam escopadas a `findTable()`, como em
 * `ProductsPage.test.tsx` e `SuppliersPage.test.tsx`.
 */
async function findTable() {
  return within(await screen.findByRole('table', { name: 'Lista de categorias' }));
}

describe('CategoriesPage', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('listagem', () => {
    it('mostra as categorias reais vindas da API na tabela e nos cards mobile', async () => {
      vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(200, page([CATEGORIA_FERRAMENTAS])));

      renderWithProviders(<CategoriesPage />);

      const table = await findTable();
      expect(table.getByText('Ferramentas')).toBeInTheDocument();
      expect(table.getByText('Ferramentas manuais e elétricas.')).toBeInTheDocument();

      const cards = within(screen.getByRole('list'));
      expect(cards.getByText('Ferramentas')).toBeInTheDocument();
      expect(cards.getByRole('button', { name: /editar ferramentas/i })).toBeInTheDocument();
      expect(cards.getByRole('button', { name: /inativar/i })).toBeInTheDocument();
    });

    it('estado vazio quando não há categoria cadastrada', async () => {
      vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(200, page([])));

      renderWithProviders(<CategoriesPage />);

      expect(await screen.findByText('Nenhuma categoria cadastrada')).toBeInTheDocument();
    });

    it('estado de erro, com nova tentativa', async () => {
      const user = userEvent.setup();
      vi.mocked(fetch)
        .mockResolvedValueOnce(jsonResponse(500, { code: 'INTERNAL_ERROR' }))
        .mockResolvedValueOnce(jsonResponse(200, page([CATEGORIA_FERRAMENTAS])));

      renderWithProviders(<CategoriesPage />);

      expect(await screen.findByText(/erro inesperado/i)).toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: /tentar novamente/i }));

      const table = await findTable();
      expect(table.getByText('Ferramentas')).toBeInTheDocument();
    });

    it('trocar o filtro de situação refaz a busca com o parâmetro certo', async () => {
      const user = userEvent.setup();
      vi.mocked(fetch)
        .mockResolvedValueOnce(jsonResponse(200, page([CATEGORIA_FERRAMENTAS])))
        .mockResolvedValueOnce(jsonResponse(200, page([])));

      renderWithProviders(<CategoriesPage />);
      await findTable();

      await user.click(screen.getByRole('combobox'));
      await user.click(await screen.findByRole('option', { name: 'Todas' }));

      await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
      const secondCall = vi.mocked(fetch).mock.calls[1]?.[0] as string;
      expect(secondCall).not.toContain('isActive');
    });
  });

  describe('criação', () => {
    it('cadastra uma categoria nova e atualiza a lista', async () => {
      const user = userEvent.setup();
      vi.mocked(fetch)
        .mockResolvedValueOnce(jsonResponse(200, page([])))
        .mockResolvedValueOnce(jsonResponse(201, CATEGORIA_FERRAMENTAS))
        .mockResolvedValueOnce(jsonResponse(200, page([CATEGORIA_FERRAMENTAS])));

      renderWithProviders(<CategoriesPage />);
      await screen.findByText('Nenhuma categoria cadastrada');

      await user.click(screen.getByRole('button', { name: /nova categoria/i }));
      await user.type(screen.getByLabelText(/^nome/i), 'Ferramentas');
      await user.click(screen.getByRole('button', { name: 'Salvar' }));

      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
      const table = await findTable();
      expect(table.getByText('Ferramentas')).toBeInTheDocument();
    });

    it('nome muito curto é rejeitado antes de chamar a API', async () => {
      const user = userEvent.setup();
      vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(200, page([])));

      renderWithProviders(<CategoriesPage />);
      await screen.findByText('Nenhuma categoria cadastrada');

      await user.click(screen.getByRole('button', { name: /nova categoria/i }));
      await user.type(screen.getByLabelText(/^nome/i), 'A');
      await user.click(screen.getByRole('button', { name: 'Salvar' }));

      expect(await screen.findByText(/pelo menos 2 caracteres/i)).toBeInTheDocument();
      expect(fetch).toHaveBeenCalledTimes(1);
    });
  });

  describe('inativação', () => {
    it('categoria com produto vinculado: CATEGORY_HAS_PRODUCTS vira mensagem compreensível', async () => {
      const user = userEvent.setup();
      vi.mocked(fetch)
        .mockResolvedValueOnce(jsonResponse(200, page([CATEGORIA_FERRAMENTAS])))
        .mockResolvedValueOnce(
          jsonResponse(409, {
            code: 'CATEGORY_HAS_PRODUCTS',
            message: 'Categoria possui produtos ativos vinculados.',
          }),
        );

      renderWithProviders(<CategoriesPage />);
      const table = await findTable();

      await user.click(table.getByRole('button', { name: /inativar/i }));
      await user.click(screen.getByRole('button', { name: 'Confirmar' }));

      expect(
        await screen.findByText('Categoria possui produtos ativos vinculados.'),
      ).toBeInTheDocument();
      // A categoria continua ativa na tela: a mutação falhou, a lista não foi
      // reescrita como se tivesse funcionado.
      expect(table.getByRole('button', { name: /inativar/i })).toBeInTheDocument();
    });
  });

  describe('RBAC', () => {
    it('OPERATOR não vê ações de criar, editar ou inativar', async () => {
      vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(200, page([CATEGORIA_FERRAMENTAS])));

      renderWithProviders(<CategoriesPage />, {
        user: { id: 'u2', name: 'Op', email: 'op@x.com', role: 'OPERATOR' },
      });
      await findTable();

      expect(screen.queryByRole('button', { name: /nova categoria/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /inativar/i })).not.toBeInTheDocument();
    });
  });

  describe('acessibilidade por teclado', () => {
    it('restaura o foco ao botão "Nova categoria" ao fechar o diálogo com Escape', async () => {
      vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(200, page([CATEGORIA_FERRAMENTAS])));
      const user = userEvent.setup();

      renderWithProviders(<CategoriesPage />);
      await findTable();

      const trigger = screen.getByRole('button', { name: /nova categoria/i });
      trigger.focus();
      expect(trigger).toHaveFocus();

      await user.keyboard('{Enter}');
      expect(await screen.findByRole('dialog')).toBeInTheDocument();

      await user.keyboard('{Escape}');
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(trigger).toHaveFocus();
    });
  });
});
