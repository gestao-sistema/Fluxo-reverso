import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

const mocks = vi.hoisted(() => ({ getSolicitacoesLixeira: vi.fn() }));

vi.mock('../services/apiService', () => ({ default: { getSolicitacoesLixeira: mocks.getSolicitacoesLixeira } }));
vi.mock('react-hot-toast', () => ({ default: { success: vi.fn(), error: vi.fn() } }));
vi.mock('../components/ui/PageHeading', () => ({ default: () => null }));
vi.mock('../components/admin/RecordDetailModal', () => ({ default: () => null }));

import LixeiraPage from '../pages/LixeiraPage';

describe('Lixeira com a consulta indisponível', () => {
  beforeEach(() => mocks.getSolicitacoesLixeira.mockReset());

  it('mostra só o aviso: sem "0 chamados" e sem "A Lixeira está vazia"', async () => {
    mocks.getSolicitacoesLixeira.mockRejectedValueOnce(new Error('A Lixeira ainda não está disponível no banco de dados.'));
    render(<LixeiraPage />);

    expect(await screen.findByRole('alert')).toHaveTextContent('A Lixeira ainda não está disponível');
    expect(screen.getByText('Conteúdo indisponível')).toBeInTheDocument();
    expect(screen.queryByText('A Lixeira está vazia')).not.toBeInTheDocument();
    expect(screen.queryByText(/0 chamados/)).not.toBeInTheDocument();
  });

  it('com a consulta funcionando e sem registros, continua dizendo que está vazia', async () => {
    mocks.getSolicitacoesLixeira.mockResolvedValue([]);
    render(<LixeiraPage />);

    expect(await screen.findByText('A Lixeira está vazia')).toBeInTheDocument();
    expect(screen.getByText('0 chamados')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
