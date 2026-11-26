import { beforeEach, describe, expect, it, vi } from 'vitest';
import { configure, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Outlet, useLocation } from 'react-router-dom';
import type { UsuarioAutenticado } from '../types';

// Árvore de rotas real (App.tsx) com páginas simuladas: o que se verifica aqui é a
// guarda de cada rota, o retorno pelo link após o login e a ausência de acesso por menu.
const mocks = vi.hoisted(() => ({
  estado: { user: null as UsuarioAutenticado | null },
  login: vi.fn(),
  logout: vi.fn(),
  sessaoDeConvitePendente: vi.fn(),
}));

vi.mock('../context/AuthContext', () => ({
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
  useAuth: () => ({
    user: mocks.estado.user,
    isLoading: false,
    isDemo: false,
    login: mocks.login,
    logout: mocks.logout,
    iniciarDemonstracao: vi.fn(),
  }),
}));
vi.mock('../services/authService', async () => {
  const real = await vi.importActual<typeof import('../services/authService')>('../services/authService');
  return { ...real, default: { ...real.default, sessaoDeConvitePendente: mocks.sessaoDeConvitePendente } };
});
vi.mock('../context/TemaContext', () => ({
  TemaProvider: ({ children }: { children: React.ReactNode }) => children,
  useEmpresaDaTela: () => {},
}));
vi.mock('../components/ui/BotaoModoCor', () => ({ default: () => null }));
vi.mock('../components/admin/AdminLayout', () => ({ default: () => <Outlet /> }));
vi.mock('react-hot-toast', () => ({ Toaster: () => null, default: { success: vi.fn(), error: vi.fn() } }));

function Pagina({ nome }: { nome: string }) {
  const { pathname, search } = useLocation();
  return <div data-testid="pagina">{nome}{pathname}{search}</div>;
}
for (const [caminho, nome] of [
  ['../pages/DashboardPage', 'DASHBOARD'], ['../pages/ListPage', 'LISTA'], ['../pages/KanbanPage', 'KANBAN'], ['../pages/UsuariosPage', 'USUARIOS'], ['../pages/AlinareFormPage', 'FORM-ALINARE'], ['../pages/NovitahFormPage', 'FORM-NOVITAH'],
  ['../pages/NcListPage', 'NC'], ['../pages/NcFormPage', 'NC-FORM'], ['../pages/NcPainelPage', 'NC-PAINEL'],
  ['../pages/NcListasPage', 'NC-LISTAS'], ['../pages/FilaOperacionalPage', 'FILA'], ['../pages/ApprovalQueuePage', 'APROVACOES'],
  ['../pages/MeusPedidosPage', 'MEUS-PEDIDOS'], ['../pages/ComunicacoesPage', 'COMUNICACOES'], ['../pages/DefinirSenhaPage', 'DEFINIR-SENHA'],
  ['../pages/SemAcessoPage', 'SEM-ACESSO'],
] as const) {
  vi.doMock(caminho, () => ({ default: () => <Pagina nome={nome} /> }));
}

import App from '../App';

const usuario = (telas: string[], extras: Partial<UsuarioAutenticado> = {}): UsuarioAutenticado =>
  ({ id: 'u1', nome: 'Pessoa', usuario: 'pessoa', telas, empresasAcesso: ['Alinare'], ...extras } as UsuarioAutenticado);

const abrir = (caminho: string) => {
  window.history.pushState({}, '', caminho);
  return render(<App />);
};

// As páginas são carregadas sob demanda (lazy); com a suíte inteira em paralelo o primeiro carregamento pode passar de 1 s.
configure({ asyncUtilTimeout: 8000 });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.estado.user = null;
  mocks.sessaoDeConvitePendente.mockResolvedValue(null);
});

describe('guarda das rotas administrativas e de gestão', () => {
  it('redireciona convidado sem senha para concluir o convite antes de abrir qualquer rota protegida', async () => {
    mocks.estado.user = usuario(['usuarios', 'dashboard-geral']);
    mocks.sessaoDeConvitePendente.mockResolvedValue({ usuarioId: 'u1' });
    abrir('/admin/usuarios');
    expect(await screen.findByTestId('pagina')).toHaveTextContent('DEFINIR-SENHA/definir-senha');
    expect(screen.getByTestId('pagina')).not.toHaveTextContent('USUARIOS');
  });

  it('comunicações: somente a capacidade administrativa; gestor, solicitante e aprovador voltam à própria home', async () => {
    mocks.estado.user = usuario(['usuarios']);
    const admin = abrir('/admin/comunicacoes');
    expect(await screen.findByTestId('pagina')).toHaveTextContent('COMUNICACOES/admin/comunicacoes');
    admin.unmount();

    for (const [telas, home] of [
      [['dashboard-geral', 'lista-geral', 'kanban-edit'], 'DASHBOARD'],
      [['formulario-alinare'], 'FORM-ALINARE'],
      [['aprovar-reversa'], 'APROVACOES'],
      [['emitir-etiqueta'], 'FILA'],
    ] as const) {
      mocks.estado.user = usuario([...telas]);
      const { unmount } = abrir('/admin/comunicacoes');
      await waitFor(() => expect(screen.getByTestId('pagina')).toHaveTextContent(home));
      expect(screen.getByTestId('pagina')).not.toHaveTextContent('COMUNICACOES');
      unmount();
    }
  });

  it('relatórios deixou de existir: o link antigo leva ao dashboard (com empresa e período) ou, sem ele, a Pedidos', async () => {
    for (const telas of [['dashboard-alinare'], ['dashboard-novitah'], ['dashboard-geral']]) {
      mocks.estado.user = usuario(telas);
      const { unmount } = abrir('/admin/relatorios?empresa=Alinare&inicio=2026-10-01&fim=2026-10-20');
      expect(await screen.findByTestId('pagina')).toHaveTextContent('DASHBOARD/admin/dashboard?empresa=Alinare&dataInicio=2026-10-01&dataFim=2026-10-20');
      unmount();
    }
    // A gestão de usuários não abre o dashboard: quem só tem essa tela volta à própria home.
    mocks.estado.user = usuario(['usuarios']);
    const soGestao = abrir('/admin/relatorios?empresa=Alinare');
    expect(await screen.findByTestId('pagina')).toHaveTextContent('USUARIOS');
    soGestao.unmount();
    mocks.estado.user = usuario(['lista-geral']);
    const lista = abrir('/admin/relatorios?inicio=2026-10-01');
    expect(await screen.findByTestId('pagina')).toHaveTextContent('LISTA/admin/lista?dataInicio=2026-10-01');
    lista.unmount();
    for (const [telas, home] of [[['aprovar-reversa'], 'APROVACOES'], [['emitir-etiqueta'], 'FILA'], [['formulario-alinare'], 'FORM-ALINARE']] as const) {
      mocks.estado.user = usuario([...telas]);
      const { unmount } = abrir('/admin/relatorios');
      await waitFor(() => expect(screen.getByTestId('pagina')).toHaveTextContent(home));
      expect(screen.getByTestId('pagina')).not.toHaveTextContent('RELATORIOS');
      unmount();
    }
  });

  it('kanban e check-in deixaram de existir: levam à tela que o perfil já pode usar, sem conceder acesso', async () => {
    mocks.estado.user = usuario(['lista-alinare', 'kanban-edit']);
    const kanban = abrir('/admin/kanban?empresa=Alinare');
    expect(await screen.findByTestId('pagina')).toHaveTextContent('LISTA/admin/lista?empresa=Alinare');
    kanban.unmount();
    // só a capacidade do kanban, sem tela de destino: home (sem acesso), nunca a tela antiga
    mocks.estado.user = usuario(['kanban']);
    const semDestino = abrir('/admin/kanban');
    await waitFor(() => expect(screen.getByTestId('pagina')).toHaveTextContent('SEM-ACESSO'));
    semDestino.unmount();

    mocks.estado.user = usuario(['emitir-etiqueta', 'confirmar-checkin']);
    const checkin = abrir('/admin/checkin');
    expect(await screen.findByTestId('pagina')).toHaveTextContent('FILA/admin/etiquetas');
    checkin.unmount();

    // só a capacidade antiga, sem tela de destino: vai para a home (sem acesso), nunca para a tela antiga
    mocks.estado.user = usuario(['confirmar-checkin']);
    const checkinSemDestino = abrir('/admin/checkin');
    await waitFor(() => expect(screen.getByTestId('pagina')).toHaveTextContent('SEM-ACESSO'));
    checkinSemDestino.unmount();
  });

  it('menu, dashboard e login não concedem capacidade: aprovações, emissão e usuários seguem a tela de cada uma', async () => {
    mocks.estado.user = usuario(['dashboard-geral', 'lista-geral']);
    for (const rota of ['/admin/aprovacoes', '/admin/etiquetas', '/admin/usuarios']) {
      const { unmount } = abrir(rota);
      await waitFor(() => expect(screen.getByTestId('pagina')).toHaveTextContent('DASHBOARD'));
      unmount();
    }
  });
});

describe('retorno pelo link depois do login', () => {
  const sessao = usuario(['formulario-alinare']);

  async function entrar() {
    fireEvent.change(await screen.findByLabelText('Usuário'), { target: { value: 'ana' } });
    fireEvent.change(screen.getByLabelText('Senha'), { target: { value: 'senha-fictícia' } });
    fireEvent.click(screen.getByRole('button', { name: /^Entrar$/ }));
  }

  it('Meus Pedidos preserva o pedido do link (?solicitacaoId=) após autenticar', async () => {
    mocks.login.mockImplementation(async () => { mocks.estado.user = sessao; return sessao; });
    abrir('/admin/meus-pedidos?solicitacaoId=11111111-1111-4111-8111-111111111111');
    await entrar();
    expect(await screen.findByTestId('pagina')).toHaveTextContent(
      'MEUS-PEDIDOS/admin/meus-pedidos?solicitacaoId=11111111-1111-4111-8111-111111111111');
    expect(mocks.login).toHaveBeenCalledWith('ana', 'senha-fictícia');
  });

  it('aprovação e emissão preservam o parâmetro do aviso; sem permissão, a home do perfil prevalece', async () => {
    const aprovador = usuario(['aprovar-reversa']);
    mocks.login.mockImplementation(async () => { mocks.estado.user = aprovador; return aprovador; });
    const primeira = abrir('/admin/aprovacoes?solicitacaoId=22222222-2222-4222-8222-222222222222');
    await entrar();
    expect(await screen.findByTestId('pagina')).toHaveTextContent('APROVACOES/admin/aprovacoes?solicitacaoId=22222222-2222-4222-8222-222222222222');
    primeira.unmount();

    mocks.estado.user = null;
    const operador = usuario(['emitir-etiqueta']);
    mocks.login.mockImplementation(async () => { mocks.estado.user = operador; return operador; });
    const segunda = abrir('/admin/etiquetas?pedido=33333333-3333-4333-8333-333333333333');
    await entrar();
    expect(await screen.findByTestId('pagina')).toHaveTextContent('FILA/admin/etiquetas?pedido=33333333-3333-4333-8333-333333333333');
    segunda.unmount();

    // Quem não tem a capacidade do link cai na própria home, sem abrir a rota protegida.
    mocks.estado.user = null;
    const outro = usuario(['formulario-alinare']);
    mocks.login.mockImplementation(async () => { mocks.estado.user = outro; return outro; });
    abrir('/admin/aprovacoes?solicitacaoId=44444444-4444-4444-8444-444444444444');
    await entrar();
    await waitFor(() => expect(screen.getByTestId('pagina')).toHaveTextContent('FORM-ALINARE'));
    expect(screen.getByTestId('pagina')).not.toHaveTextContent('APROVACOES');
  });
});
