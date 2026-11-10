// ── Edição de NC: só o que foi alterado, versão e correções financeiras ─────
// Pura (sem React). Usada pelo formulário, pelo serviço e pela demonstração.
// A versão é conferida no banco (função nc_salvar_edicao); aqui ficam as partes do cliente:
// quais campos mudaram, a validação campo a campo e o que exige justificativa.
// ─────────────────────────────────────────────────────────────────────────────

import { mensagensCruzadas, ncSchemaCampos } from '../schemas/ncSchema';
import type { NcFormInput } from '../schemas/ncSchema';
import type { ListasNc, NaoConformidade, NcGravacao } from '../types';
import { MENSAGEM_SITUACAO_NAO_APAGA, validarClassificacaoNc } from './ncClassificacao';
import { MENSAGEM_NAO_COM_CAMPO_EM_BRANCO, VAZIO, paraFormulario } from './ncFormulario';
import { reais } from './ncCustos';

/** Campos que a edição grava: os mesmos do formulário (a função do banco aceita apenas estes). */
export const CAMPOS_EDITAVEIS = Object.keys(VAZIO) as Array<keyof NcFormInput>;

/** Valores financeiros e situação: mudar um valor já registrado é correção (justificativa obrigatória). */
export const CAMPOS_FINANCEIROS = [
  'custo_produto', 'custo_frete_adicional', 'custo_multa_outros', 'valor_reembolsado', 'custo_situacao',
] as const;
export type CampoFinanceiro = (typeof CAMPOS_FINANCEIROS)[number];

/** Campos numéricos: comparados pelo valor, não pelo texto ("100" é igual a "100.00"). */
const CAMPOS_NUMERICOS = new Set<string>([
  'valor_romaneio', 'valor_declarado', 'valor_venda', 'frete_original', 'custo_produto', 'custo_frete_adicional',
  'custo_multa_outros', 'valor_reembolsado', 'tempo_tratativa_min',
]);

const ROTULOS: Partial<Record<keyof NcFormInput, string>> = {
  data_ocorrencia: 'Data da ocorrência', data_identificacao: 'Data de identificação', empresa: 'Empresa / contrato',
  cliente: 'Cliente', vendedora: 'Vendedora', romaneio: 'Romaneio', valor_romaneio: 'Valor do romaneio', nf: 'NF',
  rastreio: 'Rastreio', data_postagem: 'Data de postagem', tipo_saida: 'Tipo de saída', origem: 'Origem antiga',
  como_identificada: 'Como foi identificada', status_correios: 'Status no Correios', descricao: 'Descrição',
  resolucao: 'Resolução', novo_rastreio: 'Novo rastreio', valor_declarado: 'Valor declarado', valor_venda: 'Valor da venda',
  frete_original: 'Frete original', custo_produto: 'Custo — produto', custo_frete_adicional: 'Custo — frete adicional',
  custo_multa_outros: 'Custo — multa / outros', reembolso_correios: 'Reembolso Correios?',
  numero_pi: 'Nº do pedido de indenização (PI)', valor_reembolsado: 'Valor reembolsado',
  tempo_tratativa_min: 'Tempo de tratativa (min)', status: 'Status da NC', data_encerramento: 'Data de encerramento',
  tipo_problema: 'Tipo do problema', causador: 'Origem / causador', area_registro: 'Área que registrou',
  area_tratativa: 'Área responsável pela tratativa', custo_situacao: 'Houve custo?',
};

export function rotuloCampo(campo: keyof NcFormInput): string {
  return ROTULOS[campo] ?? String(campo);
}

/** Valor do campo na forma de comparação: vazio vira null; texto sem espaços nas pontas; número em centavos. */
export function valorComparavel(campo: string, valor: string | number | null | undefined): string | null {
  const texto = valor === null || valor === undefined ? '' : String(valor).trim();
  if (texto === '') return null;
  if (CAMPOS_NUMERICOS.has(campo)) {
    const numero = Number(texto.replace(',', '.'));
    return Number.isFinite(numero) ? String(Math.round(numero * 100) / 100) : texto;
  }
  return texto;
}

/** Campos cujo valor efetivo mudou em relação à base. Espaços nas pontas e "100" × "100.00" não contam. */
export function camposAlterados(base: NcFormInput, atual: NcFormInput): Array<keyof NcFormInput> {
  return CAMPOS_EDITAVEIS.filter((campo) => valorComparavel(campo, base[campo]) !== valorComparavel(campo, atual[campo]));
}

/**
 * Formulário depois de a base mudar no servidor: o que o usuário alterou continua como digitou;
 * o restante recebe a versão atual. Nada digitado é perdido.
 */
export function reconciliarFormulario(base: NcFormInput, atual: NcFormInput, registro: NaoConformidade): NcFormInput {
  const nova = paraFormulario(registro);
  const editados = new Set<string>(camposAlterados(base, atual));
  return Object.fromEntries(
    CAMPOS_EDITAVEIS.map((campo) => [campo, editados.has(campo) ? atual[campo] : nova[campo]])
  ) as NcFormInput;
}

export interface Correcao {
  campo: CampoFinanceiro;
  anterior: string | number | null;
  posterior: string | number | null;
}

/**
 * Correções: mudança de um valor ou da situação que já estavam registrados (zero conta como
 * registrado; vazio conta como alteração). Preencher um campo vazio não é correção.
 */
export function listarCorrecoes(registro: NaoConformidade, campos: Partial<NcGravacao>): Correcao[] {
  const antes = registro as unknown as Record<string, unknown>;
  const novos = campos as unknown as Record<string, unknown>;
  const saida: Correcao[] = [];
  for (const campo of CAMPOS_FINANCEIROS) {
    if (novos[campo] === undefined) continue;
    const anterior = antes[campo] ?? null;
    const posterior = novos[campo] ?? null;
    if (anterior === null) continue;
    if (valorComparavel(campo, anterior as string | number) === valorComparavel(campo, posterior as string | number | null)) continue;
    saida.push({ campo, anterior: anterior as string | number, posterior: posterior as string | number | null });
  }
  return saida;
}

/** Texto de uma correção para a confirmação: "R$ 100,00 → (zero informado)" e assim por diante. */
export function descreverCorrecao(correcao: Correcao): { rotulo: string; antes: string; depois: string } {
  const formatar = (valor: string | number | null): string => {
    if (valor === null) return '(vazio)';
    if (correcao.campo === 'custo_situacao') return String(valor);
    const numero = typeof valor === 'number' ? valor : Number(valor);
    if (!Number.isFinite(numero)) return String(valor);
    return numero === 0 ? `${reais(0)} (zero informado)` : reais(numero);
  };
  return { rotulo: rotuloCampo(correcao.campo), antes: formatar(correcao.anterior), depois: formatar(correcao.posterior) };
}

export type ResultadoEdicao =
  | { ok: true; campos: Partial<NcGravacao>; correcoes: Correcao[] }
  | { ok: false; erros: Partial<Record<keyof NcFormInput, string>>; regra: string | null };

type ValidadorCampo = {
  safeParse: (valor: unknown) => { success: true; data: unknown } | { success: false; error: { issues: Array<{ message: string }> } };
};
const validadores = ncSchemaCampos.shape as unknown as Record<string, ValidadorCampo>;

/**
 * Valida só os campos alterados, com as mesmas regras do cadastro, e as regras que os envolvem,
 * contra o registro gravado. Campos intocados (inclusive de registros antigos) não são
 * revalidados nem normalizados, e vão para o banco como estão.
 */
export function validarAlteracoes(
  registro: NaoConformidade,
  alterados: Array<keyof NcFormInput>,
  form: NcFormInput,
  listas: ListasNc
): ResultadoEdicao {
  const erros: Partial<Record<keyof NcFormInput, string>> = {};
  const campos: Record<string, unknown> = {};
  for (const campo of alterados) {
    const resultado = validadores[campo].safeParse(form[campo]);
    if (resultado.success) campos[campo] = resultado.data;
    else erros[campo] = resultado.error.issues[0]?.message ?? 'Valor inválido.';
  }
  if (Object.keys(erros).length > 0) return { ok: false, erros, regra: null };

  const proximo = { ...(registro as unknown as Record<string, unknown>), ...campos };
  for (const { campo, mensagem } of mensagensCruzadas(proximo as Parameters<typeof mensagensCruzadas>[0], new Set(alterados))) {
    erros[campo as keyof NcFormInput] = mensagem;
  }
  if (Object.keys(erros).length > 0) return { ok: false, erros, regra: null };

  const regra = validarClassificacaoNc(registro, proximo as Partial<NcGravacao>, listas);
  if (regra) return { ok: false, erros: {}, regra };

  const gravacao = campos as Partial<NcGravacao>;
  return { ok: true, campos: gravacao, correcoes: listarCorrecoes(registro, gravacao) };
}

/** Mensagem para o usuário: a regra de "Não" com campo em branco ganha a orientação de zero. */
export function mensagemDaRegra(regra: string): string {
  return regra === MENSAGEM_SITUACAO_NAO_APAGA ? MENSAGEM_NAO_COM_CAMPO_EM_BRANCO : regra;
}

export const MENSAGEM_CONFLITO_EDICAO =
  'Outra pessoa alterou esta não conformidade depois que você a abriu. Nada foi gravado e a sua digitação foi mantida. Consulte a versão atual antes de reaplicar as suas alterações.';

/** Versão mudou no banco desde que o formulário foi carregado: nada é gravado. */
export class ConflitoEdicaoNc extends Error {
  readonly codigo = 'NC001';

  constructor(mensagem: string = MENSAGEM_CONFLITO_EDICAO) {
    super(mensagem);
    this.name = 'ConflitoEdicaoNc';
  }
}

/** Outros erros de gravação, com o código que o banco devolveu (NC002 a NC005, 42501). */
export class ErroEdicaoNc extends Error {
  readonly codigo: string;

  constructor(codigo: string, mensagem: string) {
    super(mensagem);
    this.codigo = codigo;
    this.name = 'ErroEdicaoNc';
  }
}

export interface OpcoesAtualizacaoNc {
  /** Versão (updated_at) que o formulário carregou. Obrigatória: sem ela, a gravação é recusada. */
  versao: string;
  /** Justificativa, obrigatória quando a gravação corrige um valor já registrado. */
  motivo?: string | null;
}

export interface ResultadoAtualizacaoNc {
  nc: NaoConformidade;
  /** false quando nada mudou: a linha não foi regravada. */
  gravado: boolean;
}

/** Linha da trilha financeira (mesma forma de nc_auditoria_financeira). */
export interface AuditoriaFinanceiraNc {
  id: string;
  nc_id: string;
  campo: CampoFinanceiro;
  tipo_alteracao: 'preenchimento' | 'correcao';
  valor_anterior: number | null;
  valor_posterior: number | null;
  texto_anterior: string | null;
  texto_posterior: string | null;
  motivo: string | null;
  origem: 'edicao' | 'direta';
  autor_id: string | null;
  autor_nome: string;
  criado_em: string;
}
