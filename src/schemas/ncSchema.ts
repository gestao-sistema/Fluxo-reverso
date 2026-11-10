// ── Schema de validação da não conformidade ──────────────────────────────────
// Entrada: valores crus do formulário (sempre texto). Saída: campos da NC
// prontos para gravar (vazio → null, valores em número, datas YYYY-MM-DD).
// Obrigatórios: data da ocorrência, empresa e origem — sem elas a NC não entra
// no painel (a planilha conta só linhas com origem e data).
// ─────────────────────────────────────────────────────────────────────────────

import { z } from 'zod';
import { SITUACOES_CUSTO_NC, STATUS_NC } from '../types';
import { MENSAGEM_CUSTO_NAO_COM_VALOR, temValorRegistrado } from '../lib/ncClassificacao';
import { hojeIso } from '../lib/ncCalculos';

// Remove só tags de verdade: "valor < 100" continua inteiro
const semTags = (v: string) => v.replace(/<\/?[a-zA-Z][^>]*>/g, '').trim();

/** Texto opcional: vazio vira null. */
const texto = (max: number) =>
  z
    .string()
    .transform(semTags)
    .pipe(z.string().max(max, `Máximo de ${max} caracteres.`))
    .transform((v) => v || null);

const obrigatorio = (mensagem: string) => z.string().transform(semTags).pipe(z.string().min(1, mensagem));

const data = z
  .string()
  .refine((v) => v === '' || /^\d{4}-\d{2}-\d{2}$/.test(v), 'Data inválida.')
  .transform((v) => v || null);

/** Valor em reais (o input numérico usa ponto decimal). */
const valor = z.string().transform((v, ctx) => {
  const t = v.trim();
  if (!t) return null;
  const n = Number(t);
  if (!Number.isFinite(n) || n < 0) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Informe um valor maior ou igual a zero.' });
    return z.NEVER;
  }
  return Math.round(n * 100) / 100;
});

const minutos = z.string().transform((v, ctx) => {
  const t = v.trim();
  if (!t) return null;
  const n = Number(t);
  if (!Number.isInteger(n) || n < 0) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Informe os minutos em número inteiro.' });
    return z.NEVER;
  }
  return n;
});

/** Campos do formulário, cada um com a sua regra. A edição valida campo a campo usando este objeto. */
export const ncSchemaCampos = z
  .object({
    // Identificação
    data_ocorrencia: data.refine((v) => v !== null, 'Informe a data da ocorrência.'),
    data_identificacao: data,
    empresa: obrigatorio('Selecione a empresa / contrato.'),
    cliente: texto(150),
    vendedora: texto(100),
    romaneio: texto(50),
    valor_romaneio: valor,
    nf: texto(50),
    rastreio: texto(40),
    data_postagem: data,
    // Classificação
    tipo_saida: texto(100),
    // Origem antiga: só existe em registros anteriores. Registro novo não a preenche.
    origem: texto(100),
    como_identificada: texto(100),
    // Ocorrência e resolução
    status_correios: texto(300),
    descricao: texto(2000),
    resolucao: texto(100),
    novo_rastreio: texto(40),
    // Valor real
    valor_declarado: valor,
    valor_venda: valor,
    frete_original: valor,
    // Custo da não conformidade
    custo_produto: valor,
    custo_frete_adicional: valor,
    custo_multa_outros: valor,
    reembolso_correios: texto(50),
    numero_pi: texto(50),
    valor_reembolsado: valor,
    // Esforço e status (status vazio só existe no histórico da planilha)
    tempo_tratativa_min: minutos,
    status: z.union([z.literal(''), z.enum(STATUS_NC)]).transform((v) => v || null),
    data_encerramento: data,
    // Classificação separada: opcional enquanto o formulário atual não a envia (o banco aceita nulo)
    tipo_problema: texto(100).optional(),
    causador: texto(100).optional(),
    area_registro: texto(100).optional(),
    area_tratativa: texto(100).optional(),
    custo_situacao: z.union([z.literal(''), z.enum(SITUACOES_CUSTO_NC)]).transform((v) => v || null).optional(),
  });

/**
 * Regras que envolvem mais de um campo. Na edição, valem só quando um dos campos envolvidos
 * mudou: campos intocados (inclusive de registros antigos) não são revalidados.
 */
export function mensagensCruzadas(
  d: {
    data_identificacao?: string | null;
    data_ocorrencia?: string | null;
    data_encerramento?: string | null;
    custo_situacao?: string | null;
    custo_produto?: number | null;
    custo_frete_adicional?: number | null;
    custo_multa_outros?: number | null;
    valor_reembolsado?: number | null;
  },
  alterados?: ReadonlySet<string>
): Array<{ campo: string; mensagem: string }> {
  const toca = (campos: string[]) => !alterados || campos.some((campo) => alterados.has(campo));
  const saida: Array<{ campo: string; mensagem: string }> = [];
  const inicio = d.data_identificacao ?? d.data_ocorrencia;
  if (toca(['data_encerramento', 'data_identificacao', 'data_ocorrencia']) && d.data_encerramento && inicio && d.data_encerramento < inicio) {
    saida.push({ campo: 'data_encerramento', mensagem: 'O encerramento não pode ser antes da identificação (ou da ocorrência).' });
  }
  if (toca(['custo_situacao', 'custo_produto', 'custo_frete_adicional', 'custo_multa_outros', 'valor_reembolsado'])
    && d.custo_situacao === 'Não' && temValorRegistrado(d)) {
    saida.push({ campo: 'custo_situacao', mensagem: MENSAGEM_CUSTO_NAO_COM_VALOR });
  }
  return saida;
}

/** Esquema completo: abertura e validação do registro inteiro. */
export const ncSchema = ncSchemaCampos.superRefine((d, ctx) => {
  for (const { campo, mensagem } of mensagensCruzadas(d)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: [campo], message: mensagem });
  }
});

/**
 * Abertura simplificada: além do esquema comum, exige empresa, data, tipo do problema, causador
 * e situação do custo; "Outro" pede descrição; a data da ocorrência não pode ser futura.
 */
export const ncAberturaSchema = ncSchema.superRefine((d, ctx) => {
  const exigir = (campo: string, message: string) =>
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: [campo], message });
  if (!d.tipo_problema) exigir('tipo_problema', 'Selecione o tipo do problema.');
  if (!d.causador) exigir('causador', 'Informe a origem / causador. Use "A apurar" se não souber.');
  if (!d.custo_situacao) exigir('custo_situacao', 'Informe se houve custo.');
  if (d.tipo_problema === 'Outro' && !(d.descricao ?? '').trim()) {
    exigir('descricao', 'Descreva o problema quando o tipo for Outro.');
  }
  if (d.data_ocorrencia && d.data_ocorrencia > hojeIso()) {
    exigir('data_ocorrencia', 'A data da ocorrência não pode ser futura.');
  }
});

/** Valores crus do formulário (texto). */
export type NcFormInput = z.input<typeof ncSchema>;
