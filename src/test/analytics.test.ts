import { describe, it, expect } from 'vitest';
import {
  calcularKpis,
  contarPorStatus,
  porMotivo,
  porEmpresa,
  porData,
  porDataComZeros,
  porMotivoEmpresa,
  porAutorizador,
  formatarTempo
} from '../services/analytics';
import { MOTIVOS, type Solicitacao } from '../types';

function sol(overrides: Partial<Solicitacao> = {}): Solicitacao {
  return {
    id: crypto.randomUUID(),
    created_at: '2024-01-01T00:00:00Z',
    empresa: 'Alinare',
    data_solicitacao: '2024-01-15',
    solicitante: 'Teste',
    setor: 'Comercial Alinare',
    codigo_cliente: 1,
    nome_cliente: 'Cliente',
    endereco_postagem: 'Rua X',
    motivo: 'Peça com defeito',
    justificativa_outros: null,
    autorizacao: 'Joice Mendes',
    status: 'pendente' as const,
    tempo_preenchimento_segundos: 60,
    ...overrides,
  };
}

describe('analytics', () => {
  describe('calcularKpis', () => {
    it('retorna zeros e "—" com array vazio', () => {
      const res = calcularKpis([]);
      expect(res).toEqual({
        total: 0,
        aguardandoAprovacao: 0,
        pendentes: 0,
        etiquetaGerada: 0,
        postados: 0,
        emTransito: 0,
        concluidos: 0,
        taxaConclusao: 0,
        tempoMedioSegundos: 0,
        motivoTop: '—'
      });
    });

    it('calcula KPIs corretamente para lista mista', () => {
      const dados = [
        sol({ status: 'concluido', tempo_preenchimento_segundos: 60, motivo: 'Endereço incorreto' }),
        sol({ status: 'concluido', tempo_preenchimento_segundos: 120, motivo: 'Outros' }),
        sol({ status: 'pendente', tempo_preenchimento_segundos: 0, motivo: 'Outros' }),
        sol({ status: 'etiqueta_gerada', tempo_preenchimento_segundos: 0, motivo: 'Outros' }),
        sol({ status: 'postado', tempo_preenchimento_segundos: 0, motivo: 'Outros' })
      ];

      const res = calcularKpis(dados);
      expect(res.total).toBe(5);
      expect(res.concluidos).toBe(2);
      expect(res.pendentes).toBe(1);
      expect(res.etiquetaGerada).toBe(1);
      expect(res.postados).toBe(1);
      expect(res.taxaConclusao).toBe(40); // Math.round((2/5) * 100)
      expect(res.tempoMedioSegundos).toBe(36); // 180 / 5
      expect(res.motivoTop).toBe('Outros');
    });

    it('motivoTop pega o mais frequente em caso de empate retorna o primeiro encontrado', () => {
      const dados = [
        sol({ motivo: 'Peça com defeito' }),
        sol({ motivo: 'Mercadoria Errada' }),
        sol({ motivo: 'Mercadoria Errada' }),
      ];
      expect(calcularKpis(dados).motivoTop).toBe('Mercadoria Errada');
    });

    it('motivoTop soma o valor antigo e o atual de "Mercadoria errada" como um só motivo', () => {
      const dados = [
        sol({ motivo: 'Mercadoria errada' }),
        sol({ motivo: 'Mercadoria Errada' }),
        sol({ motivo: 'Peça com defeito' }),
        sol({ motivo: 'Peça com defeito' }),
      ];
      // Separados seriam 2 (Peça) x 1 x 1; somados, "Mercadoria Errada" empata em 2 e vem primeiro.
      expect(calcularKpis(dados).motivoTop).toBe('Mercadoria Errada');
    });
  });

  describe('porMotivo', () => {
    it('retorna todos os motivos atuais mesmo vazios', () => {
      const res = porMotivo([]);
      expect(res.map(r => r.motivo)).toEqual([...MOTIVOS]);
      expect(res.every(r => r.quantidade === 0)).toBe(true);
    });

    it('soma "Mercadoria errada" (valor antigo) em "Mercadoria Errada"', () => {
      const res = porMotivo([sol({ motivo: 'Mercadoria errada' }), sol({ motivo: 'Mercadoria Errada' })]);
      expect(res.find(m => m.motivo === 'Mercadoria Errada')?.quantidade).toBe(2);
      expect(res.some(m => m.motivo === 'Mercadoria errada')).toBe(false);
    });

    it('não descarta motivo antigo sem equivalente: aparece como linha própria só quando existe', () => {
      expect(porMotivo([]).some(m => m.motivo === 'Endereço incorreto')).toBe(false);
      const res = porMotivo([sol({ motivo: 'Endereço incorreto' })]);
      expect(res.find(m => m.motivo === 'Endereço incorreto')?.quantidade).toBe(1);
      expect(res.reduce((acc, m) => acc + m.quantidade, 0)).toBe(1);
    });

    it('conta corretamente por motivo', () => {
      const res = porMotivo([
        sol({ motivo: 'Peça com defeito' }),
        sol({ motivo: 'Peça com defeito' }),
        sol({ motivo: 'Outros' })
      ]);
      expect(res.find(m => m.motivo === 'Peça com defeito')?.quantidade).toBe(2);
      expect(res.find(m => m.motivo === 'Outros')?.quantidade).toBe(1);
      expect(res.find(m => m.motivo === 'Mercadoria Errada')?.quantidade).toBe(0);
    });
  });

  describe('porEmpresa', () => {
    it('filtra empresas sem registros', () => {
      const dados = [sol({ empresa: 'Alinare' }), sol({ empresa: 'Alinare' })];
      const res = porEmpresa(dados);
      expect(res).toHaveLength(1);
      expect(res[0].empresa).toBe('Alinare');
      expect(res[0].quantidade).toBe(2);
    });

    it('inclui ambas se ambas tiverem registros', () => {
      const dados = [sol({ empresa: 'Alinare' }), sol({ empresa: 'Novitah' })];
      const res = porEmpresa(dados);
      expect(res).toHaveLength(2);
      const alinare = res.find(r => r.empresa === 'Alinare');
      const novitah = res.find(r => r.empresa === 'Novitah');
      expect(alinare?.quantidade).toBe(1);
      expect(novitah?.quantidade).toBe(1);
    });
  });

  describe('porData', () => {
    it('ordena por data asc e formata dataLabel', () => {
      const dados = [
        sol({ data_solicitacao: '2024-01-20' }),
        sol({ data_solicitacao: '2024-01-15' }),
        sol({ data_solicitacao: '2024-01-15' })
      ];

      const res = porData(dados);
      expect(res).toHaveLength(2);

      expect(res[0].data).toBe('2024-01-15');
      expect(res[0].dataLabel).toBe('15/01');
      expect(res[0].quantidade).toBe(2);

      expect(res[1].data).toBe('2024-01-20');
      expect(res[1].dataLabel).toBe('20/01');
      expect(res[1].quantidade).toBe(1);
    });
  });

  describe('contarPorStatus', () => {
    it('inclui solicitações reprovadas e todos os demais status sem omissões', () => {
      const resultado = contarPorStatus([
        sol({ status: 'aguardando_aprovacao' }),
        sol({ status: 'reprovado' }),
        sol({ status: 'reprovado' }),
        sol({ status: 'pendente' }),
        sol({ status: 'etiqueta_gerada' }),
        sol({ status: 'postado' }),
        sol({ status: 'em_transito' }),
        sol({ status: 'concluido' }),
      ]);

      expect(resultado).toEqual({
        aguardando_aprovacao: 1,
        reprovado: 2,
        pendente: 1,
        etiqueta_gerada: 1,
        postado: 1,
        em_transito: 1,
        concluido: 1,
      });
    });
  });

  describe('porDataComZeros', () => {
    it('preenche dias sem solicitação e respeita o intervalo selecionado', () => {
      const resultado = porDataComZeros([
        sol({ data_solicitacao: '2024-01-15' }),
        sol({ data_solicitacao: '2024-01-17' }),
      ], '2024-01-15', '2024-01-17');

      expect(resultado).toEqual([
        { data: '2024-01-15', dataLabel: '15/01', quantidade: 1 },
        { data: '2024-01-16', dataLabel: '16/01', quantidade: 0 },
        { data: '2024-01-17', dataLabel: '17/01', quantidade: 1 },
      ]);
    });

    it('não cria uma série artificial sem registros', () => {
      expect(porDataComZeros([], '2024-01-01', '2024-01-07')).toEqual([]);
    });
  });

  describe('porMotivoEmpresa', () => {
    it('divide corretamente por Alinare e Novitah', () => {
      const dados = [
        sol({ motivo: 'Peça com defeito', empresa: 'Alinare' }),
        sol({ motivo: 'Peça com defeito', empresa: 'Alinare' }),
        sol({ motivo: 'Peça com defeito', empresa: 'Novitah' }),
        sol({ motivo: 'Outros', empresa: 'Novitah' })
      ];

      const res = porMotivoEmpresa(dados);
      expect(res).toHaveLength(MOTIVOS.length);

      const defeito = res.find(r => r.motivo === 'Peça com defeito');
      expect(defeito?.Alinare).toBe(2);
      expect(defeito?.Novitah).toBe(1);
      expect(defeito?.total).toBe(3);

      const outros = res.find(r => r.motivo === 'Outros');
      expect(outros?.Alinare).toBe(0);
      expect(outros?.Novitah).toBe(1);
      expect(outros?.total).toBe(1);
    });
  });

  describe('porMotivoEmpresa: motivos antigos', () => {
    it('normaliza "Mercadoria errada" e mantém motivo antigo sem equivalente', () => {
      const res = porMotivoEmpresa([
        sol({ motivo: 'Mercadoria errada', empresa: 'Alinare' }),
        sol({ motivo: 'Mercadoria Errada', empresa: 'Novitah' }),
        sol({ motivo: 'Endereço incorreto', empresa: 'Novitah' }),
      ]);
      const errada = res.find(r => r.motivo === 'Mercadoria Errada');
      expect(errada).toMatchObject({ Alinare: 1, Novitah: 1, total: 2 });
      expect(res.find(r => r.motivo === 'Endereço incorreto')).toMatchObject({ Alinare: 0, Novitah: 1, total: 1 });
      expect(res.reduce((acc, r) => acc + r.total, 0)).toBe(3);
    });
  });

  describe('porAutorizador', () => {
    it('ordena por total desc', () => {
      const dados = [
        sol({ autorizacao: 'Joice Mendes', status: 'concluido' }),
        sol({ autorizacao: 'Viviane Ulian', status: 'pendente' }),
        sol({ autorizacao: 'Viviane Ulian', status: 'concluido' })
      ];

      const res = porAutorizador(dados);
      expect(res).toHaveLength(2);

      expect(res[0].autorizador).toBe('Viviane Ulian');
      expect(res[0].pendentes).toBe(1);
      expect(res[0].resolvidos).toBe(1);
      expect(res[0].total).toBe(2);

      expect(res[1].autorizador).toBe('Joice Mendes');
      expect(res[1].pendentes).toBe(0);
      expect(res[1].resolvidos).toBe(1);
      expect(res[1].total).toBe(1);
    });
  });

  describe('formatarTempo', () => {
    it('formata 0s', () => expect(formatarTempo(0)).toBe('0s'));
    it('formata < 60s', () => expect(formatarTempo(59)).toBe('59s'));
    it('formata minutos exatos', () => expect(formatarTempo(60)).toBe('1min'));
    it('formata minutos e segundos', () => expect(formatarTempo(90)).toBe('1min 30s'));
    it('formata 2 minutos exatos', () => expect(formatarTempo(120)).toBe('2min'));
  });
});
