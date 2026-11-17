// ── Cliente Supabase (singleton) ──────────────────────────────────────────────
import { createClient } from '@supabase/supabase-js';
import { fetchSemBearerDaChave } from '../../supabase/functions/_shared/supabase-keys';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;
const legacyAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
const publicKey = publishableKey || legacyAnonKey;

if (!url || !publicKey) {
  throw new Error(
    'Supabase não configurado. Defina VITE_SUPABASE_URL e VITE_SUPABASE_PUBLISHABLE_KEY (ou a variável antiga VITE_SUPABASE_ANON_KEY) no .env ou nas variáveis do build'
  );
}

export const supabase = createClient(url, publicKey, {
  global: { fetch: fetchSemBearerDaChave(publicKey) },
});
