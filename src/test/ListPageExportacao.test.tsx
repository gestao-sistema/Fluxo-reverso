import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { Solicitacao } from '../types';

const mocks = vi.hoisted(() => ({
  useSolicitacoes: vi.fn(),
  useAuth: vi.fn(),
  getSolicitacoes: vi.fn(),
  xlsx: {
    book_new: vi.fn(() => ({})),
    json_to_sheet: vi.fn((linhas: unknown) => ({ linhas })),
    book_append_sheet: vi.fn(),
    writeFile: vi.fn(),
  },
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock('../hooks/useSolicitacoes', () => ({ useSolicitacoes: mocks.useSolicitacoes }));
vi.mock('../context/AuthContext', () => ({ useAuth: mocks.useAuth }));
vi.mock('../context/TemaContext', () => ({ useEmpresaDaTela: () => {} }));
vi.mock('../services/apiService', () => ({ default: { getSolicitacoes: mocks.getSolicitacoes } }));
vi.mock('react-hot-toast', () => ({ default: mocks.toast }));
vi.mock('xlsx', () => ({ utils: mocks.xlsx, writeFile: mocks.xlsx.writeFile }));
vi.mock('../components/admin/DashboardFilters', () => ({ default: () => null }));
vi.mock('../components/ui/PageHeading', () => ({ default: () => null }));
vi.mock('../components/admin/RecordsList', () => ({ default: () => null }));
vi.mock('../components/admin/RecordDetailModal', () => ({ default: () => null }));

import ListPage from '../pages/ListPage';

const registro: Solicitacao = {
  id: 'ticket-1',
  created_at: '2026-10-21T09:00:00.000Z',
  empresa: 'Alinare',
  data_solicitacao: '2026-10-21',
  solicitante: '=1+1',
  setor: 'Comercial',
  codigo_cliente: 1042,
  nome_cliente: '@SOMA(A1:A9)',
  endereco_postagem: '+55 11 99999-9999',
  motivo: 'Peça com defeito',
  autorizacao: null,
  status: 'pendente',
  anotacoes: '-cmd|calc',
  tempo_preenchimento_segundos: 45,
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.useAuth.mockReturnValue({ user: { id: 'u', nome: 'Gestor', usuario: 'g', telas: ['lista-geral'] } });
  mocks.useSolicitacoes.mockReturnValue({
    dados: [registro], loading: false, refreshing: false, ultimoFetch: Date.now(), error: null, refetch: vi.fn(),
  });
  mocks.getSolicitacoes.mockResolvedValue([registro]);
});

describe('ListPage: exportação XLSX', () => {
  it('neutraliza texto digitado que uma planilha leria como fórmula', async () => {
    render(
      <MemoryRouter initialEntries={['/admin/lista?empresa=Alinare']}>
        <Routes><Route path="/admin/lista" element={<ListPage />} /></Routes>
      </MemoryRouter>,
    );
    fireEvent.click(await screen.findByRole('button', { name: /Exportar XLSX/ }));
    await waitFor(() => expect(mocks.xlsx.writeFile).toHaveBeenCalled());

    const linhas = mocks.xlsx.json_to_sheet.mock.calls[0][0] as Array<Record<string, unknown>>;
    expect(linhas).toHaveLength(1);
    expect(linhas[0]['Solicitante']).toBe("'=1+1");
    expect(linhas[0]['Nome Cliente']).toBe("'@SOMA(A1:A9)");
    expect(linhas[0]['Anotações']).toBe("'-cmd|calc");
    expect(linhas[0]['Motivo']).toBe('Peça com defeito');
    expect(linhas[0]['Código Cliente']).toBe(1042);
    for (const valor of Object.values(linhas[0])) {
      if (typeof valor === 'string') expect(valor).not.toMatch(/^[=+\-@\t\r]/);
    }
  });
});
