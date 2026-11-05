import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { Solicitacao } from '../types';

const mocks = vi.hoisted(() => ({
  useSolicitacoes: vi.fn(),
  useAuth: vi.fn(),
}));

vi.mock('../hooks/useSolicitacoes', () => ({ useSolicitacoes: mocks.useSolicitacoes }));
vi.mock('../context/AuthContext', () => ({ useAuth: mocks.useAuth }));
vi.mock('../components/admin/ChartTimeline', () => ({ default: () => <div data-testid="timeline-chart" /> }));
vi.mock('../components/admin/ChartMotivo', () => ({ default: () => <div data-testid="reason-chart" /> }));
vi.mock('../components/admin/ChartEmpresa', () => ({ default: () => <div data-testid="company-chart" /> }));

import DashboardPage from '../pages/DashboardPage';

const aprovacao: Solicitacao = {
  id: '12345678-1111-4111-8111-111111111111',
  created_at: '2026-10-20T09:00:00.000Z',
  empresa: 'Alinare',
  data_solicitacao: '2026-10-20',
  solicitante: 'Paula Mendes',
  setor: 'Comercial',
  codigo_cliente: 10842,
  nome_cliente: 'Cliente com nome suficientemente longo para testar a quebra da linha sem perder informação',
  endereco_postagem: 'Rua das Flores, 120',
  motivo: 'Mercadoria errada',
  autorizacao: 'Joice Mendes',
  status: 'aguardando_aprovacao',
  tempo_preenchimento_segundos: 78,
};

const usuario = {
  id: 'user-1',
  nome: 'Tiago',
  usuario: 'tiago',
  telas: ['dashboard-geral', 'lista-geral', 'formulario-alinare'],
};

function renderDashboard(initialEntry = '/admin/dashboard') {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route path="/admin/dashboard" element={<DashboardPage />} />
        <Route path="/admin/lista" element={<div>Lista de solicitações</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

function resposta(dados: Solicitacao[], extra: Record<string, unknown> = {}) {
  return {
    dados,
    loading: false,
    refreshing: false,
    ultimoFetch: Date.now(),
    error: null,
    refetch: vi.fn(),
    ...extra,
  };
}

// O tempo de espera ("Aguardando há N dias") depende da data atual: o relógio é fixado um dia
// depois do created_at do pedido de teste, para o resultado não mudar com o passar dos dias.
// Só Date é simulado; timers e promises seguem reais para o Testing Library.
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-21T12:00:00.000Z'));
  vi.clearAllMocks();
  mocks.useAuth.mockReturnValue({ user: usuario });
  mocks.useSolicitacoes.mockReturnValue(resposta([aprovacao]));
});

afterEach(() => {
  vi.useRealTimers();
});

describe('DashboardPage', () => {
  it('mostra o fluxo real, reprovados, análise e pendências sem blocos promocionais ou NC', () => {
    renderDashboard();

    expect(screen.getByRole('heading', { name: 'Dashboard' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Fluxo da operação' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Em atenção' })).toBeInTheDocument();
    expect(screen.getByText('RV-12345678')).toBeInTheDocument();
    expect(screen.getByText(/Cliente com nome suficientemente longo/)).toBeInTheDocument();
    expect(screen.getByText('Aguardando há 1 dia')).toBeInTheDocument();
    expect(screen.getByText('Reprovados')).toBeInTheDocument();
    expect(screen.queryByText(/Operational Intelligence/i)).not.toBeInTheDocument();
    expect(screen.queryByText('Nova NC')).not.toBeInTheDocument();
  });

  it('cria links de status que mantêm empresa, período e identificador do pedido', () => {
    renderDashboard();
    fireEvent.change(screen.getByRole('combobox', { name: 'Filtrar empresa' }), { target: { value: 'Novitah' } });
    fireEvent.click(screen.getByRole('button', { name: '7 dias' }));

    const link = screen.getByRole('link', { name: /Aguardando aprovação/ });
    const url = new URL(link.getAttribute('href')!, 'https://flowdesk.local');
    expect(url.pathname).toBe('/admin/lista');
    expect(url.searchParams.get('empresa')).toBe('Novitah');
    expect(url.searchParams.get('status')).toBe('aguardando_aprovacao');
    expect(url.searchParams.get('dataInicio')).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(url.searchParams.get('dataFim')).toMatch(/^\d{4}-\d{2}-\d{2}$/);

    const ticketLink = screen.getByRole('link', { name: /RV-12345678/ });
    expect(new URL(ticketLink.getAttribute('href')!, 'https://flowdesk.local').searchParams.get('solicitacaoId')).toBe(aprovacao.id);
  });

  it('não apresenta consulta com erro como ausência de pendências', () => {
    mocks.useSolicitacoes.mockReturnValue(resposta([], { ultimoFetch: 0, error: new Error('RLS indisponível') }));
    renderDashboard();

    expect(screen.getByRole('alert')).toHaveTextContent('Não foi possível consultar os pedidos');
    expect(screen.queryByText('Nenhuma pendência nesta seleção.')).not.toBeInTheDocument();
    expect(screen.getAllByText('Não foi possível consultar os dados desta seleção.').length).toBeGreaterThan(0);
  });

  it('mostra o estado vazio apenas após uma consulta bem-sucedida', () => {
    mocks.useSolicitacoes.mockReturnValue(resposta([]));
    renderDashboard();

    expect(screen.getByText('Nenhuma pendência nesta seleção.')).toBeInTheDocument();
    expect(screen.getByText('Sem solicitações no período selecionado.')).toBeInTheDocument();
  });

  it('formata contagens grandes sem arredondar e mantém a etapa de reprovados acessível', () => {
    const muitos = Array.from({ length: 10_001 }, (_, index) => ({
      ...aprovacao,
      id: `record-${index}`,
      status: index === 0 ? 'reprovado' as const : 'postado' as const,
    }));
    mocks.useSolicitacoes.mockReturnValue(resposta(muitos));
    renderDashboard();

    expect(screen.getByText('10.000')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Reprovados/ })).toBeInTheDocument();
  });

  it('mantém números visíveis sem links quando o perfil não tem permissão de lista', () => {
    mocks.useAuth.mockReturnValue({ user: { ...usuario, telas: ['dashboard-geral'] } });
    renderDashboard();

    expect(screen.getAllByText('1').length).toBeGreaterThan(0);
    expect(screen.queryByRole('link', { name: /Aguardando aprovação/ })).not.toBeInTheDocument();
    expect(document.querySelector('.dashboard-stage.is-readonly')).toBeInTheDocument();
  });
});
