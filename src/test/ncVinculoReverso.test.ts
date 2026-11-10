import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { itensClassificacaoVinculada, textoClassificacaoVinculada } from '../lib/ncVinculoReverso';

const ler = (caminho: string) => readFileSync(fileURLToPath(new URL(caminho, import.meta.url)), 'utf8');
const MIGRACAO = ler('../../supabase/migrations/20261109130000_fila_aprovacao_classificacao_nc.sql');
const MIGRACAO_ANTERIOR = ler('../../supabase/migrations/20261030120000_lixeira_chamados.sql');

describe('texto da classificação da NC vinculada', () => {
  it('registro novo: tipo do problema e origem / causador aparecem separados, sem origem antiga', () => {
    const nc = { tipo_problema: 'Endereço incorreto', causador: 'Comercial', origem: null };
    expect(itensClassificacaoVinculada(nc)).toEqual([
      { rotulo: 'Tipo do problema', valor: 'Endereço incorreto' },
      { rotulo: 'Origem / causador', valor: 'Comercial' },
    ]);
    expect(textoClassificacaoVinculada(nc)).toBe('Tipo do problema: Endereço incorreto · Origem / causador: Comercial');
  });

  it('registro antigo: mantém a origem histórica e não inventa tipo nem causador', () => {
    const nc = { tipo_problema: null, causador: null, origem: 'Erro de separação' };
    expect(itensClassificacaoVinculada(nc)).toEqual([{ rotulo: 'Origem antiga', valor: 'Erro de separação' }]);
    expect(textoClassificacaoVinculada(nc)).toBe('Origem antiga: Erro de separação');
  });

  it('NC com origem antiga e classificação nova: mostra as duas, com a origem antiga por último', () => {
    const nc = { tipo_problema: 'Extravio', causador: 'Correios', origem: 'Extravio Correios' };
    expect(textoClassificacaoVinculada(nc)).toBe(
      'Tipo do problema: Extravio · Origem / causador: Correios · Origem antiga: Extravio Correios'
    );
  });

  it('sem nenhum dado: diz que a classificação não foi informada', () => {
    expect(textoClassificacaoVinculada({ tipo_problema: null, causador: null, origem: null })).toBe('Classificação: não informada');
  });
});

describe('migração da fila de aprovação', () => {
  const colunas = (sql: string) =>
    (sql.match(/fila_aprovacao_reversas\(\)\s*returns table \(([\s\S]*?)\)\s*language/)?.[1] ?? '')
      .split(',')
      .map((linha) => linha.trim())
      .filter(Boolean);

  it('mantém as colunas anteriores, na mesma ordem, e acrescenta tipo do problema e causador no fim', () => {
    const antes = colunas(MIGRACAO_ANTERIOR);
    const depois = colunas(MIGRACAO);
    expect(antes.length).toBeGreaterThan(0);
    expect(depois.slice(0, antes.length)).toEqual(antes);
    expect(depois.slice(antes.length)).toEqual(['nc_tipo_problema text', 'nc_causador text']);
  });

  it('recria a função e refaz os privilégios: anon e public sem execução, authenticated e service_role com execução', () => {
    expect(MIGRACAO).toMatch(/drop function if exists public\.fila_aprovacao_reversas\(\);/);
    expect(MIGRACAO).toMatch(/revoke execute on function public\.fila_aprovacao_reversas\(\) from public, anon;/);
    expect(MIGRACAO).toMatch(/grant execute on function public\.fila_aprovacao_reversas\(\) to authenticated, service_role;/);
    expect(MIGRACAO).toMatch(/security definer\r?\nset search_path = ''/);
  });

  it('mantém a regra de aprovação e o vínculo pela NC de cada reversa', () => {
    expect(MIGRACAO).toContain('public.usuario_pode_aprovar_reversa(r.empresa, r.setor)');
    expect(MIGRACAO).toContain('left join public.nao_conformidades nc on nc.id = r.nc_id');
    expect(MIGRACAO).toContain('nc.tipo_problema, nc.causador');
  });
});