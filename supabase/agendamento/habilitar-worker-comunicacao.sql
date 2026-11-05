-- ============================================================================
-- HABILITA o agendamento do worker de comunicação da logística reversa.
-- NÃO faz parte das migrations nem do pacote do SQL Editor: é um passo operacional,
-- executado manualmente no SQL Editor do projeto (primeiro em homologação).
--
-- Mecanismo: pg_cron + pg_net + Vault, o mesmo já usado em src/sql/setup_cron_rastreio.sql.
-- A chamada é autenticada com a chave service_role lida do Vault a cada execução; nenhuma
-- chave ou URL fica neste arquivo.
--
-- Pré-requisitos (uma vez, valores digitados direto no SQL Editor, nunca em arquivo/chat):
--   1) Extensões pg_cron e pg_net habilitadas (Database > Extensions).
--   2) select vault.create_secret('<URL-DO-PROJETO>/functions/v1/comunicacao-etiqueta',
--        'comunicacao_cron_url', 'URL da Edge Function comunicacao-etiqueta');
--   3) select vault.create_secret('<CHAVE-SERVICE-ROLE>',
--        'comunicacao_cron_service_key', 'Chave service_role do worker de comunicação');
--   4) Edge Function publicada com verify_jwt=true e os segredos descritos em
--      docs/power-automate/comunicacao-etiqueta-reversa.md.
--
-- Efeito: a cada 5 minutos o worker é chamado. Enquanto ETIQUETA_TRANSPORTE da função
-- não for "power_automate" (com OAuth e URL do fluxo), cada chamada apenas CONTA as
-- pendências e não altera a fila: habilitar o agendamento não envia nada sozinho.
--
-- Para parar: executar desabilitar-worker-comunicacao.sql.
-- ============================================================================
do $$
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    raise exception 'Habilite a extensão pg_cron antes de agendar o worker.';
  end if;
  if not exists (select 1 from pg_extension where extname = 'pg_net') then
    raise exception 'Habilite a extensão pg_net antes de agendar o worker.';
  end if;
  if not exists (select 1 from vault.decrypted_secrets where name = 'comunicacao_cron_url') then
    raise exception 'Cadastre o segredo comunicacao_cron_url no Vault (veja o cabeçalho deste arquivo).';
  end if;
  if not exists (select 1 from vault.decrypted_secrets where name = 'comunicacao_cron_service_key') then
    raise exception 'Cadastre o segredo comunicacao_cron_service_key no Vault (veja o cabeçalho deste arquivo).';
  end if;

  perform cron.unschedule('comunicacao-reversa-5min')
    where exists (select 1 from cron.job where jobname = 'comunicacao-reversa-5min');

  perform cron.schedule(
    'comunicacao-reversa-5min',
    '*/5 * * * *',
    $job$
    select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'comunicacao_cron_url'),
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'comunicacao_cron_service_key'),
        'Content-Type', 'application/json'
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 120000
    );
    $job$
  );
end
$$;

-- Conferência (somente leitura):
-- select jobid, jobname, schedule, active from cron.job where jobname = 'comunicacao-reversa-5min';
-- select status, return_message, start_time from cron.job_run_details
--   where jobid = (select jobid from cron.job where jobname = 'comunicacao-reversa-5min')
--   order by start_time desc limit 10;
