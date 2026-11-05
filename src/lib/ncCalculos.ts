// ── Cálculos da não conformidade ─────────────────────────────────────────────
// Espelham as fórmulas da planilha (REGISTRO_NC e PAINEL_NC). O banco calcula
// os mesmos campos (colunas geradas e vw_nao_conformidades); aqui eles servem
// para mostrar o resultado enquanto o usuário digita e para montar o painel.
// ─────────────────────────────────────────────────────────────────────────────

import { STATUS_NC } from '../types';
import type { ListaNc, ListasNc, NaoConformidade, NcCampos, NcOrigem, StatusNc } from '../types';

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
  custoLiquido: number;
  horas: number;
  emAberto: number;
}

export interface LinhaMesPainelNc {
  mes: number;
  rotulo: string;
  qtd: number;
  evitaveis: number;
  custoLiquido: number;
}

export interface IndicadoresNc {
  registradas: number;
  emAberto: number;
  pctEvitaveis: number;
  custoTotal: number;
  valorReembolsado: number;
  custoLiquido: number;
  custoLiquidoMedio: number;
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
}

export const NAO_INFORMADO = 'Não informado';
export const SEM_STATUS = 'Sem status';
const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

const somar = (ncs: NaoConformidade[], valor: (nc: NaoConformidade) => number | null) =>
  arredondar(ncs.reduce((soma, nc) => soma + (valor(nc) ?? 0), 0));

/** O painel conta só linhas com origem preenchida e data da ocorrência dentro do período. */
export function ncsDoPeriodo(ncs: NaoConformidade[], filtro: FiltroPainelNc): NaoConformidade[] {
  return ncs.filter(
    (nc) =>
      !!nc.origem &&
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
  return [...grupos.entries()].map(([valor, itens]) => ({
    valor,
    qtd: itens.length,
    pct: base.length ? itens.length / base.length : 0,
    custoLiquido: somar(itens, (nc) => nc.custo_liquido),
    horas: somar(itens, (nc) => nc.tempo_tratativa_min) / 60,
    emAberto: itens.filter((nc) => ncEmAberto(nc.status)).length,
  }));
}

export function calcularPainelNc(
  ncs: NaoConformidade[],
  filtro: FiltroPainelNc,
  listas: ListasNc,
  hoje: string = hojeIso()
): PainelNc {
  const base = ncsDoPeriodo(ncs, filtro);
  const registradas = base.length;
  const comReversa = base.filter((nc) => nc.qtd_reversas > 0).length;
  const custoLiquidoTotal = somar(base, (nc) => nc.custo_liquido);

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
      !!nc.origem &&
      !!nc.data_ocorrencia?.startsWith(`${filtro.ano}-`) &&
      (!filtro.empresa || nc.empresa === filtro.empresa)
  );

  return {
    indicadores: {
      registradas,
      emAberto: base.filter((nc) => ncEmAberto(nc.status)).length,
      pctEvitaveis: registradas ? base.filter((nc) => nc.evitavel === 'Sim').length / registradas : 0,
      custoTotal: somar(base, (nc) => nc.custo_total),
      valorReembolsado: somar(base, (nc) => nc.valor_reembolsado),
      custoLiquido: custoLiquidoTotal,
      custoLiquidoMedio: registradas ? arredondar(custoLiquidoTotal / registradas) : 0,
      horasTratativa: somar(base, (nc) => nc.tempo_tratativa_min) / 60,
      diasMediosEmAberto: dias.length ? dias.reduce((a, b) => a + b, 0) / dias.length : 0,
      comReversa,
      pctComReversa: registradas ? comReversa / registradas : 0,
    },
    porOrigem: agrupar(base, (nc) => nc.origem ?? NAO_INFORMADO, origensAtivas),
    porArea: agrupar(base, (nc) => nc.area_responsavel ?? NAO_INFORMADO, valoresDaLista(listas, 'area')),
    porEmpresa: agrupar(base, (nc) => nc.empresa ?? NAO_INFORMADO, valoresDaLista(listas, 'empresa')),
    porTipoSaida: agrupar(base, (nc) => nc.tipo_saida ?? NAO_INFORMADO, valoresDaLista(listas, 'tipo_saida')),
    porResolucao: agrupar(base, (nc) => nc.resolucao ?? NAO_INFORMADO, valoresDaLista(listas, 'resolucao')),
    porStatus: agrupar(base, (nc) => nc.status ?? SEM_STATUS, [...STATUS_NC]),
    porMes: MESES.map((rotulo, i) => {
      const itens = doAno.filter((nc) => Number(nc.data_ocorrencia!.slice(5, 7)) === i + 1);
      return {
        mes: i + 1,
        rotulo,
        qtd: itens.length,
        evitaveis: itens.filter((nc) => nc.evitavel === 'Sim').length,
        custoLiquido: somar(itens, (nc) => nc.custo_liquido),
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
