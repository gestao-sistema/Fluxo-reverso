-- Diagnostico somente de leitura para o schema atual do sistema.
-- Rode no Supabase SQL Editor. Nenhum dado ou estrutura e alterado.
-- OK = objeto encontrado/configurado; FALTA = revisar migration correspondente.

with verificacoes (item, ok, detalhe) as (
  select 'Tabela public.solicitacoes_reverso', to_regclass('public.solicitacoes_reverso') is not null, 'Tabela base das reversas'
  union all
  select 'Tabela public.solicitacoes_historico', to_regclass('public.solicitacoes_historico') is not null, 'Historico das reversas'
  union all
  select 'Tabela public.rastreamento_correios', to_regclass('public.rastreamento_correios') is not null, 'Eventos de rastreio'
  union all
  select 'Tabela public.nao_conformidades', to_regclass('public.nao_conformidades') is not null, 'Registro das NCs'
  union all
  select 'Tabela public.nc_historico', to_regclass('public.nc_historico') is not null, 'Linha do tempo das NCs'
  union all
  select 'Tabela public.nc_origens', to_regclass('public.nc_origens') is not null, 'Origens classificadas de NC'
  union all
  select 'Tabela public.nc_listas', to_regclass('public.nc_listas') is not null, 'Listas auxiliares das NCs'
  union all
  select 'View public.vw_nao_conformidades', exists (
    select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'vw_nao_conformidades' and c.relkind in ('v', 'm')
  ), 'View usada pelas telas e calculos de NC'
  union all
  select 'Colunas de vinculo NC/reversa', (
    select count(*) = 3 from information_schema.columns
    where table_schema = 'public' and table_name = 'solicitacoes_reverso'
      and column_name in ('nc_id', 'nc_numero', 'legado')
  ), 'Esperadas: nc_id, nc_numero e legado'
  union all
  select 'NC opcional para novas reversas', (
    exists (select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'solicitacoes_reverso'
        and column_name = 'nc_id' and is_nullable = 'YES')
    and not exists (select 1 from pg_constraint
      where conrelid = to_regclass('public.solicitacoes_reverso')
        and conname = 'solicitacoes_reverso_origem_nc_check')
  ), 'nc_id aceita NULL e nao existe a constraint antiga que exigia NC'
  union all
  select 'Colunas do PDF da etiqueta', (
    select count(*) = 3 from information_schema.columns
    where table_schema = 'public' and table_name = 'solicitacoes_reverso'
      and column_name in ('etiqueta_path', 'etiqueta_nome', 'etiqueta_enviada_em')
  ), 'Esperadas: etiqueta_path, etiqueta_nome e etiqueta_enviada_em'
  union all
  select 'Permissoes atuais no banco (current_telas)', coalesce((
    select pg_get_functiondef(p.oid) ilike '%from auth.users u%'
    from pg_proc p where p.oid = to_regprocedure('public.current_telas()')
  ), false), 'A versao atual consulta auth.users; a antiga lia as permissoes do JWT'
  union all
  select 'Funcoes de escopo de reversas', (
    to_regprocedure('public.empresas_permitidas()') is not null
    and to_regprocedure('public.empresas_formulario()') is not null
    and to_regprocedure('public.empresas_operaveis()') is not null
  ), 'empresas_permitidas, empresas_formulario e empresas_operaveis'
  union all
  select 'Filas operacionais por setor', (
    to_regprocedure('public.current_empresas_acesso()') is not null
    and to_regprocedure('public.empresas_aprovaveis()') is not null
    and exists (
      select 1 from pg_proc p
      where p.oid = to_regprocedure('public.empresas_permitidas()')
        and pg_get_functiondef(p.oid) ilike '%current_empresas_acesso%'
    )
    and exists (select 1 from pg_trigger where tgname = 'trg_validar_etapa_por_setor' and not tgisinternal)
    and exists (
      select 1 from pg_constraint
      where conrelid = to_regclass('public.solicitacoes_reverso')
        and conname = 'solicitacoes_reverso_status_check'
        and pg_get_constraintdef(oid) ilike '%aguardando_aprovacao%'
    )
  ), 'Escopo das empresas e status de aprovação; requer 20261021130000_setores_fluxo_reverso.sql'
  union all
  select 'Funcoes de NC e reversa', (
    to_regprocedure('public.pode_ver_nc()') is not null
    and to_regprocedure('public.pode_editar_nc()') is not null
    and to_regprocedure('public.ncs_para_reversa(text)') is not null
    and to_regprocedure('public.nc_sincronizar_numeracao()') is not null
  ), 'Permissoes, busca de NCs e sincronizacao da numeracao'
  union all
  select 'Funcoes de acesso a etiqueta', (
    to_regprocedure('public.pode_acessar_etiqueta(text)') is not null
    and to_regprocedure('public.pode_operar_etiqueta(text)') is not null
  ), 'Leitura e operacao do bucket privado'
  union all
  select 'Triggers de NC e vinculo', (
    exists (select 1 from pg_trigger where tgname = 'trg_nc_proteger_campos' and not tgisinternal)
    and exists (select 1 from pg_trigger where tgname = 'trg_nc_validar_listas' and not tgisinternal)
    and exists (select 1 from pg_trigger where tgname = 'trg_nc_historico' and not tgisinternal)
    and exists (select 1 from pg_trigger where tgname = 'trg_reversa_vincular_nc' and not tgisinternal)
    and exists (select 1 from pg_trigger where tgname = 'trg_reversa_historico_nc' and not tgisinternal)
  ), 'Validacao, historico automatico e vinculo NC/reversa'
  union all
  select 'RLS ativo nas tabelas novas', (
    coalesce((select relrowsecurity from pg_class where oid = to_regclass('public.nao_conformidades')), false)
    and coalesce((select relrowsecurity from pg_class where oid = to_regclass('public.nc_historico')), false)
    and coalesce((select relrowsecurity from pg_class where oid = to_regclass('public.nc_origens')), false)
    and coalesce((select relrowsecurity from pg_class where oid = to_regclass('public.nc_listas')), false)
  ), 'RLS ativo em NCs, historico e listas'
  union all
  select 'RLS e politicas de reversas', (
    coalesce((select relrowsecurity from pg_class where oid = to_regclass('public.solicitacoes_reverso')), false)
    and (select count(*) = 4 from pg_policies
      where schemaname = 'public' and tablename = 'solicitacoes_reverso'
        and policyname in (
          'select_solicitacoes_por_escopo', 'insert_solicitacoes_por_escopo',
          'update_solicitacoes_admins', 'delete_solicitacoes_admin'
        ))
  ), 'RLS ativo e 4 politicas de escopo das reversas'
  union all
  select 'Escopo atual de cadastro/alteracao de reversas', (
    exists (select 1 from pg_policies where schemaname = 'public'
      and tablename = 'solicitacoes_reverso' and policyname = 'insert_solicitacoes_por_escopo'
      and with_check ilike '%empresas_formulario%')
    and exists (select 1 from pg_policies where schemaname = 'public'
      and tablename = 'solicitacoes_reverso' and policyname = 'update_solicitacoes_admins'
      and qual ilike '%empresas_operaveis%' and with_check ilike '%empresas_operaveis%')
  ), 'Cadastro usa empresas_formulario; alteracao exige empresas_operaveis'
  union all
  select 'Politicas RLS de NC', (
    select count(*) = 10 from pg_policies
    where schemaname = 'public' and policyname in (
      'nc_select', 'nc_insert', 'nc_update', 'nc_delete',
      'nc_historico_select', 'nc_historico_insert_nota',
      'nc_origens_select', 'nc_origens_admin', 'nc_listas_select', 'nc_listas_admin'
    )
  ), 'Esperadas 10 politicas para NCs, historico e listas'
  union all
  select 'Bucket privado etiquetas', exists (
    select 1 from storage.buckets
    where id = 'etiquetas' and public = false
      and file_size_limit = 5242880
      and allowed_mime_types @> array['application/pdf']::text[]
  ), 'Privado, PDF e limite de 5 MB'
  union all
  select 'Politicas do bucket etiquetas', (
    select count(*) = 4 from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname in ('etiquetas_select', 'etiquetas_insert', 'etiquetas_update', 'etiquetas_delete')
      and (policyname = 'etiquetas_select' or coalesce(qual, '') ilike '%pode_operar_etiqueta%'
        or coalesce(with_check, '') ilike '%pode_operar_etiqueta%')
  ), 'Esperadas 4 politicas: select, insert, update e delete'
)
select case when ok then 'OK' else 'FALTA' end as status, item, detalhe
from verificacoes
order by case when ok then 1 else 0 end, item;

-- Verificacao opcional do agendamento Correios (rastreio a cada 30 min).
-- Rode esta consulta se pg_cron estiver habilitado:
-- select jobname, schedule, active from cron.job where jobname = 'correios-rastreio-30min';
-- A chave do cron deve existir no Vault; esta consulta mostra apenas o nome, nunca o segredo:
-- select name from vault.secrets where name = 'correios_cron_service_key';
