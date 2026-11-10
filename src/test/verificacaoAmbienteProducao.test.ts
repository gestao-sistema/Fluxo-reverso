import { describe, expect, it } from 'vitest';
// @ts-expect-error módulo .mjs de script do build (fora do tsconfig da aplicação)
import { papelDoJwt, validarAmbienteProducao } from '../../scripts/verificar-ambiente-producao.mjs';

function jwtFalso(role: string): string {
  const base64url = (obj: unknown) => Buffer.from(JSON.stringify(obj)).toString('base64url');
  return `${base64url({ alg: 'HS256', typ: 'JWT' })}.${base64url({ role, iss: 'teste' })}.assinatura-de-teste`;
}

const URL_VALIDA = 'https://projeto-teste.supabase.co';

describe('validarAmbienteProducao', () => {
  it('aceita URL https e chave pública (anon)', () => {
    expect(validarAmbienteProducao({ VITE_SUPABASE_URL: URL_VALIDA, VITE_SUPABASE_ANON_KEY: jwtFalso('anon') })).toEqual([]);
  });

  it('aceita chave publishable no formato novo', () => {
    expect(validarAmbienteProducao({ VITE_SUPABASE_URL: URL_VALIDA, VITE_SUPABASE_ANON_KEY: 'sb_publishable_teste' })).toEqual([]);
  });

  it('exige VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY', () => {
    const erros = validarAmbienteProducao({});
    expect(erros).toHaveLength(2);
    expect(erros[0]).toContain('VITE_SUPABASE_URL não está definida');
    expect(erros[1]).toContain('VITE_SUPABASE_ANON_KEY não está definida');
  });

  it('recusa URL inválida e URL http fora de localhost', () => {
    expect(validarAmbienteProducao({ VITE_SUPABASE_URL: 'não-é-url', VITE_SUPABASE_ANON_KEY: jwtFalso('anon') }))
      .toEqual(['VITE_SUPABASE_URL não é uma URL válida.']);
    expect(validarAmbienteProducao({ VITE_SUPABASE_URL: 'http://projeto.supabase.co', VITE_SUPABASE_ANON_KEY: jwtFalso('anon') }))
      .toEqual(['VITE_SUPABASE_URL deve usar https em produção.']);
  });

  it('permite http apenas em localhost (testes locais)', () => {
    expect(validarAmbienteProducao({ VITE_SUPABASE_URL: 'http://127.0.0.1:54321', VITE_SUPABASE_ANON_KEY: jwtFalso('anon') })).toEqual([]);
  });

  it('recusa chave service_role e chave secreta, sem ecoar o valor', () => {
    const service = jwtFalso('service_role');
    const erros = validarAmbienteProducao({ VITE_SUPABASE_URL: URL_VALIDA, VITE_SUPABASE_ANON_KEY: service });
    expect(erros).toHaveLength(1);
    expect(erros[0]).toContain('service_role');
    expect(erros[0]).not.toContain(service);

    expect(validarAmbienteProducao({ VITE_SUPABASE_URL: URL_VALIDA, VITE_SUPABASE_ANON_KEY: 'sb_secret_teste' })[0])
      .toContain('service_role/secreta');
  });

  it('recusa variáveis VITE_* com nome de segredo', () => {
    const erros = validarAmbienteProducao({
      VITE_SUPABASE_URL: URL_VALIDA,
      VITE_SUPABASE_ANON_KEY: jwtFalso('anon'),
      VITE_SUPABASE_SERVICE_ROLE_KEY: 'x',
    });
    expect(erros).toHaveLength(1);
    expect(erros[0]).toContain('VITE_SUPABASE_SERVICE_ROLE_KEY');
  });
});

describe('papelDoJwt', () => {
  it('lê o role do payload e devolve null para valores que não são JWT', () => {
    expect(papelDoJwt(jwtFalso('anon'))).toBe('anon');
    expect(papelDoJwt('sem-pontos')).toBeNull();
    expect(papelDoJwt('a.b.c')).toBeNull();
  });
});
