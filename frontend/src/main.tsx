import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router';
import { AppProviders } from './app/providers';
import { ErrorBoundary } from './components/shared/ErrorBoundary';
import { router } from './router';
import './index.css';

const container = document.getElementById('root');

if (!container) {
  // Falha explícita em vez de tela branca silenciosa.
  throw new Error('Elemento #root não encontrado em index.html');
}

createRoot(container).render(
  <StrictMode>
    <ErrorBoundary>
      <AppProviders>
        <RouterProvider router={router} />
      </AppProviders>
    </ErrorBoundary>
  </StrictMode>,
);
