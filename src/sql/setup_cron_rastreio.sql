-- ============================================================
-- Migração: setup do cron (pg_cron + pg_net)
-- Executar no Supabase SQL Editor
-- ------------------------------------------------------------
-- A chave usada pelo cron fica no Supabase Vault — nunca neste arquivo
-- (o repositório é público). Depois de rotacionar a chave service_role,
-- grave a nova no Vault (passo 1) e reagende o cron (passo 2).
-- ============================================================

-- Requer extensões pg_cron e pg_net (habilitar em Database > Extensions no painel Supabase)
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- 1) Rode uma vez no SQL Editor, trocando o valor pela chave nova (não salve a chave em arquivo):
--    select vault.create_secret('<NOVA_CHAVE_SERVICE_ROLE>', 'correios_cron_service_key', 'Chave do cron de rastreio dos Correios');
--    Para trocar depois: select vault.update_secret(id, '<OUTRA_CHAVE>') from vault.secrets where name = 'correios_cron_service_key';

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
      'Authorization', 'Bearer ' || (
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
