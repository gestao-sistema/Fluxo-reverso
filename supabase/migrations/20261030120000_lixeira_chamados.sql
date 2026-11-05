-- Chamados são arquivados, não removidos. A linha e suas trilhas permanecem no banco.
begin;

alter table public.solicitacoes_reverso
  add column if not exists inutilizada_em timestamptz,
  add column if not exists inutilizada_por uuid references auth.users(id) on delete set null,
  add column if not exists inutilizada_por_nome text;

create index if not exists idx_solicitacoes_reverso_lixeira
  on public.solicitacoes_reverso (inutilizada_em desc)
  where inutilizada_em is not null;

-- Chamados arquivados e suas trilhas ficam restritos a administradores.
create or replace function public.pode_ler_solicitacao(p_solicitacao_id uuid) returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.solicitacoes_reverso r
    where r.id = p_solicitacao_id
      and (r.inutilizada_em is null or public.is_admin())
      and (
        r.empresa = any (public.empresas_consulta_ampliada())
        or (
          auth.uid() is not null
          and r.solicitado_por = auth.uid()
          and r.empresa = any (public.empresas_formulario())
        )
      )
  );
$$;
revoke execute on function public.pode_ler_solicitacao(uuid) from public, anon;
grant execute on function public.pode_ler_solicitacao(uuid) to authenticated, service_role;

-- A tela operacional e as telas dos solicitantes só recebem chamados ativos.
drop policy if exists "select_solicitacoes_por_escopo" on public.solicitacoes_reverso;
create policy "select_solicitacoes_por_escopo" on public.solicitacoes_reverso
  for select to authenticated
  using (
    inutilizada_em is null
    and (
      empresa = any (public.empresas_consulta_ampliada())
      or (
        auth.uid() is not null
        and solicitado_por = auth.uid()
        and empresa = any (public.empresas_formulario())
      )
    )
  );

-- Administradores acessam trilhas arquivadas sem ganhar leitura dos chamados ativos.
create or replace function public.solicitacao_na_lixeira(p_solicitacao_id uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select public.is_admin() and exists (
    select 1 from public.solicitacoes_reverso r
    where r.id = p_solicitacao_id and r.inutilizada_em is not null
  );
$$;
revoke all on function public.solicitacao_na_lixeira(uuid) from public, anon;
grant execute on function public.solicitacao_na_lixeira(uuid) to authenticated, service_role;

drop policy if exists "select_historico_lixeira_admin" on public.solicitacoes_historico;
create policy "select_historico_lixeira_admin" on public.solicitacoes_historico
  for select to authenticated using (public.solicitacao_na_lixeira(solicitacao_id));

drop policy if exists "aprovacoes_select" on public.solicitacoes_aprovacoes;
create policy "aprovacoes_select" on public.solicitacoes_aprovacoes
  for select to authenticated
  using (
    exists (select 1 from public.solicitacoes_reverso r where r.id = solicitacao_id)
    or public.solicitacao_na_lixeira(solicitacao_id)
  );

drop policy if exists "reversa_emissoes_select_lixeira_admin" on public.reversa_emissoes;
create policy "reversa_emissoes_select_lixeira_admin" on public.reversa_emissoes
  for select to authenticated using (public.solicitacao_na_lixeira(solicitacao_id));

drop policy if exists "reversa_emissao_eventos_select_lixeira_admin" on public.reversa_emissao_eventos;
create policy "reversa_emissao_eventos_select_lixeira_admin" on public.reversa_emissao_eventos
  for select to authenticated using (public.solicitacao_na_lixeira(solicitacao_id));

drop policy if exists "select_rastreamento_lixeira_admin" on public.rastreamento_correios;
create policy "select_rastreamento_lixeira_admin" on public.rastreamento_correios
  for select to authenticated using (public.solicitacao_na_lixeira(solicitacao_id));

-- A etiqueta continua acessível no histórico arquivado, só para administradores.
create or replace function public.pode_acessar_etiqueta(p_objeto text) returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.solicitacoes_reverso r
    where r.id::text = split_part(p_objeto, '/', 1)
      and (
        r.empresa = any (public.empresas_permitidas())
        or (r.inutilizada_em is not null and public.is_admin())
      )
  )
  or (
    public.is_admin()
    and not exists (select 1 from public.solicitacoes_reverso r where r.id::text = split_part(p_objeto, '/', 1))
  );
$$;

-- Nenhuma operação de emissão pode iniciar ou continuar sobre chamado arquivado.
create or replace function public.pode_operar_emissao(p_solicitacao_id uuid, p_operacao text) returns boolean
language sql stable security definer
set search_path = ''
as $$
  select p_operacao in ('registrar', 'anexar_pdf', 'dados', 'envio', 'postagem')
    and exists (
      select 1
      from public.solicitacoes_reverso r
      where r.id = p_solicitacao_id
        and r.inutilizada_em is null
        and r.empresa = any (public.empresas_operacao_emissao(p_operacao))
    )
    and public.emissao_liberada_pela_aprovacao(p_solicitacao_id, p_operacao);
$$;
comment on function public.pode_operar_emissao(uuid, text) is
  'Authorizes emission operations on active requests; archived requests cannot be operated.';

-- Registro na lixeira e restauração ficam restritos ao perfil administrativo.
create or replace function public.listar_chamados_lixeira()
returns setof public.solicitacoes_reverso
language plpgsql stable security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'A Lixeira é restrita aos administradores.' using errcode = '42501';
  end if;
  return query
    select r.* from public.solicitacoes_reverso r
    where r.inutilizada_em is not null
    order by r.inutilizada_em desc, r.id;
end;
$$;

create or replace function public.inutilizar_chamado(p_solicitacao_id uuid)
returns public.solicitacoes_reverso
language plpgsql security definer
set search_path = ''
as $$
declare
  v_chamado public.solicitacoes_reverso%rowtype;
  v_uid uuid := auth.uid();
  v_nome text;
begin
  if not public.is_admin() then
    raise exception 'Somente administradores podem mover chamados para a Lixeira.' using errcode = '42501';
  end if;

  select * into v_chamado
  from public.solicitacoes_reverso r
  where r.id = p_solicitacao_id
  for update;
  if not found then
    raise exception 'Chamado não encontrado.' using errcode = 'P0002';
  end if;
  if v_chamado.inutilizada_em is not null then
    return v_chamado;
  end if;

  v_nome := coalesce(public.usuario_nome(v_uid), 'Administrador');
  perform set_config('app.solicitacao_lixeira', 'inutilizar', true);
  update public.solicitacoes_reverso
     set inutilizada_em = now(), inutilizada_por = v_uid, inutilizada_por_nome = v_nome
   where id = p_solicitacao_id
   returning * into v_chamado;

  insert into public.solicitacoes_historico (solicitacao_id, user_nome, acao)
  values (p_solicitacao_id, v_nome, 'Chamado movido para a Lixeira');
  return v_chamado;
end;
$$;

create or replace function public.restaurar_chamado(p_solicitacao_id uuid)
returns public.solicitacoes_reverso
language plpgsql security definer
set search_path = ''
as $$
declare
  v_chamado public.solicitacoes_reverso%rowtype;
  v_uid uuid := auth.uid();
  v_nome text;
begin
  if not public.is_admin() then
    raise exception 'Somente administradores podem restaurar chamados.' using errcode = '42501';
  end if;

  select * into v_chamado
  from public.solicitacoes_reverso r
  where r.id = p_solicitacao_id
  for update;
  if not found or v_chamado.inutilizada_em is null then
    raise exception 'Chamado não encontrado na Lixeira.' using errcode = 'P0002';
  end if;

  v_nome := coalesce(public.usuario_nome(v_uid), 'Administrador');
  perform set_config('app.solicitacao_lixeira', 'restaurar', true);
  update public.solicitacoes_reverso
     set inutilizada_em = null, inutilizada_por = null, inutilizada_por_nome = null
   where id = p_solicitacao_id
   returning * into v_chamado;

  insert into public.solicitacoes_historico (solicitacao_id, user_nome, acao)
  values (p_solicitacao_id, v_nome, 'Chamado restaurado da Lixeira');
  return v_chamado;
end;
$$;

revoke all on function public.listar_chamados_lixeira() from public, anon;
revoke all on function public.inutilizar_chamado(uuid) from public, anon;
revoke all on function public.restaurar_chamado(uuid) from public, anon;
grant execute on function public.listar_chamados_lixeira() to authenticated, service_role;
grant execute on function public.inutilizar_chamado(uuid) to authenticated, service_role;
grant execute on function public.restaurar_chamado(uuid) to authenticated, service_role;

-- O estado arquivado bloqueia alterações humanas, mas mantém os updates do rastreador (service role).
create or replace function public.chamado_lixeira_proteger_atualizacao() returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  v_acao text := coalesce(current_setting('app.solicitacao_lixeira', true), '');
begin
  if tg_op = 'INSERT' then
    if new.inutilizada_em is not null or new.inutilizada_por is not null or new.inutilizada_por_nome is not null then
      raise exception 'Use a operação administrativa da Lixeira para arquivar chamados.' using errcode = '42501';
    end if;
    return new;
  end if;

  if old.inutilizada_em is null then
    if new.inutilizada_em is not null
       and v_acao = 'inutilizar'
       and public.is_admin()
       and new.inutilizada_por = auth.uid()
       and new.inutilizada_por_nome is not null then
      return new;
    end if;
    if new.inutilizada_em is not null
       or new.inutilizada_por is distinct from old.inutilizada_por
       or new.inutilizada_por_nome is distinct from old.inutilizada_por_nome then
      raise exception 'Use a operação administrativa da Lixeira para arquivar chamados.' using errcode = '42501';
    end if;
    return new;
  end if;
  if auth.uid() is null then
    return new;
  end if;
  if v_acao = 'restaurar'
     and public.is_admin()
     and new.inutilizada_em is null
     and new.inutilizada_por is null
     and new.inutilizada_por_nome is null
     and (to_jsonb(new) - 'inutilizada_em' - 'inutilizada_por' - 'inutilizada_por_nome')
       = (to_jsonb(old) - 'inutilizada_em' - 'inutilizada_por' - 'inutilizada_por_nome') then
    return new;
  end if;
  raise exception 'Chamado na Lixeira não pode ser alterado. Restaure-o antes de operar.' using errcode = '55000';
end;
$$;

drop trigger if exists trg_chamado_lixeira_proteger_atualizacao on public.solicitacoes_reverso;
create trigger trg_chamado_lixeira_proteger_atualizacao
  before insert or update on public.solicitacoes_reverso
  for each row execute function public.chamado_lixeira_proteger_atualizacao();

-- Nenhum usuário autenticado pode remover o registro ou suas trilhas permanentemente.
drop policy if exists "delete_solicitacoes_admin" on public.solicitacoes_reverso;
revoke delete on table public.solicitacoes_reverso from authenticated;

create or replace function public.reversa_proteger_exclusao() returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  if auth.uid() is not null then
    raise exception 'Chamados não são apagados permanentemente. Mova o chamado para a Lixeira.' using errcode = '55000';
  end if;
  return old;
end;
$$;

-- Filas administrativas SECURITY DEFINER também ignoram chamados arquivados.
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
    r.id, r.empresa, r.created_at, r.data_solicitacao, r.solicitante, r.setor,
    r.codigo_cliente, r.nome_cliente, r.endereco_postagem, r.endereco_destino_troca,
    r.motivo, r.justificativa_outros, r.solicitado_por_nome, r.aprovacao_versao,
    r.nc_id,
    case when nc.numero is null then null
      else 'NC-' || lpad(nc.numero::text, greatest(4, length(nc.numero::text)), '0') end,
    nc.origem, nc.descricao, p.proprio,
    not p.proprio or coalesce((select c.permitir_autoaprovacao from public.aprovacao_config c where c.id), false)
  from public.solicitacoes_reverso r
  left join public.nao_conformidades nc on nc.id = r.nc_id
  cross join lateral (
    select coalesce(r.solicitado_por = auth.uid(), false)
      or coalesce(r.aprovacao_versao_por = auth.uid(), false) as proprio
  ) p
  where r.aprovacao_status = 'aguardando_aprovacao'
    and r.inutilizada_em is null
    and public.usuario_pode_aprovar_reversa(r.empresa, r.setor)
  order by r.created_at, r.id;
$$;
grant execute on function public.fila_aprovacao_reversas() to authenticated, service_role;

create or replace function public.listar_recebimentos_fisicos_pendentes()
returns table (solicitacao_id uuid, concluido_em timestamptz)
language sql stable security definer
set search_path = ''
as $$
  select r.id, r.concluido_em
  from public.solicitacoes_reverso r
  where auth.uid() is not null
    and r.inutilizada_em is null
    and r.status = 'concluido'
    and r.empresa = any (public.empresas_recebimento_manual())
    and public.reversa_conclusao_por_correios(r.id)
  order by r.concluido_em desc nulls last, r.id
  limit 500;
$$;
grant execute on function public.listar_recebimentos_fisicos_pendentes() to authenticated;

create or replace function public.listar_notificacoes_emissao()
returns table (
  id uuid,
  solicitacao_id uuid,
  empresa text,
  created_at timestamptz,
  lida_em timestamptz,
  nao_lidas_total integer
)
language sql stable security definer
set search_path = ''
as $$
  select n.id, n.solicitacao_id, n.empresa, n.created_at, n.lida_em,
    (count(*) filter (where n.lida_em is null) over ())::integer
  from public.reversa_notificacoes_emissao n
  where auth.uid() is not null
    and n.destinatario_id = auth.uid()
    and exists (
      select 1 from auth.users u
      where u.id = auth.uid()
        and coalesce(u.raw_app_meta_data -> 'telas', '[]'::jsonb) ? 'emitir-etiqueta'
        and coalesce(u.raw_app_meta_data -> 'empresas_acesso', '[]'::jsonb) ? n.empresa
    )
    and exists (
      select 1 from public.solicitacoes_reverso r
      where r.id = n.solicitacao_id and r.empresa = n.empresa and r.inutilizada_em is null
    )
  order by n.created_at desc, n.id desc
  limit 50;
$$;
revoke all on function public.listar_notificacoes_emissao() from public, anon;
grant execute on function public.listar_notificacoes_emissao() to authenticated;

commit;
