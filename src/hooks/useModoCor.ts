// ── Modo de cor: claro ou escuro ────────────────────────────────────────────
// Sem escolha salva, segue o sistema (prefers-color-scheme). A escolha fica
// neste navegador; todo componente que usa o hook se sincroniza pelo mesmo
// evento. O index.html aplica o valor antes do primeiro quadro (sem piscar).
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useState } from 'react';

export type ModoCor = 'claro' | 'escuro';

const CHAVE = 'flowdesk.modo-cor';
const EVENTO = 'flowdesk:modo-cor';
const CONSULTA_SISTEMA = '(prefers-color-scheme: light)';

function modoDoSistema(): ModoCor {
  return window.matchMedia?.(CONSULTA_SISTEMA).matches ? 'claro' : 'escuro';
}

function escolhaSalva(): ModoCor | null {
  try {
    const valor = localStorage.getItem(CHAVE);
    return valor === 'claro' || valor === 'escuro' ? valor : null;
  } catch {
    return null; // armazenamento bloqueado: vale o sistema
  }
}

export function lerModoCor(): ModoCor {
  return escolhaSalva() ?? modoDoSistema();
}

export function definirModoCor(modo: ModoCor): void {
  try {
    localStorage.setItem(CHAVE, modo);
  } catch {
    // Sem persistência: a escolha vale só nesta aba
  }
  window.dispatchEvent(new Event(EVENTO));
}

export function useModoCor(): [ModoCor, (modo: ModoCor) => void] {
  const [modo, setModo] = useState(lerModoCor);

  useEffect(() => {
    const sincronizar = () => setModo(lerModoCor());
    const sistema = window.matchMedia?.(CONSULTA_SISTEMA);
    window.addEventListener(EVENTO, sincronizar);
    // Sem escolha salva, acompanha a troca de tema do sistema
    sistema?.addEventListener?.('change', sincronizar);
    return () => {
      window.removeEventListener(EVENTO, sincronizar);
      sistema?.removeEventListener?.('change', sincronizar);
    };
  }, []);

  return [modo, definirModoCor];
}
