-- ============================================================================
-- DESABILITA o agendamento do worker de comunicação da logística reversa.
-- Remove somente o job comunicacao-reversa-5min. A fila e o histórico não são
-- alterados; mensagens pendentes ficam esperando. Reversível com
-- habilitar-worker-comunicacao.sql.
--
-- Desligamento adicional sem tocar no banco: alterar ETIQUETA_TRANSPORTE da Edge
-- Function para "simulado" (a função passa a só contar pendências).
-- ============================================================================
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule('comunicacao-reversa-5min')
      where exists (select 1 from cron.job where jobname = 'comunicacao-reversa-5min');
  end if;
end
$$;

-- Conferência: deve retornar zero linhas.
-- select jobid, jobname, active from cron.job where jobname = 'comunicacao-reversa-5min';
