// ── Gaveta de navegação do celular (padrão visual, seções 18.3 e 24) ─────────
// Até 760 px a barra lateral some e o menu abre aqui, pela esquerda, em vidro denso. Fecha
// com Esc, toque no fundo ou ao escolher um destino; o foco entra na gaveta e volta ao botão.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import type { NavItem } from '../../lib/perfil';
import type { Marca } from '../../lib/tema';
import MarcaLogo from './Marca';
import MenuNavegacao, { type PendenciasPorDestino } from './MenuNavegacao';

interface Props {
  items: NavItem[];
  marca: Marca;
  pendenciasPorDestino?: PendenciasPorDestino;
  aoFechar: () => void;
}

export default function GavetaMenu({ items, marca, pendenciasPorDestino, aoFechar }: Props) {
  const painel = useRef<HTMLElement>(null);

  useEffect(() => {
    const anterior = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    painel.current?.focus();
    const teclas = (evento: KeyboardEvent) => {
      if (evento.key === 'Escape') aoFechar();
    };
    document.addEventListener('keydown', teclas);
    // Sem rolagem do fundo enquanto a gaveta está aberta
    const overflowAnterior = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', teclas);
      document.body.style.overflow = overflowAnterior;
      anterior?.focus();
    };
  }, [aoFechar]);

  return (
    <>
      <div className="drawer-overlay" onClick={aoFechar} aria-hidden="true" />
      <aside ref={painel} className="drawer left glass-strong" role="dialog" aria-modal="true" aria-label="Menu" tabIndex={-1}>
        <div className="drawer-head">
          <MarcaLogo marca={marca} />
          <span className="spacer" />
          <button type="button" className="icon-btn" onClick={aoFechar} aria-label="Fechar menu">
            <X size={19} aria-hidden="true" />
          </button>
        </div>
        <nav className="sidebar-nav" aria-label="Navegação principal">
          <MenuNavegacao items={items} pendenciasPorDestino={pendenciasPorDestino} aoNavegar={aoFechar} />
        </nav>
      </aside>
    </>
  );
}
