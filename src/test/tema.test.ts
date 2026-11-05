import { describe, expect, it } from 'vitest';
import { empresaDaRota, empresaDoPerfil, resolverTema, temaDaEmpresa } from '../lib/tema';

describe('temaDaEmpresa', () => {
  it('usa o tema da empresa única e o conjunto nas demais visões', () => {
    expect(temaDaEmpresa('Alinare')).toBe('alinare');
    expect(temaDaEmpresa('Novitah')).toBe('novitah');
    expect(temaDaEmpresa('Ambas')).toBe('conjunto');
    expect(temaDaEmpresa(null)).toBe('conjunto');
    expect(temaDaEmpresa('qualquer')).toBe('conjunto');
  });
});

describe('empresaDaRota', () => {
  it('reconhece o formulário da empresa e a query empresa', () => {
    expect(empresaDaRota('/admin/alinare', '')).toBe('Alinare');
    expect(empresaDaRota('/admin/novitah', '?nc=1')).toBe('Novitah');
    expect(empresaDaRota('/admin/lista', '?empresa=Novitah')).toBe('Novitah');
    expect(empresaDaRota('/admin/dashboard', '')).toBeNull();
  });
});

describe('resolverTema', () => {
  it('segue a rota quando a tela não declara seleção', () => {
    expect(resolverTema('/login', '')).toBe('conjunto');
    expect(resolverTema('/admin/dashboard', '?empresa=Alinare')).toBe('alinare');
  });

  it('dá prioridade à empresa exibida no filtro da tela, inclusive "Ambas"', () => {
    expect(resolverTema('/admin/etiquetas', '', 'Novitah')).toBe('novitah');
    expect(resolverTema('/admin/dashboard', '?empresa=Alinare', 'Ambas')).toBe('conjunto');
    expect(resolverTema('/admin/aprovacoes', '', null)).toBe('conjunto');
  });
});

describe('empresaDoPerfil', () => {
  it('só considera perfis de uma única empresa (lista vazia = todas)', () => {
    expect(empresaDoPerfil(['Novitah'])).toBe('Novitah');
    expect(empresaDoPerfil(['Alinare', 'Novitah'])).toBeNull();
    expect(empresaDoPerfil([])).toBeNull();
    expect(empresaDoPerfil(undefined)).toBeNull();
  });

  it('é o último recurso: tela e rota têm prioridade', () => {
    expect(resolverTema('/admin/meus-pedidos', '', undefined, 'Alinare')).toBe('alinare');
    expect(resolverTema('/admin/lista', '?empresa=Novitah', undefined, 'Alinare')).toBe('novitah');
    expect(resolverTema('/admin/etiquetas', '', 'Ambas', 'Alinare')).toBe('conjunto');
  });
});
