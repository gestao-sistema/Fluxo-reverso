// ── Organização do menu lateral ──────────────────────────────────────────────
// Só decide agrupamento e item ativo a partir dos destinos que o perfil já recebeu
// (navItemsDoUsuario). Não concede nem esconde acesso: rota e banco continuam decidindo.
// ─────────────────────────────────────────────────────────────────────────────
import type { NavItem } from './perfil';

export interface NoMenu {
  item: NavItem;
  /** Páginas do mesmo módulo; aparecem em submenu quando o módulo está ativo. */
  filhos: NavItem[];
}

export interface GrupoMenu {
  chave: string;
  titulo: string;
  nos: NoMenu[];
}

const GRUPOS: ReadonlyArray<{ chave: string; titulo: string; rotas: readonly string[] }> = [
  { chave: 'visao', titulo: 'Visão geral', rotas: ['/admin/dashboard'] },
  { chave: 'solicitar', titulo: 'Solicitar', rotas: ['/admin/alinare', '/admin/novitah', '/admin/meus-pedidos'] },
  { chave: 'acompanhar', titulo: 'Acompanhar', rotas: ['/admin/lista', '/admin/aprovacoes', '/admin/etiquetas'] },
  { chave: 'qualidade', titulo: 'Qualidade', rotas: ['/admin/nc'] },
  { chave: 'administracao', titulo: 'Administração', rotas: ['/admin/usuarios', '/admin/lixeira', '/admin/comunicacoes'] },
];

/** Páginas que pertencem a um módulo e viram submenu dele. */
const SUBPAGINAS: Readonly<Record<string, readonly string[]>> = {
  '/admin/nc': ['/admin/nc/painel', '/admin/nc/listas'],
};

function caminhoDe(to: string): string {
  return to.split('?')[0];
}

/** Agrupa os itens do perfil. Destino sem grupo conhecido vai para "Outros": nada fica sem acesso. */
export function agruparMenu(itens: readonly NavItem[]): GrupoMenu[] {
  const filhosPorPai = new Map<string, NavItem[]>();
  const comoFilho = new Set<NavItem>();
  for (const [pai, subpaginas] of Object.entries(SUBPAGINAS)) {
    if (!itens.some((item) => caminhoDe(item.to) === pai)) continue; // sem o módulo-pai, as páginas ficam soltas
    const filhos = itens.filter((item) => subpaginas.includes(caminhoDe(item.to)));
    filhos.forEach((filho) => comoFilho.add(filho));
    filhosPorPai.set(pai, filhos);
  }

  const grupos: GrupoMenu[] = GRUPOS.map((grupo) => ({ chave: grupo.chave, titulo: grupo.titulo, nos: [] }));
  const outros: GrupoMenu = { chave: 'outros', titulo: 'Outros', nos: [] };

  for (const item of itens) {
    if (comoFilho.has(item)) continue;
    const caminho = caminhoDe(item.to);
    const indice = GRUPOS.findIndex((grupo) => grupo.rotas.includes(caminho));
    const alvo = indice === -1 ? outros : grupos[indice];
    alvo.nos.push({ item, filhos: filhosPorPai.get(caminho) ?? [] });
  }
  // Dentro do grupo vale a ordem declarada acima, não a do perfil
  GRUPOS.forEach((grupo, indice) => {
    grupos[indice].nos.sort((a, b) => grupo.rotas.indexOf(caminhoDe(a.item.to)) - grupo.rotas.indexOf(caminhoDe(b.item.to)));
  });
  return [...grupos, outros].filter((grupo) => grupo.nos.length > 0);
}

/** Rota exata, query de empresa e, para o módulo de NC, o cadastro/ficha (que não são o painel nem as listas). */
export function estaAtivo(to: string, pathname: string, search: string): boolean {
  const [caminho, query] = to.split('?');
  const naNc = caminho === '/admin/nc' && /^\/admin\/nc\/(?!painel$|listas$)/.test(pathname);
  if (pathname !== caminho && !naNc) return false;
  if (!query) return !search || !new URLSearchParams(search).get('empresa');
  return new URLSearchParams(search).get('empresa') === new URLSearchParams(query).get('empresa');
}

/** O módulo está aberto: a rota atual é a dele ou de uma de suas páginas. */
export function moduloAberto(no: NoMenu, pathname: string): boolean {
  if (no.filhos.length === 0) return false;
  const base = caminhoDe(no.item.to);
  return pathname === base || pathname.startsWith(`${base}/`);
}
