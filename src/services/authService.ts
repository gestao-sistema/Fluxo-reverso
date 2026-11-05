// ── Service Layer: Autenticação (Supabase Auth) ────────────────────────────────
//
// Usa a API de auth do Supabase (JWT nativo).
// Login: signInWithPassword com email interno `{username}@cr.internal`
// Permissões: telas em app_metadata (só o service_role grava). user_metadata
// guarda nome/login, que o próprio usuário consegue alterar.
// CRUD usuários: Edge Function `admin-usuarios` (service_role server-side).
// Sessão: JWT + refresh token, gerenciado pelo SDK Supabase.
// ─────────────────────────────────────────────────────────────────────────────

import { supabase } from '../lib/supabase';
import { LEGADO_PERFIL_TELAS, PERFIS_ACESSO } from '../types';
import type { Usuario, UsuarioAutenticado, CreateUsuarioPayload, UpdateUsuarioPayload, Tela, PerfilAcesso, Empresa, ConvidarUsuarioPayload, ResultadoConvite } from '../types';
import { demoAtivo } from '../demo/demoMode';
import demoAuthService from '../demo/demoAuthService';

export class AuthError extends Error {}

/** Erro do cadastro por convite; `codigo` distingue casos que a tela trata (ex.: confirmacao_necessaria). */
export class ConviteError extends AuthError {
  codigo?: string;
  constructor(mensagem: string, codigo?: string) {
    super(mensagem);
    this.codigo = codigo;
  }
}

export interface IAuthService {
  login(usuario: string, senha: string): Promise<UsuarioAutenticado>;
  logout(): Promise<void>;
  /** Lê sessão atual (async via Supabase). null se deslogado. */
  getSessao(): Promise<UsuarioAutenticado | null>;
  /** Escuta mudanças de estado (mount inicial + refresh). Retorna unsubscribe. */
  onMudancaSessao(cb: (user: UsuarioAutenticado | null) => void): () => void;
  listarNomesUsuarios(): Promise<string[]>;
  listarUsuarios(): Promise<Usuario[]>;
  criarUsuario(data: CreateUsuarioPayload): Promise<Usuario>;
  atualizarUsuario(id: string, data: UpdateUsuarioPayload): Promise<Usuario>;
  removerUsuario(id: string): Promise<void>;
  /** Cadastro por convite: salva o acesso e solicita o envio. O link nunca volta ao navegador do administrador. */
  convidarUsuario(data: ConvidarUsuarioPayload): Promise<ResultadoConvite>;
  /** Reenvio explícito de convite pendente (gera link novo; o anterior deixa de valer). */
  reenviarConvite(id: string, confirmarResultadoIncerto?: boolean): Promise<ResultadoConvite>;
  /** Abre o convite (consome o token_hash) e devolve o usuário convidado. Chamar só por ação da pessoa. */
  validarConvite(tokenHash: string, tipo?: TipoConvite): Promise<{ usuarioId: string }>;
  /**
   * Retomada: a sessão deste navegador (conferida no servidor) é de um convidado que aceitou o convite
   * e ainda não definiu a senha? Devolve o id dessa própria sessão ou null. Nunca consulta outra pessoa.
   */
  sessaoDeConvitePendente(): Promise<{ usuarioId: string } | null>;
  /** Define a senha própria na sessão aberta pelo convite; recusa sessão de outra pessoa. */
  definirSenhaDoConvite(usuarioId: string, senha: string): Promise<void>;
  /** Altera a própria senha (usuário logado). */
  alterarSenha(senhaAtual: string, novaSenha: string): Promise<void>;
}

// ── Helpers ─────────────────────────────────────────────────────────────────────

/**
 * Extrai a mensagem de erro real do corpo da resposta quando a Edge Function
 * devolve non-2xx (o SDK só expõe "Edge Function returned a non-2xx status code").
 */
async function msgErroFuncoes(error: unknown): Promise<string> {
  const ctx = (error as any)?.context;
  if (ctx?.json) {
    try {
      const body = await ctx.json();
      if (body?.error) return body.error;
    } catch { /* corpo não é JSON */ }
  }
  return (error as any)?.message ?? 'Erro desconhecido.';
}

/**
 * Normaliza telas vindas do app_metadata. Se vier `perfil` legado (sem `telas`),
 * migra para as telas equivalentes. Sem `telas` nem `perfil`, não há acesso,
 * igual ao banco e à Edge Function.
 */
function normalizarTelas(md: Record<string, any> = {}): Tela[] {
  if (Array.isArray(md.telas) && md.telas.length > 0) return md.telas as Tela[];
  if (md.perfil) return LEGADO_PERFIL_TELAS[md.perfil] ?? [];
  return [];
}

function normalizarPerfilAcesso(md: Record<string, any> = {}): PerfilAcesso {
  const perfil = md.perfil_acesso ?? md.perfilAcesso;
  if (PERFIS_ACESSO.includes(perfil)) return perfil as PerfilAcesso;
  // Gestão de usuários não vira mestre: o acesso total é um perfil explícito (ou o perfil antigo ADMIN).
  if (md.perfil === 'ADMIN') return 'mestre';
  return 'personalizado';
}

function normalizarEmpresasAcesso(md: Record<string, any> = {}): Empresa[] {
  const empresasSalvas = md.empresas_acesso ?? md.empresasAcesso;
  if (Array.isArray(empresasSalvas)) {
    return empresasSalvas.filter((e: unknown): e is Empresa => e === 'Alinare' || e === 'Novitah');
  }
  const telas = normalizarTelas(md);
  const empresas: Empresa[] = [];
  if (telas.some((t) => t.endsWith('alinare'))) empresas.push('Alinare');
  if (telas.some((t) => t.endsWith('novitah'))) empresas.push('Novitah');
  return empresas;
}

/** Converte User do Supabase em UsuarioAutenticado (shape mantido para a app) */
function toSession(u: any): UsuarioAutenticado {
  return {
    id: u.id,
    nome: u.user_metadata?.nome ?? u.email,
    usuario: u.user_metadata?.usuario ?? u.email?.split('@')[0],
    telas: normalizarTelas(u.app_metadata),
    perfilAcesso: normalizarPerfilAcesso(u.app_metadata),
    empresasAcesso: normalizarEmpresasAcesso(u.app_metadata),
  } as UsuarioAutenticado;
}

/** Corpo de erro da Edge Function: mensagem e, quando houver, o código tipado. */
async function detalheErroFuncoes(error: unknown): Promise<{ mensagem: string; codigo?: string }> {
  const ctx = (error as any)?.context;
  if (ctx?.json) {
    try {
      const body = await ctx.json();
      if (body?.error) return { mensagem: body.error, codigo: typeof body.codigo === 'string' ? body.codigo : undefined };
    } catch { /* corpo não é JSON */ }
  }
  return { mensagem: (error as any)?.message ?? 'Erro desconhecido.' };
}

/** 'invite' = convite novo; 'recovery' = link de definição de senha de quem já aceitou o convite. */
export type TipoConvite = 'invite' | 'recovery';

export const MSG_CONVITE_INVALIDO = 'Este link é inválido, expirou ou já foi usado. Se você já abriu o link e não terminou de criar a senha, peça um novo envio a quem administra o sistema.';
export const MSG_CONVITE_REDE = 'Não foi possível falar com o servidor. Confira a conexão e tente novamente.';
export const SENHA_MINIMA_CONVITE = 8;

function erroDeRede(error: { name?: string; status?: number; message?: string } | null): boolean {
  return !!error && (error.name === 'AuthRetryableFetchError' || error.status === 0 || /fetch|network/i.test(error.message ?? ''));
}

function toUsuario(u: any): Usuario {
  return {
    id: u.id,
    nome: u.user_metadata?.nome ?? u.nome ?? '',
    usuario: u.user_metadata?.usuario ?? u.usuario ?? '',
    // Usuário completo (create/update) traz app_metadata; a listagem já vem achatada
    telas: normalizarTelas(u.app_metadata ?? u),
    protegido: !!u.protegido,
    perfilAcesso: normalizarPerfilAcesso(u.app_metadata ?? u),
    empresasAcesso: normalizarEmpresasAcesso(u.app_metadata ?? u),
    ...(u.situacao ? { situacao: u.situacao, convite: u.convite ?? null } : {}),
  };
}

// ── Implementação ──────────────────────────────────────────────────────────────

const supabaseAuthService: IAuthService = {
  async login(usuario, senha) {
    const isEmail = usuario.includes('@');
    const email = isEmail ? usuario.trim().toLowerCase() : `${usuario.trim().toLowerCase()}@cr.internal`;

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password: senha,
    });

    if (error || !data.user) {
      throw new AuthError('Usuário ou senha inválidos.');
    }

    return toSession(data.user);
  },

  async logout() {
    await supabase.auth.signOut();
  },

  async getSessao() {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) return null;
    // Telas atualizadas pelo admin valem sem novo login: busca o usuário no servidor
    const { data, error } = await supabase.auth.getUser();
    if (data?.user) return toSession(data.user);
    // Usuário removido ou sessão revogada: sai. Sem rede: usa a sessão salva.
    if (error?.status === 401 || error?.status === 403) return null;
    return toSession(session.user);
  },

  onMudancaSessao(cb) {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      cb(session?.user ? toSession(session.user) : null);
    });
    return () => subscription.unsubscribe();
  },

  async listarUsuarios() {
    const { data, error } = await supabase.functions.invoke('admin-usuarios', {
      body: { action: 'list' },
    });

    if (error) {
      const msg = await msgErroFuncoes(error);
      // Fallback local caso a Edge Function esteja fora do ar
      if (msg.includes('fetch') || msg.includes('network') || msg.includes('ECONNREFUSED')) {
        throw new AuthError('Serviço de usuários indisponível no momento.');
      }
      throw new AuthError(msg);
    }
    return (data?.data ?? []).map((u: any) => toUsuario(u));
  },

  async listarNomesUsuarios() {
    const { data, error } = await supabase.functions.invoke('admin-usuarios', {
      body: { action: 'list-names' },
    });

    if (error) throw new AuthError(await msgErroFuncoes(error));
    return (data?.data ?? []).filter((nome: unknown): nome is string => typeof nome === 'string');
  },

  async criarUsuario(data) {
    const { data: result, error } = await supabase.functions.invoke('admin-usuarios', {
      body: { action: 'create', payload: { ...data, usuario: data.usuario.trim().toLowerCase() } },
    });

    if (error) throw new AuthError(await msgErroFuncoes(error));
    return toUsuario(result.data);
  },

  async atualizarUsuario(id, data: UpdateUsuarioPayload) {
    const payload: any = { id };
    if (data.nome) payload.nome = data.nome;
    if (data.telas) payload.telas = data.telas;
    if (data.perfilAcesso) payload.perfilAcesso = data.perfilAcesso;
    if (data.empresasAcesso) payload.empresasAcesso = data.empresasAcesso;
    if (data.aprovacao) payload.aprovacao = data.aprovacao;
    if (data.usuario) payload.usuario = data.usuario.trim().toLowerCase();
    if (data.senha) payload.senha = data.senha;

    const { data: result, error } = await supabase.functions.invoke('admin-usuarios', {
      body: { action: 'update', payload },
    });

    if (error) throw new AuthError(await msgErroFuncoes(error));
    return toUsuario(result.data);
  },

  async removerUsuario(id) {
    const { error } = await supabase.functions.invoke('admin-usuarios', {
      body: { action: 'delete', payload: { id } },
    });

    if (error) throw new AuthError(await msgErroFuncoes(error));
  },

  async convidarUsuario(data) {
    const { data: result, error } = await supabase.functions.invoke('admin-usuarios', {
      body: { action: 'invite', payload: { ...data, email: data.email.trim().toLowerCase() } },
    });
    if (error) {
      const { mensagem, codigo } = await detalheErroFuncoes(error);
      throw new ConviteError(mensagem, codigo);
    }
    return result.data as ResultadoConvite;
  },

  async reenviarConvite(id, confirmarResultadoIncerto = false) {
    const { data: result, error } = await supabase.functions.invoke('admin-usuarios', {
      body: { action: 'resend-invite', payload: { id, confirmarResultadoIncerto } },
    });
    if (error) {
      const { mensagem, codigo } = await detalheErroFuncoes(error);
      throw new ConviteError(mensagem, codigo);
    }
    return result.data as ResultadoConvite;
  },

  async validarConvite(tokenHash, tipo = 'invite') {
    if (!/^[A-Za-z0-9_-]{16,200}$/.test(tokenHash) || (tipo !== 'invite' && tipo !== 'recovery')) throw new AuthError(MSG_CONVITE_INVALIDO);
    // Não encerra a sessão atual antes: um link inválido não pode derrubar uma sessão válida (por exemplo,
    // a de quem ainda precisa definir a senha). Se o convite for válido, o SDK troca a sessão deste
    // navegador pela da pessoa convidada, e definirSenhaDoConvite só aceita essa sessão.
    const { data, error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: tipo });
    if (error || !data.user || !data.session) {
      throw new AuthError(erroDeRede(error) ? MSG_CONVITE_REDE : MSG_CONVITE_INVALIDO);
    }
    return { usuarioId: data.user.id };
  },

  async sessaoDeConvitePendente() {
    // Sem sessão guardada neste navegador não há o que retomar (e nenhuma chamada ao servidor).
    const { data: guardada } = await supabase.auth.getSession();
    if (!guardada.session) return null;
    // O servidor confere o token; a sessão local sozinha não é prova de nada.
    const { data: atual, error } = await supabase.auth.getUser();
    if (error || !atual.user) return null;
    // A pergunta é sobre auth.uid() da própria sessão: não há parâmetro de e-mail ou id.
    const { data: pendente, error: erroRpc } = await supabase.rpc('convite_senha_pendente');
    if (erroRpc) throw new AuthError('Não foi possível confirmar o estado do convite. Tente novamente.');
    if (pendente !== true) return null;
    return { usuarioId: atual.user.id };
  },

  async definirSenhaDoConvite(usuarioId, senha) {
    if (senha.length < SENHA_MINIMA_CONVITE) throw new AuthError(`A senha deve ter pelo menos ${SENHA_MINIMA_CONVITE} caracteres.`);
    // A sessão atual tem de ser a que o convite abriu (conferida no servidor), não a de outra pessoa.
    const { data: atual, error: erroSessao } = await supabase.auth.getUser();
    if (erroSessao || !atual.user) throw new AuthError(erroDeRede(erroSessao) ? MSG_CONVITE_REDE : MSG_CONVITE_INVALIDO);
    if (atual.user.id !== usuarioId) throw new AuthError('A sessão aberta não é a do convite. Abra o link do convite novamente.');
    const { error } = await supabase.auth.updateUser({ password: senha });
    if (error) {
      if (erroDeRede(error)) throw new AuthError(MSG_CONVITE_REDE);
      if ((error as { code?: string }).code === 'weak_password') throw new AuthError('A senha é fraca demais. Use uma senha mais longa, com letras e números.');
      throw new AuthError('Não foi possível salvar a senha. Tente novamente.');
    }
  },

  async alterarSenha(senhaAtual: string, novaSenha: string) {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session?.user) throw new AuthError('Sessão expirada. Faça login novamente.');

    // Verifica senha atual re-autenticando
    const { error: authError } = await supabase.auth.signInWithPassword({
      email: session.user.email!,
      password: senhaAtual,
    });
    if (authError) throw new AuthError('Senha atual incorreta.');

    const { error } = await supabase.auth.updateUser({ password: novaSenha });
    if (error) throw new AuthError(error.message);
  },
};

const authService: IAuthService = new Proxy(supabaseAuthService, {
  get(target, property, receiver) {
    if (demoAtivo() && typeof property === 'string' && property in demoAuthService) {
      return (demoAuthService as unknown as Record<string, unknown>)[property];
    }
    return Reflect.get(target, property, receiver);
  },
});

export default authService;
