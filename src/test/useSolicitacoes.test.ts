import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { Solicitacao } from '../types';

vi.mock('../services/apiService', () => ({
  default: { getSolicitacoes: vi.fn() },
}));

import apiService from '../services/apiService';
import { useSolicitacoes } from '../hooks/useSolicitacoes';

const registro: Solicitacao = {
  id: 'ticket-1',
  created_at: '2026-10-21T09:00:00.000Z',
  empresa: 'Alinare',
  data_solicitacao: '2026-10-21',
  solicitante: 'Paula',
  setor: 'Comercial',
  codigo_cliente: 1042,
  nome_cliente: 'Cliente teste',
  endereco_postagem: 'Rua das Flores, 10',
  motivo: 'Mercadoria errada',
  autorizacao: 'Joice',
  status: 'aguardando_aprovacao',
  tempo_preenchimento_segundos: 45,
};

beforeEach(() => vi.resetAllMocks());

describe('useSolicitacoes', () => {
  it('expõe falha da primeira consulta sem convertê-la em lista vazia válida', async () => {
    vi.mocked(apiService.getSolicitacoes).mockRejectedValueOnce(new Error('falha de rede'));
    const { result } = renderHook(() => useSolicitacoes());

    await waitFor(() => expect(result.current.error?.message).toBe('falha de rede'));

    expect(result.current.dados).toEqual([]);
    expect(result.current.ultimoFetch).toBe(0);
    expect(result.current.loading).toBe(false);
  });

  it('mantém os últimos dados conhecidos e a hora do sucesso durante uma falha de atualização', async () => {
    vi.mocked(apiService.getSolicitacoes)
      .mockResolvedValueOnce([registro])
      .mockRejectedValueOnce(new Error('consulta indisponível'));
    const { result } = renderHook(() => useSolicitacoes());

    await waitFor(() => expect(result.current.dados).toEqual([registro]));
    const ultimoSucesso = result.current.ultimoFetch;

    await act(async () => { await result.current.refetch(); });
    await waitFor(() => expect(result.current.error?.message).toBe('consulta indisponível'));

    expect(result.current.dados).toEqual([registro]);
    expect(result.current.ultimoFetch).toBe(ultimoSucesso);
  });
});
