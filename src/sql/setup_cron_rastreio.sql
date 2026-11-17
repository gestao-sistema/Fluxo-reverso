-- ============================================================
-- Migração: setup do cron (pg_cron + pg_net)
-- Executar no Supabase SQL Editor
-- ------------------------------------------------------------
-- A chave secreta usada pelo cron fica no Supabase Vault — nunca neste arquivo
-- (o repositório é público). Durante a migração, o handler aceita a chave antiga.
-- Grave sb_secret no Vault e atualize o cron antes de desativar service_role.
-- ============================================================

-- Requer extensões pg_cron e pg_net (habilitar em Database > Extensions no painel Supabase)
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- 1) Depois de criar a chave sb_secret no Dashboard, atualize o valor no Vault pelo SQL Editor.
--    Nunca salve a chave em arquivo ou histórico do shell:
--    select vault.update_secret(id, '<SB_SECRET>', 'Chave secreta do cron dos Correios') from vault.secrets where name = 'correios_cron_service_key';
--    Se o segredo ainda não existir, use vault.create_secret('<SB_SECRET>', 'correios_cron_service_key', 'Chave secreta do cron dos Correios').

-- 2) (Re)agenda o cron lendo a chave do Vault a cada execução
SELECT cron.unschedule('correios-rastreio-30min')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'correios-rastreio-30min');

SELECT cron.schedule(
  'correios-rastreio-30min',
  '*/30 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://ymrrguubkqbxndhoxhor.supabase.co/functions/v1/correios-rastreio',
    headers := jsonb_build_object(
      'apikey', (
        SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'correios_cron_service_key'
      ),
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  );
  $$
);

-- Para remover caso precise:
-- SELECT cron.unschedule('correios-rastreio-30min');
