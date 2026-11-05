import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { Solicitacao, UsuarioAutenticado } from '../types';

// Recebimento físico no Kanban: em trânsito conclui o pedido; concluído pela entrega dos Correios
// (e ainda sem confirmação física) só registra a confirmação. O servidor é a autoridade — aqui
// se verifica o que a tela oferece e o que ela chama.
const mocks = vi.hoisted(() => ({
  useAuth: vi.fn(),
  api: {
    getSolicitacoes: vi.fn(),
    atualizarRastreioLote: vi.fn(),
    listarRecebimentosFisicosPendentes: vi.fn(),
    confirmarRecebimentoMercadoria: vi.fn(),
    updateSolicitacao: vi.fn(),
    urlEtiqueta: vi.fn(),
  },
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock('../context/AuthContext', () => ({ useAuth: mocks.useAuth }));
vi.mock('../services/apiService', () => ({ default: mocks.api }));
vi.mock('react-hot-toast', () => ({ default: mocks.toast }));
vi.mock('../components/ui/PageHeading', () => ({ default: () => null }));
vi.mock('../components/admin/RecordDetailModal', () => ({ default: () => null }));

import KanbanPage from '../pages/KanbanPage';

const base = {
  created_at: '2026-10-01T09:00:00.000Z',
  data_solicitacao: '2026-10-01',
  solicitante: 'Paula',
  setor: 'Comercial',
  codigo_cliente: 1,
  endereco_postagem: 'Rua A, 1',
  motivo: 'Peça com defeito',
  autorizacao: null,
  tempo_preenchimento_segundos: 30,
} as const;

const emTransito = { ...base, id: 'p-transito', empresa: 'Alinare', nome_cliente: 'Cliente em trânsito', status: 'em_transito' } as Solicitacao;
const entregue = { ...base, id: 'p-entregue', empresa: 'Alinare', nome_cliente: 'Cliente entregue', status: 'concluido', concluido_em: '2026-10-10T12:00:00.000Z' } as Solicitacao;
const jaConfirmado = { ...base, id: 'p-confirmado', empresa: 'Alinare', nome_cliente: 'Cliente já confirmado', status: 'concluido', concluido_em: '2026-10-09T12:00:00.000Z' } as Solicitacao;
const outraEmpresa = { ...base, id: 'p-novitah', empresa: 'Novitah', nome_cliente: 'Cliente Novitah', status: 'concluido', concluido_em: '2026-10-08T12:00:00.000Z' } as Solicitacao;

const confirmador = { id: 'u1', nome: 'Confirmadora', usuario: 'conf', telas: ['confirmar-checkin', 'lista-alinare'], empresasAcesso: ['Alinare'] } as UsuarioAutenticado;
const leitor = { id: 'u2', nome: 'Leitor', usuario: 'leitor', telas: ['lista-alinare'], empresasAcesso: ['Alinare'] } as UsuarioAutenticado;

const cartao = (nome: string) => screen.getByText(nome).closest('.kanban-ticket') as HTMLElement;
const renderKanban = () => render(<MemoryRouter><KanbanPage /></MemoryRouter>);

beforeEach(() => {
  vi.clearAllMocks();
  mocks.useAuth.mockReturnValue({ user: confirmador });
  mocks.api.getSolicitacoes.mockResolvedValue([emTransito, entregue, jaConfirmado, outraEmpresa]);
  mocks.api.atualizarRastreioLote.mockResolvedValue(undefined);
  // o servidor já filtrou por permissão e por confirmação existente
  mocks.api.listarRecebimentosFisicosPendentes.mockResolvedValue(['p-entregue']);
});

describe('Kanban: confirmação física do recebimento', () => {
  it('oferece a confirmação em trânsito e nos concluídos pelos Correios ainda sem confirmação, e só neles', async () => {
    renderKanban();
    await screen.findByText('Cliente entregue');
    expect(within(cartao('Cliente em trânsito')).getByRole('button', { name: /Confirmar recebimento/ })).toBeInTheDocument();
    expect(within(cartao('Cliente entregue')).getByRole('button', { name: /Confirmar recebimento/ })).toBeInTheDocument();
    expect(within(cartao('Cliente entregue')).getByText(/Entrega informada pelos Correios/)).toBeInTheDocument();
    // concluído já confirmado (fora da lista do servidor) ou de empresa sem permissão: sem botão
    expect(within(cartao('Cliente já confirmado')).queryByRole('button')).not.toBeInTheDocument();
    expect(within(cartao('Cliente Novitah')).queryByRole('button')).not.toBeInTheDocument();
  });

  it('quem só consulta não vê o botão', async () => {
    mocks.useAuth.mockReturnValue({ user: leitor });
    renderKanban();
    await screen.findByText('Cliente entregue');
    expect(screen.queryByRole('button', { name: /Confirmar recebimento/ })).not.toBeInTheDocument();
  });

  it('confirma depois da entrega: chama a RPC, mantém o pedido concluído e retira a pendência', async () => {
    mocks.api.confirmarRecebimentoMercadoria.mockResolvedValue(entregue);
    renderKanban();
    await screen.findByText('Cliente entregue');
    fireEvent.click(within(cartao('Cliente entregue')).getByRole('button', { name: /Confirmar recebimento/ }));

    const dialogo = await screen.findByRole('alertdialog');
    expect(dialogo).toHaveTextContent(/Os Correios informaram a entrega/);
    expect(dialogo).toHaveTextContent(/continua Concluído/);
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Confirmar recebimento' }));

    await waitFor(() => expect(mocks.api.confirmarRecebimentoMercadoria).toHaveBeenCalledWith('p-entregue', confirmador));
    await waitFor(() => expect(mocks.toast.success).toHaveBeenCalledWith('Recebimento físico registrado. O pedido continua Concluído.'));
    // continua na coluna de concluídos, sem a pendência
    expect(within(cartao('Cliente entregue')).queryByRole('button')).not.toBeInTheDocument();
    expect(mocks.api.updateSolicitacao).not.toHaveBeenCalled();
  });

  it('em trânsito mantém o comportamento anterior', async () => {
    mocks.api.confirmarRecebimentoMercadoria.mockResolvedValue({ ...emTransito, status: 'concluido' });
    renderKanban();
    await screen.findByText('Cliente em trânsito');
    fireEvent.click(within(cartao('Cliente em trânsito')).getByRole('button', { name: /Confirmar recebimento/ }));
    const dialogo = await screen.findByRole('alertdialog');
    expect(dialogo).toHaveTextContent(/será movido para Concluído/);
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Confirmar recebimento' }));
    await waitFor(() => expect(mocks.toast.success).toHaveBeenCalledWith('Recebimento confirmado. Pedido movido para Concluído.'));
  });

  it('recusa do servidor (por exemplo, confirmação simultânea) mostra o erro e recarrega', async () => {
    mocks.api.confirmarRecebimentoMercadoria.mockRejectedValue(new Error('O recebimento físico deste pedido já foi confirmado.'));
    renderKanban();
    await screen.findByText('Cliente entregue');
    const chamadasAntes = mocks.api.getSolicitacoes.mock.calls.length;
    fireEvent.click(within(cartao('Cliente entregue')).getByRole('button', { name: /Confirmar recebimento/ }));
    fireEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Confirmar recebimento' }));
    await waitFor(() => expect(mocks.toast.error).toHaveBeenCalledWith('O recebimento físico deste pedido já foi confirmado.'));
    await waitFor(() => expect(mocks.api.getSolicitacoes.mock.calls.length).toBeGreaterThan(chamadasAntes));
  });

  it('falha ao consultar as pendências não derruba o quadro nem oferece a confirmação nos concluídos', async () => {
    mocks.api.listarRecebimentosFisicosPendentes.mockRejectedValue(new Error('função indisponível'));
    renderKanban();
    await screen.findByText('Cliente entregue');
    expect(within(cartao('Cliente entregue')).queryByRole('button')).not.toBeInTheDocument();
    expect(within(cartao('Cliente em trânsito')).getByRole('button', { name: /Confirmar recebimento/ })).toBeInTheDocument();
  });
});
