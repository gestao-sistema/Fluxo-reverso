import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { ResultadoConvite, Usuario } from '../types';

const mocks = vi.hoisted(() => ({
  listarUsuarios: vi.fn(),
  convidarUsuario: vi.fn(),
  reenviarConvite: vi.fn(),
  atualizarUsuario: vi.fn(),
  criarUsuario: vi.fn(),
  listarConfig: vi.fn(),
  erro: vi.fn(),
  sucesso: vi.fn(),
  aviso: vi.fn(),
}));

vi.mock('../services/authService', () => ({ default: {
  listarUsuarios: mocks.listarUsuarios,
  convidarUsuario: mocks.convidarUsuario,
  reenviarConvite: mocks.reenviarConvite,
  atualizarUsuario: mocks.atualizarUsuario,
  criarUsuario: mocks.criarUsuario,
  removerUsuario: vi.fn(),
} }));
vi.mock('../services/apiService', () => ({ default: { listarConfigAprovadoresReversa: mocks.listarConfig, salvarConfigAprovadoresReversa: vi.fn() } }));
vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ user: { id: 'admin-1' } }) }));
vi.mock('react-hot-toast', () => ({ default: Object.assign(mocks.aviso, { error: mocks.erro, success: mocks.sucesso }) }));

import UsuariosPage from '../pages/UsuariosPage';

const usuarios: Usuario[] = [
  { id: 'admin-1', nome: 'Gestora', usuario: 'gestora', telas: ['usuarios'], perfilAcesso: 'personalizado', empresasAcesso: [], situacao: 'ativo' },
  { id: 'pend-1', nome: 'Pessoa Pendente', usuario: 'pendente@azime.com.br', telas: ['lista-geral'], perfilAcesso: 'personalizado', empresasAcesso: [], situacao: 'convite_pendente', convite: { estado: 'enviado', tentativas: 1, concluidoEm: null } },
  { id: 'pend-2', nome: 'Pessoa Incerta', usuario: 'incerta@azime.com.br', telas: ['lista-geral'], perfilAcesso: 'personalizado', empresasAcesso: [], situacao: 'convite_pendente', convite: { estado: 'resultado_indeterminado', tentativas: 1, concluidoEm: null } },
  { id: 'sem-senha', nome: 'Sem Senha', usuario: 'semsenha@azime.com.br', telas: ['lista-geral'], perfilAcesso: 'personalizado', empresasAcesso: [], situacao: 'senha_nao_definida', convite: { estado: 'enviado', tentativas: 1, concluidoEm: null } },
];

const resultado = (estado: ResultadoConvite['estado']): ResultadoConvite => ({
  usuario_id: 'novo-1', email: 'pessoa.nova@azime.com.br', estado, conta_criada: true, envio_habilitado: estado !== 'preparado',
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.listarUsuarios.mockResolvedValue(usuarios);
  mocks.listarConfig.mockResolvedValue({ setores: [], configuracoes: [] });
  mocks.convidarUsuario.mockResolvedValue(resultado('smtp_aceito'));
  mocks.reenviarConvite.mockResolvedValue(resultado('smtp_aceito'));
});

async function abrirNovo(email = 'pessoa.nova@azime.com.br') {
  render(<UsuariosPage />);
  await screen.findByRole('cell', { name: 'Pessoa Pendente' });
  fireEvent.click(screen.getByRole('button', { name: /Novo usuário/ }));
  fireEvent.change(screen.getByLabelText('Nome'), { target: { value: 'Pessoa Nova' } });
  fireEvent.change(screen.getByLabelText('E-mail corporativo'), { target: { value: email } });
  fireEvent.change(screen.getByLabelText(/Perfil de acesso/), { target: { value: 'personalizado' } });
  fireEvent.click(screen.getByRole('checkbox', { name: /^Pedidos das duas empresas/ }));
}
const salvar = () => screen.getByRole('button', { name: /Salvar e enviar convite/ });

describe('cadastro por convite na tela de usuários', () => {
  it('pede nome e e-mail corporativo, sem login nem senha, e oferece "Salvar e enviar convite"', async () => {
    await abrirNovo();
    expect(screen.queryByLabelText('Login')).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/^Senha/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Confirmar senha/)).not.toBeInTheDocument();
    expect(screen.getByText(/define a própria senha do Reverso/)).toBeInTheDocument();
    expect(salvar()).toBeEnabled();
  });

  it('envia nome, e-mail e o acesso escolhido (permissões atuais preservadas), sem senha', async () => {
    await abrirNovo();
    fireEvent.click(salvar());
    await waitFor(() => expect(mocks.convidarUsuario).toHaveBeenCalledTimes(1));
    const payload = mocks.convidarUsuario.mock.calls[0][0];
    expect(payload).toMatchObject({
      nome: 'Pessoa Nova', email: 'pessoa.nova@azime.com.br', perfilAcesso: 'personalizado', telas: ['lista-geral'], empresasAcesso: [], confirmarResultadoIncerto: false,
    });
    expect(JSON.stringify(payload)).not.toMatch(/senha|password/i);
    expect(mocks.criarUsuario).not.toHaveBeenCalled();
    expect(mocks.sucesso).toHaveBeenCalledWith(expect.stringContaining('servidor SMTP aceitou'));
  });

  it.each(['pessoa@gmail.com', 'pessoa@azime.com.br.outrodominio.com', 'pessoa@sub.azime.com.br', ''])(
    'recusa o e-mail %j antes de chamar o backend',
    async (email) => {
      await abrirNovo(email);
      fireEvent.click(salvar());
      await waitFor(() => expect(mocks.erro).toHaveBeenCalled());
      expect(mocks.convidarUsuario).not.toHaveBeenCalled();
    },
  );

  it('aceita espaços e maiúsculas nas pontas (a normalização final é do serviço e do backend)', async () => {
    await abrirNovo('  Pessoa.Nova@AZIME.com.br  ');
    fireEvent.click(salvar());
    await waitFor(() => expect(mocks.convidarUsuario).toHaveBeenCalledTimes(1));
  });

  it('cliques repetidos durante o envio chamam o backend uma única vez', async () => {
    let liberar: (r: ResultadoConvite) => void = () => {};
    mocks.convidarUsuario.mockReturnValue(new Promise<ResultadoConvite>((resolver) => { liberar = resolver; }));
    await abrirNovo();
    fireEvent.click(salvar());
    fireEvent.click(salvar());
    fireEvent.submit(salvar().closest('form')!);
    expect(mocks.convidarUsuario).toHaveBeenCalledTimes(1);
    expect(salvar()).toBeDisabled();
    liberar(resultado('smtp_aceito'));
    await waitFor(() => expect(screen.queryByRole('button', { name: /Salvar e enviar convite/ })).not.toBeInTheDocument());
    expect(mocks.convidarUsuario).toHaveBeenCalledTimes(1);
  });

  it('falha de envio não é apresentada como sucesso e mantém o formulário para tentar de novo', async () => {
    mocks.convidarUsuario.mockResolvedValue(resultado('falhou'));
    await abrirNovo();
    fireEvent.click(salvar());
    await waitFor(() => expect(mocks.erro).toHaveBeenCalledWith(expect.stringContaining('NÃO foi enviado')));
    expect(mocks.sucesso).not.toHaveBeenCalled();
    expect(salvar()).toBeInTheDocument();
    // Repetir reutiliza a conta pendente no backend: o mesmo cadastro é reenviado.
    await waitFor(() => expect(salvar()).toBeEnabled());
    fireEvent.click(salvar());
    await waitFor(() => expect(mocks.convidarUsuario).toHaveBeenCalledTimes(2));
  });

  it.each([
    ['resultado_indeterminado', /registros do servidor/],
    ['rejeitado', /servidor SMTP recusou/],
  ] as const)('estado %s é aviso de erro, nunca sucesso', async (estado, texto) => {
    mocks.convidarUsuario.mockResolvedValue(resultado(estado));
    await abrirNovo();
    fireEvent.click(salvar());
    await waitFor(() => expect(mocks.erro).toHaveBeenCalledWith(expect.stringMatching(texto), expect.anything()));
    expect(mocks.sucesso).not.toHaveBeenCalled();
  });

  it('envio desabilitado: informa que o cadastro foi salvo e que nada foi enviado', async () => {
    mocks.convidarUsuario.mockResolvedValue(resultado('preparado'));
    await abrirNovo();
    fireEvent.click(salvar());
    await waitFor(() => expect(mocks.aviso).toHaveBeenCalledWith(expect.stringContaining('nenhum e-mail foi enviado'), expect.anything()));
    expect(mocks.sucesso).not.toHaveBeenCalled();
  });

  it('resultado anterior incerto pede confirmação explícita antes de reenviar', async () => {
    mocks.convidarUsuario.mockRejectedValueOnce(Object.assign(new Error('incerto'), { codigo: 'confirmacao_necessaria' }));
    await abrirNovo();
    fireEvent.click(salvar());
    const dialogo = await screen.findByRole('alertdialog');
    expect(dialogo).toHaveTextContent(/resultado incerto/i);
    expect(mocks.convidarUsuario).toHaveBeenCalledTimes(1);
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Reenviar mesmo assim' }));
    await waitFor(() => expect(mocks.convidarUsuario).toHaveBeenCalledTimes(2));
    expect(mocks.convidarUsuario.mock.calls[1][0].confirmarResultadoIncerto).toBe(true);
  });
});

describe('convites pendentes na lista', () => {
  it('mostra a situação do convite e só oferece reenvio para convite pendente', async () => {
    render(<UsuariosPage />);
    const pendente = (await screen.findByRole('cell', { name: 'Pessoa Pendente' })).closest('tr')!;
    expect(within(pendente).getByText('Convite pendente · enviado')).toBeInTheDocument();
    expect(within(pendente).getByRole('button', { name: 'Reenviar convite para Pessoa Pendente' })).toBeInTheDocument();
    const ativa = screen.getByRole('cell', { name: 'Gestora' }).closest('tr')!;
    expect(within(ativa).queryByRole('button', { name: /Reenviar convite/ })).not.toBeInTheDocument();
    const semSenha = screen.getByRole('cell', { name: 'Sem Senha' }).closest('tr')!;
    expect(within(semSenha).getByText('Convite aceito · senha não definida')).toBeInTheDocument();
    expect(within(semSenha).queryByRole('button', { name: /Reenviar convite/ })).not.toBeInTheDocument();
  });

  it('reenvio é explícito: confirma, avisa que o link anterior deixa de valer e chama uma vez', async () => {
    render(<UsuariosPage />);
    await screen.findByRole('cell', { name: 'Pessoa Pendente' });
    fireEvent.click(screen.getByRole('button', { name: 'Reenviar convite para Pessoa Pendente' }));
    const dialogo = await screen.findByRole('alertdialog');
    expect(dialogo).toHaveTextContent(/link anterior deixa de valer/);
    expect(mocks.reenviarConvite).not.toHaveBeenCalled();
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Reenviar convite' }));
    await waitFor(() => expect(mocks.reenviarConvite).toHaveBeenCalledTimes(1));
    expect(mocks.reenviarConvite).toHaveBeenCalledWith('pend-1', false);
  });

  it('convite aceito sem senha: o administrador envia o link de definição de senha, explícito e sem mudar permissões', async () => {
    mocks.reenviarConvite.mockResolvedValue({ ...resultado('enviado'), usuario_id: 'sem-senha', conta_criada: false, link: 'definicao_senha' });
    render(<UsuariosPage />);
    await screen.findByRole('cell', { name: 'Sem Senha' });
    fireEvent.click(screen.getByRole('button', { name: 'Enviar link de definição de senha para Sem Senha' }));
    const dialogo = await screen.findByRole('alertdialog');
    expect(dialogo).toHaveTextContent(/já abriu o convite e ainda não criou a senha/);
    expect(dialogo).toHaveTextContent(/permissões não mudam/);
    expect(mocks.reenviarConvite).not.toHaveBeenCalled();
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Enviar link' }));
    await waitFor(() => expect(mocks.reenviarConvite).toHaveBeenCalledTimes(1));
    expect(mocks.reenviarConvite).toHaveBeenCalledWith('sem-senha', false);
    await waitFor(() => expect(mocks.sucesso).toHaveBeenCalledWith(expect.stringContaining('Link de definição de senha enviado')));
    // Conta ativa continua sem qualquer ação de envio.
    const ativa = screen.getByRole('cell', { name: 'Gestora' }).closest('tr')!;
    expect(within(ativa).queryByRole('button', { name: /Enviar link|Reenviar/ })).not.toBeInTheDocument();
  });

  it('convite com resultado incerto: o diálogo alerta para conferir o histórico e envia a confirmação', async () => {
    render(<UsuariosPage />);
    await screen.findByRole('cell', { name: 'Pessoa Incerta' });
    fireEvent.click(screen.getByRole('button', { name: 'Reenviar convite para Pessoa Incerta' }));
    const dialogo = await screen.findByRole('alertdialog');
    expect(dialogo).toHaveTextContent(/resultado incerto/i);
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Reenviar mesmo assim' }));
    await waitFor(() => expect(mocks.reenviarConvite).toHaveBeenCalledWith('pend-2', true));
  });
});
