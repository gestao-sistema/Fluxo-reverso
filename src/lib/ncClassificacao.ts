// ── Classificação da NC: problema, origem/causador, áreas e situação do custo ──
// Espelha, no front-end, as regras que o banco aplica (migration 20261109100000):
// o adaptador de demonstração e o schema usam estas funções para antecipar o erro.
// O banco é a autoridade; a paridade com a migration é testada em
// src/test/ncClassificacao.test.ts.
// ─────────────────────────────────────────────────────────────────────────────

import { SITUACOES_CUSTO_NC } from '../types';
import type { ListasNc, NcCampos, NcClassificacao, NcGravacao, NcListaItem, SituacaoCustoNc } from '../types';

/** Tipos de problema iniciais (lista tipo_problema, na ordem da migration). */
export const TIPOS_PROBLEMA_PADRAO = [
  'Endereço incorreto',
  'Mercadoria trocada ou embalada junto',
  'Etiqueta ou pré-postagem',
  'Embalagem inadequada / avaria por embalagem',
  'Atraso de postagem',
  'Postagem duplicada',
  'Postagem sem NF',
  'Erro de faturamento / NF',
  'Tipo de frete incorreto (CIF/FOB)',
  'Frete não cobrado na venda',
  'Reverso sem autorização',
  'Frete carona',
  'Mercadoria apreendida',
  'Extravio',
  'Avaria no transporte',
  'Entregue para a pessoa errada',
  'Consta entregue / não entregue no local',
  'Endereço não localizado',
  'Entregador não atendido',
  'Cliente desconhecido',
  'Entregue, porém cliente afirma que não recebeu',
  'Mercadoria devolvida pelo destinatário',
  'Não retirada no prazo',
  'Erro da/o cliente',
  'Peça de outra marca recebida',
  'Outro',
] as const;

/** Origens / causadores iniciais (lista causador). */
export const CAUSADORES_PADRAO = [
  'Expedição',
  'Financeiro',
  'Comercial',
  'Expedição e Financeiro',
  'Correios',
  'Outro transportador',
  'Fiscalização',
  'Cliente / destinatário',
  'A apurar',
] as const;

/** Áreas (lista area), iguais às da carga inicial de 20261020130100 / 20261021140000. */
export const AREAS_PADRAO = [
  'Expedição',
  'Financeiro',
  'Expedição e Financeiro',
  'Comercial',
  'Fiscalização',
  'Correios',
  'Cliente / destinatário',
  'A definir',
] as const;

/**
 * Origem antiga → [tipo do problema, origem/causador]. null = revisar (ambíguo).
 * Espelha nc_classificacao_legada() da migration 20261109100000.
 */
export const MAPEAMENTO_ORIGEM_LEGADA: ReadonlyArray<readonly [origem: string, tipo: string | null, causador: string | null]> = [
  ['Erro expedição – endereço incorreto', 'Endereço incorreto', 'Expedição'],
  ['Erro expedição – mercadoria trocada ou embalada junto', 'Mercadoria trocada ou embalada junto', 'Expedição'],
  ['Erro expedição – etiqueta ou pré-postagem', 'Etiqueta ou pré-postagem', 'Expedição'],
  ['Embalagem inadequada / avaria por embalagem', 'Embalagem inadequada / avaria por embalagem', 'Expedição'],
  ['Atraso de postagem', 'Atraso de postagem', 'Expedição'],
  ['Postagem duplicada', 'Postagem duplicada', 'Expedição'],
  ['Postagem sem NF', 'Postagem sem NF', 'Expedição'],
  ['Erro de faturamento / NF (destinatário ou endereço)', null, 'Financeiro'],
  ['Erro da expedição e do financeiro', null, 'Expedição e Financeiro'],
  ['Erro vendedora – endereço incorreto', 'Endereço incorreto', 'Comercial'],
  ['Tipo de frete incorreto (CIF/FOB)', 'Tipo de frete incorreto (CIF/FOB)', 'Comercial'],
  ['Frete não cobrado na venda', 'Frete não cobrado na venda', 'Comercial'],
  ['Reverso sem autorização', 'Reverso sem autorização', 'Comercial'],
  ['Frete carona (pacote de terceiro com pedido da marca)', 'Frete carona', 'Comercial'],
  ['Mercadoria apreendida (fiscalização)', 'Mercadoria apreendida', 'Fiscalização'],
  ['Extravio Correios', 'Extravio', 'Correios'],
  ['Avaria no transporte', 'Avaria no transporte', 'Correios'],
  ['Entregue para a pessoa errada', 'Entregue para a pessoa errada', 'Correios'],
  ['Consta entregue / não entregue no local', 'Consta entregue / não entregue no local', 'Correios'],
  ['Endereço não localizado', 'Endereço não localizado', 'Correios'],
  ['Entregador não atendido', 'Entregador não atendido', 'Cliente / destinatário'],
  ['Cliente desconhecido', 'Cliente desconhecido', 'Cliente / destinatário'],
  ['Entregue, porém cliente afirma que não recebeu', 'Entregue, porém cliente afirma que não recebeu', 'Cliente / destinatário'],
  ['Mercadoria devolvida pelo destinatário', 'Mercadoria devolvida pelo destinatário', 'Cliente / destinatário'],
  ['Não retirada no prazo (aguardando retirada)', 'Não retirada no prazo', 'Cliente / destinatário'],
  ['Erro da/o cliente', 'Erro da/o cliente', 'Cliente / destinatário'],
  ['Peça de outra marca recebida', 'Peça de outra marca recebida', 'Cliente / destinatário'],
  ['Outro', 'Outro', 'A apurar'],
];

export interface ClassificacaoLegada {
  tipo_problema: string | null;
  causador: string | null;
}

/** Classificação nova inferida da origem antiga, só para o que é inequívoco. Origem desconhecida: nada. */
export function classificarOrigemLegada(origem: string | null | undefined): ClassificacaoLegada {
  const linha = MAPEAMENTO_ORIGEM_LEGADA.find(([nome]) => nome === origem);
  return { tipo_problema: linha?.[1] ?? null, causador: linha?.[2] ?? null };
}

/** Campos que definem a situação do custo. */
export type CamposCusto = Pick<NcCampos, 'custo_produto' | 'custo_frete_adicional' | 'custo_multa_outros' | 'valor_reembolsado'>;

const CAMPOS_VALOR_CUSTO = ['custo_produto', 'custo_frete_adicional', 'custo_multa_outros', 'valor_reembolsado'] as const;

const positivo = (v: number | null | undefined) => (v ?? 0) > 0;

/** Há custo registrado (produto, frete adicional ou multa/outros com valor maior que zero). */
export function temCustoRegistrado(c: Partial<CamposCusto>): boolean {
  return positivo(c.custo_produto) || positivo(c.custo_frete_adicional) || positivo(c.custo_multa_outros);
}

/** Há algum valor de custo ou reembolso maior que zero: a situação não pode ser "Não". */
export function temValorRegistrado(c: Partial<CamposCusto>): boolean {
  return temCustoRegistrado(c) || positivo(c.valor_reembolsado);
}

/** Situação inicial de um registro novo sem decisão: "Sim" com custo; sem custo, "Em apuração". Nunca "Não". */
export function situacaoCustoInicial(c: Partial<CamposCusto>): SituacaoCustoNc {
  return temCustoRegistrado(c) ? 'Sim' : 'Em apuração';
}

export const MENSAGEM_CUSTO_NAO_COM_VALOR = 'Situação do custo "Não" exige custos sem valor: há valores registrados.';
export const MENSAGEM_SITUACAO_NAO_APAGA = 'Mudar a situação do custo não apaga valores já registrados.';
export const MENSAGEM_SITUACAO_SEM_INFORMACAO = 'A situação do custo não pode voltar a ficar sem informação.';
export const MENSAGEM_TIPO_OBRIGATORIO = 'Informe o tipo do problema.';
export const MENSAGEM_CAUSADOR_OBRIGATORIO = 'Informe a origem / causador (use A apurar se não souber).';
export const MENSAGEM_OUTRO_SEM_DESCRICAO = 'Descreva o problema quando o tipo for Outro.';
export const MENSAGEM_TIPO_NAO_VOLTA = 'O tipo do problema não pode voltar a ficar sem informação.';
export const MENSAGEM_CAUSADOR_NAO_VOLTA = 'A origem / causador não pode voltar a ficar sem informação.';

/**
 * NC com classificação para o painel e os totais: origem antiga, ou tipo do problema e causador
 * (registro novo). Quem não tem nenhum dos dois fica de fora, como na planilha.
 */
export function temClassificacao(nc: { origem?: string | null; tipo_problema?: string | null; causador?: string | null }): boolean {
  return !!nc.origem || (!!nc.tipo_problema && !!nc.causador);
}

/** Regras de registro novo e de conservação de tipo e causador (mesma ordem do banco). */
function regrasDeRegistro(anterior: Partial<NcGravacao> | null, proximo: Partial<NcGravacao>): string | null {
  if (anterior === null) {
    if (!proximo.tipo_problema) return MENSAGEM_TIPO_OBRIGATORIO;
    if (!proximo.causador) return MENSAGEM_CAUSADOR_OBRIGATORIO;
  } else {
    if ((anterior.tipo_problema ?? null) !== null && (proximo.tipo_problema ?? null) === null) return MENSAGEM_TIPO_NAO_VOLTA;
    if ((anterior.causador ?? null) !== null && (proximo.causador ?? null) === null) return MENSAGEM_CAUSADOR_NAO_VOLTA;
  }
  const mudouTipoOuDescricao =
    anterior === null ||
    (proximo.tipo_problema ?? null) !== (anterior.tipo_problema ?? null) ||
    (proximo.descricao ?? null) !== (anterior.descricao ?? null);
  if (proximo.tipo_problema === 'Outro' && mudouTipoOuDescricao && !(proximo.descricao ?? '').trim()) {
    return MENSAGEM_OUTRO_SEM_DESCRICAO;
  }
  return null;
}

/**
 * O que o banco faz ao gravar. INSERT (anterior = null): classifica a origem antiga e define a
 * situação inicial. UPDATE: classifica de novo só se a origem mudou. Em ambos, só preenche
 * campos vazios; nunca sobrescreve valor já gravado.
 */
export function derivarClassificacao<T extends NcGravacao>(anterior: Partial<NcGravacao> | null, proximo: T): T {
  const saida: T = { ...proximo };
  const origemMudou = anterior === null || (proximo.origem ?? null) !== (anterior.origem ?? null);
  if (origemMudou && proximo.origem) {
    const legada = classificarOrigemLegada(proximo.origem);
    saida.tipo_problema = proximo.tipo_problema ?? legada.tipo_problema;
    saida.causador = proximo.causador ?? legada.causador;
  }
  if (anterior === null && (proximo.custo_situacao ?? null) === null) {
    saida.custo_situacao = situacaoCustoInicial(proximo);
  }
  return saida;
}

/**
 * Regras de persistência da classificação, na mesma ordem do banco. Devolve a primeira
 * mensagem ou null. anterior = null em INSERT. Mesmos textos das mensagens do banco.
 */
export function validarClassificacaoNc(
  anterior: Partial<NcGravacao> | null,
  proximo: Partial<NcGravacao>,
  listas: ListasNc
): string | null {
  const erroRegistro = regrasDeRegistro(anterior, proximo);
  if (erroRegistro) return erroRegistro;

  const verificacoes: Array<[campo: 'tipo_problema' | 'causador' | 'area_registro' | 'area_tratativa', lista: 'tipo_problema' | 'causador' | 'area', rotulo: string]> = [
    ['tipo_problema', 'tipo_problema', 'Tipo do problema'],
    ['causador', 'causador', 'Origem / causador'],
    ['area_registro', 'area', 'Área que registrou'],
    ['area_tratativa', 'area', 'Área responsável pela tratativa'],
  ];
  for (const [campo, lista, rotulo] of verificacoes) {
    const valor = proximo[campo] ?? null;
    const mudou = anterior === null || valor !== (anterior[campo] ?? null);
    if (mudou && valor !== null && !listas.itens.some((item) => item.lista === lista && item.valor === valor)) {
      return `${rotulo} fora da lista: ${valor}`;
    }
  }

  const situacao = proximo.custo_situacao ?? null;
  if (situacao !== null && !(SITUACOES_CUSTO_NC as readonly string[]).includes(situacao)) {
    return 'Situação do custo inválida.';
  }
  if (anterior !== null) {
    if ((anterior.custo_situacao ?? null) !== null && situacao === null) return MENSAGEM_SITUACAO_SEM_INFORMACAO;
    const mudou = situacao !== (anterior.custo_situacao ?? null);
    const apagou = CAMPOS_VALOR_CUSTO.some((campo) => (anterior[campo] ?? null) !== null && (proximo[campo] ?? null) === null);
    if (mudou && apagou) return MENSAGEM_SITUACAO_NAO_APAGA;
  }
  if (situacao === 'Não' && temValorRegistrado(proximo)) return MENSAGEM_CUSTO_NAO_COM_VALOR;
  return null;
}

/** Classificação nova incompleta: tipo ou causador sem valor. Lista de revisão. */
export function classificacaoPendente(nc: Pick<NcClassificacao, 'tipo_problema' | 'causador'>): boolean {
  return !nc.tipo_problema || !nc.causador;
}

/** Itens iniciais das listas da classificação (ativos), para completar listas de demonstração. */
export function itensClassificacaoPadrao(): NcListaItem[] {
  return [
    ...TIPOS_PROBLEMA_PADRAO.map((valor, i) => ({ lista: 'tipo_problema' as const, valor, ordem: i + 1, ativo: true })),
    ...CAUSADORES_PADRAO.map((valor, i) => ({ lista: 'causador' as const, valor, ordem: i + 1, ativo: true })),
    ...AREAS_PADRAO.map((valor, i) => ({ lista: 'area' as const, valor, ordem: i + 1, ativo: true })),
  ];
}
