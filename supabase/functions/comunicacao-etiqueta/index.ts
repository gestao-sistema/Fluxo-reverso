import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.112.3';
import { criarWorker } from './worker.ts';
import { fetchSemBearerDaChave, obterChaveSupabase } from '../_shared/supabase-keys.ts';

// Ponto de entrada da Edge Function de notificações dos pedidos (Power Automate: Outlook e Teams).
// Segredos vêm somente do ambiente do servidor; a lógica do worker fica em worker.ts (testável fora do Deno).
// Não lê as variáveis de SMTP nem as dos convites: convites e senha usam outra função e outro controle.
const ENV_NAMES = [
  'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_SECRET_KEYS', 'ETIQUETA_TRANSPORTE', 'POWER_AUTOMATE_FLOW_URL',
  'POWER_AUTOMATE_TENANT_ID', 'POWER_AUTOMATE_CLIENT_ID', 'POWER_AUTOMATE_CLIENT_SECRET',
  'POWER_AUTOMATE_SCOPE', 'APP_BASE_URL',
] as const;

const env: Record<string, string | undefined> = {};
for (const nome of ENV_NAMES) env[nome] = Deno.env.get(nome) ?? undefined;
env.SUPABASE_SECRET_KEY = obterChaveSupabase({ get: (name: string) => env[name] }, 'secret') ?? '';

const tratar = criarWorker({
  env,
  fetch: (...argumentos) => fetch(...argumentos),
  log: (mensagem, detalhe) => console.error(mensagem, detalhe ?? ''),
  criarCliente: () => createClient(env.SUPABASE_URL ?? '', env.SUPABASE_SECRET_KEY ?? '', {
    global: { fetch: fetchSemBearerDaChave(env.SUPABASE_SECRET_KEY ?? '') },
    auth: { autoRefreshToken: false, persistSession: false },
  }),
});

Deno.serve(tratar);
