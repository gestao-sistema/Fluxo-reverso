// Cadastro por convite (Edge Function admin-usuarios). Módulo puro: sem APIs do Deno nem imports
// remotos, para rodar igual na Edge Function e nos testes. index.ts liga env, cliente e transporte SMTP.
//
// Fluxo (documentado em docs/convite-de-acesso.md e docs/envio-email-smtp.md):
//   1. valida o administrador, o e-mail corporativo e o acesso (mesmas regras do cadastro por tela);
//   2. cria a conta SEM senha e SEM confirmação (ou reaproveita a pendente) já com as permissões;
//   3. reserva a tentativa no banco (impede envio simultâneo);
//   4. auth.admin.generateLink(type 'invite') — não envia e-mail e não cria segunda conta, pois a
//      conta já existe e está pendente; o link anterior deixa de valer;
//   5. envia por SMTP um link para a página do app (token_hash), nunca o link direto do Supabase;
//      6. grava só o resultado. O link NUNCA é logado, devolvido ou gravado.
import { ehAdmin, normalizarAcesso } from './acesso.ts';
import { montarEmailAcesso } from './convite-email.ts';
import {
  classificarErroSmtp,
  smtpConfigurado,
  type EnviarEmailSmtp,
  type EstadoSmtp,
} from '../_shared/smtp-contract.ts';

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

export type EstadoEnvio = 'enviado' | 'smtp_aceito' | 'falhou' | 'rejeitado' | 'resultado_indeterminado';

export interface ResultadoConvite {
  usuario_id: string;
  email: string;
  /** 'preparado' quando o envio de convites está desabilitado: o cadastro foi salvo e nada foi enviado. */
  estado: 'preparado' | EstadoEnvio;
  /** A conta foi criada nesta chamada (false = convite pendente reaproveitado). */
  conta_criada: boolean;
  envio_habilitado: boolean;
  /** 'definicao_senha': a pessoa já aceitou o convite e não definiu a senha; o link é de recuperação. */
  link: 'convite' | 'definicao_senha';
}

export class ErroConvite extends Error {
  status: number;
  codigo?: string;
  constructor(mensagem: string, status = 400, codigo?: string) {
    super(mensagem);
    this.status = status;
    this.codigo = codigo;
  }
}

type ErroApi = { message?: string; code?: string; status?: number } | null;
type Resultado<T> = { data: T; error: ErroApi };

export interface UsuarioAuth {
  id: string;
  email?: string | null;
  email_confirmed_at?: string | null;
  app_metadata?: Record<string, unknown> | null;
  user_metadata?: Record<string, unknown> | null;
}

export interface ClienteAdminConvite {
  auth: {
    admin: {
      createUser(atributos: Record<string, unknown>): PromiseLike<Resultado<{ user: UsuarioAuth | null }>>;
      getUserById(id: string): PromiseLike<Resultado<{ user: UsuarioAuth | null }>>;
      updateUserById(id: string, atributos: Record<string, unknown>): PromiseLike<Resultado<{ user: UsuarioAuth | null }>>;
      deleteUser(id: string): PromiseLike<{ error: ErroApi }>;
      generateLink(parametros: Record<string, unknown>): PromiseLike<Resultado<{ properties?: { hashed_token?: string } | null } | null>>;
    };
  };
  rpc(nome: string, parametros?: Record<string, unknown>): PromiseLike<{ data: unknown; error: ErroApi }>;
}

export interface DependenciasConvite {
  env: Record<string, string | undefined>;
  admin: ClienteAdminConvite;
  enviarEmail: EnviarEmailSmtp;
  /** Log sem dados pessoais, links, tokens nem corpos de requisição. */
  log?: (mensagem: string, detalhe?: string) => void;
}

export interface ChamadorConvite {
  id: string;
  app_metadata?: Record<string, unknown> | null;
}

export const ROTA_DEFINIR_SENHA = '/definir-senha';

/** Mesma regra de origem do worker de comunicação (comunicacao-etiqueta/logic.ts): HTTPS, ou localhost em desenvolvimento. */
export function origemAplicativoValida(valor: string | undefined): URL | null {
  if (!valor) return null;
  let url: URL;
  try {
    url = new URL(valor);
  } catch {
    return null;
  }
  const local = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
  if (url.protocol !== 'https:' && !(local && url.protocol === 'http:')) return null;
  if (url.username || url.password || url.search || url.hash) return null;
  if (url.pathname !== '/' && url.pathname !== '') return null;
  return url;
}

/** Chave própria dos convites; não depende da habilitação do worker de notificações. */
export function convitesHabilitados(env: Record<string, string | undefined>): boolean {
  return env.CONVITE_TRANSPORTE === 'smtp'
    && smtpConfigurado(env)
    && origemAplicativoValida(env.APP_BASE_URL) !== null;
}

/** 'invite': convite novo. 'recovery': conta que aceitou o convite mas não definiu a senha. */
export type TipoLink = 'invite' | 'recovery';

/** Link da página do app (token_hash), nunca o link direto do Supabase. Origem só da configuração do servidor. */
export function montarLinkConvite(origem: URL, tokenHash: string, tipo: TipoLink = 'invite'): string {
  if (!/^[A-Za-z0-9_-]{16,200}$/.test(tokenHash)) throw new Error('token_invalido');
  const url = new URL(ROTA_DEFINIR_SENHA, origem);
  url.searchParams.set('token_hash', tokenHash);
  url.searchParams.set('type', tipo);
  return url.toString();
}

export interface SituacaoUsuario {
  situacao: 'ativo' | 'convite_pendente' | 'senha_nao_definida';
  convite: { estado: string; tentativas: number; concluidoEm: string | null } | null;
}

interface LinhaConvite {
  usuario_id: string;
  estado: string;
  tentativas: number;
  concluido_em: string | null;
  confirmado: boolean;
  tem_senha: boolean;
}

/** Situação para a listagem: ativo, convite pendente ou convite aceito sem senha definida. */
export function situacaoDoUsuario(usuario: UsuarioAuth, convite: LinhaConvite | undefined): SituacaoUsuario {
  const confirmado = Boolean(usuario.email_confirmed_at);
  const resumo = convite
    ? { estado: convite.estado, tentativas: convite.tentativas, concluidoEm: convite.concluido_em }
    : null;
  if (!confirmado) return { situacao: 'convite_pendente', convite: resumo };
  if (convite && !convite.tem_senha) return { situacao: 'senha_nao_definida', convite: resumo };
  return { situacao: 'ativo', convite: resumo };
}

function validarNome(entrada: unknown): string {
  const nome = typeof entrada === 'string' ? entrada.replace(/\s+/g, ' ').trim() : '';
  if (!nome) throw new ErroConvite('Informe o nome do colaborador.', 422);
  if (nome.length > 120) throw new ErroConvite('O nome deve ter no máximo 120 caracteres.', 422);
  return nome;
}

function exigirAdmin(chamador: ChamadorConvite): void {
  if (!chamador?.id || !ehAdmin(chamador.app_metadata ?? {})) {
    throw new ErroConvite('Acesso negado: requer permissão de administração (tela "usuarios").', 403);
  }
}

const dadosRpc = <T>(valor: T | T[] | null): T | null => (Array.isArray(valor) ? (valor[0] ?? null) : valor);

export function criarServicoConvite(deps: DependenciasConvite) {
  const log = deps.log ?? (() => {});
  const { admin } = deps;

  async function localizar(email: string): Promise<{ id: string; confirmado: boolean; temSenha: boolean } | null> {
    const { data, error } = await admin.rpc('admin_convite_localizar_usuario', { p_email: email });
    if (error) {
      log('[convite] consulta de usuario falhou:', error.code ?? 'erro');
      throw new ErroConvite('Não foi possível consultar o cadastro. Nada foi alterado.', 500);
    }
    type Linha = { id: string; confirmado: boolean; tem_senha?: boolean };
    const linha = dadosRpc(data as Linha | Linha[] | null);
    return linha ? { id: linha.id, confirmado: linha.confirmado === true, temSenha: linha.tem_senha === true } : null;
  }

  async function finalizar(tentativaId: string, estado: EstadoSmtp, codigoSmtp: number | null, detalhe: string): Promise<void> {
    const { data, error } = await admin.rpc('admin_convite_finalizar_envio_smtp', {
      p_tentativa_id: tentativaId, p_estado: estado, p_codigo_smtp: codigoSmtp, p_detalhe: detalhe,
    });
    if (error || data !== true) {
      // A linha fica "em andamento" e expira: a próxima tentativa exigirá confirmação explícita.
      log('[convite] resultado da tentativa nao foi gravado:', error?.code ?? 'sem_linha');
    }
  }

  /** Gera o link e envia diretamente por SMTP, após as permissões estarem gravadas. */
  async function enviar(
    usuarioId: string, email: string, chamadorId: string, contaCriada: boolean, confirmouIncerto: boolean,
    tipo: TipoLink = 'invite', nome?: unknown,
  ): Promise<ResultadoConvite> {
    const base = { usuario_id: usuarioId, email, conta_criada: contaCriada, link: tipo === 'recovery' ? 'definicao_senha' as const : 'convite' as const };

    if (!convitesHabilitados(deps.env)) {
      const { error } = await admin.rpc('admin_convite_preparar', { p_usuario_id: usuarioId, p_email: email, p_convidado_por: chamadorId });
      if (error) {
        log('[convite] registro do convite falhou:', error.code ?? 'erro');
        throw new ErroConvite('O cadastro foi salvo, mas não foi possível registrar o convite. Tente enviar novamente.', 500);
      }
      return { ...base, estado: 'preparado', envio_habilitado: false };
    }
    const resultadoBase = { ...base, envio_habilitado: true };

    const { data: reservaBruta, error: erroReserva } = await admin.rpc('admin_convite_iniciar_envio', {
      p_usuario_id: usuarioId, p_email: email, p_convidado_por: chamadorId, p_confirmou_incerto: confirmouIncerto,
    });
    if (erroReserva) {
      log('[convite] reserva do envio falhou:', erroReserva.code ?? 'erro');
      throw new ErroConvite('O cadastro foi salvo, mas o envio não pôde ser iniciado. Nada foi enviado; tente novamente.', 500);
    }
    const reserva = dadosRpc(reservaBruta as { resultado: string; tentativa_id: string | null } | { resultado: string; tentativa_id: string | null }[] | null);
    if (!reserva || reserva.resultado === 'usuario_ativo') {
      throw new ErroConvite('Este usuário já está ativo. Convite não é enviado a conta ativa; recuperação de senha é outro fluxo.', 409, 'usuario_ativo');
    }
    if (reserva.resultado === 'em_andamento') {
      throw new ErroConvite('Já existe um envio deste convite em andamento. Aguarde o resultado antes de tentar de novo.', 409, 'envio_em_andamento');
    }
    if (reserva.resultado === 'confirmacao_necessaria') {
      throw new ErroConvite(
        'O resultado do último envio é incerto: o servidor SMTP pode já ter aceitado o convite. Confira os registros SMTP antes de reenviar e confirme o reenvio.',
        409, 'confirmacao_necessaria',
      );
    }
    const tentativaId = reserva.tentativa_id!;

    if (tipo === 'recovery') {
      // Última conferência antes de gerar a credencial: conta que já tem senha nunca recebe link de definição.
      let atual: Awaited<ReturnType<typeof localizar>> = null;
      try {
        atual = await localizar(email);
      } catch {
        await finalizar(tentativaId, 'falhou', null, 'Não foi possível conferir a conta; nenhum link foi gerado.');
        throw new ErroConvite('Não foi possível conferir a conta. Nenhum link foi gerado nem enviado.', 500);
      }
      if (!atual || atual.id !== usuarioId || !atual.confirmado || atual.temSenha) {
        await finalizar(tentativaId, 'falhou', null, 'A conta já tem senha; nenhum link foi gerado.');
        throw new ErroConvite('Este usuário já definiu a senha. Nenhum link foi gerado nem enviado.', 409, 'usuario_ativo');
      }
    }

    let chamouSmtp = false;
    try {
      // Reenvio: o convite pendente recebe um token novo e o anterior deixa de valer (GoTrue).
      const origem = origemAplicativoValida(deps.env.APP_BASE_URL)!;
      const { data: gerado, error: erroLink } = await admin.auth.admin.generateLink({
        type: tipo, email, options: { redirectTo: new URL(ROTA_DEFINIR_SENHA, origem).toString() },
      });
      const tokenHash = gerado?.properties?.hashed_token;
      if (erroLink || !tokenHash) {
        log('[convite] geracao do link falhou:', erroLink?.code ?? 'sem_token');
        await finalizar(tentativaId, 'falhou', null, 'Falha ao gerar o link do convite; nada foi enviado.');
        return { ...resultadoBase, estado: 'falhou' };
      }
      let url: string;
      try {
        url = montarLinkConvite(origem, tokenHash, tipo);
      } catch {
        await finalizar(tentativaId, 'falhou', null, 'Link do convite inválido; nada foi enviado.');
        return { ...resultadoBase, estado: 'falhou' };
      }

      // Montada antes de qualquer contato com o SMTP: falha de template nunca vira resultado indeterminado.
      const mensagem = montarEmailAcesso({ tipo, nome, url });

      let resultado = { estado: 'resultado_indeterminado' as EstadoSmtp, codigo_smtp: null as number | null,
        detalhe: 'smtp_resultado_indeterminado_conferir_logs' };
      try {
        chamouSmtp = true;
        resultado = await deps.enviarEmail({ para: email, ...mensagem });
      } catch (erro) {
        resultado = classificarErroSmtp(erro);
      }
      await finalizar(tentativaId, resultado.estado, resultado.codigo_smtp, resultado.detalhe);
      return { ...resultadoBase, estado: resultado.estado };
    } catch {
      const estado: EstadoSmtp = chamouSmtp ? 'resultado_indeterminado' : 'falhou';
      const detalhe = chamouSmtp ? 'smtp_resultado_indeterminado_conferir_logs' : 'smtp_falha_antes_da_aceitacao';
      await finalizar(tentativaId, estado, null, detalhe).catch(() => undefined);
      return { ...resultadoBase, estado };
    }
  }

  /** Grava o escopo de aprovação; em falha desfaz o que esta chamada gravou e NÃO dispara o convite. */
  async function gravarEscopo(
    usuarioId: string, aprovacao: unknown[], chamadorId: string, desfazer: () => Promise<void>, sempre: boolean,
  ): Promise<void> {
    if (!aprovacao.length && !sempre) return;
    const { error } = await admin.rpc('admin_salvar_escopo_aprovacao_usuario', {
      p_usuario_id: usuarioId, p_configuracao: aprovacao, p_alterado_por: chamadorId,
    });
    if (error) {
      await desfazer().catch(() => undefined);
      log('[convite] escopo de aprovacao falhou:', error.code ?? 'erro');
      throw new ErroConvite(`Não foi possível gravar o escopo de aprovação: ${error.message ?? 'erro'}. Nenhum convite foi enviado.`, 500);
    }
  }

  return {
    /** Novo usuário, convite pendente (retomada) ou conta ativa (recusada). */
    async convidar(chamador: ChamadorConvite, entrada: Record<string, unknown>): Promise<ResultadoConvite> {
      exigirAdmin(chamador);
      const nome = validarNome(entrada.nome);
      let email: string;
      try {
        email = normalizarEmailCorporativo(entrada.email);
      } catch (erro) {
        throw new ErroConvite((erro as Error).message, 422);
      }
      let acesso: ReturnType<typeof normalizarAcesso>;
      try {
        acesso = normalizarAcesso({
          perfilAcesso: entrada.perfilAcesso as string | undefined,
          empresasAcesso: entrada.empresasAcesso as string[] | undefined,
          telas: entrada.telas as string[] | undefined,
          aprovacao: entrada.aprovacao as never,
        });
      } catch (erro) {
        throw new ErroConvite((erro as Error).message, 422);
      }
      const confirmouIncerto = entrada.confirmarResultadoIncerto === true;
      const appMetadata = { perfil_acesso: acesso.perfilAcesso, empresas_acesso: acesso.empresasAcesso, telas: acesso.telas };

      let existente = await localizar(email);
      if (existente?.confirmado) {
        if (!existente.temSenha) {
          throw new ErroConvite('Este colaborador já abriu o convite e ainda não definiu a senha. Use "Reenviar" na lista de usuários para enviar um link de definição de senha.', 409, 'senha_nao_definida');
        }
        throw new ErroConvite('Já existe um usuário ativo com este e-mail. Convite não é enviado a conta ativa; recuperação de senha é outro fluxo.', 409, 'usuario_ativo');
      }

      let usuarioId: string;
      let contaCriada = false;
      if (!existente) {
        // Sem senha e sem confirmação: a conta só vira ativa quando a própria pessoa aceita o convite.
        const { data, error } = await admin.auth.admin.createUser({
          email,
          email_confirm: false,
          user_metadata: { nome, usuario: email },
          app_metadata: appMetadata,
        });
        if (error || !data?.user) {
          // Corrida com outra chamada: se a conta já existe, retoma a pendente em vez de falhar.
          existente = await localizar(email);
          if (!existente || existente.confirmado) {
            log('[convite] criacao da conta falhou:', error?.code ?? 'erro');
            throw new ErroConvite('Não foi possível criar a conta. Nenhum convite foi enviado.', 500);
          }
          usuarioId = existente.id;
        } else {
          usuarioId = data.user.id;
          contaCriada = true;
        }
      } else {
        usuarioId = existente.id;
      }

      if (contaCriada) {
        await gravarEscopo(usuarioId, acesso.aprovacao, chamador.id,
          async () => { await admin.auth.admin.deleteUser(usuarioId); }, false);
      } else {
        // Conta pendente reaproveitada: atualiza nome e permissões e desfaz se o escopo falhar.
        const { data: atual, error: erroAtual } = await admin.auth.admin.getUserById(usuarioId);
        if (erroAtual || !atual?.user) throw new ErroConvite('Não foi possível ler a conta pendente. Nenhum convite foi enviado.', 500);
        const mdAnterior = atual.user.app_metadata ?? {};
        const { error: erroAtualizacao } = await admin.auth.admin.updateUserById(usuarioId, {
          user_metadata: { ...(atual.user.user_metadata ?? {}), nome, usuario: email },
          app_metadata: { ...mdAnterior, ...appMetadata },
        });
        if (erroAtualizacao) throw new ErroConvite('Não foi possível gravar as permissões. Nenhum convite foi enviado.', 500);
        await gravarEscopo(usuarioId, acesso.aprovacao, chamador.id,
          async () => { await admin.auth.admin.updateUserById(usuarioId, { app_metadata: mdAnterior }); }, true);
      }

      return enviar(usuarioId, email, chamador.id, contaCriada, confirmouIncerto, 'invite', nome);
    },

    /** Reenvio explícito de convite pendente, com as permissões já gravadas. */
    async reenviar(chamador: ChamadorConvite, entrada: Record<string, unknown>): Promise<ResultadoConvite> {
      exigirAdmin(chamador);
      const id = typeof entrada.id === 'string' ? entrada.id : '';
      if (!id) throw new ErroConvite('Informe o usuário.', 422);
      const { data, error } = await admin.auth.admin.getUserById(id);
      const usuario = data?.user;
      if (error || !usuario) throw new ErroConvite('Usuário não encontrado.', 404);
      let email: string;
      try {
        email = normalizarEmailCorporativo(usuario.email);
      } catch (erro) {
        throw new ErroConvite(`Este usuário não pode receber convite: ${(erro as Error).message}`, 422);
      }
      let tipo: TipoLink = 'invite';
      if (usuario.email_confirmed_at) {
        // Conta confirmada: só a que aceitou o convite e não definiu a senha recebe link de definição.
        // Conta com senha (ativa) é recusada; o banco confere de novo ao reservar a tentativa.
        const loc = await localizar(email);
        if (!loc || loc.id !== usuario.id || loc.temSenha) {
          throw new ErroConvite('Este usuário já está ativo. Convite não é enviado a conta ativa; recuperação de senha é outro fluxo.', 409, 'usuario_ativo');
        }
        tipo = 'recovery';
      }
      const telas = usuario.app_metadata?.telas;
      if (!Array.isArray(telas) || telas.length === 0) {
        throw new ErroConvite('Defina as permissões do usuário antes de enviar o convite.', 422);
      }
      return enviar(usuario.id, email, chamador.id, false, entrada.confirmarResultadoIncerto === true, tipo, usuario.user_metadata?.nome);
    },
  };
}
