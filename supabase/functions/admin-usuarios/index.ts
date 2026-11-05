// ── Supabase Edge Function: Admin Usuários ─────────────────────────────────────
// Gerencia CRUD no auth.users via supabase.auth.admin. Requer service_role.
// Protegido: valida se o chamador possui tela 'usuarios' (ou perfil mestre) em app_metadata.
// Cadastro por tela (acesso.ts): selecionar uma tela concede as operações dela no escopo
// informado; o escopo de aprovação por empresa e setor é gravado junto, na mesma tabela da
// configuração de aprovadores (RPC admin_salvar_escopo_aprovacao_usuario, só service_role).
// As telas ficam em app_metadata (só o service_role grava); user_metadata guarda
// apenas nome e login, que o próprio usuário pode alterar sem ganhar acesso.
// Execução: Deno (Edge Runtime)
// ─────────────────────────────────────────────────────────────────────────────

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.112.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

import { ehAdmin, normalizarAcesso } from './acesso.ts';
import { criarServicoConvite, ErroConvite, situacaoDoUsuario } from './convite.ts';
import { enviarEmailSmtp } from '../_shared/smtp.ts';

// SMTP e modos de transporte são lidos somente do ambiente do servidor.
const ENV_CONVITE = [
  'CONVITE_TRANSPORTE', 'SMTP_HOST', 'SMTP_PORT', 'SMTP_SECURE', 'SMTP_USER', 'SMTP_FROM', 'SMTP_PASS', 'APP_BASE_URL',
] as const;

// Administrador padrão (login 'admin'): login e telas fixos, não pode ser removido.
// Identificado pelo e-mail, e não por user_metadata, que o próprio usuário altera.
const EMAIL_ADMIN_PADRAO = 'admin@cr.internal';

function ehAdminPadrao(u?: { email?: string } | null): boolean {
  return u?.email?.toLowerCase() === EMAIL_ADMIN_PADRAO;
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) throw new Error('Authorization header missing');

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    );

    // 1. Validar identidade e telas do chamador (caller)
    const { data: { user: caller }, error: callerError } = await supabaseClient.auth.getUser();
    if (callerError || !caller) throw new Error('Acesso negado: token inválido.');

    // Não confiar apenas no app_metadata do JWT: uma conta que aceitou o convite
    // ainda pode ter telas administrativas, mas precisa definir a própria senha antes.
    const { data: senhaPendente, error: erroSenhaPendente } = await supabaseClient.rpc('convite_senha_pendente');
    if (erroSenhaPendente || typeof senhaPendente !== 'boolean') {
      throw new ErroConvite('Não foi possível confirmar se a senha do convite já foi definida.', 503, 'estado_convite_indisponivel');
    }
    if (senhaPendente) {
      throw new ErroConvite('Defina a senha do convite antes de usar a administração de usuários.', 403, 'senha_pendente');
    }

    const { action, payload } = await req.json();

    // O formulário usa apenas os nomes como sugestões. Nenhuma outra informação
    // de usuário é exposta para contas sem permissão de administração.
    if (action === 'list-names') {
      const supabaseAdmin = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
        { auth: { autoRefreshToken: false, persistSession: false } }
      );
      const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 });
      if (error) throw error;
      const nomes = [...new Set(data.users
        .map((u) => String(u.user_metadata?.nome ?? '').trim())
        .filter(Boolean))]
        .sort((a, b) => a.localeCompare(b, 'pt-BR'));
      return new Response(JSON.stringify({ data: nomes }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (!ehAdmin(caller.app_metadata ?? {})) {
      throw new Error('Acesso negado: requer permissão de administração (tela "usuarios").');
    }

    // 2. Cliente com service_role para operar no auth.admin
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    if (action === 'create') {
      // Valida o cadastro inteiro antes de criar qualquer coisa.
      const acesso = normalizarAcesso({
        perfilAcesso: payload.perfilAcesso,
        empresasAcesso: payload.empresasAcesso,
        telas: payload.telas,
        aprovacao: payload.aprovacao,
      });
      const isEmail = payload.usuario.includes('@');
      const email = isEmail ? payload.usuario.toLowerCase() : `${payload.usuario}@cr.internal`.toLowerCase();
      const { data, error } = await supabaseAdmin.auth.admin.createUser({
        email,
        password: payload.senha,
        email_confirm: true,
        user_metadata: {
          nome: payload.nome,
          usuario: payload.usuario.toLowerCase(),
        },
        app_metadata: {
          perfil_acesso: acesso.perfilAcesso,
          empresas_acesso: acesso.empresasAcesso,
          telas: acesso.telas,
        },
      });
      if (error) throw error;
      if (acesso.aprovacao.length) {
        // O app_metadata já está gravado: o gatilho de avisos confere a capacidade ao gravar o escopo.
        const { error: erroEscopo } = await supabaseAdmin.rpc('admin_salvar_escopo_aprovacao_usuario', {
          p_usuario_id: data.user.id, p_configuracao: acesso.aprovacao, p_alterado_por: caller.id,
        });
        if (erroEscopo) {
          await supabaseAdmin.auth.admin.deleteUser(data.user.id).catch(() => undefined);
          throw new Error(`Não foi possível gravar o escopo de aprovação: ${erroEscopo.message}`);
        }
      }
      return new Response(JSON.stringify({ data: data.user }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Cadastro por convite: o administrador não define senha; a pessoa define a própria pelo link.
    // O link é uma credencial: nada dele é logado nem devolvido (ver convite.ts).
    if (action === 'invite' || action === 'resend-invite') {
      const env: Record<string, string | undefined> = {};
      for (const nome of ENV_CONVITE) env[nome] = Deno.env.get(nome) ?? undefined;
      const convites = criarServicoConvite({
        env,
        admin: supabaseAdmin as never,
        enviarEmail: (mensagem) => enviarEmailSmtp(env, mensagem),
        log: (mensagem, detalhe) => console.error(mensagem, detalhe ?? ''),
      });
      const chamador = { id: caller.id, app_metadata: caller.app_metadata };
      const resultado = action === 'invite'
        ? await convites.convidar(chamador, payload ?? {})
        : await convites.reenviar(chamador, payload ?? {});
      return new Response(JSON.stringify({ data: resultado }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (action === 'update') {
      // payload.id é o user_id no auth.users
      const { id, nome, telas, usuario, senha, perfilAcesso, empresasAcesso, aprovacao } = payload;
      const mudaAcesso = telas !== undefined || perfilAcesso !== undefined || empresasAcesso !== undefined || aprovacao !== undefined;

      const { data: alvoAtual, error: alvoError } = await supabaseAdmin.auth.admin.getUserById(id);
      if (alvoError) throw alvoError;
      if (ehAdminPadrao(alvoAtual.user) && (usuario || mudaAcesso)) {
        throw new Error('Não é possível alterar login ou telas do administrador padrão.');
      }

      const mdAtual = alvoAtual.user?.app_metadata ?? {};
      let acesso: ReturnType<typeof normalizarAcesso> | null = null;
      if (mudaAcesso) {
        const { data: escopoAtual, error: escopoErro } = await supabaseAdmin.rpc('admin_acesso_aprovacao_usuario', { p_usuario_id: id });
        if (escopoErro) throw new Error('Não foi possível ler o escopo de aprovação atual.');
        acesso = normalizarAcesso({
          perfilAcesso: perfilAcesso ?? mdAtual.perfil_acesso ?? 'personalizado',
          empresasAcesso: empresasAcesso ?? mdAtual.empresas_acesso ?? [],
          telas: telas ?? mdAtual.telas ?? [],
          aprovacao,
          telasAtuais: Array.isArray(mdAtual.telas) ? mdAtual.telas : [],
          aprovacaoAtual: Array.isArray(escopoAtual) ? escopoAtual : [],
        });
        // Quem se edita não pode se trancar para fora da gestão de usuários.
        if (id === caller.id && !acesso.telas.includes('usuarios')) {
          throw new Error('Não é possível remover a própria gestão de usuários.');
        }
      }

      // Envia os objetos completos (atual + alterações) para não depender de merge do GoTrue
      const updateData: any = {};
      if (nome || usuario) {
        updateData.user_metadata = { ...(alvoAtual.user?.user_metadata ?? {}) };
        if (nome) updateData.user_metadata.nome = nome;
        if (usuario) {
          updateData.user_metadata.usuario = usuario.toLowerCase();
          const isEmail = usuario.includes('@');
          updateData.email = isEmail ? usuario.toLowerCase() : `${usuario.toLowerCase()}@cr.internal`;
        }
      }
      if (acesso) {
        updateData.app_metadata = {
          ...mdAtual,
          perfil_acesso: acesso.perfilAcesso,
          empresas_acesso: acesso.empresasAcesso,
          telas: acesso.telas,
        };
      }
      if (senha) updateData.password = senha;

      const { data, error } = await supabaseAdmin.auth.admin.updateUserById(id, updateData);
      if (error) throw error;
      if (acesso) {
        // O app_metadata vem primeiro: o gatilho de avisos confere a capacidade ao gravar o escopo.
        const { error: erroEscopo } = await supabaseAdmin.rpc('admin_salvar_escopo_aprovacao_usuario', {
          p_usuario_id: id, p_configuracao: acesso.aprovacao, p_alterado_por: caller.id,
        });
        if (erroEscopo) {
          // Desfaz a primeira gravação para não deixar tela sem escopo (ou o contrário).
          await supabaseAdmin.auth.admin.updateUserById(id, {
            app_metadata: {
              perfil_acesso: mdAtual.perfil_acesso ?? null,
              empresas_acesso: mdAtual.empresas_acesso ?? null,
              telas: mdAtual.telas ?? null,
            },
          }).catch(() => undefined);
          throw new Error(`Não foi possível gravar o escopo de aprovação: ${erroEscopo.message}`);
        }
      }
      return new Response(JSON.stringify({ data: data.user }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (action === 'delete') {
      if (payload.id === caller.id) throw new Error('Não é possível remover a si próprio.');

      const { data: alvo, error: alvoError } = await supabaseAdmin.auth.admin.getUserById(payload.id);
      if (alvoError) throw alvoError;
      if (ehAdminPadrao(alvo.user)) throw new Error('Não é possível remover o administrador padrão.');

      const { error } = await supabaseAdmin.auth.admin.deleteUser(payload.id);
      if (error) throw error;
      return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (action === 'list') {
      const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 });
      if (error) throw error;

      // Situação dos convites (sem link nem token). Se a migration ainda não foi aplicada, a lista segue sem ela.
      const { data: linhasConvite } = await supabaseAdmin.rpc('admin_convites_listar');
      const convitePorUsuario = new Map<string, any>((Array.isArray(linhasConvite) ? linhasConvite : []).map((linha: any) => [linha.usuario_id, linha]));

      // Contas criadas fora desta tela (ex.: painel do Supabase) podem não ter nome/login
      const usuarios = data.users.map(u => ({
        id: u.id,
        nome: u.user_metadata?.nome ?? u.email ?? '',
        usuario: u.user_metadata?.usuario ?? u.email?.split('@')[0] ?? '',
        telas: u.app_metadata?.telas ?? [],
        perfilAcesso: u.app_metadata?.perfil_acesso ?? (u.app_metadata?.perfil === 'ADMIN' ? 'mestre' : 'personalizado'),
        empresasAcesso: u.app_metadata?.empresas_acesso ?? [],
        protegido: ehAdminPadrao(u),
        ...situacaoDoUsuario(u, convitePorUsuario.get(u.id)),
      })).sort((a, b) => a.nome.localeCompare(b.nome));

      return new Response(JSON.stringify({ data: usuarios }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    throw new Error('Action unknown');

  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message, ...(error instanceof ErroConvite && error.codigo ? { codigo: error.codigo } : {}) }), {
      status: error instanceof ErroConvite ? error.status : 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
