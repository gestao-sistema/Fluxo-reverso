-- Diagnostico SOMENTE DE LEITURA: o que falta no banco para publicar o cadastro por convite
-- e o cadastro por tela (Edge Function admin-usuarios nova + front-end).
-- Rode no Supabase SQL Editor do banco de destino. Nenhum dado, estrutura ou permissao e alterado.
-- Cada linha diz OK ou FALTA e qual migration cobre o objeto. Aplique SOMENTE as migrations das linhas
-- que faltam, na ordem do nome do arquivo (nunca o pacote SQL_EDITOR completo).
--
-- Ordem de leitura: 1) base da cadeia que o admin-usuarios usa; 2) 20261028100000 (cadastro por tela);
-- 3) 20261028110000 (convites); 4) 20261028120000 (senha pendente); 5) 20261028130000 (bloqueio antes da senha).

with
funcoes(nome, assinatura, anon_executa, authenticated_executa, service_role_executa, migration) as (values
  ('is_admin',                                'public.is_admin()',                                   null,  null,  null,  'cadeia anterior (20261020130000)'),
  ('current_telas',                           'public.current_telas()',                              null,  null,  null,  'cadeia anterior (20261020130000)'),
  ('current_perfil_legacy',                   'public.current_perfil_legacy()',                      null,  null,  null,  'cadeia anterior (20261020130000)'),
  ('is_mestre',                               'public.is_mestre()',                                  false, true,  true,  '20261028100000'),
  ('admin_acesso_aprovacao_usuario',          'public.admin_acesso_aprovacao_usuario(uuid)',         false, false, true,  '20261028100000'),
  ('admin_salvar_escopo_aprovacao_usuario',   'public.admin_salvar_escopo_aprovacao_usuario(uuid, jsonb, uuid)', false, false, true, '20261028100000'),
  ('admin_convite_localizar_usuario',         'public.admin_convite_localizar_usuario(text)',        false, false, true,  '20261028110000'),
  ('admin_convite_preparar',                  'public.admin_convite_preparar(uuid, text, uuid)',     false, false, true,  '20261028110000'),
  ('admin_convite_iniciar_envio',             'public.admin_convite_iniciar_envio(uuid, text, uuid, boolean)', false, false, true, '20261028110000'),
  ('admin_convite_finalizar_envio',           'public.admin_convite_finalizar_envio(uuid, text, integer, text)', false, false, true, '20261028110000'),
  ('admin_convites_listar',                   'public.admin_convites_listar()',                      false, false, true,  '20261028110000'),
  ('convite_senha_pendente',                  'public.convite_senha_pendente()',                     false, true,  true,  '20261028120000')
),
verificacoes (ordem, item, ok, detalhe) as (
  -- 1) Tabelas e funcoes existentes + permissoes de execucao esperadas
  select 10, 'Tabela public.reversa_aprovadores_setor', to_regclass('public.reversa_aprovadores_setor') is not null,
         'Escopo de aprovacao gravado pelo cadastro por tela (20261023190000)'
  union all
  select 11, 'Tabela public.reversa_aprovadores_setor_auditoria', to_regclass('public.reversa_aprovadores_setor_auditoria') is not null,
         'Auditoria do escopo de aprovacao (20261023190000)'
  union all
  select 20 + row_number() over (order by f.migration, f.nome)::int,
         'Funcao ' || f.assinatura,
         to_regprocedure(f.assinatura) is not null
           and (f.anon_executa is null or has_function_privilege('anon', to_regprocedure(f.assinatura), 'EXECUTE') = f.anon_executa)
           and (f.authenticated_executa is null or has_function_privilege('authenticated', to_regprocedure(f.assinatura), 'EXECUTE') = f.authenticated_executa)
           and (f.service_role_executa is null or has_function_privilege('service_role', to_regprocedure(f.assinatura), 'EXECUTE') = f.service_role_executa),
         'Existe com as permissoes de execucao esperadas; migration: ' || f.migration
  from funcoes f
  -- 2) Regra de acesso por tela vigente (20261028100000)
  union all
  select 60, 'Escopo de consulta sem o atalho do administrador',
         coalesce((select pg_get_functiondef(p.oid) ilike '%is_mestre%'
                   from pg_proc p where p.oid = to_regprocedure('public.empresas_permitidas()')), false),
         'empresas_permitidas passa a usar is_mestre() (20261028100000); sem isso, quem so tem a tela "usuarios" ainda veria pedidos'
  union all
  select 61, 'Acesso bloqueado ate definir senha do convite',
         coalesce((
           select bool_and(to_regprocedure(f.assinatura) is not null
             and pg_get_functiondef(to_regprocedure(f.assinatura)) ilike '%convite_senha_pendente%')
           from (values
             ('public.current_telas()'),
             ('public.current_perfil_legacy()'),
             ('public.is_admin()'),
             ('public.is_mestre()')
           ) as f(assinatura)
         ), false),
         'Helpers centrais negam permissoes enquanto a conta de convite estiver sem senha (20261028130000)'
  -- 3) Tabela de convites (20261028110000): sem coluna de link/token, RLS ligada, sem acesso direto
  union all
  select 70, 'Tabela public.convites_acesso', to_regclass('public.convites_acesso') is not null,
         'Estado do envio do convite (20261028110000)'
  union all
  select 71, 'convites_acesso: RLS ligada e sem acesso direto de anon/authenticated',
         coalesce((select relrowsecurity from pg_class where oid = to_regclass('public.convites_acesso')), false)
           and not has_table_privilege('anon', 'public.convites_acesso', 'SELECT, INSERT, UPDATE, DELETE')
           and not has_table_privilege('authenticated', 'public.convites_acesso', 'SELECT, INSERT, UPDATE, DELETE')
           and not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'convites_acesso'),
         'Somente service_role (Edge Function) acessa a tabela'
  union all
  select 72, 'convites_acesso: nenhuma coluna guarda link, token ou senha',
         to_regclass('public.convites_acesso') is not null
           and not exists (
             select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'convites_acesso'
               and column_name ~* '(link|token|url|senha|password|secret)'
           ),
         'O link do convite e uma credencial e nunca e gravado'
  -- 4) Regra nova da reserva (20261028120000): conta confirmada sem senha, vinda de convite, aceita novo link
  union all
  select 80, 'admin_convite_iniciar_envio na versao 20261028120000',
         coalesce((select pg_get_functiondef(p.oid) ilike '%v_tem_senha%'
                   from pg_proc p where p.oid = to_regprocedure('public.admin_convite_iniciar_envio(uuid, text, uuid, boolean)')), false),
         'Sem esta versao, "Reenviar" para quem abriu o convite e nao definiu a senha e recusado como conta ativa'
)
select case when ok then 'OK' else 'FALTA' end as status, item, detalhe
from verificacoes
order by case when ok then 1 else 0 end, ordem;

-- Leituras complementares (somente leitura; rode se existirem):
--
-- a) Historico de migrations do Supabase (se a tabela existir). Compare com a lista de
--    docs/homologacao-logistica-reversa.md ("Banco de destino"), que agora inclui as versoes
--    20261027140000, 20261028100000, 20261028110000, 20261028120000 e 20261028130000:
--      select version from supabase_migrations.schema_migrations order by version;
--
-- b) Cadastro publico de usuarios (deve estar DESABILITADO): Authentication > Sign In / Providers >
--    "Allow new users to sign up" desligado. Conferencia sem credencial administrativa:
--      GET https://<ref>.supabase.co/auth/v1/settings   ->   "disable_signup": true
--
-- c) Usuarios que ja abriram o convite e ainda nao definiram a senha (nao lista senhas nem tokens):
--      select c.usuario_id, c.email, c.estado, c.tentativas
--        from public.convites_acesso c join auth.users u on u.id = c.usuario_id
--       where u.email_confirmed_at is not null and coalesce(u.encrypted_password, '') = '';
