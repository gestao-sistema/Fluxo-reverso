-- ============================================================
-- Etiqueta de postagem dos Correios (PDF) vinculada à reversa
-- ------------------------------------------------------------
-- O PDF fica no bucket privado "etiquetas", no caminho
-- <id da solicitação>/<arquivo>.pdf. Baixa quem enxerga a reversa
-- (empresas_permitidas); anexa/troca/remove quem movimenta reversas daquela
-- empresa (empresas_operaveis).
--
-- Requer: 20261020130000_permissoes_app_metadata.sql
-- Idempotente: pode ser executada mais de uma vez.
-- ============================================================

alter table public.solicitacoes_reverso
  add column if not exists etiqueta_path text,
  add column if not exists etiqueta_nome text,
  add column if not exists etiqueta_enviada_em timestamptz;

comment on column public.solicitacoes_reverso.etiqueta_path is 'Caminho do PDF da etiqueta no bucket "etiquetas".';

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('etiquetas', 'etiquetas', false, 5242880, array['application/pdf'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- O primeiro segmento do caminho é o id da reversa.
create or replace function public.pode_acessar_etiqueta(p_objeto text) returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.solicitacoes_reverso r
    where r.id::text = split_part(p_objeto, '/', 1)
      and r.empresa = any (public.empresas_permitidas())
  );
$$;

create or replace function public.pode_operar_etiqueta(p_objeto text) returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.solicitacoes_reverso r
    where r.id::text = split_part(p_objeto, '/', 1)
      and r.empresa = any (public.empresas_operaveis())
  );
$$;

drop policy if exists "etiquetas_select" on storage.objects;
create policy "etiquetas_select" on storage.objects
  for select to authenticated
  using (bucket_id = 'etiquetas' and public.pode_acessar_etiqueta(name));

drop policy if exists "etiquetas_insert" on storage.objects;
create policy "etiquetas_insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'etiquetas' and public.pode_operar_etiqueta(name));

drop policy if exists "etiquetas_update" on storage.objects;
create policy "etiquetas_update" on storage.objects
  for update to authenticated
  using (bucket_id = 'etiquetas' and public.pode_operar_etiqueta(name))
  with check (bucket_id = 'etiquetas' and public.pode_operar_etiqueta(name));

drop policy if exists "etiquetas_delete" on storage.objects;
create policy "etiquetas_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'etiquetas' and public.pode_operar_etiqueta(name));
