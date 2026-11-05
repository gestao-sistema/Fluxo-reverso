// ── Service Layer: Não conformidades (Supabase) ──────────────────────────────
//
// Leitura em vw_nao_conformidades (traz os campos calculados da planilha);
// escrita em nao_conformidades. A linha do tempo é gravada por trigger no
// banco; daqui só saem as anotações manuais.
// Padrão:  componente → ncService → Supabase
// ─────────────────────────────────────────────────────────────────────────────

import { supabase } from '../lib/supabase';
import type {
  Empresa,
  ListasNc,
  NaoConformidade,
  NcCampos,
  NcHistorico,
  NcListaItem,
  NcOpcaoReversa,
  NcOrigem,
  UsuarioAutenticado,
} from '../types';
import type { NcImportada } from '../lib/ncPlanilha';
import { demoAtivo } from '../demo/demoMode';
import demoNcService from '../demo/demoNcService';

/** Converte erro Supabase em mensagem legível */
function checarErro(erro: { message: string } | null, fallback: string): void {
  if (erro) throw new Error(erro.message || fallback);
}

const TAMANHO_LOTE_IMPORTACAO = 50;

const supabaseNcService = {
  /** Todas as NCs visíveis ao usuário, da mais recente para a mais antiga. */
  async listar(): Promise<NaoConformidade[]> {
    const { data, error } = await supabase
      .from('vw_nao_conformidades')
      .select('*')
      .order('numero', { ascending: false });

    checarErro(error, 'Erro ao buscar não conformidades.');
    return (data ?? []) as NaoConformidade[];
  },

  async obter(id: string): Promise<NaoConformidade | null> {
    const { data, error } = await supabase
      .from('vw_nao_conformidades')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    checarErro(error, 'Erro ao buscar a não conformidade.');
    return (data as NaoConformidade) ?? null;
  },

  /** Registra a NC e devolve o registro com os campos calculados. */
  async criar(campos: NcCampos): Promise<NaoConformidade> {
    const { data, error } = await supabase
      .from('nao_conformidades')
      .insert(campos)
      .select('id')
      .single();

    checarErro(error, 'Erro ao registrar a não conformidade.');
    const nc = await ncService.obter((data as { id: string }).id);
    if (!nc) throw new Error('NC registrada, mas não foi possível carregá-la.');
    return nc;
  },

  async atualizar(id: string, campos: Partial<NcCampos>): Promise<NaoConformidade> {
    const { error } = await supabase.from('nao_conformidades').update(campos).eq('id', id);
    checarErro(error, 'Erro ao salvar a não conformidade.');

    const nc = await ncService.obter(id);
    if (!nc) throw new Error('NC salva, mas não foi possível carregá-la.');
    return nc;
  },

  /** Apaga a NC (somente admin). NC com reversa vinculada não pode ser apagada. */
  async remover(id: string): Promise<void> {
    const { error } = await supabase.from('nao_conformidades').delete().eq('id', id);
    if (error?.code === '23503') {
      throw new Error('Esta NC tem reversas vinculadas e não pode ser apagada.');
    }
    checarErro(error, 'Erro ao apagar a não conformidade.');
  },

  /** Linha do tempo da NC (mais recente primeiro). */
  async historico(ncId: string): Promise<NcHistorico[]> {
    const { data, error } = await supabase
      .from('nc_historico')
      .select('*')
      .eq('nc_id', ncId)
      .order('created_at', { ascending: false });

    checarErro(error, 'Erro ao buscar a linha do tempo.');
    return (data ?? []) as NcHistorico[];
  },

  async adicionarNota(ncId: string, texto: string, user: UsuarioAutenticado): Promise<void> {
    const { error } = await supabase.from('nc_historico').insert({
      nc_id: ncId,
      user_nome: user.nome,
      tipo: 'nota',
      acao: texto.trim(),
    });
    checarErro(error, 'Erro ao salvar a anotação.');
  },

  /** Listas da NC (origens com área/evitável e listas simples). */
  async carregarListas(): Promise<ListasNc> {
    const [origens, itens] = await Promise.all([
      supabase.from('nc_origens').select('*').order('ordem'),
      supabase.from('nc_listas').select('*').order('lista').order('ordem'),
    ]);
    checarErro(origens.error, 'Erro ao carregar as origens de NC.');
    checarErro(itens.error, 'Erro ao carregar as listas de NC.');
    return { origens: (origens.data ?? []) as NcOrigem[], itens: (itens.data ?? []) as NcListaItem[] };
  },

  /**
   * Cria ou altera uma origem. Renomear propaga para as NCs que usam a origem
   * (on update cascade no banco).
   */
  async salvarOrigem(origem: NcOrigem, nomeAnterior?: string): Promise<void> {
    if (nomeAnterior && nomeAnterior !== origem.nome) {
      const { error } = await supabase.from('nc_origens').update(origem).eq('nome', nomeAnterior);
      checarErro(error, 'Erro ao renomear a origem.');
      return;
    }
    const { error } = await supabase.from('nc_origens').upsert(origem, { onConflict: 'nome' });
    checarErro(error, 'Erro ao salvar a origem.');
  },

  /** Cria ou altera um valor de lista (valores não são renomeados: desative e crie outro). */
  async salvarItemLista(item: NcListaItem): Promise<void> {
    const { error } = await supabase.from('nc_listas').upsert(item, { onConflict: 'lista,valor' });
    checarErro(error, 'Erro ao salvar o valor da lista.');
  },

  /** NCs abertas da empresa que podem originar uma reversa (formulário). */
  async opcoesParaReversa(empresa: Empresa): Promise<NcOpcaoReversa[]> {
    const { data, error } = await supabase.rpc('ncs_para_reversa', { p_empresa: empresa });
    checarErro(error, 'Erro ao buscar as NCs abertas.');
    return (data ?? []) as NcOpcaoReversa[];
  },

  /** NCs já gravadas com estes números (conferência antes de importar a planilha). */
  async numerosGravados(numeros: number[]): Promise<Pick<NaoConformidade, 'numero' | 'importada'>[]> {
    if (numeros.length === 0) return [];
    const { data, error } = await supabase
      .from('nao_conformidades')
      .select('numero, importada')
      .in('numero', numeros);

    checarErro(error, 'Erro ao conferir as NCs já gravadas.');
    return (data ?? []) as Pick<NaoConformidade, 'numero' | 'importada'>[];
  },

  /**
   * Importa as NCs da planilha mantendo o ID original (NC-0001…). NCs cujo
   * número já existe são ignoradas, então a importação pode ser repetida.
   * A "Linha do tempo" da planilha vira uma anotação da NC importada.
   */
  async importar(
    registros: NcImportada[],
    user?: UsuarioAutenticado | null
  ): Promise<{ inseridas: number; existentes: number }> {
    let inseridas = 0;

    for (let i = 0; i < registros.length; i += TAMANHO_LOTE_IMPORTACAO) {
      const lote = registros.slice(i, i + TAMANHO_LOTE_IMPORTACAO);
      const linhas = lote.map(({ linha: _linha, linha_do_tempo: _linhaDoTempo, ...campos }) => ({
        ...campos,
        importada: true,
      }));

      const { data, error } = await supabase
        .from('nao_conformidades')
        .upsert(linhas, { onConflict: 'numero', ignoreDuplicates: true })
        .select('id, numero');
      checarErro(error, 'Erro ao importar a planilha.');

      const criadas = (data ?? []) as { id: string; numero: number }[];
      inseridas += criadas.length;

      const notas = criadas.flatMap((c) => {
        const texto = lote.find((r) => r.numero === c.numero)?.linha_do_tempo;
        return texto
          ? [{ nc_id: c.id, user_nome: user?.nome ?? 'Importação', tipo: 'nota', acao: `Linha do tempo (planilha): ${texto}` }]
          : [];
      });
      if (notas.length) {
        const { error: erroNotas } = await supabase.from('nc_historico').insert(notas);
        checarErro(erroNotas, 'NCs importadas, mas a linha do tempo da planilha não foi gravada.');
      }
    }

    // A numeração continua depois do maior ID importado
    const { error } = await supabase.rpc('nc_sincronizar_numeracao');
    checarErro(error, 'NCs importadas, mas a numeração não foi ajustada.');

    return { inseridas, existentes: registros.length - inseridas };
  },
};

const ncService = new Proxy(supabaseNcService, {
  get(target, property, receiver) {
    if (demoAtivo() && typeof property === 'string' && property in demoNcService) {
      return (demoNcService as unknown as Record<string, unknown>)[property];
    }
    return Reflect.get(target, property, receiver);
  },
});

export default ncService;
