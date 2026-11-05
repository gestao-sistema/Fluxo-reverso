// Regras de acesso da função correios-rastreio. Sem imports externos (roda no Deno e nos testes).

// Código de objeto dos Correios: 2 letras, 9 números e BR. Qualquer outra coisa é recusada.
export const CODIGO_RASTREIO = /^[A-Z]{2}\d{9}BR$/;

// Corpo acima disso é recusado sem ser lido.
export const LIMITE_CORPO_BYTES = 1024;

// Mensagens para o cliente. Detalhes ficam só no log do servidor.
export const MENSAGEM = {
  naoAutorizado: 'Sessão inválida ou ausente.',
  loteRestrito: 'A consulta em lote é feita pela automação.',
  corpoInvalido: 'Corpo da requisição inválido.',
  codigoInvalido: 'Código de rastreio inválido.',
  naoEncontrada: 'Nenhuma solicitação visível para este código.',
  metodo: 'Método não permitido.',
  interno: 'Não foi possível consultar o rastreio agora.',
} as const;

/** Token do cabeçalho Authorization (Bearer), ou null. */
export function tokenDo(cabecalho: string | null): string | null {
  const partes = /^Bearer\s+(.+)$/i.exec((cabecalho ?? '').trim());
  return partes ? partes[1].trim() : null;
}

/** Comparação em tempo constante: o tempo não revela quantos caracteres batem. */
export function igualSeguro(a: string, b: string): boolean {
  if (!a || !b || a.length !== b.length) return false;
  let diferenca = 0;
  for (let i = 0; i < a.length; i++) diferenca |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diferenca === 0;
}

/** Automação: o token é exatamente a chave service_role configurada no servidor. */
export function ehAutomacao(token: string, chaveAutomacao: string): boolean {
  return chaveAutomacao !== '' && igualSeguro(token, chaveAutomacao);
}

export type AnaliseCorpo =
  | { ok: true; codigo: string | null }
  | { ok: false; mensagem: string };

/**
 * Corpo da requisição. Vazio = chamada de lote (só a automação pode usá-lo, a decisão é depois).
 * Código, se informado, tem que ser texto no formato dos Correios.
 */
export function analisarCorpo(texto: string): AnaliseCorpo {
  if (texto.length > LIMITE_CORPO_BYTES) return { ok: false, mensagem: MENSAGEM.corpoInvalido };
  if (texto.trim() === '') return { ok: true, codigo: null };

  let json: unknown;
  try {
    json = JSON.parse(texto);
  } catch {
    return { ok: false, mensagem: MENSAGEM.corpoInvalido };
  }
  if (!json || typeof json !== 'object' || Array.isArray(json)) {
    return { ok: false, mensagem: MENSAGEM.corpoInvalido };
  }

  const bruto = (json as { codigo?: unknown }).codigo;
  if (bruto === undefined || bruto === null) return { ok: true, codigo: null };
  if (typeof bruto !== 'string' || !CODIGO_RASTREIO.test(bruto)) {
    return { ok: false, mensagem: MENSAGEM.codigoInvalido };
  }
  return { ok: true, codigo: bruto };
}
