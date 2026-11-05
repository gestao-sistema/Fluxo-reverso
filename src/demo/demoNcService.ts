import type { NcImportada } from '../lib/ncPlanilha';
import type { Empresa, ListasNc, NaoConformidade, NcCampos, NcHistorico, NcListaItem, NcOpcaoReversa, NcOrigem, UsuarioAutenticado } from '../types';
import { demoDados, demoRegistrarHistoricoNc, demoSalvarItemLista, demoSalvarOrigem } from './demoDatabase';

function atualizarCalculados(item: NaoConformidade): NaoConformidade {
  const custoTotal = (item.custo_produto ?? 0) + (item.custo_frete_adicional ?? 0) + (item.custo_multa_outros ?? 0);
  const reversas = demoDados.solicitacoes().filter((solicitacao) => solicitacao.nc_id === item.id).length;
  return {
    ...item,
    codigo: `NC-${String(item.numero).padStart(4, '0')}`,
    custo_total: custoTotal,
    custo_liquido: custoTotal - (item.valor_reembolsado ?? 0),
    area_responsavel: demoDados.listasNc().origens.find((origem) => origem.nome === item.origem)?.area ?? null,
    evitavel: demoDados.listasNc().origens.find((origem) => origem.nome === item.origem)?.evitavel ?? null,
    dias_em_aberto: item.status === 'Encerrada' || item.status === 'Cancelada' || !item.data_ocorrencia
      ? 0
      : Math.max(0, Math.floor((Date.now() - new Date(`${item.data_ocorrencia}T00:00:00`).getTime()) / 86400000)),
    qtd_reversas: reversas,
  };
}

function novaNc(campos: NcCampos, numero: number, importada = false): NaoConformidade {
  const agora = new Date().toISOString();
  return atualizarCalculados({
    ...campos,
    id: crypto.randomUUID(),
    numero,
    codigo: `NC-${String(numero).padStart(4, '0')}`,
    created_at: agora,
    updated_at: agora,
    importada,
    custo_total: null,
    custo_liquido: null,
    area_responsavel: null,
    evitavel: null,
    dias_em_aberto: 0,
    qtd_reversas: 0,
  });
}

const demoNcService = {
  async listar(): Promise<NaoConformidade[]> {
    return demoDados.ncs().map(atualizarCalculados).sort((a, b) => b.numero - a.numero);
  },
  async obter(id: string): Promise<NaoConformidade | null> {
    const item = demoDados.ncs().find((nc) => nc.id === id);
    return item ? atualizarCalculados(item) : null;
  },
  async criar(campos: NcCampos): Promise<NaoConformidade> {
    const itens = demoDados.ncs();
    const criada = novaNc(campos, Math.max(0, ...itens.map((item) => item.numero)) + 1);
    demoDados.salvarNcs([criada, ...itens]);
    demoRegistrarHistoricoNc({ nc_id: criada.id, user_nome: 'Júlia Nascimento', tipo: 'evento', acao: 'Não conformidade registrada.' });
    return criada;
  },
  async atualizar(id: string, campos: Partial<NcCampos>): Promise<NaoConformidade> {
    const itens = demoDados.ncs();
    const indice = itens.findIndex((item) => item.id === id);
    if (indice < 0) throw new Error('Não conformidade de demonstração não encontrada.');
    const atualizada = atualizarCalculados({ ...itens[indice], ...campos, updated_at: new Date().toISOString() });
    itens[indice] = atualizada;
    demoDados.salvarNcs(itens);
    demoRegistrarHistoricoNc({ nc_id: id, user_nome: 'Júlia Nascimento', tipo: 'evento', acao: 'Não conformidade atualizada.' });
    return atualizada;
  },
  async remover(id: string): Promise<void> {
    if (demoDados.solicitacoes().some((item) => item.nc_id === id)) throw new Error('Esta NC tem reversas vinculadas e não pode ser apagada.');
    demoDados.salvarNcs(demoDados.ncs().filter((item) => item.id !== id));
    demoDados.salvarHistoricoNcs(demoDados.historicoNcs().filter((item) => item.nc_id !== id));
  },
  async historico(ncId: string): Promise<NcHistorico[]> {
    return demoDados.historicoNcs().filter((item) => item.nc_id === ncId).sort((a, b) => b.created_at.localeCompare(a.created_at));
  },
  async adicionarNota(ncId: string, texto: string, user: UsuarioAutenticado): Promise<void> {
    demoRegistrarHistoricoNc({ nc_id: ncId, user_nome: user.nome, tipo: 'nota', acao: texto.trim() });
  },
  async carregarListas(): Promise<ListasNc> { return demoDados.listasNc(); },
  async salvarOrigem(origem: NcOrigem, nomeAnterior?: string): Promise<void> { demoSalvarOrigem(origem, nomeAnterior); },
  async salvarItemLista(item: NcListaItem): Promise<void> { demoSalvarItemLista(item); },
  async opcoesParaReversa(empresa: Empresa): Promise<NcOpcaoReversa[]> {
    return demoDados.ncs()
      .filter((item) => item.empresa === empresa && (item.status === 'Aberta' || item.status === 'Em tratativa'))
      .map((item) => ({ id: item.id, numero: item.numero, codigo: item.codigo, data_ocorrencia: item.data_ocorrencia, cliente: item.cliente, origem: item.origem, status: item.status! }));
  },
  async numerosGravados(numeros: number[]): Promise<Array<Pick<NaoConformidade, 'numero' | 'importada'>>> {
    return demoDados.ncs().filter((item) => numeros.includes(item.numero)).map(({ numero, importada }) => ({ numero, importada }));
  },
  async importar(registros: NcImportada[], user?: UsuarioAutenticado | null): Promise<{ inseridas: number; existentes: number }> {
    const atuais = demoDados.ncs();
    const numerosAtuais = new Set(atuais.map((item) => item.numero));
    const novos = registros.filter((item) => !numerosAtuais.has(item.numero));
    const importados = novos.map(({ numero, linha: _linha, linha_do_tempo: _linhaDoTempo, ...campos }) => novaNc(campos, numero, true));
    demoDados.salvarNcs([...importados, ...atuais]);
    importados.forEach((item) => {
      const origem = registros.find((registro) => registro.numero === item.numero);
      demoRegistrarHistoricoNc({ nc_id: item.id, user_nome: user?.nome ?? 'Importação', tipo: 'evento', acao: origem?.linha_do_tempo ? `Linha do tempo da planilha: ${origem.linha_do_tempo}` : 'NC importada da planilha.' });
    });
    return { inseridas: importados.length, existentes: registros.length - importados.length };
  },
};

export default demoNcService;

