// ── Casca da área autenticada (padrão visual, seção 8) ───────────────────────
// Grid de duas colunas: barra lateral de vidro (276 px de faixa, 92 px recolhida) e área
// principal com cabeçalho flutuante e conteúdo (máx. 1400 px). Até 760 px a barra lateral
// dá lugar à gaveta. O fundo (manchas de luz) fica fora daqui, em App.tsx.
// ─────────────────────────────────────────────────────────────────────────────
import { useCallback, useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useTema } from '../../context/TemaContext';
import { ContadorAprovacoesProvider, useContadorAprovacoes } from '../../context/ContadorAprovacoesContext';
import { navItemsDoUsuario } from '../../lib/perfil';
import { marcaDoTema } from '../../lib/tema';
import BarraLateral from '../shell/BarraLateral';
import CabecalhoApp from '../shell/CabecalhoApp';
import GavetaMenu from '../shell/GavetaMenu';

const CHAVE_RECOLHIDA = 'flowdesk.menu-recolhido';

function lerRecolhido(): boolean {
  try {
    return localStorage.getItem(CHAVE_RECOLHIDA) === '1';
  } catch {
    return false;
  }
}

export default function AdminLayout() {
  // O provedor fica acima do cabeçalho, do menu e da página: o contador do item Aprovações lê a mesma fila da página
  return (
    <ContadorAprovacoesProvider>
      <CascaAdministrativa />
    </ContadorAprovacoesProvider>
  );
}

function CascaAdministrativa() {
  const { user } = useAuth();
  const { pendencias } = useContadorAprovacoes();
  const tema = useTema();
  const { pathname } = useLocation();
  const [recolhido, setRecolhido] = useState(lerRecolhido);
  const [menuAberto, setMenuAberto] = useState(false);
  const fecharMenu = useCallback(() => setMenuAberto(false), []);

  const itensDoUsuario = user ? navItemsDoUsuario(user) : [];
  // Destinos sem repetição de rota (a navegação mostra cada rota uma vez)
  const itens = itensDoUsuario.filter((item, index) => itensDoUsuario.findIndex((x) => x.to === item.to) === index);
  const marca = marcaDoTema(tema);
  const pendenciasPorDestino = { '/admin/aprovacoes': pendencias };

  // Nas trocas de rota a janela volta ao topo e a gaveta do celular se fecha
  useEffect(() => {
    window.scrollTo(0, 0);
    setMenuAberto(false);
  }, [pathname]);

  const alternarRecolhimento = () => {
    setRecolhido((atual) => {
      try {
        localStorage.setItem(CHAVE_RECOLHIDA, atual ? '0' : '1');
      } catch {
        // Sem persistência: vale só nesta aba
      }
      return !atual;
    });
  };

  return (
    <div className={`shell${recolhido ? ' collapsed' : ''}`}>
      <a className="skip-link" href="#conteudo">Ir para o conteúdo</a>
      {itens.length > 0 && (
        <BarraLateral items={itens} marca={marca} pendenciasPorDestino={pendenciasPorDestino} recolhido={recolhido} aoAlternar={alternarRecolhimento} />
      )}
      <div className="main">
        <CabecalhoApp itens={itens} aoAbrirMenu={() => setMenuAberto(true)} menuAberto={menuAberto} />
        <main className="content" id="conteudo">
          <div className="page-enter" key={pathname}><Outlet /></div>
        </main>
      </div>
      {menuAberto && itens.length > 0 && (
        <GavetaMenu items={itens} marca={marca} pendenciasPorDestino={pendenciasPorDestino} aoFechar={fecharMenu} />
      )}
    </div>
  );
}
