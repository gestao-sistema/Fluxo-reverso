import { describe, expect, it, vi } from 'vitest';
import { configure, render, screen } from '@testing-library/react';
import { Outlet } from 'react-router-dom';

// Árvore de rotas real (App.tsx): a pessoa convidada ainda não tem sessão nem senha.
vi.mock('../context/AuthContext', () => ({
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
  useAuth: () => ({ user: null, isLoading: false, isDemo: false, login: vi.fn(), iniciarDemonstracao: vi.fn() }),
}));
vi.mock('../context/TemaContext', () => ({
  TemaProvider: ({ children }: { children: React.ReactNode }) => children,
  useEmpresaDaTela: () => {},
}));
vi.mock('../components/ui/FundoJoalheria', () => ({ default: () => null }));
vi.mock('../components/ui/BotaoEfeitosFundo', () => ({ default: () => null }));
vi.mock('../components/ui/BotaoModoCor', () => ({ default: () => null }));
vi.mock('../components/admin/AdminLayout', () => ({ default: () => <Outlet /> }));
vi.mock('react-hot-toast', () => ({ Toaster: () => null, default: { success: vi.fn(), error: vi.fn() } }));
vi.mock('../services/authService', () => ({
  default: { validarConvite: vi.fn(), definirSenhaDoConvite: vi.fn() },
  MSG_CONVITE_INVALIDO: 'invalido',
  SENHA_MINIMA_CONVITE: 8,
}));

import App from '../App';

configure({ asyncUtilTimeout: 8000 });

describe('rota /definir-senha', () => {
  it('é pública: sem sessão abre a definição de senha em vez de redirecionar ao login', async () => {
    window.history.pushState({}, '', '/definir-senha?token_hash=a1b2c3d4e5f6a7b8c9d0e1f2&type=invite');
    render(<App />);
    expect(await screen.findByLabelText(/nova senha/i)).toBeInTheDocument();
    expect(window.location.pathname).toBe('/definir-senha');
    expect(window.location.search).toBe('');
  });

  it('as demais rotas continuam protegidas', async () => {
    window.history.pushState({}, '', '/admin/usuarios');
    render(<App />);
    expect(await screen.findByLabelText(/usuário/i)).toBeInTheDocument();
    expect(window.location.pathname).toBe('/login');
  });
});
