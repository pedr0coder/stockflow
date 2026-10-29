import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Outlet, useLocation } from 'react-router';
import { Header } from '@/components/layout/Header';
import { Sidebar } from '@/components/layout/Sidebar';
import { useAuth } from '@/features/auth/auth-context';

/**
 * Casca da aplicação autenticada: faixa de aviso, sidebar, cabeçalho e área de
 * conteúdo.
 *
 * O estado de colapso vive aqui, e não dentro da `Sidebar`, porque o botão que
 * o controla está no `Header`. Mantê-lo no ancestral comum é o que faz o estado
 * sobreviver à navegação: o `AppShell` permanece montado enquanto só o
 * `Outlet` troca.
 */
export function AppShell(): ReactNode {
  const { user } = useAuth();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  const { pathname } = useLocation();
  const contentRef = useRef<HTMLElement>(null);

  /**
   * Volta ao topo a cada navegação.
   *
   * Quem rola o conteúdo é o `main`, não a janela, então o comportamento
   * padrão do navegador não se aplica e o `ScrollRestoration` do React Router
   * também não: ele cuida da janela. Sem isto, sair do fim de uma listagem
   * longa e abrir outra tela deixa a pessoa no meio da página nova, sem ver o
   * título.
   */
  useEffect(() => {
    contentRef.current?.scrollTo({ top: 0 });
  }, [pathname]);

  if (!user) {
    // A rota protegida já garante a sessão. Esta guarda existe para o tipo, e
    // para falhar de forma visível caso alguém monte o shell fora da rota.
    return null;
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <div className="flex flex-1 overflow-hidden">
        <Sidebar
          role={user.role}
          collapsed={collapsed}
          mobileOpen={mobileOpen}
          onMobileOpenChange={setMobileOpen}
        />

        <div className="flex min-w-0 flex-1 flex-col">
          <Header
            collapsed={collapsed}
            onToggleCollapse={() => {
              setCollapsed((value) => !value);
            }}
            onOpenMobileNav={() => {
              setMobileOpen(true);
            }}
          />

          {/* `main` com id para que um atalho de "pular para o conteúdo" possa
              ser adicionado sem mexer na estrutura. */}
          <main ref={contentRef} id="conteudo" className="flex-1 overflow-y-auto p-4 sm:p-6">
            <div className="mx-auto w-full max-w-7xl">
              <Outlet />
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}
