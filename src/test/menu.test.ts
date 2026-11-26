import { describe, expect, it } from 'vitest';
import { BarChart3, ClipboardList, FileText, ShieldAlert, Users } from 'lucide-react';
import type { NavItem } from '../lib/perfil';
import { agruparMenu, estaAtivo, moduloAberto } from '../lib/menu';
import { iniciais } from '../lib/iniciais';
import { marcaDoTema, temaDoModo } from '../lib/tema';

const item = (to: string, label: string, icon = FileText): NavItem => ({ to, label, icon });
const DASHBOARD = item('/admin/dashboard', 'Dashboard', BarChart3);
const LISTA = item('/admin/lista', 'Pedidos', ClipboardList);
const FORM = item('/admin/alinare', 'Novo pedido Alinare');
const NC = item('/admin/nc', 'Não conformidades', ShieldAlert);
const NC_PAINEL = item('/admin/nc/painel', 'Painel de NC');
const NC_LISTAS = item('/admin/nc/listas', 'Listas de NC');
const USUARIOS = item('/admin/usuarios', 'Usuários', Users);

describe('agruparMenu', () => {
  it('agrupa por seção, na ordem do menu, e omite seções vazias', () => {
    const grupos = agruparMenu([USUARIOS, LISTA, DASHBOARD, FORM]);
    expect(grupos.map((g) => g.titulo)).toEqual(['Visão geral', 'Solicitar', 'Acompanhar', 'Administração']);
    expect(grupos[1].nos.map((n) => n.item.label)).toEqual(['Novo pedido Alinare']);
  });

  it('as páginas de NC viram submenu do módulo, não itens soltos', () => {
    const [qualidade] = agruparMenu([NC, NC_PAINEL, NC_LISTAS]);
    expect(qualidade.titulo).toBe('Qualidade');
    expect(qualidade.nos).toHaveLength(1);
    expect(qualidade.nos[0].filhos.map((f) => f.label)).toEqual(['Painel de NC', 'Listas de NC']);
  });

  it('sem o módulo-pai, as páginas de NC não somem: ficam como itens próprios', () => {
    const todos = agruparMenu([NC_PAINEL]).flatMap((g) => g.nos.map((n) => n.item.to));
    expect(todos).toEqual(['/admin/nc/painel']);
  });

  it('destino desconhecido vai para "Outros": nenhuma tela autorizada fica sem acesso', () => {
    const grupos = agruparMenu([item('/admin/nova-tela', 'Nova tela')]);
    expect(grupos).toHaveLength(1);
    expect(grupos[0].titulo).toBe('Outros');
  });
});

describe('estaAtivo e moduloAberto', () => {
  it('rota exata; a query de empresa separa itens da mesma rota', () => {
    expect(estaAtivo('/admin/lista', '/admin/lista', '')).toBe(true);
    expect(estaAtivo('/admin/lista', '/admin/dashboard', '')).toBe(false);
    expect(estaAtivo('/admin/dashboard?empresa=Alinare', '/admin/dashboard', '?empresa=Alinare')).toBe(true);
    expect(estaAtivo('/admin/dashboard?empresa=Alinare', '/admin/dashboard', '?empresa=Novitah')).toBe(false);
    expect(estaAtivo('/admin/dashboard', '/admin/dashboard', '?empresa=Alinare')).toBe(false);
  });

  it('parâmetros que não são de empresa não desligam o item (ex.: ?nc= no formulário)', () => {
    expect(estaAtivo('/admin/alinare', '/admin/alinare', '?nc=123')).toBe(true);
  });

  it('o cadastro e a ficha de NC mantêm "Não conformidades" ativo, mas não o painel nem as listas', () => {
    expect(estaAtivo('/admin/nc', '/admin/nc/nova', '')).toBe(true);
    expect(estaAtivo('/admin/nc', '/admin/nc/abc-123', '')).toBe(true);
    expect(estaAtivo('/admin/nc', '/admin/nc/painel', '')).toBe(false);
    expect(estaAtivo('/admin/nc', '/admin/nc/listas', '')).toBe(false);
  });

  it('o módulo com submenu fica aberto em qualquer uma de suas páginas', () => {
    const [qualidade] = agruparMenu([NC, NC_PAINEL, NC_LISTAS]);
    expect(moduloAberto(qualidade.nos[0], '/admin/nc/painel')).toBe(true);
    expect(moduloAberto(qualidade.nos[0], '/admin/nc')).toBe(true);
    expect(moduloAberto(qualidade.nos[0], '/admin/lista')).toBe(false);
    const [semFilhos] = agruparMenu([LISTA]);
    expect(moduloAberto(semFilhos.nos[0], '/admin/lista')).toBe(false);
  });
});

describe('marca, tema e iniciais', () => {
  it('a visão conjunta é a AZIME; as empresas mantêm a própria marca', () => {
    expect(marcaDoTema('conjunto')).toBe('azime');
    expect(marcaDoTema('alinare')).toBe('alinare');
    expect(marcaDoTema('novitah')).toBe('novitah');
  });

  it('o modo escolhido pelo usuário vira o tema dos tokens', () => {
    expect(temaDoModo('claro')).toBe('light');
    expect(temaDoModo('escuro')).toBe('dark');
  });

  it('iniciais: até duas letras, maiúsculas, e nunca vazio', () => {
    expect(iniciais('Marina Costa')).toBe('MC');
    expect(iniciais('  ana   maria   souza ')).toBe('AM');
    expect(iniciais('Camila')).toBe('C');
    expect(iniciais('')).toBe('?');
    expect(iniciais(null)).toBe('?');
  });
});
