// ── Situação do custo e valores: uma regra só para detalhe, lista, painel e relatório ──
// Pura (sem React e sem planilha). Regras:
// - "Não": "Sem custo". Os valores gravados ficam como estão; nada é apagado aqui.
// - "Sim" sem valor: "Valor não informado". "Em apuração" sem valor: "A apurar".
// - Situação ausente: "Não informado" (com valor, o valor aparece com essa observação).
// - Vazio não é zero; zero digitado é zero. Total com campo de custo vazio é parcial.
// - Reembolso vazio não comprova ausência de reembolso: só valor digitado (inclusive zero) é informado.
// ─────────────────────────────────────────────────────────────────────────────

import { SITUACOES_CUSTO_NC } from '../types';
import type { SituacaoCustoNc } from '../types';

export const SEM_CUSTO = 'Sem custo';
export const VALOR_NAO_INFORMADO = 'Valor não informado';
export const A_APURAR = 'A apurar';
export const SITUACAO_NAO_INFORMADA = 'Não informado';
export const SEM_VALOR_REGISTRADO = 'Sem valor registrado';

const formatadorReais = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

/** Valor em reais (sem tratamento de vazio: para null, use formatarMoeda de ncCalculos). */
export function reais(valor: number): string {
  return formatadorReais.format(valor);
}

const arredondar = (v: number) => Math.round(v * 100) / 100;

/** Valores como o banco guarda: null/undefined = não informado; número = informado (zero conta). */
export interface ValoresCusto {
  custo_produto?: number | null;
  custo_frete_adicional?: number | null;
  custo_multa_outros?: number | null;
  valor_reembolsado?: number | null;
}

/** Registro com situação do custo e valores. */
export type RegistroCusto = ValoresCusto & { custo_situacao?: string | null };

/**
 * Categoria exclusiva de cada registro (soma: sem custo + com valor + valor não informado +
 * a apurar + sem situação e sem valor = total de registros).
 */
export type CategoriaCusto = 'sem_custo' | 'com_valor' | 'valor_nao_informado' | 'a_apurar' | 'sem_situacao';

const ROTULO_CATEGORIA: Record<Exclude<CategoriaCusto, 'com_valor'>, string> = {
  sem_custo: SEM_CUSTO,
  valor_nao_informado: VALOR_NAO_INFORMADO,
  a_apurar: A_APURAR,
  sem_situacao: SITUACAO_NAO_INFORMADA,
};

export interface DescricaoCusto {
  categoria: CategoriaCusto;
  /** "Não" com valor positivo: só existe no formulário antes de gravar (o banco recusa). */
  conflito: boolean;
  /** Soma dos campos informados; null quando nenhum campo de custo foi informado. */
  total: number | null;
  /** Total − reembolso (reembolso vazio conta como zero na conta, como no banco). null sem total. */
  liquido: number | null;
  /** Total com algum campo de custo vazio. */
  parcial: boolean;
  emApuracao: boolean;
  reembolsoInformado: boolean;
  /** Texto do custo total: "Sem custo", "Valor não informado", "A apurar", "Não informado" ou o valor com observações. */
  rotuloTotal: string;
  /** Mesma regra, com o custo líquido. */
  rotuloLiquido: string;
  /** Situação com o estado do valor, para relatórios: "Não", "Sim (valor não informado)", "Sim (parcial)"... */
  rotuloSituacao: string;
  /** Aviso quando há total e o reembolso não foi informado; null caso contrário. */
  notaReembolso: string | null;
}

function situacaoValida(situacao: string | null | undefined): SituacaoCustoNc | null {
  return (SITUACOES_CUSTO_NC as readonly string[]).includes(situacao ?? '') ? (situacao as SituacaoCustoNc) : null;
}

/** Descreve a situação e os valores de um registro, com a regra única de custo. */
export function descreverCusto(situacao: string | null | undefined, valores: ValoresCusto): DescricaoCusto {
  const sit = situacaoValida(situacao);
  const componentes = [valores.custo_produto, valores.custo_frete_adicional, valores.custo_multa_outros];
  const informados = componentes.filter((v): v is number => typeof v === 'number');
  const total = informados.length ? arredondar(informados.reduce((soma, v) => soma + v, 0)) : null;
  const reembolso = typeof valores.valor_reembolsado === 'number' ? valores.valor_reembolsado : null;
  const liquido = total === null ? null : arredondar(total - (reembolso ?? 0));
  const vazios = componentes.length - informados.length;

  const categoria: CategoriaCusto =
    sit === 'Não' ? 'sem_custo'
      : total !== null ? 'com_valor'
        : sit === 'Sim' ? 'valor_nao_informado'
          : sit === 'Em apuração' ? 'a_apurar'
            : 'sem_situacao';

  const parcial = categoria === 'com_valor' && vazios > 0;
  const emApuracao = sit === 'Em apuração';
  const conflito = sit === 'Não' && total !== null && total > 0;
  const reembolsoInformado = reembolso !== null;

  const observacoes: string[] = [];
  if (categoria === 'com_valor') {
    if (parcial) observacoes.push('parcial');
    if (emApuracao) observacoes.push('em apuração');
    if (sit === null) observacoes.push('situação não informada');
  }
  const sufixo = observacoes.length ? ` (${observacoes.join(', ')})` : '';

  const categoriaFixa = categoria;
  const rotulo = (valor: number | null): string => {
    if (conflito) return `${reais(total ?? 0)} (conflito: situação “Não” com valor)`;
    if (categoriaFixa !== 'com_valor') return ROTULO_CATEGORIA[categoriaFixa];
    return `${reais(valor ?? 0)}${sufixo}`;
  };

  const rotuloSituacao = (() => {
    if (sit === null) return SITUACAO_NAO_INFORMADA;
    if (sit === 'Não') return 'Não';
    if (sit === 'Sim') {
      if (categoria === 'valor_nao_informado') return 'Sim (valor não informado)';
      return parcial ? 'Sim (parcial)' : 'Sim';
    }
    if (categoria === 'a_apurar') return 'Em apuração (a apurar)';
    return parcial ? 'Em apuração (parcial)' : 'Em apuração';
  })();

  return {
    categoria,
    conflito,
    total,
    liquido,
    parcial,
    emApuracao,
    reembolsoInformado,
    rotuloTotal: rotulo(total),
    rotuloLiquido: rotulo(liquido),
    rotuloSituacao,
    notaReembolso: categoria === 'com_valor' && !reembolsoInformado ? 'reembolso não informado' : null,
  };
}

/** Texto do campo de reembolso: vazio não é zero; zero digitado é informado. */
export function rotuloReembolso(valor: string | number | null | undefined): string {
  if (valor === null || valor === undefined) return 'Não informado. Vazio não é zero: só conta o valor digitado.';
  if (typeof valor === 'string' && valor.trim() === '') return 'Não informado. Vazio não é zero: só conta o valor digitado.';
  const n = typeof valor === 'number' ? valor : Number(valor);
  if (!Number.isFinite(n)) return '';
  return n === 0 ? 'Zero informado (R$ 0,00).' : `Informado: ${reais(n)}.`;
}

// ── Filtro de custo da lista ────────────────────────────────────────────────

export type FiltroCusto = 'todos' | 'sem_custo' | 'valor_nao_informado' | 'a_apurar' | 'com_valor' | 'sem_situacao';

export const ROTULOS_FILTRO_CUSTO: Record<FiltroCusto, string> = {
  todos: 'Todos os custos',
  sem_custo: 'Sem custo (Não)',
  valor_nao_informado: 'Valor não informado (Sim)',
  a_apurar: 'A apurar (Em apuração sem valor)',
  com_valor: 'Com valor registrado',
  sem_situacao: 'Situação não informada',
};

export function atendeFiltroCusto(registro: RegistroCusto, filtro: FiltroCusto): boolean {
  if (filtro === 'todos') return true;
  if (filtro === 'sem_situacao') return situacaoValida(registro.custo_situacao) === null;
  return descreverCusto(registro.custo_situacao, registro).categoria === filtro;
}

// ── Cobertura e somas (painel e relatório usam as mesmas contas) ────────────

export interface CoberturaCusto {
  /** Registros considerados (todos do período). */
  registradas: number;
  semCusto: number;
  comValor: number;
  comValorSim: number;
  comValorEmApuracao: number;
  comValorSemSituacao: number;
  valorNaoInformado: number;
  aApurar: number;
  semSituacaoSemValor: number;
  /** Com valor e com algum campo de custo vazio. */
  parciais: number;
  /** Situação "Em apuração", com ou sem valor. */
  emApuracao: number;
  /** Situação ausente, com ou sem valor. */
  situacaoNaoInformada: number;
  reembolsoInformado: number;
  /** Com valor e reembolso não informado. */
  comValorSemReembolso: number;
}

export function cobrirCusto(registros: RegistroCusto[]): CoberturaCusto {
  const c: CoberturaCusto = {
    registradas: registros.length, semCusto: 0, comValor: 0, comValorSim: 0, comValorEmApuracao: 0, comValorSemSituacao: 0,
    valorNaoInformado: 0, aApurar: 0, semSituacaoSemValor: 0, parciais: 0, emApuracao: 0, situacaoNaoInformada: 0,
    reembolsoInformado: 0, comValorSemReembolso: 0,
  };
  for (const registro of registros) {
    const d = descreverCusto(registro.custo_situacao, registro);
    const sit = situacaoValida(registro.custo_situacao);
    if (sit === 'Em apuração') c.emApuracao++;
    if (sit === null) c.situacaoNaoInformada++;
    if (d.reembolsoInformado) c.reembolsoInformado++;
    switch (d.categoria) {
      case 'sem_custo':
        c.semCusto++;
        break;
      case 'com_valor':
        c.comValor++;
        if (sit === 'Sim') c.comValorSim++;
        else if (sit === 'Em apuração') c.comValorEmApuracao++;
        else c.comValorSemSituacao++;
        if (d.parcial) c.parciais++;
        if (!d.reembolsoInformado) c.comValorSemReembolso++;
        break;
      case 'valor_nao_informado':
        c.valorNaoInformado++;
        break;
      case 'a_apurar':
        c.aApurar++;
        break;
      case 'sem_situacao':
        c.semSituacaoSemValor++;
        break;
    }
  }
  return c;
}

export interface SomaCusto {
  /** Soma dos totais dos registros com valor; null sem nenhum. */
  total: number | null;
  /** Soma dos líquidos dos registros com valor; null sem nenhum. */
  liquido: number | null;
  /** Soma dos reembolsos informados (zero conta); null se nenhum foi informado. */
  reembolso: number | null;
  comValor: number;
  parciais: number;
  emApuracao: number;
}

export function somarCusto(registros: RegistroCusto[]): SomaCusto {
  let total = 0;
  let liquido = 0;
  let reembolso = 0;
  let comReembolso = 0;
  let comValor = 0;
  let parciais = 0;
  let emApuracao = 0;
  for (const registro of registros) {
    const d = descreverCusto(registro.custo_situacao, registro);
    if (d.categoria === 'com_valor') {
      comValor++;
      total += d.total ?? 0;
      liquido += d.liquido ?? 0;
      if (d.parcial) parciais++;
    }
    if (registro.custo_situacao === 'Em apuração') emApuracao++;
    if (d.reembolsoInformado) {
      comReembolso++;
      reembolso += registro.valor_reembolsado ?? 0;
    }
  }
  return {
    total: comValor ? arredondar(total) : null,
    liquido: comValor ? arredondar(liquido) : null,
    reembolso: comReembolso ? arredondar(reembolso) : null,
    comValor,
    parciais,
    emApuracao,
  };
}

/** Resumo de um grupo (linha de tabela): valor com cobertura, ou o estado quando não há valor. */
export interface ResumoGrupoCusto {
  rotulo: string;
  detalhe: string | null;
  comValor: number;
  liquido: number | null;
  parciais: number;
}

export function resumirGrupoCusto(registros: RegistroCusto[]): ResumoGrupoCusto {
  if (registros.length === 0) return { rotulo: '—', detalhe: null, comValor: 0, liquido: null, parciais: 0 };
  const soma = somarCusto(registros);
  const categorias = [...new Set(registros.map((r) => descreverCusto(r.custo_situacao, r).categoria))];
  const unica = categorias.length === 1 ? categorias[0] : null;
  let rotulo: string;
  if (soma.liquido !== null) rotulo = reais(soma.liquido);
  else if (unica && unica !== 'com_valor') rotulo = ROTULO_CATEGORIA[unica];
  else rotulo = SEM_VALOR_REGISTRADO;

  const partes: string[] = [];
  if (soma.comValor > 0 && soma.comValor < registros.length) partes.push(`${soma.comValor} de ${registros.length} com valor`);
  if (soma.parciais > 0) partes.push(`${soma.parciais} ${soma.parciais === 1 ? 'parcial' : 'parciais'}`);
  if (soma.emApuracao > 0) partes.push(`${soma.emApuracao} em apuração`);
  return {
    rotulo,
    detalhe: partes.length ? partes.join(' · ') : null,
    comValor: soma.comValor,
    liquido: soma.liquido,
    parciais: soma.parciais,
  };
}
