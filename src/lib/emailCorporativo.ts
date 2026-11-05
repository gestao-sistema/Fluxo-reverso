// E-mail corporativo do convite de acesso. O bloco abaixo é copiado de
// supabase/functions/admin-usuarios/convite.ts (a Edge Function valida de novo, e é ela a autoridade);
// src/test/emailCorporativoParidade.test.ts confere que os dois textos são idênticos.

// >>> e-mail corporativo (idêntico em src/lib/emailCorporativo.ts; src/test/emailCorporativoParidade.test.ts compara o texto)
export const DOMINIO_CONVITE = 'azime.com.br';

const PARTE_LOCAL_EMAIL = /^[a-z0-9](?:[a-z0-9._+-]{0,62}[a-z0-9])?$/;

/**
 * Normaliza (espaços externos e caixa) e aceita somente endereços do domínio exato do convite.
 * Recusa subdomínios, sufixos (azime.com.br.outro.com) e endereços sem parte local válida.
 */
export function normalizarEmailCorporativo(entrada: unknown): string {
  const email = typeof entrada === 'string' ? entrada.trim().toLowerCase() : '';
  if (!email) throw new Error('Informe o e-mail corporativo.');
  const partes = email.split('@');
  if (partes.length !== 2 || partes[1] !== DOMINIO_CONVITE || !PARTE_LOCAL_EMAIL.test(partes[0]) || partes[0].includes('..')) {
    throw new Error(`Informe um e-mail corporativo do domínio @${DOMINIO_CONVITE}.`);
  }
  return email;
}
// <<< e-mail corporativo
