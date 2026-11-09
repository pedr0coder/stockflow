import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '@/test/render';
import { AppShell } from './AppShell';

/**
 * Conversão matemática exata OKLCH -> Oklab -> sRGB linear -> luminância
 * relativa WCAG 2.1/2.2, usada para auditar os tokens primitivos de
 * `src/index.css` em ambiente de teste (já que jsdom não computa cores OKLCH).
 */
function oklchToSrgb(lPct: number, c: number, hDeg: number): [number, number, number] {
  const L = lPct / 100;
  const hRad = (hDeg * Math.PI) / 180;
  const a = c * Math.cos(hRad);
  const b = c * Math.sin(hRad);

  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.291485548 * b;

  const lCube = l_ * l_ * l_;
  const mCube = m_ * m_ * m_;
  const sCube = s_ * s_ * s_;

  const rLin = +4.0767416621 * lCube - 3.3077115913 * mCube + 0.2309699292 * sCube;
  const gLin = -1.2684380046 * lCube + 2.6097574011 * mCube - 0.3413193965 * sCube;
  const bLin = -0.0041960863 * lCube - 0.7034186147 * mCube + 1.707614701 * sCube;

  const toGamma = (val: number): number => {
    const clamped = Math.min(1, Math.max(0, val));
    return clamped <= 0.0031308 ? 12.92 * clamped : 1.055 * Math.pow(clamped, 1 / 2.4) - 0.055;
  };

  return [toGamma(rLin), toGamma(gLin), toGamma(bLin)];
}

function relativeLuminance([r, g, b]: [number, number, number]): number {
  const toLinear = (c: number): number =>
    c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

function contrastRatio(rgb1: [number, number, number], rgb2: [number, number, number]): number {
  const lum1 = relativeLuminance(rgb1);
  const lum2 = relativeLuminance(rgb2);
  const brightest = Math.max(lum1, lum2);
  const darkest = Math.min(lum1, lum2);
  return (brightest + 0.05) / (darkest + 0.05);
}

function blendOver(
  fg: [number, number, number],
  bg: [number, number, number],
  alpha: number,
): [number, number, number] {
  return [
    fg[0] * alpha + bg[0] * (1 - alpha),
    fg[1] * alpha + bg[1] * (1 - alpha),
    fg[2] * alpha + bg[2] * (1 - alpha),
  ];
}

function parseOklchToken(css: string, name: string): [number, number, number] {
  const regex = new RegExp(`${name}:\\s*oklch\\(([\\d.]+)%\\s+([\\d.]+)\\s+([\\d.]+)\\)`);
  const match = regex.exec(css);
  if (!match) {
    throw new Error(`Token ${name} não encontrado em src/index.css`);
  }
  return oklchToSrgb(Number(match[1]), Number(match[2]), Number(match[3]));
}

describe('AppShell e Acessibilidade WCAG 2.2 AA (M7C-3)', () => {
  it('oferece link "Pular para o conteúdo" funcional que move o foco para <main id="conteudo">', async () => {
    const user = userEvent.setup();

    renderWithProviders(
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<div>Conteúdo da página</div>} />
        </Route>
      </Routes>,
    );

    const skipLink = screen.getByRole('link', { name: 'Pular para o conteúdo' });
    expect(skipLink).toHaveAttribute('href', '#conteudo');

    await user.tab();
    expect(skipLink).toHaveFocus();

    await user.keyboard('{Enter}');
    const main = screen.getByRole('main');
    expect(main).toHaveAttribute('id', 'conteudo');
    expect(main).toHaveFocus();
  });

  it('menu mobile abre Sheet com título, descrição acessível e botão de fechar em português', async () => {
    const user = userEvent.setup();

    renderWithProviders(
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<div>Conteúdo</div>} />
        </Route>
      </Routes>,
    );

    await user.click(screen.getByRole('button', { name: 'Abrir navegação' }));

    expect(await screen.findByRole('dialog', { name: /stockflow/i })).toBeInTheDocument();
    expect(screen.getByText('Menu de navegação principal')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Fechar' })).toBeInTheDocument();
  });

  it('tokens semânticos de cor em index.css cumprem contraste WCAG 2.2 AA (>= 4.5:1) sobre fundo branco e sobre tint /10', async () => {
    const fsSpecifier = 'node:fs';
    const urlSpecifier = 'node:url';
    const { readFileSync } = (await import(/* @vite-ignore */ fsSpecifier)) as {
      readFileSync: (path: URL, encoding: string) => string;
    };
    const { URL: NodeUrl } = (await import(/* @vite-ignore */ urlSpecifier)) as {
      URL: typeof URL;
    };
    const indexCss = readFileSync(new NodeUrl('../../index.css', import.meta.url), 'utf8');

    const bg = parseOklchToken(indexCss, '--sf-bg');
    const surface = parseOklchToken(indexCss, '--sf-surface');
    const text = parseOklchToken(indexCss, '--sf-text');
    const textMuted = parseOklchToken(indexCss, '--sf-text-muted');
    const primary = parseOklchToken(indexCss, '--sf-primary');
    const success = parseOklchToken(indexCss, '--sf-success');
    const warning = parseOklchToken(indexCss, '--sf-warning');
    const danger = parseOklchToken(indexCss, '--sf-danger');

    expect(contrastRatio(text, bg)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(textMuted, bg)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(textMuted, surface)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(primary, bg)).toBeGreaterThanOrEqual(4.5);

    // Contraste sobre fundo branco (--sf-bg) e texto branco em botão sólido
    expect(contrastRatio(success, bg)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(warning, bg)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(danger, bg)).toBeGreaterThanOrEqual(4.5);

    // Contraste sobre fundo com opacidade /10 (usado em StockBadge, MovementTypeBadge, InventoriesPage e alertas)
    expect(contrastRatio(success, blendOver(success, bg, 0.1))).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(warning, blendOver(warning, bg, 0.1))).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(danger, blendOver(danger, bg, 0.1))).toBeGreaterThanOrEqual(4.5);

    // M7C-5: Regra global prefers-reduced-motion declarada em index.css
    expect(indexCss).toContain('@media (prefers-reduced-motion: reduce)');
    expect(indexCss).toContain('animation-duration: 0.01ms !important');
    expect(indexCss).toContain('transition-duration: 0.01ms !important');
  });

  it('M7C-5: ajusta scrollTo de <main> para behavior "instant" quando prefers-reduced-motion: reduce está ativo', () => {
    const scrollToSpy = vi.spyOn(Element.prototype, 'scrollTo');
    vi.stubGlobal(
      'matchMedia',
      vi.fn().mockImplementation((query: string) => ({
        matches: query === '(prefers-reduced-motion: reduce)',
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    );

    try {
      renderWithProviders(
        <Routes>
          <Route element={<AppShell />}>
            <Route index element={<div>Conteúdo</div>} />
          </Route>
        </Routes>,
      );

      expect(scrollToSpy).toHaveBeenCalledWith({ top: 0, behavior: 'instant' });
    } finally {
      vi.unstubAllGlobals();
      scrollToSpy.mockRestore();
    }
  });
});
