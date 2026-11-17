import { describe, expect, it } from 'vitest';
import { codigoRastreioValido, codigosRastreioNoTexto, decidirPreenchimento, digitoVerificadorS10 } from '../lib/rastreioCorreios';

describe('dígito verificador S10 dos Correios', () => {
  it('calcula pelos pesos 8 6 4 2 3 5 9 7, com resto 0 → 5 e resto 1 → 0', () => {
    expect(digitoVerificadorS10('12345678')).toBe(5); // soma 204, resto 6 → 11 − 6
    expect(digitoVerificadorS10('98765432')).toBe(6);
    expect(digitoVerificadorS10('00000000')).toBe(5); // resto 0
    expect(digitoVerificadorS10('00000008')).toBe(0); // 8 × 7 = 56, resto 1
    expect(digitoVerificadorS10('1234567')).toBeNull();
    expect(digitoVerificadorS10('1234567A')).toBeNull();
  });

  it('aceita só o código completo com DV correto', () => {
    expect(codigoRastreioValido('AB123456785BR')).toBe(true);
    expect(codigoRastreioValido(' ab123456785br ')).toBe(true);
    expect(codigoRastreioValido('AB123456789BR')).toBe(false); // formato certo, DV errado
    expect(codigoRastreioValido('AB12345678BR')).toBe(false);
    expect(codigoRastreioValido('AB123456785US')).toBe(false);
    expect(codigoRastreioValido('')).toBe(false);
    expect(codigoRastreioValido(null)).toBe(false);
  });
});

describe('códigos de rastreio no texto da etiqueta', () => {
  const etiqueta = [
    'CEP 01310-100 Sao Paulo SP',
    'Telefone 11 98765-4321',
    'Contrato 9912345678',
    'Autorizacao de postagem: 223344556',
    'Objeto: AB 123 456 785 BR',
    'AB123456785BR', // repetição do código de barras
  ].join('\n');

  it('acha o código com separadores, deduplica e ignora CEP, telefone, contrato e autorização', () => {
    expect(codigosRastreioNoTexto(etiqueta)).toEqual(['AB123456785BR']);
  });

  it('não usa número com formato de rastreio e DV errado (aleatório ou leitura errada)', () => {
    expect(codigosRastreioNoTexto('Objeto: AB123456789BR')).toEqual([]);
  });

  it('devolve todos os códigos válidos distintos, na ordem', () => {
    expect(codigosRastreioNoTexto('1: JT987654326BR\n2: AB123456785BR\n3: JT987654326BR')).toEqual(['JT987654326BR', 'AB123456785BR']);
  });

  it('não pega código colado em outras letras ou números', () => {
    expect(codigosRastreioNoTexto('XAB123456785BR')).toEqual([]);
    expect(codigosRastreioNoTexto('AB123456785BR9')).toEqual([]);
  });
});

describe('decisão de preenchimento', () => {
  it('campo vazio + um código: preenche', () => {
    expect(decidirPreenchimento('', ['AB123456785BR'])).toEqual({ valor: 'AB123456785BR', situacao: 'preenchido', candidatos: ['AB123456785BR'] });
  });
  it('campo vazio + vários: não escolhe', () => {
    expect(decidirPreenchimento('', ['AB123456785BR', 'JT987654326BR'])).toMatchObject({ valor: '', situacao: 'escolher' });
  });
  it('campo com outro valor: mantém e sugere', () => {
    expect(decidirPreenchimento('JT987654326BR', ['AB123456785BR'])).toMatchObject({ valor: 'JT987654326BR', situacao: 'mantido', candidatos: ['AB123456785BR'] });
  });
  it('campo com o mesmo valor: confirma', () => {
    expect(decidirPreenchimento(' ab123456785br', ['AB123456785BR'])).toMatchObject({ valor: 'AB123456785BR', situacao: 'confirmado' });
  });
  it('nada lido: mantém o que havia', () => {
    expect(decidirPreenchimento('JT987654326BR', [])).toMatchObject({ valor: 'JT987654326BR', situacao: 'nenhum' });
    expect(decidirPreenchimento(null, [])).toMatchObject({ valor: '', situacao: 'nenhum' });
  });
});
