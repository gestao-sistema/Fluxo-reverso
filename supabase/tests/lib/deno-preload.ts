// Usado somente por runtime-deno.test.mjs: roda ANTES da Edge Function no Deno e redireciona as
// chamadas externas para servidores locais de teste. A função em si não é alterada.
const original = globalThis.fetch.bind(globalThis);

globalThis.fetch = (async (entrada: Request | URL | string, init?: RequestInit) => {
  const url = new URL(typeof entrada === 'string' ? entrada : entrada instanceof URL ? entrada.href : entrada.url);
  if (url.hostname === 'login.microsoftonline.com') {
    return new Response(JSON.stringify({ access_token: 'token-oauth-de-teste', expires_in: 3600 }), { status: 200 });
  }
  if (url.hostname === 'flow.example.test') {
    return original(`http://127.0.0.1:${Deno.env.get('FAKE_FLOW_PORT')}${url.pathname}`, init);
  }
  return original(entrada as Request, init);
}) as typeof fetch;
