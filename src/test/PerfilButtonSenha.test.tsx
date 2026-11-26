import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 'u1', nome: 'Maria Souza', usuario: 'maria', telas: ['dashboard-geral'] },
    logout: vi.fn(),
    alterarSenha: vi.fn(),
    isDemo: false,
    sairDemonstracao: vi.fn(),
  }),
}));
vi.mock('react-hot-toast', () => ({ default: { error: vi.fn(), success: vi.fn() } }));

import PerfilButton from '../components/auth/PerfilButton';

describe('Alterar senha na barra superior', () => {
  it('o diálogo sai da cápsula do topo e fica direto no body (a cápsula tem backdrop-filter e cortava o diálogo)', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <MemoryRouter>
        <div className="topbar-capsula"><PerfilButton /></div>
      </MemoryRouter>,
    );
    await user.click(screen.getByRole('button', { name: /Conta de Maria Souza/ }));
    await user.click(screen.getByRole('menuitem', { name: 'Alterar senha' }));

    const dialogo = screen.getByRole('dialog', { name: 'Alterar senha' });
    expect(container.contains(dialogo)).toBe(false);
    expect(dialogo.closest('.topbar-capsula')).toBeNull();
    expect(dialogo.closest('.overlay')?.parentElement).toBe(document.body);
    expect(screen.getByLabelText('Confirmar nova senha')).toBeInTheDocument();
  });

  it('Cancelar fecha o diálogo e remove o overlay do body', async () => {
    const user = userEvent.setup();
    render(<MemoryRouter><div className="topbar-capsula"><PerfilButton /></div></MemoryRouter>);
    await user.click(screen.getByRole('button', { name: /Conta de Maria Souza/ }));
    await user.click(screen.getByRole('menuitem', { name: 'Alterar senha' }));
    await user.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(document.body.querySelector('.overlay')).toBeNull();
  });
});
