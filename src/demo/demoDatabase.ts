import type {
  ListasNc,
  NaoConformidade,
  NcHistorico,
  NcListaItem,
  NcOrigem,
  ReversaEmissaoEvento,
  ReversaEmissaoResumo,
  NotificacaoEmissao,
  Solicitacao,
  SolicitacaoAprovacaoHistorico,
  SolicitacaoHistorico,
  Usuario,
} from '../types';
import { limparArquivosDemo } from './demoArquivos';
import { HISTORICO_NCS_DEMO, HISTORICO_SOLICITACOES_DEMO, ID_NC_DEMO, LISTAS_NC_DEMO, NCS_DEMO, SOLICITACOES_DEMO } from './fixtures';
import { definirFonteUsuariosDemo, USUARIOS_DEMO, type UsuarioDemo } from './demoMode';
import { comunicacoesDemoIniciais, type DemoComunicacao } from './demoComunicacoesRelatorio';

const KEYS = {
  solicitacoes: 'flowdesk:demo:dados:solicitacoes',
  historicoSolicitacoes: 'flowdesk:demo:dados:historico-solicitacoes',
  ncs: 'flowdesk:demo:dados:ncs',
  historicoNcs: 'flowdesk:demo:dados:historico-ncs',
  listasNc: 'flowdesk:demo:dados:listas-nc',
  usuarios: 'flowdesk:demo:dados:usuarios',
  configAprovadores: 'flowdesk:demo:dados:config-aprovadores',
  emissoes: 'flowdesk:demo:dados:emissoes',
  eventosEmissao: 'flowdesk:demo:dados:eventos-emissao',
  notificacoesEmissao: 'flowdesk:demo:dados:notificacoes-emissao',
  comunicacoes: 'flowdesk:demo:dados:comunicacoes',
  recebimentosFisicos: 'flowdesk:demo:dados:recebimentos-fisicos',
  versoes: 'flowdesk:demo:dados:versoes',
  usuariosRemovidos: 'flowdesk:demo:dados:usuarios-removidos',
  aprovacoes: 'flowdesk:demo:dados:aprovacoes',
  autoaprovacao: 'flowdesk:demo:dados:permitir-autoaprovacao',
};

export interface DemoEmissao extends ReversaEmissaoResumo {
  origem: 'sistema' | 'migracao';
  registrado_por: string | null;
  registrado_por_nome: string;
  emissao_anterior_id: string | null;
  motivo_reemissao: string | null;
  motivo_reemissao_detalhe: string | null;
  pdf_anexado_em: string | null;
}

export interface DemoConfigAprovador {
  empresa: Solicitacao['empresa'];
  usuario_id: string;
  todos_setores: boolean;
  setores: string[];
}

const CONFIG_APROVADORES_INICIAL: DemoConfigAprovador[] = [
  { empresa: 'Alinare', usuario_id: 'demo-aprovador', todos_setores: false, setores: ['Comercial Alinare'] },
  { empresa: 'Novitah', usuario_id: 'demo-aprovador', todos_setores: false, setores: ['Comercial Novitah'] },
  { empresa: 'Alinare', usuario_id: 'demo-aprovador-alinare', todos_setores: true, setores: [] },
  { empresa: 'Novitah', usuario_id: 'demo-aprovador-novitah', todos_setores: true, setores: [] },
  { empresa: 'Alinare', usuario_id: 'demo-gerente-aprovadora', todos_setores: true, setores: [] },
  { empresa: 'Novitah', usuario_id: 'demo-gerente-aprovadora', todos_setores: true, setores: [] },
];

const NOTIFICACOES_EMISSAO_DEMO: NotificacaoEmissao[] = SOLICITACOES_DEMO
  .filter((pedido) => pedido.aprovacao_status === 'aprovada' && (pedido.status === 'pendente' || pedido.status === 'etiqueta_gerada'))
  .flatMap((pedido) => USUARIOS_DEMO
    .filter((usuario) => usuario.telas.includes('emitir-etiqueta') && usuario.empresasAcesso?.includes(pedido.empresa))
    .map((usuario) => ({
      id: `demo-notificacao-${pedido.id}-${usuario.id}`,
      solicitacao_id: pedido.id,
      empresa: pedido.empresa,
      created_at: pedido.created_at,
      lida_em: null,
      destinatario_id: usuario.id,
      aprovacao_versao: 1,
    })));

/**
 * Decisões já registradas nos dados de exemplo: só as que o próprio exemplo informa (quem decidiu
 * e a justificativa). Nada é deduzido do estado atual de um pedido criado depois.
 */
const APROVACOES_DEMO: SolicitacaoAprovacaoHistorico[] = SOLICITACOES_DEMO
  .filter((pedido) => (pedido.aprovacao_status === 'aprovada' || pedido.aprovacao_status === 'rejeitada') && !!pedido.autorizacao)
  .map((pedido) => ({
    id: `demo-aprovacao-exemplo-${pedido.id}`,
    solicitacao_id: pedido.id,
    versao: 1,
    evento: pedido.aprovacao_status === 'rejeitada' ? 'rejeitada' as const : 'aprovada' as const,
    justificativa: pedido.aprovacao_status === 'rejeitada' ? pedido.aprovacao_justificativa ?? null : null,
    situacao_anterior: null,
    user_nome: pedido.autorizacao as string,
    created_at: pedido.created_at,
  }));

/** Perfis criados depois que a demonstração começou a guardar dados: só eles precisam de reconciliação. */
const APROVADORES_NOVOS_NA_VERSAO_2 = ['demo-aprovador-alinare', 'demo-aprovador-novitah', 'demo-gerente-aprovadora'];
const VERSAO_ATUAL = 2;

/**
 * Dados salvos antes da correção usam ids de NC que não são UUID ("demo-nc-2403", "demo-nc-<uuid>"). A
 * leitura converte para o UUID correspondente (o mesmo nas NCs, nos históricos e nos pedidos), mantendo
 * todos os vínculos. O que já é UUID, ou não é id de NC de demonstração, passa sem mudança.
 */
function idNcValido(id: string | null | undefined): string | null | undefined {
  if (!id) return id;
  const fixo = /^demo-nc-(\d{4})$/.exec(id);
  if (fixo) return ID_NC_DEMO[Number(fixo[1])] ?? id;
  const comUuid = /^demo-nc-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i.exec(id);
  return comUuid ? comUuid[1] : id;
}

const fallbackMemoria = new Map<string, string>();
const clonar = <T,>(valor: T): T => JSON.parse(JSON.stringify(valor)) as T;

function ler<T>(chave: string, inicial: T): T {
  try {
    const salvo = window.localStorage.getItem(chave) ?? fallbackMemoria.get(chave);
    return salvo ? JSON.parse(salvo) as T : clonar(inicial);
  } catch {
    return clonar(inicial);
  }
}

function gravar<T>(chave: string, dados: T): void {
  const serializado = JSON.stringify(dados);
  fallbackMemoria.set(chave, serializado);
  try {
    window.localStorage.setItem(chave, serializado);
  } catch {
    // A demonstração continua em memória quando o navegador bloqueia armazenamento.
  }
}

function versaoSalva(nome: string): number {
  return ler<Record<string, number>>(KEYS.versoes, {})[nome] ?? 0;
}

function marcarVersao(nome: string): void {
  gravar(KEYS.versoes, { ...ler<Record<string, number>>(KEYS.versoes, {}), [nome]: VERSAO_ATUAL });
}

export const demoDados = {
  solicitacoes: () => ler<Solicitacao[]>(KEYS.solicitacoes, SOLICITACOES_DEMO)
    .map((item) => item.nc_id && idNcValido(item.nc_id) !== item.nc_id ? { ...item, nc_id: idNcValido(item.nc_id) as string } : item),
  salvarSolicitacoes: (itens: Solicitacao[]) => gravar(KEYS.solicitacoes, itens),
  historicoSolicitacoes: () => ler<SolicitacaoHistorico[]>(KEYS.historicoSolicitacoes, HISTORICO_SOLICITACOES_DEMO),
  salvarHistoricoSolicitacoes: (itens: SolicitacaoHistorico[]) => gravar(KEYS.historicoSolicitacoes, itens),
  ncs: () => ler<NaoConformidade[]>(KEYS.ncs, NCS_DEMO).map((item) => ({ ...item, id: idNcValido(item.id) as string })),
  salvarNcs: (itens: NaoConformidade[]) => gravar(KEYS.ncs, itens),
  historicoNcs: () => ler<NcHistorico[]>(KEYS.historicoNcs, HISTORICO_NCS_DEMO).map((item) => ({ ...item, nc_id: idNcValido(item.nc_id) as string })),
  salvarHistoricoNcs: (itens: NcHistorico[]) => gravar(KEYS.historicoNcs, itens),
  listasNc: () => ler<ListasNc>(KEYS.listasNc, LISTAS_NC_DEMO),
  salvarListasNc: (itens: ListasNc) => gravar(KEYS.listasNc, itens),
  /**
   * Cadastro de usuários. Dados guardados por versões antigas ficam como estão (pedidos, configurações e
   * usuários criados na tela), mas os perfis de teste voltam ao padrão atual uma única vez e os que ainda
   * não existiam são acrescentados. Perfil removido de propósito não volta.
   */
  usuarios: (): Usuario[] => {
    const padrao = USUARIOS_DEMO.map(({ demoPerfil: _perfil, ...usuario }) => usuario);
    const removidos = ler<string[]>(KEYS.usuariosRemovidos, []);
    const salvo = ler<Usuario[] | null>(KEYS.usuarios, null);
    if (!salvo) return padrao.filter((usuario) => !removidos.includes(usuario.id));
    const idsDoPadrao = new Set(padrao.map((usuario) => usuario.id));
    const antigo = versaoSalva('usuarios') < VERSAO_ATUAL;
    const base = antigo ? salvo.filter((usuario) => !idsDoPadrao.has(usuario.id)).concat(padrao.filter((usuario) => !removidos.includes(usuario.id))) : salvo;
    const presentes = new Set(base.map((usuario) => usuario.id));
    const resultado = [...base, ...padrao.filter((usuario) => !presentes.has(usuario.id) && !removidos.includes(usuario.id) && antigo)];
    if (antigo) { gravar(KEYS.usuarios, resultado); marcarVersao('usuarios'); }
    return resultado;
  },
  salvarUsuarios: (itens: Usuario[]) => { gravar(KEYS.usuarios, itens); marcarVersao('usuarios'); },
  removerUsuario: (id: string) => {
    const atuais = demoDados.usuarios();
    gravar(KEYS.usuarios, atuais.filter((usuario) => usuario.id !== id));
    gravar(KEYS.usuariosRemovidos, [...new Set([...ler<string[]>(KEYS.usuariosRemovidos, []), id])]);
    marcarVersao('usuarios');
  },
  /** Aprovadores por empresa/setor. Versão antiga: só acrescenta os aprovadores de teste novos, sem reabrir remoções. */
  configAprovadores: (): DemoConfigAprovador[] => {
    const salvo = ler<DemoConfigAprovador[] | null>(KEYS.configAprovadores, null);
    if (!salvo) return clonar(CONFIG_APROVADORES_INICIAL);
    if (versaoSalva('config') >= VERSAO_ATUAL) return salvo;
    const faltantes = CONFIG_APROVADORES_INICIAL.filter((item) => APROVADORES_NOVOS_NA_VERSAO_2.includes(item.usuario_id)
      && !salvo.some((atual) => atual.empresa === item.empresa && atual.usuario_id === item.usuario_id));
    const resultado = [...salvo, ...clonar(faltantes)];
    gravar(KEYS.configAprovadores, resultado);
    marcarVersao('config');
    return resultado;
  },
  salvarConfigAprovadores: (itens: DemoConfigAprovador[]) => { gravar(KEYS.configAprovadores, itens); marcarVersao('config'); },
  emissoes: () => ler<DemoEmissao[]>(KEYS.emissoes, []),
  salvarEmissoes: (itens: DemoEmissao[]) => gravar(KEYS.emissoes, itens),
  eventosEmissao: () => ler<ReversaEmissaoEvento[]>(KEYS.eventosEmissao, []),
  salvarEventosEmissao: (itens: ReversaEmissaoEvento[]) => gravar(KEYS.eventosEmissao, itens),
  /**
   * Avisos de emissão. Versão antiga: gera, uma vez, os avisos que faltam para emissores habilitados na empresa
   * dos pedidos aprovados que esperam etiqueta; avisos existentes (lidos ou não) nunca são recriados.
   */
  notificacoesEmissao: (): NotificacaoEmissao[] => {
    const salvo = ler<NotificacaoEmissao[] | null>(KEYS.notificacoesEmissao, null);
    if (!salvo) return clonar(NOTIFICACOES_EMISSAO_DEMO);
    if (versaoSalva('avisos') >= VERSAO_ATUAL) return salvo;
    const emissores = demoDados.usuarios().filter((usuario) => usuario.telas.includes('emitir-etiqueta'));
    const novos: NotificacaoEmissao[] = [];
    for (const pedido of demoDados.solicitacoes()) {
      if (pedido.aprovacao_status !== 'aprovada' || (pedido.status !== 'pendente' && pedido.status !== 'etiqueta_gerada') || pedido.etiqueta_path) continue;
      for (const emissor of emissores.filter((usuario) => usuario.empresasAcesso?.includes(pedido.empresa))) {
        if (salvo.some((aviso) => aviso.solicitacao_id === pedido.id && aviso.destinatario_id === emissor.id)) continue;
        novos.push({
          id: `demo-notificacao-${pedido.id}-${emissor.id}`, solicitacao_id: pedido.id, empresa: pedido.empresa,
          created_at: pedido.created_at, lida_em: null, destinatario_id: emissor.id, aprovacao_versao: 1,
        });
      }
    }
    const resultado = [...salvo, ...novos];
    gravar(KEYS.notificacoesEmissao, resultado);
    marcarVersao('avisos');
    return resultado;
  },
  salvarNotificacoesEmissao: (itens: NotificacaoEmissao[]) => { gravar(KEYS.notificacoesEmissao, itens); marcarVersao('avisos'); },
  comunicacoes: () => ler<DemoComunicacao[]>(KEYS.comunicacoes, comunicacoesDemoIniciais(SOLICITACOES_DEMO)),
  salvarComunicacoes: (itens: DemoComunicacao[]) => gravar(KEYS.comunicacoes, itens),
  aprovacoes: () => ler<SolicitacaoAprovacaoHistorico[]>(KEYS.aprovacoes, APROVACOES_DEMO),
  salvarAprovacoes: (itens: SolicitacaoAprovacaoHistorico[]) => gravar(KEYS.aprovacoes, itens),
  /** Espelha aprovacao_config.permitir_autoaprovacao: desligada por padrão e sem tela de configuração. */
  permitirAutoaprovacao: () => ler<boolean>(KEYS.autoaprovacao, false),
  salvarPermitirAutoaprovacao: (valor: boolean) => gravar(KEYS.autoaprovacao, valor),
  recebimentosFisicos: () => ler<string[]>(KEYS.recebimentosFisicos, []),
  salvarRecebimentosFisicos: (ids: string[]) => gravar(KEYS.recebimentosFisicos, ids),
  resetar() {
    Object.values(KEYS).forEach((key) => {
      fallbackMemoria.delete(key);
      try { window.localStorage.removeItem(key); } catch { /* Memória local limpa acima. */ }
    });
    // Os PDFs anexados pertencem aos pedidos que acabaram de ser descartados
    void limparArquivosDemo().catch(() => {});
  },
};

export function demoRegistrarHistoricoSolicitacao(item: Omit<SolicitacaoHistorico, 'id' | 'created_at'>): void {
  const historico = demoDados.historicoSolicitacoes();
  historico.unshift({ ...item, id: `demo-hist-${crypto.randomUUID()}`, created_at: new Date().toISOString() });
  demoDados.salvarHistoricoSolicitacoes(historico);
}

export function demoRegistrarHistoricoNc(item: Omit<NcHistorico, 'id' | 'created_at'>): void {
  const historico = demoDados.historicoNcs();
  historico.unshift({ ...item, id: `demo-nc-hist-${crypto.randomUUID()}`, created_at: new Date().toISOString() });
  demoDados.salvarHistoricoNcs(historico);
}

export function demoSalvarOrigem(origem: NcOrigem, nomeAnterior?: string): void {
  const listas = demoDados.listasNc();
  const origens = listas.origens.filter((item) => item.nome !== (nomeAnterior ?? origem.nome));
  listas.origens = [...origens, origem].sort((a, b) => a.ordem - b.ordem);
  demoDados.salvarListasNc(listas);
}

export function demoSalvarItemLista(item: NcListaItem): void {
  const listas = demoDados.listasNc();
  listas.itens = listas.itens.filter((existente) => !(existente.lista === item.lista && existente.valor === item.valor));
  listas.itens.push(item);
  listas.itens.sort((a, b) => a.lista.localeCompare(b.lista) || a.ordem - b.ordem);
  demoDados.salvarListasNc(listas);
}


// Seletor, sessão, configuração e avisos passam a usar o mesmo cadastro (com as edições feitas na tela de usuários)
definirFonteUsuariosDemo((): UsuarioDemo[] => {
  const cadastro = new Map(demoDados.usuarios().map((usuario) => [usuario.id, usuario]));
  return USUARIOS_DEMO.filter((padrao) => cadastro.has(padrao.id)).map((padrao) => {
    const salvo = cadastro.get(padrao.id)!;
    return { ...padrao, nome: salvo.nome, usuario: salvo.usuario, telas: salvo.telas, perfilAcesso: salvo.perfilAcesso ?? padrao.perfilAcesso, empresasAcesso: salvo.empresasAcesso ?? padrao.empresasAcesso };
  });
});
