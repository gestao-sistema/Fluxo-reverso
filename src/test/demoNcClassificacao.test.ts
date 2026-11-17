import { beforeEach, describe, expect, it } from 'vitest';
import demoNcService from '../demo/demoNcService';
import { demoDados } from '../demo/demoDatabase';
import { iniciarDemo } from '../demo/demoMode';
import {
  MENSAGEM_CUSTO_NAO_COM_VALOR,
  MENSAGEM_OUTRO_SEM_DESCRICAO,
  MENSAGEM_SITUACAO_NAO_APAGA,
  MENSAGEM_TIPO_NAO_VOLTA,
  MENSAGEM_TIPO_OBRIGATORIO,
} from '../lib/ncClassificacao';
import type { NcGravacao } from '../types';

// A demonstração tem as mesmas regras de persistência do banco (20261109100000 e 20261109120000),
// para o formulário novo ser testado sem o Supabase.
const nova: NcGravacao = {
  data_ocorrencia: '2026-10-01', data_identificacao: null, empresa: 'Alinare', cliente: 'Cliente Demo', vendedora: null,
  romaneio: null, valor_romaneio: null, nf: null, rastreio: null, data_postagem: null, tipo_saida: 'Venda',
  origem: null, como_identificada: null, status_correios: null, descricao: 'Registro de teste', resolucao: null,
  novo_rastreio: null, valor_declarado: null, valor_venda: null, frete_original: null,
  custo_produto: null, custo_frete_adicional: null, custo_multa_outros: null, reembolso_correios: null,
  numero_pi: null, valor_reembolsado: null, tempo_tratativa_min: null, status: 'Aberta', data_encerramento: null,
  tipo_problema: 'Endereço incorreto', causador: 'Expedição',
};

beforeEach(() => {
  demoDados.resetar();
  localStorage.clear();
  iniciarDemo('demo-solicitante-alinare');
});

/** Edição como usuário com permissão de NC: a demonstração recusa quem não edita, e exige a versão. */
async function editar(id: string, campos: Partial<NcGravacao>, motivo?: string) {
  iniciarDemo('demo-qualidade');
  const versao = demoDados.ncs().find((item) => item.id === id)!.updated_at;
  return demoNcService.atualizar(id, campos, { versao, motivo });
}

describe('classificação na demonstração', () => {
  it('criar com origem antiga e sem classificação explícita recebe a classificação do mapeamento', async () => {
    const criada = await demoNcService.criar({ ...nova, tipo_problema: null, causador: null, origem: 'Extravio Correios' });
    expect(criada).toMatchObject({ tipo_problema: 'Extravio', causador: 'Correios', custo_situacao: 'Em apuração', classificacao_pendente: false });
  });

  it('registro novo sem tipo é recusado, mesmo com origem antiga sem mapeamento', async () => {
    await expect(demoNcService.criar({ ...nova, tipo_problema: null, origem: 'Erro de separação' })).rejects.toThrow(MENSAGEM_TIPO_OBRIGATORIO);
  });

  it('tipo fora da lista é recusado, como no banco', async () => {
    await expect(demoNcService.criar({ ...nova, tipo_problema: 'Inventado' })).rejects.toThrow('Tipo do problema fora da lista: Inventado');
  });

  it('"Outro" sem descrição é recusado', async () => {
    await expect(demoNcService.criar({ ...nova, tipo_problema: 'Outro', descricao: '' })).rejects.toThrow(MENSAGEM_OUTRO_SEM_DESCRICAO);
  });

  it('"Não" com custo registrado é recusado', async () => {
    await expect(demoNcService.criar({ ...nova, custo_situacao: 'Não', custo_produto: 10 })).rejects.toThrow(MENSAGEM_CUSTO_NAO_COM_VALOR);
  });

  it('mudar a situação apagando valor é recusado e a NC fica como estava', async () => {
    const criada = await demoNcService.criar({ ...nova, custo_produto: 10 });
    expect(criada.custo_situacao).toBe('Sim');
    await expect(editar(criada.id, { custo_situacao: 'Em apuração', custo_produto: null }, 'Ajuste de teste')).rejects.toThrow(
      MENSAGEM_SITUACAO_NAO_APAGA
    );
    expect(demoDados.ncs().find((item) => item.id === criada.id)?.custo_produto).toBe(10);
  });

  it('mudar só a situação mantém os valores; campo indefinido não altera nada', async () => {
    const criada = await demoNcService.criar({ ...nova, custo_produto: 10 });
    const { nc: atualizada } = await editar(criada.id, { custo_situacao: 'Em apuração', cliente: undefined }, 'Ajuste de teste');
    expect(atualizada).toMatchObject({ custo_situacao: 'Em apuração', custo_produto: 10, cliente: 'Cliente Demo' });
  });

  it('tipo já informado não pode ser apagado depois', async () => {
    const criada = await demoNcService.criar(nova);
    await expect(editar(criada.id, { tipo_problema: null })).rejects.toThrow(MENSAGEM_TIPO_NAO_VOLTA);
  });

  it('registros antigos da demonstração sem classificação nova aparecem como pendentes, sem serem recusados', async () => {
    const antigas = await demoNcService.listar();
    const antiga = antigas.find((item) => item.numero === 2403);
    expect(antiga?.origem).toBe('Erro de separação');
    expect(antiga?.classificacao_pendente).toBe(true);
    const nova2404 = antigas.find((item) => item.numero === 2404);
    expect(nova2404).toMatchObject({ origem: null, tipo_problema: 'Endereço incorreto', causador: 'Comercial', classificacao_pendente: false });
  });

  it('listas salvas antes da classificação ganham os valores padrão, sem mexer nos existentes', () => {
    const antigas = demoDados.listasNc();
    demoDados.salvarListasNc({ origens: antigas.origens, itens: antigas.itens.filter((item) => item.lista !== 'tipo_problema' && item.lista !== 'causador') });
    const completas = demoDados.listasNc();
    expect(completas.itens.some((item) => item.lista === 'tipo_problema' && item.valor === 'Endereço incorreto')).toBe(true);
    expect(completas.itens.some((item) => item.lista === 'causador' && item.valor === 'Correios')).toBe(true);
    expect(completas.itens.some((item) => item.lista === 'tipo_saida' && item.valor === 'Venda')).toBe(true);
  });
});
