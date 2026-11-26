// Consulta de mídia reativa (ex.: celular até 760 px, ponto de quebra do padrão visual).
// Sem matchMedia (ambientes de teste), assume que a consulta não casa.
import { useEffect, useState } from 'react';

export const CONSULTA_CELULAR = '(max-width: 760px)';

export function useMediaQuery(consulta: string): boolean {
  const [casa, setCasa] = useState(() => (typeof window !== 'undefined' && typeof window.matchMedia === 'function' ? window.matchMedia(consulta).matches : false));

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const lista = window.matchMedia(consulta);
    const atualizar = () => setCasa(lista.matches);
    atualizar();
    lista.addEventListener?.('change', atualizar);
    return () => lista.removeEventListener?.('change', atualizar);
  }, [consulta]);

  return casa;
}
