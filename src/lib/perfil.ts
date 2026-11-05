// ── Helpers de perfil: rota inicial e itens de navegação ─────────────────────
import { Archive, BadgeCheck, BarChart3, ChartPie, ClipboardCheck, ClipboardList, FileText, ListChecks, MessageSquareWarning, ShieldAlert, Tag, Users } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { Empresa, Tela, UsuarioAutenticado } from '../types';
import { isMestre } from '../types';
import { empresaLiberada } from './acesso';

// ── Permissões (espelham as funções do banco: pode_ver_nc, pode_editar_nc…) ──

/** Consulta NCs e o painel de NC (espelha pode_ver_nc). A gestão de usuários não concede isso. */
export function podeVerNc(user: UsuarioAutenticado): boolean {
  return isMestre(user) || user.telas.includes('nc') || user.telas.includes('nc-edit');
}

/** Registra/edita NC e gera reversa a partir dela. */
export function podeEditarNc(user: UsuarioAutenticado): boolean {
  return isMestre(user) || user.telas.includes('nc-edit');
}

/** Empresa liberada no cadastro (empresas_acesso). Nunca presumida: lista vazia não dá acesso a nenhuma. */
function empresaNoPerfil(user: UsuarioAutenticado, empresa: Empresa): boolean {
  return empresaLiberada(user.empresasAcesso, empresa);
}

/**
 * Movimenta reversas da empresa (anotações, rastreio, etiqueta): aprova, emite ou confirma postagem nela.
 * Consultar a lista, o dashboard ou o antigo Kanban não opera, e a gestão de usuários também não.
 */
export function podeOperarReversa(user: UsuarioAutenticado, empresa: Empresa): boolean {
  if (isMestre(user)) return true;
  return ['aprovar-reversa', 'emitir-etiqueta', 'confirmar-checkin'].some((tela) => user.telas.includes(tela as Tela))
    && empresaNoPerfil(user, empresa);
}

/** Aprova/rejeita na empresa (espelha empresas_aprovaveis); o escopo por setor é conferido pelo banco. */
export function podeAprovarReversa(user: UsuarioAutenticado, empresa: Empresa): boolean {
  return user.telas.includes('aprovar-reversa') && empresaNoPerfil(user, empresa);
}

export function podeEmitirEtiqueta(user: UsuarioAutenticado, empresa: Empresa): boolean {
  // Espelha empresas_etiquetaveis(): administração não substitui a capacidade
  // de emissão nem o escopo explícito da empresa.
  return user.telas.includes('emitir-etiqueta') && !!user.empresasAcesso?.includes(empresa);
}

export function podeConfirmarCheckin(user: UsuarioAutenticado, empresa: Empresa): boolean {
  return user.telas.includes('confirmar-checkin') && empresaNoPerfil(user, empresa);
}

/** Confirma recebimento manual no Kanban ou pela capacidade de check-in da empresa. */
export function podeConfirmarRecebimentoMercadoria(user: UsuarioAutenticado, empresa: Empresa): boolean {
  return isMestre(user)
    || ((user.telas.includes('kanban-edit') || user.telas.includes('confirmar-checkin')) && empresaNoPerfil(user, empresa));
}

/** Abre o formulário de reversa da empresa (pelo formulário ou pela NC). */
export function podeAbrirFormulario(user: UsuarioAutenticado, empresa: Empresa): boolean {
  const tela: Tela = empresa === 'Alinare' ? 'formulario-alinare' : 'formulario-novitah';
  return podeEditarNc(user) || user.telas.includes(tela);
}

/** Usuários que podem registrar uma reversa acompanham os próprios pedidos. */
export function podeSolicitarReversa(user: UsuarioAutenticado): boolean {
  return isMestre(user)
    || user.telas.includes('formulario-alinare')
    || user.telas.includes('formulario-novitah')
    || podeEditarNc(user);
}

/** Rota (path) para onde o usuário vai ao logar / ao acessar rota inválida. */
export function homeDoUsuario(user: UsuarioAutenticado): string {
  // Prioriza dashboards, depois listas, depois formulários, depois kanban
  if (user.telas.includes('dashboard-geral')) return '/admin/dashboard';
  if (user.telas.includes('dashboard-alinare')) return '/admin/dashboard?empresa=Alinare';
  if (user.telas.includes('dashboard-novitah')) return '/admin/dashboard?empresa=Novitah';
  // Quem aprova abre direto nas aprovações (a lista de pedidos fica a um toque)
  if (user.telas.includes('aprovar-reversa')) return '/admin/aprovacoes';
  if (user.telas.includes('emitir-etiqueta')) {
    if (user.telas.includes('lista-geral')) return '/admin/lista?visao=historico';
    if (user.telas.includes('lista-alinare')) return '/admin/lista?empresa=Alinare&visao=historico';
    if (user.telas.includes('lista-novitah')) return '/admin/lista?empresa=Novitah&visao=historico';
  }
  if (user.telas.includes('lista-geral')) return '/admin/lista';
  if (user.telas.includes('lista-alinare')) return '/admin/lista?empresa=Alinare';
  if (user.telas.includes('lista-novitah')) return '/admin/lista?empresa=Novitah';
  if (user.telas.includes('formulario-alinare')) return '/admin/alinare';
  if (user.telas.includes('formulario-novitah')) return '/admin/novitah';

  if (user.telas.includes('emitir-etiqueta')) return '/admin/etiquetas';

  // Não conformidades, depois a administração, antes do fallback
  if (podeVerNc(user)) return '/admin/nc';
  if (user.telas.includes('usuarios')) return '/admin/usuarios';

  // Sem nenhuma tela autorizada: página de acesso negado
  return '/sem-acesso';
}

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
}

/**
 * Mapa tela → item de navegação. kanban, kanban-edit e confirmar-checkin não têm página própria: continuam
 * sendo capacidades (o banco as usa; hoje a confirmação física do recebimento), pois o andamento dos
 * Correios é automático e a consulta fica em Pedidos.
 */
const NAV_MAP: Partial<Record<Tela, NavItem>> = {
  'dashboard-geral': { to: '/admin/dashboard', label: 'Dashboard', icon: BarChart3 },
  'dashboard-alinare': { to: '/admin/dashboard?empresa=Alinare', label: 'Dashboard', icon: BarChart3 },
  'dashboard-novitah': { to: '/admin/dashboard?empresa=Novitah', label: 'Dashboard', icon: BarChart3 },
  'formulario-alinare': { to: '/admin/alinare', label: 'Novo pedido Alinare', icon: FileText },
  'formulario-novitah': { to: '/admin/novitah', label: 'Novo pedido Novitah', icon: FileText },
  'lista-geral': { to: '/admin/lista', label: 'Pedidos', icon: ClipboardList },
  'lista-alinare': { to: '/admin/lista?empresa=Alinare', label: 'Pedidos', icon: ClipboardList },
  'lista-novitah': { to: '/admin/lista?empresa=Novitah', label: 'Pedidos', icon: ClipboardList },
  nc: { to: '/admin/nc', label: 'Não conformidades', icon: ShieldAlert },
  // Permissão de edição — mesma rota da consulta de NCs.
  'nc-edit': { to: '/admin/nc', label: 'Não conformidades', icon: ShieldAlert },
  'aprovar-reversa': { to: '/admin/aprovacoes', label: 'Aprovações', icon: BadgeCheck },
  'emitir-etiqueta': { to: '/admin/etiquetas', label: 'Operações', icon: Tag },
  usuarios: { to: '/admin/usuarios', label: 'Usuários', icon: Users },
};

const NAV_MEUS_PEDIDOS: NavItem = { to: '/admin/meus-pedidos', label: 'Meus Pedidos', icon: ClipboardCheck };

/** Comunicações são administrativas. O menu não concede acesso: as rotas e o banco decidem. */
const NAV_COMUNICACOES: NavItem = { to: '/admin/comunicacoes', label: 'Comunicações', icon: MessageSquareWarning };
const NAV_LIXEIRA: NavItem = { to: '/admin/lixeira', label: 'Lixeira', icon: Archive };

/** Itens do módulo de NC exibidos logo abaixo de "Não conformidades". */
const NAV_NC_PAINEL: NavItem = { to: '/admin/nc/painel', label: 'Painel de NC', icon: ChartPie };
const NAV_NC_LISTAS: NavItem = { to: '/admin/nc/listas', label: 'Listas de NC', icon: ListChecks };

/** Ordem de exibição na sidebar (a tela marcada é o que aparece; não há menu por perfil). */
const ORDEM_NAV: Tela[] = [
  'dashboard-geral',
  'dashboard-alinare',
  'dashboard-novitah',
  'lista-geral',
  'lista-alinare',
  'lista-novitah',
  'formulario-alinare',
  'formulario-novitah',
  'aprovar-reversa',
  'emitir-etiqueta',
  'nc',
  'usuarios',
];

/** Quem tem a visão geral não precisa dos itens por empresa da mesma família (dashboard, pedidos). */
const FAMILIAS_COM_GERAL: Array<{ geral: Tela; porEmpresa: Tela[] }> = [
  { geral: 'dashboard-geral', porEmpresa: ['dashboard-alinare', 'dashboard-novitah'] },
  { geral: 'lista-geral', porEmpresa: ['lista-alinare', 'lista-novitah'] },
];

/** Insere o painel (e, para o admin, as listas) logo após "Não conformidades". */
function comItensDeNc(items: NavItem[], admin: boolean): NavItem[] {
  const i = items.findIndex((item) => item.to === '/admin/nc');
  if (i === -1) return items;
  const extras = admin ? [NAV_NC_PAINEL, NAV_NC_LISTAS] : [NAV_NC_PAINEL];
  return [...items.slice(0, i + 1), ...extras, ...items.slice(i + 1)];
}

/** Telas com item de menu, na ordem pedida. */
function itensDasTelas(telas: Tela[]): NavItem[] {
  return telas.map((t) => NAV_MAP[t]).filter((item): item is NavItem => !!item);
}

/** Itens da sidebar conforme telas permitidas do usuário logado. */
export function navItemsDoUsuario(user: UsuarioAutenticado): NavItem[] {
  // O menu mostra exatamente as telas marcadas: nenhum perfil abre telas que não selecionou.
  const marcadas = new Set<Tela>(user.telas);
  // Quem edita NC também consulta
  if (marcadas.has('nc-edit')) marcadas.add('nc');
  for (const { geral, porEmpresa } of FAMILIAS_COM_GERAL) {
    if (marcadas.has(geral)) porEmpresa.forEach((tela) => marcadas.delete(tela));
  }
  const administra = marcadas.has('usuarios');
  let itens = comItensDeNc(itensDasTelas(ORDEM_NAV.filter((t) => marcadas.has(t))), administra);
  if (administra) {
    const indiceUsuarios = itens.findIndex((item) => item.to === '/admin/usuarios');
    if (indiceUsuarios >= 0) itens = [...itens.slice(0, indiceUsuarios + 1), NAV_LIXEIRA, NAV_COMUNICACOES, ...itens.slice(indiceUsuarios + 1)];
  }
  const acessaPedidos = marcadas.has('lista-geral') || marcadas.has('lista-alinare') || marcadas.has('lista-novitah');
  if (marcadas.has('emitir-etiqueta') && acessaPedidos) {
    itens = itens.map((item) => item.to.startsWith('/admin/lista')
      ? { ...item, to: `${item.to}${item.to.includes('?') ? '&' : '?'}visao=historico`, label: 'Histórico de pedidos' }
      : item);
  }
  return podeSolicitarReversa(user) ? [...itens, NAV_MEUS_PEDIDOS] : itens;
}

/** Mapeia pathname + query → tela correspondente (para active state da sidebar). */
export function telaDaRota(pathname: string, search: string): Tela | null {
  const empresa = new URLSearchParams(search).get('empresa');
  switch (pathname) {
    case '/admin/dashboard':
      return empresa === 'Alinare'
        ? 'dashboard-alinare'
        : empresa === 'Novitah'
        ? 'dashboard-novitah'
        : 'dashboard-geral';
    case '/admin/lista':
      return empresa === 'Alinare'
        ? 'lista-alinare'
        : empresa === 'Novitah'
        ? 'lista-novitah'
        : 'lista-geral';
    case '/admin/alinare':
      return 'formulario-alinare';
    case '/admin/novitah':
      return 'formulario-novitah';
    case '/admin/usuarios':
      return 'usuarios';
    case '/admin/lixeira':
      return 'usuarios';
    default:
      // Lista, cadastro, painel e listas de NC
      return pathname.startsWith('/admin/nc') ? 'nc' : null;
  }
}

/** Rota de uma tela específica. */
export function rotaDaTela(tela: Tela): string | undefined {
  return NAV_MAP[tela]?.to;
}
