import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, it } from 'vitest';
import { demoApi } from '../demo/demoApi';
import { demoDados } from '../demo/demoDatabase';
import demoNcService from '../demo/demoNcService';
import { iniciarDemo, selecionarUsuarioDemo } from '../demo/demoMode';
import { itensClassificacaoVinculada, textoClassificacaoVinculada } from '../lib/ncVinculoReverso';
import type { CreateSolicitacaoPayload, Empresa, NaoConformidade } from '../types';

const ler = (caminho: string) => readFileSync(fileURLToPath(new URL(caminho, import.meta.url)), 'utf8');
const MIGRACAO = ler('../../supabase/migrations/20261109130000_fila_aprovacao_classificacao_nc.sql');
const MIGRACAO_ANTERIOR = ler('../../supabase/migrations/20261030120000_lixeira_chamados.sql');

const ncDemo = (numero: number): NaoConformidade => demoDados.ncs().find((nc) => nc.numero === numero)!;

const payload = (empresa: Empresa, nome: string, ncId: string | null): CreateSolicitacaoPayload => ({
  empresa,
  data_solicitacao: '2026-11-09',
  solicitante: 'Camila Oliveira',
  setor: empresa === 'Alinare' ? 'Comercial Alinare' : 'Comercial Novitah',
  codigo_cliente: 7001,
  nome_cliente: nome,
  endereco_postagem: 'Rua A, 1',
  motivo: 'Peça com defeito',
  justificativa_outros: null,
  autorizacao: null,
  status: 'aguardando_aprovacao',
  tempo_preenchimento_segundos: 10,
  nc_id: ncId,
} as CreateSolicitacaoPayload);

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

describe('demonstração: a fila de aprovação usa os dados reais da NC vinculada', () => {
  beforeEach(() => {
    demoDados.resetar();
    localStorage.clear();
    iniciarDemo('demo-solicitante-alinare');
  });

  it('reversa da NC antiga (2403) traz a origem e a descrição da própria NC, sem valor fixo', async () => {
    selecionarUsuarioDemo('demo-aprovador-alinare');
    const nc = ncDemo(2403);
    const item = (await demoApi.getFilaAprovacao()).find((pedido) => pedido.nc_id === nc.id);
    expect(item).toMatchObject({
      nc_codigo: 'NC-2403',
      nc_origem: nc.origem,
      nc_tipo_problema: null,
      nc_causador: null,
      nc_descricao: nc.descricao,
    });
    expect(item?.nc_descricao).not.toBe('Divergência identificada na conferência do pedido.');
  });

  it('reversa da NC nova (2404) traz tipo do problema e causador, com o mesmo texto que o seletor mostra', async () => {
    selecionarUsuarioDemo('demo-solicitante-alinare');
    const pedido = await demoApi.createSolicitacao(payload('Alinare', 'Loja Nova Demonstração', ncDemo(2404).id));
    selecionarUsuarioDemo('demo-aprovador-alinare');
    const item = (await demoApi.getFilaAprovacao()).find((p) => p.id === pedido.id);
    expect(item).toMatchObject({ nc_codigo: 'NC-2404', nc_origem: null, nc_tipo_problema: 'Endereço incorreto', nc_causador: 'Comercial' });
    const opcao = (await demoNcService.opcoesParaReversa('Alinare')).find((o) => o.id === ncDemo(2404).id);
    expect(opcao).toBeDefined();
    expect(
      textoClassificacaoVinculada({ tipo_problema: item?.nc_tipo_problema, causador: item?.nc_causador, origem: item?.nc_origem })
    ).toBe(textoClassificacaoVinculada(opcao!));
  });

  it('empresa incorreta: o seletor da Alinare não oferece NC da Novitah, e a fila da Novitah só traz reversas da Novitah', async () => {
    const alinare = (await demoNcService.opcoesParaReversa('Alinare')).map((o) => o.numero);
    const novitah = (await demoNcService.opcoesParaReversa('Novitah')).map((o) => o.numero);
    expect(alinare).not.toContain(2402);
    expect(novitah).toEqual([2402]);
    selecionarUsuarioDemo('demo-aprovador-novitah');
    const filaNovitah = await demoApi.getFilaAprovacao();
    expect(filaNovitah.length).toBeGreaterThan(0);
    expect(filaNovitah.every((pedido) => pedido.empresa === 'Novitah')).toBe(true);
    expect(filaNovitah.some((pedido) => pedido.nc_id === ncDemo(2403).id)).toBe(false);
  });

  it('NC encerrada não é oferecida no seletor', async () => {
    expect((await demoNcService.opcoesParaReversa('Alinare')).map((o) => o.numero)).not.toContain(2401);
  });

  it('usuário sem acesso de aprovação não vê a fila', async () => {
    selecionarUsuarioDemo('demo-solicitante-alinare');
    expect(await demoApi.getFilaAprovacao()).toEqual([]);
  });

  it('reversa sem NC segue na fila, com os campos de NC nulos', async () => {
    selecionarUsuarioDemo('demo-solicitante-alinare');
    const pedido = await demoApi.createSolicitacao(payload('Alinare', 'Cliente sem NC', null));
    selecionarUsuarioDemo('demo-aprovador-alinare');
    const item = (await demoApi.getFilaAprovacao()).find((p) => p.id === pedido.id);
    expect(item).toMatchObject({
      nc_id: null,
      nc_codigo: null,
      nc_origem: null,
      nc_tipo_problema: null,
      nc_causador: null,
      nc_descricao: null,
    });
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
