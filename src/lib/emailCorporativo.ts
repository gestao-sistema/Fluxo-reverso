// E-mail corporativo do convite de acesso. O bloco abaixo é copiado de
// supabase/functions/admin-usuarios/convite.ts (a Edge Function valida de novo, e é ela a autoridade);
// src/test/emailCorporativoParidade.test.ts confere que os dois textos são idênticos.

// >>> e-mail corporativo (idêntico em src/lib/emailCorporativo.ts; src/test/emailCorporativoParidade.test.ts compara o texto)
/** Domínios dos destinatários de convite (não confundir com o remetente SMTP_FROM). Comparação exata. */
export const DOMINIOS_CONVITE = ['azime.com.br', 'alinare.com.br', 'novitah.com.br'] as const;
/** Domínio usado como exemplo nos textos da tela. */
export const DOMINIO_CONVITE = DOMINIOS_CONVITE[0];
/** "@azime.com.br, @alinare.com.br ou @novitah.com.br", para mensagens e ajuda. */
export const DOMINIOS_CONVITE_TEXTO = DOMINIOS_CONVITE.map((dominio) => '@' + dominio)
  .join(', ')
  .replace(/, ([^,]+)$/, ' ou $1');

const PARTE_LOCAL_EMAIL = /^[a-z0-9](?:[a-z0-9._+-]{0,62}[a-z0-9])?$/;

/**
 * Normaliza (espaços externos e caixa) e aceita somente endereços de um dos domínios exatos do convite.
 * Recusa subdomínios, sufixos (azime.com.br.outro.com), domínios parecidos (evilazime.com.br)
 * e endereços sem parte local válida.
 */
export function normalizarEmailCorporativo(entrada: unknown): string {
  const email = typeof entrada === 'string' ? entrada.trim().toLowerCase() : '';
  if (!email) throw new Error('Informe o e-mail corporativo.');
  const partes = email.split('@');
  if (
    partes.length !== 2
    || !(DOMINIOS_CONVITE as readonly string[]).includes(partes[1])
    || !PARTE_LOCAL_EMAIL.test(partes[0])
    || partes[0].includes('..')
  ) {
    throw new Error(`Informe um e-mail corporativo dos domínios ${DOMINIOS_CONVITE_TEXTO}.`);
  }
  return email;
}
// <<< e-mail corporativo
