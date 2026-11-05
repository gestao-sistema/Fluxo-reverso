import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { Solicitacao } from '../types';

const mocks = vi.hoisted(() => ({
  api: {
    getMeusSolicitacoes: vi.fn(),
    getHistorico: vi.fn(),
    getHistoricoAprovacao: vi.fn(),
    getHistoricoEmissao: vi.fn(),
    getEmissaoAtual: vi.fn(),
    urlEtiqueta: vi.fn(),
    atualizarRastreio: vi.fn(),
    updateSolicitacao: vi.fn(),
    registrarEtiqueta: vi.fn(),
    deleteSolicitacao: vi.fn(),
  },
  user: { id: 'user-a', nome: 'Ana Solicitante', usuario: 'ana', telas: ['formulario-alinare'] },
}));

vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ user: mocks.user }) }));
vi.mock('../services/apiService', () => ({ default: mocks.api }));

import MeusPedidosPage from '../pages/MeusPedidosPage';

function pedido(id: string, extras: Partial<Solicitacao> = {}): Solicitacao {
  return {
    id,
    created_at: '2026-10-20T09:00:00.000Z',
    empresa: 'Alinare',
    data_solicitacao: '2026-10-20',
    solicitante: 'Ana Solicitante',
    solicitado_por: 'user-a',
    solicitado_por_nome: 'Ana Solicitante',
    setor: 'Financeiro',
    codigo_cliente: 1001,
    nome_cliente: `Cliente ${id.slice(0, 8)}`,
    endereco_postagem: 'Rua das Flores, 120',
    motivo: 'Peça com defeito',
    justificativa_outros: null,
    autorizacao: null,
    status: 'pendente',
    tempo_preenchimento_segundos: 30,
    ...extras,
  };
}

const emAndamento = pedido('11111111-1111-4111-8111-111111111111', { aprovacao_status: 'aprovada' });
const rejeitado = pedido('22222222-2222-4222-8222-222222222222', {
  aprovacao_status: 'rejeitada',
  aprovacao_justificativa: 'Confira o endereço informado.',
});
const concluido = pedido('33333333-3333-4333-8333-333333333333', {
  status: 'concluido',
  aprovacao_status: 'aprovada',
});

function renderPage(path = '/admin/meus-pedidos') {
  return render(<MemoryRouter initialEntries={[path]}><MeusPedidosPage /></MemoryRouter>);
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.api.getMeusSolicitacoes.mockResolvedValue([emAndamento, rejeitado, concluido]);
  mocks.api.getHistorico.mockResolvedValue([]);
  mocks.api.getHistoricoAprovacao.mockResolvedValue([]);
  mocks.api.getHistoricoEmissao.mockResolvedValue([]);
  mocks.api.getEmissaoAtual.mockResolvedValue(null);
});

describe('MeusPedidosPage', () => {
  it('lista solicitações em andamento, rejeitadas e concluídas com uma situação e o próximo passo', async () => {
    renderPage();

    expect(await screen.findByText('Cliente 11111111')).toBeInTheDocument();
    expect(screen.getByText('Cliente 22222222')).toBeInTheDocument();
    expect(screen.getByText('Cliente 33333333')).toBeInTheDocument();
    expect(screen.getAllByText('Aguardando etiqueta')).toHaveLength(1);
    expect(screen.getAllByText('A expedição vai anexar a etiqueta.')).toHaveLength(1);
    expect(screen.getByText('Rejeitado', { selector: 'span.rounded-full' })).toBeInTheDocument();
    expect(screen.getByText('Concluído', { selector: 'span.rounded-full' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Rejeitados' }));
    expect(screen.getByText('Cliente 22222222')).toBeInTheDocument();
    expect(screen.queryByText('Cliente 11111111')).not.toBeInTheDocument();
    expect(screen.queryByText('Cliente 33333333')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Concluídos' }));
    expect(screen.getByText('Cliente 33333333')).toBeInTheDocument();
    expect(screen.queryByText('Cliente 22222222')).not.toBeInTheDocument();
  });

  it('abre o pedido solicitado por link estável em Meus Pedidos', async () => {
    renderPage(`/admin/meus-pedidos?solicitacaoId=${emAndamento.id}`);

    const cliente = await screen.findByText('Cliente 11111111');
    const artigo = cliente.closest('article');
    expect(artigo).not.toBeNull();
    await waitFor(() => expect(artigo!.querySelector('details')?.open).toBe(true));
    await waitFor(() => expect(mocks.api.getEmissaoAtual).toHaveBeenCalledWith(emAndamento.id));
  });

  it('carrega detalhes somente ao expandir e não dispara operações logísticas ou leitura de PDF', async () => {
    mocks.api.getHistoricoAprovacao.mockResolvedValue([{
      id: 'approval-1', solicitacao_id: rejeitado.id, versao: 1, evento: 'rejeitada',
      justificativa: 'Confira o endereço informado.', user_nome: 'Gestora', created_at: '2026-10-21T10:00:00Z',
    }]);
    renderPage();

    const summary = await screen.findByText('Cliente 22222222');
    const article = summary.closest('article');
    expect(article).not.toBeNull();
    fireEvent.click(within(article!).getByText('Ver detalhes'));

    expect(await screen.findByText('Confira o endereço informado.')).toBeInTheDocument();
    expect(mocks.api.getHistorico).toHaveBeenCalledWith(rejeitado.id);
    expect(mocks.api.getHistoricoAprovacao).toHaveBeenCalledWith(rejeitado.id);
    expect(mocks.api.getHistoricoEmissao).toHaveBeenCalledWith(rejeitado.id);
    expect(mocks.api.getEmissaoAtual).toHaveBeenCalledWith(rejeitado.id);
    expect(mocks.api.atualizarRastreio).not.toHaveBeenCalled();
    expect(mocks.api.updateSolicitacao).not.toHaveBeenCalled();
    expect(mocks.api.registrarEtiqueta).not.toHaveBeenCalled();
    expect(mocks.api.urlEtiqueta).not.toHaveBeenCalled();
  });

  it('exibe rejeitado legado pela justificativa e permite consultar etiqueta sem permissão de emissão', async () => {
    const comEtiqueta = pedido('44444444-4444-4444-8444-444444444444', {
      status: 'reprovado',
      anotacoes: 'Solicitação sem comprovante de envio.',
      etiqueta_path: '44444444-4444-4444-8444-444444444444/etiqueta.pdf',
      etiqueta_nome: 'postagem.pdf',
      codigo_rastreio: 'AA123456789BR',
    });
    mocks.api.getMeusSolicitacoes.mockResolvedValue([comEtiqueta]);
    mocks.api.getEmissaoAtual.mockResolvedValue({
      id: 'emissao-1', solicitacao_id: comEtiqueta.id, sequencia: 1,
      codigo_autorizacao: 'AUT-445566', codigo_rastreio: 'AA123456789BR',
      pdf_path: comEtiqueta.etiqueta_path!, pdf_nome: 'postagem.pdf', postagem_confirmada_em: null,
      emitida_em: '2026-10-20', valida_ate: null, substituida_em: null,
    });
    renderPage();

    const summary = await screen.findByText('Cliente 44444444');
    const article = summary.closest('article')!;
    fireEvent.click(within(article).getByText('Ver detalhes'));
    expect(await screen.findByText('Solicitação sem comprovante de envio.')).toBeInTheDocument();
    expect(await screen.findByText('AUT-445566')).toBeInTheDocument();
    expect(screen.getByText('20/10/2026')).toBeInTheDocument();
    expect(screen.getByText('Validade não informada')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Copiar código de rastreamento' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Copiar autorização de postagem' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Abrir etiqueta' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Baixar etiqueta' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /aprovar|emitir|excluir|recebimento/i })).not.toBeInTheDocument();
    await waitFor(() => expect(mocks.api.getEmissaoAtual).toHaveBeenCalledWith(comEtiqueta.id));
  });
});

describe('MeusPedidosPage: aguardando aprovação', () => {
  it('pedido aguardando aprovação mostra a situação e o próximo passo, nunca "Aguardando etiqueta"', async () => {
    const aguardando = pedido('44444444-4444-4444-8444-444444444444', { aprovacao_status: 'aguardando_aprovacao' });
    mocks.api.getMeusSolicitacoes.mockResolvedValue([aguardando]);
    renderPage();
    expect(await screen.findByText('Aguardando aprovação', { selector: 'span.rounded-full' })).toBeInTheDocument();
    expect(screen.getByText('Aguarda a decisão do responsável.')).toBeInTheDocument();
    expect(screen.queryByText('Aguardando etiqueta')).not.toBeInTheDocument();
  });

  it('etiqueta anexada: abrir e baixar ficam no próprio cartão, sem expandir', async () => {
    const comEtiqueta = pedido('55555555-5555-4555-8555-555555555555', {
      status: 'etiqueta_gerada', aprovacao_status: 'aprovada', etiqueta_path: 'p/e.pdf', etiqueta_nome: 'e.pdf',
    });
    mocks.api.getMeusSolicitacoes.mockResolvedValue([comEtiqueta]);
    renderPage();
    expect(await screen.findByRole('button', { name: 'Abrir etiqueta' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Baixar etiqueta' })).toBeInTheDocument();
    expect(screen.getByText('Aguardando postagem', { selector: 'span.rounded-full' })).toBeInTheDocument();
  });
});
