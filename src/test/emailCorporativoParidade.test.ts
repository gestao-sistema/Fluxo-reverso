import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { normalizarEmailCorporativo as noFront } from '../lib/emailCorporativo';
import { normalizarEmailCorporativo as noBackend } from '../../supabase/functions/admin-usuarios/convite';

const bloco = (arquivo: string): string => {
  const texto = readFileSync(arquivo, 'utf8').replace(/\r\n/g, '\n');
  const inicio = texto.indexOf('// >>> e-mail corporativo');
  const fim = texto.indexOf('// <<< e-mail corporativo');
  expect(inicio).toBeGreaterThanOrEqual(0);
  expect(fim).toBeGreaterThan(inicio);
  return texto.slice(inicio, fim);
};

describe('paridade da regra de e-mail corporativo (interface × Edge Function)', () => {
  it('o bloco compartilhado é textualmente idêntico', () => {
    expect(bloco('src/lib/emailCorporativo.ts')).toBe(bloco('supabase/functions/admin-usuarios/convite.ts'));
  });

  it.each([
    '  Maria@AZIME.com.br ', 'maria@gmail.com', 'maria@azime.com.br.outro.com', 'maria@sub.azime.com.br', '', 'a..b@azime.com.br',
    'a+b@azime.com.br', 'x@azime.com',
  ])('mesmo resultado para %j', (entrada) => {
    const resultado = (funcao: (valor: string) => string) => { try { return funcao(entrada); } catch (erro) { return `erro:${(erro as Error).message}`; } };
    expect(resultado(noFront)).toBe(resultado(noBackend));
  });
});
