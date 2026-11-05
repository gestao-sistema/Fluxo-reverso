import { describe, it, expect } from 'vitest';
import { USUARIOS_DEMO } from '../demo/demoMode';
import {
  homeDoUsuario,
  navItemsDoUsuario,
  podeAbrirFormulario,
  podeAprovarReversa,
  podeEditarNc,
  podeEmitirEtiqueta,
  podeOperarReversa,
  podeSolicitarReversa,
  podeVerNc,
  telaDaRota,
} from '../lib/perfil';
import type { UsuarioAutenticado, Tela } from '../types';

function usuario(telas: Tela[]): UsuarioAutenticado {
  return { id: '1', nome: 'User', usuario: 'user', telas };
}

describe('homeDoUsuario', () => {
  it('admin (com tela usuarios) → /admin/dashboard', () => {
    expect(homeDoUsuario(usuario(['usuarios', 'dashboard-geral']))).toBe('/admin/dashboard');
  });
  it('dashboard-alinare → dashboard com query', () => {
    expect(homeDoUsuario(usuario(['dashboard-alinare']))).toBe('/admin/dashboard?empresa=Alinare');
  });
  it('dashboard-novitah → dashboard com query', () => {
    expect(homeDoUsuario(usuario(['dashboard-novitah']))).toBe('/admin/dashboard?empresa=Novitah');
  });
  it('só formulario-alinare → /admin/alinare', () => {
    expect(homeDoUsuario(usuario(['formulario-alinare']))).toBe('/admin/alinare');
  });
  it('só lista-geral → /admin/lista', () => {
    expect(homeDoUsuario(usuario(['lista-geral']))).toBe('/admin/lista');
  });
  it('kanban e check-in não têm página própria: sozinhos não levam a lugar nenhum', () => {
    expect(homeDoUsuario(usuario(['kanban']))).toBe('/sem-acesso');
    expect(homeDoUsuario(usuario(['kanban-edit']))).toBe('/sem-acesso');
    expect(homeDoUsuario(usuario(['confirmar-checkin']))).toBe('/sem-acesso');
  });
  it('expedição vai direto para Operações (fila de etiquetas)', () => {
    expect(homeDoUsuario(usuario(['emitir-etiqueta']))).toBe('/admin/etiquetas');
  });
  it('sem nenhuma tela → /sem-acesso', () => {
    expect(homeDoUsuario(usuario([]))).toBe('/sem-acesso');
  });
  it('só não conformidades → /admin/nc', () => {
    expect(homeDoUsuario(usuario(['nc']))).toBe('/admin/nc');
    expect(homeDoUsuario(usuario(['nc-edit']))).toBe('/admin/nc');
  });
});

describe('permissões de NC e reversa', () => {
  it('nc consulta, nc-edit consulta e edita', () => {
    expect(podeVerNc(usuario(['nc']))).toBe(true);
    expect(podeEditarNc(usuario(['nc']))).toBe(false);
    expect(podeVerNc(usuario(['nc-edit']))).toBe(true);
    expect(podeEditarNc(usuario(['nc-edit']))).toBe(true);
    expect(podeVerNc(usuario(['formulario-alinare']))).toBe(false);
  });

  it('gestão de usuários não consulta NC nem opera; só o perfil mestre explícito tem acesso total', () => {
    const gestao = usuario(['usuarios']);
    expect(podeVerNc(gestao) || podeEditarNc(gestao)).toBe(false);
    expect(podeOperarReversa(gestao, 'Alinare') || podeOperarReversa(gestao, 'Novitah')).toBe(false);
    const mestre = { ...usuario(['usuarios']), perfilAcesso: 'mestre' as const };
    expect(podeVerNc(mestre) && podeEditarNc(mestre)).toBe(true);
    expect(podeOperarReversa(mestre, 'Alinare') && podeOperarReversa(mestre, 'Novitah')).toBe(true);
  });

  it('formulário abre pela tela da empresa ou por nc-edit', () => {
    expect(podeAbrirFormulario(usuario(['formulario-alinare']), 'Alinare')).toBe(true);
    expect(podeAbrirFormulario(usuario(['formulario-alinare']), 'Novitah')).toBe(false);
    expect(podeAbrirFormulario(usuario(['nc-edit']), 'Novitah')).toBe(true);
  });

  it('Meus Pedidos fica restrito a quem pode solicitar', () => {
    expect(podeSolicitarReversa(usuario(['formulario-alinare']))).toBe(true);
    expect(podeSolicitarReversa(usuario(['nc-edit']))).toBe(true);
    expect(podeSolicitarReversa(usuario(['aprovar-reversa']))).toBe(false);
    expect(podeSolicitarReversa(usuario(['lista-geral']))).toBe(false);
  });

  it('só quem aprova, emite ou confirma postagem na empresa movimenta reversa (etiqueta, rastreio, anotações)', () => {
    expect(podeOperarReversa(usuario(['lista-geral']), 'Novitah')).toBe(false);
    expect(podeOperarReversa(usuario(['kanban-edit']), 'Alinare')).toBe(false);
    expect(podeOperarReversa(usuario(['formulario-alinare', 'nc-edit']), 'Alinare')).toBe(false);
    // Sem empresa marcada no cadastro não há acesso: a lista vazia não vira "todas".
    expect(podeOperarReversa(usuario(['emitir-etiqueta']), 'Alinare')).toBe(false);
    expect(podeOperarReversa({ ...usuario(['emitir-etiqueta']), empresasAcesso: ['Alinare'] }, 'Alinare')).toBe(true);
  });

  it('operar vale só nas empresas marcadas no cadastro, mesmo com a lista da outra empresa', () => {
    const emissora = { ...usuario(['emitir-etiqueta', 'lista-novitah']), empresasAcesso: ['Alinare' as const] };
    expect(podeOperarReversa(emissora, 'Alinare')).toBe(true);
    expect(podeOperarReversa(emissora, 'Novitah')).toBe(false);
  });

  it('aprovar exige a tela e a empresa marcada; gestão de usuários e lista vazia de empresas não bastam', () => {
    expect(podeAprovarReversa({ ...usuario(['aprovar-reversa']), empresasAcesso: ['Alinare'] }, 'Alinare')).toBe(true);
    expect(podeAprovarReversa({ ...usuario(['aprovar-reversa']), empresasAcesso: ['Alinare'] }, 'Novitah')).toBe(false);
    expect(podeAprovarReversa(usuario(['aprovar-reversa']), 'Alinare')).toBe(false);
    expect(podeAprovarReversa({ ...usuario(['usuarios']), empresasAcesso: ['Alinare', 'Novitah'] }, 'Alinare')).toBe(false);
  });

  it('emissão exige a capacidade e a empresa explicitamente autorizada', () => {
    expect(podeEmitirEtiqueta({ ...usuario(['emitir-etiqueta']), empresasAcesso: ['Alinare'] }, 'Alinare')).toBe(true);
    expect(podeEmitirEtiqueta({ ...usuario(['emitir-etiqueta']), empresasAcesso: ['Alinare'] }, 'Novitah')).toBe(false);
    expect(podeEmitirEtiqueta(usuario(['usuarios']), 'Alinare')).toBe(false);
  });

  it('rotas de NC ativam a tela nc', () => {
    expect(telaDaRota('/admin/nc', '')).toBe('nc');
    expect(telaDaRota('/admin/nc/3f2b9d0e', '')).toBe('nc');
    expect(telaDaRota('/admin/nc/painel', '')).toBe('nc');
  });
});

describe('navItemsDoUsuario', () => {
  it('gestão de usuários sozinha mostra só Usuários e Comunicações: nenhuma outra tela é aberta por ela', () => {
    expect(navItemsDoUsuario(usuario(['usuarios'])).map((i) => i.to)).toEqual(['/admin/usuarios', '/admin/comunicacoes']);
    expect(homeDoUsuario(usuario(['usuarios']))).toBe('/admin/usuarios');
  });

  it('quem tem todas as telas vê um item por tela, sem repetir dashboard e pedidos por empresa', () => {
    const items = navItemsDoUsuario(usuario(['usuarios', 'dashboard-geral', 'dashboard-alinare', 'dashboard-novitah', 'lista-geral', 'lista-alinare', 'lista-novitah', 'formulario-alinare', 'formulario-novitah', 'aprovar-reversa', 'emitir-etiqueta', 'nc-edit']));
    expect(items.length).toBe(12);
    expect(items.map(i => i.to)).toEqual([
      '/admin/dashboard',
      '/admin/lista',
      '/admin/alinare',
      '/admin/novitah',
      '/admin/aprovacoes',
      '/admin/etiquetas',
      '/admin/nc',
      '/admin/nc/painel',
      '/admin/nc/listas',
      '/admin/usuarios',
      '/admin/comunicacoes',
      '/admin/meus-pedidos',
    ]);
    items.forEach(i => expect(i.icon).toBeTruthy());
  });

  it('nc-edit vê não conformidades e o painel, mas não as listas (admin)', () => {
    const items = navItemsDoUsuario(usuario(['nc-edit']));
    expect(items.map(i => i.to)).toEqual(['/admin/nc', '/admin/nc/painel', '/admin/meus-pedidos']);
  });

  it('user com telas parciais vê apenas as autorizadas', () => {
    const items = navItemsDoUsuario(usuario(['dashboard-alinare', 'formulario-alinare', 'kanban']));
    expect(items.map(i => i.to)).toEqual([
      '/admin/dashboard?empresa=Alinare',
      '/admin/alinare',
      '/admin/meus-pedidos',
    ]);
  });

  it('user sem tela usuarios não vê item de usuários nem de comunicações', () => {
    const items = navItemsDoUsuario(usuario(['dashboard-geral', 'lista-geral']));
    expect(items.map(i => i.to)).not.toContain('/admin/usuarios');
    expect(items.map(i => i.to)).not.toContain('/admin/comunicacoes');
  });

  it('não há menu de relatórios, kanban nem check-in para nenhum perfil', () => {
    const todas: Tela[] = ['dashboard-geral', 'lista-geral', 'kanban', 'kanban-edit', 'aprovar-reversa', 'emitir-etiqueta', 'confirmar-checkin', 'formulario-alinare'];
    for (const telas of [todas, ['usuarios'] as Tela[]]) {
      const destinos = navItemsDoUsuario(usuario(telas)).map(i => i.to);
      for (const aposentada of ['/admin/relatorios', '/admin/kanban', '/admin/checkin']) expect(destinos).not.toContain(aposentada);
    }
  });

  it('menus por grupo de acesso (perfis de teste): poucas telas por pessoa, sem duplicar funções', () => {
    const menu = (id: string) => navItemsDoUsuario(USUARIOS_DEMO.find((u) => u.id === id)!).map((i) => i.label).sort();
    // Comercial: Nova solicitação | Meus pedidos
    expect(menu('demo-solicitante-alinare')).toEqual(['Meus Pedidos', 'Novo pedido Alinare']);
    expect(menu('demo-solicitante-novitah')).toEqual(['Meus Pedidos', 'Novo pedido Novitah']);
    // Aprovação: Aprovações | Pedidos
    expect(menu('demo-aprovador')).toEqual(['Aprovações', 'Pedidos']);
    expect(menu('demo-aprovador-alinare')).toEqual(['Aprovações', 'Pedidos']);
    expect(menu('demo-aprovador-novitah')).toEqual(['Aprovações', 'Pedidos']);
    // Expedição: Operações | Pedidos (o andamento dos Correios é automático, dentro do pedido)
    expect(menu('demo-etiquetas')).toEqual(['Operações', 'Pedidos']);
    expect(menu('demo-expedicao-novitah')).toEqual(['Operações', 'Pedidos']);
    expect(menu('demo-expedicao-alinare')).toEqual(['Operações', 'Pedidos']);
    // Gerência: Nova solicitação | Pedidos (| Aprovações só se também aprova)
    expect(menu('demo-expedicao')).toEqual(['Dashboard', 'Meus Pedidos', 'Novo pedido Alinare', 'Novo pedido Novitah', 'Pedidos']);
    expect(menu('demo-gerente-aprovadora')).toContain('Aprovações');
    expect(menu('demo-expedicao')).not.toContain('Aprovações');
    // TI: tudo
    expect(menu('demo-mestre')).toEqual(expect.arrayContaining(['Pedidos', 'Aprovações', 'Operações', 'Usuários', 'Comunicações']));
  });

  it('todos os itens retornam icon definido e label não vazio', () => {
    const telas: Tela[] = ['dashboard-geral', 'lista-alinare', 'formulario-novitah'];
    navItemsDoUsuario(usuario(telas)).forEach(item => {
      expect(item.icon).toBeTruthy();
      expect(typeof item.label).toBe('string');
      expect(item.label.length).toBeGreaterThan(0);
    });
  });
});
