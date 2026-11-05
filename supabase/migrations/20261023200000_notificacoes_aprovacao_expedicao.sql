-- Notificações internas para emissores, ligadas atomicamente à aprovação.
-- O trigger criado agora não processa retroativamente o histórico já existente.
begin;

create table if not exists public.reversa_notificacoes_emissao (
  id uuid primary key default gen_random_uuid(),
  solicitacao_id uuid not null references public.solicitacoes_reverso (id) on delete cascade,
  empresa text not null check (empresa in ('Alinare', 'Novitah')),
  aprovacao_versao integer not null check (aprovacao_versao > 0),
  destinatario_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  lida_em timestamptz,
  constraint reversa_notificacoes_emissao_evento_destinatario_uk
    unique (solicitacao_id, aprovacao_versao, destinatario_id)
);

comment on table public.reversa_notificacoes_emissao is
  'Avisos privados para emissores, derivados de aprovações confirmadas; não representam mudança logística.';

create index if not exists idx_reversa_notificacoes_emissao_destinatario_recente
  on public.reversa_notificacoes_emissao (destinatario_id, created_at desc);

alter table public.reversa_notificacoes_emissao enable row level security;
revoke all on table public.reversa_notificacoes_emissao from public, anon, authenticated;

create or replace function public.criar_notificacoes_emissao_apos_aprovacao()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.evento <> 'aprovada' then
    return new;
  end if;

  insert into public.reversa_notificacoes_emissao
    (solicitacao_id, empresa, aprovacao_versao, destinatario_id)
  select new.solicitacao_id, new.empresa, new.versao, u.id
  from auth.users u
  where coalesce(u.raw_app_meta_data -> 'telas', '[]'::jsonb) ? 'emitir-etiqueta'
    and coalesce(u.raw_app_meta_data -> 'empresas_acesso', '[]'::jsonb) ? new.empresa
  on conflict (solicitacao_id, aprovacao_versao, destinatario_id) do nothing;

  return new;
end;
$$;

revoke all on function public.criar_notificacoes_emissao_apos_aprovacao() from public, anon, authenticated;

drop trigger if exists reversa_notificacoes_emissao_apos_aprovacao on public.solicitacoes_aprovacoes;
create trigger reversa_notificacoes_emissao_apos_aprovacao
  after insert on public.solicitacoes_aprovacoes
  for each row execute function public.criar_notificacoes_emissao_apos_aprovacao();

create or replace function public.listar_notificacoes_emissao()
returns table (
  id uuid,
  solicitacao_id uuid,
  empresa text,
  created_at timestamptz,
  lida_em timestamptz,
  nao_lidas_total integer
)
language sql
stable
security definer
set search_path = ''
as $$
  select n.id, n.solicitacao_id, n.empresa, n.created_at, n.lida_em,
    (count(*) filter (where n.lida_em is null) over ())::integer
  from public.reversa_notificacoes_emissao n
  where auth.uid() is not null
    and n.destinatario_id = auth.uid()
    and exists (
      select 1
      from auth.users u
      where u.id = auth.uid()
        and coalesce(u.raw_app_meta_data -> 'telas', '[]'::jsonb) ? 'emitir-etiqueta'
        and coalesce(u.raw_app_meta_data -> 'empresas_acesso', '[]'::jsonb) ? n.empresa
    )
    and exists (
      select 1 from public.solicitacoes_reverso r
      where r.id = n.solicitacao_id and r.empresa = n.empresa
    )
  order by n.created_at desc, n.id desc
  limit 50;
$$;

revoke all on function public.listar_notificacoes_emissao() from public, anon, authenticated;
grant execute on function public.listar_notificacoes_emissao() to authenticated;

create or replace function public.marcar_notificacao_emissao_lida(p_notificacao_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lida boolean := false;
begin
  if auth.uid() is null then
    return false;
  end if;

  update public.reversa_notificacoes_emissao n
     set lida_em = coalesce(n.lida_em, now())
   where n.id = p_notificacao_id
     and n.destinatario_id = auth.uid()
     and exists (
       select 1 from auth.users u
       where u.id = auth.uid()
         and coalesce(u.raw_app_meta_data -> 'telas', '[]'::jsonb) ? 'emitir-etiqueta'
         and coalesce(u.raw_app_meta_data -> 'empresas_acesso', '[]'::jsonb) ? n.empresa
     )
     and exists (
       select 1 from public.solicitacoes_reverso r
       where r.id = n.solicitacao_id and r.empresa = n.empresa
     );

  v_lida := found;
  return v_lida;
end;
$$;

revoke all on function public.marcar_notificacao_emissao_lida(uuid) from public, anon, authenticated;
grant execute on function public.marcar_notificacao_emissao_lida(uuid) to authenticated;

commit;
