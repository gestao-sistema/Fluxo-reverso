import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import type { UsuarioAutenticado } from '../types';

// Destino do login: só rotas internas (/admin/...) vindas do estado do roteador. Um valor de
// outra origem, de fora da área interna ou malformado cai na home do perfil.
const mocks = vi.hoisted(() => ({ login: vi.fn(), iniciarDemonstracao: vi.fn() }));

vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({ login: mocks.login, iniciarDemonstracao: mocks.iniciarDemonstracao }),
}));
vi.mock('../components/ui/BotaoEfeitosFundo', () => ({ default: () => null }));
vi.mock('../components/ui/BotaoModoCor', () => ({ default: () => null }));
vi.mock('react-hot-toast', () => ({ default: { success: vi.fn(), error: vi.fn() } }));

import LoginPage from '../pages/LoginPage';
import toast from 'react-hot-toast';

const sessao = { id: 'u1', nome: 'Pessoa', usuario: 'pessoa', telas: ['formulario-alinare'], empresasAcesso: ['Alinare'] } as UsuarioAutenticado;

function Destino() {
  const { pathname, search, hash } = useLocation();
  return <div data-testid="destino">{pathname}{search}{hash}</div>;
}

function renderLogin(from?: unknown) {
  return render(
    <MemoryRouter initialEntries={[{ pathname: '/login', state: from === undefined ? undefined : { from } }]}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="*" element={<Destino />} />
      </Routes>
    </MemoryRouter>,
  );
}

const botaoEntrar = () => screen.getByRole('button', { name: /^Entrar/ });

async function entrar(usuario = 'ana', senha = 'senha-fictícia') {
  fireEvent.change(screen.getByLabelText('Usuário'), { target: { value: usuario } });
  fireEvent.change(screen.getByLabelText('Senha'), { target: { value: senha } });
  fireEvent.click(botaoEntrar());
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.login.mockResolvedValue(sessao);
});

describe('LoginPage: destino após autenticar', () => {
  it('volta ao pedido do link, com o parâmetro solicitacaoId', async () => {
    renderLogin({ pathname: '/admin/aprovacoes', search: '?solicitacaoId=11111111-1111-4111-8111-111111111111', hash: '' });
    await entrar();
    expect(await screen.findByTestId('destino')).toHaveTextContent('/admin/aprovacoes?solicitacaoId=11111111-1111-4111-8111-111111111111');
  });

  it.each([
    ['URL de outra origem', { pathname: 'https://exemplo.invalid/admin/x', search: '', hash: '' }],
    ['caminho relativo ao protocolo', { pathname: '//exemplo.invalid/admin/x', search: '', hash: '' }],
    ['rota fora da área interna', { pathname: '/login', search: '', hash: '' }],
    ['raiz', { pathname: '/', search: '', hash: '' }],
    ['pathname com consulta embutida', { pathname: '/admin/lista?x=1', search: '', hash: '' }],
    ['pathname que não é texto', { pathname: { toString: () => '/admin/lista' }, search: '', hash: '' }],
    ['estado malformado', 'https://exemplo.invalid/'],
  ])('ignora destino inválido (%s) e abre a home do perfil', async (_nome, from) => {
    renderLogin(from);
    await entrar();
    expect(await screen.findByTestId('destino')).toHaveTextContent(/^\/admin\/alinare$/);
  });

  it('descarta search e hash que não começam com ? e #', async () => {
    renderLogin({ pathname: '/admin/meus-pedidos', search: 'javascript:alert(1)', hash: 'x' });
    await entrar();
    expect(await screen.findByTestId('destino')).toHaveTextContent(/^\/admin\/meus-pedidos$/);
  });

  it('credenciais recusadas: mostra o erro, não navega e libera o botão', async () => {
    mocks.login.mockRejectedValue(new Error('Usuário ou senha inválidos.'));
    renderLogin({ pathname: '/admin/aprovacoes', search: '?solicitacaoId=abc', hash: '' });
    await entrar();
    // A tela atual comunica o erro por toast (não há mensagem fixa no formulário)
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Usuário ou senha inválidos.'));
    expect(screen.queryByTestId('destino')).not.toBeInTheDocument();
    await waitFor(() => expect(botaoEntrar()).toBeEnabled());
  });

  it('não envia com usuário em branco', async () => {
    // Só espaços passa pelo "required" do campo; a própria tela recusa antes de chamar o login
    renderLogin();
    await entrar('   ', 'senha-fictícia');
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Informe seu usuário e sua senha.'));
    expect(mocks.login).not.toHaveBeenCalled();
  });
});
