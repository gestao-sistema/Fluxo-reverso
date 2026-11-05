-- Diagnostico SOMENTE DE LEITURA para a publicacao SMTP.
-- Rode no SQL Editor do projeto ymrrguubkqbxndhoxhor antes de aplicar 20261028140000.
-- Nenhum dado, schema, permissao ou historico e alterado.
-- Rode tambem VERIFICAR_PUBLICACAO_CONVITES.sql para validar os objetos/permissoes de 20261028100000-130000.

with
funcoes(nome, assinatura, anon_executa, authenticated_executa, service_role_executa, migration) as (values
  ('admin_acesso_aprovacao_usuario', 'public.admin_acesso_aprovacao_usuario(uuid)', false, false, true, '20261028100000'),
  ('admin_salvar_escopo_aprovacao_usuario', 'public.admin_salvar_escopo_aprovacao_usuario(uuid, jsonb, uuid)', false, false, true, '20261028100000'),
  ('admin_convite_localizar_usuario', 'public.admin_convite_localizar_usuario(text)', false, false, true, '20261028110000'),
  ('admin_convite_preparar', 'public.admin_convite_preparar(uuid, text, uuid)', false, false, true, '20261028110000'),
  ('admin_convite_iniciar_envio', 'public.admin_convite_iniciar_envio(uuid, text, uuid, boolean)', false, false, true, '20261028120000'),
  ('admin_convites_listar', 'public.admin_convites_listar()', false, false, true, '20261028110000'),
  ('convite_senha_pendente', 'public.convite_senha_pendente()', false, true, true, '20261028120000'),
  ('reversa_iniciar_comunicacao_etiqueta', 'public.reversa_iniciar_comunicacao_etiqueta(uuid, uuid)', false, false, true, '20261027100000'),
  ('listar_comunicacoes_reversa', 'public.listar_comunicacoes_reversa(text, text, text, uuid, integer, integer)', false, true, false, '20261027110000'),
  ('listar_historico_comunicacao_reversa', 'public.listar_historico_comunicacao_reversa(uuid)', false, true, false, '20261027110000'),
  ('reconciliar_comunicacao_reversa', 'public.reconciliar_comunicacao_reversa(uuid, text, text, text)', false, true, false, '20261027110000'),
  ('admin_convite_finalizar_envio_smtp', 'public.admin_convite_finalizar_envio_smtp(uuid, text, integer, text)', false, false, true, '20261028140000'),
  ('reversa_claim_comunicacao_email', 'public.reversa_claim_comunicacao_email()', false, false, true, '20261028140000'),
  ('reversa_marcar_tentativa_comunicacao_smtp', 'public.reversa_marcar_tentativa_comunicacao_smtp(uuid, uuid)', false, false, true, '20261028140000'),
  ('reversa_finalizar_comunicacao_email', 'public.reversa_finalizar_comunicacao_email(uuid, uuid, text, integer, text)', false, false, true, '20261028140000')
),
itens(ordem, item, ok, detalhe) as (
  select 10, 'Base de permissões/aprovadores: tabela public.reversa_aprovadores_setor',
         to_regclass('public.reversa_aprovadores_setor') is not null,
         'Dependência anterior a 20261028100000'
  union all
  select 11, 'Base de aprovação: tabela public.reversa_aprovadores_setor_auditoria',
         to_regclass('public.reversa_aprovadores_setor_auditoria') is not null,
         'Dependência anterior a 20261028100000'
  union all
  select 12, 'Base de convites: tabela public.convites_acesso com RLS',
         to_regclass('public.convites_acesso') is not null
           and coalesce((select relrowsecurity from pg_class where oid = to_regclass('public.convites_acesso')), false),
         'Dependência das migrations 20261028110000-140000'
  union all
  select 13, 'Convites: anon/authenticated sem acesso direto',
         to_regclass('public.convites_acesso') is not null
           and not has_table_privilege('anon', 'public.convites_acesso', 'SELECT, INSERT, UPDATE, DELETE')
           and not has_table_privilege('authenticated', 'public.convites_acesso', 'SELECT, INSERT, UPDATE, DELETE'),
         'Esperado: acesso somente pela Edge Function/service_role'
  union all
  select 14, 'Fila: tabela public.reversa_comunicacoes_etiqueta',
         to_regclass('public.reversa_comunicacoes_etiqueta') is not null,
         'Dependência da cadeia de comunicações até 20261027100000'
  union all
  select 15, 'Fila: tabela public.reversa_comunicacoes_etiqueta_tentativas',
         to_regclass('public.reversa_comunicacoes_etiqueta_tentativas') is not null,
         'Dependência da cadeia de comunicações até 20261027100000'
  union all
  select 16, 'Fila: tabela public.reversa_comunicacoes_reconciliacoes',
         to_regclass('public.reversa_comunicacoes_reconciliacoes') is not null,
         'Dependência da migration 20261027110000'
  union all
  select 17, 'Proteção de senha pendente: current_telas chama convite_senha_pendente',
         coalesce((select pg_get_functiondef(to_regprocedure('public.current_telas()')) ilike '%convite_senha_pendente%'), false),
         'Dependência da migration 20261028130000; preserva usuários antigos sem convite'
  union all
  select 18, 'Proteção de senha pendente: current_perfil_legacy chama convite_senha_pendente',
         coalesce((select pg_get_functiondef(to_regprocedure('public.current_perfil_legacy()')) ilike '%convite_senha_pendente%'), false),
         'Dependência da migration 20261028130000'
  union all
  select 19, 'Proteção de senha pendente: is_admin chama convite_senha_pendente',
         coalesce((select pg_get_functiondef(to_regprocedure('public.is_admin()')) ilike '%convite_senha_pendente%'), false),
         'Dependência da migration 20261028130000'
  union all
  select 20, 'Proteção de senha pendente: is_mestre chama convite_senha_pendente',
         coalesce((select pg_get_functiondef(to_regprocedure('public.is_mestre()')) ilike '%convite_senha_pendente%'), false),
         'Dependência da migration 20261028130000'
  union all
  select 21, 'Recuperação preservada: reserva aceita conta confirmada sem senha de convite',
         coalesce((select pg_get_functiondef(to_regprocedure('public.admin_convite_iniciar_envio(uuid, text, uuid, boolean)')) ilike '%v_tem_senha%'), false),
         'Versão da migration 20261028120000'
  union all
  select 22, 'SMTP convite: coluna public.convites_acesso.ultimo_smtp integer',
         exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'convites_acesso' and column_name = 'ultimo_smtp' and data_type = 'integer'),
         'Migration 20261028140000'
  union all
  select 23, 'SMTP fila: coluna reversa_comunicacoes_etiqueta.smtp_aceito_em',
         exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'reversa_comunicacoes_etiqueta' and column_name = 'smtp_aceito_em' and data_type = 'timestamp with time zone'),
         'Migration 20261028140000'
  union all
  select 24, 'SMTP tentativas: colunas transporte e codigo_smtp',
         exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'reversa_comunicacoes_etiqueta_tentativas' and column_name = 'transporte' and data_type = 'text')
           and exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'reversa_comunicacoes_etiqueta_tentativas' and column_name = 'codigo_smtp' and data_type = 'integer'),
         'Migration 20261028140000; campos nulos preservam histórico anterior'
  union all
  select 25, 'SMTP claim reserva somente o canal email',
         coalesce((select pg_get_functiondef(to_regprocedure('public.reversa_claim_comunicacao_email()')) ilike '%c.canal = ''email''%'), false),
         'Migration 20261028140000; Teams não deve ser retirado da fila'
  union all
  select 26, 'SMTP status da fila aceita smtp_aceito',
         coalesce((select pg_get_constraintdef(oid) ilike '%smtp_aceito%' from pg_constraint where conrelid = to_regclass('public.reversa_comunicacoes_etiqueta') and conname = 'reversa_comunicacoes_etiqueta_status_check'), false),
         'Migration 20261028140000'
  union all
  select 27, 'SMTP status de tentativa aceita smtp_aceito',
         coalesce((select pg_get_constraintdef(oid) ilike '%smtp_aceito%' from pg_constraint where conrelid = to_regclass('public.reversa_comunicacoes_etiqueta_tentativas') and conname = 'reversa_comunicacoes_etiqueta_tentativas_resultado_check'), false),
         'Migration 20261028140000'
  union all
  select 28 + row_number() over (order by f.migration, f.nome)::int,
         'Função ' || f.assinatura,
         to_regprocedure(f.assinatura) is not null
           and coalesce(has_function_privilege('anon', to_regprocedure(f.assinatura), 'EXECUTE'), false) = f.anon_executa
           and coalesce(has_function_privilege('authenticated', to_regprocedure(f.assinatura), 'EXECUTE'), false) = f.authenticated_executa
           and coalesce(has_function_privilege('service_role', to_regprocedure(f.assinatura), 'EXECUTE'), false) = f.service_role_executa,
         'Permissões de execução esperadas; migration ' || f.migration
  from funcoes f
),
marcadores_smtp(nome, presente) as (values
  ('coluna convites_acesso.ultimo_smtp', exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'convites_acesso' and column_name = 'ultimo_smtp')),
  ('coluna fila.smtp_aceito_em', exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'reversa_comunicacoes_etiqueta' and column_name = 'smtp_aceito_em')),
  ('coluna tentativas.transporte', exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'reversa_comunicacoes_etiqueta_tentativas' and column_name = 'transporte')),
  ('coluna tentativas.codigo_smtp', exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'reversa_comunicacoes_etiqueta_tentativas' and column_name = 'codigo_smtp')),
  ('constraint convites_acesso_ultimo_smtp_check', exists (select 1 from pg_constraint where conrelid = to_regclass('public.convites_acesso') and conname = 'convites_acesso_ultimo_smtp_check')),
  ('constraint tentativas_transporte_check', exists (select 1 from pg_constraint where conrelid = to_regclass('public.reversa_comunicacoes_etiqueta_tentativas') and conname = 'reversa_comunicacoes_tentativas_transporte_check')),
  ('constraint tentativas_codigo_smtp_check', exists (select 1 from pg_constraint where conrelid = to_regclass('public.reversa_comunicacoes_etiqueta_tentativas') and conname = 'reversa_comunicacoes_tentativas_codigo_smtp_check')),
  ('status da fila contém smtp_aceito', coalesce((select pg_get_constraintdef(oid) ilike '%smtp_aceito%' from pg_constraint where conrelid = to_regclass('public.reversa_comunicacoes_etiqueta') and conname = 'reversa_comunicacoes_etiqueta_status_check'), false)),
  ('status da tentativa contém smtp_aceito', coalesce((select pg_get_constraintdef(oid) ilike '%smtp_aceito%' from pg_constraint where conrelid = to_regclass('public.reversa_comunicacoes_etiqueta_tentativas') and conname = 'reversa_comunicacoes_etiqueta_tentativas_resultado_check'), false)),
  ('função admin_convite_limpar_codigo_smtp', to_regprocedure('public.admin_convite_limpar_codigo_smtp()') is not null),
  ('trigger admin_convite_limpar_codigo_smtp', exists (select 1 from pg_trigger where tgrelid = to_regclass('public.convites_acesso') and tgname = 'admin_convite_limpar_codigo_smtp' and not tgisinternal)),
  ('função admin_convite_finalizar_envio_smtp', to_regprocedure('public.admin_convite_finalizar_envio_smtp(uuid, text, integer, text)') is not null),
  ('função reversa_claim_comunicacao_email', to_regprocedure('public.reversa_claim_comunicacao_email()') is not null),
  ('função reversa_marcar_tentativa_comunicacao_smtp', to_regprocedure('public.reversa_marcar_tentativa_comunicacao_smtp(uuid, uuid)') is not null),
  ('função reversa_finalizar_comunicacao_email', to_regprocedure('public.reversa_finalizar_comunicacao_email(uuid, uuid, text, integer, text)') is not null),
  ('corpo do trigger de substituição reconhece SMTP', coalesce((select pg_get_functiondef(to_regprocedure('public.reversa_comunicacao_apos_substituicao()')) ilike '%smtp_aceito%' from pg_proc where oid = to_regprocedure('public.reversa_comunicacao_apos_substituicao()')), false)),
  ('listar_comunicacoes_reversa inclui smtp_aceito_em', coalesce((select pg_get_functiondef(to_regprocedure('public.listar_comunicacoes_reversa(text, text, text, uuid, integer, integer)')) ilike '%smtp_aceito_em%' from pg_proc where oid = to_regprocedure('public.listar_comunicacoes_reversa(text, text, text, uuid, integer, integer)')), false)),
  ('histórico inclui codigo_smtp', coalesce((select pg_get_functiondef(to_regprocedure('public.listar_historico_comunicacao_reversa(uuid)')) ilike '%codigo_smtp%' from pg_proc where oid = to_regprocedure('public.listar_historico_comunicacao_reversa(uuid)')), false)),
  ('reconciliação distingue transporte SMTP', coalesce((select pg_get_functiondef(to_regprocedure('public.reconciliar_comunicacao_reversa(uuid, text, text, text)')) ilike '%v_transporte = ''smtp''%' from pg_proc where oid = to_regprocedure('public.reconciliar_comunicacao_reversa(uuid, text, text, text)')), false))
),
estado_migration_smtp as (
  select count(*) filter (where presente)::integer as presentes, count(*)::integer as total
  from marcadores_smtp
)
select case when ok then 'OK' else 'FALTA' end as status, item, detalhe
from itens
union all
select case when presentes in (0, total) then 'OK' else 'FALTA' end,
       'Inventário da migration 20261028140000 (19 marcadores)',
       case when presentes = 0 then 'AUSENTE integralmente: a migration pode ser aplicada após conferir todas as dependências.'
            when presentes = total then 'APLICADA integralmente: todos os marcadores SMTP estão presentes.'
            else 'PARCIAL/DIVERGENTE: ' || presentes || ' de ' || total || ' marcadores presentes; não execute a migration inteira.'
       end
from estado_migration_smtp
order by status, item;
