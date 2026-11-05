import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

const mocks = vi.hoisted(() => ({
  user: null as { id: string } | null,
  validarConvite: vi.fn(),
  definirSenhaDoConvite: vi.fn(),
  sessaoDeConvitePendente: vi.fn(),
  logout: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock('../services/authService', async () => {
  const real = await vi.importActual<typeof import('../services/authService')>('../services/authService');
  return { ...real, default: { validarConvite: mocks.validarConvite, definirSenhaDoConvite: mocks.definirSenhaDoConvite, sessaoDeConvitePendente: mocks.sessaoDeConvitePendente } };
});
vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ user: mocks.user, logout: mocks.logout }) }));
vi.mock('../components/ui/BotaoModoCor', () => ({ default: () => null }));
vi.mock('../components/ui/BotaoEfeitosFundo', () => ({ default: () => null }));
vi.mock('react-hot-toast', () => ({ default: mocks.toast }));

import DefinirSenhaPage from '../pages/DefinirSenhaPage';
import { AuthError, MSG_CONVITE_INVALIDO, MSG_CONVITE_REDE } from '../services/authService';

const TOKEN = 'a1b2c3d4e5f6a7b8c9d0e1f2';
const SENHA = 'uma-senha-forte-1';

function abrir(url = `/definir-senha?token_hash=${TOKEN}&type=invite`) {
  window.history.pushState({}, '', url);
  return render(
    <MemoryRouter initialEntries={['/definir-senha']}>
      <Routes>
        <Route path="/definir-senha" element={<DefinirSenhaPage />} />
        <Route path="/" element={<div>HOME</div>} />
        <Route path="/login" element={<div>LOGIN</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

const preencher = (senha = SENHA, confirmacao = SENHA) => {
  fireEvent.change(screen.getByLabelText(/nova senha/i), { target: { value: senha } });
  fireEvent.change(screen.getByLabelText(/confirmar senha/i), { target: { value: confirmacao } });
};
const enviar = () => fireEvent.click(screen.getByRole('button', { name: /salvar senha/i }));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.user = null;
  mocks.sessaoDeConvitePendente.mockResolvedValue(null);
  mocks.logout.mockResolvedValue(undefined);
});

describe('página de definição de senha do convite', () => {
  it('abrir o link NÃO consome o convite e retira o token da barra de endereço', () => {
    abrir();
    expect(mocks.validarConvite).not.toHaveBeenCalled();
    expect(window.location.search).toBe('');
    expect(window.location.href).not.toContain(TOKEN);
    expect(screen.getByLabelText(/nova senha/i)).toBeInTheDocument();
  });

  it('valida o convite e define a senha só quando a pessoa envia; depois vai para a aplicação', async () => {
    mocks.validarConvite.mockResolvedValue({ usuarioId: 'convidado-1' });
    mocks.definirSenhaDoConvite.mockResolvedValue(undefined);
    abrir();
    preencher();
    enviar();
    expect(await screen.findByText('HOME')).toBeInTheDocument();
    expect(mocks.validarConvite).toHaveBeenCalledTimes(1);
    expect(mocks.validarConvite).toHaveBeenCalledWith(TOKEN, 'invite');
    expect(mocks.definirSenhaDoConvite).toHaveBeenCalledWith('convidado-1', SENHA);
    expect(mocks.toast.success).toHaveBeenCalled();
  });

  it('senhas diferentes ou curtas não chegam ao servidor', () => {
    abrir();
    preencher(SENHA, 'outra-senha-forte');
    enviar();
    expect(screen.getByRole('alert')).toHaveTextContent('As senhas não conferem.');
    preencher('curta', 'curta');
    enviar();
    expect(screen.getByRole('alert')).toHaveTextContent(/pelo menos 8/);
    expect(mocks.validarConvite).not.toHaveBeenCalled();
  });

  it('convite inválido, expirado ou usado: mensagem clara, sem formulário e com saída para o login', async () => {
    mocks.validarConvite.mockRejectedValue(new AuthError(MSG_CONVITE_INVALIDO));
    abrir();
    preencher();
    enviar();
    expect(await screen.findByRole('alert')).toHaveTextContent(MSG_CONVITE_INVALIDO);
    expect(screen.queryByLabelText(/nova senha/i)).not.toBeInTheDocument();
    expect(mocks.definirSenhaDoConvite).not.toHaveBeenCalled();
    expect(screen.getByRole('link', { name: /ir para o login/i })).toHaveAttribute('href', '/login');
  });

  it('falha de rede ao abrir o convite mantém o formulário e permite tentar de novo com o mesmo link', async () => {
    mocks.validarConvite.mockRejectedValueOnce(new AuthError(MSG_CONVITE_REDE));
    mocks.validarConvite.mockResolvedValueOnce({ usuarioId: 'convidado-1' });
    mocks.definirSenhaDoConvite.mockResolvedValue(undefined);
    abrir();
    preencher();
    enviar();
    expect(await screen.findByRole('alert')).toHaveTextContent(MSG_CONVITE_REDE);
    enviar();
    expect(await screen.findByText('HOME')).toBeInTheDocument();
    expect(mocks.validarConvite).toHaveBeenCalledTimes(2);
    expect(mocks.validarConvite).toHaveBeenLastCalledWith(TOKEN, 'invite');
  });

  it('se a senha falhar depois de o convite ser aberto, repetir não reutiliza o token já consumido', async () => {
    mocks.validarConvite.mockResolvedValue({ usuarioId: 'convidado-1' });
    mocks.definirSenhaDoConvite.mockRejectedValueOnce(new AuthError('A senha é fraca demais.'));
    mocks.definirSenhaDoConvite.mockResolvedValueOnce(undefined);
    abrir();
    preencher();
    enviar();
    expect(await screen.findByRole('alert')).toHaveTextContent('A senha é fraca demais.');
    enviar();
    expect(await screen.findByText('HOME')).toBeInTheDocument();
    expect(mocks.validarConvite).toHaveBeenCalledTimes(1);
    expect(mocks.definirSenhaDoConvite).toHaveBeenCalledTimes(2);
    expect(mocks.definirSenhaDoConvite).toHaveBeenLastCalledWith('convidado-1', SENHA);
  });

  it('cliques repetidos durante o envio não verificam o convite duas vezes', async () => {
    let liberar: (valor: { usuarioId: string }) => void = () => {};
    mocks.validarConvite.mockReturnValue(new Promise((resolver) => { liberar = resolver; }));
    mocks.definirSenhaDoConvite.mockResolvedValue(undefined);
    abrir();
    preencher();
    enviar();
    enviar();
    enviar();
    expect(mocks.validarConvite).toHaveBeenCalledTimes(1);
    liberar({ usuarioId: 'convidado-1' });
    await waitFor(() => expect(screen.getByText('HOME')).toBeInTheDocument());
    expect(mocks.definirSenhaDoConvite).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['sem token', '/definir-senha'],
    ['só o e-mail na URL', '/definir-senha?email=maria@azime.com.br&type=invite'],
    ['tipo desconhecido', `/definir-senha?token_hash=${TOKEN}&type=magiclink`],
    ['tipo signup', `/definir-senha?token_hash=${TOKEN}&type=signup`],
    ['token com formato inválido', '/definir-senha?token_hash=abc&type=invite'],
  ])('%s: não há como alterar a senha', async (_nome, url) => {
    abrir(url);
    expect(await screen.findByRole('alert')).toHaveTextContent(/link do convite/i);
    expect(screen.queryByLabelText(/nova senha/i)).not.toBeInTheDocument();
    expect(mocks.validarConvite).not.toHaveBeenCalled();
    expect(mocks.definirSenhaDoConvite).not.toHaveBeenCalled();
  });

  it('avisa que a sessão de outra pessoa neste navegador será substituída pela do convite', () => {
    mocks.user = { id: 'outra-pessoa' };
    abrir();
    expect(screen.getByRole('status')).toHaveTextContent(/será substituída/i);
  });
});

describe('definição de senha: interrupção, retomada e F5', () => {
  it('link de definição de senha (type=recovery) é verificado como recovery, só ao enviar', async () => {
    mocks.validarConvite.mockResolvedValue({ usuarioId: 'convidado-1' });
    mocks.definirSenhaDoConvite.mockResolvedValue(undefined);
    abrir(`/definir-senha?token_hash=${TOKEN}&type=recovery`);
    expect(mocks.validarConvite).not.toHaveBeenCalled();
    preencher();
    enviar();
    expect(await screen.findByText('HOME')).toBeInTheDocument();
    expect(mocks.validarConvite).toHaveBeenCalledWith(TOKEN, 'recovery');
  });

  it('F5 ANTES de enviar: o token some da URL, a página não o consumiu, e reabrir o link original funciona', async () => {
    const primeira = abrir();
    expect(window.location.search).toBe('');
    expect(mocks.validarConvite).not.toHaveBeenCalled();
    primeira.unmount();

    // F5: a URL já não tem o token e não há sessão de convidado. Não há formulário nem erro técnico:
    // a página manda reabrir o link do e-mail (que continua válido) ou pedir novo envio.
    abrir('/definir-senha');
    const aviso = await screen.findByRole('alert');
    expect(aviso).toHaveTextContent(/abra o link do convite/i);
    expect(aviso).toHaveTextContent(/novo envio/i);
    expect(screen.queryByLabelText(/nova senha/i)).not.toBeInTheDocument();
    expect(mocks.definirSenhaDoConvite).not.toHaveBeenCalled();

    // Reabrir o link original do e-mail: o convite ainda não tinha sido consumido.
    cleanup();
    mocks.validarConvite.mockResolvedValue({ usuarioId: 'convidado-1' });
    mocks.definirSenhaDoConvite.mockResolvedValue(undefined);
    abrir();
    preencher();
    enviar();
    expect(await screen.findByText('HOME')).toBeInTheDocument();
    expect(mocks.validarConvite).toHaveBeenCalledTimes(1);
  });

  it('convite aberto, senha não salva e página fechada: ao reabrir (sem token) a sessão do próprio convidado retoma a definição', async () => {
    mocks.validarConvite.mockResolvedValue({ usuarioId: 'convidado-1' });
    mocks.definirSenhaDoConvite.mockRejectedValueOnce(new AuthError(MSG_CONVITE_REDE));
    const primeira = abrir();
    preencher();
    enviar();
    expect(await screen.findByRole('alert')).toHaveTextContent(MSG_CONVITE_REDE);
    primeira.unmount(); // fechou a página: o token já tinha sido consumido

    mocks.sessaoDeConvitePendente.mockResolvedValue({ usuarioId: 'convidado-1' });
    mocks.definirSenhaDoConvite.mockResolvedValue(undefined);
    abrir('/definir-senha');
    expect(await screen.findByLabelText(/nova senha/i)).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(/convite já foi aberto/i);
    preencher();
    enviar();
    expect(await screen.findByText('HOME')).toBeInTheDocument();
    expect(mocks.validarConvite).toHaveBeenCalledTimes(1); // nunca reutiliza o token consumido
    expect(mocks.definirSenhaDoConvite).toHaveBeenLastCalledWith('convidado-1', SENHA);
  });

  it('reabrir o link original já consumido, na sessão que ainda precisa da senha, continua em vez de travar', async () => {
    mocks.validarConvite.mockRejectedValue(new AuthError(MSG_CONVITE_INVALIDO));
    mocks.sessaoDeConvitePendente.mockResolvedValue({ usuarioId: 'convidado-1' });
    mocks.definirSenhaDoConvite.mockResolvedValue(undefined);
    abrir();
    preencher();
    enviar();
    expect(await screen.findByRole('alert')).toHaveTextContent(/já foi usado, mas a sua conta ainda não tem senha/i);
    expect(screen.getByLabelText(/nova senha/i)).toBeInTheDocument();
    preencher();
    enviar();
    expect(await screen.findByText('HOME')).toBeInTheDocument();
    expect(mocks.validarConvite).toHaveBeenCalledTimes(1);
    expect(mocks.definirSenhaDoConvite).toHaveBeenCalledWith('convidado-1', SENHA);
  });

  it('convidado com senha pendente pode sair sem operar o sistema', async () => {
    mocks.user = { id: 'convidado-1' };
    mocks.sessaoDeConvitePendente.mockResolvedValue({ usuarioId: 'convidado-1' });
    abrir('/definir-senha');
    expect(await screen.findByLabelText(/nova senha/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /sair sem definir a senha/i }));
    expect(await screen.findByText('LOGIN')).toBeInTheDocument();
    expect(mocks.logout).toHaveBeenCalledTimes(1);
  });

  it('link consumido e sem sessão pendente: mensagem clara e saída para o login; nada é alterado', async () => {
    mocks.validarConvite.mockRejectedValue(new AuthError(MSG_CONVITE_INVALIDO));
    abrir();
    preencher();
    enviar();
    expect(await screen.findByRole('alert')).toHaveTextContent(/novo envio/i);
    expect(screen.queryByLabelText(/nova senha/i)).not.toBeInTheDocument();
    expect(mocks.definirSenhaDoConvite).not.toHaveBeenCalled();
  });

  it('sessão de OUTRA pessoa (sem senha pendente) abrindo /definir-senha sem link: não há formulário', async () => {
    mocks.user = { id: 'outra-pessoa' };
    mocks.sessaoDeConvitePendente.mockResolvedValue(null);
    abrir('/definir-senha');
    expect(await screen.findByRole('alert')).toHaveTextContent(/abra o link do convite/i);
    expect(screen.queryByLabelText(/nova senha/i)).not.toBeInTheDocument();
    expect(mocks.definirSenhaDoConvite).not.toHaveBeenCalled();
  });

  it('falha ao consultar a sessão (rede) cai no aviso de abrir o link, sem formulário', async () => {
    mocks.sessaoDeConvitePendente.mockRejectedValue(new Error('rede'));
    abrir('/definir-senha');
    expect(await screen.findByRole('alert')).toHaveTextContent(/abra o link do convite/i);
    expect(screen.queryByLabelText(/nova senha/i)).not.toBeInTheDocument();
  });

  it('e-mail na URL não autoriza nada, mesmo com sessão pendente de outra conta', async () => {
    mocks.sessaoDeConvitePendente.mockResolvedValue(null);
    abrir('/definir-senha?email=maria@azime.com.br&type=invite');
    expect(await screen.findByRole('alert')).toHaveTextContent(/abra o link do convite/i);
    expect(mocks.definirSenhaDoConvite).not.toHaveBeenCalled();
  });
});
