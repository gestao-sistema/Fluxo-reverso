import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Usuario } from '../types';

const mocks = vi.hoisted(() => ({
  listarUsuarios: vi.fn(),
  criarUsuario: vi.fn(),
  convidarUsuario: vi.fn(),
  atualizarUsuario: vi.fn(),
  removerUsuario: vi.fn(),
  listarConfig: vi.fn(),
  salvarConfig: vi.fn(),
  erro: vi.fn(),
  sucesso: vi.fn(),
  usuarioLogado: { id: 'admin-1', nome: 'Gestora', usuario: 'gestora', telas: ['usuarios'], perfilAcesso: 'personalizado', empresasAcesso: [] } as Usuario,
}));

vi.mock('../services/authService', () => ({ default: {
  listarUsuarios: mocks.listarUsuarios,
  criarUsuario: mocks.criarUsuario,
  convidarUsuario: mocks.convidarUsuario,
  atualizarUsuario: mocks.atualizarUsuario,
  removerUsuario: mocks.removerUsuario,
} }));
vi.mock('../services/apiService', () => ({ default: {
  listarConfigAprovadoresReversa: mocks.listarConfig,
  salvarConfigAprovadoresReversa: mocks.salvarConfig,
} }));
vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ user: mocks.usuarioLogado }) }));
vi.mock('react-hot-toast', () => ({ default: { error: mocks.erro, success: mocks.sucesso } }));

import UsuariosPage from '../pages/UsuariosPage';

const usuarios: Usuario[] = [
  { id: 'admin-1', nome: 'Gestora', usuario: 'gestora', telas: ['usuarios'], perfilAcesso: 'personalizado', empresasAcesso: [] },
  { id: 'aprov-ok', nome: 'Aprovadora completa', usuario: 'aprov.ok', telas: ['aprovar-reversa'], perfilAcesso: 'personalizado', empresasAcesso: ['Alinare'] },
  { id: 'aprov-sem-escopo', nome: 'Aprovadora sem escopo', usuario: 'aprov.sem', telas: ['aprovar-reversa', 'dashboard-geral'], perfilAcesso: 'personalizado', empresasAcesso: ['Alinare', 'Novitah'] },
  { id: 'antigo', nome: 'Operador antigo', usuario: 'op.antigo', telas: ['kanban-edit', 'lista-geral'], perfilAcesso: 'personalizado', empresasAcesso: ['Alinare'] },
  { id: 'mestre-1', nome: 'Mestra', usuario: 'mestra', telas: ['usuarios', 'aprovar-reversa'], perfilAcesso: 'mestre', empresasAcesso: ['Alinare', 'Novitah'] },
];

beforeEach(() => {
  vi.clearAllMocks();
  mocks.usuarioLogado = usuarios[0];
  mocks.listarUsuarios.mockResolvedValue(usuarios);
  mocks.criarUsuario.mockResolvedValue({});
  mocks.convidarUsuario.mockResolvedValue({ usuario_id: 'novo-1', email: 'pessoa.nova@azime.com.br', estado: 'enviado', conta_criada: true, envio_habilitado: true });
  mocks.atualizarUsuario.mockResolvedValue({});
  mocks.listarConfig.mockResolvedValue({
    setores: [{ empresa: 'Alinare', setor: 'Comercial Alinare' }, { empresa: 'Alinare', setor: 'Financeiro' }],
    configuracoes: [
      { empresa: 'Alinare', usuario_id: 'aprov-ok', todos_setores: false, setores: ['Financeiro'] },
      { empresa: 'Alinare', usuario_id: 'aprov-sem-escopo', todos_setores: true, setores: [] },
    ],
  });
});

async function abrirNovo(user: ReturnType<typeof userEvent.setup>) {
  render(<UsuariosPage />);
  await screen.findByRole('cell', { name: 'Aprovadora completa' });
  await user.click(screen.getByRole('button', { name: /Novo usuário/ }));
  // Digitação tecla a tecla em um formulário deste tamanho estoura o limite de 5 s por teste.
  fireEvent.change(screen.getByLabelText('Nome'), { target: { value: 'Pessoa Nova' } });
  fireEvent.change(screen.getByLabelText('E-mail corporativo'), { target: { value: 'pessoa.nova@azime.com.br' } });
}

const caixa = (nome: RegExp) => screen.getByRole('checkbox', { name: nome });

describe('cadastro oficial de usuários por tela', () => {
  it('chama a forma personalizada de "Personalizado", sem texto de legado, e o campo de "Perfil de acesso"', async () => {
    const user = userEvent.setup();
    await abrirNovo(user);
    const perfil = screen.getByLabelText(/Perfil de acesso/);
    expect(within(perfil).getByRole('option', { name: 'Personalizado' })).toBeInTheDocument();
    expect(screen.queryByText(/legado/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Setor')).not.toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/provisór|demonstra[çc]ão|antiga forma/i);
  });

  it('oferece as telas atuais e não restaura Kanban nem check-in manual', async () => {
    const user = userEvent.setup();
    await abrirNovo(user);
    await user.selectOptions(screen.getByLabelText(/Perfil de acesso/), 'personalizado');
    for (const rotulo of [/^Dashboard Geral/, /^Formulário Alinare/, /^Pedidos das duas empresas/, /^Aprovações/, /^Emissão de etiquetas/, /^Não conformidades/, /^Gestão de usuários/]) {
      expect(caixa(rotulo)).toBeInTheDocument();
    }
    expect(screen.queryByRole('checkbox', { name: /Kanban/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: /check-in/i })).not.toBeInTheDocument();
    // Cada tela mostra o que concede.
    expect(caixa(/^Aprovações/)).toHaveAccessibleName(/Aprovar ou rejeitar/);
  });

  it('marcar Aprovações pede empresa e escopo no mesmo formulário e só salva com configuração válida', async () => {
    const user = userEvent.setup();
    await abrirNovo(user);
    await user.selectOptions(screen.getByLabelText(/Perfil de acesso/), 'personalizado');
    await user.click(caixa(/^Aprovações/));

    const salvar = screen.getByRole('button', { name: /Salvar e enviar convite/ });
    expect(salvar).toBeDisabled();
    expect(screen.getByRole('status')).toHaveTextContent(/ao menos uma empresa/);

    await user.click(screen.getByRole('checkbox', { name: 'Alinare' }));
    const aprovaAlinare = screen.getByRole('group', { name: /Aprova pedidos da Alinare/ });
    expect(within(aprovaAlinare).getByText(/Defina o escopo de aprovação da Alinare/)).toBeInTheDocument();
    expect(salvar).toBeDisabled();

    await user.click(within(aprovaAlinare).getByRole('radio', { name: 'Setores específicos' }));
    expect(salvar).toBeDisabled();
    await user.click(within(aprovaAlinare).getByRole('checkbox', { name: 'Financeiro (Alinare)' }));
    expect(salvar).toBeEnabled();
    await user.click(salvar);

    await waitFor(() => expect(mocks.convidarUsuario).toHaveBeenCalledTimes(1));
    expect(mocks.convidarUsuario.mock.calls[0][0]).toMatchObject({
      nome: 'Pessoa Nova',
      email: 'pessoa.nova@azime.com.br',
      perfilAcesso: 'personalizado',
      telas: ['aprovar-reversa'],
      empresasAcesso: ['Alinare'],
      aprovacao: [{ empresa: 'Alinare', todos_setores: false, setores: ['Financeiro'] }],
    });
  });

  it('"Todos os setores" é uma escolha explícita e vale por empresa', async () => {
    const user = userEvent.setup();
    await abrirNovo(user);
    await user.selectOptions(screen.getByLabelText(/Perfil de acesso/), 'personalizado');
    await user.click(caixa(/^Aprovações/));
    await user.click(screen.getByRole('checkbox', { name: 'Alinare' }));
    await user.click(screen.getByRole('checkbox', { name: 'Novitah' }));
    await user.click(within(screen.getByRole('group', { name: /Aprova pedidos da Alinare/ })).getByRole('radio', { name: 'Todos os setores' }));
    expect(screen.getByRole('button', { name: /Salvar e enviar convite/ })).toBeDisabled();
    await user.click(within(screen.getByRole('group', { name: /Aprova pedidos da Novitah/ })).getByRole('radio', { name: 'Todos os setores' }));
    await user.click(screen.getByRole('button', { name: /Salvar e enviar convite/ }));
    await waitFor(() => expect(mocks.convidarUsuario).toHaveBeenCalled());
    expect(mocks.convidarUsuario.mock.calls[0][0].aprovacao).toEqual([
      { empresa: 'Alinare', todos_setores: true, setores: [] },
      { empresa: 'Novitah', todos_setores: true, setores: [] },
    ]);
  });

  it('emissor de uma empresa: a tela exige a empresa marcada e grava só ela', async () => {
    const user = userEvent.setup();
    await abrirNovo(user);
    await user.selectOptions(screen.getByLabelText(/Perfil de acesso/), 'personalizado');
    await user.click(caixa(/^Emissão de etiquetas/));
    expect(screen.getByRole('button', { name: /Salvar e enviar convite/ })).toBeDisabled();
    await user.click(screen.getByRole('checkbox', { name: 'Novitah' }));
    await user.click(screen.getByRole('button', { name: /Salvar e enviar convite/ }));
    await waitFor(() => expect(mocks.convidarUsuario).toHaveBeenCalled());
    expect(mocks.convidarUsuario.mock.calls[0][0]).toMatchObject({ telas: ['emitir-etiqueta'], empresasAcesso: ['Novitah'], aprovacao: [] });
  });

  it('perfil pronto "Aprova chamados": empresas marcadas, todos os setores explicados e nenhuma tela enviada', async () => {
    const user = userEvent.setup();
    await abrirNovo(user);
    await user.selectOptions(screen.getByLabelText(/Perfil de acesso/), 'aprovador');
    expect(screen.getByText(/todos os setores das empresas marcadas/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Salvar e enviar convite/ })).toBeDisabled();
    await user.click(screen.getByRole('checkbox', { name: 'Alinare' }));
    await user.click(screen.getByRole('button', { name: /Salvar e enviar convite/ }));
    await waitFor(() => expect(mocks.convidarUsuario).toHaveBeenCalled());
    expect(mocks.convidarUsuario.mock.calls[0][0]).toMatchObject({ perfilAcesso: 'aprovador', empresasAcesso: ['Alinare'], telas: [] });
  });

  it('editar preserva as escolhas gravadas (empresa e setores) e envia o escopo ao salvar', async () => {
    const user = userEvent.setup();
    render(<UsuariosPage />);
    await screen.findByRole('cell', { name: 'Aprovadora completa' });
    await user.click(screen.getByRole('button', { name: 'Editar Aprovadora completa' }));
    expect(caixa(/^Aprovações/)).toBeChecked();
    const grupo = screen.getByRole('group', { name: /Aprova pedidos da Alinare/ });
    expect(within(grupo).getByRole('radio', { name: 'Setores específicos' })).toBeChecked();
    expect(within(grupo).getByRole('checkbox', { name: 'Financeiro (Alinare)' })).toBeChecked();
    await user.click(within(grupo).getByRole('checkbox', { name: 'Comercial Alinare (Alinare)' }));
    await user.click(screen.getByRole('button', { name: 'Salvar' }));
    await waitFor(() => expect(mocks.atualizarUsuario).toHaveBeenCalledTimes(1));
    const [id, payload] = mocks.atualizarUsuario.mock.calls[0];
    expect(id).toBe('aprov-ok');
    expect(payload).toMatchObject({
      perfilAcesso: 'personalizado', telas: ['aprovar-reversa'], empresasAcesso: ['Alinare'],
      aprovacao: [{ empresa: 'Alinare', todos_setores: false, setores: ['Comercial Alinare', 'Financeiro'] }],
    });
  });

  it('usuário existente sem escopo gravado é sinalizado e exige preenchimento antes de salvar', async () => {
    const user = userEvent.setup();
    render(<UsuariosPage />);
    await screen.findByRole('cell', { name: 'Aprovadora sem escopo' });
    const linha = screen.getByRole('cell', { name: 'Aprovadora sem escopo' }).closest('tr')!;
    expect(within(linha).getByText('Revisar acesso')).toBeInTheDocument();
    expect(within(screen.getByRole('cell', { name: 'Aprovadora completa' }).closest('tr')!).queryByText('Revisar acesso')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Editar Aprovadora sem escopo' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Falta o escopo de aprovação de Novitah');
    expect(screen.getByRole('button', { name: 'Salvar' })).toBeDisabled();
    await user.click(within(screen.getByRole('group', { name: /Aprova pedidos da Novitah/ })).getByRole('radio', { name: 'Todos os setores' }));
    expect(screen.getByRole('button', { name: 'Salvar' })).toBeEnabled();
  });

  it('mestre não é sinalizado: o acesso total é explícito e o escopo é gravado ao salvar', async () => {
    render(<UsuariosPage />);
    const linha = (await screen.findByRole('cell', { name: 'Mestra' })).closest('tr')!;
    expect(within(linha).getByText('Mestre · acesso total')).toBeInTheDocument();
    expect(within(linha).queryByText('Revisar acesso')).not.toBeInTheDocument();
  });

  it('acessos antigos são preservados e identificados, e podem ser retirados', async () => {
    const user = userEvent.setup();
    render(<UsuariosPage />);
    await screen.findByRole('cell', { name: 'Operador antigo' });
    await user.click(screen.getByRole('button', { name: 'Editar Operador antigo' }));
    expect(screen.getByText('Acessos antigos (preservados)')).toBeInTheDocument();
    const antigo = screen.getByRole('checkbox', { name: /Editar Kanban/ });
    expect(antigo).toBeChecked();
    // Nenhuma das telas oferecidas é o Kanban: só a seção de preservados o mostra.
    expect(screen.getAllByRole('checkbox', { name: /Kanban/ })).toHaveLength(1);
    await user.click(screen.getByRole('button', { name: 'Salvar' }));
    await waitFor(() => expect(mocks.atualizarUsuario).toHaveBeenCalled());
    expect([...mocks.atualizarUsuario.mock.calls[0][1].telas].sort()).toEqual(['kanban-edit', 'lista-geral']);
  });

  it('a própria gestão de usuários não pode ser retirada pela própria pessoa', async () => {
    mocks.usuarioLogado = usuarios[0];
    const user = userEvent.setup();
    render(<UsuariosPage />);
    await screen.findByRole('cell', { name: 'Gestora' });
    await user.click(screen.getByRole('button', { name: 'Editar Gestora' }));
    const gestao = caixa(/^Gestão de usuários/);
    expect(gestao).toBeChecked();
    expect(gestao).toBeDisabled();
  });

  it('administrador padrão continua com login e acesso fixos', async () => {
    mocks.listarUsuarios.mockResolvedValue([{ ...usuarios[0], id: 'padrao', nome: 'Administrador', usuario: 'admin', protegido: true }, usuarios[1]]);
    const user = userEvent.setup();
    render(<UsuariosPage />);
    await screen.findByRole('cell', { name: 'Administrador' });
    await user.click(screen.getByRole('button', { name: 'Editar Administrador' }));
    expect(screen.getByLabelText(/Perfil de acesso/)).toBeDisabled();
    expect(screen.getByLabelText('Login')).toHaveAttribute('readonly');
  });
});
