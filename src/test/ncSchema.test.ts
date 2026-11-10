import { describe, it, expect } from 'vitest';
import { ncSchema, type NcFormInput } from '../schemas/ncSchema';

const vazio: NcFormInput = {
  data_ocorrencia: '', data_identificacao: '', empresa: '', cliente: '', vendedora: '', romaneio: '',
  valor_romaneio: '', nf: '', rastreio: '', data_postagem: '',
  tipo_saida: '', origem: '', como_identificada: '',
  status_correios: '', descricao: '', resolucao: '', novo_rastreio: '',
  valor_declarado: '', valor_venda: '', frete_original: '',
  custo_produto: '', custo_frete_adicional: '', custo_multa_outros: '', reembolso_correios: '', numero_pi: '',
  valor_reembolsado: '',
  tempo_tratativa_min: '', status: 'Aberta', data_encerramento: '',
};

const minimo: NcFormInput = { ...vazio, data_ocorrencia: '2026-10-01', empresa: 'Azime', origem: 'Outro' };

const erroDe = (r: ReturnType<typeof ncSchema.safeParse>, campo: string) =>
  r.success ? undefined : r.error.issues.find((i) => i.path[0] === campo)?.message;

describe('ncSchema', () => {
  it('mínimo para entrar no painel: data da ocorrência, empresa e origem', () => {
    const r = ncSchema.safeParse(minimo);
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.cliente).toBeNull();
      expect(r.data.custo_produto).toBeNull();
      expect(r.data.status).toBe('Aberta');
    }
  });

  it('sem data ou empresa falha no campo certo; a origem antiga não é obrigatória (registro novo não a preenche)', () => {
    const r = ncSchema.safeParse(vazio);
    expect(erroDe(r, 'data_ocorrencia')).toBe('Informe a data da ocorrência.');
    expect(erroDe(r, 'empresa')).toBe('Selecione a empresa / contrato.');
    expect(erroDe(r, 'origem')).toBeUndefined();
  });

  it('valores em reais: número com duas casas; negativo falha', () => {
    const r = ncSchema.safeParse({ ...minimo, custo_produto: '10.125', valor_reembolsado: '0' });
    expect(r.success && r.data.custo_produto).toBe(10.13);
    expect(r.success && r.data.valor_reembolsado).toBe(0);
    expect(erroDe(ncSchema.safeParse({ ...minimo, custo_produto: '-1' }), 'custo_produto')).toBeDefined();
  });

  it('tempo de tratativa em minutos inteiros', () => {
    expect(erroDe(ncSchema.safeParse({ ...minimo, tempo_tratativa_min: '12.5' }), 'tempo_tratativa_min')).toBeDefined();
    const r = ncSchema.safeParse({ ...minimo, tempo_tratativa_min: '90' });
    expect(r.success && r.data.tempo_tratativa_min).toBe(90);
  });

  it('encerramento antes da identificação falha', () => {
    const r = ncSchema.safeParse({ ...minimo, data_identificacao: '2026-10-05', data_encerramento: '2026-10-03' });
    expect(erroDe(r, 'data_encerramento')).toBeDefined();
  });

  it('status vazio vira null (histórico da planilha sem status)', () => {
    const r = ncSchema.safeParse({ ...minimo, status: '' });
    expect(r.success && r.data.status).toBeNull();
  });

  it('remove tags HTML dos textos', () => {
    const r = ncSchema.safeParse({ ...minimo, cliente: '<b>Maria</b>', descricao: '<script>x</script>ok' });
    expect(r.success && r.data.cliente).toBe('Maria');
    expect(r.success && r.data.descricao).toBe('xok');
  });

  it('mantém "<" e ">" que não formam tag', () => {
    const r = ncSchema.safeParse({ ...minimo, descricao: 'Peso < 2 kg e valor > R$ 100 <3' });
    expect(r.success && r.data.descricao).toBe('Peso < 2 kg e valor > R$ 100 <3');
  });
});
