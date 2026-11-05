import type { UsuarioAutenticado } from '../types';

const CHAVE_MODO = 'flowdesk:demo:ativo';
const CHAVE_USUARIO = 'flowdesk:demo:usuario';

/** O modo demonstração só existe no servidor local de desenvolvimento. */
export function demoDisponivel(): boolean {
  return import.meta.env.DEV;
}

export function demoAtivo(): boolean {
  if (!demoDisponivel()) return false;
  try {
    return window.localStorage.getItem(CHAVE_MODO) === '1';
  } catch {
    return false;
  }
}

/**
 * Quem a demonstração considera usuário de cada perfil. Por padrão são os perfis abaixo; o banco local da
 * demonstração (demoDatabase) registra uma fonte que aplica os cadastros editados nele, para o seletor, a
 * sessão, a configuração de aprovadores e os avisos usarem exatamente os mesmos usuários.
 */
let fonteUsuarios: (() => UsuarioDemo[]) | null = null;
export function definirFonteUsuariosDemo(fonte: (() => UsuarioDemo[]) | null): void {
  fonteUsuarios = fonte;
}
export function usuariosDemo(): UsuarioDemo[] {
  try {
    const lista = fonteUsuarios?.();
    if (lista?.length) return lista;
  } catch {
    // Falha ao ler o cadastro local: valem os perfis padrão
  }
  return USUARIOS_DEMO;
}

export function iniciarDemo(usuarioId = USUARIOS_DEMO[0].id): UsuarioAutenticado {
  window.localStorage.setItem(CHAVE_MODO, '1');
  return selecionarUsuarioDemo(usuarioId);
}

export function selecionarUsuarioDemo(usuarioId: string): UsuarioAutenticado {
  const usuarios = usuariosDemo();
  const usuario = usuarios.find((item) => item.id === usuarioId) ?? usuarios[0];
  window.localStorage.setItem(CHAVE_USUARIO, usuario.id);
  return usuario;
}

export function usuarioDemoAtual(): UsuarioAutenticado {
  try {
    const id = window.localStorage.getItem(CHAVE_USUARIO);
    const usuarios = usuariosDemo();
    return usuarios.find((item) => item.id === id) ?? usuarios[0];
  } catch {
    return USUARIOS_DEMO[0];
  }
}

export function encerrarDemo(): void {
  try {
    window.localStorage.removeItem(CHAVE_MODO);
    window.localStorage.removeItem(CHAVE_USUARIO);
  } catch {
    // O estado em memória ainda encerra o modo se o armazenamento estiver bloqueado.
  }
}

export interface UsuarioDemo extends UsuarioAutenticado {
  demoPerfil: string;
}

/**
 * Perfis de teste, um por grupo de acesso: Comercial, Aprovação, Expedição, Gerência e TI, mais
 * variantes de uma só empresa para conferir que ninguém enxerga o que não é seu. O menu de cada
 * um vem das telas abaixo (mesma regra do sistema real): Comercial = Novo pedido | Meus pedidos;
 * Aprovação = Aprovações | Pedidos; Expedição = Operações | Pedidos; Gerência = Novo pedido |
 * Pedidos (| Aprovações se também aprova); TI = tudo.
 */
export const USUARIOS_DEMO: UsuarioDemo[] = [
  {
    id: 'demo-solicitante-alinare', nome: 'Camila Oliveira', usuario: 'camila.alinare', demoPerfil: 'Comercial · Alinare',
    telas: ['formulario-alinare'], perfilAcesso: 'solicitante', empresasAcesso: ['Alinare'],
  },
  {
    id: 'demo-solicitante-novitah', nome: 'Rafael Mendes', usuario: 'rafael.novitah', demoPerfil: 'Comercial · Novitah',
    telas: ['formulario-novitah'], perfilAcesso: 'solicitante', empresasAcesso: ['Novitah'],
  },
  {
    id: 'demo-aprovador', nome: 'Paula Mendes', usuario: 'paula.aprovacao', demoPerfil: 'Aprovação · as duas empresas',
    telas: ['aprovar-reversa', 'lista-geral'], perfilAcesso: 'aprovador', empresasAcesso: ['Alinare', 'Novitah'],
  },
  {
    id: 'demo-aprovador-alinare', nome: 'Marcelo Antunes', usuario: 'marcelo.aprovacao', demoPerfil: 'Aprovação · só Alinare',
    telas: ['aprovar-reversa', 'lista-alinare'], perfilAcesso: 'aprovador', empresasAcesso: ['Alinare'],
  },
  {
    id: 'demo-aprovador-novitah', nome: 'Lúcia Ferraz', usuario: 'lucia.aprovacao', demoPerfil: 'Aprovação · só Novitah',
    telas: ['aprovar-reversa', 'lista-novitah'], perfilAcesso: 'aprovador', empresasAcesso: ['Novitah'],
  },
  {
    id: 'demo-etiquetas', nome: 'Bianca Rocha', usuario: 'bianca.etiquetas', demoPerfil: 'Expedição · as duas empresas',
    telas: ['emitir-etiqueta', 'lista-geral', 'confirmar-checkin'], perfilAcesso: 'emissor_etiqueta', empresasAcesso: ['Alinare', 'Novitah'],
  },
  {
    id: 'demo-expedicao-alinare', nome: 'Letícia Moraes', usuario: 'leticia.expedicao', demoPerfil: 'Expedição · só Alinare',
    telas: ['emitir-etiqueta', 'lista-alinare'], perfilAcesso: 'emissor_etiqueta', empresasAcesso: ['Alinare'],
  },
  {
    id: 'demo-expedicao-novitah', nome: 'Luciana Prado', usuario: 'luciana.expedicao', demoPerfil: 'Expedição · só Novitah',
    telas: ['emitir-etiqueta', 'lista-novitah'], perfilAcesso: 'emissor_etiqueta', empresasAcesso: ['Novitah'],
  },
  {
    id: 'demo-expedicao', nome: 'Viviane Duarte', usuario: 'viviane.gerencia', demoPerfil: 'Gerência',
    telas: ['dashboard-geral', 'lista-geral', 'formulario-alinare', 'formulario-novitah'], perfilAcesso: 'personalizado', empresasAcesso: ['Alinare', 'Novitah'],
  },
  {
    id: 'demo-gerente-aprovadora', nome: 'Joyce Almeida', usuario: 'joyce.gerencia', demoPerfil: 'Gerência · também aprova',
    telas: ['dashboard-geral', 'lista-geral', 'formulario-alinare', 'formulario-novitah', 'aprovar-reversa'], perfilAcesso: 'personalizado', empresasAcesso: ['Alinare', 'Novitah'],
  },
  {
    id: 'demo-mestre', nome: 'Marina Costa', usuario: 'marina.mestre', demoPerfil: 'TI · Administração',
    telas: ['dashboard-geral', 'lista-geral', 'kanban', 'kanban-edit', 'nc', 'nc-edit', 'aprovar-reversa', 'emitir-etiqueta', 'confirmar-checkin', 'usuarios', 'formulario-alinare', 'formulario-novitah'],
    perfilAcesso: 'mestre', empresasAcesso: ['Alinare', 'Novitah'],
  },
  {
    id: 'demo-qualidade', nome: 'Júlia Nascimento', usuario: 'julia.qualidade', demoPerfil: 'Qualidade · NCs',
    telas: ['nc', 'nc-edit'], perfilAcesso: 'personalizado', empresasAcesso: ['Alinare', 'Novitah'],
  },
];

