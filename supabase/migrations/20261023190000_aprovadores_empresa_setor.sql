-- Escopo de aprovação por empresa e setor do pedido.
-- A capacidade existente (aprovar-reversa + empresas_acesso) continua necessária.
-- A carga inicial preserva somente usuários que já tinham essa capacidade,
-- atribuindo explicitamente todos os setores daquela empresa.

begin;

create table if not exists public.reversa_aprovadores_setor (
  empresa text not null check (empresa in ('Alinare', 'Novitah')),
  usuario_id uuid not null references auth.users(id) on delete cascade,
  todos_setores boolean not null default false,
  setores text[] not null default '{}'::text[],
  alterado_em timestamptz not null default now(),
  alterado_por uuid references auth.users(id) on delete set null,
  constraint reversa_aprovadores_setor_pk primary key (empresa, usuario_id),
  constraint reversa_aprovadores_setor_escopo_valido check (
    (todos_setores and cardinality(setores) = 0)
    or (not todos_setores and cardinality(setores) > 0)
  )
);

comment on table public.reversa_aprovadores_setor is
  'Escopo por empresa e setor de origem para usuários que já possuem a capacidade aprovar-reversa.';

alter table public.reversa_aprovadores_setor enable row level security;
revoke all on table public.reversa_aprovadores_setor from public, anon, authenticated;

create table if not exists public.reversa_aprovadores_setor_auditoria (
  id bigint generated always as identity primary key,
  empresa text not null check (empresa in ('Alinare', 'Novitah')),
  alterado_por uuid not null references auth.users(id),
  alterado_por_nome text not null,
  alterado_em timestamptz not null default now(),
  configuracao_anterior jsonb not null,
  configuracao_nova jsonb not null
);

alter table public.reversa_aprovadores_setor_auditoria enable row level security;
revoke all on table public.reversa_aprovadores_setor_auditoria from public, anon, authenticated;

-- Compatibilidade: capacidade atual, empresa atual, todos os setores.
-- Não usa nome, perfil de gestão, nem permissões de consulta.
insert into public.reversa_aprovadores_setor
  (empresa, usuario_id, todos_setores, setores, alterado_por)
select distinct e.value, u.id, true, '{}'::text[], null::uuid
from auth.users u
cross join lateral jsonb_array_elements_text(
  case when jsonb_typeof(u.raw_app_meta_data -> 'empresas_acesso') = 'array'
    then u.raw_app_meta_data -> 'empresas_acesso' else '[]'::jsonb end
) as e(value)
where e.value in ('Alinare', 'Novitah')
  and coalesce(u.raw_app_meta_data -> 'telas', '[]'::jsonb) ? 'aprovar-reversa'
on conflict (empresa, usuario_id) do nothing;

create or replace function public.usuario_pode_aprovar_reversa(p_empresa text, p_setor text)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select auth.uid() is not null
    and p_empresa = any (public.empresas_aprovaveis())
    and exists (
      select 1
      from public.reversa_aprovadores_setor a
      where a.empresa = p_empresa
        and a.usuario_id = auth.uid()
        and (a.todos_setores or p_setor = any (a.setores))
    );
$$;

revoke all on function public.usuario_pode_aprovar_reversa(text, text) from public, anon, authenticated;

create or replace function public.listar_config_aprovadores_reversa()
returns jsonb
language plpgsql stable security definer
set search_path = ''
as $$
declare
  v_resultado jsonb;
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'Somente administradores podem consultar a configuração de aprovadores.' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'setores', coalesce((
      select jsonb_agg(jsonb_build_object('empresa', s.empresa, 'setor', s.setor) order by s.empresa, s.setor)
      from (
        select distinct r.empresa, r.setor
        from public.solicitacoes_reverso r
        where r.empresa in ('Alinare', 'Novitah') and nullif(btrim(r.setor), '') is not null
        union
        select a.empresa, unnest(a.setores)
        from public.reversa_aprovadores_setor a
        where not a.todos_setores
      ) s
    ), '[]'::jsonb),
    'configuracoes', coalesce((
      select jsonb_agg(jsonb_build_object(
        'empresa', a.empresa,
        'usuario_id', a.usuario_id,
        'todos_setores', a.todos_setores,
        'setores', to_jsonb(a.setores)
      ) order by a.empresa, a.usuario_id)
      from public.reversa_aprovadores_setor a
    ), '[]'::jsonb)
  ) into v_resultado;

  return v_resultado;
end;
$$;

revoke all on function public.listar_config_aprovadores_reversa() from public, anon, authenticated;
grant execute on function public.listar_config_aprovadores_reversa() to authenticated;

create or replace function public.salvar_config_aprovadores_reversa(p_empresa text, p_configuracao jsonb)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_nome text;
  v_anterior jsonb;
  v_nova jsonb;
  v_item jsonb;
  v_usuario uuid;
  v_todos boolean;
  v_setores text[];
  v_ids uuid[] := '{}'::uuid[];
begin
  if v_uid is null or not public.is_admin() then
    raise exception 'Somente administradores podem alterar a configuração de aprovadores.' using errcode = '42501';
  end if;
  if p_empresa is null or p_empresa not in ('Alinare', 'Novitah') then
    raise exception 'Empresa inválida para configuração de aprovadores.' using errcode = '22023';
  end if;
  if jsonb_typeof(p_configuracao) is distinct from 'array' then
    raise exception 'A configuração de aprovadores deve ser uma lista.' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtext('reversa_aprovadores:' || p_empresa));

  select coalesce(jsonb_agg(jsonb_build_object(
    'usuario_id', a.usuario_id,
    'todos_setores', a.todos_setores,
    'setores', to_jsonb(a.setores)
  ) order by a.usuario_id), '[]'::jsonb)
    into v_anterior
  from public.reversa_aprovadores_setor a
  where a.empresa = p_empresa;

  for v_item in select value from jsonb_array_elements(p_configuracao)
  loop
    if jsonb_typeof(v_item) is distinct from 'object'
      or jsonb_typeof(v_item -> 'usuario_id') is distinct from 'string'
      or jsonb_typeof(v_item -> 'todos_setores') is distinct from 'boolean'
      or jsonb_typeof(v_item -> 'setores') is distinct from 'array' then
      raise exception 'Cada aprovador deve informar usuário, escopo e setores.' using errcode = '22023';
    end if;

    v_usuario := (v_item ->> 'usuario_id')::uuid;
    v_todos := (v_item ->> 'todos_setores')::boolean;
    select coalesce(array_agg(distinct btrim(value) order by btrim(value)), '{}'::text[])
      into v_setores
    from jsonb_array_elements_text(v_item -> 'setores') as s(value);

    if v_usuario = any(v_ids) then
      raise exception 'Um usuário só pode aparecer uma vez por empresa.' using errcode = '22023';
    end if;
    v_ids := array_append(v_ids, v_usuario);
    if (v_todos and cardinality(v_setores) <> 0)
      or (not v_todos and cardinality(v_setores) = 0)
      or array_position(v_setores, '') is not null then
      raise exception 'Selecione todos os setores ou um ou mais setores específicos.' using errcode = '22023';
    end if;
    if not exists (
      select 1
      from auth.users u
      where u.id = v_usuario
        and coalesce(u.raw_app_meta_data -> 'telas', '[]'::jsonb) ? 'aprovar-reversa'
        and coalesce(u.raw_app_meta_data -> 'empresas_acesso', '[]'::jsonb) ? p_empresa
    ) then
      raise exception 'O usuário selecionado não possui capacidade de aprovação para esta empresa.' using errcode = '42501';
    end if;
  end loop;

  select coalesce(jsonb_agg(jsonb_build_object(
    'usuario_id', (item ->> 'usuario_id')::uuid,
    'todos_setores', (item ->> 'todos_setores')::boolean,
    'setores', to_jsonb(array(
      select distinct btrim(value) from jsonb_array_elements_text(item -> 'setores') as s(value)
      order by 1
    ))
  ) order by (item ->> 'usuario_id')::uuid), '[]'::jsonb)
    into v_nova
  from jsonb_array_elements(p_configuracao) as config(item);

  if v_anterior is distinct from v_nova then
    delete from public.reversa_aprovadores_setor where empresa = p_empresa;
    insert into public.reversa_aprovadores_setor
      (empresa, usuario_id, todos_setores, setores, alterado_por, alterado_em)
    select p_empresa,
      (item ->> 'usuario_id')::uuid,
      (item ->> 'todos_setores')::boolean,
      array(select distinct btrim(value) from jsonb_array_elements_text(item -> 'setores') as s(value) order by 1),
      v_uid,
      now()
    from jsonb_array_elements(v_nova) as config(item);

    v_nome := coalesce(public.usuario_nome(v_uid), 'Usuário ' || v_uid::text);
    insert into public.reversa_aprovadores_setor_auditoria
      (empresa, alterado_por, alterado_por_nome, configuracao_anterior, configuracao_nova)
    values (p_empresa, v_uid, v_nome, v_anterior, v_nova);
  end if;
end;
$$;

revoke all on function public.salvar_config_aprovadores_reversa(text, jsonb) from public, anon, authenticated;
grant execute on function public.salvar_config_aprovadores_reversa(text, jsonb) to authenticated;

-- A definição e o contrato de retorno da fila permanecem os mesmos; muda apenas
-- o predicado de autorização para usar a empresa e o setor registrados no pedido.
create or replace function public.fila_aprovacao_reversas()
returns table (
  id uuid,
  empresa text,
  created_at timestamptz,
  data_solicitacao date,
  solicitante text,
  setor text,
  codigo_cliente integer,
  nome_cliente text,
  endereco_postagem text,
  endereco_destino_troca text,
  motivo text,
  justificativa_outros text,
  solicitado_por_nome text,
  aprovacao_versao integer,
  nc_id uuid,
  nc_codigo text,
  nc_origem text,
  nc_descricao text,
  proprio_pedido boolean,
  pode_aprovar boolean
)
language sql stable security definer
set search_path = ''
as $$
  select
    r.id,
    r.empresa,
    r.created_at,
    r.data_solicitacao,
    r.solicitante,
    r.setor,
    r.codigo_cliente,
    r.nome_cliente,
    r.endereco_postagem,
    r.endereco_destino_troca,
    r.motivo,
    r.justificativa_outros,
    r.solicitado_por_nome,
    r.aprovacao_versao,
    r.nc_id,
    case when nc.numero is null then null
      else 'NC-' || lpad(nc.numero::text, greatest(4, length(nc.numero::text)), '0') end,
    nc.origem,
    nc.descricao,
    p.proprio,
    not p.proprio or coalesce((select c.permitir_autoaprovacao from public.aprovacao_config c where c.id), false)
  from public.solicitacoes_reverso r
  left join public.nao_conformidades nc on nc.id = r.nc_id
  cross join lateral (
    select coalesce(r.solicitado_por = auth.uid(), false) or coalesce(r.aprovacao_versao_por = auth.uid(), false) as proprio
  ) p
  where r.aprovacao_status = 'aguardando_aprovacao'
    and public.usuario_pode_aprovar_reversa(r.empresa, r.setor)
  order by r.created_at, r.id;
$$;

create or replace function public.registrar_decisao_reversa(
  p_solicitacao_id uuid,
  p_decisao text,
  p_versao integer,
  p_justificativa text
) returns public.solicitacoes_reverso
language plpgsql security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_justificativa text := nullif(btrim(coalesce(p_justificativa, '')), '');
  v_nome text;
  v_login text;
  v_autoaprovacao boolean;
  v_r public.solicitacoes_reverso;
begin
  if v_uid is null then
    raise exception 'Entre no sistema para decidir aprovações.' using errcode = '42501';
  end if;
  if p_decisao is null or p_decisao not in ('aprovada', 'rejeitada') then
    raise exception 'Decisão inválida: use aprovada ou rejeitada.' using errcode = '22023';
  end if;
  if p_versao is null then
    raise exception 'Informe a versão da solicitação analisada.' using errcode = '22023';
  end if;
  if p_decisao = 'rejeitada' and v_justificativa is null then
    raise exception 'Informe a justificativa da rejeição.' using errcode = '23514';
  end if;
  if length(v_justificativa) > 1000 then
    raise exception 'Justificativa muito longa (máximo de 1000 caracteres).' using errcode = '22001';
  end if;

  select * into v_r from public.solicitacoes_reverso r where r.id = p_solicitacao_id for update;
  if not found then
    raise exception 'Solicitação não encontrada ou fora das combinações de empresa e setor que você aprova.' using errcode = '42501';
  end if;
  -- Usa o mesmo lock da configuração para que uma revogação e uma decisão
  -- concorrentes sejam serializadas antes da revalidação da autorização.
  perform pg_advisory_xact_lock(hashtext('reversa_aprovadores:' || v_r.empresa));
  if not public.usuario_pode_aprovar_reversa(v_r.empresa, v_r.setor) then
    raise exception 'Solicitação não encontrada ou fora das combinações de empresa e setor que você aprova.' using errcode = '42501';
  end if;
  if v_r.aprovacao_legada then
    raise exception 'Solicitação anterior ao fluxo de aprovação (legado): não recebe decisão.' using errcode = '55000';
  end if;
  if v_r.aprovacao_status <> 'aguardando_aprovacao' then
    raise exception 'Esta solicitação já foi % por % em %.',
      v_r.aprovacao_status,
      coalesce(v_r.aprovacao_decidida_por_nome, 'outra pessoa'),
      to_char(v_r.aprovacao_decidida_em at time zone 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI')
      using errcode = '55000';
  end if;
  if v_r.aprovacao_versao <> p_versao then
    raise exception 'A solicitação foi alterada depois que você a abriu. Revise os dados atualizados e decida de novo.'
      using errcode = '55000';
  end if;
  if p_decisao = 'aprovada' and (v_r.solicitado_por = v_uid or v_r.aprovacao_versao_por = v_uid) then
    select c.permitir_autoaprovacao into v_autoaprovacao from public.aprovacao_config c where c.id;
    if not coalesce(v_autoaprovacao, false) then
      raise exception 'Você não pode aprovar uma solicitação registrada ou alterada por você.' using errcode = '42501';
    end if;
  end if;

  v_nome := coalesce(public.usuario_nome(v_uid), 'Usuário ' || v_uid::text);
  select u.email into v_login from auth.users u where u.id = v_uid;

  perform set_config('app.aprovacao_decisao', 'sim', true);
  update public.solicitacoes_reverso r
     set aprovacao_status = p_decisao,
         aprovacao_decidida_por = v_uid,
         aprovacao_decidida_por_nome = v_nome,
         aprovacao_decidida_em = now(),
         aprovacao_justificativa = v_justificativa
   where r.id = p_solicitacao_id
  returning * into v_r;
  perform set_config('app.aprovacao_decisao', '', true);

  insert into public.solicitacoes_aprovacoes
    (solicitacao_id, versao, evento, justificativa, empresa, user_id, user_nome, user_login)
  values
    (v_r.id, v_r.aprovacao_versao, p_decisao, v_justificativa, v_r.empresa, v_uid, v_nome, v_login);

  if v_r.nc_id is not null then
    insert into public.nc_historico (nc_id, user_nome, acao)
    values (v_r.nc_id, v_nome, 'Reversa de ' || v_r.nome_cliente || ': '
      || case when p_decisao = 'aprovada' then 'aprovada' else 'rejeitada — ' || v_justificativa end);
  end if;

  return v_r;
end;
$$;

commit;
