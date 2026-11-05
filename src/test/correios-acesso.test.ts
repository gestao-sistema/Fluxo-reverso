import { describe, expect, it } from 'vitest';
import { analisarCorpo, ehAutomacao, igualSeguro, tokenDo } from '../../supabase/functions/correios-rastreio/acesso.ts';

const CHAVE = 'eyJhbGciOiJIUzI1NiJ9.chave-de-servico-de-teste';

describe('tokenDo', () => {
  it('lê o token do Bearer, sem diferenciar maiúsculas', () => {
    expect(tokenDo('Bearer abc')).toBe('abc');
    expect(tokenDo('bearer   xyz  ')).toBe('xyz');
  });

  it('sem cabeçalho ou com outro esquema, não há token', () => {
    expect(tokenDo(null)).toBeNull();
    expect(tokenDo('')).toBeNull();
    expect(tokenDo('Basic dXN1YXJpbzpzZW5oYQ==')).toBeNull();
    expect(tokenDo('Bearer ')).toBeNull();
  });
});

describe('igualSeguro', () => {
  it('aceita só o valor idêntico', () => {
    expect(igualSeguro('segredo', 'segredo')).toBe(true);
    expect(igualSeguro('segredo', 'segredo!')).toBe(false);
    expect(igualSeguro('segredo', 'Segredo')).toBe(false);
  });

  it('vazio nunca confere', () => {
    expect(igualSeguro('', '')).toBe(false);
    expect(igualSeguro('', 'x')).toBe(false);
  });
});

describe('ehAutomacao', () => {
  it('só a chave service_role configurada é automação', () => {
    expect(ehAutomacao(CHAVE, CHAVE)).toBe(true);
    expect(ehAutomacao('outro-token', CHAVE)).toBe(false);
    expect(ehAutomacao(CHAVE.slice(0, -1), CHAVE)).toBe(false);
  });

  it('sem chave configurada no servidor, ninguém é automação (falha fechada)', () => {
    expect(ehAutomacao('', '')).toBe(false);
    expect(ehAutomacao('qualquer', '')).toBe(false);
  });
});

describe('analisarCorpo', () => {
  it('corpo vazio é chamada de lote (a decisão de quem pode é depois)', () => {
    expect(analisarCorpo('')).toEqual({ ok: true, codigo: null });
    expect(analisarCorpo('   ')).toEqual({ ok: true, codigo: null });
    expect(analisarCorpo('{}')).toEqual({ ok: true, codigo: null });
    expect(analisarCorpo('{"codigo":null}')).toEqual({ ok: true, codigo: null });
  });

  it('aceita um código no formato dos Correios', () => {
    expect(analisarCorpo('{"codigo":"AA123456789BR"}')).toEqual({ ok: true, codigo: 'AA123456789BR' });
  });

  it('recusa código fora do formato, de outro tipo ou com caracteres que mudam a URL', () => {
    for (const corpo of [
      '{"codigo":"123"}',
      '{"codigo":"aa123456789br"}',
      '{"codigo":"AA123456789BRX"}',
      '{"codigo":"AA123456789BR/../x"}',
      '{"codigo":"AA123456789BR?x=1"}',
      '{"codigo":123}',
      '{"codigo":["AA123456789BR"]}',
      '{"codigo":{"x":1}}',
    ]) {
      const analise = analisarCorpo(corpo);
      expect(analise.ok, corpo).toBe(false);
    }
  });

  it('recusa corpo que não é objeto JSON, inválido ou grande demais', () => {
    expect(analisarCorpo('não é json').ok).toBe(false);
    expect(analisarCorpo('[]').ok).toBe(false);
    expect(analisarCorpo('"texto"').ok).toBe(false);
    expect(analisarCorpo(`{"codigo":"${'A'.repeat(2000)}"}`).ok).toBe(false);
  });
});
