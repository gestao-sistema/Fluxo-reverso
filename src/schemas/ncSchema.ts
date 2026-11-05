// ── Schema de validação da não conformidade ──────────────────────────────────
// Entrada: valores crus do formulário (sempre texto). Saída: campos da NC
// prontos para gravar (vazio → null, valores em número, datas YYYY-MM-DD).
// Obrigatórios: data da ocorrência, empresa e origem — sem elas a NC não entra
// no painel (a planilha conta só linhas com origem e data).
// ─────────────────────────────────────────────────────────────────────────────

import { z } from 'zod';
import { STATUS_NC } from '../types';

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

export const ncSchema = z
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
    origem: obrigatorio('Selecione a origem da não conformidade.'),
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
  })
  .superRefine((d, ctx) => {
    const inicio = d.data_identificacao ?? d.data_ocorrencia;
    if (d.data_encerramento && inicio && d.data_encerramento < inicio) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['data_encerramento'],
        message: 'O encerramento não pode ser antes da identificação (ou da ocorrência).',
      });
    }
  });

/** Valores crus do formulário (texto). */
export type NcFormInput = z.input<typeof ncSchema>;
