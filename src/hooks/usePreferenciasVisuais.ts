// ── Preferências visuais do usuário (padrão visual, seção 26) ────────────────
// Reduzir movimento e reduzir transparência. Guardadas neste navegador e aplicadas em <html>
// (data-motion e data-transparency), que é onde os tokens do padrão as leem. Quem usa o hook
// fica sincronizado pelo mesmo evento. O sistema operacional também é respeitado por
// media query, sem depender desta escolha.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useState } from 'react';

const CHAVE_MOVIMENTO = 'flowdesk.reduzir-movimento';
const CHAVE_TRANSPARENCIA = 'flowdesk.reduzir-transparencia';
const EVENTO = 'flowdesk:preferencias-visuais';

export interface PreferenciasVisuais {
  reduzirMovimento: boolean;
  reduzirTransparencia: boolean;
}

function ler(chave: string): boolean {
  try {
    return localStorage.getItem(chave) === '1';
  } catch {
    return false; // armazenamento bloqueado: vale o padrão
  }
}

export function lerPreferenciasVisuais(): PreferenciasVisuais {
  return { reduzirMovimento: ler(CHAVE_MOVIMENTO), reduzirTransparencia: ler(CHAVE_TRANSPARENCIA) };
}

/** Aplica em <html> o que está salvo. Chamado antes do primeiro render para não piscar. */
export function aplicarPreferenciasVisuais(preferencias: PreferenciasVisuais = lerPreferenciasVisuais()): void {
  const raiz = document.documentElement;
  if (preferencias.reduzirMovimento) raiz.dataset.motion = 'reduced';
  else delete raiz.dataset.motion;
  if (preferencias.reduzirTransparencia) raiz.dataset.transparency = 'reduced';
  else delete raiz.dataset.transparency;
}

export function definirPreferenciaVisual(campo: keyof PreferenciasVisuais, valor: boolean): void {
  const chave = campo === 'reduzirMovimento' ? CHAVE_MOVIMENTO : CHAVE_TRANSPARENCIA;
  try {
    localStorage.setItem(chave, valor ? '1' : '0');
  } catch {
    // Sem persistência: a escolha vale só nesta aba
  }
  aplicarPreferenciasVisuais();
  window.dispatchEvent(new Event(EVENTO));
}

export function usePreferenciasVisuais(): [PreferenciasVisuais, (campo: keyof PreferenciasVisuais, valor: boolean) => void] {
  const [preferencias, setPreferencias] = useState(lerPreferenciasVisuais);

  useEffect(() => {
    const sincronizar = () => setPreferencias(lerPreferenciasVisuais());
    window.addEventListener(EVENTO, sincronizar);
    return () => window.removeEventListener(EVENTO, sincronizar);
  }, []);

  return [preferencias, definirPreferenciaVisual];
}
