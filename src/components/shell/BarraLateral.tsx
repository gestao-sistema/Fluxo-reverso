// ── Barra lateral flutuante (padrão visual, seção 9) ─────────────────────────
// Peça de vidro de 264 px (80 px recolhida), com cabeçalho de marca, navegação com rolagem
// própria e rodapé com o botão de recolher. Até 1024 px o CSS a compacta sozinho; até 760 px
// ela some e a navegação passa para a gaveta (GavetaMenu).
// ─────────────────────────────────────────────────────────────────────────────
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import type { NavItem } from '../../lib/perfil';
import type { Marca } from '../../lib/tema';
import MarcaLogo from './Marca';
import MenuNavegacao, { type PendenciasPorDestino } from './MenuNavegacao';

interface Props {
  items: NavItem[];
  marca: Marca;
  pendenciasPorDestino?: PendenciasPorDestino;
  recolhido: boolean;
  aoAlternar: () => void;
}

export default function BarraLateral({ items, marca, pendenciasPorDestino, recolhido, aoAlternar }: Props) {
  const rotulo = recolhido ? 'Expandir menu' : 'Recolher menu';
  const Icone = recolhido ? PanelLeftOpen : PanelLeftClose;
  return (
    <aside className="sidebar desktop glass" aria-label="Menu lateral">
      <div className="sidebar-head">
        <MarcaLogo marca={marca} />
        <span className="env-tag">Logística reversa</span>
      </div>
      <nav className="sidebar-nav" aria-label="Navegação principal">
        <MenuNavegacao items={items} pendenciasPorDestino={pendenciasPorDestino} recolhido={recolhido} />
      </nav>
      <div className="sidebar-foot">
        <button
          type="button"
          className="nav-item collapse-btn"
          onClick={aoAlternar}
          aria-pressed={recolhido}
          aria-label={rotulo}
          title={recolhido ? rotulo : undefined}
        >
          <Icone size={19} aria-hidden="true" />
          <span className="nav-label">{rotulo}</span>
        </button>
      </div>
    </aside>
  );
}
