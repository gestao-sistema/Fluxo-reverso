/** Helpers for the staged migration from legacy JWT keys to Supabase API keys. */
export type SupabaseEnvironment = { get(name: string): string | undefined };
export type SupabaseKeyKind = 'publishable' | 'secret';

const KEY_NAMES: Record<SupabaseKeyKind, { current: string; legacy: string }> = {
  publishable: { current: 'SUPABASE_PUBLISHABLE_KEYS', legacy: 'SUPABASE_ANON_KEY' },
  secret: { current: 'SUPABASE_SECRET_KEYS', legacy: 'SUPABASE_SERVICE_ROLE_KEY' },
};

/** Read the Dashboard JSON map, preferring `default`, and retain the old env fallback during rollout. */
export function obterChaveSupabase(env: SupabaseEnvironment, kind: SupabaseKeyKind): string | undefined {
  const names = KEY_NAMES[kind];
  const configured = env.get(names.current)?.trim();
  if (configured) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(configured);
    } catch {
      throw new Error(`${names.current} precisa conter um objeto JSON de chaves do Supabase.`);
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error(`${names.current} precisa conter um objeto JSON de chaves do Supabase.`);
    }
    const entries = Object.entries(parsed).filter((entry): entry is [string, string] =>
      typeof entry[1] === 'string' && entry[1].trim().length > 0,
    );
    const selected = entries.find(([key]) => key === 'default')?.[1]
      ?? (entries.length === 1 ? entries[0][1] : undefined);
    if (!selected) throw new Error(`${names.current} deve conter uma chave "default".`);
    return selected.trim();
  }
  return env.get(names.legacy)?.trim() || undefined;
}

function igualSeguro(a: string, b: string): boolean {
  if (!a || !b || a.length !== b.length) return false;
  let diferenca = 0;
  for (let i = 0; i < a.length; i += 1) diferenca |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diferenca === 0;
}

/** Validate internal function calls explicitly when the gateway does not verify a JWT. */
export function chamadaComChaveSecreta(req: Request, secretKey: string, legacyKey = ''): boolean {
  const authorization = req.headers.get('authorization') ?? '';
  const bearer = /^Bearer\s+(.+)$/i.exec(authorization.trim())?.[1]?.trim() ?? '';
  const presented = [req.headers.get('apikey')?.trim() ?? '', bearer].filter(Boolean);
  const allowed = [secretKey, legacyKey].filter(Boolean);
  return presented.some((value) => allowed.some((key) => igualSeguro(value, key)));
}

/** Keep new API keys on `apikey` only; preserve legacy JWT keys and real user JWTs in Authorization. */
export function fetchSemBearerDaChave(apiKey: string, fetcher: typeof fetch = fetch): typeof fetch {
  return async (input, init) => {
    const headers = new Headers(input instanceof Request ? input.headers : undefined);
    new Headers(init?.headers).forEach((value, name) => headers.set(name, value));
    const chaveNova = apiKey.startsWith('sb_publishable_') || apiKey.startsWith('sb_secret_');
    const authorization = headers.get('authorization')?.trim() ?? '';
    const tokenBearer = /^Bearer\s+(.+)$/i.exec(authorization)?.[1]?.trim();
    if (chaveNova && tokenBearer === apiKey) headers.delete('authorization');
    return fetcher(input, { ...init, headers });
  };
}
