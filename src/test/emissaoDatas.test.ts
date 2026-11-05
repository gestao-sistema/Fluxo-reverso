import { describe, expect, it } from 'vitest';
import { avisoValidadeEmissao, dataCalendarioValida, formatarDataCalendario, hojeEmSaoPaulo, validarDatasEmissao } from '../lib/emissaoDatas';

describe('datas de emissão como datas de calendário', () => {
  it('valida datas reais e recusa validade anterior à emissão', () => {
    expect(dataCalendarioValida('2024-02-29')).toBe(true);
    expect(dataCalendarioValida('2026-02-29')).toBe(false);
    expect(dataCalendarioValida('2026-13-01')).toBe(false);
    expect(validarDatasEmissao('2026-10-24', '2026-10-23')).toMatch(/validade não pode ser anterior/);
    expect(validarDatasEmissao('2026-10-24', '2026-10-24')).toBeNull();
    expect(validarDatasEmissao(null, null)).toBeNull();
  });

  it('formata o valor da coluna date sem deslocamento de fuso', () => {
    expect(formatarDataCalendario('2026-10-01')).toBe('01/10/2026');
    expect(formatarDataCalendario(null)).toBeNull();
    expect(hojeEmSaoPaulo(new Date('2026-10-24T02:30:00.000Z'))).toBe('2026-10-23');
  });

  it('calcula avisos para ontem, hoje e amanhã pela data de São Paulo', () => {
    const hoje = '2026-10-24';
    const opcoes = { aguardandoPostagem: true, hoje };
    expect(avisoValidadeEmissao('2026-10-23', opcoes)).toBe('encerrado');
    expect(avisoValidadeEmissao(hoje, opcoes)).toBe('vence_hoje');
    expect(avisoValidadeEmissao('2026-10-25', opcoes)).toBe('valida');
    expect(avisoValidadeEmissao(null, opcoes)).toBe('nao_informada');
  });

  it('não alerta emissão substituída ou postagem confirmada', () => {
    expect(avisoValidadeEmissao('2026-10-01', { aguardandoPostagem: true, substituida: true, hoje: '2026-10-24' })).toBeNull();
    expect(avisoValidadeEmissao('2026-10-01', { aguardandoPostagem: true, postagemConfirmada: true, hoje: '2026-10-24' })).toBeNull();
    expect(avisoValidadeEmissao('2026-10-01', { aguardandoPostagem: false, hoje: '2026-10-24' })).toBeNull();
  });
});

describe('validarDatasEmissao: emissão não pode ser futura (regra do banco, relógio de São Paulo)', () => {
  const HOJE = '2026-10-27';
  it('ontem e hoje passam; amanhã é recusado', () => {
    expect(validarDatasEmissao('2026-10-26', null, HOJE)).toBeNull();
    expect(validarDatasEmissao('2026-10-27', null, HOJE)).toBeNull();
    expect(validarDatasEmissao('2026-10-28', null, HOJE)).toBe('A data de emissão não pode ser futura.');
  });
  it('campos ausentes seguem null e validade sem emissão é permitida (inclusive futura ou vencida)', () => {
    expect(validarDatasEmissao(null, null, HOJE)).toBeNull();
    expect(validarDatasEmissao(null, '2026-11-30', HOJE)).toBeNull();
    expect(validarDatasEmissao(null, '2026-01-01', HOJE)).toBeNull();
    expect(validarDatasEmissao('', '', HOJE)).toBeNull();
  });
  it('datas inválidas e validade anterior à emissão continuam recusadas', () => {
    expect(validarDatasEmissao('2026-02-30', null, HOJE)).toBe('Informe uma data de emissão válida.');
    expect(validarDatasEmissao('2026-10-20', '2026-10-19', HOJE)).toBe('A validade não pode ser anterior à data de emissão.');
  });
  it('virada de dia: o "hoje" é o de São Paulo, não o UTC', () => {
    // 28/10 01:30 UTC ainda é 27/10 22:30 em São Paulo: emissão de 27/10 vale, de 28/10 é futura
    const hoje = hojeEmSaoPaulo(new Date('2026-10-28T01:30:00Z'));
    expect(hoje).toBe('2026-10-27');
    expect(validarDatasEmissao('2026-10-27', null, hoje)).toBeNull();
    expect(validarDatasEmissao('2026-10-28', null, hoje)).toBe('A data de emissão não pode ser futura.');
  });
});
