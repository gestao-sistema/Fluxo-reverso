import { describe, expect, it } from 'vitest';
import { pendenciasOperacionais, tempoDesde } from '../lib/dashboardOperacao';
import type { Solicitacao, StatusSolicitacao } from '../types';

const base: Solicitacao = {
  id: 'a',
  created_at: '2026-10-10T12:00:00.000Z',
  empresa: 'Alinare',
  data_solicitacao: '2026-10-10',
  solicitante: 'Paula',
  setor: 'Comercial',
  codigo_cliente: 1,
  nome_cliente: 'Cliente',
  endereco_postagem: 'Rua',
  motivo: 'Outros',
  autorizacao: 'Joice Mendes',
  status: 'aguardando_aprovacao',
  tempo_preenchimento_segundos: 10,
};

const comStatus = (id: string, status: StatusSolicitacao, extra: Partial<Solicitacao> = {}): Solicitacao => ({
  ...base,
  id,
  status,
  ...extra,
});

const statusDe = (s: Solicitacao) => s.status;

describe('pendenciasOperacionais', () => {
  it('considera aprovação e emissão de etiqueta; etiqueta emitida e etapas posteriores ficam de fora', () => {
    const dados = [
      comStatus('1', 'aguardando_aprovacao'),
      comStatus('2', 'pendente'),
      comStatus('3', 'etiqueta_gerada'),
      comStatus('4', 'postado'),
      comStatus('5', 'em_transito'),
      comStatus('6', 'concluido'),
      comStatus('7', 'reprovado'),
    ];

    const ids = pendenciasOperacionais(dados, statusDe).map((p) => p.solicitacao.id);
    expect(ids.sort()).toEqual(['1', '2']);
  });

  it('ordena do início mais antigo para o mais recente', () => {
    const dados = [
      comStatus('novo', 'pendente', { created_at: '2026-10-19T10:00:00.000Z' }),
      comStatus('antigo', 'aguardando_aprovacao', { created_at: '2026-10-01T10:00:00.000Z' }),
    ];

    expect(pendenciasOperacionais(dados, statusDe).map((p) => p.solicitacao.id)).toEqual(['antigo', 'novo']);
  });

  it('não pede ação após a emissão da etiqueta', () => {
    const dados = [
      comStatus('checkin', 'etiqueta_gerada', {
        created_at: '2026-09-01T10:00:00.000Z',
        etiqueta_gerada_em: '2026-10-18T10:00:00.000Z',
      }),
    ];

    expect(pendenciasOperacionais(dados, statusDe)).toEqual([]);
  });

  it('usa o status calculado pela página quando ele difere do campo bruto', () => {
    const dados = [comStatus('legado', 'concluido')];
    const pendencias = pendenciasOperacionais(dados, () => 'pendente');
    expect(pendencias.map((p) => p.tipo)).toEqual(['etiqueta']);
  });
});

describe('tempoDesde', () => {
  const agora = new Date('2026-10-21T12:00:00.000Z').getTime();

  it('formata minutos, horas e dias no singular e no plural', () => {
    expect(tempoDesde('2026-10-21T11:30:00.000Z', agora)).toBe('30 min');
    expect(tempoDesde('2026-10-21T06:00:00.000Z', agora)).toBe('6 h');
    expect(tempoDesde('2026-10-20T06:00:00.000Z', agora)).toBe('1 dia');
    expect(tempoDesde('2026-10-17T06:00:00.000Z', agora)).toBe('4 dias');
  });

  it('retorna null para datas inválidas, sem inventar tempo', () => {
    expect(tempoDesde('não é data', agora)).toBeNull();
  });
});
