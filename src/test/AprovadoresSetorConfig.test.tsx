import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const { listar, salvar } = vi.hoisted(() => ({ listar: vi.fn(), salvar: vi.fn() }));
vi.mock('../services/apiService', () => ({ default: {
  listarConfigAprovadoresReversa: listar,
  salvarConfigAprovadoresReversa: salvar,
} }));

import AprovadoresSetorConfig from '../components/admin/AprovadoresSetorConfig';
import type { Usuario } from '../types';

const usuarios: Usuario[] = [
  { id: 'aprovador-1', nome: 'Aprovadora', usuario: 'aprovadora', telas: ['aprovar-reversa'], empresasAcesso: ['Alinare'] },
  { id: 'admin-1', nome: 'Gestor', usuario: 'gestor', telas: ['usuarios', 'lista-geral'], empresasAcesso: ['Alinare', 'Novitah'] },
];

beforeEach(() => {
  vi.clearAllMocks();
  listar.mockResolvedValue({
    setores: [{ empresa: 'Alinare', setor: 'Comercial Alinare' }, { empresa: 'Alinare', setor: 'Financeiro' }],
    configuracoes: [{ empresa: 'Alinare', usuario_id: 'aprovador-1', todos_setores: false, setores: ['Comercial Alinare'] }],
  });
  salvar.mockResolvedValue(undefined);
});

describe('configuração de aprovadores na administração de usuários', () => {
  it('permite vários usuários por combinação e não lista gestor sem capacidade como candidato', async () => {
    const user = userEvent.setup();
    render(<AprovadoresSetorConfig usuarios={usuarios} />);

    const alinare = await screen.findByRole('group', { name: 'Alinare' });
    expect(within(alinare).getByRole('checkbox', { name: 'Aprovadora — Comercial Alinare (Alinare)' })).toBeChecked();
    expect(within(alinare).queryByRole('checkbox', { name: /Gestor/ })).not.toBeInTheDocument();
    const financeiro = within(alinare).getByRole('checkbox', { name: 'Aprovadora — Financeiro (Alinare)' });
    await user.click(financeiro);
    expect(financeiro).toBeChecked();
    await user.click(within(alinare).getByRole('button', { name: 'Salvar Alinare' }));

    await vi.waitFor(() => expect(salvar).toHaveBeenCalledWith('Alinare', [
      { usuario_id: 'aprovador-1', todos_setores: false, setores: ['Comercial Alinare', 'Financeiro'] },
    ]));
  });
});
