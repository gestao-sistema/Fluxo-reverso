import type { NcImportada } from '../lib/ncPlanilha';
import { classificacaoPendente, derivarClassificacao, validarClassificacaoNc } from '../lib/ncClassificacao';
import type { Empresa, ListasNc, NaoConformidade, NcGravacao, NcHistorico, NcListaItem, NcOpcaoReversa, NcOrigem, UsuarioAutenticado } from '../types';
import { demoDados, demoRegistrarHistoricoNc, demoSalvarItemLista, demoSalvarOrigem } from './demoDatabase';
import { podeEditarNc } from '../lib/perfil';
import { CAMPOS_EDITAVEIS, CAMPOS_FINANCEIROS, ConflitoEdicaoNc, ErroEdicaoNc, listarCorrecoes, valorComparavel } from '../lib/ncEdicao';
import type { AuditoriaFinanceiraNc, OpcoesAtualizacaoNc, ResultadoAtualizacaoNc } from '../lib/ncEdicao';
import { usuarioDemoAtual } from './demoMode';

/** Versão nova: o instante atual, mas sempre maior que a versão anterior (a demonstração grava em milissegundos). */
function novaVersao(anterior: string | undefined): string {
  const agora = Date.now();
  const base = anterior ? Date.parse(anterior) : Number.NaN;
  return new Date(Number.isFinite(base) ? Math.max(agora, base + 1) : agora).toISOString();
}

/** Registros da trilha financeira para os campos financeiros que mudaram (mesma regra do banco). */
function registrosDeAuditoria(
  anterior: NaoConformidade,
  alteracoes: Partial<NcGravacao>,
  motivo: string,
  agora: string
): AuditoriaFinanceiraNc[] {
  const usuario = usuarioDemoAtual();
  const antes = anterior as unknown as Record<string, string | number | null | undefined>;
  const novos = alteracoes as unknown as Record<string, string | number | null | undefined>;
  return CAMPOS_FINANCEIROS.flatMap((campo) => {
    if (novos[campo] === undefined) return [];
    const valorAnterior = antes[campo] ?? null;
    const valorPosterior = novos[campo] ?? null;
    if (valorComparavel(campo, valorAnterior) === valorComparavel(campo, valorPosterior)) return [];
    const numerico = campo !== 'custo_situacao';
    return [{
      id: crypto.randomUUID(),
      nc_id: anterior.id,
      campo,
      tipo_alteracao: valorAnterior === null ? 'preenchimento' : 'correcao',
      valor_anterior: numerico ? (valorAnterior as number | null) : null,
      valor_posterior: numerico ? (valorPosterior as number | null) : null,
      texto_anterior: numerico ? null : (valorAnterior as string | null),
      texto_posterior: numerico ? null : (valorPosterior as string | null),
      motivo: motivo || null,
      origem: 'edicao',
      autor_id: usuario.id,
      autor_nome: usuario.nome,
      criado_em: agora,
    }];
  });
}

function atualizarCalculados(item: NaoConformidade): NaoConformidade {
  // Mesma regra do banco e da planilha: sem nenhum valor de custo, o total é vazio (não zero)
  const semCusto = item.custo_produto == null && item.custo_frete_adicional == null && item.custo_multa_outros == null;
  const custoTotal: number | null = semCusto
    ? null
    : (item.custo_produto ?? 0) + (item.custo_frete_adicional ?? 0) + (item.custo_multa_outros ?? 0);
  const reversas = demoDados.solicitacoes().filter((solicitacao) => solicitacao.nc_id === item.id).length;
  return {
    ...item,
    // Versão estável para registros antigos da demonstração (sem updated_at gravado)
    updated_at: item.updated_at ?? item.created_at ?? '2026-10-01T00:00:00.000Z',
    codigo: `NC-${String(item.numero).padStart(4, '0')}`,
    custo_total: custoTotal,
    custo_liquido: custoTotal === null ? null : custoTotal - (item.valor_reembolsado ?? 0),
    area_responsavel: demoDados.listasNc().origens.find((origem) => origem.nome === item.origem)?.area ?? null,
    evitavel: demoDados.listasNc().origens.find((origem) => origem.nome === item.origem)?.evitavel ?? null,
    dias_em_aberto: item.status === 'Encerrada' || item.status === 'Cancelada' || !item.data_ocorrencia
      ? 0
      : Math.max(0, Math.floor((Date.now() - new Date(`${item.data_ocorrencia}T00:00:00`).getTime()) / 86400000)),
    qtd_reversas: reversas,
    classificacao_pendente: classificacaoPendente(item),
  };
}

function novaNc(campos: NcGravacao, numero: number, importada = false): NaoConformidade {
  const agora = new Date().toISOString();
  const derivados = derivarClassificacao<NcGravacao>(null, campos);
  return atualizarCalculados({
    ...derivados,
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
  async criar(campos: NcGravacao): Promise<NaoConformidade> {
    const itens = demoDados.ncs();
    const derivados = derivarClassificacao<NcGravacao>(null, campos);
    const erro = validarClassificacaoNc(null, derivados, demoDados.listasNc());
    if (erro) throw new Error(erro);
    const criada = novaNc(derivados, Math.max(0, ...itens.map((item) => item.numero)) + 1);
    demoDados.salvarNcs([criada, ...itens]);
    demoRegistrarHistoricoNc({ nc_id: criada.id, user_nome: 'Júlia Nascimento', tipo: 'evento', acao: 'Não conformidade registrada.' });
    return criada;
  },
  /**
   * Mesma regra da função do banco (nc_salvar_edicao): permissão, versão conferida antes de
   * qualquer escrita, só os campos alterados, justificativa para correção e trilha financeira.
   */
  async atualizar(id: string, campos: Partial<NcGravacao>, opcoes: OpcoesAtualizacaoNc): Promise<ResultadoAtualizacaoNc> {
    if (!podeEditarNc(usuarioDemoAtual())) throw new ErroEdicaoNc('42501', 'Você não tem permissão para editar esta não conformidade.');
    if (!opcoes?.versao) throw new ErroEdicaoNc('NC004', 'A versão da não conformidade é obrigatória para gravar.');
    const itens = demoDados.ncs();
    const indice = itens.findIndex((item) => item.id === id);
    if (indice < 0) throw new ErroEdicaoNc('NC005', 'Não conformidade não encontrada.');
    const anterior = itens[indice];
    if (anterior.updated_at !== opcoes.versao) throw new ConflitoEdicaoNc();

    const pares = Object.entries(campos).filter(([, valor]) => valor !== undefined);
    const naoEditavel = pares.find(([chave]) => !(CAMPOS_EDITAVEIS as string[]).includes(chave));
    if (naoEditavel) throw new ErroEdicaoNc('NC003', `Campo não editável por esta operação: ${naoEditavel[0]}`);

    const antes = anterior as unknown as Record<string, string | number | null | undefined>;
    // Só o que mudou de fato vai para o registro; o restante permanece como estava
    const alteracoes = Object.fromEntries(
      pares.filter(([chave, valor]) => valorComparavel(chave, valor as string | number | null) !== valorComparavel(chave, antes[chave]))
    ) as Partial<NcGravacao>;
    if (Object.keys(alteracoes).length === 0) return { nc: atualizarCalculados(anterior), gravado: false };

    const motivo = opcoes.motivo?.trim() ?? '';
    if (listarCorrecoes(anterior, alteracoes).length > 0 && motivo === '') {
      throw new ErroEdicaoNc('NC002', 'Para corrigir um valor já registrado, informe a justificativa.');
    }
    if (motivo.length > 300) throw new ErroEdicaoNc('NC002', 'A justificativa deve ter até 300 caracteres.');

    const proximo = derivarClassificacao(anterior, { ...anterior, ...alteracoes } as NaoConformidade);
    const erro = validarClassificacaoNc(anterior, proximo, demoDados.listasNc());
    if (erro) throw new Error(erro);

    const agora = novaVersao(anterior.updated_at);
    const atualizada = atualizarCalculados({ ...proximo, updated_at: agora });
    itens[indice] = atualizada;
    demoDados.salvarNcs(itens);
    demoDados.salvarAuditoriaFinanceiraNcs([...demoDados.auditoriaFinanceiraNcs(), ...registrosDeAuditoria(anterior, alteracoes, motivo, agora)]);
    demoRegistrarHistoricoNc({ nc_id: id, user_nome: usuarioDemoAtual().nome, tipo: 'evento', acao: 'Não conformidade atualizada.' });
    return { nc: atualizada, gravado: true };
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
      .map((item) => ({
        id: item.id, numero: item.numero, codigo: item.codigo, data_ocorrencia: item.data_ocorrencia, cliente: item.cliente,
        origem: item.origem, status: item.status!, tipo_problema: item.tipo_problema ?? null, causador: item.causador ?? null,
      }));
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

