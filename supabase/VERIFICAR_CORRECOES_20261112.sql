-- ============================================================
-- Conferência SOMENTE LEITURA das correções de 12/11/2026 (Reverso, ymrrguubkqbxndhoxhor)
-- ------------------------------------------------------------
-- Rodar ANTES e DEPOIS de aplicar as migrations (SQL Editor ou
-- `supabase db query --remote --read-only -f supabase/VERIFICAR_CORRECOES_20261112.sql`).
-- Só SELECT de catálogo e contagens; nenhum dado pessoal é exibido.
--
-- Esperado ANTES (12/11/2026): lixeira=false, autoaprovacao_travada=false, autoria_conhecida=false,
--   etiqueta_por_pedido=false, admin_liga_autoaprovacao=true, delete_fisico_ativo=true.
-- Esperado DEPOIS do passo 1 (Lixeira + 20261112100000 + 20261112120000): todos os itens "true"
--   abaixo verdadeiros, admin_liga_autoaprovacao=false, delete_fisico_ativo=false.
-- fila_decisao_terceiros só fica true depois do passo 2 (cadeia NC + 20261112110000).
-- ============================================================
select
  -- Lixeira (20261030120000)
  to_regprocedure('public.inutilizar_chamado(uuid)') is not null              as lixeira,
  to_regprocedure('public.restaurar_chamado(uuid)') is not null               as lixeira_restaurar,
  to_regprocedure('public.listar_chamados_lixeira()') is not null             as lixeira_listar,
  to_regprocedure('public.solicitacao_na_lixeira(uuid)') is not null          as lixeira_trilhas,
  coalesce(has_function_privilege('authenticated', to_regprocedure('public.inutilizar_chamado(uuid)'), 'EXECUTE'), false) as lixeira_exec_authenticated,
  exists (select 1 from pg_policy where polrelid = 'public.solicitacoes_reverso'::regclass
           and polname = 'delete_solicitacoes_admin')                         as delete_fisico_ativo,
  -- Aprovação só por terceiros (20261112100000)
  exists (select 1 from pg_constraint where conrelid = 'public.aprovacao_config'::regclass
           and conname = 'aprovacao_config_sem_autoaprovacao')                as autoaprovacao_travada,
  has_column_privilege('authenticated', 'public.aprovacao_config', 'permitir_autoaprovacao', 'UPDATE') as admin_liga_autoaprovacao,
  (select permitir_autoaprovacao from public.aprovacao_config where id)       as permitir_autoaprovacao,
  to_regprocedure('public.reversa_autoria_conhecida(uuid,uuid)') is not null  as autoria_conhecida,
  coalesce((select p.prosrc like '%nem rejeitar%' from pg_proc p
             where p.oid = to_regprocedure('public.registrar_decisao_reversa(uuid,text,integer,text)')), false) as decisao_bloqueia_autor,
  coalesce(has_function_privilege('authenticated', to_regprocedure('public.registrar_decisao_reversa(uuid,text,integer,text)'), 'EXECUTE'), false) as decisao_interna_exposta,
  -- Fila coerente (20261112110000; exige a cadeia NC)
  coalesce((select p.prosrc like '%reversa_autoria_conhecida%' from pg_proc p
             where p.oid = to_regprocedure('public.fila_aprovacao_reversas()')), false) as fila_decisao_terceiros,
  -- Leitura do PDF pelo pedido (20261112120000)
  coalesce((select p.prosrc like '%pode_ler_solicitacao(r.id)%' and p.prosrc like '%inutilizada_em is not null and public.is_admin()%'
              from pg_proc p where p.oid = to_regprocedure('public.pode_acessar_etiqueta(text)')), false) as etiqueta_por_pedido,
  (select public from storage.buckets where id = 'etiquetas')                 as bucket_etiquetas_publico,
  -- Sino (20261109150000), já aplicado fora do ledger antes de 12/11/2026
  to_regprocedure('public.listar_avisos_reverso(integer)') is not null        as avisos,
  -- Exclusão de usuário preserva comunicações (20261111193000)
  exists (select 1 from pg_attribute where attrelid = 'public.reversa_comunicacoes_etiqueta'::regclass
           and attname = 'destinatario_desvinculado' and not attisdropped)    as comunicacoes_preservadas,
  -- Decisões tomadas pelo próprio autor (deve continuar 0)
  (select count(*) from public.solicitacoes_aprovacoes a join public.solicitacoes_reverso r on r.id = a.solicitacao_id
    where a.evento in ('aprovada', 'rejeitada') and a.user_id is not null and a.user_id = r.solicitado_por) as decisoes_pelo_autor,
  -- Ledger
  (select count(*) from supabase_migrations.schema_migrations)               as versoes_no_ledger,
  (select string_agg(version, ',' order by version) from supabase_migrations.schema_migrations
    where version >= '20261030120000')                                        as ledger_recentes;
