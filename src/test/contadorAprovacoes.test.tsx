import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { BadgeCheck, BarChart3, ClipboardList } from 'lucide-react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { NavItem } from '../lib/perfil';
import type { SolicitacaoAprovacao, UsuarioAutenticado } from '../types';

const { api, auth, mocks } = vi.hoisted(() => ({
  api: {
    getFilaAprovacao: vi.fn(),
    decidirAprovacao: vi.fn(),
    getSolicitacoes: vi.fn(),
    getHistorico: vi.fn(),
    getHistoricoAprovacao: vi.fn(),
    getSolicitacaoById: vi.fn(),
    urlEtiqueta: vi.fn(),
  },
  auth: { user: null as null | UsuarioAutenticado },
  mocks: { sino: vi.fn(), pesquisaDemo: vi.fn(), perfil: vi.fn(), cor: vi.fn() },
}));

vi.mock('../context/AuthContext', () => ({ useAuth: () => auth }));
vi.mock('../services/apiService', () => ({
  default: api,
  SolicitacaoAlteradaError: class SolicitacaoAlteradaError extends Error {},
  HistoricoSolicitacaoError: class HistoricoSolicitacaoError extends Error {
    solicitacao: unknown;
    constructor(solicitacao: unknown, message: string) {
      super(message);
      this.solicitacao = solicitacao;
    }
  },
}));
// Partes do cabeçalho que não fazem parte deste teste: só confirmam que continuam montadas
vi.mock('../components/admin/NotificacoesEmissaoBell', () => ({ default: (props: unknown) => mocks.sino(props) }));
vi.mock('../demo/DemoSwitcher', () => ({ default: () => mocks.pesquisaDemo() }));
vi.mock('../components/auth/PerfilButton', () => ({ default: () => mocks.perfil() }));
vi.mock('../components/ui/BotaoModoCor', () => ({ default: () => mocks.cor() }));
vi.mock('../context/TemaContext', () => ({ useTema: () => 'conjunto', useEmpresaDaTela: () => {} }));

import AdminLayout from '../components/admin/AdminLayout';
import FlowNav from '../components/admin/FlowNav';
import ApprovalQueuePage from '../pages/ApprovalQueuePage';
import { ContadorAprovacoesProvider, useContadorAprovacoes } from '../context/ContadorAprovacoesContext';

const ID_1 = '11111111-1111-4111-8111-111111111111';
const ID_2 = '22222222-2222-4222-8222-222222222222';
const ID_3 = '33333333-3333-4333-8333-333333333333';
const ID_4 = '44444444-4444-4444-8444-444444444444';

const APROVADOR: UsuarioAutenticado = {
  id: 'aprovador-1',
  nome: 'Paula Mendes',
  usuario: 'paula',
  telas: ['aprovar-reversa'],
  empresasAcesso: ['Alinare'],
} as UsuarioAutenticado;

const OUTRO_APROVADOR: UsuarioAutenticado = { ...APROVADOR, id: 'aprovador-2', nome: 'Outra pessoa', usuario: 'outra' } as UsuarioAutenticado;

const ITENS: NavItem[] = [
  { to: '/admin/dashboard', label: 'Dashboard', icon: BarChart3 },
  { to: '/admin/aprovacoes', label: 'Aprovações', icon: BadgeCheck },
];

// Com três destinos e a largura simulada abaixo, só o primeiro cabe no dock; Aprovações fica em "Mais"
const ITENS_COM_MAIS: NavItem[] = [
  { to: '/admin/dashboard', label: 'Dashboard', icon: BarChart3 },
  { to: '/admin/lista', label: 'Lista', icon: ClipboardList },
  { to: '/admin/aprovacoes', label: 'Aprovações', icon: BadgeCheck },
];

function pedido(id: string, extra: Partial<SolicitacaoAprovacao> = {}): SolicitacaoAprovacao {
  return {
    id,
    created_at: '2026-11-09T12:00:00.000Z',
    empresa: 'Alinare',
    data_solicitacao: '2026-11-09',
    solicitante: 'Solicitante',
    solicitado_por_nome: 'Solicitante',
    setor: 'Comercial',
    codigo_cliente: 10842,
    nome_cliente: 'Cliente',
    endereco_postagem: 'Rua das Flores, 120',
    motivo: 'Mercadoria errada',
    autorizacao: null,
    status: 'aguardando_aprovacao',
    aprovacao_status: 'aguardando_aprovacao',
    aprovacao_versao: 1,
    proprio_pedido: false,
    pode_aprovar: true,
    tempo_preenchimento_segundos: 48,
    ...extra,
  } as SolicitacaoAprovacao;
}

// Estado da aba simulado: a visibilidade real do documento não muda dentro do jsdom
let visibilidade: DocumentVisibilityState = 'visible';

/** Deixa as promessas pendentes e os efeitos resolverem (com timers reais). */
async function concluirConsultas() {
  await act(async () => {
    await new Promise((resolver) => setTimeout(resolver, 0));
  });
}

function Painel({ itens = ITENS }: { itens?: NavItem[] }) {
  const { pendencias } = useContadorAprovacoes();
  return <FlowNav items={itens} pendenciasPorDestino={{ '/admin/aprovacoes': pendencias }} />;
}

// Mostra a rota atual para conferir a navegação por botão
function LocalAtual() {
  const local = useLocation();
  return <p data-testid="local">{local.pathname}</p>;
}

function arvoreDoContador(itens?: NavItem[]) {
  return (
    <MemoryRouter initialEntries={['/admin/dashboard']}>
      <ContadorAprovacoesProvider>
        <Painel itens={itens} />
      </ContadorAprovacoesProvider>
    </MemoryRouter>
  );
}

function renderNav(itens?: NavItem[]) {
  return render(arvoreDoContador(itens));
}

beforeEach(() => {
  visibilidade = 'visible';
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => visibilidade });
  vi.stubGlobal('ResizeObserver', class {
    observe() {}
    unobserve() {}
    disconnect() {}
  });
  for (const fn of Object.values(api)) fn.mockReset();
  mocks.sino.mockImplementation(() => null);
  mocks.pesquisaDemo.mockImplementation(() => null);
  mocks.perfil.mockImplementation(() => null);
  mocks.cor.mockImplementation(() => null);
  auth.user = null;
  api.getHistorico.mockResolvedValue([]);
  api.getHistoricoAprovacao.mockResolvedValue([]);
  api.getSolicitacaoById.mockResolvedValue(null);
  api.decidirAprovacao.mockImplementation(async (registroAtual: SolicitacaoAprovacao) => ({
    ...registroAtual,
    status: 'pendente',
    aprovacao_status: 'aprovada',
  }));
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  delete (document.documentElement as { clientWidth?: number }).clientWidth;
});

describe('contador de aprovações: quem vê e o que conta', () => {
  it('mostra no item Aprovações só as tarefas que a pessoa pode decidir', async () => {
    auth.user = APROVADOR;
    api.getFilaAprovacao.mockResolvedValue([
      pedido(ID_1),
      pedido(ID_2, { pode_aprovar: false }), // pedido próprio sem autoaprovação: fica na fila, não é tarefa
      pedido(ID_3, { empresa: 'Novitah' }), // empresa que a pessoa não aprova
    ]);

    renderNav();

    const link = await screen.findByRole('button', { name: 'Aprovações, 1 aguardando sua análise' });
    expect(within(link).getByText('1')).toBeInTheDocument();
    expect(api.getFilaAprovacao).toHaveBeenCalledTimes(1);
  });

  it('sem a tela aprovar-reversa não consulta a fila e não mostra nenhum número', async () => {
    auth.user = { ...APROVADOR, telas: ['formulario-alinare'] } as UsuarioAutenticado;

    renderNav();

    const link = await screen.findByRole('button', { name: 'Aprovações' });
    await concluirConsultas();
    expect(api.getFilaAprovacao).not.toHaveBeenCalled();
    expect(within(link).queryByText(/\d/)).toBeNull();
  });

  it('sem empresa liberada não consulta a fila', async () => {
    auth.user = { ...APROVADOR, empresasAcesso: [] } as UsuarioAutenticado;

    renderNav();

    await screen.findByRole('button', { name: 'Aprovações' });
    await concluirConsultas();
    expect(api.getFilaAprovacao).not.toHaveBeenCalled();
  });

  it('com zero pendências não mostra número nem alerta', async () => {
    auth.user = APROVADOR;
    api.getFilaAprovacao.mockResolvedValue([pedido(ID_2, { pode_aprovar: false })]);

    renderNav();

    await waitFor(() => expect(api.getFilaAprovacao).toHaveBeenCalledTimes(1));
    await concluirConsultas();
    const link = screen.getByRole('button', { name: 'Aprovações' });
    expect(within(link).queryByText(/\d|!/)).toBeNull();
  });

  it('uma falha da consulta aparece como alerta, nunca como zero pendências', async () => {
    auth.user = APROVADOR;
    api.getFilaAprovacao.mockRejectedValue(new Error('Falha de rede'));

    renderNav();

    const link = await screen.findByRole('button', { name: 'Aprovações, não foi possível verificar as pendências' });
    expect(within(link).getByText('!')).toBeInTheDocument();
    expect(within(link).queryByText('0')).toBeNull();
  });

  it('o item é um botão alcançável por teclado, sem href nem title, e o nome acessível traz a contagem', async () => {
    auth.user = APROVADOR;
    api.getFilaAprovacao.mockResolvedValue([pedido(ID_1), pedido(ID_2)]);

    renderNav();

    const botao = await screen.findByRole('button', { name: 'Aprovações, 2 aguardando sua análise' });
    expect(botao).not.toHaveAttribute('href');
    expect(botao).not.toHaveAttribute('title');
    botao.focus();
    expect(botao).toHaveFocus();
  });

  it('clicar no item navega pela rota e marca a página atual', async () => {
    auth.user = APROVADOR;
    api.getFilaAprovacao.mockResolvedValue([]);

    render(
      <MemoryRouter initialEntries={['/admin/dashboard']}>
        <ContadorAprovacoesProvider>
          <Painel />
          <LocalAtual />
        </ContadorAprovacoesProvider>
      </MemoryRouter>,
    );

    const user = userEvent.setup();
    const botao = await screen.findByRole('button', { name: 'Aprovações' });
    await concluirConsultas();
    await user.click(botao);

    expect(screen.getByTestId('local')).toHaveTextContent('/admin/aprovacoes');
    expect(botao).toHaveAttribute('aria-current', 'page');
  });
});

describe('contador de aprovações: quando consulta de novo', () => {
  it('atualiza a cada 60 s só enquanto a página estiver visível', async () => {
    vi.useFakeTimers();
    auth.user = APROVADOR;
    api.getFilaAprovacao.mockResolvedValue([pedido(ID_1)]);

    renderNav();
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(api.getFilaAprovacao).toHaveBeenCalledTimes(1);

    visibilidade = 'hidden';
    await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
    expect(api.getFilaAprovacao).toHaveBeenCalledTimes(1);

    visibilidade = 'visible';
    await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
    expect(api.getFilaAprovacao).toHaveBeenCalledTimes(2);
  });

  it('ao recuperar o foco consulta de novo e não repete uma consulta que ainda está em andamento', async () => {
    auth.user = APROVADOR;
    let liberarSegunda!: (valor: SolicitacaoAprovacao[]) => void;
    api.getFilaAprovacao
      .mockResolvedValueOnce([pedido(ID_1)])
      .mockReturnValueOnce(new Promise<SolicitacaoAprovacao[]>((resolver) => { liberarSegunda = resolver; }))
      .mockResolvedValue([pedido(ID_1), pedido(ID_2)]);

    renderNav();
    await concluirConsultas();
    expect(api.getFilaAprovacao).toHaveBeenCalledTimes(1);

    act(() => { window.dispatchEvent(new Event('focus')); });
    act(() => { window.dispatchEvent(new Event('focus')); });
    expect(api.getFilaAprovacao).toHaveBeenCalledTimes(2);

    await act(async () => { liberarSegunda([pedido(ID_1)]); });
    await concluirConsultas();
    act(() => { window.dispatchEvent(new Event('focus')); });
    expect(api.getFilaAprovacao).toHaveBeenCalledTimes(3);
    await screen.findByRole('button', { name: 'Aprovações, 2 aguardando sua análise' });
  });

  it('resposta atrasada da pessoa anterior não aparece depois da troca de sessão', async () => {
    auth.user = APROVADOR;
    let concluirAnterior!: (valor: SolicitacaoAprovacao[]) => void;
    api.getFilaAprovacao
      .mockReturnValueOnce(new Promise<SolicitacaoAprovacao[]>((resolver) => { concluirAnterior = resolver; }))
      .mockResolvedValue([pedido(ID_1), pedido(ID_2)]);

    const { rerender } = renderNav();
    auth.user = OUTRO_APROVADOR;
    rerender(arvoreDoContador());

    await screen.findByRole('button', { name: 'Aprovações, 2 aguardando sua análise' });
    await act(async () => {
      concluirAnterior([pedido(ID_1), pedido(ID_2), pedido(ID_3)]);
    });
    await concluirConsultas();

    expect(screen.getByRole('button', { name: 'Aprovações, 2 aguardando sua análise' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Aprovações, 3 aguardando/ })).toBeNull();
  });
});

describe('contador de aprovações: página de Aprovações e decisões', () => {
  it('a página alimenta o contador sem consulta extra e atualiza depois de aprovar', async () => {
    auth.user = APROVADOR;
    api.getFilaAprovacao.mockResolvedValue([pedido(ID_1), pedido(ID_2)]);

    render(
      <MemoryRouter initialEntries={['/admin/aprovacoes']}>
        <ContadorAprovacoesProvider>
          <Painel />
          <ApprovalQueuePage />
        </ContadorAprovacoesProvider>
      </MemoryRouter>,
    );

    await screen.findByRole('button', { name: 'Aprovações, 2 aguardando sua análise' });
    expect(api.getFilaAprovacao).toHaveBeenCalledTimes(1); // só a consulta da própria página

    act(() => { window.dispatchEvent(new Event('focus')); });
    await concluirConsultas();
    expect(api.getFilaAprovacao).toHaveBeenCalledTimes(1);

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /RV-11111111/ }));
    await user.click(screen.getByRole('button', { name: 'Aprovar' }));

    await waitFor(() => expect(api.decidirAprovacao).toHaveBeenCalledTimes(1));
    await screen.findByRole('button', { name: 'Aprovações, 1 aguardando sua análise' });
    expect(api.getFilaAprovacao).toHaveBeenCalledTimes(1); // a decisão não gera consulta extra
  });

  it('erro na consulta da própria página vira alerta no contador', async () => {
    auth.user = APROVADOR;
    api.getFilaAprovacao.mockRejectedValue(new Error('Falha ao carregar a fila'));

    render(
      <MemoryRouter initialEntries={['/admin/aprovacoes']}>
        <ContadorAprovacoesProvider>
          <Painel />
          <ApprovalQueuePage />
        </ContadorAprovacoesProvider>
      </MemoryRouter>,
    );

    await screen.findByRole('button', { name: 'Aprovações, não foi possível verificar as pendências' });
  });
});

describe('contador de aprovações: menu e layout', () => {
  it('quando o item cai dentro de "Mais", o botão mostra o indicador e o nome do item segue acessível', async () => {
    Object.defineProperty(document.documentElement, 'clientWidth', { configurable: true, value: 304 });
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      width: 100, height: 56, top: 0, left: 0, right: 100, bottom: 56, x: 0, y: 0, toJSON: () => ({}),
    } as DOMRect);
    // Só o dock é medido com estes valores; os demais elementos mantêm o estilo real do jsdom
    const estiloOriginal = window.getComputedStyle.bind(window);
    vi.spyOn(window, 'getComputedStyle').mockImplementation((elemento: Element, pseudo?: string | null) => {
      if (elemento.classList.contains('flow-nav')) {
        return {
          columnGap: '0px', gap: '0px', paddingLeft: '0px', paddingRight: '0px', borderLeftWidth: '0px', borderRightWidth: '0px',
          getPropertyValue: () => '',
        } as unknown as CSSStyleDeclaration;
      }
      return estiloOriginal(elemento, pseudo);
    });
    auth.user = APROVADOR;
    api.getFilaAprovacao.mockResolvedValue([pedido(ID_1), pedido(ID_2)]);

    renderNav(ITENS_COM_MAIS);

    const mais = await screen.findByRole('button', { name: 'Mais, com Aprovações, 2 aguardando sua análise' });
    expect(mais.querySelector('.flow-nav-badge')).not.toBeNull();
    fireEvent.click(mais);
    const linkNoMenu = await screen.findByRole('button', { name: 'Aprovações, 2 aguardando sua análise' });
    expect(within(linkNoMenu).getByText('2')).toBeInTheDocument();
  });

  it('o layout administrativo mostra a contagem e mantém o sino de emissão no cabeçalho', async () => {
    auth.user = APROVADOR;
    api.getFilaAprovacao.mockResolvedValue([pedido(ID_1), pedido(ID_2)]);

    render(
      <MemoryRouter initialEntries={['/admin/dashboard']}>
        <AdminLayout />
      </MemoryRouter>,
    );

    await screen.findByRole('button', { name: 'Aprovações, 2 aguardando sua análise' });
    expect(mocks.sino).toHaveBeenCalled();
  });
});

// Resposta controlada: a consulta fica pendente até o teste decidir quando ela chega
function adiado<T>() {
  let resolver!: (valor: T) => void;
  let recusar!: (erro: unknown) => void;
  const promessa = new Promise<T>((resolve, reject) => {
    resolver = resolve;
    recusar = reject;
  });
  return { promessa, resolver, recusar };
}

function arvorePaginaEContador() {
  return (
    <MemoryRouter initialEntries={['/admin/aprovacoes']}>
      <ContadorAprovacoesProvider>
        <Painel />
        <ApprovalQueuePage />
      </ContadorAprovacoesProvider>
    </MemoryRouter>
  );
}

describe('contador: troca de sessão, escopo e respostas antigas', () => {
  it('com a página aberta, trocar de aprovador da mesma empresa não mostra a fila anterior como sendo da nova pessoa', async () => {
    const filaDaPrimeira = [pedido(ID_1, { setor: 'Comercial Alinare' }), pedido(ID_2, { setor: 'Comercial Alinare' })];
    const respostaDaSegunda = adiado<SolicitacaoAprovacao[]>();
    api.getFilaAprovacao.mockImplementation(() => (auth.user?.id === OUTRO_APROVADOR.id
      ? respostaDaSegunda.promessa
      : Promise.resolve(filaDaPrimeira)));
    auth.user = APROVADOR;
    const { rerender } = render(arvorePaginaEContador());
    await screen.findByRole('button', { name: 'Aprovações, 2 aguardando sua análise' });

    auth.user = OUTRO_APROVADOR;
    rerender(arvorePaginaEContador());
    await concluirConsultas();

    // Enquanto a segunda pessoa não responde, a contagem da primeira não pode aparecer como dela
    expect(screen.queryByRole('button', { name: 'Aprovações, 2 aguardando sua análise' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Aprovações' })).toBeInTheDocument();

    await act(async () => {
      respostaDaSegunda.resolver([pedido(ID_3, { setor: 'Financeiro Alinare' })]);
    });
    await screen.findByRole('button', { name: 'Aprovações, 1 aguardando sua análise' });
  });

  it('sem a página aberta, trocar de aprovador não mostra a contagem da pessoa anterior enquanto a nova não responde', async () => {
    const respostaDaSegunda = adiado<SolicitacaoAprovacao[]>();
    api.getFilaAprovacao
      .mockResolvedValueOnce([pedido(ID_1), pedido(ID_2)])
      .mockReturnValueOnce(respostaDaSegunda.promessa);
    auth.user = APROVADOR;
    const { rerender } = renderNav();
    await screen.findByRole('button', { name: 'Aprovações, 2 aguardando sua análise' });

    auth.user = OUTRO_APROVADOR;
    rerender(arvoreDoContador());
    await concluirConsultas();
    expect(screen.queryByRole('button', { name: 'Aprovações, 2 aguardando sua análise' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Aprovações' })).toBeInTheDocument();

    await act(async () => {
      respostaDaSegunda.resolver([pedido(ID_3)]);
    });
    await screen.findByRole('button', { name: 'Aprovações, 1 aguardando sua análise' });
  });

  it('com a página aberta, alterar as empresas mantendo a mesma pessoa não mantém a contagem do escopo anterior', async () => {
    const fila = [pedido(ID_1, { empresa: 'Alinare' }), pedido(ID_2, { empresa: 'Novitah' })];
    const amplo = { ...APROVADOR, empresasAcesso: ['Alinare', 'Novitah'] } as UsuarioAutenticado;
    const reenvio = adiado<SolicitacaoAprovacao[]>();
    api.getFilaAprovacao
      .mockResolvedValueOnce(fila)
      .mockReturnValueOnce(reenvio.promessa)
      .mockResolvedValue(fila);
    auth.user = amplo;
    const { rerender } = render(arvorePaginaEContador());
    await screen.findByRole('button', { name: 'Aprovações, 2 aguardando sua análise' });

    auth.user = { ...amplo, empresasAcesso: ['Alinare'] } as UsuarioAutenticado;
    rerender(arvorePaginaEContador());
    await concluirConsultas();
    expect(screen.queryByRole('button', { name: /^Aprovações, 2 aguardando/ })).toBeNull();

    await act(async () => {
      reenvio.resolver(fila);
    });
    await screen.findByRole('button', { name: 'Aprovações, 1 aguardando sua análise' });
  });

  it('sem a página aberta, alterar as empresas mantendo a mesma pessoa não mantém a contagem anterior', async () => {
    const fila = [pedido(ID_1, { empresa: 'Alinare' }), pedido(ID_2, { empresa: 'Novitah' })];
    const amplo = { ...APROVADOR, empresasAcesso: ['Alinare', 'Novitah'] } as UsuarioAutenticado;
    const reenvio = adiado<SolicitacaoAprovacao[]>();
    api.getFilaAprovacao
      .mockResolvedValueOnce(fila)
      .mockReturnValueOnce(reenvio.promessa)
      .mockResolvedValue(fila);
    auth.user = amplo;
    const { rerender } = renderNav();
    await screen.findByRole('button', { name: 'Aprovações, 2 aguardando sua análise' });

    auth.user = { ...amplo, empresasAcesso: ['Alinare'] } as UsuarioAutenticado;
    rerender(arvoreDoContador());
    await concluirConsultas();
    expect(screen.queryByRole('button', { name: /^Aprovações, 2 aguardando/ })).toBeNull();

    await act(async () => {
      reenvio.resolver(fila);
    });
    await screen.findByRole('button', { name: 'Aprovações, 1 aguardando sua análise' });
  });

  it('com a página aberta, resposta atrasada da pessoa anterior não sobrescreve a contagem da nova', async () => {
    const respostaDaPrimeira = adiado<SolicitacaoAprovacao[]>();
    api.getFilaAprovacao.mockImplementation(() => (auth.user?.id === OUTRO_APROVADOR.id
      ? Promise.resolve([pedido(ID_3, { setor: 'Financeiro Alinare' })])
      : respostaDaPrimeira.promessa));
    auth.user = APROVADOR;
    const { rerender } = render(arvorePaginaEContador());
    auth.user = OUTRO_APROVADOR;
    rerender(arvorePaginaEContador());
    await screen.findByRole('button', { name: 'Aprovações, 1 aguardando sua análise' });

    await act(async () => {
      respostaDaPrimeira.resolver([pedido(ID_1), pedido(ID_2), pedido(ID_4)]);
    });
    await concluirConsultas();
    expect(screen.getByRole('button', { name: 'Aprovações, 1 aguardando sua análise' })).toBeInTheDocument();
  });

  it('com a página aberta, falha da consulta da nova pessoa não reapresenta a contagem anterior como atual', async () => {
    const falhaDaSegunda = adiado<SolicitacaoAprovacao[]>();
    api.getFilaAprovacao.mockImplementation(() => (auth.user?.id === OUTRO_APROVADOR.id
      ? falhaDaSegunda.promessa
      : Promise.resolve([pedido(ID_1), pedido(ID_2)])));
    auth.user = APROVADOR;
    const { rerender } = render(arvorePaginaEContador());
    await screen.findByRole('button', { name: 'Aprovações, 2 aguardando sua análise' });

    auth.user = OUTRO_APROVADOR;
    rerender(arvorePaginaEContador());
    await concluirConsultas();
    expect(screen.queryByRole('button', { name: /^Aprovações, 2 aguardando/ })).toBeNull();

    await act(async () => {
      falhaDaSegunda.recusar(new Error('Falha de rede'));
    });
    await screen.findByRole('button', { name: 'Aprovações, não foi possível verificar as pendências' });
    expect(screen.queryByRole('button', { name: /^Aprovações, 2 aguardando/ })).toBeNull();
  });

  it('sem a página aberta, falha da consulta da nova pessoa não reapresenta a contagem anterior como atual', async () => {
    const falhaDaSegunda = adiado<SolicitacaoAprovacao[]>();
    api.getFilaAprovacao
      .mockResolvedValueOnce([pedido(ID_1), pedido(ID_2)])
      .mockReturnValueOnce(falhaDaSegunda.promessa);
    auth.user = APROVADOR;
    const { rerender } = renderNav();
    await screen.findByRole('button', { name: 'Aprovações, 2 aguardando sua análise' });

    auth.user = OUTRO_APROVADOR;
    rerender(arvoreDoContador());
    await concluirConsultas();
    expect(screen.queryByRole('button', { name: /^Aprovações, 2 aguardando/ })).toBeNull();

    await act(async () => {
      falhaDaSegunda.recusar(new Error('Falha de rede'));
    });
    await screen.findByRole('button', { name: 'Aprovações, não foi possível verificar as pendências' });
    expect(screen.queryByRole('button', { name: /^Aprovações, 2 aguardando/ })).toBeNull();
  });

  it('com a página aberta, as linhas da pessoa anterior saem da tela enquanto a fila da nova carrega', async () => {
    const respostaDaSegunda = adiado<SolicitacaoAprovacao[]>();
    api.getFilaAprovacao.mockImplementation(() => (auth.user?.id === OUTRO_APROVADOR.id
      ? respostaDaSegunda.promessa
      : Promise.resolve([pedido(ID_1, { setor: 'Comercial Alinare' })])));
    auth.user = APROVADOR;
    const { rerender } = render(arvorePaginaEContador());
    await screen.findByText('RV-11111111');

    auth.user = OUTRO_APROVADOR;
    rerender(arvorePaginaEContador());
    await concluirConsultas();
    expect(screen.queryByText('RV-11111111')).toBeNull();

    await act(async () => {
      respostaDaSegunda.resolver([pedido(ID_3, { setor: 'Financeiro Alinare' })]);
    });
    await screen.findByText('RV-33333333');
  });

  it('com a página aberta, ao perder uma empresa a linha dela sai da tela enquanto a fila é recarregada', async () => {
    const fila = [pedido(ID_1, { empresa: 'Alinare' }), pedido(ID_2, { empresa: 'Novitah' })];
    const amplo = { ...APROVADOR, empresasAcesso: ['Alinare', 'Novitah'] } as UsuarioAutenticado;
    const reenvio = adiado<SolicitacaoAprovacao[]>();
    api.getFilaAprovacao
      .mockResolvedValueOnce(fila)
      .mockReturnValueOnce(reenvio.promessa)
      .mockResolvedValue(fila);
    auth.user = amplo;
    const { rerender } = render(arvorePaginaEContador());
    await screen.findByText('RV-22222222');

    auth.user = { ...amplo, empresasAcesso: ['Alinare'] } as UsuarioAutenticado;
    rerender(arvorePaginaEContador());
    await concluirConsultas();
    expect(screen.queryByText('RV-22222222')).toBeNull();

    await act(async () => {
      reenvio.resolver(fila);
    });
    await concluirConsultas();
    expect(screen.queryByText('RV-22222222')).toBeNull();
    expect(screen.getByText('RV-11111111')).toBeInTheDocument();
  });
});
