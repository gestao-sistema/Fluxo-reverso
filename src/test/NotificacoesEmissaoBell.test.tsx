import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NotificacaoEmissao } from '../types';

const mocks = vi.hoisted(() => ({
  user: {
    id: 'emissor-1', nome: 'Operador', usuario: 'operador', telas: ['emitir-etiqueta'], empresasAcesso: ['Alinare'],
  },
  getNotificacoesEmissao: vi.fn(),
  marcarNotificacaoEmissaoLida: vi.fn(),
  listarAvisos: vi.fn(async () => []),
  contarAvisosNaoLidos: vi.fn(async () => 0),
  marcarAvisoLido: vi.fn(async () => true),
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

import NotificacoesEmissaoBell from '../components/admin/NotificacoesEmissaoBell';

function LocalizacaoAtual() {
  const location = useLocation();
  return <output aria-label="Rota atual">{location.pathname}{location.search}</output>;
}

const aviso: NotificacaoEmissao = {
  id: 'notice-1',
  solicitacao_id: '11111111-1111-4111-8111-111111111111',
  empresa: 'Alinare',
  created_at: '2026-10-26T15:00:00.000Z',
  lida_em: null,
};

function renderBell() {
  return render(<MemoryRouter initialEntries={['/admin/dashboard']}><NotificacoesEmissaoBell /><LocalizacaoAtual /></MemoryRouter>);
}

describe('sino de notificações de emissão', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getNotificacoesEmissao
      .mockResolvedValueOnce({ notificacoes: [aviso], naoLidas: 1 })
      .mockResolvedValue({ notificacoes: [{ ...aviso, lida_em: '2026-10-26T15:05:00.000Z' }], naoLidas: 0 });
    mocks.marcarNotificacaoEmissaoLida.mockResolvedValue(true);
  });

  it('mostra o aviso e abre a solicitação certa na fila depois de persistir a leitura', async () => {
    renderBell();
    await waitFor(() => expect(mocks.getNotificacoesEmissao).toHaveBeenCalledOnce());
    fireEvent.click(screen.getByRole('button', { name: /1 não lidas/ }));
    expect(await screen.findByText(/RV-11111111 · Alinare/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Abrir na fila' }));

    await waitFor(() => expect(screen.getByLabelText('Rota atual')).toHaveTextContent('/admin/etiquetas?pedido=11111111-1111-4111-8111-111111111111'));
    expect(mocks.marcarNotificacaoEmissaoLida).toHaveBeenCalledWith('notice-1');
  });

  it('persiste a leitura no armazenamento demo e a conserva ao reler', async () => {
    const { demoApi } = await import('../demo/demoApi');
    localStorage.setItem('flowdesk:demo:usuario', 'demo-etiquetas');
    const lista = await demoApi.getNotificacoesEmissao();
    expect(lista.notificacoes.length).toBeGreaterThan(0);
    const inicial = lista.notificacoes[0];
    expect(await demoApi.marcarNotificacaoEmissaoLida(inicial.id)).toBe(true);
    const novamente = await demoApi.getNotificacoesEmissao();
    expect(novamente.notificacoes.find((item) => item.id === inicial.id)?.lida_em).toBeTruthy();
    expect(novamente.naoLidas).toBeLessThan(lista.naoLidas);
  }, 30_000); // o primeiro import dinâmico do demo é lento com a suíte inteira em paralelo
});

describe('sino: troca rápida de perfil', () => {
  it('resposta atrasada do perfil anterior não sobrescreve os avisos do perfil atual', async () => {
    const anterior = { ...aviso, id: 'aviso-do-perfil-anterior', solicitacao_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' };
    const atual = { ...aviso, id: 'aviso-do-perfil-atual', solicitacao_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' };
    let concluirAnterior!: (valor: { notificacoes: NotificacaoEmissao[]; naoLidas: number }) => void;
    mocks.getNotificacoesEmissao.mockReset();
    mocks.getNotificacoesEmissao
      .mockReturnValueOnce(new Promise((resolve) => { concluirAnterior = resolve; }))
      .mockResolvedValueOnce({ notificacoes: [atual], naoLidas: 1 });

    const { rerender } = renderBell();
    mocks.user = { id: 'emissor-2', nome: 'Outro', usuario: 'outro', telas: ['emitir-etiqueta'], empresasAcesso: ['Alinare'] };
    rerender(<MemoryRouter initialEntries={['/admin/dashboard']}><NotificacoesEmissaoBell /><LocalizacaoAtual /></MemoryRouter>);
    await waitFor(() => expect(mocks.getNotificacoesEmissao).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.getByRole('button', { name: /1 não lidas/ })).toBeInTheDocument());

    concluirAnterior({ notificacoes: [anterior, anterior], naoLidas: 7 }); // chega tarde
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.getByRole('button', { name: /1 não lidas/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /7 não lidas/ })).not.toBeInTheDocument();
  });
});
