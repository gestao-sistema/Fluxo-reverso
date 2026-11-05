import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: {
      signOut: vi.fn(),
      verifyOtp: vi.fn(),
      getUser: vi.fn(),
      updateUser: vi.fn(),
      getSession: vi.fn(),
    },
    functions: { invoke: vi.fn() },
    rpc: vi.fn(),
  },
}));

import { supabase } from '../lib/supabase';
import authService, { AuthError, ConviteError, MSG_CONVITE_INVALIDO, MSG_CONVITE_REDE } from '../services/authService';

const TOKEN = 'a1b2c3d4e5f6a7b8c9d0e1f2';
const auth = supabase.auth as unknown as Record<string, ReturnType<typeof vi.fn>>;
const invoke = supabase.functions.invoke as unknown as ReturnType<typeof vi.fn>;
const rpc = (supabase as unknown as { rpc: ReturnType<typeof vi.fn> }).rpc;

beforeEach(() => {
  vi.resetAllMocks();
  auth.signOut.mockResolvedValue({ error: null });
});

describe('authService.validarConvite', () => {
  it('abre o convite com token_hash do tipo invite e NÃO derruba a sessão atual antes de o convite ser válido', async () => {
    auth.verifyOtp.mockResolvedValue({ data: { user: { id: 'convidado-1' }, session: { access_token: 'x' } }, error: null });
    const r = await authService.validarConvite(TOKEN);
    expect(r).toEqual({ usuarioId: 'convidado-1' });
    expect(auth.verifyOtp).toHaveBeenCalledWith({ token_hash: TOKEN, type: 'invite' });
    expect(auth.signOut).not.toHaveBeenCalled();
  });

  it('link de definição de senha usa o tipo recovery; tipos fora de invite/recovery nem chegam ao servidor', async () => {
    auth.verifyOtp.mockResolvedValue({ data: { user: { id: 'convidado-1' }, session: { access_token: 'x' } }, error: null });
    await authService.validarConvite(TOKEN, 'recovery');
    expect(auth.verifyOtp).toHaveBeenCalledWith({ token_hash: TOKEN, type: 'recovery' });
    auth.verifyOtp.mockClear();
    await expect(authService.validarConvite(TOKEN, 'magiclink' as never)).rejects.toThrow(MSG_CONVITE_INVALIDO);
    expect(auth.verifyOtp).not.toHaveBeenCalled();
  });

  it('link inválido não encerra a sessão existente (quem ainda precisa definir a senha não a perde)', async () => {
    auth.verifyOtp.mockResolvedValue({ data: { user: null, session: null }, error: { name: 'AuthApiError', status: 403, code: 'otp_expired', message: 'x' } });
    await expect(authService.validarConvite(TOKEN)).rejects.toThrow(MSG_CONVITE_INVALIDO);
    expect(auth.signOut).not.toHaveBeenCalled();
  });

  it('link inválido, expirado ou já utilizado vira a mensagem de convite inválido', async () => {
    for (const erro of [
      { name: 'AuthApiError', status: 403, code: 'otp_expired', message: 'Email link is invalid or has expired' },
      { name: 'AuthApiError', status: 400, code: 'validation_failed', message: 'Token has expired or is invalid' },
    ]) {
      auth.verifyOtp.mockResolvedValue({ data: { user: null, session: null }, error: erro });
      await expect(authService.validarConvite(TOKEN)).rejects.toThrow(MSG_CONVITE_INVALIDO);
    }
  });

  it('falha de rede é distinta do link inválido (o convite pode estar intacto)', async () => {
    auth.verifyOtp.mockResolvedValue({ data: { user: null, session: null }, error: { name: 'AuthRetryableFetchError', status: 0, message: 'Failed to fetch' } });
    await expect(authService.validarConvite(TOKEN)).rejects.toThrow(MSG_CONVITE_REDE);
  });

  it('token com formato estranho nem chega ao servidor', async () => {
    for (const token of ['', 'curto', `${TOKEN}&redirect=https://evil.test`, 'a b c d e f g h i j k l m n']) {
      await expect(authService.validarConvite(token)).rejects.toBeInstanceOf(AuthError);
    }
    expect(auth.verifyOtp).not.toHaveBeenCalled();
  });

  it('resposta sem sessão nunca é tratada como convite aceito', async () => {
    auth.verifyOtp.mockResolvedValue({ data: { user: { id: 'x' }, session: null }, error: null });
    await expect(authService.validarConvite(TOKEN)).rejects.toThrow(MSG_CONVITE_INVALIDO);
  });
});

describe('authService.sessaoDeConvitePendente (retomada)', () => {
  it('sem sessão neste navegador: não consulta o servidor nem o banco', async () => {
    auth.getSession.mockResolvedValue({ data: { session: null } });
    expect(await authService.sessaoDeConvitePendente()).toBeNull();
    expect(auth.getUser).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });

  it('sessão do convidado sem senha: devolve o id da PRÓPRIA sessão (conferido no servidor), sem parâmetros de e-mail ou id', async () => {
    auth.getSession.mockResolvedValue({ data: { session: { access_token: 'x' } } });
    auth.getUser.mockResolvedValue({ data: { user: { id: 'convidado-1' } }, error: null });
    rpc.mockResolvedValue({ data: true, error: null });
    expect(await authService.sessaoDeConvitePendente()).toEqual({ usuarioId: 'convidado-1' });
    expect(rpc).toHaveBeenCalledWith('convite_senha_pendente');
  });

  it('usuário comum com senha (o banco responde false) nunca é tratado como convite pendente', async () => {
    auth.getSession.mockResolvedValue({ data: { session: { access_token: 'x' } } });
    auth.getUser.mockResolvedValue({ data: { user: { id: 'ativo-1' } }, error: null });
    rpc.mockResolvedValue({ data: false, error: null });
    expect(await authService.sessaoDeConvitePendente()).toBeNull();
  });

  it('sessão local que o servidor não reconhece, ou erro do banco, não liberam nada', async () => {
    auth.getSession.mockResolvedValue({ data: { session: { access_token: 'velho' } } });
    auth.getUser.mockResolvedValue({ data: { user: null }, error: { status: 401, message: 'invalid jwt' } });
    expect(await authService.sessaoDeConvitePendente()).toBeNull();
    expect(rpc).not.toHaveBeenCalled();
    auth.getUser.mockResolvedValue({ data: { user: { id: 'u' } }, error: null });
    rpc.mockResolvedValue({ data: null, error: { code: '42883', message: 'function does not exist' } });
    await expect(authService.sessaoDeConvitePendente()).rejects.toThrow(/Não foi possível confirmar o estado do convite/);
  });
});

describe('authService.definirSenhaDoConvite', () => {
  it('define a senha na sessão do convite', async () => {
    auth.getUser.mockResolvedValue({ data: { user: { id: 'convidado-1' } }, error: null });
    auth.updateUser.mockResolvedValue({ data: {}, error: null });
    await authService.definirSenhaDoConvite('convidado-1', 'uma-senha-forte-1');
    expect(auth.updateUser).toHaveBeenCalledWith({ password: 'uma-senha-forte-1' });
  });

  it('sessão de outra pessoa NÃO recebe a alteração de senha', async () => {
    auth.getUser.mockResolvedValue({ data: { user: { id: 'outra-pessoa' } }, error: null });
    await expect(authService.definirSenhaDoConvite('convidado-1', 'uma-senha-forte-1')).rejects.toThrow(/não é a do convite/);
    expect(auth.updateUser).not.toHaveBeenCalled();
  });

  it('sem sessão válida não altera nada', async () => {
    auth.getUser.mockResolvedValue({ data: { user: null }, error: { status: 401, message: 'invalid jwt' } });
    await expect(authService.definirSenhaDoConvite('convidado-1', 'uma-senha-forte-1')).rejects.toThrow(MSG_CONVITE_INVALIDO);
    expect(auth.updateUser).not.toHaveBeenCalled();
  });

  it('senha curta não chega ao servidor', async () => {
    await expect(authService.definirSenhaDoConvite('convidado-1', '1234567')).rejects.toThrow(/pelo menos 8/);
    expect(auth.getUser).not.toHaveBeenCalled();
    expect(auth.updateUser).not.toHaveBeenCalled();
  });

  it('traduz senha fraca e falha de rede, sem expor a mensagem do servidor', async () => {
    auth.getUser.mockResolvedValue({ data: { user: { id: 'convidado-1' } }, error: null });
    auth.updateUser.mockResolvedValue({ data: {}, error: { code: 'weak_password', message: 'Password should contain letters' } });
    await expect(authService.definirSenhaDoConvite('convidado-1', 'uma-senha-forte-1')).rejects.toThrow(/fraca/);
    auth.updateUser.mockResolvedValue({ data: {}, error: { name: 'AuthRetryableFetchError', status: 0, message: 'Failed to fetch' } });
    await expect(authService.definirSenhaDoConvite('convidado-1', 'uma-senha-forte-1')).rejects.toThrow(MSG_CONVITE_REDE);
    auth.updateUser.mockResolvedValue({ data: {}, error: { code: 'unexpected_failure', message: 'detalhe interno do servidor' } });
    await expect(authService.definirSenhaDoConvite('convidado-1', 'uma-senha-forte-1')).rejects.toThrow('Não foi possível salvar a senha. Tente novamente.');
  });
});

describe('authService.convidarUsuario / reenviarConvite', () => {
  const payload = { nome: 'Maria', email: '  Maria@AZIME.com.br ', perfilAcesso: 'personalizado' as const, empresasAcesso: [], telas: ['lista-geral' as const] };

  it('envia só nome, e-mail normalizado e acesso: nenhuma senha', async () => {
    invoke.mockResolvedValue({ data: { data: { usuario_id: 'u1', email: 'maria@azime.com.br', estado: 'enviado', conta_criada: true, envio_habilitado: true } }, error: null });
    const r = await authService.convidarUsuario(payload);
    expect(r.estado).toBe('enviado');
    const [funcao, opcoes] = invoke.mock.calls[0];
    expect(funcao).toBe('admin-usuarios');
    expect(opcoes.body.action).toBe('invite');
    expect(opcoes.body.payload.email).toBe('maria@azime.com.br');
    expect(JSON.stringify(opcoes.body)).not.toMatch(/senha|password/i);
  });

  it('propaga a mensagem e o código tipado do backend', async () => {
    invoke.mockResolvedValue({
      data: null,
      error: { message: 'non-2xx', context: { json: async () => ({ error: 'Resultado incerto.', codigo: 'confirmacao_necessaria' }) } },
    });
    const erro = await authService.convidarUsuario(payload).catch((e) => e);
    expect(erro).toBeInstanceOf(ConviteError);
    expect(erro.message).toBe('Resultado incerto.');
    expect(erro.codigo).toBe('confirmacao_necessaria');
  });

  it('reenvio pede a ação própria e leva a confirmação explícita', async () => {
    invoke.mockResolvedValue({ data: { data: { usuario_id: 'u1', email: 'maria@azime.com.br', estado: 'enviado', conta_criada: false, envio_habilitado: true } }, error: null });
    await authService.reenviarConvite('u1');
    await authService.reenviarConvite('u1', true);
    expect(invoke.mock.calls[0][1].body).toEqual({ action: 'resend-invite', payload: { id: 'u1', confirmarResultadoIncerto: false } });
    expect(invoke.mock.calls[1][1].body.payload.confirmarResultadoIncerto).toBe(true);
  });
});
