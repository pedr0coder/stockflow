import { QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Tooltip } from 'radix-ui';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppShell } from '@/app/layouts/AppShell';
import { AuthProvider } from '@/features/auth/auth-provider';
import { ProtectedRoute } from '@/features/auth/ProtectedRoute';
import { RoleGuard } from '@/features/auth/RoleGuard';
import { LoginPage } from '@/features/auth/pages/LoginPage';
import { DashboardPage } from '@/features/dashboard/pages/DashboardPage';
import { endDemoSession, startDemoSession } from '@/features/demo/demo-sandbox';
import { useCreateProductMutation } from '@/features/products/queries';
import { useCreateInMovementMutation } from '@/features/stock-movements/queries';
import { clearAccessToken, getAccessToken } from '@/lib/api-client';
import { createTestQueryClient, renderWithProviders } from '@/test/render';

function DemoActionButtons() {
  const createProductMutation = useCreateProductMutation();
  const createMovementMutation = useCreateInMovementMutation();

  return (
    <div data-testid="demo-actions">
      <button
        type="button"
        onClick={() => {
          createProductMutation.mutate({
            name: 'Produto Reativo Teste',
            sku: 'PRD-REACT-01',
            unit: 'UN',
            minStock: '5.000',
            unitCost: '12.0000',
            categoryId: 'cat-demo-01',
          });
        }}
      >
        Disparar Cadastro de Produto
      </button>
      <button
        type="button"
        onClick={() => {
          createMovementMutation.mutate({
            productId: 'prd-demo-01',
            quantity: '7.000',
            reason: 'PURCHASE',
          });
        }}
      >
        Disparar Movimentação de Entrada
      </button>
    </div>
  );
}

function renderDemoApp(initialEntry = '/login', queryClient = createTestQueryClient()) {
  return render(
    <QueryClientProvider client={queryClient}>
      <Tooltip.Provider delayDuration={0}>
        <AuthProvider>
          <MemoryRouter initialEntries={[initialEntry]}>
            <Routes>
              <Route path="/login" element={<LoginPage />} />
              <Route element={<ProtectedRoute />}>
                <Route path="/" element={<AppShell />}>
                  <Route
                    path="dashboard"
                    element={
                      <>
                        <DemoActionButtons />
                        <DashboardPage />
                      </>
                    }
                  />
                  <Route element={<RoleGuard roles={['ADMIN', 'MANAGER']} />}>
                    <Route path="users" element={<p>Página Restrita de Usuários</p>} />
                  </Route>
                </Route>
              </Route>
            </Routes>
          </MemoryRouter>
        </AuthProvider>
      </Tooltip.Provider>
    </QueryClientProvider>,
  );
}

describe('Fluxo de Interface do Modo Demonstração (Fase 9)', () => {
  beforeEach(() => {
    endDemoSession();
    clearAccessToken();
    sessionStorage.clear();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ code: 'UNAUTHORIZED' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    );
  });

  afterEach(() => {
    endDemoSession();
    clearAccessToken();
    sessionStorage.clear();
    vi.unstubAllGlobals();
  });

  it('abre o modal na tela de login, valida o nome do visitante e entra no Dashboard com identificações visuais obrigatórias', async () => {
    const user = userEvent.setup();
    renderDemoApp('/login');

    // Aguarda boot inicial terminar
    const demoBtn = await screen.findByRole('button', { name: 'Entrar sem login (Demo)' });
    await user.click(demoBtn);

    // Verifica texto explicativo obrigatório do modal
    expect(
      screen.getByText(
        /Você poderá explorar o StockFlow, cadastrar, editar e movimentar itens em uma demonstração interativa\. Todas as alterações serão temporárias e visíveis apenas para você\. Nenhum dado original será modificado\./i,
      ),
    ).toBeInTheDocument();

    // Tenta submeter vazio -> exibe erro de validação
    await user.click(screen.getByRole('button', { name: /iniciar demonstração/i }));
    expect(
      await screen.findByText('Informe seu nome ou apelido para continuar.'),
    ).toBeInTheDocument();

    // Tenta submeter com 1 caractere -> exibe erro de comprimento mínimo
    const input = screen.getByLabelText(/como podemos identificar você/i);
    expect(input).toHaveAttribute('placeholder', 'Nome');
    await user.type(input, 'A');
    await user.click(screen.getByRole('button', { name: /iniciar demonstração/i }));
    expect(
      await screen.findByText('O nome ou apelido deve ter pelo menos 2 caracteres.'),
    ).toBeInTheDocument();

    // Informa nome válido "Ana" e confirma
    await user.clear(input);
    await user.type(input, 'Ana');
    await user.click(screen.getByRole('button', { name: /iniciar demonstração/i }));

    // Abre o Dashboard
    expect(await screen.findByRole('heading', { level: 1, name: 'Dashboard' })).toBeInTheDocument();

    // Badge "Modo demonstração" na sidebar e identificação "Ana (Modo visitante)"
    expect(screen.getByText('Modo demonstração')).toBeInTheDocument();
    expect(screen.getByText('Ana (Modo visitante)')).toBeInTheDocument();

    // Nenhum token real emitido
    expect(getAccessToken()).toBeNull();

    // Grupo Administração (Usuários / Auditoria) oculto na sidebar durante a demonstração
    expect(screen.queryByRole('link', { name: /usuários/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /auditoria/i })).not.toBeInTheDocument();
  });

  it('atualiza o dashboard reativamente ao cadastrar produto e fazer movimentação, e restaura completamente sem recarregar a página', async () => {
    const user = userEvent.setup();
    startDemoSession('Mariana');

    renderDemoApp('/dashboard');

    // 1. Dashboard inicial: 10 produtos ativos e 15 movimentações
    expect(await screen.findByRole('heading', { level: 1, name: 'Dashboard' })).toBeInTheDocument();
    expect(await screen.findByText('10')).toBeInTheDocument();
    expect(screen.getByText('15')).toBeInTheDocument();

    // 2. Cadastrar produto -> Dashboard atualiza para 11 sem reload
    await user.click(screen.getByRole('button', { name: 'Disparar Cadastro de Produto' }));
    expect(await screen.findByText('11')).toBeInTheDocument();

    // 3. Registrar movimentação -> Dashboard atualiza para 16 e lista recente recebe o item
    await user.click(screen.getByRole('button', { name: 'Disparar Movimentação de Entrada' }));
    expect(await screen.findByText('16')).toBeInTheDocument();
    expect(await screen.findByText('7,000')).toBeInTheDocument();

    // 4. Restaurar demonstração -> recupera imediatamente produtos e movimentações iniciais sem reload
    await user.click(screen.getByRole('button', { name: /restaurar demonstração/i }));

    // Indicadores recuperam os valores originais
    expect(await screen.findByText('10')).toBeInTheDocument();
    expect(await screen.findByText('15')).toBeInTheDocument();

    // Movimentação simulada temporária foi removida do histórico recente
    expect(screen.queryByText('7,000')).not.toBeInTheDocument();
  });

  it('permite sair da demonstração limpando a sessão temporária e voltando ao login', async () => {
    const user = userEvent.setup();
    renderDemoApp('/login');

    await user.click(await screen.findByRole('button', { name: 'Entrar sem login (Demo)' }));
    await user.type(screen.getByLabelText(/como podemos identificar você/i), 'Bruno');
    await user.click(screen.getByRole('button', { name: /iniciar demonstração/i }));

    expect(await screen.findByText('Bruno (Modo visitante)')).toBeInTheDocument();

    // Clica em "Sair da demonstração"
    await user.click(screen.getByRole('button', { name: /sair da demonstração/i }));

    // Volta para a tela de login
    expect(await screen.findByRole('heading', { level: 1, name: 'Entrar' })).toBeInTheDocument();
  });

  it('bloqueia navegação direta para /users com ForbiddenPage quando em modo demonstração', async () => {
    startDemoSession('Carla');

    renderDemoApp('/users');
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Acesso não permitido' }),
    ).toBeInTheDocument();
    expect(screen.queryByText('Página Restrita de Usuários')).not.toBeInTheDocument();
  });

  it('não exibe badge Modo demonstração nem (Modo visitante) em contas autenticadas reais', () => {
    renderWithProviders(<AppShell />, {
      route: '/dashboard',
      user: {
        id: 'u-real-1',
        name: 'Fernanda Lima',
        email: 'fernanda@stockflow.local',
        role: 'MANAGER',
      },
    });

    expect(screen.getByText('Fernanda Lima')).toBeInTheDocument();
    expect(screen.queryByText('Modo demonstração')).not.toBeInTheDocument();
    expect(screen.queryByText(/Modo visitante/i)).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /restaurar demonstração/i }),
    ).not.toBeInTheDocument();
  });
});
