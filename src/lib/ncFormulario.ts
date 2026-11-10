// ── Estado do formulário de NC: registro gravado ↔ campos, e custos ─────────
// Regra central: nada que o formulário não mostra pode virar vazio ao gravar.
// Ocultar um bloco (custos, com "Não") mantém os valores no estado; quando a
// resposta conflita com o que está gravado, o aviso explica e nada é gravado
// automaticamente. Conferência do banco: src/lib/ncClassificacao.ts.
// Rótulos de custo (sem valor, parcial, a apurar): src/lib/ncCustos.ts.
// ─────────────────────────────────────────────────────────────────────────────

import type { NaoConformidade, NcGravacao } from '../types';
import type { NcFormInput } from '../schemas/ncSchema';
import { hojeIso } from './ncCalculos';
import { descreverCusto } from './ncCustos';
import type { ValoresCusto } from './ncCustos';

/** Campos em reais que o formulário mostra quando há custo. */
export const CAMPOS_CUSTO_VALOR = ['custo_produto', 'custo_frete_adicional', 'custo_multa_outros'] as const;
/** Valores em reais que só aparecem com custo (inclui o reembolso). */
export const CAMPOS_DINHEIRO = [...CAMPOS_CUSTO_VALOR, 'valor_reembolsado'] as const;

/** Conflito de "Não" com valores registrados: explica a regra e a ação possível. */
export const MENSAGEM_CONFLITO_NAO =
  'Esta NC tem valores de custo registrados. Para marcar “Não”, esses valores precisam estar zerados: corrija-os para zero, informe a justificativa e confirme. O valor anterior fica registrado no histórico financeiro. Nada é apagado automaticamente.';

/** "Não" com um valor já registrado deixado em branco: a ação possível é informar zero. */
export const MENSAGEM_NAO_COM_CAMPO_EM_BRANCO =
  'Não é possível marcar “Não” e deixar em branco um valor já registrado nesta mesma alteração. Para registrar que não houve custo, informe zero nos valores registrados, informe a justificativa e confirme a correção.';

/** Texto de um campo vazio (sem valor) de um registro novo ou legado. */
export const VAZIO: NcFormInput = {
  data_ocorrencia: '', data_identificacao: '', empresa: '', cliente: '', vendedora: '', romaneio: '',
  valor_romaneio: '', nf: '', rastreio: '', data_postagem: '',
  tipo_saida: '', origem: '', como_identificada: '',
  status_correios: '', descricao: '', resolucao: '', novo_rastreio: '',
  valor_declarado: '', valor_venda: '', frete_original: '',
  custo_produto: '', custo_frete_adicional: '', custo_multa_outros: '', reembolso_correios: '', numero_pi: '',
  valor_reembolsado: '',
  tempo_tratativa_min: '', status: 'Aberta', data_encerramento: '',
  tipo_problema: '', causador: '', area_registro: '', area_tratativa: '', custo_situacao: '',
};

/**
 * NC gravada → texto do formulário. Converte todas as chaves do formulário: um campo
 * que falte aqui seria gravado como vazio (apagando o valor) na primeira gravação.
 */
export function paraFormulario(nc: NaoConformidade | NcGravacao): NcFormInput {
  const texto = (v: unknown) => (v === null || v === undefined ? '' : String(v));
  const registro = nc as unknown as Record<string, unknown>;
  return Object.fromEntries(Object.keys(VAZIO).map((campo) => [campo, texto(registro[campo])])) as NcFormInput;
}

/** Formulário de um registro novo: data sugerida como hoje (editável). */
export function novaAbertura(hoje: string = hojeIso()): NcFormInput {
  return { ...VAZIO, data_ocorrencia: hoje };
}

/** Texto de um valor em reais contém um número maior que zero. */
export function valorPositivoTexto(v: string): boolean {
  if (v.trim() === '') return false;
  const n = Number(v);
  return Number.isFinite(n) && n > 0;
}

/** Texto de um valor em reais está preenchido (zero conta). */
export function valorPreenchidoTexto(v: string): boolean {
  return v.trim() !== '';
}

export interface EstadoCustos {
  /** Mostra os campos de valor em reais. Ocultar não apaga nada: os valores continuam no estado. */
  mostrarValores: boolean;
  /** Conflito de "Não" com valor registrado: explica, sem gravar nada. */
  conflitoNao: string | null;
}

/**
 * Como os blocos de custo aparecem para cada resposta de "Houve custo?".
 * - Sim e Em apuração: campos visíveis; em branco é "não sabido", não zero.
 * - Não: sem valor positivo, os campos em reais ficam ocultos (sem pedir valores);
 *   com valor positivo, ficam visíveis e o conflito é explicado.
 * - Sem resposta: aparecem só se já houver algum valor (registro antigo).
 */
export function estadoCustos(form: Pick<NcFormInput, 'custo_situacao' | (typeof CAMPOS_DINHEIRO)[number]>): EstadoCustos {
  const valores = CAMPOS_DINHEIRO.map((campo) => form[campo] ?? '');
  const situacao = form.custo_situacao ?? '';
  if (situacao === 'Não') {
    const comPositivo = valores.some(valorPositivoTexto);
    return { mostrarValores: comPositivo, conflitoNao: comPositivo ? MENSAGEM_CONFLITO_NAO : null };
  }
  if (situacao === 'Sim' || situacao === 'Em apuração') return { mostrarValores: true, conflitoNao: null };
  return { mostrarValores: valores.some(valorPreenchidoTexto), conflitoNao: null };
}

/**
 * Custo total na tela, pela regra única de ncCustos: sem valor, "Sem custo", "Valor não
 * informado", "A apurar" ou "Não informado"; com valor, o total com as observações necessárias.
 */
export function rotuloCustoTotal(situacao: string | null | undefined, custos: ValoresCusto): string {
  return descreverCusto(situacao, custos).rotuloTotal;
}
