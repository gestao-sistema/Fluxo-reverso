import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { Solicitacao } from '../types';

const mocks = vi.hoisted(() => ({
  useSolicitacoes: vi.fn(),
  useAuth: vi.fn(),
}));

vi.mock('../hooks/useSolicitacoes', () => ({ useSolicitacoes: mocks.useSolicitacoes }));
vi.mock('../context/AuthContext', () => ({ useAuth: mocks.useAuth }));
vi.mock('../components/admin/DashboardFilters', () => ({ default: () => null }));
vi.mock('../components/ui/PageHeading', () => ({ default: () => null }));
vi.mock('../components/admin/RecordsList', () => ({ default: () => null }));
vi.mock('../components/admin/RecordDetailModal', async () => {
  const React = await import('react');
  return {
    default: ({ isOpen, solicitacao }: { isOpen: boolean; solicitacao: Solicitacao | null }) => isOpen && solicitacao
      ? React.createElement('div', { role: 'dialog' }, `Detalhe aberto: ${solicitacao.id}`)
      : null,
  };
});

import ListPage from '../pages/ListPage';

const registro: Solicitacao = {
  id: 'ticket-deep-link',
  created_at: '2026-10-21T09:00:00.000Z',
  empresa: 'Novitah',
  data_solicitacao: '2026-10-21',
  solicitante: 'Paula',
  setor: 'Comercial',
  codigo_cliente: 1042,
  nome_cliente: 'Cliente de retorno',
  endereco_postagem: 'Rua das Flores, 10',
  motivo: 'Mercadoria errada',
  autorizacao: 'Ludmila Amancio',
  status: 'aguardando_aprovacao',
  tempo_preenchimento_segundos: 45,
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.useAuth.mockReturnValue({ user: {
    id: 'user-1', nome: 'Tiago', usuario: 'tiago', telas: ['lista-geral'],
  } });
  mocks.useSolicitacoes.mockReturnValue({
    dados: [registro], loading: false, refreshing: false, ultimoFetch: Date.now(), error: null, refetch: vi.fn(),
  });
});

describe('ListPage: entrada vinda do dashboard', () => {
  it('aplica empresa, intervalo e status, e abre o registro solicitado', async () => {
    render(
      <MemoryRouter initialEntries={[
        '/admin/lista?empresa=Novitah&dataInicio=2026-10-15&dataFim=2026-10-21&status=aguardando_aprovacao&solicitacaoId=ticket-deep-link',
      ]}>
        <Routes><Route path="/admin/lista" element={<ListPage />} /></Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByRole('dialog')).toHaveTextContent('Detalhe aberto: ticket-deep-link');
    await waitFor(() => expect(mocks.useSolicitacoes).toHaveBeenCalled());
    const ultimaConsulta = mocks.useSolicitacoes.mock.calls.at(-1)?.[0];
    expect(ultimaConsulta.filtros).toMatchObject({
      empresa: 'Novitah',
      dataInicio: '2026-10-15',
      dataFim: '2026-10-21',
      status: ['aguardando_aprovacao', 'pendente'],
    });
  });
});
