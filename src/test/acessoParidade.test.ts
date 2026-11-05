import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import * as edge from '../../supabase/functions/admin-usuarios/acesso';
import * as front from '../lib/acesso';

// A Edge Function admin-usuarios (Deno) e o front-end aplicam a mesma regra de cadastro. Como o Deno
// não importa de src/, o bloco de regras é copiado; estes testes impedem que as duas cópias divirjam
// e conferem que a função publicada usa as RPCs que a migration define.

const ler = (caminho: string) => readFileSync(caminho, 'utf8').replace(/\r\n/g, '\n');
const bloco = (texto: string) => {
  const inicio = texto.indexOf('// >>> regras compartilhadas');
  const fim = texto.indexOf('// <<< regras compartilhadas');
  expect(inicio, 'marcador inicial').toBeGreaterThanOrEqual(0);
  expect(fim, 'marcador final').toBeGreaterThan(inicio);
  return texto.slice(inicio, fim);
};

describe('regras de cadastro: Edge Function × front-end', () => {
  it('o bloco de regras é textualmente idêntico nas duas cópias', () => {
    expect(bloco(ler('src/lib/acesso.ts'))).toBe(bloco(ler('supabase/functions/admin-usuarios/acesso.ts')));
  });

  it('as mesmas entradas dão o mesmo resultado (ou o mesmo erro)', () => {
    const casos = [
      { perfilAcesso: 'mestre' },
      { perfilAcesso: 'solicitante', empresasAcesso: ['Alinare'] },
      { perfilAcesso: 'aprovador', empresasAcesso: ['Alinare', 'Novitah'] },
      { perfilAcesso: 'emissor_etiqueta', empresasAcesso: [] },
      { perfilAcesso: 'personalizado', telas: ['aprovar-reversa'], empresasAcesso: ['Alinare'], aprovacao: [{ empresa: 'Alinare', todos_setores: false, setores: ['Financeiro'] }] },
      { perfilAcesso: 'personalizado', telas: ['aprovar-reversa'], empresasAcesso: ['Alinare'] },
      { perfilAcesso: 'personalizado', telas: ['kanban-edit'], empresasAcesso: ['Alinare'] },
      { perfilAcesso: 'personalizado', telas: ['usuarios'] },
      { perfilAcesso: 'desconhecido', telas: ['dashboard-geral'] },
    ];
    const executar = (funcao: typeof front.normalizarAcesso) => (entrada: Parameters<typeof front.normalizarAcesso>[0]) => {
      try { return { ok: funcao(entrada) }; } catch (erro) { return { erro: (erro as Error).message }; }
    };
    for (const caso of casos) expect(executar(edge.normalizarAcesso)(caso)).toEqual(executar(front.normalizarAcesso)(caso));
  });

  it('as listas de telas coincidem', () => {
    expect([...edge.TELAS_OFICIAIS]).toEqual([...front.TELAS_OFICIAIS]);
    expect([...edge.TELAS_LEGADAS]).toEqual([...front.TELAS_LEGADAS]);
    expect([...edge.TELAS_COM_EMPRESAS]).toEqual([...front.TELAS_COM_EMPRESAS]);
  });

  it('administrador é a tela usuarios ou o perfil mestre, e nada mais', () => {
    expect(edge.ehAdmin({ telas: ['usuarios'] })).toBe(true);
    expect(edge.ehAdmin({ perfil_acesso: 'mestre', telas: [] })).toBe(true);
    expect(edge.ehAdmin({ perfil: 'ADMIN' })).toBe(true);
    expect(edge.ehAdmin({ telas: ['aprovar-reversa', 'emitir-etiqueta', 'dashboard-geral'] })).toBe(false);
    expect(edge.ehAdmin({})).toBe(false);
  });
});

describe('Edge Function admin-usuarios e migration do cadastro por tela', () => {
  const index = ler('supabase/functions/admin-usuarios/index.ts');
  const migration = ler('supabase/migrations/20261028100000_acesso_por_tela_cadastro.sql');

  it('valida antes de gravar, grava metadados e escopo e usa só RPCs de serviço definidas na migration', () => {
    expect(index).toContain("from './acesso.ts'");
    expect(index).toContain('normalizarAcesso(');
    for (const rpc of ['admin_salvar_escopo_aprovacao_usuario', 'admin_acesso_aprovacao_usuario']) {
      expect(index, rpc).toContain(`'${rpc}'`);
      expect(migration, rpc).toContain(`function public.${rpc}(`);
      expect(migration, rpc).toMatch(new RegExp(`grant execute on function public\\.${rpc}\\([^)]*\\) to service_role;`));
      expect(migration, rpc).toMatch(new RegExp(`revoke all on function public\\.${rpc}\\([^)]*\\) from public, anon, authenticated;`));
    }
  });

  it('o administrador é conferido pelo app_metadata do token validado, nunca por user_metadata', () => {
    expect(index).toContain('ehAdmin(caller.app_metadata ?? {})');
    expect(index).not.toMatch(/ehAdmin\([^)]*user_metadata/);
  });

  it('o app_metadata é gravado antes do escopo (o gatilho de avisos confere a capacidade) e desfeito se o escopo falhar', () => {
    const posUpdate = index.indexOf('updateUserById(id, updateData)');
    const posEscopo = index.indexOf("rpc('admin_salvar_escopo_aprovacao_usuario'", posUpdate);
    expect(posUpdate).toBeGreaterThan(0);
    expect(posEscopo).toBeGreaterThan(posUpdate);
    expect(index).toMatch(/Desfaz a primeira gravação/);
    expect(index).toMatch(/deleteUser\(data\.user\.id\)/);
  });

  it('não restam a lista antiga de telas, o bloqueio de perfil personalizado com usuarios nem a inferência de mestre', () => {
    expect(index).not.toContain('TELAS_VALIDAS');
    expect(index).not.toContain('telasDoPerfil');
    expect(index).not.toContain('Use o setor mestre');
    expect(index).not.toMatch(/telas\?\.includes\('usuarios'\) \? 'mestre'/);
  });

  it('a migration remove o atalho de administrador do escopo de consulta e operação, mas não de aprovar/emitir', () => {
    for (const funcao of ['empresas_permitidas', 'empresas_consulta_ampliada', 'empresas_formulario', 'empresas_operaveis', 'empresas_recebimento_manual', 'pode_ver_nc', 'pode_editar_nc']) {
      const inicio = migration.indexOf(`function public.${funcao}()`);
      expect(inicio, funcao).toBeGreaterThan(0);
      const corpo = migration.slice(inicio, migration.indexOf('$$;', migration.indexOf('as $$', inicio)));
      expect(corpo, funcao).not.toContain('is_admin()');
      expect(corpo, funcao).toContain('is_mestre()');
    }
    expect(migration).not.toMatch(/function public\.empresas_(aprovaveis|etiquetaveis|checkin)\(/);
  });
});
