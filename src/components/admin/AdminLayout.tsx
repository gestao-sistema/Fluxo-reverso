import { Link, Outlet } from 'react-router-dom';
import FlowNav from './FlowNav';
import PerfilButton from '../auth/PerfilButton';
import NotificacoesEmissaoBell from './NotificacoesEmissaoBell';
import DemoSwitcher from '../../demo/DemoSwitcher';
import BotaoModoCor from '../ui/BotaoModoCor';
import { useAuth } from '../../context/AuthContext';
import { useTema } from '../../context/TemaContext';
import { homeDoUsuario, navItemsDoUsuario } from '../../lib/perfil';
import alinareLogoSrc from '../../assets/alinare_logo.jpg';
import novitahLogoSrc from '../../assets/novitah_logo.jpg';

const LOGO_DO_TEMA = { alinare: { src: alinareLogoSrc, empresa: 'Alinare' }, novitah: { src: novitahLogoSrc, empresa: 'Novitah' } } as const;

export default function AdminLayout() {
  const { user } = useAuth();
  const tema = useTema();
  const itensDoUsuario = user ? navItemsDoUsuario(user) : [];
  // Destinos sem repetição de rota (a navegação mostra cada rota uma vez)
  const itens = itensDoUsuario.filter((item, index) => itensDoUsuario.findIndex((x) => x.to === item.to) === index);

  // Nos temas de empresa a marca já aparece na imagem de fundo (desktop); o logo
  // oficial só é exibido no celular, onde o recorte do fundo a deixa de fora.
  const marca = tema === 'conjunto' ? null : LOGO_DO_TEMA[tema];

  return (
    <div className="app-shell">
      <header className="app-topbar">
        <Link
          to={user ? homeDoUsuario(user) : '/'}
          className={`topbar-identidade ${marca ? 'is-marca-no-fundo' : ''}`}
          aria-label={`Reverso${marca ? ` · ${marca.empresa}` : ''}: página inicial`}
        >
          {marca
            ? <img className="topbar-logo" src={marca.src} alt="" />
            : <span className="topbar-produto" aria-hidden="true">Reverso</span>}
        </Link>
        {/* Só o essencial, numa cápsula de ícones: modo, notificações, perfil de teste e conta.
            Formulários abrem pelo dock (ou "Mais"); reiniciar a demonstração fica no menu da conta. */}
        <div className="topbar-capsula">
          <BotaoModoCor />
          <NotificacoesEmissaoBell />
          <DemoSwitcher />
          <PerfilButton />
        </div>
      </header>
      <main className="app-main" id="conteudo"><Outlet /></main>
      <FlowNav items={itens} />
    </div>
  );
}
