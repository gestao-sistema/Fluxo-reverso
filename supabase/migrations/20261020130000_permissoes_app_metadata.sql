-- ============================================================
-- Permissões em app_metadata + escopo por lista de empresas
-- ------------------------------------------------------------
-- Antes, as telas ficavam em user_metadata, que o próprio usuário altera com
-- supabase.auth.updateUser({ data }). As policies e a Edge Function
-- admin-usuarios confiavam nesse campo: qualquer usuário logado podia se dar
-- a tela 'usuarios' (admin).
-- Agora as telas ficam em app_metadata (só o service_role grava) e são lidas
-- direto de auth.users a cada consulta: mudanças e revogações valem na hora,
-- sem esperar o token expirar. O escopo de empresa é uma lista (quem tem
-- telas de Alinare e de Novitah acessa as duas), separado em leitura,
-- cadastro e movimentação.
--
-- Idempotente: pode ser executada mais de uma vez.
-- Ordem: publique antes a Edge Function admin-usuarios nova (ela já lê
-- app_metadata) e rode esta migration logo em seguida. O resultado final é a
-- auditoria das telas de cada usuário: confira antes de seguir.
-- ============================================================

-- 1. Copia as telas para app_metadata (só de quem ainda não tem).
--    user_metadata fica como está até o deploy do frontend novo.
--    ATENÇÃO: user_metadata era editável pelo usuário — revise a auditoria no fim.
update auth.users
set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || jsonb_build_object(
  'telas',
  case
    when jsonb_typeof(raw_user_meta_data -> 'telas') = 'array'
     and jsonb_array_length(raw_user_meta_data -> 'telas') > 0
      then raw_user_meta_data -> 'telas'
    -- Perfis legados (anteriores às telas granulares)
    when raw_user_meta_data ->> 'perfil' = 'ADMIN' then '["usuarios"]'::jsonb
    when raw_user_meta_data ->> 'perfil' = 'Expedicao' then '["dashboard-geral","lista-geral","kanban","kanban-edit"]'::jsonb
    when raw_user_meta_data ->> 'perfil' = 'Alinare' then '["dashboard-alinare","formulario-alinare","lista-alinare"]'::jsonb
    when raw_user_meta_data ->> 'perfil' = 'Novitah' then '["dashboard-novitah","formulario-novitah","lista-novitah"]'::jsonb
    else '[]'::jsonb
  end
)
where not (coalesce(raw_app_meta_data, '{}'::jsonb) ? 'telas');

-- 2. Permissões do usuário logado, lidas de auth.users (não do token)
create or replace function public.current_telas() returns text[]
language sql stable security definer
set search_path = ''
as $$
  select coalesce(
    (
      select array(
        select jsonb_array_elements_text(
          case
            when jsonb_typeof(u.raw_app_meta_data -> 'telas') = 'array' then u.raw_app_meta_data -> 'telas'
            else '[]'::jsonb
          end
        )
      )
      from auth.users u
      where u.id = auth.uid()
    ),
    '{}'::text[]
  );
$$;

create or replace function public.current_perfil_legacy() returns text
language sql stable security definer
set search_path = ''
as $$
  select coalesce((select u.raw_app_meta_data ->> 'perfil' from auth.users u where u.id = auth.uid()), '');
$$;

create or replace function public.is_admin() returns boolean
language sql stable security definer
set search_path = ''
as $$
  select ('usuarios' = any (public.current_telas())) or public.current_perfil_legacy() = 'ADMIN';
$$;

-- Leitura: empresas cujas reversas o usuário vê.
-- Telas gerais (e as de NC, que abrangem todas as empresas) liberam as duas.
create or replace function public.empresas_permitidas() returns text[]
language sql stable security definer
set search_path = ''
as $$
  select case
    when public.is_admin()
      or public.current_telas() && array['dashboard-geral', 'lista-geral', 'status-geral', 'kanban', 'kanban-edit', 'nc', 'nc-edit']::text[]
      then array['Alinare', 'Novitah']::text[]
    else array_remove(array[
      case when public.current_telas() && array['dashboard-alinare', 'formulario-alinare', 'lista-alinare', 'status-alinare']::text[] then 'Alinare' end,
      case when public.current_telas() && array['dashboard-novitah', 'formulario-novitah', 'lista-novitah', 'status-novitah']::text[] then 'Novitah' end
    ]::text[], null)
  end;
$$;

-- Cadastro: empresas em que o usuário abre o formulário de reversa
-- (formulário da empresa, ou 'nc-edit' gerando a reversa a partir da NC).
create or replace function public.empresas_formulario() returns text[]
language sql stable security definer
set search_path = ''
as $$
  select case
    when public.is_admin() or 'nc-edit' = any (public.current_telas())
      then array['Alinare', 'Novitah']::text[]
    else array_remove(array[
      case when 'formulario-alinare' = any (public.current_telas()) then 'Alinare' end,
      case when 'formulario-novitah' = any (public.current_telas()) then 'Novitah' end
    ]::text[], null)
  end;
$$;

-- Movimentação: empresas em que o usuário altera reversas (etapa, rastreio,
-- anotações, etiqueta). Só telas operacionais contam — consultar NC não dá escrita.
create or replace function public.empresas_operaveis() returns text[]
language sql stable security definer
set search_path = ''
as $$
  select case
    when public.is_admin()
      or public.current_telas() && array['lista-geral', 'status-geral', 'kanban', 'kanban-edit']::text[]
      then array['Alinare', 'Novitah']::text[]
    else array_remove(array[
      case when public.current_telas() && array['lista-alinare', 'status-alinare']::text[] then 'Alinare' end,
      case when public.current_telas() && array['lista-novitah', 'status-novitah']::text[] then 'Novitah' end
    ]::text[], null)
  end;
$$;

-- 3. Policies de solicitacoes_reverso (subconsulta: a função roda uma vez por consulta, não por linha)
drop policy if exists "select_solicitacoes_por_escopo" on public.solicitacoes_reverso;
create policy "select_solicitacoes_por_escopo" on public.solicitacoes_reverso
  for select to authenticated
  using (empresa in (select unnest(public.empresas_permitidas())));

drop policy if exists "insert_solicitacoes_por_escopo" on public.solicitacoes_reverso;
create policy "insert_solicitacoes_por_escopo" on public.solicitacoes_reverso
  for insert to authenticated
  with check (empresa in (select unnest(public.empresas_formulario())));

drop policy if exists "update_solicitacoes_admins" on public.solicitacoes_reverso;
create policy "update_solicitacoes_admins" on public.solicitacoes_reverso
  for update to authenticated
  using (empresa in (select unnest(public.empresas_operaveis())))
  with check (empresa in (select unnest(public.empresas_operaveis())));

drop policy if exists "delete_solicitacoes_admin" on public.solicitacoes_reverso;
create policy "delete_solicitacoes_admin" on public.solicitacoes_reverso
  for delete to authenticated
  using ((select public.is_admin()));

-- O escopo de uma única empresa foi substituído pelas funções acima.
drop function if exists public.current_empresa_scope();

-- 4. Auditoria: confira quem ficou com cada tela antes de seguir.
--    Atenção especial a 'usuarios' (admin) e a contas desconhecidas: como
--    user_metadata era editável, alguém pode ter se dado telas.
--    Para corrigir: tela Usuários (depois do deploy) ou
--    update auth.users set raw_app_meta_data = raw_app_meta_data || '{"telas": [...]}' where email = '...';
select
  u.email,
  u.raw_app_meta_data -> 'telas' as telas_app_metadata,
  u.raw_user_meta_data -> 'telas' as telas_user_metadata_antigas,
  u.raw_user_meta_data ->> 'perfil' as perfil_antigo,
  u.last_sign_in_at
from auth.users u
order by (u.raw_app_meta_data -> 'telas') ? 'usuarios' desc, u.email;
