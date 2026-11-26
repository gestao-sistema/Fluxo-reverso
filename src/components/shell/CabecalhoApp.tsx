// ── Cabeçalho global (padrão visual, seção 10) ───────────────────────────────
// Vidro flutuante de 64 px (58 px no celular). Da esquerda para a direita: menu (celular),
// busca, espaço flexível, demonstração, notificações, modo claro/escuro (some no celular,
// onde fica no menu da conta) e conta do usuário.
// ─────────────────────────────────────────────────────────────────────────────
import { Menu } from 'lucide-react';
import type { NavItem } from '../../lib/perfil';
import PerfilButton from '../auth/PerfilButton';
import NotificacoesEmissaoBell from '../admin/NotificacoesEmissaoBell';
import DemoSwitcher from '../../demo/DemoSwitcher';
import BotaoModoCor from '../ui/BotaoModoCor';
import BuscaGlobal from './BuscaGlobal';

interface Props {
  itens: NavItem[];
  aoAbrirMenu: () => void;
  menuAberto: boolean;
}

export default function CabecalhoApp({ itens, aoAbrirMenu, menuAberto }: Props) {
  return (
    <header className="header glass">
      <button
        type="button"
        className="icon-btn only-mobile"
        onClick={aoAbrirMenu}
        aria-label="Abrir menu"
        aria-expanded={menuAberto}
        aria-haspopup="dialog"
      >
        <Menu size={19} aria-hidden="true" />
      </button>
      <BuscaGlobal itens={itens} />
      <span className="spacer" />
      <DemoSwitcher />
      <NotificacoesEmissaoBell />
      <BotaoModoCor className="hide-mobile" />
      <PerfilButton />
    </header>
  );
}
