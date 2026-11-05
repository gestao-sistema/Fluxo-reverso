import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Solicitacao } from '../types';

const mocks = vi.hoisted(() => ({
  auth: { user: null as null | Record<string, unknown> },
  useSolicitacoes: vi.fn(),
  api: {
    getEmissaoAtual: vi.fn(),
    getSolicitacoes: vi.fn(),
    getHistoricoCliente: vi.fn(),
    getHistorico: vi.fn(),
    getHistoricoAprovacao: vi.fn(),
    getHistoricoEmissao: vi.fn(),
    getSolicitacaoById: vi.fn(),
  },
}));

vi.mock('../context/AuthContext', () => ({ useAuth: () => mocks.auth }));
vi.mock('../hooks/useSolicitacoes', () => ({ useSolicitacoes: mocks.useSolicitacoes }));
vi.mock('../services/apiService', () => ({ default: mocks.api }));
vi.mock('../components/admin/EtiquetaReversa', () => ({
  default: ({ solicitacao, onAlterada }: { solicitacao: Solicitacao; onAlterada: (item: Solicitacao, registrada?: boolean) => void }) => (
    <section aria-label="Emissão simulada">
      <button type="button" onClick={() => onAlterada({ ...solicitacao, status: 'pendente', codigo_rastreio: 'AA123456789BR' }, false)}>Salvar apenas códigos</button>
      <button type="button" onClick={() => onAlterada({ ...solicitacao, status: 'etiqueta_gerada', etiqueta_path: `${solicitacao.id}/etiqueta.pdf` }, true)}>Confirmar emissão vinculada</button>
    </section>
  ),
}));

import FilaOperacionalPage from '../pages/FilaOperacionalPage';

const user = {
  id: 'expedicao-1',
  nome: 'Expedição',
  usuario: 'expedicao',
  telas: ['emitir-etiqueta'],
  empresasAcesso: ['Alinare', 'Novitah'],
};

function pedido(id: string, data: string, extra: Partial<Solicitacao> = {}): Solicitacao {
  return {
    id,
    created_at: `${data}T12:00:00.000Z`,
    empresa: 'Alinare',
    data_solicitacao: data,
    solicitante: 'Camila Oliveira',
    solicitado_por_nome: 'Camila Oliveira',
    setor: 'Comercial Alinare',
    codigo_cliente: 7001,
    nome_cliente: `Cliente ${id.slice(0, 4)}`,
    endereco_postagem: 'Rua das Flores, 120, São Paulo/SP, CEP 01000-000',
    motivo: 'Peça com defeito',
    justificativa_outros: null,
    autorizacao: 'Paula Mendes',
    status: 'pendente',
    aprovacao_status: 'aprovada',
    aprovacao_legada: false,
    tempo_preenchimento_segundos: 10,
    ...extra,
  };
}

const maisAntigo = pedido('11111111-1111-4111-8111-111111111111', '2026-10-20', { nome_cliente: 'Aurora Boutique', codigo_cliente: 19001 });
const maisNovo = pedido('22222222-2222-4222-8222-222222222222', '2026-10-22', { nome_cliente: 'Ateliê Horizonte', codigo_cliente: 29002, endereco_destino_troca: 'Av. Brasil, 50, Campinas/SP' });
const semAprovacao = pedido('33333333-3333-4333-8333-333333333333', '2026-10-19', { aprovacao_status: 'aguardando_aprovacao' });
const emitido = pedido('44444444-4444-4444-8444-444444444444', '2026-10-18', { status: 'etiqueta_gerada' });

function renderFila(dados: Solicitacao[] = [maisNovo, semAprovacao, emitido, maisAntigo], initialEntry = '/admin/etiquetas') {
  mocks.useSolicitacoes.mockReturnValue({ dados, loading: false, refreshing: false, error: null, ultimoFetch: 1, refetch: vi.fn() });
  return render(<MemoryRouter initialEntries={[initialEntry]}><FilaOperacionalPage etapa="etiqueta" /></MemoryRouter>);
}

describe('Fila de emissão', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.user = user;
    mocks.api.getHistorico.mockResolvedValue([]);
    mocks.api.getHistoricoAprovacao.mockResolvedValue([]);
    mocks.api.getHistoricoEmissao.mockResolvedValue([]);
    mocks.api.getSolicitacoes.mockResolvedValue([]);
    mocks.api.getHistoricoCliente.mockResolvedValue([]);
    mocks.api.getEmissaoAtual.mockResolvedValue(null);
    mocks.api.getSolicitacaoById.mockResolvedValue(null);
  });

  it('lista somente pedidos aprovados aguardando emissão, do mais antigo ao mais novo', async () => {
    renderFila();
    await waitFor(() => expect(screen.queryByRole('button', { name: /RV-44444444/ })).not.toBeInTheDocument());
    const rows = screen.getAllByRole('button', { name: /RV-/ });
    expect(rows[0]).toHaveAccessibleName(/RV-11111111/);
    expect(rows[1]).toHaveAccessibleName(/RV-22222222/);
    expect(screen.queryByText('RV-33333333')).not.toBeInTheDocument();
    expect(screen.queryByText('RV-44444444')).not.toBeInTheDocument();
  });

  it('busca por código interno e expande os dados para conferência', async () => {
    renderFila();
    fireEvent.change(screen.getByRole('searchbox', { name: 'Buscar pedido, cliente ou código interno' }), { target: { value: '29002' } });
    expect(screen.getByText('RV-22222222')).toBeInTheDocument();
    expect(screen.queryByText('RV-11111111')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /RV-22222222/ }));
    expect(await screen.findByText('Rua das Flores, 120, São Paulo/SP, CEP 01000-000')).toBeInTheDocument();
    expect(screen.getByText('Av. Brasil, 50, Campinas/SP')).toBeInTheDocument();
    expect(screen.getByText('Motivo')).toBeInTheDocument();
    expect(await screen.findByText('Sem eventos.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Salvar apenas códigos' })).toBeInTheDocument();
  });

  it('mantém a linha depois de uma atualização que não confirmou PDF e remove após vínculo confirmado', async () => {
    renderFila([maisAntigo]);
    const summary = screen.getByRole('button', { name: /RV-11111111/ });
    fireEvent.click(summary);

    fireEvent.click(await screen.findByRole('button', { name: 'Salvar apenas códigos' }));
    expect(screen.getByRole('button', { name: /RV-11111111/ })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Confirmar emissão vinculada' }));
    await waitFor(() => expect(screen.queryByRole('button', { name: /RV-11111111/ })).not.toBeInTheDocument());
    expect(screen.getByText(/etiqueta anexada/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ver pedido' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Ver pedido' }));
    expect(await screen.findByLabelText('Pedido com etiqueta anexada')).toBeInTheDocument();
    expect(within(screen.getByLabelText('Pedido com etiqueta anexada')).getByText('Situação')).toBeInTheDocument();
  });

  it('expande a linha indicada na URL da notificação', async () => {
    const pedidoAvisado = pedido('66666666-6666-4666-8666-666666666666', '2026-10-18');
    renderFila([pedidoAvisado], `/admin/etiquetas?pedido=${pedidoAvisado.id}`);
    expect(await screen.findByLabelText('Emissão simulada')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /RV-66666666/ })).toHaveAttribute('aria-expanded', 'true');
    expect(mocks.api.getSolicitacaoById).not.toHaveBeenCalled();
  });

  it('informa quando o pedido saiu da fila e consulta a situação pela rota de emissão', async () => {
    const concluido = pedido('77777777-7777-4777-8777-777777777777', '2026-10-18', { status: 'concluido' });
    mocks.api.getSolicitacaoById.mockResolvedValue(concluido);
    renderFila([], `/admin/etiquetas?pedido=${concluido.id}`);
    expect(await screen.findByText(/não está mais aqui/)).toBeInTheDocument();
    expect(screen.getByText(/Situação: Concluído/)).toBeInTheDocument();
    expect(mocks.api.getSolicitacaoById).toHaveBeenCalledWith(concluido.id);
  });

  it('é uma única área: título claro e nenhuma etapa de check-in', () => {
    renderFila();
    expect(screen.getByRole('heading', { level: 1, name: 'Aguardando etiqueta' })).toBeInTheDocument();
    expect(screen.queryByText(/check-in/i)).not.toBeInTheDocument();
  });

  it('pedido aguardando aprovação não entra na fila e o vazio diz isso em uma frase', async () => {
    renderFila([semAprovacao]);
    expect(await screen.findByText('Nenhum pedido aguardando etiqueta')).toBeInTheDocument();
    expect(screen.getByText('Pedidos ainda sem aprovação não aparecem aqui.')).toBeInTheDocument();
    expect(screen.queryByText('RV-33333333')).not.toBeInTheDocument();
  });

  it('pedido rejeitado não é elegível, mesmo com situação logística pendente', async () => {
    renderFila([pedido('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '2026-10-18', { aprovacao_status: 'rejeitada' })]);
    expect(await screen.findByText('Nenhum pedido aguardando etiqueta')).toBeInTheDocument();
  });

  it('pedido aprovado do operador aparece; o de empresa sem permissão não', async () => {
    mocks.auth.user = { ...user, empresasAcesso: ['Alinare'] };
    const novitah = pedido('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '2026-10-18', { empresa: 'Novitah' });
    renderFila([maisAntigo, novitah]);
    expect(await screen.findByText('RV-11111111')).toBeInTheDocument();
    expect(screen.queryByText('RV-BBBBBBBB')).not.toBeInTheDocument();
  });

  it('mostra pedido etiqueta_gerada com emissão vigente sem PDF após consultar novamente', async () => {
    const incompleta = pedido('55555555-5555-4555-8555-555555555555', '2026-10-18', { status: 'etiqueta_gerada' });
    mocks.api.getEmissaoAtual.mockResolvedValue({
      id: 'emissao-vigente-5', solicitacao_id: incompleta.id, sequencia: 1,
      codigo_autorizacao: 'AUT-55', codigo_rastreio: null, pdf_path: null, pdf_nome: null,
      emitida_em: null, valida_ate: null, substituida_em: null,
    });
    renderFila([incompleta]);

    const summary = await screen.findByRole('button', { name: /RV-55555555/ });
    fireEvent.click(summary);
    expect(await screen.findByRole('button', { name: 'Confirmar emissão vinculada' })).toBeInTheDocument();
    expect(mocks.api.getEmissaoAtual).toHaveBeenCalledWith(incompleta.id);
  });

  it('mantém consulta falha como erro recuperável e não abre o registro', async () => {
    const incompleta = pedido('66666666-6666-4666-8666-666666666666', '2026-10-18', { status: 'etiqueta_gerada' });
    mocks.api.getEmissaoAtual.mockRejectedValueOnce(new Error('RLS indisponível')).mockResolvedValue(null);
    renderFila([incompleta]);

    fireEvent.click(await screen.findByRole('button', { name: /RV-66666666/ }));
    expect(await screen.findByText(/Não foi possível conferir a etiqueta deste pedido: RLS indisponível/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Confirmar emissão vinculada' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));
    expect(await screen.findByText('Nenhum pedido aguardando etiqueta')).toBeInTheDocument();
  });

  it('remove emissão completa da fila e nunca inclui pedido postado ou recebido', async () => {
    const completo = pedido('77777777-7777-4777-8777-777777777777', '2026-10-18', { status: 'etiqueta_gerada' });
    const postado = pedido('88888888-8888-4888-8888-888888888888', '2026-10-17', { status: 'postado' });
    const recebido = pedido('99999999-9999-4999-8999-999999999999', '2026-10-16', { status: 'concluido' });
    mocks.api.getEmissaoAtual.mockResolvedValue({
      id: 'emissao-vigente-7', solicitacao_id: completo.id, sequencia: 1,
      codigo_autorizacao: 'AUT-77', codigo_rastreio: null, pdf_path: '777/etiqueta.pdf', pdf_nome: 'etiqueta.pdf',
      emitida_em: null, valida_ate: null, substituida_em: null,
    });
    renderFila([completo, postado, recebido]);

    await waitFor(() => expect(screen.queryByRole('button', { name: /RV-77777777/ })).not.toBeInTheDocument());
    expect(screen.queryByText('RV-88888888')).not.toBeInTheDocument();
    expect(screen.queryByText('RV-99999999')).not.toBeInTheDocument();
    expect(mocks.useSolicitacoes).toHaveBeenCalledWith(expect.objectContaining({ filtros: { status: ['pendente', 'etiqueta_gerada'] } }));
  });
});
