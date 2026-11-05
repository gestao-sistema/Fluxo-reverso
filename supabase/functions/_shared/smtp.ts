import nodemailer from 'npm:nodemailer@10.2.1';
import {
  classificarAceitacaoSmtp,
  classificarErroSmtp,
  lerConfiguracaoSmtp,
  type MensagemSmtp,
  type ResultadoSmtp,
} from './smtp-contract.ts';

/** Envio síncrono de uma mensagem por chamada; nunca registra credenciais ou protocolo SMTP. */
export async function enviarEmailSmtp(
  env: Record<string, string | undefined>,
  mensagem: MensagemSmtp,
): Promise<ResultadoSmtp> {
  const config = lerConfiguracaoSmtp(env);
  if (!config) return { estado: 'falhou', codigo_smtp: null, detalhe: 'smtp_configuracao_incompleta' };

  const transporter = nodemailer.createTransport({
    host: config.host,
    port: config.porta,
    secure: false,
    requireTLS: true,
    ignoreTLS: false,
    opportunisticTLS: false,
    tls: { rejectUnauthorized: true, minVersion: 'TLSv1.2' },
    auth: { user: config.usuario, pass: config.senha },
    name: 'reverso.azime.com.br',
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 30_000,
    logger: false,
    debug: false,
  });

  let resultado: ResultadoSmtp;
  try {
    const info = await transporter.sendMail({
      from: config.remetente,
      to: mensagem.para,
      subject: mensagem.assunto,
      html: mensagem.html,
      ...(mensagem.texto ? { text: mensagem.texto } : {}),
      disableFileAccess: true,
      disableUrlAccess: true,
    });
    resultado = classificarAceitacaoSmtp(info, mensagem.para);
  } catch (erro) {
    resultado = classificarErroSmtp(erro);
  } finally {
    try { transporter.close(); } catch { /* o estado já foi classificado pela resposta SMTP */ }
  }
  return resultado;
}
