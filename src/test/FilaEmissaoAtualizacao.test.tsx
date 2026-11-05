import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReversaEmissaoResumo, Solicitacao } from '../types';

// A fila é recarregada a cada 15 s. A atualização não pode desmontar o formulário de anexo:
// quem está com o PDF selecionado perderia o arquivo e os códigos a cada ciclo.
const mocks = vi.hoisted(() => ({
  useSolicitacoes: vi.fn(),
  montagens: { total: 0 },
  auth: { user: { id: 'u1', nome: 'Expedição', usuario: 'exp', telas: ['emitir-etiqueta'], empresasAcesso: ['Alinare'] } },
  api: {
    getEmissaoAtual: vi.fn(),
    getHistorico: vi.fn(),
    getHistoricoAprovacao: vi.fn(),
    getHistoricoEmissao: vi.fn(),
    getSolicitacaoById: vi.fn(),
  },
}));

vi.mock('../context/AuthContext', () => ({ useAuth: () => mocks.auth }));
vi.mock('../hooks/useSolicitacoes', () => ({ useSolicitacoes: mocks.useSolicitacoes }));
vi.mock('../services/apiService', () => ({ default: mocks.api }));
vi.mock('../components/admin/EtiquetaReversa', async () => {
  const { useEffect, useState } = await import('react');
  function AnexoSimulado() {
    const [arquivo, setArquivo] = useState('');
    useEffect(() => { mocks.montagens.total += 1; }, []);
    return (
      <section aria-label="Anexo simulado">
        <input aria-label="Arquivo" value={arquivo} onChange={(e) => setArquivo(e.target.value)} />
      </section>
    );
  }
  return { default: AnexoSimulado };
});

import FilaOperacionalPage from '../pages/FilaOperacionalPage';

const pedido = {
  id: '11111111-1111-4111-8111-111111111111', created_at: '2026-10-20T12:00:00.000Z', empresa: 'Alinare',
  data_solicitacao: '2026-10-20', solicitante: 'Camila', solicitado_por_nome: 'Camila', setor: 'Comercial',
  codigo_cliente: 1, nome_cliente: 'Aurora', endereco_postagem: 'Rua A, 1', motivo: 'Peça com defeito',
  autorizacao: null, status: 'pendente', aprovacao_status: 'aprovada', aprovacao_legada: false,
  tempo_preenchimento_segundos: 10,
} as unknown as Solicitacao;

const retorno = (dados: Solicitacao[], ultimoFetch: number) => ({ dados, loading: false, refreshing: false, error: null, ultimoFetch, refetch: vi.fn() });
const vazia = null as ReversaEmissaoResumo | null;

describe('Fila de emissão: atualização periódica', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.montagens.total = 0;
    mocks.api.getHistorico.mockResolvedValue([]);
    mocks.api.getHistoricoAprovacao.mockResolvedValue([]);
    mocks.api.getHistoricoEmissao.mockResolvedValue([]);
    mocks.api.getSolicitacaoById.mockResolvedValue(null);
  });

  it('mantém o formulário de anexo montado enquanto a consulta da emissão é refeita', async () => {
    mocks.api.getEmissaoAtual.mockResolvedValueOnce(vazia);
    mocks.useSolicitacoes.mockReturnValue(retorno([pedido], 1));
    const { rerender } = render(<MemoryRouter><FilaOperacionalPage etapa="etiqueta" /></MemoryRouter>);
    fireEvent.click(screen.getByRole('button', { name: /RV-11111111/ }));
    const campo = await screen.findByLabelText('Arquivo');
    fireEvent.change(campo, { target: { value: 'etiqueta.pdf' } });

    // próxima atualização da fila: lista nova, consulta da emissão ainda em andamento
    let concluir: (valor: ReversaEmissaoResumo | null) => void = () => {};
    mocks.api.getEmissaoAtual.mockReturnValueOnce(new Promise((resolve) => { concluir = resolve; }));
    mocks.useSolicitacoes.mockReturnValue(retorno([{ ...pedido }], 2));
    rerender(<MemoryRouter><FilaOperacionalPage etapa="etiqueta" /></MemoryRouter>);
    await waitFor(() => expect(mocks.api.getEmissaoAtual).toHaveBeenCalledTimes(2));

    expect(screen.getByLabelText('Arquivo')).toHaveValue('etiqueta.pdf');
    concluir(null);
    await waitFor(() => expect(screen.getByLabelText('Arquivo')).toHaveValue('etiqueta.pdf'));
    expect(mocks.montagens.total).toBe(1);
  });
});
