import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: {
      signInWithPassword: vi.fn(),
      signOut: vi.fn(),
      getSession: vi.fn(),
      getUser: vi.fn(),
      onAuthStateChange: vi.fn(),
      updateUser: vi.fn(),
    },
    functions: {
      invoke: vi.fn(),
    },
  },
}));

import { supabase } from '../lib/supabase';
import authService, { AuthError } from '../services/authService';

// Telas ficam em app_metadata (só o service_role grava); user_metadata guarda nome/login
const mockUser = {
  id: 'uuid-1',
  email: 'admin@cr.internal',
  user_metadata: { nome: 'Administrador', usuario: 'admin' },
  app_metadata: { provider: 'email', telas: ['usuarios', 'dashboard-geral'] },
};

beforeEach(() => {
  vi.resetAllMocks();
});

describe('authService.login', () => {
  it('sucesso: chama signInWithPassword e retorna UsuarioAutenticado', async () => {
    (supabase.auth.signInWithPassword as any).mockResolvedValue({
      data: { user: mockUser },
      error: null,
    });

    const sessao = await authService.login('admin', 'admin123');

    expect(supabase.auth.signInWithPassword).toHaveBeenCalledWith({
      email: 'admin@cr.internal',
      password: 'admin123',
    });
    expect(sessao).toEqual({
      id: 'uuid-1',
      nome: 'Administrador',
      usuario: 'admin',
      telas: ['usuarios', 'dashboard-geral'],
      // derivados do app_metadata: a tela "usuarios" não vira perfil mestre (acesso total é explícito); sem empresas_acesso e sem
      // telas por empresa, a lista de empresas fica vazia
      perfilAcesso: 'personalizado',
      empresasAcesso: [],
    });
  });

  it('erro: lança AuthError', async () => {
    (supabase.auth.signInWithPassword as any).mockResolvedValue({
      data: { user: null },
      error: { message: 'Invalid login credentials' },
    });

    await expect(authService.login('admin', 'errada')).rejects.toThrow(AuthError);
  });
});

describe('authService.logout', () => {
  it('chama signOut', async () => {
    await authService.logout();
    expect(supabase.auth.signOut).toHaveBeenCalled();
  });
});

// Sessão salva no navegador + usuário atual no servidor (getUser)
function comSessao(salvo: any, atual: any = salvo) {
  (supabase.auth.getSession as any).mockResolvedValue({ data: { session: { user: salvo } } });
  (supabase.auth.getUser as any).mockResolvedValue({ data: { user: atual }, error: null });
}

describe('authService.getSessao', () => {
  it('sem sessão: retorna null', async () => {
    (supabase.auth.getSession as any).mockResolvedValue({ data: { session: null } });
    expect(await authService.getSessao()).toBeNull();
    expect(supabase.auth.getUser).not.toHaveBeenCalled();
  });

  it('com sessão: retorna usuário', async () => {
    comSessao(mockUser);
    expect(await authService.getSessao()).toEqual({
      id: 'uuid-1',
      nome: 'Administrador',
      usuario: 'admin',
      telas: ['usuarios', 'dashboard-geral'],
      // derivados do app_metadata: a tela "usuarios" não vira perfil mestre (acesso total é explícito); sem empresas_acesso e sem
      // telas por empresa, a lista de empresas fica vazia
      perfilAcesso: 'personalizado',
      empresasAcesso: [],
    });
  });

  it('usa as telas atuais do servidor (alteradas pelo admin depois do login)', async () => {
    comSessao(
      { ...mockUser, app_metadata: { telas: ['formulario-alinare'] } },
      { ...mockUser, app_metadata: { telas: ['lista-geral'] } }
    );
    expect((await authService.getSessao())?.telas).toEqual(['lista-geral']);
  });

  it('sem rede: usa a sessão salva', async () => {
    (supabase.auth.getSession as any).mockResolvedValue({ data: { session: { user: mockUser } } });
    (supabase.auth.getUser as any).mockResolvedValue({ data: { user: null }, error: { message: 'Failed to fetch', status: 0 } });
    expect((await authService.getSessao())?.telas).toEqual(['usuarios', 'dashboard-geral']);
  });

  it('usuário removido ou sessão revogada: retorna null', async () => {
    (supabase.auth.getSession as any).mockResolvedValue({ data: { session: { user: mockUser } } });
    (supabase.auth.getUser as any).mockResolvedValue({ data: { user: null }, error: { message: 'User not found', status: 403 } });
    expect(await authService.getSessao()).toBeNull();
  });

  it('sem telas nem perfil: não concede acesso', async () => {
    comSessao({ id: 'uuid-2', email: 'sem@cr.internal', user_metadata: { email_verified: true }, app_metadata: { provider: 'email' } });
    expect((await authService.getSessao())?.telas).toEqual([]);
  });

  it('perfil legado sem telas: usa as telas do perfil', async () => {
    comSessao({ id: 'uuid-3', email: 'nov@cr.internal', app_metadata: { perfil: 'Novitah' } });
    expect((await authService.getSessao())?.telas).toEqual(['dashboard-novitah', 'formulario-novitah', 'lista-novitah']);
  });

  it('perfil desconhecido: não concede acesso', async () => {
    comSessao({ id: 'uuid-4', email: 'x@cr.internal', app_metadata: { perfil: 'Inexistente' } });
    expect((await authService.getSessao())?.telas).toEqual([]);
  });

  it('telas em user_metadata são ignoradas (o próprio usuário consegue alterar esse campo)', async () => {
    comSessao({
      id: 'uuid-5',
      email: 'x@cr.internal',
      user_metadata: { telas: ['usuarios'], perfil: 'ADMIN' },
      app_metadata: { telas: ['formulario-alinare'] },
    });
    expect((await authService.getSessao())?.telas).toEqual(['formulario-alinare']);
  });
});

describe('authService.getSessao: perfil e empresas', () => {
  it('lê perfil_acesso e empresas_acesso do app_metadata', async () => {
    comSessao({
      id: 'uuid-6', email: 'g@cr.internal',
      app_metadata: { telas: ['dashboard-alinare'], perfil_acesso: 'aprovador', empresas_acesso: ['Alinare', 'Inexistente'] },
    });
    const sessao = await authService.getSessao();
    expect(sessao?.perfilAcesso).toBe('aprovador');
    expect(sessao?.empresasAcesso).toEqual(['Alinare']);
  });

  it('perfil e empresas em user_metadata são ignorados (o usuário consegue alterá-los)', async () => {
    comSessao({
      id: 'uuid-7', email: 'x@cr.internal',
      user_metadata: { perfil_acesso: 'mestre', empresas_acesso: ['Alinare', 'Novitah'], telas: ['usuarios'] },
      app_metadata: { telas: ['formulario-novitah'] },
    });
    const sessao = await authService.getSessao();
    expect(sessao?.perfilAcesso).toBe('personalizado');
    expect(sessao?.empresasAcesso).toEqual(['Novitah']);
    expect(sessao?.telas).toEqual(['formulario-novitah']);
  });

  it('perfil_acesso desconhecido não vira perfil privilegiado', async () => {
    comSessao({ id: 'uuid-8', email: 'x@cr.internal', app_metadata: { telas: ['lista-geral'], perfil_acesso: 'superusuario' } });
    expect((await authService.getSessao())?.perfilAcesso).toBe('personalizado');
  });
});

describe('authService.alterarSenha', () => {
  it('lança erro se não tiver sessão', async () => {
    (supabase.auth.getSession as any).mockResolvedValue({ data: { session: null } });
    await expect(authService.alterarSenha('atual123', '123456')).rejects.toThrow(AuthError);
  });

  it('lança erro se a senha atual estiver incorreta', async () => {
    (supabase.auth.getSession as any).mockResolvedValue({ data: { session: { user: mockUser } } });
    (supabase.auth.signInWithPassword as any).mockResolvedValue({ error: { message: 'Invalid login credentials' } });

    await expect(authService.alterarSenha('errada', '123456')).rejects.toThrow('Senha atual incorreta.');
    expect(supabase.auth.updateUser).not.toHaveBeenCalled();
  });

  it('chama updateUser com a nova senha após validar senha atual', async () => {
    (supabase.auth.getSession as any).mockResolvedValue({ data: { session: { user: mockUser } } });
    (supabase.auth.signInWithPassword as any).mockResolvedValue({ error: null });
    (supabase.auth.updateUser as any).mockResolvedValue({ error: null });

    await authService.alterarSenha('atual123', '123456');
    expect(supabase.auth.updateUser).toHaveBeenCalledWith({ password: '123456' });
  });
});

describe('CRUD via Edge Function', () => {
  it('listarUsuarios: invoca function', async () => {
    (supabase.functions.invoke as any).mockResolvedValue({
      // A Edge Function devolve a listagem já achatada (telas vindas de app_metadata)
      data: { data: [{ id: '1', nome: 'A', usuario: 'a', telas: ['dashboard-alinare'] }] },
      error: null,
    });

    const res = await authService.listarUsuarios();
    expect(supabase.functions.invoke).toHaveBeenCalledWith('admin-usuarios', {
      body: { action: 'list' },
    });
    expect(res).toHaveLength(1);
    expect(res[0].nome).toBe('A');
    expect(res[0].telas).toEqual(['dashboard-alinare']);
  });

  it('criarUsuario: invoca function e formata payload', async () => {
    (supabase.functions.invoke as any).mockResolvedValue({
      data: { data: { id: '2', user_metadata: { nome: 'N', usuario: 'n' }, app_metadata: { telas: ['usuarios'] } } },
      error: null,
    });

    const res = await authService.criarUsuario({ nome: 'N', usuario: 'N ', senha: '123', telas: ['usuarios'] });

    expect(supabase.functions.invoke).toHaveBeenCalledWith('admin-usuarios', {
      body: { action: 'create', payload: { nome: 'N', usuario: 'n', senha: '123', telas: ['usuarios'] } },
    });
    expect(res.usuario).toBe('n');
  });

  it('atualizarUsuario: invoca function', async () => {
    (supabase.functions.invoke as any).mockResolvedValue({
      data: { data: { id: 'uuid-1', user_metadata: { nome: 'Novo' } } },
      error: null,
    });

    await authService.atualizarUsuario('uuid-1', { nome: 'Novo', usuario: ' Admin ', telas: ['dashboard-geral'] });

    expect(supabase.functions.invoke).toHaveBeenCalledWith('admin-usuarios', {
      body: { action: 'update', payload: { id: 'uuid-1', nome: 'Novo', usuario: 'admin', telas: ['dashboard-geral'] } },
    });
  });

  it('removerUsuario: invoca function', async () => {
    (supabase.functions.invoke as any).mockResolvedValue({ data: {}, error: null });
    await authService.removerUsuario('uuid-1');
    expect(supabase.functions.invoke).toHaveBeenCalledWith('admin-usuarios', {
      body: { action: 'delete', payload: { id: 'uuid-1' } },
    });
  });

  it('removerUsuario: mostra o motivo devolvido pela function, não o texto genérico', async () => {
    (supabase.functions.invoke as any).mockResolvedValue({
      data: null,
      error: { message: 'Edge Function returned a non-2xx status code', context: { json: async () => ({ error: 'Não é possível remover o administrador padrão.' }) } },
    });
    await expect(authService.removerUsuario('uuid-1')).rejects.toThrow('Não é possível remover o administrador padrão.');
  });
});