// ── Cálculos da não conformidade ─────────────────────────────────────────────
// Espelham as fórmulas da planilha (REGISTRO_NC e PAINEL_NC). O banco calcula
// os mesmos campos (colunas geradas e vw_nao_conformidades); aqui eles servem
// para mostrar o resultado enquanto o usuário digita e para montar o painel.
// ─────────────────────────────────────────────────────────────────────────────

import { SITUACOES_CUSTO_NC, STATUS_NC } from '../types';
import type { ListaNc, ListasNc, NaoConformidade, NcCampos, NcOrigem, StatusNc } from '../types';
import { classificacaoPendente } from './ncClassificacao';
import { cobrirCusto, resumirGrupoCusto, somarCusto } from './ncCustos';
import type { CoberturaCusto, ResumoGrupoCusto } from './ncCustos';

type Custos = Pick<NcCampos, 'custo_produto' | 'custo_frete_adicional' | 'custo_multa_outros'>;

const arredondar = (v: number) => Math.round(v * 100) / 100;
const pad = (n: number) => String(n).padStart(2, '0');

/** ID da planilha: ="NC-"&TEXT(n,"0000") */
export function codigoNc(numero: number): string {
  return `NC-${String(numero).padStart(4, '0')}`;
}

/** Custo total: =IF(COUNT(X:Z)=0,"",SUM(X:Z)) */
export function custoTotal(c: Custos): number | null {
  const valores = [c.custo_produto, c.custo_frete_adicional, c.custo_multa_outros];
  if (valores.every((v) => v === null)) return null;
  return arredondar(valores.reduce<number>((soma, v) => soma + (v ?? 0), 0));
}

/** Custo líquido: =IF(AA="","",AA-N(AD)) — custo total menos o valor reembolsado pelos Correios */
export function custoLiquido(c: Custos & Pick<NcCampos, 'valor_reembolsado'>): number | null {
  const total = custoTotal(c);
  return total === null ? null : arredondar(total - (c.valor_reembolsado ?? 0));
}

/** Data local de hoje no formato YYYY-MM-DD. */
export function hojeIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

const paraUtc = (iso: string) => {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return Date.UTC(y, m - 1, d);
};

/** Dias em aberto: =(encerramento ou hoje) − (identificação ou ocorrência) */
export function diasEmAberto(
  nc: Pick<NcCampos, 'data_ocorrencia' | 'data_identificacao' | 'data_encerramento'>,
  hoje: string = hojeIso()
): number | null {
  const inicio = nc.data_identificacao ?? nc.data_ocorrencia;
  if (!inicio) return null;
  return Math.round((paraUtc(nc.data_encerramento ?? hoje) - paraUtc(inicio)) / 86_400_000);
}

/** Área responsável e "evitável" vêm da origem: =VLOOKUP(origem, LISTAS_NC!A:C, …) */
export function classificarOrigem(
  origem: string | null,
  origens: NcOrigem[]
): { area: string | null; evitavel: string | null } {
  if (!origem) return { area: null, evitavel: null };
  const o = origens.find((x) => x.nome === origem);
  return { area: o?.area ?? 'A definir', evitavel: o?.evitavel ?? 'A avaliar' };
}

/** No painel, "em aberto" = status Aberta ou Em tratativa. */
export function ncEmAberto(status: StatusNc | null): boolean {
  return status === 'Aberta' || status === 'Em tratativa';
}

/** Valores ativos de uma lista, na ordem definida. */
export function valoresDaLista(listas: ListasNc, lista: ListaNc): string[] {
  return listas.itens
    .filter((i) => i.lista === lista && i.ativo)
    .sort((a, b) => a.ordem - b.ordem)
    .map((i) => i.valor);
}

/** Opções de um select: valores ativos + o valor atual, mesmo que desativado depois. */
export function opcoesComAtual(opcoes: string[], atual: string | null): string[] {
  return atual && !opcoes.includes(atual) ? [...opcoes, atual] : opcoes;
}

// ── Painel (PAINEL_NC) ───────────────────────────────────────────────────────
// Base: todas as NCs com data da ocorrência no período ("registradas"). Pendentes de
// classificação entram na base e aparecem à parte (classificadas x pendentes); nenhuma
// NC é excluída para fazer os números coincidirem. Custos: regra de src/lib/ncCustos.ts.

export interface FiltroPainelNc {
  /** YYYY-MM-DD; vazio = sem limite */
  dataInicio: string;
  /** YYYY-MM-DD; vazio = sem limite */
  dataFim: string;
  /** Ano da visão mensal */
  ano: number;
  /** Restringe a uma empresa / contrato (não existe na planilha; usado no dashboard) */
  empresa?: string | null;
}

export interface LinhaPainelNc {
  valor: string;
  qtd: number;
  pct: number;
  /** Custo líquido dos registros com valor; null quando nenhum tem valor (nunca zero por ausência). */
  custoLiquido: number | null;
  /** Registros com valor de custo (situação diferente de Não). */
  comValor: number;
  /** Registros com valor e algum campo de custo vazio. */
  parciais: number;
  /** Texto do custo na tabela: o valor, ou o estado quando não há valor. */
  rotuloCusto: string;
  /** Cobertura do custo do grupo, ex.: "2 de 3 com valor · 1 parcial". */
  detalheCusto: string | null;
  horas: number;
  emAberto: number;
}

export interface LinhaMesPainelNc {
  mes: number;
  rotulo: string;
  qtd: number;
  evitaveis: number;
  custoLiquido: number | null;
  comValor: number;
  rotuloCusto: string;
  detalheCusto: string | null;
}

export interface IndicadoresNc {
  /** Todas as NCs do período. */
  registradas: number;
  classificadas: number;
  pendentes: number;
  emAberto: number;
  /** Proporção de "Sim" entre os registros com evitável definido (regra de origem antiga, sem mudança). */
  pctEvitaveis: number;
  /** Denominador do percentual: registros com evitável definido (Sim, Não ou A avaliar). */
  evitaveisBase: number;
  evitaveisSim: number;
  evitaveisNao: number;
  evitaveisAvaliar: number;
  /** Registros sem evitável (sem origem antiga). */
  evitaveisSemInformacao: number;
  /** Soma dos custos totais registrados; null sem nenhum valor registrado. */
  custoTotal: number | null;
  /** Soma dos reembolsos informados; null se nenhum foi informado (vazio não é zero). */
  valorReembolsado: number | null;
  reembolsoInformado: number;
  comValorSemReembolso: number;
  /** Soma do custo líquido dos registros com valor; null sem valor. */
  custoLiquido: number | null;
  /** Custo líquido registrado ÷ total de NCs registradas (inclui as sem custo). null sem valor. */
  custoLiquidoPorNc: number | null;
  /** Custo líquido registrado ÷ NCs com valor registrado. null sem valor. */
  custoLiquidoMedioComValor: number | null;
  comValor: number;
  parciais: number;
  cobertura: CoberturaCusto;
  horasTratativa: number;
  diasMediosEmAberto: number;
  comReversa: number;
  pctComReversa: number;
}

export interface PainelNc {
  indicadores: IndicadoresNc;
  porOrigem: LinhaPainelNc[];
  porArea: LinhaPainelNc[];
  porEmpresa: LinhaPainelNc[];
  porTipoSaida: LinhaPainelNc[];
  porResolucao: LinhaPainelNc[];
  porStatus: LinhaPainelNc[];
  porMes: LinhaMesPainelNc[];
  /** Registros novos: classificação explícita (tipo, causador, área de tratativa e situação do custo). */
  porTipoProblema: LinhaPainelNc[];
  porCausador: LinhaPainelNc[];
  porAreaTratativa: LinhaPainelNc[];
  porSituacaoCusto: LinhaPainelNc[];
}

export const NAO_INFORMADO = 'Não informado';
export const SEM_STATUS = 'Sem status';
/** Linhas dos registros novos nas tabelas que dependem da origem antiga (ou sem classificação nova). */
export const SEM_ORIGEM_ANTIGA = 'Sem origem antiga (registro novo)';
export const SEM_TIPO = 'Sem tipo (a revisar)';
export const SEM_CAUSADOR = 'Sem causador (a revisar)';
export const NAO_ATRIBUIDA = 'Não atribuída';
export const SEM_SITUACAO_CUSTO = 'Não informado';
const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

/** Soma de horas: tempo não informado não entra na soma (e não vira zero na exibição). */
const somaNumeros = (valores: Array<number | null | undefined>) =>
  arredondar(valores.reduce<number>((soma, v) => soma + (typeof v === 'number' ? v : 0), 0));

/** NCs com data da ocorrência dentro do período e da empresa (classificadas ou não). */
export function ncsDoPeriodo(ncs: NaoConformidade[], filtro: FiltroPainelNc): NaoConformidade[] {
  return ncs.filter(
    (nc) =>
      !!nc.data_ocorrencia &&
      (!filtro.dataInicio || nc.data_ocorrencia >= filtro.dataInicio) &&
      (!filtro.dataFim || nc.data_ocorrencia <= filtro.dataFim) &&
      (!filtro.empresa || nc.empresa === filtro.empresa)
  );
}

/**
 * Agrupa como as tabelas do painel: todos os valores da lista (mesmo com zero),
 * na ordem da lista, e depois os valores sem lista que tiverem registro.
 */
function agrupar(
  base: NaoConformidade[],
  chave: (nc: NaoConformidade) => string,
  ordem: string[]
): LinhaPainelNc[] {
  const grupos = new Map<string, NaoConformidade[]>(ordem.map((v) => [v, []]));
  for (const nc of base) {
    const valor = chave(nc);
    grupos.set(valor, [...(grupos.get(valor) ?? []), nc]);
  }
  return [...grupos.entries()].map(([valor, itens]) => {
    const custo: ResumoGrupoCusto = resumirGrupoCusto(itens);
    return {
      valor,
      qtd: itens.length,
      pct: base.length ? itens.length / base.length : 0,
      custoLiquido: custo.liquido,
      comValor: custo.comValor,
      parciais: custo.parciais,
      rotuloCusto: custo.rotulo,
      detalheCusto: custo.detalhe,
      horas: somaNumeros(itens.map((nc) => nc.tempo_tratativa_min)) / 60,
      emAberto: itens.filter((nc) => ncEmAberto(nc.status)).length,
    };
  });
}

export function calcularPainelNc(
  ncs: NaoConformidade[],
  filtro: FiltroPainelNc,
  listas: ListasNc,
  hoje: string = hojeIso()
): PainelNc {
  const base = ncsDoPeriodo(ncs, filtro);
  const registradas = base.length;
  const classificadas = base.filter((nc) => !classificacaoPendente(nc)).length;
  const cobertura = cobrirCusto(base);
  const soma = somarCusto(base);
  const comReversa = base.filter((nc) => nc.qtd_reversas > 0).length;

  // Evitável é da origem antiga. A regra de cálculo é a mesma de antes: "A avaliar" conta
  // no denominador. Registros sem origem antiga aparecem como "sem informação".
  const comEvitavel = base.filter((nc) => nc.evitavel !== null);
  const evitaveisSim = comEvitavel.filter((nc) => nc.evitavel === 'Sim').length;
  const evitaveisNao = comEvitavel.filter((nc) => nc.evitavel === 'Não').length;
  const evitaveisAvaliar = comEvitavel.filter((nc) => nc.evitavel === 'A avaliar').length;

  // Dias médios: só ocorrências com status preenchido
  const dias = base
    .filter((nc) => nc.status !== null)
    .map((nc) => diasEmAberto(nc, hoje))
    .filter((d): d is number => d !== null);

  const origensAtivas = [...listas.origens]
    .filter((o) => o.ativo)
    .sort((a, b) => a.ordem - b.ordem)
    .map((o) => o.nome);

  const doAno = ncs.filter(
    (nc) =>
      !!nc.data_ocorrencia?.startsWith(`${filtro.ano}-`) &&
      (!filtro.empresa || nc.empresa === filtro.empresa)
  );

  return {
    indicadores: {
      registradas,
      classificadas,
      pendentes: registradas - classificadas,
      emAberto: base.filter((nc) => ncEmAberto(nc.status)).length,
      pctEvitaveis: comEvitavel.length ? evitaveisSim / comEvitavel.length : 0,
      evitaveisBase: comEvitavel.length,
      evitaveisSim,
      evitaveisNao,
      evitaveisAvaliar,
      evitaveisSemInformacao: registradas - comEvitavel.length,
      custoTotal: soma.total,
      valorReembolsado: soma.reembolso,
      reembolsoInformado: cobertura.reembolsoInformado,
      comValorSemReembolso: cobertura.comValorSemReembolso,
      custoLiquido: soma.liquido,
      custoLiquidoPorNc: soma.liquido !== null && registradas ? arredondar(soma.liquido / registradas) : null,
      custoLiquidoMedioComValor: soma.liquido !== null && soma.comValor ? arredondar(soma.liquido / soma.comValor) : null,
      comValor: soma.comValor,
      parciais: soma.parciais,
      cobertura,
      horasTratativa: somaNumeros(base.map((nc) => nc.tempo_tratativa_min)) / 60,
      diasMediosEmAberto: dias.length ? dias.reduce((a, b) => a + b, 0) / dias.length : 0,
      comReversa,
      pctComReversa: registradas ? comReversa / registradas : 0,
    },
    porOrigem: agrupar(base, (nc) => nc.origem ?? SEM_ORIGEM_ANTIGA, origensAtivas),
    porArea: agrupar(base, (nc) => nc.area_responsavel ?? SEM_ORIGEM_ANTIGA, valoresDaLista(listas, 'area')),
    porEmpresa: agrupar(base, (nc) => nc.empresa ?? NAO_INFORMADO, valoresDaLista(listas, 'empresa')),
    porTipoSaida: agrupar(base, (nc) => nc.tipo_saida ?? NAO_INFORMADO, valoresDaLista(listas, 'tipo_saida')),
    porResolucao: agrupar(base, (nc) => nc.resolucao ?? NAO_INFORMADO, valoresDaLista(listas, 'resolucao')),
    porStatus: agrupar(base, (nc) => nc.status ?? SEM_STATUS, [...STATUS_NC]),
    porTipoProblema: agrupar(base, (nc) => nc.tipo_problema ?? SEM_TIPO, valoresDaLista(listas, 'tipo_problema')),
    porCausador: agrupar(base, (nc) => nc.causador ?? SEM_CAUSADOR, valoresDaLista(listas, 'causador')),
    porAreaTratativa: agrupar(base, (nc) => nc.area_tratativa ?? NAO_ATRIBUIDA, valoresDaLista(listas, 'area')),
    porSituacaoCusto: agrupar(base, (nc) => nc.custo_situacao ?? SEM_SITUACAO_CUSTO, [...SITUACOES_CUSTO_NC]),
    porMes: MESES.map((rotulo, i) => {
      const itens = doAno.filter((nc) => Number(nc.data_ocorrencia!.slice(5, 7)) === i + 1);
      const custo = resumirGrupoCusto(itens);
      return {
        mes: i + 1,
        rotulo,
        qtd: itens.length,
        evitaveis: itens.filter((nc) => nc.evitavel === 'Sim').length,
        custoLiquido: custo.liquido,
        comValor: custo.comValor,
        rotuloCusto: custo.rotulo,
        detalheCusto: custo.detalhe,
      };
    }),
  };
}

/** Anos com ocorrência registrada, do mais recente para o mais antigo. */
export function anosComOcorrencia(ncs: NaoConformidade[]): number[] {
  const anos = new Set(ncs.filter((nc) => nc.data_ocorrencia).map((nc) => Number(nc.data_ocorrencia!.slice(0, 4))));
  return [...anos].sort((a, b) => b - a);
}

// ── Formatação ───────────────────────────────────────────────────────────────

const moeda = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

/** Valor em reais; null vira traço (use o rótulo de ncCustos quando houver um estado do custo). */
export function formatarMoeda(v: number | null | undefined): string {
  return v === null || v === undefined ? '—' : moeda.format(v);
}

export function formatarPct(v: number): string {
  return `${(v * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`;
}

export function formatarNumero(v: number, casas = 1): string {
  return v.toLocaleString('pt-BR', { maximumFractionDigits: casas });
}

/** YYYY-MM-DD → dd/mm/aaaa */
export function formatarDataBr(iso: string | null | undefined): string {
  if (!iso) return '—';
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}
