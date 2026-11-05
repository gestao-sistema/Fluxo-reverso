// Dock inferior: até LIMITE_DIRETOS destinos (os de maior prioridade que couberem)
// ficam visíveis na ordem original; o restante vai para o menu Mais. Nenhum
// destino autorizado fica sem acesso.
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { MoreHorizontal } from 'lucide-react';
import type { NavItem } from '../../lib/perfil';

const LIMITE_DIRETOS = 6;

/** Prioridade no dock: filas e operação antes de formulários e administração (o que não couber vai para "Mais"). */
const PRIORIDADE = [
  '/admin/dashboard', '/admin/lista', '/admin/aprovacoes', '/admin/etiquetas',
  '/admin/meus-pedidos', '/admin/alinare', '/admin/novitah', '/admin/nc',
  '/admin/nc/painel', '/admin/nc/listas', '/admin/usuarios', '/admin/lixeira', '/admin/comunicacoes',
];

function prioridade(item: NavItem): number {
  const indice = PRIORIDADE.indexOf(item.to.split('?')[0]);
  return indice === -1 ? PRIORIDADE.length : indice;
}

function ordenarPorPrioridade(items: NavItem[]): NavItem[] {
  return items.map((item, indice) => ({ item, indice }))
    .sort((a, b) => prioridade(a.item) - prioridade(b.item) || a.indice - b.indice)
    .map(({ item }) => item);
}

/** Os `quantidade` itens de maior prioridade, mantendo a ordem original entre eles. */
function separarDiretos(items: NavItem[], quantidade: number): [NavItem[], NavItem[]] {
  const escolhidos = new Set(ordenarPorPrioridade(items).slice(0, quantidade));
  return [items.filter((item) => escolhidos.has(item)), items.filter((item) => !escolhidos.has(item))];
}

/** Mesma regra de destaque da antiga sidebar: rota exata, query de empresa e cadastro de NC. */
function estaAtivo(to: string, pathname: string, search: string): boolean {
  const [caminho, query] = to.split('?');
  const naNc = caminho === '/admin/nc' && /^\/admin\/nc\/(?!painel$|listas$)/.test(pathname);
  if (pathname !== caminho && !naNc) return false;
  if (!query) return !search;
  return new URLSearchParams(search).get('empresa') === new URLSearchParams(query).get('empresa');
}

function rotuloCompacto(item: NavItem): string {
  if (item.to === '/admin/dashboard' || item.to.startsWith('/admin/dashboard?')) return 'Operação';
  if (item.to === '/admin/alinare') return 'Alinare';
  if (item.to === '/admin/novitah') return 'Novitah';
  return item.label;
}

interface FlowNavProps {
  items: NavItem[];
}

export default function FlowNav({ items }: FlowNavProps) {
  const location = useLocation();
  const [maisAberto, setMaisAberto] = useState(false);
  const [quantidadeVisivel, setQuantidadeVisivel] = useState(Math.min(items.length, LIMITE_DIRETOS));
  const navRef = useRef<HTMLElement>(null);
  const medicaoRef = useRef<HTMLDivElement>(null);
  const primeiroDoMais = useRef<HTMLAnchorElement>(null);
  // Medidos na ordem de prioridade: o que couber primeiro é o que fica no dock
  const ordenados = useMemo(() => ordenarPorPrioridade(items), [items]);

  useLayoutEffect(() => {
    const medir = () => {
      const nav = navRef.current;
      const medicao = medicaoRef.current;
      if (!nav || !medicao) return;

      const botoes = Array.from(medicao.querySelectorAll<HTMLElement>('[data-nav-measure]'));
      const larguras = botoes.slice(0, ordenados.length).map((item) => item.getBoundingClientRect().width);
      const larguraMais = botoes[ordenados.length]?.getBoundingClientRect().width ?? 0;
      const estilos = window.getComputedStyle(nav);
      const espacamento = Number.parseFloat(estilos.columnGap || estilos.gap) || 0;
      const larguraMoldura = Number.parseFloat(estilos.paddingLeft)
        + Number.parseFloat(estilos.paddingRight)
        + Number.parseFloat(estilos.borderLeftWidth)
        + Number.parseFloat(estilos.borderRightWidth);
      const larguraDisponivel = Math.max(0, document.documentElement.clientWidth - 24);

      const larguraTodos = larguras.reduce((soma, largura) => soma + largura, 0)
        + Math.max(0, ordenados.length - 1) * espacamento
        + larguraMoldura;

      let visiveis = ordenados.length;
      if (ordenados.length > LIMITE_DIRETOS || larguraTodos > larguraDisponivel) {
        visiveis = 0;
        let larguraDiretos = 0;
        for (let indice = 0; indice < Math.min(ordenados.length, LIMITE_DIRETOS); indice += 1) {
          const larguraCandidata = larguraDiretos
            + larguras[indice]
            + (indice > 0 ? espacamento : 0)
            + larguraMais
            + espacamento
            + larguraMoldura;
          if (larguraCandidata > larguraDisponivel) break;
          larguraDiretos += larguras[indice] + (indice > 0 ? espacamento : 0);
          visiveis = indice + 1;
        }
      }

      setQuantidadeVisivel((atual) => atual === visiveis ? atual : visiveis);
    };

    medir();
    window.addEventListener('resize', medir);
    const observador = new ResizeObserver(medir);
    if (medicaoRef.current) observador.observe(medicaoRef.current);
    return () => {
      window.removeEventListener('resize', medir);
      observador.disconnect();
    };
  }, [ordenados]);

  const [principais, demais] = separarDiretos(items, quantidadeVisivel);
  const demaisTemAtivo = demais.some((item) => estaAtivo(item.to, location.pathname, location.search));

  useEffect(() => {
    if (demais.length === 0) setMaisAberto(false);
  }, [demais.length]);

  // Esc fecha o menu "Mais" e o foco vai para o primeiro destino dele
  useEffect(() => {
    if (!maisAberto) return;
    primeiroDoMais.current?.focus();
    const teclas = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMaisAberto(false);
    };
    document.addEventListener('keydown', teclas);
    return () => document.removeEventListener('keydown', teclas);
  }, [maisAberto]);

  if (items.length === 0) return null;

  return (
    <>
      {maisAberto && demais.length > 0 && (
        <>
          <button type="button" className="flow-nav-backdrop" aria-label="Fechar mais destinos" onClick={() => setMaisAberto(false)} />
          <div id="flow-nav-mais" className="flow-nav-sheet" role="navigation" aria-label="Mais destinos">
            {demais.map((item, indice) => {
              const ativo = estaAtivo(item.to, location.pathname, location.search);
              const Icone = item.icon;
              return (
                <NavLink
                  key={item.to}
                  ref={indice === 0 ? primeiroDoMais : undefined}
                  to={item.to}
                  onClick={() => setMaisAberto(false)}
                  className={`flow-nav-sheet-link ${ativo ? 'is-active' : ''}`}
                  aria-current={ativo ? 'page' : undefined}
                >
                  <Icone size={18} strokeWidth={1.9} aria-hidden="true" />
                  <span>{item.label}</span>
                </NavLink>
              );
            })}
          </div>
        </>
      )}

      <nav ref={navRef} className="flow-nav" aria-label="Navegação principal">
        {principais.map((item) => {
          const ativo = estaAtivo(item.to, location.pathname, location.search);
          const Icone = item.icon;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              onClick={() => setMaisAberto(false)}
              className={`flow-nav-item ${ativo ? 'is-active' : ''}`}
              aria-current={ativo ? 'page' : undefined}
              aria-label={item.label}
              title={item.label}
            >
              <Icone size={20} strokeWidth={1.9} aria-hidden="true" />
              <span aria-hidden="true">{rotuloCompacto(item)}</span>
            </NavLink>
          );
        })}
        {demais.length > 0 && (
          <button
            type="button"
            className={`flow-nav-item ${demaisTemAtivo ? 'is-active' : ''} ${maisAberto ? 'is-open' : ''}`}
            aria-expanded={maisAberto}
            aria-controls="flow-nav-mais"
            onClick={() => setMaisAberto((aberto) => !aberto)}
          >
            <MoreHorizontal size={20} strokeWidth={1.9} aria-hidden="true" />
            <span>Mais</span>
          </button>
        )}
        <div ref={medicaoRef} className="flow-nav-measure" aria-hidden="true">
          {ordenados.map((item) => {
            const Icone = item.icon;
            return (
              <span key={item.to} data-nav-measure className="flow-nav-item">
                <Icone size={20} strokeWidth={1.9} />
                <span>{rotuloCompacto(item)}</span>
              </span>
            );
          })}
          <span data-nav-measure className="flow-nav-item">
            <MoreHorizontal size={20} strokeWidth={1.9} />
            <span>Mais</span>
          </span>
        </div>
      </nav>
    </>
  );
}
