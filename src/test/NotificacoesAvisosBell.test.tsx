import { useEffect, useState, type ReactNode } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AvisoReverso } from '../lib/avisosReverso';

const mocks = vi.hoisted(() => ({
  user: {
    id: 'solicitante-1', nome: 'Camila', usuario: 'camila', telas: ['formulario-alinare'], empresasAcesso: ['Alinare'],
  } as Record<string, unknown>,
  getNotificacoesEmissao: vi.fn(),
  marcarNotificacaoEmissaoLida: vi.fn(),
  listarAvisos: vi.fn(),
  contarAvisosNaoLidos: vi.fn(),
  marcarAvisoLido: vi.fn(),
  toastError: vi.fn(),
  montagensDaPagina: vi.fn(),
}));

vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ user: mocks.user }) }));
vi.mock('../services/apiService', () => ({ default: {
  getNotificacoesEmissao: mocks.getNotificacoesEmissao,
  marcarNotificacaoEmissaoLida: mocks.marcarNotificacaoEmissaoLida,
} }));
vi.mock('../services/avisosReversoService', () => ({ default: {
  listarAvisos: mocks.listarAvisos,
  contarAvisosNaoLidos: mocks.contarAvisosNaoLidos,
  marcarAvisoLido: mocks.marcarAvisoLido,
} }));
vi.mock('react-hot-toast', () => ({ default: { error: mocks.toastError, success: vi.fn() }, Toaster: () => null }));

import NotificacoesEmissaoBell from '../components/admin/NotificacoesEmissaoBell';

const PEDIDO = '11111111-1111-4111-8111-111111111111';
const OUTRO_PEDIDO = '22222222-2222-4222-8222-222222222222';

function LocalizacaoAtual() {
  const location = useLocation();
  return <output aria-label="Rota atual">{location.pathname}{location.search}</output>;
}

// Página vizinha com digitação: não pode ser desmontada nem perder o texto quando o sino atualiza
function PaginaComDigitacao() {
  const [texto, setTexto] = useState('');
  useEffect(() => {
    mocks.montagensDaPagina();
  }, []);
  return <input aria-label="Rascunho" value={texto} onChange={(evento) => setTexto(evento.target.value)} />;
}

const aviso = (extra: Partial<AvisoReverso> & { id: string; evento: AvisoReverso['evento'] }): AvisoReverso => ({
  solicitacao_id: PEDIDO,
  empresa: 'Alinare',
  versao: null,
  justificativa: null,
  nome_cliente: 'Casa Amora',
  criado_em: '2026-11-09T12:00:00.000Z',
  lido_em: null,
  superado_em: null,
  ...extra,
});

const APROVADOR = {
  id: 'aprovadora-1', nome: 'Paula', usuario: 'paula', telas: ['aprovar-reversa'], empresasAcesso: ['Alinare'],
};

function renderBell(extra: ReactNode = null) {
  return render(
    <MemoryRouter initialEntries={['/admin/dashboard']}>
      <NotificacoesEmissaoBell />
      {extra}
      <LocalizacaoAtual />
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.user = { id: 'solicitante-1', nome: 'Camila', usuario: 'camila', telas: ['formulario-alinare'], empresasAcesso: ['Alinare'] };
  mocks.getNotificacoesEmissao.mockResolvedValue({ notificacoes: [], naoLidas: 0 });
  mocks.marcarNotificacaoEmissaoLida.mockResolvedValue(true);
  mocks.listarAvisos.mockResolvedValue([]);
  mocks.contarAvisosNaoLidos.mockResolvedValue(0);
  mocks.marcarAvisoLido.mockResolvedValue(true);
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
});

describe('sino: avisos do ciclo da reversa', () => {
  it('o solicitante vê os avisos do próprio pedido, sem consultar a emissão', async () => {
    mocks.listarAvisos.mockResolvedValue([
      aviso({ id: 'a1', evento: 'pedido_criado' }),
      aviso({ id: 'a2', evento: 'pedido_aprovado', versao: 1, justificativa: 'Conferido com a NF', lido_em: '2026-11-09T12:10:00.000Z' }),
    ]);
    mocks.contarAvisosNaoLidos.mockResolvedValue(1);
    renderBell();
    fireEvent.click(await screen.findByRole('button', { name: /1 não lidas/ }));
    expect(await screen.findByText('Pedido registrado')).toBeInTheDocument();
    expect(screen.getByText('Sua solicitação foi aprovada. Observação: Conferido com a NF')).toBeInTheDocument();
    expect(mocks.getNotificacoesEmissao).not.toHaveBeenCalled();
  });

  it('abrir a aprovação leva à fila, com o pedido, e registra a leitura', async () => {
    mocks.user = APROVADOR;
    mocks.listarAvisos.mockResolvedValue([aviso({ id: 'p1', evento: 'aprovacao_pendente', versao: 1 })]);
    mocks.contarAvisosNaoLidos.mockResolvedValue(1);
    renderBell();
    fireEvent.click(await screen.findByRole('button', { name: /1 não lidas/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'Abrir na aprovação' }));
    await waitFor(() => expect(screen.getByLabelText('Rota atual')).toHaveTextContent(`/admin/aprovacoes?solicitacaoId=${PEDIDO}`));
    expect(mocks.marcarAvisoLido).toHaveBeenCalledWith('p1');
  });

  it('abrir um aviso de andamento leva a Meus Pedidos, com o pedido', async () => {
    mocks.listarAvisos.mockResolvedValue([aviso({ id: 'e1', evento: 'etiqueta_disponivel', lido_em: '2026-11-09T12:10:00.000Z' })]);
    renderBell();
    fireEvent.click(await screen.findByRole('button', { name: 'Notificações' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Abrir pedido' }));
    await waitFor(() => expect(screen.getByLabelText('Rota atual')).toHaveTextContent(`/admin/meus-pedidos?solicitacaoId=${PEDIDO}`));
  });

  it('pendência superada aparece como decidida e não conta como não lida', async () => {
    mocks.user = APROVADOR;
    mocks.listarAvisos.mockResolvedValue([aviso({ id: 's1', evento: 'aprovacao_pendente', versao: 1, superado_em: '2026-11-09T13:00:00.000Z' })]);
    mocks.contarAvisosNaoLidos.mockResolvedValue(0);
    renderBell();
    fireEvent.click(await screen.findByRole('button', { name: 'Notificações' }));
    expect(await screen.findByText('Esta aprovação já foi decidida ou substituída. Não exige ação.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /não lidas/ })).toBeNull();
  });

  it('a contagem soma as emissões e os avisos, para quem emite e também recebe avisos', async () => {
    mocks.user = { id: 'emissor-1', nome: 'Operador', usuario: 'operador', telas: ['emitir-etiqueta'], empresasAcesso: ['Alinare'] };
    mocks.getNotificacoesEmissao.mockResolvedValue({
      notificacoes: [{ id: 'n1', solicitacao_id: PEDIDO, empresa: 'Alinare', created_at: '2026-11-09T11:00:00.000Z', lida_em: null }],
      naoLidas: 1,
    });
    mocks.listarAvisos.mockResolvedValue([aviso({ id: 'x1', evento: 'pedido_criado', solicitacao_id: OUTRO_PEDIDO })]);
    mocks.contarAvisosNaoLidos.mockResolvedValue(1);
    renderBell();
    expect(await screen.findByRole('button', { name: /2 não lidas/ })).toBeInTheDocument();
  });
});

describe('sino: falha de consulta não parece ausência de avisos', () => {
  it('erro mostra a falha e o botão de tentar de novo; depois de tentar, a lista volta', async () => {
    mocks.listarAvisos
      .mockRejectedValueOnce(new Error('Não foi possível carregar as notificações agora. Tente novamente.'))
      .mockResolvedValue([aviso({ id: 'a1', evento: 'pedido_criado' })]);
    renderBell();
    fireEvent.click(await screen.findByRole('button', { name: 'Notificações' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível carregar as notificações agora');
    expect(screen.queryByText('Nenhuma notificação recente.')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));
    expect(await screen.findByText('Pedido registrado')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('sem erro e sem avisos, a mensagem é de nada recente', async () => {
    renderBell();
    fireEvent.click(await screen.findByRole('button', { name: 'Notificações' }));
    expect(await screen.findByText('Nenhuma notificação recente.')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

describe('sino: troca de sessão e atualização', () => {
  it('resposta atrasada do usuário anterior não aparece para o usuário atual', async () => {
    let concluirAnterior!: (valor: AvisoReverso[]) => void;
    mocks.listarAvisos
      .mockReturnValueOnce(new Promise<AvisoReverso[]>((resolve) => { concluirAnterior = resolve; }))
      .mockResolvedValueOnce([aviso({ id: 'atual', evento: 'aprovacao_pendente', versao: 1, solicitacao_id: OUTRO_PEDIDO })]);
    mocks.contarAvisosNaoLidos.mockResolvedValueOnce(9).mockResolvedValueOnce(1);

    const { rerender } = renderBell();
    mocks.user = APROVADOR;
    rerender(
      <MemoryRouter initialEntries={['/admin/dashboard']}>
        <NotificacoesEmissaoBell />
        <LocalizacaoAtual />
      </MemoryRouter>
    );
    expect(await screen.findByRole('button', { name: /1 não lidas/ })).toBeInTheDocument();

    concluirAnterior([aviso({ id: 'antigo', evento: 'pedido_criado' })]);
    await new Promise((resolve) => setTimeout(resolve, 20));
    fireEvent.click(screen.getByRole('button', { name: /1 não lidas/ }));
    expect(await screen.findByText('Há uma solicitação aguardando sua decisão.')).toBeInTheDocument();
    expect(screen.queryByText('Pedido registrado')).toBeNull();
  });

  it('atualizar em segundo plano não desmonta a página vizinha nem apaga o que foi digitado', async () => {
    mocks.montagensDaPagina.mockClear();
    renderBell(<PaginaComDigitacao />);
    const campo = await screen.findByLabelText('Rascunho');
    fireEvent.change(campo, { target: { value: 'pedido em andamento' } });
    const antes = mocks.listarAvisos.mock.calls.length;
    window.dispatchEvent(new Event('focus'));
    await waitFor(() => expect(mocks.listarAvisos.mock.calls.length).toBeGreaterThan(antes));
    expect(screen.getByLabelText('Rascunho')).toHaveValue('pedido em andamento');
    expect(mocks.montagensDaPagina).toHaveBeenCalledTimes(1);
  });

  it('falha ao registrar a leitura avisa, mas o pedido abre', async () => {
    mocks.user = APROVADOR;
    mocks.listarAvisos.mockResolvedValue([aviso({ id: 'p1', evento: 'aprovacao_pendente', versao: 1 })]);
    mocks.marcarAvisoLido.mockResolvedValueOnce(false);
    renderBell();
    fireEvent.click(await screen.findByRole('button', { name: 'Notificações' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Abrir na aprovação' }));
    await waitFor(() => expect(screen.getByLabelText('Rota atual')).toHaveTextContent(`/admin/aprovacoes?solicitacaoId=${PEDIDO}`));
    expect(mocks.toastError).toHaveBeenCalledWith(expect.stringContaining('Não foi possível registrar a leitura'));
  });
});
