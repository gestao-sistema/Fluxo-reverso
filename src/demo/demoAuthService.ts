import type { ConvidarUsuarioPayload, CreateUsuarioPayload, EscopoAprovacaoUsuario, ResultadoConvite, UpdateUsuarioPayload, Usuario } from '../types';
import { normalizarAcesso } from '../lib/acesso';
import { normalizarEmailCorporativo } from '../lib/emailCorporativo';
import { demoDados } from './demoDatabase';
import { usuarioDemoAtual } from './demoMode';

/** Mesma gravação do cadastro real: escopo de aprovação na mesma configuração por empresa e setor. */
function gravarEscopoDeAprovacao(usuarioId: string, escopo: EscopoAprovacaoUsuario[]): void {
  const restantes = demoDados.configAprovadores().filter((item) => item.usuario_id !== usuarioId);
  demoDados.salvarConfigAprovadores([
    ...restantes,
    ...escopo.map((item) => ({ empresa: item.empresa, usuario_id: usuarioId, todos_setores: item.todos_setores, setores: [...item.setores] })),
  ]);
}

const escopoDoUsuario = (usuarioId: string): EscopoAprovacaoUsuario[] => demoDados.configAprovadores()
  .filter((item) => item.usuario_id === usuarioId)
  .map((item) => ({ empresa: item.empresa, todos_setores: item.todos_setores, setores: [...item.setores] }));

const demoAuthService = {
  async listarNomesUsuarios(): Promise<string[]> {
    return demoDados.usuarios().map((item) => item.nome).sort((a, b) => a.localeCompare(b));
  },
  async listarUsuarios(): Promise<Usuario[]> {
    return demoDados.usuarios().sort((a, b) => a.nome.localeCompare(b.nome));
  },
  async criarUsuario(data: CreateUsuarioPayload): Promise<Usuario> {
    const { senha: _senha, aprovacao, ...usuario } = data;
    // Valida o cadastro inteiro antes de criar, como a Edge Function admin-usuarios.
    const acesso = normalizarAcesso({
      perfilAcesso: data.perfilAcesso, empresasAcesso: data.empresasAcesso, telas: data.telas, aprovacao,
    });
    const criado: Usuario = {
      ...usuario,
      id: `demo-usuario-${crypto.randomUUID()}`,
      perfilAcesso: acesso.perfilAcesso as Usuario['perfilAcesso'],
      empresasAcesso: acesso.empresasAcesso as Usuario['empresasAcesso'],
      telas: acesso.telas as Usuario['telas'],
    };
    demoDados.salvarUsuarios([criado, ...demoDados.usuarios()]);
    gravarEscopoDeAprovacao(criado.id, acesso.aprovacao as EscopoAprovacaoUsuario[]);
    return criado;
  },
  async atualizarUsuario(id: string, data: UpdateUsuarioPayload): Promise<Usuario> {
    const usuarios = demoDados.usuarios();
    const indice = usuarios.findIndex((item) => item.id === id);
    if (indice < 0) throw new Error('Usuário de demonstração não encontrado.');
    const { senha: _senha, aprovacao, ...campos } = data;
    const atual = usuarios[indice];
    const mudaAcesso = data.telas !== undefined || data.perfilAcesso !== undefined
      || data.empresasAcesso !== undefined || aprovacao !== undefined;
    if (mudaAcesso) {
      const acesso = normalizarAcesso({
        perfilAcesso: data.perfilAcesso ?? atual.perfilAcesso ?? 'personalizado',
        empresasAcesso: data.empresasAcesso ?? atual.empresasAcesso ?? [],
        telas: data.telas ?? atual.telas,
        aprovacao,
        telasAtuais: atual.telas,
        aprovacaoAtual: escopoDoUsuario(id),
      });
      // Quem se edita não pode se trancar para fora da gestão de usuários.
      if (usuarioDemoAtual().id === id && atual.telas.includes('usuarios') && !acesso.telas.includes('usuarios')) {
        throw new Error('Não é possível remover a própria gestão de usuários.');
      }
      usuarios[indice] = {
        ...atual,
        ...campos,
        perfilAcesso: acesso.perfilAcesso as Usuario['perfilAcesso'],
        empresasAcesso: acesso.empresasAcesso as Usuario['empresasAcesso'],
        telas: acesso.telas as Usuario['telas'],
      };
      demoDados.salvarUsuarios(usuarios);
      gravarEscopoDeAprovacao(id, acesso.aprovacao as EscopoAprovacaoUsuario[]);
      return usuarios[indice];
    }
    usuarios[indice] = { ...atual, ...campos };
    demoDados.salvarUsuarios(usuarios);
    return usuarios[indice];
  },
  async removerUsuario(id: string): Promise<void> {
    demoDados.removerUsuario(id);
    gravarEscopoDeAprovacao(id, []);
  },
  /** Demonstração: valida como o backend, salva o cadastro como convite pendente e NÃO envia nada. */
  async convidarUsuario(data: ConvidarUsuarioPayload): Promise<ResultadoConvite> {
    const email = normalizarEmailCorporativo(data.email);
    const acesso = normalizarAcesso({
      perfilAcesso: data.perfilAcesso, empresasAcesso: data.empresasAcesso, telas: data.telas, aprovacao: data.aprovacao,
    });
    const usuarios = demoDados.usuarios();
    const existente = usuarios.find((item) => item.usuario === email);
    if (existente && existente.situacao !== 'convite_pendente') {
      throw new Error('Já existe um usuário ativo com este e-mail. Convite não é enviado a conta ativa; recuperação de senha é outro fluxo.');
    }
    const pendente: Usuario = {
      id: existente?.id ?? `demo-usuario-${crypto.randomUUID()}`,
      nome: data.nome.trim(),
      usuario: email,
      perfilAcesso: acesso.perfilAcesso as Usuario['perfilAcesso'],
      empresasAcesso: acesso.empresasAcesso as Usuario['empresasAcesso'],
      telas: acesso.telas as Usuario['telas'],
      situacao: 'convite_pendente',
      convite: { estado: 'preparado', tentativas: 0, concluidoEm: null },
    };
    demoDados.salvarUsuarios([pendente, ...usuarios.filter((item) => item.id !== pendente.id)]);
    gravarEscopoDeAprovacao(pendente.id, acesso.aprovacao as EscopoAprovacaoUsuario[]);
    return { usuario_id: pendente.id, email, estado: 'preparado', conta_criada: !existente, envio_habilitado: false, link: 'convite' };
  },
  async reenviarConvite(id: string): Promise<ResultadoConvite> {
    const alvo = demoDados.usuarios().find((item) => item.id === id);
    if (!alvo) throw new Error('Usuário de demonstração não encontrado.');
    return {
      usuario_id: id, email: alvo.usuario, estado: 'preparado', conta_criada: false, envio_habilitado: false,
      link: alvo.situacao === 'senha_nao_definida' ? 'definicao_senha' : 'convite',
    };
  },
  async validarConvite(): Promise<{ usuarioId: string }> {
    throw new Error('Convites não estão disponíveis na demonstração.');
  },
  async sessaoDeConvitePendente(): Promise<null> {
    return null;
  },
  async definirSenhaDoConvite(): Promise<void> {
    throw new Error('Convites não estão disponíveis na demonstração.');
  },
};

export default demoAuthService;
