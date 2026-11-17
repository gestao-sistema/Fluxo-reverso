import { describe, expect, it } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { chamadaComChaveSecreta, fetchSemBearerDaChave, obterChaveSupabase } from '../../supabase/functions/_shared/supabase-keys';

const env = (values: Record<string, string | undefined>) => ({ get: (name: string) => values[name] });

describe('migração das chaves do Supabase', () => {
  it('prefere a chave default nova e aceita um mapa com uma única chave nomeada', () => {
    expect(obterChaveSupabase(env({
      SUPABASE_SECRET_KEYS: '{"default":"sb_secret_nova","old":"sb_secret_antiga"}',
      SUPABASE_SERVICE_ROLE_KEY: 'legacy',
    }), 'secret')).toBe('sb_secret_nova');
    expect(obterChaveSupabase(env({ SUPABASE_PUBLISHABLE_KEYS: '{"publishable":"sb_publishable_nova"}' }), 'publishable'))
      .toBe('sb_publishable_nova');
  });

  it('mantém fallback de compatibilidade enquanto a configuração nova não existe', () => {
    expect(obterChaveSupabase(env({ SUPABASE_ANON_KEY: 'legacy-public' }), 'publishable')).toBe('legacy-public');
    expect(obterChaveSupabase(env({ SUPABASE_SERVICE_ROLE_KEY: 'legacy-secret' }), 'secret')).toBe('legacy-secret');
  });

  it('falha com erro genérico para mapas inválidos, sem repetir conteúdo configurado', () => {
    expect(() => obterChaveSupabase(env({ SUPABASE_SECRET_KEYS: 'valor-sensivel-malformado' }), 'secret'))
      .toThrow('SUPABASE_SECRET_KEYS precisa conter um objeto JSON de chaves do Supabase.');
  });

  it('autentica worker apenas com chave configurada em apikey ou Bearer', () => {
    const chaveNova = 'sb_secret_interno';
    expect(chamadaComChaveSecreta(new Request('https://example.test', { headers: { apikey: chaveNova } }), chaveNova)).toBe(true);
    expect(chamadaComChaveSecreta(new Request('https://example.test', { headers: { Authorization: `Bearer ${chaveNova}` } }), chaveNova)).toBe(true);
    expect(chamadaComChaveSecreta(new Request('https://example.test', { headers: { apikey: 'chave-publica' } }), chaveNova)).toBe(false);
    expect(chamadaComChaveSecreta(new Request('https://example.test', { headers: { Authorization: 'Bearer eyJ.eyJ.role.service_role.assinatura' } }), chaveNova)).toBe(false);
  });

  it('envia a chave nova somente em apikey e não remove um JWT de usuário', async () => {
    const chave = 'sb_secret_falso_teste';
    const usuarioJwt = 'jwt-falso-de-usuario';
    const capturar = async (_input: RequestInfo | URL, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      return Response.json({ apikey: headers.get('apikey'), authorization: headers.get('authorization') });
    };
    const fetchKey = fetchSemBearerDaChave(chave, capturar as typeof fetch);
    const semBearerDaChave = await fetchKey('https://example.test', {
      headers: { apikey: chave, Authorization: `Bearer ${chave}` },
    });
    await expect(semBearerDaChave.json()).resolves.toEqual({ apikey: chave, authorization: null });

    const comBearerUsuario = await fetchKey('https://example.test', {
      headers: { apikey: chave, Authorization: `Bearer ${usuarioJwt}` },
    });
    await expect(comBearerUsuario.json()).resolves.toEqual({ apikey: chave, authorization: `Bearer ${usuarioJwt}` });
  });

  it.each(['sb_secret_falso_sdk_teste', 'sb_publishable_falso_sdk_teste'])('o cliente Supabase envia %s somente em apikey', async (chave) => {
    let capturada: { apikey: string | null; authorization: string | null } | undefined;
    const fetchCaptura: typeof fetch = async (_input, init) => {
      const headers = new Headers(init?.headers);
      capturada = { apikey: headers.get('apikey'), authorization: headers.get('authorization') };
      return Response.json([]);
    };
    const cliente = createClient('https://example.invalid', chave, {
      global: { fetch: fetchSemBearerDaChave(chave, fetchCaptura) },
      auth: { storageKey: `test-${chave}`, autoRefreshToken: false, persistSession: false },
    });

    await cliente.from('probe').select('id');
    expect(capturada).toEqual({ apikey: chave, authorization: null });
  });

  it('preserva Authorization com JWT do usuário e com chave JWT antiga', async () => {
    const chaveNova = 'sb_publishable_falso_teste';
    const usuarioJwt = 'jwt-falso-de-usuario';
    const legadoJwt = 'eyJ.falso.legado';
    const capturadas: Array<string | null> = [];
    const fetchCaptura: typeof fetch = async (_input, init) => {
      capturadas.push(new Headers(init?.headers).get('authorization'));
      return Response.json([]);
    };
    const clienteUsuario = createClient('https://example.invalid', chaveNova, {
      global: { headers: { Authorization: `Bearer ${usuarioJwt}` }, fetch: fetchSemBearerDaChave(chaveNova, fetchCaptura) },
      auth: { storageKey: `test-${chaveNova}`, autoRefreshToken: false, persistSession: false },
    });
    const clienteLegado = createClient('https://example.invalid', legadoJwt, {
      global: { fetch: fetchSemBearerDaChave(legadoJwt, fetchCaptura) },
      auth: { storageKey: `test-${legadoJwt}`, autoRefreshToken: false, persistSession: false },
    });

    await clienteUsuario.from('probe').select('id');
    await clienteLegado.from('probe').select('id');
    expect(capturadas).toEqual([`Bearer ${usuarioJwt}`, `Bearer ${legadoJwt}`]);
  });
});
