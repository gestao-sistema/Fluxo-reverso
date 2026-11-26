import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';

// ── Mocks ───────────────────────────────────────────────────────────────────────

vi.mock('../lib/supabase', () => ({
  supabase: {
    from: vi.fn(),
    auth: {
      signInWithPassword: vi.fn(),
      signOut: vi.fn(),
      getSession: vi.fn(),
      onAuthStateChange: vi.fn(),
    },
    functions: { invoke: vi.fn() },
  },
}));

vi.mock('../services/authService', () => ({
  default: {
    login: vi.fn(),
    logout: vi.fn(),
    getSessao: vi.fn(),
    onMudancaSessao: vi.fn(() => () => {}),
    listarUsuarios: vi.fn(),
    criarUsuario: vi.fn(),
    atualizarUsuario: vi.fn(),
    removerUsuario: vi.fn(),
    alterarSenha: vi.fn(),
    sessaoDeConvitePendente: vi.fn(() => Promise.resolve(false)),
  },
  AuthError: class AuthError extends Error {},
}));

vi.mock('../services/apiService', () => ({
  default: {
    createSolicitacao: vi.fn(),
    getSolicitacoes: vi.fn(() => Promise.resolve([])),
    getHistoricoCliente: vi.fn(() => Promise.resolve([])),
    updateSolicitacao: vi.fn(),
    getSolicitacaoById: vi.fn(),
    deleteSolicitacao: vi.fn(),
  },
}));

// NC aberta oferecida no formulário de reversa
vi.mock('../services/ncService', () => ({
  default: {
    opcoesParaReversa: vi.fn(() =>
      Promise.resolve([
        {
          id: 'b5f1c2d3-4e5f-4a6b-8c7d-9e0f1a2b3c4d',
          numero: 26,
          codigo: 'NC-0026',
          data_ocorrencia: '2026-10-01',
          cliente: 'Cliente da NC',
          origem: 'Outro',
          status: 'Aberta',
        },
      ])
    ),
  },
}));

// DatePicker real quebra em jsdom sem CSS/DOM completo — mock simples
vi.mock('react-datepicker', () => ({
  default: ({ onChange, id }: { onChange: (d: Date | null) => void; id?: string }) => (
    <input
      id={id}
      data-testid="datepicker"
      type="date"
      onChange={(e) => (e.target.value ? onChange(new Date(e.target.value)) : onChange(null))}
    />
  ),
  registerLocale: vi.fn(),
}));

import authService from '../services/authService';
import apiService from '../services/apiService';
import ncService from '../services/ncService';
import { AuthProvider } from '../context/AuthContext';
import ProtectedRoute from '../components/auth/ProtectedRoute';
import LoginPage from '../pages/LoginPage';
import SemAcessoPage from '../pages/SemAcessoPage';
import AlinareFormPage from '../pages/AlinareFormPage';
import { AuthError } from '../services/authService';

// ── Helpers ─────────────────────────────────────────────────────────────────────

function renderWithAuth(
  ui: React.ReactNode,
  sessao: null | { id: string; nome: string; usuario: string; telas: string[] } = null,
  caminho?: string
) {
  (authService.getSessao as ReturnType<typeof vi.fn>).mockResolvedValue(sessao);
  (authService.onMudancaSessao as ReturnType<typeof vi.fn>).mockReturnValue(() => {});
  return render(
    <MemoryRouter initialEntries={caminho ? [caminho] : undefined}>
      <AuthProvider>
        {ui}
        <Toaster />
      </AuthProvider>
    </MemoryRouter>
  );
}

const sessaoAdmin = { id: '1', nome: 'Admin', usuario: 'admin', telas: ['usuarios', 'dashboard-geral', 'formulario-alinare'] };
const sessaoAlinare = { id: '2', nome: 'Alinare User', usuario: 'alinare', telas: ['dashboard-alinare', 'formulario-alinare', 'kanban'] };
const NC_ID = 'b5f1c2d3-4e5f-4a6b-8c7d-9e0f1a2b3c4d';

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});

// ── ProtectedRoute ──────────────────────────────────────────────────────────────

describe('ProtectedRoute', () => {
  it('sem sessão: não renderiza children (redireciona p/ login)', async () => {
    renderWithAuth(<ProtectedRoute><div>conteúdo secreto</div></ProtectedRoute>, null);
    // aguarda isLoading terminar
    await waitFor(() => {
      expect(screen.queryByText('conteúdo secreto')).not.toBeInTheDocument();
    });
  });

  it('com sessão ADMIN: renderiza children', async () => {
    renderWithAuth(<ProtectedRoute><div>conteúdo secreto</div></ProtectedRoute>, sessaoAdmin);
    expect(await screen.findByText('conteúdo secreto')).toBeInTheDocument();
  });

  it('perfil não autorizado: redireciona e não renderiza children', async () => {
    renderWithAuth(
      <ProtectedRoute telas={['dashboard-geral']}>
        <div>só dashboard geral</div>
      </ProtectedRoute>,
      sessaoAlinare // tem dashboard-alinare, mas não dashboard-geral
    );
    await waitFor(() => {
      expect(screen.queryByText('só dashboard geral')).not.toBeInTheDocument();
    });
  });

  it('perfil autorizado: renderiza children', async () => {
    renderWithAuth(
      <ProtectedRoute telas={['dashboard-alinare']}>
        <div>só dashboard alinare</div>
      </ProtectedRoute>,
      sessaoAlinare
    );
    expect(await screen.findByText('só dashboard alinare')).toBeInTheDocument();
  });

  it('admin (tela usuarios) acessa qualquer rota', async () => {
    renderWithAuth(
      <ProtectedRoute telas={['dashboard-geral']}>
        <div>admin pode entrar</div>
      </ProtectedRoute>,
      sessaoAdmin
    );
    expect(await screen.findByText('admin pode entrar')).toBeInTheDocument();
  });
});

// ── LoginPage ───────────────────────────────────────────────────────────────────

describe('LoginPage', () => {
  it('renderiza campos usuário, senha e botão Entrar', () => {
    renderWithAuth(<LoginPage />);
    expect(screen.getByLabelText(/usuário/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^senha$/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^entrar$/i })).toBeInTheDocument();
  });

  it('retorna ao pedido solicitado depois da autenticação', async () => {
    (authService.login as ReturnType<typeof vi.fn>).mockResolvedValue(sessaoAlinare);
    (authService.getSessao as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (authService.onMudancaSessao as ReturnType<typeof vi.fn>).mockReturnValue(() => {});
    render(
      <MemoryRouter initialEntries={[{
        pathname: '/login',
        state: { from: { pathname: '/admin/meus-pedidos', search: '?solicitacaoId=pedido-123' } },
      }]}>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/admin/meus-pedidos" element={<div>Pedido aberto após login</div>} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>,
    );
    fireEvent.change(screen.getByLabelText(/usuário/i), { target: { value: 'alinare' } });
    fireEvent.change(screen.getByLabelText(/^senha$/i), { target: { value: 'senha-teste' } });
    fireEvent.click(screen.getByRole('button', { name: /^entrar$/i }));
    expect(await screen.findByText('Pedido aberto após login')).toBeInTheDocument();
  });

  it('credenciais inválidas: mostra mensagem de erro', async () => {
    (authService.login as ReturnType<typeof vi.fn>).mockRejectedValue(
      new AuthError('Usuário ou senha inválidos.')
    );

    renderWithAuth(<LoginPage />);
    fireEvent.change(screen.getByLabelText(/usuário/i), { target: { value: 'admin' } });
    fireEvent.change(screen.getByLabelText(/^senha$/i), { target: { value: 'errada' } });
    fireEvent.click(screen.getByRole('button', { name: /^entrar$/i }));

    // a tela de login atual comunica o erro só pelo toast (não há mais mensagem fixa no formulário)
    expect(await screen.findByText('Usuário ou senha inválidos.')).toBeInTheDocument();
  });

  it('login com campos vazios: HTML required bloqueia submit (validation)', () => {
    renderWithAuth(<LoginPage />);
    const form = screen.getByRole('button', { name: /^entrar$/i }).closest('form')!;
    expect(form).toBeInTheDocument();
    // inputs têm required
    expect(screen.getByLabelText(/usuário/i)).toBeRequired();
    expect(screen.getByLabelText(/^senha$/i)).toBeRequired();
  });
});

// ── SemAcessoPage ───────────────────────────────────────────────────────────────

describe('SemAcessoPage', () => {
  const sessaoSemTelas = { id: '3', nome: 'Sem Telas', usuario: 'semtelas', telas: [] };

  it('mostra o aviso de acesso negado', async () => {
    renderWithAuth(<SemAcessoPage />, sessaoSemTelas);
    expect(await screen.findByText('Sem acesso')).toBeInTheDocument();
  });

  it('botão Sair encerra a sessão', async () => {
    renderWithAuth(<SemAcessoPage />, sessaoSemTelas);
    fireEvent.click(await screen.findByRole('button', { name: /sair/i }));
    await waitFor(() => expect(authService.logout).toHaveBeenCalled());
  });

  it('usuário sem telas que abre um formulário cai na página Sem acesso', async () => {
    (authService.getSessao as ReturnType<typeof vi.fn>).mockResolvedValue(sessaoSemTelas);
    (authService.onMudancaSessao as ReturnType<typeof vi.fn>).mockReturnValue(() => {});
    render(
      <MemoryRouter initialEntries={['/admin/alinare']}>
        <AuthProvider>
          <Routes>
            <Route path="/sem-acesso" element={<ProtectedRoute><SemAcessoPage /></ProtectedRoute>} />
            <Route
              path="/admin/alinare"
              element={<ProtectedRoute telas={['formulario-alinare']}><div>formulario alinare</div></ProtectedRoute>}
            />
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    );
    expect(await screen.findByText('Sem acesso')).toBeInTheDocument();
    expect(screen.queryByText('formulario alinare')).not.toBeInTheDocument();
  });
});

// ── ReverseLogisticsForm (via AlinareFormPage) ──────────────────────────────────

describe('ReverseLogisticsForm — validação', () => {
  it('submit vazio: mostra erros de campos obrigatórios', async () => {
    renderWithAuth(<AlinareFormPage />, sessaoAdmin);

    const submit = screen.getByRole('button', { name: /enviar solicitação/i });
    fireEvent.click(submit);

    // aguarda mensagens role=alert aparecerem
    await waitFor(() => {
      const alerts = screen.getAllByRole('alert');
      expect(alerts.length).toBeGreaterThanOrEqual(3);
    });
  });

  it('motivo "Outros": revela textarea de justificativa', async () => {
    renderWithAuth(<AlinareFormPage />, sessaoAdmin);

    const motivoSelect = screen.getByLabelText(/motivo/i);
    await userEvent.selectOptions(motivoSelect, 'Outros');

    expect(screen.getByLabelText(/justifique/i)).toBeInTheDocument();
  });

  it('motivo diferente de "Outros": justificativa escondida', async () => {
    renderWithAuth(<AlinareFormPage />, sessaoAdmin);

    const motivoSelect = screen.getByLabelText(/motivo/i);
    await userEvent.selectOptions(motivoSelect, 'Outros');
    await userEvent.selectOptions(motivoSelect, 'Peça com defeito');

    const just = screen.queryByLabelText(/justifique/i);
    // campo existe no DOM mas está aria-hidden / invisível (max-h-0 opacity-0)
    if (just) {
      expect(just.closest('div[aria-hidden="true"]')).not.toBeNull();
    } else {
      expect(just).toBeNull();
    }
  });

  it('todos os campos válidos: aberto a partir da NC, envia a reversa vinculada a ela', async () => {
    // O vínculo é automático pela URL (?nc=<id>); o formulário não tem mais seletor de NC
    renderWithAuth(<AlinareFormPage />, sessaoAdmin, `/admin/alinare?nc=${NC_ID}`);

    fireEvent.change(await screen.findByTestId('datepicker'), { target: { value: '2024-01-15' } });
    expect(screen.getByLabelText(/solicitante/i)).toHaveValue('Admin');
    expect(screen.getByLabelText(/solicitante/i)).toHaveAttribute('readonly');
    await userEvent.selectOptions(screen.getByLabelText(/setor/i), 'Comercial Alinare');
    fireEvent.change(screen.getByLabelText(/código da cliente/i), { target: { value: '1234' } });
    fireEvent.change(screen.getByLabelText(/nome da cliente/i), { target: { value: 'Cliente Teste' } });
    fireEvent.change(screen.getByLabelText(/^endereço/i), {
      target: { value: 'Rua das Flores, 123, Centro, São Paulo/SP' },
    });
    fireEvent.change(screen.getByLabelText(/número/i), { target: { value: '123' } });
    await userEvent.selectOptions(screen.getByLabelText(/motivo/i), 'Peça com defeito');

    fireEvent.click(screen.getByRole('button', { name: /enviar solicitação/i }));

    await waitFor(() => {
      expect(apiService.createSolicitacao).toHaveBeenCalledWith(
        expect.objectContaining({ nc_id: NC_ID, empresa: 'Alinare', nome_cliente: 'Cliente Teste', solicitante: 'Admin' })
      );
    });
    expect(screen.queryAllByRole('alert')).toHaveLength(0);
  });

  it('NC aberta pela URL: preenche a cliente da NC', async () => {
    (authService.getSessao as ReturnType<typeof vi.fn>).mockResolvedValue(sessaoAdmin);
    render(
      <MemoryRouter initialEntries={[`/admin/alinare?nc=${NC_ID}`]}>
        <AuthProvider>
          <AlinareFormPage />
        </AuthProvider>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect((screen.getByLabelText(/nome da cliente/i) as HTMLInputElement).value).toBe('Cliente da NC');
    });
  });

  it('envia a reversa preenchendo só o formulário (sem seletor de NC): mantém o contrato do envio e marca as seções concluídas', async () => {
    renderWithAuth(<AlinareFormPage />, sessaoAdmin);

    fireEvent.change(await screen.findByTestId('datepicker'), { target: { value: '2024-01-15' } });
    await userEvent.selectOptions(screen.getByLabelText(/setor/i), 'Comercial Alinare');
    fireEvent.change(screen.getByLabelText(/código da cliente/i), { target: { value: '1234' } });
    fireEvent.change(screen.getByLabelText(/nome da cliente/i), { target: { value: 'Cliente Teste' } });
    fireEvent.change(screen.getByLabelText(/^endereço/i), { target: { value: 'Rua das Flores, Centro, São Paulo/SP' } });
    fireEvent.change(screen.getByLabelText(/número/i), { target: { value: '123' } });
    await userEvent.selectOptions(screen.getByLabelText(/motivo/i), 'Peça com defeito');

    // as três seções ficam concluídas (o marcador numérico vira check)
    await waitFor(() => expect(document.querySelectorAll('.step-num.done')).toHaveLength(3));

    fireEvent.click(screen.getByRole('button', { name: /enviar solicitação/i }));

    await waitFor(() => {
      expect(apiService.createSolicitacao).toHaveBeenCalledWith(
        expect.objectContaining({
          nc_id: null,
          empresa: 'Alinare',
          nome_cliente: 'Cliente Teste',
          solicitante: 'Admin',
          codigo_cliente: 1234,
          motivo: 'Peça com defeito',
          endereco_postagem: 'Rua das Flores, Centro, São Paulo/SP, 123',
        }),
      );
    });
    expect(screen.queryAllByRole('alert')).toHaveLength(0);
  });

  it('campos inválidos: o erro de cada campo é anunciado e o campo é marcado como inválido', async () => {
    renderWithAuth(<AlinareFormPage />, sessaoAdmin);
    fireEvent.click(screen.getByRole('button', { name: /enviar solicitação/i }));

    await waitFor(() => expect(screen.getAllByRole('alert').length).toBeGreaterThanOrEqual(3));
    expect(screen.getByLabelText(/nome da cliente/i)).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText(/nome da cliente/i)).toHaveAttribute('aria-required', 'true');
    expect(screen.getByLabelText(/nome da cliente/i)).toHaveAttribute('aria-describedby', 'err-nome');
    expect(document.getElementById('err-nome')).toHaveAttribute('role', 'alert');
  });

  it('NC da URL que não está aberta para a empresa: envia a reversa sem vínculo', async () => {
    // Encerrada, cancelada ou de outra empresa: não aparece nas opções e o vínculo é descartado
    (ncService.opcoesParaReversa as ReturnType<typeof vi.fn>).mockResolvedValueOnce([]);
    renderWithAuth(<AlinareFormPage />, sessaoAdmin, `/admin/alinare?nc=${NC_ID}`);

    await waitFor(() => expect(ncService.opcoesParaReversa).toHaveBeenCalled());
    fireEvent.change(await screen.findByTestId('datepicker'), { target: { value: '2024-01-15' } });
    expect(screen.getByLabelText(/solicitante/i)).toHaveValue('Admin');
    await userEvent.selectOptions(screen.getByLabelText(/setor/i), 'Comercial Alinare');
    fireEvent.change(screen.getByLabelText(/código da cliente/i), { target: { value: '1234' } });
    fireEvent.change(screen.getByLabelText(/nome da cliente/i), { target: { value: 'Cliente Teste' } });
    fireEvent.change(screen.getByLabelText(/^endereço/i), {
      target: { value: 'Rua das Flores, 123, Centro, São Paulo/SP' },
    });
    fireEvent.change(screen.getByLabelText(/número/i), { target: { value: '123' } });
    await userEvent.selectOptions(screen.getByLabelText(/motivo/i), 'Peça com defeito');
    fireEvent.click(screen.getByRole('button', { name: /enviar solicitação/i }));

    await waitFor(() => {
      expect(apiService.createSolicitacao).toHaveBeenCalledWith(
        expect.objectContaining({ nc_id: null, empresa: 'Alinare', nome_cliente: 'Cliente Teste', solicitante: 'Admin' })
      );
    });
  });
});
