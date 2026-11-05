-- Perfis operacionais e fluxo de aprovação, etiqueta e check-in dos Correios.
-- Idempotente; requer as migrations de app_metadata, etiqueta e NC opcionais.

begin;

create or replace function public.is_admin() returns boolean
language sql stable security definer
set search_path = ''
as $$
  select
    coalesce((select u.raw_app_meta_data ->> 'perfil_acesso' = 'mestre' from auth.users u where u.id = auth.uid()), false)
    or 'usuarios' = any (public.current_telas())
    or public.current_perfil_legacy() = 'ADMIN';
$$;

create or replace function public.current_empresas_acesso() returns text[]
language sql stable security definer
set search_path = ''
as $$
  select coalesce(array(
    select distinct e.value
    from auth.users u
    cross join lateral jsonb_array_elements_text(
      case
        when jsonb_typeof(u.raw_app_meta_data -> 'empresas_acesso') = 'array'
          then u.raw_app_meta_data -> 'empresas_acesso'
        else '[]'::jsonb
      end
    ) as e(value)
    where u.id = auth.uid()
      and e.value in ('Alinare', 'Novitah')
  ), '{}'::text[]);
$$;

create or replace function public.empresas_permitidas() returns text[]
language sql stable security definer
set search_path = ''
as $$
  select case
    when public.is_admin()
      or public.current_telas() && array['dashboard-geral', 'lista-geral', 'status-geral', 'kanban', 'kanban-edit', 'nc', 'nc-edit']::text[]
      then array['Alinare', 'Novitah']::text[]
    else array(
      select distinct e
      from unnest(
        array_remove(array[
          case when public.current_telas() && array['dashboard-alinare', 'formulario-alinare', 'lista-alinare', 'status-alinare']::text[] then 'Alinare' end,
          case when public.current_telas() && array['dashboard-novitah', 'formulario-novitah', 'lista-novitah', 'status-novitah']::text[] then 'Novitah' end
        ]::text[], null)
        || case
          when public.current_telas() && array['aprovar-reversa', 'emitir-etiqueta', 'confirmar-checkin']::text[]
            then public.current_empresas_acesso()
          else '{}'::text[]
        end
      ) as escopo(e)
      where e in ('Alinare', 'Novitah')
    )
  end;
$$;

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

create or replace function public.empresas_legacy_operaveis() returns text[]
language sql stable security definer
set search_path = ''
as $$
  select case
    when public.is_admin()
      or public.current_perfil_legacy() = 'Expedicao'
      or public.current_telas() && array['lista-geral', 'status-geral', 'kanban', 'kanban-edit']::text[]
      then array['Alinare', 'Novitah']::text[]
    else array_remove(array[
      case when public.current_telas() && array['lista-alinare', 'status-alinare']::text[] then 'Alinare' end,
      case when public.current_telas() && array['lista-novitah', 'status-novitah']::text[] then 'Novitah' end
    ]::text[], null)
  end;
$$;

create or replace function public.empresas_aprovaveis() returns text[]
language sql stable security definer
set search_path = ''
as $$
  select case when public.is_admin() then array['Alinare', 'Novitah']::text[]
    when 'aprovar-reversa' = any (public.current_telas()) then public.current_empresas_acesso()
    else '{}'::text[] end;
$$;

create or replace function public.empresas_etiquetaveis() returns text[]
language sql stable security definer
set search_path = ''
as $$
  select case when public.is_admin() then array['Alinare', 'Novitah']::text[]
    when 'emitir-etiqueta' = any (public.current_telas()) then public.current_empresas_acesso()
    else '{}'::text[] end;
$$;

create or replace function public.empresas_checkin() returns text[]
language sql stable security definer
set search_path = ''
as $$
  select case when public.is_admin() then array['Alinare', 'Novitah']::text[]
    when 'confirmar-checkin' = any (public.current_telas()) then public.current_empresas_acesso()
    else '{}'::text[] end;
$$;

create or replace function public.empresas_operaveis() returns text[]
language sql stable security definer
set search_path = ''
as $$
  select array(
    select distinct e
    from unnest(
      public.empresas_legacy_operaveis()
      || public.empresas_aprovaveis()
      || public.empresas_etiquetaveis()
      || public.empresas_checkin()
    ) as escopo(e)
    where e in ('Alinare', 'Novitah')
  );
$$;

create or replace function public.pode_anexar_etiqueta(p_objeto text) returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.solicitacoes_reverso r
    where r.id::text = split_part(p_objeto, '/', 1)
      and (
        r.empresa = any (public.empresas_legacy_operaveis())
        or (
          r.status = 'pendente'
          and r.etiqueta_path is null
          and r.empresa = any (public.empresas_etiquetaveis())
        )
      )
  );
$$;

-- Mantém operações de substituição/remoção restritas aos perfis operacionais antigos e mestre.
create or replace function public.pode_operar_etiqueta(p_objeto text) returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.solicitacoes_reverso r
    where r.id::text = split_part(p_objeto, '/', 1)
      and r.empresa = any (public.empresas_legacy_operaveis())
  );
$$;

alter table public.solicitacoes_reverso
  drop constraint if exists solicitacoes_reverso_status_check;
alter table public.solicitacoes_reverso
  add constraint solicitacoes_reverso_status_check
  check (status in ('aguardando_aprovacao', 'reprovado', 'pendente', 'etiqueta_gerada', 'postado', 'em_transito', 'concluido'));
alter table public.solicitacoes_reverso
  alter column status set default 'aguardando_aprovacao';

drop policy if exists "select_solicitacoes_por_escopo" on public.solicitacoes_reverso;
create policy "select_solicitacoes_por_escopo" on public.solicitacoes_reverso
  for select to authenticated
  using (empresa = any (public.empresas_permitidas()));

drop policy if exists "insert_solicitacoes_por_escopo" on public.solicitacoes_reverso;
create policy "insert_solicitacoes_por_escopo" on public.solicitacoes_reverso
  for insert to authenticated
  with check (empresa = any (public.empresas_formulario()));

drop policy if exists "update_solicitacoes_admins" on public.solicitacoes_reverso;
create policy "update_solicitacoes_admins" on public.solicitacoes_reverso
  for update to authenticated
  using (empresa = any (public.empresas_operaveis()))
  with check (empresa = any (public.empresas_operaveis()));

create or replace function public.validar_etapa_por_setor() returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  v_telas text[];
  v_legado boolean;
begin
  -- Operações de serviço (rastreio/automação) e setor mestre.
  if auth.uid() is null or public.is_admin() then
    return new;
  end if;

  v_telas := public.current_telas();
  v_legado := public.empresas_legacy_operaveis() @> array[new.empresa]::text[];

  if tg_op = 'INSERT' then
    -- Todo chamado feito pela equipe entra na aprovação, mesmo que o cliente tente enviar outro status.
    new.status := 'aguardando_aprovacao';
    return new;
  end if;

  if v_legado then
    return new;
  end if;

  if 'aprovar-reversa' = any (v_telas)
    and old.status = 'aguardando_aprovacao'
    and new.status in ('pendente', 'reprovado')
    and (to_jsonb(new) - array['status']::text[]) = (to_jsonb(old) - array['status']::text[])
  then
    return new;
  end if;

  if 'emitir-etiqueta' = any (v_telas)
    and old.status = 'pendente'
    and old.etiqueta_path is null
    and new.status = 'etiqueta_gerada'
    and new.etiqueta_path is not null
    and (to_jsonb(new) - array['status', 'etiqueta_path', 'etiqueta_nome', 'etiqueta_enviada_em', 'etiqueta_gerada_em']::text[])
        = (to_jsonb(old) - array['status', 'etiqueta_path', 'etiqueta_nome', 'etiqueta_enviada_em', 'etiqueta_gerada_em']::text[])
  then
    return new;
  end if;

  if 'confirmar-checkin' = any (v_telas)
    and old.status = 'etiqueta_gerada'
    and new.status = 'postado'
    and new.postado_em is not null
    and (to_jsonb(new) - array['status', 'postado_em']::text[])
        = (to_jsonb(old) - array['status', 'postado_em']::text[])
  then
    return new;
  end if;

  raise exception 'Seu setor não pode executar esta alteração nesta etapa.' using errcode = '42501';
end;
$$;

drop trigger if exists trg_validar_etapa_por_setor on public.solicitacoes_reverso;
create trigger trg_validar_etapa_por_setor
  before insert or update on public.solicitacoes_reverso
  for each row execute function public.validar_etapa_por_setor();

drop policy if exists "etiquetas_insert" on storage.objects;
create policy "etiquetas_insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'etiquetas' and public.pode_anexar_etiqueta(name));

drop policy if exists "etiquetas_update" on storage.objects;
create policy "etiquetas_update" on storage.objects
  for update to authenticated
  using (bucket_id = 'etiquetas' and public.pode_operar_etiqueta(name))
  with check (bucket_id = 'etiquetas' and public.pode_operar_etiqueta(name));

drop policy if exists "etiquetas_delete" on storage.objects;
create policy "etiquetas_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'etiquetas' and public.pode_operar_etiqueta(name));

grant execute on function public.current_empresas_acesso(), public.empresas_aprovaveis(), public.empresas_etiquetaveis(), public.empresas_checkin(), public.pode_anexar_etiqueta(text) to authenticated;

commit;
