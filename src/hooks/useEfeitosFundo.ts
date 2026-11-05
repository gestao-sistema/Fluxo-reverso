// ── Preferência de pausar os efeitos de fundo ───────────────────────────────
// Guardada por usuário neste navegador. Qualquer componente que use o hook
// (fundo e botões) fica sincronizado pelo mesmo evento; nenhum estado é
// atualizado a cada quadro da animação.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useState } from 'react';

const CHAVE = 'flowdesk.efeitos-fundo.pausados';
const EVENTO = 'flowdesk:efeitos-fundo';

function ler(): boolean {
  try {
    return localStorage.getItem(CHAVE) === '1';
  } catch {
    return false; // modo privado ou armazenamento bloqueado: efeitos ativos
  }
}

export function definirEfeitosFundoPausados(pausados: boolean): void {
  try {
    localStorage.setItem(CHAVE, pausados ? '1' : '0');
  } catch {
    // Sem persistência: a preferência vale só nesta aba
  }
  window.dispatchEvent(new Event(EVENTO));
}

export function useEfeitosFundoPausados(): [boolean, (pausados: boolean) => void] {
  const [pausados, setPausados] = useState(ler);

  useEffect(() => {
    const sincronizar = () => setPausados(ler());
    window.addEventListener(EVENTO, sincronizar);
    return () => window.removeEventListener(EVENTO, sincronizar);
  }, []);

  return [pausados, definirEfeitosFundoPausados];
}
