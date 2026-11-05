import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { RastreamentoCorreios, Solicitacao, UsuarioAutenticado } from '../types';

// Detalhe do pedido em Pedidos: situação coerente com a aprovação, andamento dos Correios dentro do
// próprio pedido (sem etapa manual de check-in) e confirmação física como ação contextual.
const mocks = vi.hoisted(() => ({
  useAuth: vi.fn(),
  api: {
    getHistorico: vi.fn(),
    getHistoricoAprovacao: vi.fn(),
    getHistoricoEmissao: vi.fn(),
    getHistoricoCliente: vi.fn(),
    getSolicitacoesPorCodigoRastreio: vi.fn(),
    getRastreio: vi.fn(),
    atualizarRastreio: vi.fn(),
    listarRecebimentosFisicosPendentes: vi.fn(),
    confirmarRecebimentoMercadoria: vi.fn(),
  },
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock('../context/AuthContext', () => ({ useAuth: mocks.useAuth }));
vi.mock('../services/apiService', () => ({ default: mocks.api }));
vi.mock('react-hot-toast', () => ({ default: mocks.toast }));
vi.mock('../components/admin/EtiquetaReversa', () => ({ default: () => <div>Etiqueta simulada</div> }));

import RecordDetailModal from '../components/admin/RecordDetailModal';

const base = {
  created_at: '2026-10-01T09:00:00.000Z',
  data_solicitacao: '2026-10-01',
  solicitante: 'Paula',
  setor: 'Comercial',
  codigo_cliente: 1,
  nome_cliente: 'Cliente de teste',
  endereco_postagem: 'Rua A, 1',
  motivo: 'Peça com defeito',
  autorizacao: null,
  empresa: 'Alinare',
  tempo_preenchimento_segundos: 30,
  aprovacao_legada: false,
} as const;

const pedido = (extra: Partial<Solicitacao>): Solicitacao => ({ ...base, id: 'p1', status: 'pendente', aprovacao_status: 'aprovada', ...extra } as Solicitacao);

const confirmador = { id: 'u1', nome: 'Confirmadora', usuario: 'conf', telas: ['confirmar-checkin', 'lista-alinare'], empresasAcesso: ['Alinare'] } as UsuarioAutenticado;
const leitor = { id: 'u2', nome: 'Leitor', usuario: 'leitor', telas: ['lista-alinare'], empresasAcesso: ['Alinare'] } as UsuarioAutenticado;
const aprovador = { id: 'u3', nome: 'Aprovadora', usuario: 'apr', telas: ['aprovar-reversa', 'lista-alinare'], empresasAcesso: ['Alinare'] } as UsuarioAutenticado;
const expedicao = { id: 'u4', nome: 'Expedição', usuario: 'exp', telas: ['emitir-etiqueta', 'lista-alinare'], empresasAcesso: ['Alinare'] } as UsuarioAutenticado;

const abrir = (solicitacao: Solicitacao) => render(<MemoryRouter><RecordDetailModal isOpen solicitacao={solicitacao} onClose={vi.fn()} /></MemoryRouter>);

beforeEach(() => {
  vi.clearAllMocks();
  mocks.useAuth.mockReturnValue({ user: leitor });
  mocks.api.getHistorico.mockResolvedValue([]);
  mocks.api.getHistoricoAprovacao.mockResolvedValue([]);
  mocks.api.getHistoricoEmissao.mockResolvedValue([]);
  mocks.api.getHistoricoCliente.mockResolvedValue([]);
  mocks.api.getSolicitacoesPorCodigoRastreio.mockResolvedValue([]);
  mocks.api.getRastreio.mockResolvedValue(null);
  mocks.api.atualizarRastreio.mockResolvedValue({});
  mocks.api.listarRecebimentosFisicosPendentes.mockResolvedValue([]);
});

describe('situação do pedido no detalhe', () => {
  it('pedido aguardando aprovação mostra "Aguardando aprovação", não "Aguardando etiqueta"', async () => {
    abrir(pedido({ aprovacao_status: 'aguardando_aprovacao' }));
    expect(await screen.findByText('Aguardando aprovação', { selector: 'span.rounded-full' })).toBeInTheDocument();
    expect(screen.queryByText('Aguardando etiqueta')).not.toBeInTheDocument();
  });

  it('pedido rejeitado mostra "Rejeitado"', async () => {
    abrir(pedido({ aprovacao_status: 'rejeitada' }));
    expect(await screen.findByText('Rejeitado')).toBeInTheDocument();
  });

  it('pedido aprovado sem etiqueta mostra "Aguardando etiqueta"', async () => {
    abrir(pedido({}));
    expect(await screen.findByText('Aguardando etiqueta')).toBeInTheDocument();
  });

  it('a aprovação não é decidida aqui e não existe check-in manual para ninguém', async () => {
    mocks.useAuth.mockReturnValue({ user: { ...confirmador, telas: [...confirmador.telas, 'aprovar-reversa', 'emitir-etiqueta'] } });
    abrir(pedido({ status: 'etiqueta_gerada', codigo_rastreio: 'AA123456789BR', etiqueta_path: 'p1/a.pdf' }));
    await screen.findByText('Acompanhamento dos Correios');
    expect(screen.queryByText(/Aprovar chamado/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Confirmar postagem/)).not.toBeInTheDocument();
    expect(screen.queryByText(/check-in/i)).not.toBeInTheDocument();
  });

  it('aprovador também não decide pelo detalhe (a decisão é em Aprovações)', async () => {
    mocks.useAuth.mockReturnValue({ user: aprovador });
    abrir(pedido({ aprovacao_status: 'aguardando_aprovacao' }));
    await screen.findByText('Cliente de teste');
    expect(screen.queryByRole('button', { name: /Aprovar|Reprovar/ })).not.toBeInTheDocument();
  });
});

describe('acompanhamento dos Correios dentro do pedido', () => {
  it('sem código de rastreamento: situação honesta e nenhuma postagem inventada', async () => {
    mocks.useAuth.mockReturnValue({ user: expedicao });
    abrir(pedido({ status: 'etiqueta_gerada', etiqueta_path: 'p1/a.pdf' }));
    const andamento = await screen.findByLabelText('Andamento');
    expect(andamento).toHaveTextContent('Sem código de rastreamento. O andamento dos Correios só aparece depois que o código for informado.');
    expect(screen.queryByText(/Postado/)).not.toBeInTheDocument();
    expect(mocks.api.atualizarRastreio).not.toHaveBeenCalled();
  });

  it('com código e sem retorno da API: "Ainda sem atualização", sem apresentar falha como andamento', async () => {
    mocks.api.atualizarRastreio.mockRejectedValue(new Error('API indisponível'));
    abrir(pedido({ status: 'etiqueta_gerada', etiqueta_path: 'p1/a.pdf', codigo_rastreio: 'AA123456789BR' }));
    expect(await screen.findByText('Ainda sem atualização dos Correios.')).toBeInTheDocument();
  });

  it('mostra o último evento informado pelos Correios', async () => {
    const rastreio: RastreamentoCorreios = {
      codigo_rastreio: 'AA123456789BR', solicitacao_id: 'p1', ultimo_evento_codigo: 'RO',
      ultimo_evento_descricao: 'Objeto encaminhado', unidade_cidade: 'Campinas', unidade_uf: 'SP',
      eventos: [], ultimo_check_em: '2026-10-20T12:00:00.000Z', created_at: '2026-10-20T12:00:00.000Z',
    };
    mocks.api.getRastreio.mockResolvedValue(rastreio);
    abrir(pedido({ status: 'em_transito', etiqueta_path: 'p1/a.pdf', codigo_rastreio: 'AA123456789BR' }));
    expect(await screen.findByText('Objeto encaminhado')).toBeInTheDocument();
    expect(screen.getByText(/Campinas\/SP/)).toBeInTheDocument();
  });

  it('entrega da transportadora é "Entrega informada pelos Correios", não recebimento', async () => {
    abrir(pedido({ status: 'concluido', concluido_em: '2026-10-10T12:00:00.000Z', etiqueta_path: 'p1/a.pdf', codigo_rastreio: 'AA123456789BR' }));
    expect(await screen.findByText('Entrega informada pelos Correios')).toBeInTheDocument();
    expect(screen.queryByText(/recebimento confirmado/i)).not.toBeInTheDocument();
  });
});

describe('confirmação física do recebimento (ação contextual)', () => {
  const entregue = () => pedido({ status: 'concluido', concluido_em: '2026-10-10T12:00:00.000Z', etiqueta_path: 'p1/a.pdf', codigo_rastreio: 'AA123456789BR' });

  it('perfil autorizado vê a ação em pedido entregue ainda sem confirmação e o pedido continua Concluído', async () => {
    mocks.useAuth.mockReturnValue({ user: confirmador });
    mocks.api.listarRecebimentosFisicosPendentes.mockResolvedValue(['p1']);
    mocks.api.confirmarRecebimentoMercadoria.mockResolvedValue(entregue());
    abrir(entregue());

    expect(await screen.findByText(/Os Correios informaram a entrega/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar recebimento' }));
    const dialogo = await screen.findByRole('alertdialog');
    expect(dialogo).toHaveTextContent(/O pedido continua Concluído/);
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Confirmar recebimento' }));
    await waitFor(() => expect(mocks.api.confirmarRecebimentoMercadoria).toHaveBeenCalledWith('p1', confirmador));
    await waitFor(() => expect(mocks.toast.success).toHaveBeenCalledWith('Recebimento confirmado.'));
    expect(screen.queryByText(/Os Correios informaram a entrega/)).not.toBeInTheDocument();
  });

  it('já confirmado (fora da lista do servidor) ou sem permissão: nenhuma ação', async () => {
    mocks.useAuth.mockReturnValue({ user: confirmador });
    mocks.api.listarRecebimentosFisicosPendentes.mockResolvedValue([]);
    const { unmount } = abrir(entregue());
    await screen.findByText('Entrega informada pelos Correios');
    await waitFor(() => expect(mocks.api.listarRecebimentosFisicosPendentes).toHaveBeenCalled());
    expect(screen.queryByRole('button', { name: 'Confirmar recebimento' })).not.toBeInTheDocument();
    unmount();

    mocks.useAuth.mockReturnValue({ user: leitor });
    mocks.api.listarRecebimentosFisicosPendentes.mockClear();
    mocks.api.listarRecebimentosFisicosPendentes.mockResolvedValue(['p1']);
    abrir(entregue());
    await screen.findByText('Entrega informada pelos Correios');
    expect(screen.queryByRole('button', { name: 'Confirmar recebimento' })).not.toBeInTheDocument();
    expect(mocks.api.listarRecebimentosFisicosPendentes).not.toHaveBeenCalled();
  });

  it('em trânsito, o perfil autorizado confirma e o pedido é concluído', async () => {
    mocks.useAuth.mockReturnValue({ user: confirmador });
    mocks.api.confirmarRecebimentoMercadoria.mockResolvedValue(pedido({ status: 'concluido' }));
    abrir(pedido({ status: 'em_transito', etiqueta_path: 'p1/a.pdf', codigo_rastreio: 'AA123456789BR' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Confirmar recebimento' }));
    const dialogo = await screen.findByRole('alertdialog');
    expect(dialogo).toHaveTextContent(/O pedido será concluído/);
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Confirmar recebimento' }));
    await waitFor(() => expect(mocks.toast.success).toHaveBeenCalledWith('Recebimento confirmado. Pedido concluído.'));
  });

  it('recusa do servidor aparece como erro e nada é dado como confirmado', async () => {
    mocks.useAuth.mockReturnValue({ user: confirmador });
    mocks.api.listarRecebimentosFisicosPendentes.mockResolvedValue(['p1']);
    mocks.api.confirmarRecebimentoMercadoria.mockRejectedValue(new Error('O recebimento físico deste pedido já foi confirmado.'));
    abrir(entregue());
    fireEvent.click(await screen.findByRole('button', { name: 'Confirmar recebimento' }));
    fireEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Confirmar recebimento' }));
    await waitFor(() => expect(mocks.toast.error).toHaveBeenCalledWith('O recebimento físico deste pedido já foi confirmado.'));
    expect(mocks.toast.success).not.toHaveBeenCalled();
  });
});

describe('histórico do pedido no detalhe', () => {
  const abrirHistorico = async () => fireEvent.click(await screen.findByText('Histórico'));

  it('junta operação, decisão de aprovação e emissão, sem duplicar a decisão', async () => {
    mocks.api.getHistorico.mockResolvedValue([{ id: 'h1', solicitacao_id: 'p1', user_nome: 'Sistema (Correios)', acao: 'Rastreio: postado', created_at: '2026-10-25T10:00:00.000Z' }]);
    mocks.api.getHistoricoAprovacao.mockResolvedValue([{ id: 'a1', solicitacao_id: 'p1', versao: 1, evento: 'aprovada', user_nome: 'Marcelo Antunes', created_at: '2026-10-21T10:00:00.000Z' }]);
    mocks.api.getHistoricoEmissao.mockResolvedValue([{ id: 'e1', solicitacao_id: 'p1', user_nome: 'Bianca Rocha', tipo: 'registrada', descricao: 'Emissão #1 registrada.', created_at: '2026-10-22T10:00:00.000Z' }]);
    abrir(pedido({}));
    await abrirHistorico();
    expect(await screen.findByText(/Solicitação aprovada/)).toBeInTheDocument();
    expect(screen.getAllByText(/Solicitação aprovada/)).toHaveLength(1);
    expect(screen.getByText(/Emissão #1 registrada/)).toBeInTheDocument();
    expect(screen.getByText('(3)')).toBeInTheDocument();
  });

  it('falha de consulta mostra erro recuperável, não "sem histórico"', async () => {
    mocks.api.getHistoricoAprovacao.mockRejectedValueOnce(new Error('indisponível'));
    abrir(pedido({}));
    await abrirHistorico();
    expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível carregar o histórico.');
    expect(screen.queryByText('Nenhum movimento registrado.')).not.toBeInTheDocument();
    mocks.api.getHistoricoAprovacao.mockResolvedValueOnce([{ id: 'a1', solicitacao_id: 'p1', versao: 1, evento: 'aprovada', user_nome: 'Marcelo', created_at: '2026-10-21T10:00:00.000Z' }]);
    fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));
    expect(await screen.findByText(/Solicitação aprovada/)).toBeInTheDocument();
  });

  it('ao trocar de pedido não mostra o histórico do anterior', async () => {
    mocks.api.getHistorico.mockImplementation(async (id: string) => id === 'p1'
      ? [{ id: 'h1', solicitacao_id: 'p1', user_nome: 'A', acao: 'Evento do pedido um', created_at: '2026-10-25T10:00:00.000Z' }]
      : new Promise(() => {}));
    const { rerender } = abrir(pedido({}));
    await abrirHistorico();
    expect(await screen.findByText(/Evento do pedido um/)).toBeInTheDocument();
    rerender(<MemoryRouter><RecordDetailModal isOpen solicitacao={pedido({ id: 'p2' })} onClose={vi.fn()} /></MemoryRouter>);
    await waitFor(() => expect(screen.queryByText(/Evento do pedido um/)).not.toBeInTheDocument());
  });
});
