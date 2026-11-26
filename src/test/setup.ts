import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, vi, beforeAll } from 'vitest';
import { cleanup } from '@testing-library/react';
import { usarArmazenamentoDemo, type ArmazenamentoArquivosDemo } from '../demo/demoArquivos';

/** jsdom não tem IndexedDB: os testes usam um armazenamento em memória, trocado a cada teste. */
export function criarArmazenamentoEmMemoria(): ArmazenamentoArquivosDemo & { arquivos: Map<string, Blob> } {
  const arquivos = new Map<string, Blob>();
  return {
    arquivos,
    async gravar(caminho, arquivo) { arquivos.set(caminho, arquivo); },
    async ler(caminho) { return arquivos.get(caminho) ?? null; },
    async limpar() { arquivos.clear(); },
  };
}
beforeEach(() => usarArmazenamentoDemo(criarArmazenamentoEmMemoria()));

// ── Polyfills para jsdom ───────────────────────────────────────────────────────
// matchMedia não existe em jsdom; vários libs (react-datepicker, transições) usam.
beforeAll(() => {
  // O shell leva a janela ao topo a cada rota; jsdom não implementa scrollTo
  window.scrollTo = vi.fn() as unknown as typeof window.scrollTo;
  if (!window.matchMedia) {
    window.matchMedia = (query: string): MediaQueryList => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    });
  }
  // scrollTo não existe em jsdom
  if (!window.scrollTo) {
    window.scrollTo = vi.fn();
  }
  // getComputedStyle em jsdom não retorna CSS variables corretamente; noop ok.
});

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.restoreAllMocks();
});
