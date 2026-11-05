import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

const { api, auth } = vi.hoisted(() => ({
  api: {
    getFilaAprovacao: vi.fn(),
    getSolicitacoes: vi.fn(),
    getHistorico: vi.fn(),
    getHistoricoAprovacao: vi.fn(),
    getSolicitacaoById: vi.fn(),
    decidirAprovacao: vi.fn(),
    urlEtiqueta: vi.fn(),
  },
  auth: { user: null as null | Record<string, unknown> },
}));

vi.mock('../context/AuthContext', () => ({ useAuth: () => auth }));
vi.mock('../services/apiService', () => ({
  default: api,
  SolicitacaoAlteradaError: class SolicitacaoAlteradaError extends Error {},
  HistoricoSolicitacaoError: class HistoricoSolicitacaoError extends Error {
    solicitacao: unknown;
    constructor(solicitacao: unknown, message: string) { super(message); this.solicitacao = solicitacao; }
  },
}));

import ApprovalQueuePage from '../pages/ApprovalQueuePage';
import type { Empresa, SolicitacaoAprovacao } from '../types';

const USER = {
  id: 'user-1',
  nome: 'Paula Mendes',
  usuario: 'paula',
  telas: ['aprovar-reversa'],
  empresasAcesso: ['Alinare', 'Novitah'] as Empresa[],
};

function record(id: string, empresa: Empresa = 'Alinare', extra: Partial<SolicitacaoAprovacao> = {}): SolicitacaoAprovacao {
  return {
    id,
    created_at: '2026-10-21T12:42:00.000Z',
    empresa,
    data_solicitacao: '2026-10-21',
    solicitante: 'Paula Mendes',
    solicitado_por_nome: 'Paula Mendes',
    setor: 'Comercial',
    codigo_cliente: 10842,
    nome_cliente: `Cliente ${id.slice(0, 4)}`,
    endereco_postagem: 'Rua das Flores, 120 · São Paulo, SP · CEP 01000-000',
    motivo: 'Mercadoria errada',
    autorizacao: null,
    status: 'aguardando_aprovacao',
    aprovacao_status: 'aguardando_aprovacao',
    aprovacao_versao: 1,
    proprio_pedido: false,
    pode_aprovar: true,
    tempo_preenchimento_segundos: 48,
    ...extra,
  };
}

const first = record('11111111-1111-4111-8111-111111111111', 'Alinare', {
  endereco_destino_troca: 'Av. Brasil, 50 · Campinas, SP',
  motivo: 'Outros',
  justificativa_outros: 'As embalagens foram trocadas entre as clientes.',
});
const second = record('22222222-2222-4222-8222-222222222222', 'Novitah', {
  nome_cliente: 'Camila Santos',
  setor: 'Financeiro',
});

function renderPage(path = '/') {
  return render(<MemoryRouter initialEntries={[path]}><ApprovalQueuePage /></MemoryRouter>);
}

function toggleFor(ticket = 'RV-11111111') {
  return screen.getByRole('button', { name: new RegExp(ticket) });
}

async function expandFirst(user = userEvent.setup()) {
  await screen.findByText('RV-11111111');
  const row = toggleFor();
  await user.click(row);
  return { user, row };
}

let queue: SolicitacaoAprovacao[];

beforeEach(() => {
  vi.clearAllMocks();
  auth.user = USER;
  queue = [first, second];
  api.getFilaAprovacao.mockImplementation(async () => queue);
  api.getSolicitacoes.mockImplementation(async () => queue);
  api.getHistorico.mockResolvedValue([]);
  api.getHistoricoAprovacao.mockResolvedValue([]);
  api.getSolicitacaoById.mockResolvedValue(null);
  api.decidirAprovacao.mockImplementation(async (pedido: SolicitacaoAprovacao, decisao: 'approve' | 'reject') => ({
    ...pedido,
    status: decisao === 'approve' ? 'pendente' : 'reprovado',
    aprovacao_status: decisao === 'approve' ? 'aprovada' : 'rejeitada',
  }));
});

describe('ApprovalQueuePage', () => {
  it('abre o pedido do link das comunicações (?solicitacaoId=) já expandido', async () => {
    renderPage('/admin/aprovacoes?solicitacaoId=22222222-2222-4222-8222-222222222222');
    await screen.findByText('RV-22222222');
    await waitFor(() => expect(toggleFor('RV-22222222')).toHaveAttribute('aria-expanded', 'true'));
    expect(toggleFor('RV-11111111')).toHaveAttribute('aria-expanded', 'false');
    expect(await screen.findByText('Endereço solicitado completo')).toBeInTheDocument();
  });

  it('avisa que a tarefa perdeu pertinência quando o pedido do link já não aguarda a decisão', async () => {
    renderPage('/admin/aprovacoes?solicitacaoId=99999999-9999-4999-8999-999999999999');
    await screen.findByText('RV-11111111');
    expect(await screen.findByText(/RV-99999999 não está mais aguardando a sua decisão/)).toBeInTheDocument();
    expect(toggleFor('RV-11111111')).toHaveAttribute('aria-expanded', 'false');
    expect(api.decidirAprovacao).not.toHaveBeenCalled();
  });

  it('renderiza linhas compactas e expande os dados com teclado', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('RV-11111111');
    const row = toggleFor();

    expect(row).toHaveAttribute('aria-expanded', 'false');
    row.focus();
    await user.keyboard('{Enter}');

    expect(row).toHaveAttribute('aria-expanded', 'true');
    expect(await screen.findByText('Endereço solicitado completo')).toBeInTheDocument();
    expect(screen.getByText('10842')).toBeInTheDocument();
    expect(screen.getByText('Rua das Flores, 120 · São Paulo, SP · CEP 01000-000')).toBeInTheDocument();
    expect(screen.getByText('As embalagens foram trocadas entre as clientes.')).toBeInTheDocument();
    expect(screen.getByText('Av. Brasil, 50 · Campinas, SP')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Documentos de apoio' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Etiqueta' })).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('combina histórico operacional e de aprovação no detalhe expandido', async () => {
    api.getHistorico.mockResolvedValue([{
      id: 'history-1', solicitacao_id: first.id, acao: 'Pedido registrado', user_nome: 'Paula Mendes', created_at: '2026-10-21T12:42:00.000Z',
    }]);
    api.getHistoricoAprovacao.mockResolvedValue([{
      id: 'approval-1', solicitacao_id: first.id, versao: 1, evento: 'alterada', justificativa: null,
      situacao_anterior: null, user_nome: 'Rita Alves', created_at: '2026-10-21T13:10:00.000Z',
    }]);
    renderPage();
    await expandFirst();

    expect(await screen.findByText('Pedido registrado')).toBeInTheDocument();
    expect(screen.getByText('Solicitação alterada para nova análise')).toBeInTheDocument();
    expect(screen.getByText('Responsável: Rita Alves')).toBeInTheDocument();
  });

  it('limita a fila às empresas permitidas e filtra por empresa, setor e cliente', async () => {
    const user = userEvent.setup();
    auth.user = { ...USER, empresasAcesso: ['Alinare'] };
    const { unmount } = renderPage();
    await screen.findByText('RV-11111111');

    expect(screen.queryByText('Camila Santos')).not.toBeInTheDocument();
    expect(within(screen.getByRole('combobox', { name: 'Filtrar por empresa' })).getAllByRole('option')).toHaveLength(1);
    expect(api.getFilaAprovacao).toHaveBeenCalled();

    unmount();
    auth.user = USER;
    renderPage();
    await screen.findByText('Camila Santos');
    await user.selectOptions(screen.getByRole('combobox', { name: 'Filtrar por empresa' }), 'Alinare');
    expect(screen.queryByText('Camila Santos')).not.toBeInTheDocument();
    await user.selectOptions(screen.getByRole('combobox', { name: 'Filtrar por empresa' }), 'Ambas');
    await user.selectOptions(screen.getByRole('combobox', { name: 'Filtrar por setor' }), 'Financeiro');
    expect(screen.getByText('Camila Santos')).toBeInTheDocument();
    expect(screen.queryByText('RV-11111111')).not.toBeInTheDocument();
    await user.type(screen.getByRole('searchbox', { name: 'Buscar por identificação ou cliente' }), 'Camila');
    expect(screen.getByText('Camila Santos')).toBeInTheDocument();
  });

  it('registra aprovação pela operação segura e remove a linha após confirmação', async () => {
    const user = userEvent.setup();
    renderPage();
    await expandFirst(user);

    await user.click(screen.getByRole('button', { name: 'Aprovar' }));

    await waitFor(() => expect(api.decidirAprovacao).toHaveBeenCalledWith(
      expect.objectContaining({ id: first.id, aprovacao_versao: 1 }),
      'approve',
      USER,
      '',
      expect.objectContaining({ expectedStatus: 'aguardando_aprovacao' }),
    ));
    await waitFor(() => expect(screen.queryByText('RV-11111111')).not.toBeInTheDocument());
  });

  it('exige justificativa para rejeitar dentro da própria linha', async () => {
    const user = userEvent.setup();
    renderPage();
    await expandFirst(user);
    await user.click(screen.getByRole('button', { name: 'Rejeitar' }));
    const submit = screen.getByRole('button', { name: 'Confirmar rejeição' });
    expect(submit).toBeDisabled();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    const reason = 'Endereço incompleto; confirmar com a cliente antes da coleta.';
    await user.type(screen.getByLabelText('Justificativa obrigatória para rejeitar'), reason);
    expect(submit).toBeEnabled();
    await user.click(submit);

    await waitFor(() => expect(api.decidirAprovacao).toHaveBeenCalledWith(
      expect.objectContaining({ id: first.id }), 'reject', USER, reason,
      expect.objectContaining({ historyAction: `Rejeitou reversa: ${reason}` }),
    ));
    await waitFor(() => expect(screen.queryByText('RV-11111111')).not.toBeInTheDocument());
  });

  it('preserva o pedido e a justificativa em falha, permitindo tentar novamente', async () => {
    const user = userEvent.setup();
    api.decidirAprovacao.mockRejectedValueOnce(new Error('Falha de conexão'));
    renderPage();
    await expandFirst(user);
    await user.click(screen.getByRole('button', { name: 'Rejeitar' }));
    const reason = 'O endereço precisa de complemento.';
    await user.type(screen.getByLabelText('Justificativa obrigatória para rejeitar'), reason);
    await user.click(screen.getByRole('button', { name: 'Confirmar rejeição' }));

    expect(await screen.findByText('Falha de conexão')).toBeInTheDocument();
    expect(toggleFor()).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByLabelText('Justificativa obrigatória para rejeitar')).toHaveValue(reason);
    expect(screen.getByRole('button', { name: 'Confirmar rejeição' })).toBeEnabled();

    await user.click(screen.getByRole('button', { name: 'Confirmar rejeição' }));
    await waitFor(() => expect(api.decidirAprovacao).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByText('RV-11111111')).not.toBeInTheDocument());
  });

  it('bloqueia a decisão após conflito e exige revisão explícita dos dados atualizados', async () => {
    const user = userEvent.setup();
    const changed = record(first.id, 'Alinare', { aprovacao_versao: 2, endereco_postagem: 'Rua atualizada, 900 · Santos, SP' });
    api.decidirAprovacao.mockRejectedValueOnce(new (await import('../services/apiService')).SolicitacaoAlteradaError());
    api.getSolicitacaoById.mockResolvedValue(changed);
    queue = [changed, second];
    renderPage();
    await screen.findByText('RV-11111111');
    const row = toggleFor();
    await user.click(row);
    await user.click(screen.getByRole('button', { name: 'Aprovar' }));

    expect(await screen.findByText(/Os dados foram atualizados/)).toBeInTheDocument();
    expect(screen.getByText('Rua atualizada, 900 · Santos, SP')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Aprovar' })).toBeDisabled();
    expect(api.decidirAprovacao).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole('button', { name: 'Revisei os dados' }));
    expect(screen.getByRole('button', { name: 'Aprovar' })).toBeEnabled();
    expect(api.decidirAprovacao).toHaveBeenCalledTimes(1);
  });

  it('informa quando outro aprovador já decidiu e atualiza a fila sem repetir a decisão', async () => {
    const user = userEvent.setup();
    const decided = record(first.id, 'Alinare', { status: 'pendente', aprovacao_status: 'aprovada', autorizacao: 'Rita Alves' });
    api.decidirAprovacao.mockRejectedValueOnce(new (await import('../services/apiService')).SolicitacaoAlteradaError());
    api.getSolicitacaoById.mockResolvedValue(decided);
    queue = [first, second];
    renderPage();
    await screen.findByText('RV-11111111');
    await user.click(toggleFor());
    queue = [second];
    await user.click(screen.getByRole('button', { name: 'Aprovar' }));

    expect(await screen.findByRole('status')).toHaveTextContent(/já foi aprovada por outro aprovador/);
    expect(screen.queryByText('RV-11111111')).not.toBeInTheDocument();
    expect(api.decidirAprovacao).toHaveBeenCalledTimes(1);
  });

  it('separa fila vazia de erro de carregamento e permite repetir a consulta', async () => {
    api.getFilaAprovacao.mockResolvedValueOnce([]);
    const { unmount } = renderPage();
    expect(await screen.findByRole('heading', { name: 'A fila está vazia' })).toBeInTheDocument();
    unmount();

    api.getFilaAprovacao.mockRejectedValueOnce(new Error('Serviço indisponível'));
    renderPage();
    expect(await screen.findByRole('heading', { name: 'Não foi possível carregar os pedidos' })).toBeInTheDocument();
    expect(screen.getByText('Serviço indisponível')).toBeInTheDocument();
    expect(screen.getByText('Se o problema continuar, avise o administrador.')).toBeInTheDocument();
  });

  it('erro sem dados não mostra "00 pedidos": contagem indisponível, e carregando mostra carregamento', async () => {
    api.getFilaAprovacao.mockReturnValueOnce(new Promise(() => {}));
    const { unmount } = renderPage();
    expect(await screen.findByText('Carregando pedidos…', { selector: '.approval-queue-count' })).toBeInTheDocument();
    expect(screen.queryByText('00')).not.toBeInTheDocument();
    unmount();

    api.getFilaAprovacao.mockRejectedValueOnce(new Error('Não foi possível carregar os pedidos. Tente novamente.'));
    renderPage();
    expect(await screen.findByText('Contagem indisponível')).toBeInTheDocument();
    expect(screen.queryByText('00')).not.toBeInTheDocument();
    expect(screen.queryByText(/pedidos? para revisar/)).not.toBeInTheDocument();
  });

  it('fila realmente vazia continua mostrando 00 e o estado vazio', async () => {
    api.getFilaAprovacao.mockResolvedValueOnce([]);
    renderPage();
    expect(await screen.findByRole('heading', { name: 'A fila está vazia' })).toBeInTheDocument();
    expect(screen.getByText('00')).toBeInTheDocument();
  });

  it('atualização que falha depois de carregar preserva os pedidos e avisa que podem estar desatualizados', async () => {
    api.getFilaAprovacao.mockResolvedValueOnce([first]);
    renderPage();
    await screen.findByText('RV-11111111');
    // a próxima consulta (atualização manual) falha
    api.getFilaAprovacao.mockRejectedValueOnce(new Error('Sem conexão com o servidor. Verifique a internet e tente novamente.'));
    fireEvent.click(screen.getByRole('button', { name: 'Atualizar fila' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/Sem conexão.*podem estar desatualizados/);
    expect(screen.getByText('RV-11111111')).toBeInTheDocument();
  });

  it('bloqueia cliques repetidos enquanto o servidor registra a decisão', async () => {
    const user = userEvent.setup();
    let resolveDecision!: (value: SolicitacaoAprovacao) => void;
    api.decidirAprovacao.mockImplementationOnce(() => new Promise((resolve) => { resolveDecision = resolve; }));
    renderPage();
    await expandFirst(user);
    const approve = screen.getByRole('button', { name: 'Aprovar' });

    await user.click(approve);
    expect(approve).toBeDisabled();
    await user.click(approve);
    expect(api.decidirAprovacao).toHaveBeenCalledTimes(1);
    resolveDecision({ ...first, status: 'pendente', aprovacao_status: 'aprovada' });
    await waitFor(() => expect(screen.queryByText('RV-11111111')).not.toBeInTheDocument());
  });
});
