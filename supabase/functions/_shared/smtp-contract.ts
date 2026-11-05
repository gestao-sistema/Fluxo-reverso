export type EstadoSmtp = 'smtp_aceito' | 'falhou' | 'rejeitado' | 'resultado_indeterminado';

export interface ResultadoSmtp {
  estado: EstadoSmtp;
  codigo_smtp: number | null;
  detalhe: string;
}

export interface MensagemSmtp {
  para: string;
  assunto: string;
  html: string;
  texto?: string;
}

export type EnviarEmailSmtp = (mensagem: MensagemSmtp) => Promise<ResultadoSmtp>;

export interface ConfiguracaoSmtp {
  host: string;
  porta: 587;
  usuario: string;
  senha: string;
  remetente: string;
}

export function lerConfiguracaoSmtp(env: Record<string, string | undefined>): ConfiguracaoSmtp | null {
  if (env.SMTP_HOST !== 'smtp.office365.com'
    || env.SMTP_PORT !== '587'
    || env.SMTP_SECURE !== 'false'
    || !env.SMTP_USER
    || !env.SMTP_PASS
    || !env.SMTP_FROM
    || /[\r\n]/.test(env.SMTP_FROM)) return null;

  return {
    host: env.SMTP_HOST,
    porta: 587,
    usuario: env.SMTP_USER,
    senha: env.SMTP_PASS,
    remetente: env.SMTP_FROM,
  };
}

export function smtpConfigurado(env: Record<string, string | undefined>): boolean {
  return lerConfiguracaoSmtp(env) !== null;
}

type ErroSmtp = {
  code?: unknown;
  command?: unknown;
  responseCode?: unknown;
};

function codigoDeResposta(valor: unknown): number | null {
  const codigo = typeof valor === 'number' ? valor : Number.NaN;
  return Number.isInteger(codigo) && codigo >= 100 && codigo <= 599 ? codigo : null;
}

function estadoPorCodigo(codigo: number): EstadoSmtp {
  return codigo >= 500 ? 'rejeitado' : codigo >= 400 ? 'falhou' : 'resultado_indeterminado';
}

/** Classifica sem guardar nem expor a resposta SMTP, que pode conter dados do tenant. */
export function classificarErroSmtp(erro: unknown): ResultadoSmtp {
  const detalhe: ErroSmtp = erro && typeof erro === 'object' ? erro as ErroSmtp : {};
  const codigo = codigoDeResposta(detalhe.responseCode);
  const comando = typeof detalhe.command === 'string' ? detalhe.command.toUpperCase() : '';
  const erroCodigo = typeof detalhe.code === 'string' ? detalhe.code.toUpperCase() : '';

  if (erroCodigo === 'EAUTH' || [530, 534, 535].includes(codigo ?? 0)) {
    return { estado: 'rejeitado', codigo_smtp: codigo, detalhe: 'smtp_autenticacao_recusada' };
  }
  if (codigo !== null && codigo >= 400) {
    const estado = estadoPorCodigo(codigo);
    return {
      estado,
      codigo_smtp: codigo,
      detalhe: estado === 'rejeitado' ? 'smtp_remetente_destinatario_ou_mensagem_recusada' : 'smtp_rejeicao_transitoria_sem_aceitacao',
    };
  }

  const falhaAntesDoConteudo = new Set([
    'CONN', 'CONNECT', 'CONNECTION', 'EHLO', 'HELO', 'STARTTLS', 'AUTH', 'MAIL FROM', 'RCPT TO',
  ]).has(comando) || comando.startsWith('AUTH');
  // Antes de DATA o servidor ainda não recebeu o corpo. Depois de iniciar DATA,
  // a resposta pode se perder após aceitação: nunca se autoriza retry automático.
  if (falhaAntesDoConteudo) {
    return { estado: 'falhou', codigo_smtp: null, detalhe: 'smtp_falha_antes_da_aceitacao' };
  }
  if (comando === 'DATA' || comando === 'QUIT'
    || erroCodigo === 'ETIMEDOUT' || erroCodigo === 'ECONNRESET' || erroCodigo === 'EPIPE') {
    return { estado: 'resultado_indeterminado', codigo_smtp: null, detalhe: 'smtp_resultado_indeterminado_conferir_logs' };
  }

  // Erros de DNS, conexão, saudação, TLS ou AUTH ocorreram antes de DATA.
  return { estado: 'falhou', codigo_smtp: null, detalhe: 'smtp_falha_antes_da_aceitacao' };
}

export function classificarAceitacaoSmtp(info: unknown, destinatario: string): ResultadoSmtp {
  if (!info || typeof info !== 'object') {
    return { estado: 'resultado_indeterminado', codigo_smtp: null, detalhe: 'smtp_resultado_indeterminado_conferir_logs' };
  }
  const dados = info as { accepted?: unknown; rejected?: unknown; response?: unknown };
  const resposta = typeof dados.response === 'string' ? dados.response : '';
  const codigo = codigoDeResposta(Number.parseInt(resposta.slice(0, 3), 10));
  const aceitos = Array.isArray(dados.accepted) ? dados.accepted : [];
  const rejeitados = Array.isArray(dados.rejected) ? dados.rejected : [];
  const aceitouDestinatario = aceitos.some((valor) => typeof valor === 'string' && valor.trim().toLowerCase() === destinatario.trim().toLowerCase());

  if (codigo === 250 && aceitouDestinatario && rejeitados.length === 0) {
    return { estado: 'smtp_aceito', codigo_smtp: codigo, detalhe: 'smtp_aceitou_mensagem_nao_confirma_entrega' };
  }
  if (codigo !== null && codigo >= 400) {
    const estado = estadoPorCodigo(codigo);
    return {
      estado,
      codigo_smtp: codigo,
      detalhe: estado === 'rejeitado' ? 'smtp_destinatario_ou_mensagem_recusada' : 'smtp_rejeicao_transitoria_sem_aceitacao',
    };
  }
  if (rejeitados.length > 0 && aceitos.length === 0) {
    return { estado: 'rejeitado', codigo_smtp: codigo, detalhe: 'smtp_destinatario_recusado' };
  }
  return { estado: 'resultado_indeterminado', codigo_smtp: codigo, detalhe: 'smtp_resultado_indeterminado_conferir_logs' };
}
