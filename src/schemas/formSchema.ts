// ── Schema de validação do formulário de Logística Reversa ───────────────────
// Usa Zod com .superRefine() para validação condicional:
// `justificativa_outros` é obrigatória APENAS quando motivo === 'Outros'.
// `nc_id` é opcional: quando informada, vincula a reversa à NC de origem.
// ─────────────────────────────────────────────────────────────────────────────

import { z } from 'zod';
import { MOTIVOS, SETORES } from '../types';

// Um único enum mantém a mensagem em português para qualquer valor inválido (um union de
// dois enums cairia em "Invalid input"). Os valores antigos seguem aceitos porque o banco
// ainda os permite em pedidos já registrados.
/** Maior valor da coluna codigo_cliente (integer no PostgreSQL). */
export const CODIGO_CLIENTE_MAXIMO = 2_147_483_647;

const MOTIVOS_ACEITOS = [...MOTIVOS, 'Mercadoria errada', 'Endereço incorreto'] as const;

export const formSchema = z
  .object({
    /** NC de origem opcional (aberta, da mesma empresa) */
    nc_id: z
      .string()
      .uuid('Selecione uma NC válida.')
      .optional()
      .or(z.literal('')),

    /** Data da solicitação no formato YYYY-MM-DD */
    data_solicitacao: z
      .string({ required_error: 'Selecione a data da solicitação.' })
      .min(1, 'Selecione a data da solicitação.'),

    /** Nome do responsável interno */
    solicitante: z
      .string({ required_error: 'Informe o nome do solicitante.' })
      .transform(val => val.replace(/<[^>]*>?/gm, '').trim())
      .pipe(z.string().min(2, 'Nome deve ter ao menos 2 caracteres.').max(100, 'Nome muito longo.')),

    /** Setor interno */
    setor: z.enum(SETORES, {
      errorMap: () => ({ message: 'Selecione um setor válido.' }),
    }),

    /** Código numérico da cliente */
    codigo_cliente: z
      .number({
        required_error: 'Informe o código da cliente.',
        invalid_type_error: 'O código deve ser um número inteiro.',
      })
      .int('O código deve ser um número inteiro.')
      .positive('O código deve ser maior que zero.')
      // A coluna é integer (4 bytes): acima disso o banco recusa e, antes, o JavaScript arredondava
      .max(CODIGO_CLIENTE_MAXIMO, `O código deve ter no máximo ${CODIGO_CLIENTE_MAXIMO.toLocaleString('pt-BR')}.`),

    /** Nome completo da cliente */
    nome_cliente: z
      .string({ required_error: 'Informe o nome da cliente.' })
      .transform(val => val.replace(/<[^>]*>?/gm, '').trim())
      .pipe(z.string().min(2, 'Nome deve ter ao menos 2 caracteres.').max(150, 'Nome muito longo.')),

    /** Endereço de postagem */
    endereco_postagem: z
      .string({ required_error: 'Informe o endereço de postagem.' })
      .transform(val => val.replace(/<[^>]*>?/gm, '').trim())
      .pipe(z.string().min(5, 'Endereço deve ter ao menos 5 caracteres.').max(300, 'Endereço muito longo.')),

    /** Número do imóvel, informado separadamente do endereço retornado pelo CEP. */
    numero_endereco: z
      .string({ required_error: 'Informe o número do endereço.' })
      .transform(val => val.replace(/<[^>]*>?/gm, '').trim())
      .pipe(z.string().min(1, 'Informe o número ou S/N.').max(20, 'Número muito longo.')),

    /** Dados do endereço da outra cliente, exibidos para "Clientes trocados". */
    cep_destino_troca: z.string().optional().or(z.literal('')),
    numero_destino_troca: z
      .string()
      .transform(val => val.replace(/<[^>]*>?/gm, '').trim())
      .pipe(z.string().max(20, 'Número muito longo.'))
      .optional()
      .or(z.literal('')),
    endereco_destino_troca: z
      .string()
      .transform(val => val.replace(/<[^>]*>?/gm, '').trim())
      .pipe(z.string().max(300, 'Endereço muito longo.'))
      .optional()
      .or(z.literal('')),

    /** Motivo principal do reverso */
    motivo: z.enum(MOTIVOS_ACEITOS, { errorMap: () => ({ message: 'Selecione um motivo válido.' }) }),

    /**
     * Obrigatório quando motivo === 'Outros'.
     * A validação condicional está no .superRefine() abaixo.
     */
    justificativa_outros: z
      .string()
      .transform(val => val.replace(/<[^>]*>?/gm, '').trim())
      .pipe(z.string().max(500, 'Justificativa muito longa (máximo 500 caracteres).'))
      .optional()
      .or(z.literal('')),

  })
  .superRefine((data, ctx) => {
    if (data.motivo === 'Clientes trocados') {
      if (!data.endereco_destino_troca || data.endereco_destino_troca.length < 5) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['endereco_destino_troca'],
          message: 'Informe o endereço da outra cliente.',
        });
      }
      if (!data.numero_destino_troca) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['numero_destino_troca'],
          message: 'Informe o número ou S/N da outra cliente.',
        });
      }
      if (data.cep_destino_troca && data.cep_destino_troca.replace(/\D/g, '').length !== 8) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['cep_destino_troca'],
          message: 'Digite os 8 números do CEP ou deixe o campo vazio.',
        });
      }
    }

    // Justificativa obrigatória quando motivo for 'Outros'
    if (
      data.motivo === 'Outros' &&
      (!data.justificativa_outros || data.justificativa_outros.trim() === '')
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['justificativa_outros'],
        message: 'Justifique o motivo "Outros" para prosseguir.',
      });
    }
  });

/** Tipo inferido do schema — usado nos componentes */
export type FormData = z.infer<typeof formSchema>;
