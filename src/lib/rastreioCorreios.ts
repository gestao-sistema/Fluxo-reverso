// ── Código de rastreio dos Correios (padrão UPU S10) ────────────────────────
// Formato: 2 letras de serviço + 8 dígitos + 1 dígito verificador + "BR".
// Dígito verificador: pesos 8 6 4 2 3 5 9 7 sobre os 8 dígitos; resto da soma por 11;
// resto 0 → 5, resto 1 → 0, senão 11 − resto.
// O dígito verificador é o que separa um código real de um número qualquer da etiqueta
// (CEP, telefone, contrato) ou de uma leitura errada: só código com DV correto é
// considerado "identificado". O banco continua aceitando o formato digitado à mão.
// Módulo puro (sem pdf.js), usado pela leitura do PDF e pela tela de emissão.
// ─────────────────────────────────────────────────────────────────────────────

const PESOS_S10 = [8, 6, 4, 2, 3, 5, 9, 7] as const;

/** Dígito verificador S10 para os 8 dígitos do número de série; null se a entrada não tiver 8 dígitos. */
export function digitoVerificadorS10(serie: string): number | null {
  if (!/^\d{8}$/.test(serie)) return null;
  const soma = PESOS_S10.reduce((total, peso, indice) => total + peso * Number(serie[indice]), 0);
  const resto = soma % 11;
  if (resto === 0) return 5;
  if (resto === 1) return 0;
  return 11 - resto;
}

/** true para um código completo (AA123456785BR) com dígito verificador correto. */
export function codigoRastreioValido(codigo: string | null | undefined): boolean {
  const normalizado = (codigo ?? '').trim().toUpperCase();
  const partes = /^[A-Z]{2}(\d{8})(\d)BR$/.exec(normalizado);
  if (!partes) return false;
  return digitoVerificadorS10(partes[1]) === Number(partes[2]);
}

// Aceita separadores que aparecem no texto da etiqueta: "AB 123 456 785 BR", "AB.123.456.785-BR"
const PADRAO_CANDIDATO = /(?:^|[^A-Z0-9])([A-Z][\s.-]*[A-Z](?:[\s.-]*\d){9}[\s.-]*B[\s.-]*R)(?=$|[^A-Z0-9])/g;

/** Códigos de rastreio distintos e com DV correto, na ordem em que aparecem no texto. */
export function codigosRastreioNoTexto(texto: string): string[] {
  const encontrados: string[] = [];
  for (const casamento of texto.toUpperCase().matchAll(PADRAO_CANDIDATO)) {
    const codigo = casamento[1].replace(/[^A-Z0-9]/g, '');
    if (codigoRastreioValido(codigo) && !encontrados.includes(codigo)) encontrados.push(codigo);
  }
  return encontrados;
}

export type SituacaoPreenchimento =
  /** O campo estava vazio e o PDF trouxe exatamente um código: preenchido para conferência. */
  | 'preenchido'
  /** O campo já tinha o mesmo código que o PDF traz. */
  | 'confirmado'
  /** O campo já tinha outro valor: ele é mantido e o código do PDF fica como sugestão. */
  | 'mantido'
  /** O PDF traz mais de um código: a pessoa escolhe. */
  | 'escolher'
  /** Nenhum código identificado: a entrada continua manual. */
  | 'nenhum';

export interface DecisaoPreenchimento {
  valor: string;
  situacao: SituacaoPreenchimento;
  candidatos: string[];
}

/**
 * Decide o que fazer com os códigos lidos do PDF sem nunca sobrescrever, em silêncio,
 * um valor que já estava no campo (digitado ou vindo de uma emissão gravada).
 */
export function decidirPreenchimento(valorAtual: string | null | undefined, lidos: string[]): DecisaoPreenchimento {
  const atual = (valorAtual ?? '').trim().toUpperCase();
  const candidatos = [...new Set(lidos.map((codigo) => codigo.trim().toUpperCase()).filter(Boolean))];
  if (candidatos.length === 0) return { valor: atual, situacao: 'nenhum', candidatos };
  if (atual) {
    if (candidatos.includes(atual)) return { valor: atual, situacao: 'confirmado', candidatos };
    return { valor: atual, situacao: 'mantido', candidatos };
  }
  if (candidatos.length === 1) return { valor: candidatos[0], situacao: 'preenchido', candidatos };
  return { valor: '', situacao: 'escolher', candidatos };
}
