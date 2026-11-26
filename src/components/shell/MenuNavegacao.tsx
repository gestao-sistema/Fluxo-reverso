// ── Itens do menu lateral (padrão visual, seção 9) ───────────────────────────
// Usado pela barra lateral do desktop e pela gaveta do celular. Cada destino é um botão
// (sem href: navega pela rota), com ícone de 19 px, nome acessível que inclui a contagem de
// pendências e aria-current na página atual. O submenu do módulo ativo liga-se por uma guia.
// ─────────────────────────────────────────────────────────────────────────────
import { Fragment, useMemo } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import type { NavItem } from '../../lib/perfil';
import { agruparMenu, estaAtivo, moduloAberto } from '../../lib/menu';
import '../admin/contador-aprovacoes.css';
import { descreverPendencias, PENDENCIAS_INATIVAS, type DescricaoPendencias, type PendenciasAprovacao } from '../../lib/aprovacoesPendentes';

/** Pendências por destino (rota). Hoje só Aprovações tem contador. */
export type PendenciasPorDestino = Partial<Record<string, PendenciasAprovacao>>;

interface Props {
  items: NavItem[];
  pendenciasPorDestino?: PendenciasPorDestino;
  /** Menu recolhido: sem texto na tela, então o nome vai também no title. */
  recolhido?: boolean;
  /** Chamado ao escolher um destino (a gaveta do celular se fecha). */
  aoNavegar?: () => void;
}

function descricaoDoItem(item: NavItem, pendenciasPorDestino?: PendenciasPorDestino): DescricaoPendencias {
  return descreverPendencias(pendenciasPorDestino?.[item.to] ?? PENDENCIAS_INATIVAS);
}

/** O nome acessível inclui a contagem: o número não depende só do ícone. */
function nomeDoItem(item: NavItem, descricao: DescricaoPendencias): string {
  return descricao.resumo ? `${item.label}, ${descricao.resumo}` : item.label;
}

export default function MenuNavegacao({ items, pendenciasPorDestino, recolhido = false, aoNavegar }: Props) {
  const { pathname, search } = useLocation();
  const navigate = useNavigate();
  const grupos = useMemo(() => agruparMenu(items), [items]);

  // Mesma regra do Link: se o destino já é a página atual, a entrada do histórico é substituída
  const irPara = (item: NavItem) => {
    aoNavegar?.();
    navigate(item.to, { replace: item.to === `${pathname}${search}` });
  };

  return (
    <>
      {grupos.map((grupo, indice) => (
        <Fragment key={grupo.chave}>
          {indice > 0 && <div className="nav-group-sep" aria-hidden="true" />}
          <div className="nav-group-label">{grupo.titulo}</div>
          {grupo.nos.map((no) => {
            const ativo = estaAtivo(no.item.to, pathname, search);
            const aberto = moduloAberto(no, pathname);
            const descricao = descricaoDoItem(no.item, pendenciasPorDestino);
            const nome = nomeDoItem(no.item, descricao);
            const Icone = no.item.icon;
            return (
              <Fragment key={no.item.to}>
                <button
                  type="button"
                  className={`nav-item${ativo ? ' active' : ''}${aberto && !ativo ? ' parent-open' : ''}`}
                  aria-current={ativo ? 'page' : undefined}
                  aria-label={nome}
                  title={recolhido ? nome : undefined}
                  onClick={() => irPara(no.item)}
                >
                  <Icone size={19} aria-hidden="true" />
                  <span className="nav-label">{no.item.label}</span>
                  {descricao.marca && (
                    <>
                      <span className={`nav-badge${descricao.alerta ? ' alerta' : ''}`} aria-hidden="true">{descricao.marca}</span>
                      <span className={`dot-badge${descricao.alerta ? ' alerta' : ''}`} aria-hidden="true" />
                    </>
                  )}
                </button>
                {aberto && (
                  <div className="nav-sub">
                    {no.filhos.map((filho) => {
                      const filhoAtivo = estaAtivo(filho.to, pathname, search);
                      return (
                        <Link
                          key={filho.to}
                          to={filho.to}
                          className={filhoAtivo ? 'active' : undefined}
                          aria-current={filhoAtivo ? 'page' : undefined}
                          onClick={aoNavegar}
                        >
                          {filho.label}
                        </Link>
                      );
                    })}
                  </div>
                )}
              </Fragment>
            );
          })}
        </Fragment>
      ))}
    </>
  );
}
