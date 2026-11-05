-- Reconciliação administrativa de comunicações com resultado indeterminado.
-- Consulta e ação ficam no banco e exigem a capacidade administrativa existente
-- (is_admin(): tela "usuarios" ou perfil ADMIN). Gestores e solicitantes não ganham
-- acesso. Não há ação em lote: cada ação atua sobre uma única comunicação.
begin;

create table if not exists public.reversa_comunicacoes_reconciliacoes (
  id uuid primary key default gen_random_uuid(),
  comunicacao_id uuid not null references public.reversa_comunicacoes_etiqueta(id) on delete cascade,
  acao text not null check (acao in ('confirmar_conclusao_conector', 'autorizar_nova_tentativa')),
  administrador_id uuid references auth.users(id) on delete set null,
  administrador_nome text not null,
  realizado_em timestamptz not null default now(),
  justificativa text not null check (char_length(justificativa) between 10 and 1000),
  referencia text not null check (char_length(referencia) between 3 and 200),
  status_anterior text not null,
  status_novo text not null,
  valores_anteriores jsonb not null,
  valores_novos jsonb not null
);
create index if not exists reversa_comunicacoes_reconciliacoes_idx
  on public.reversa_comunicacoes_reconciliacoes (comunicacao_id, realizado_em desc);
comment on table public.reversa_comunicacoes_reconciliacoes is
  'Auditoria imutável (sem update; sem privilégio de delete, exceto a cascata da exclusão autorizada do pedido) das reconciliações manuais de comunicações com resultado_indeterminado.';
alter table public.reversa_comunicacoes_reconciliacoes enable row level security;
revoke all on table public.reversa_comunicacoes_reconciliacoes from public, anon, authenticated;

create or replace function public.reversa_comunicacoes_reconciliacoes_imutavel()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'A auditoria de reconciliação não pode ser alterada.' using errcode = '42501';
end;
$$;
revoke all on function public.reversa_comunicacoes_reconciliacoes_imutavel()
  from public, anon, authenticated, service_role;
drop trigger if exists reversa_comunicacoes_reconciliacoes_imutavel on public.reversa_comunicacoes_reconciliacoes;
create trigger reversa_comunicacoes_reconciliacoes_imutavel
  before update on public.reversa_comunicacoes_reconciliacoes
  for each row execute function public.reversa_comunicacoes_reconciliacoes_imutavel();

create or replace function public.listar_comunicacoes_reversa(
  p_status text default null,
  p_evento text default null,
  p_canal text default null,
  p_solicitacao_id uuid default null,
  p_limite integer default 50,
  p_deslocamento integer default 0
) returns table (
  id uuid,
  solicitacao_id uuid,
  pedido text,
  empresa text,
  evento text,
  canal text,
  destinatario_nome text,
  destinatario_email text,
  status text,
  tentativas integer,
  max_tentativas integer,
  criado_em timestamptz,
  atualizado_em timestamptz,
  proxima_tentativa_em timestamptz,
  acao_conector_em timestamptz,
  ultimo_erro text,
  reconciliacoes integer,
  total bigint
)
language plpgsql stable security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'Somente administradores consultam as comunicações.' using errcode = '42501';
  end if;
  if p_limite is null or p_limite < 1 or p_limite > 200 then
    raise exception 'Limite de consulta inválido (1 a 200).' using errcode = '22023';
  end if;
  if p_deslocamento is null or p_deslocamento < 0 then
    raise exception 'Deslocamento de consulta inválido.' using errcode = '22023';
  end if;

  return query
  select c.id,
         c.solicitacao_id,
         'RV-' || upper(substr(c.solicitacao_id::text, 1, 8)),
         c.empresa,
         c.evento,
         c.canal,
         coalesce(public.usuario_nome(c.destinatario_id), 'Sem usuário'),
         u.email::text,
         c.status,
         c.tentativas,
         c.max_tentativas,
         c.criado_em,
         c.atualizado_em,
         c.proxima_tentativa_em,
         c.aceito_pelo_fluxo_em,
         left(regexp_replace(coalesce(c.ultimo_erro, ''), '[[:cntrl:]]+', ' ', 'g'), 300),
         (select count(*)::integer from public.reversa_comunicacoes_reconciliacoes r where r.comunicacao_id = c.id),
         count(*) over ()
    from public.reversa_comunicacoes_etiqueta c
    left join auth.users u on u.id = c.destinatario_id
   where (p_status is null or c.status = p_status)
     and (p_evento is null or c.evento = p_evento)
     and (p_canal is null or c.canal = p_canal)
     and (p_solicitacao_id is null or c.solicitacao_id = p_solicitacao_id)
   order by c.criado_em desc, c.id
   limit p_limite offset p_deslocamento;
end;
$$;

create or replace function public.listar_historico_comunicacao_reversa(p_comunicacao_id uuid)
returns jsonb
language plpgsql stable security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'Somente administradores consultam as comunicações.' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'tentativas', coalesce((
      select jsonb_agg(jsonb_build_object(
        'iniciada_em', t.iniciada_em,
        'finalizada_em', t.finalizada_em,
        'resultado', t.resultado,
        'http_status', t.http_status,
        'detalhe', left(regexp_replace(coalesce(t.detalhe, ''), '[[:cntrl:]]+', ' ', 'g'), 300)
      ) order by t.iniciada_em)
      from public.reversa_comunicacoes_etiqueta_tentativas t
      where t.comunicacao_id = p_comunicacao_id
    ), '[]'::jsonb),
    'reconciliacoes', coalesce((
      select jsonb_agg(jsonb_build_object(
        'acao', r.acao,
        'administrador_nome', r.administrador_nome,
        'realizado_em', r.realizado_em,
        'justificativa', r.justificativa,
        'referencia', r.referencia,
        'status_anterior', r.status_anterior,
        'status_novo', r.status_novo,
        'valores_anteriores', r.valores_anteriores,
        'valores_novos', r.valores_novos
      ) order by r.realizado_em)
      from public.reversa_comunicacoes_reconciliacoes r
      where r.comunicacao_id = p_comunicacao_id
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.resumo_comunicacoes_reversa()
returns jsonb
language plpgsql stable security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'Somente administradores consultam as comunicações.' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_object_agg(s.status, s.quantidade)
    from (select c.status, count(*)::integer as quantidade
            from public.reversa_comunicacoes_etiqueta c group by c.status) s
  ), '{}'::jsonb);
end;
$$;

-- Ação sobre UMA comunicação em resultado_indeterminado, após conferência externa.
--  confirmar_conclusao_conector: a execução do fluxo comprova que a ação do conector
--    ocorreu; a linha passa a acao_conector_concluida (não prova entrega nem leitura).
--  autorizar_nova_tentativa: há evidência de que nada foi enviado; a linha volta à fila
--    e o worker revalida pertinência, acesso e destinatário antes de qualquer envio.
create or replace function public.reconciliar_comunicacao_reversa(
  p_comunicacao_id uuid,
  p_acao text,
  p_justificativa text,
  p_referencia text
) returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_c public.reversa_comunicacoes_etiqueta;
  v_n public.reversa_comunicacoes_etiqueta;
  v_justificativa text := nullif(btrim(coalesce(p_justificativa, '')), '');
  v_referencia text := nullif(btrim(coalesce(p_referencia, '')), '');
  v_nome text;
  v_antes jsonb;
  v_depois jsonb;
begin
  if v_uid is null or not public.is_admin() then
    raise exception 'Somente administradores reconciliam comunicações.' using errcode = '42501';
  end if;
  if p_acao is null or p_acao not in ('confirmar_conclusao_conector', 'autorizar_nova_tentativa') then
    raise exception 'Ação de reconciliação inválida.' using errcode = '22023';
  end if;
  if v_justificativa is null or char_length(v_justificativa) < 10 or char_length(v_justificativa) > 1000 then
    raise exception 'Informe a justificativa (10 a 1000 caracteres).' using errcode = '23514';
  end if;
  if v_referencia is null or char_length(v_referencia) < 3 or char_length(v_referencia) > 200 then
    raise exception 'Informe a referência da execução ou evidência (3 a 200 caracteres).' using errcode = '23514';
  end if;

  -- A trava de linha serializa administradores concorrentes e faz o worker pular a linha.
  select c.* into v_c from public.reversa_comunicacoes_etiqueta c
   where c.id = p_comunicacao_id for update;
  if not found then
    raise exception 'Comunicação não encontrada.' using errcode = 'P0002';
  end if;
  if v_c.status <> 'resultado_indeterminado' then
    raise exception 'Só comunicações com resultado indeterminado podem ser reconciliadas (situação atual: %).', v_c.status
      using errcode = '55000';
  end if;

  v_antes := jsonb_build_object(
    'status', v_c.status, 'tentativas', v_c.tentativas, 'max_tentativas', v_c.max_tentativas,
    'proxima_tentativa_em', v_c.proxima_tentativa_em, 'acao_conector_em', v_c.aceito_pelo_fluxo_em,
    'ultimo_erro', v_c.ultimo_erro);

  if p_acao = 'confirmar_conclusao_conector' then
    update public.reversa_comunicacoes_etiqueta
       set status = 'acao_conector_concluida', aceito_pelo_fluxo_em = now(),
           ultimo_erro = null, lock_token = null, lock_expira_em = null, atualizado_em = now()
     where id = v_c.id
    returning * into v_n;
  else
    if v_c.tentativas >= 20 then
      raise exception 'A comunicação atingiu o limite máximo absoluto de tentativas.' using errcode = '55000';
    end if;
    update public.reversa_comunicacoes_etiqueta
       set status = 'pendente', max_tentativas = greatest(max_tentativas, tentativas + 1),
           proxima_tentativa_em = now(), lock_token = null, lock_expira_em = null, atualizado_em = now()
     where id = v_c.id
    returning * into v_n;
  end if;

  v_depois := jsonb_build_object(
    'status', v_n.status, 'tentativas', v_n.tentativas, 'max_tentativas', v_n.max_tentativas,
    'proxima_tentativa_em', v_n.proxima_tentativa_em, 'acao_conector_em', v_n.aceito_pelo_fluxo_em,
    'ultimo_erro', v_n.ultimo_erro);
  v_nome := coalesce(public.usuario_nome(v_uid), 'Usuário ' || v_uid::text);

  insert into public.reversa_comunicacoes_reconciliacoes
    (comunicacao_id, acao, administrador_id, administrador_nome, justificativa, referencia,
     status_anterior, status_novo, valores_anteriores, valores_novos)
  values (v_c.id, p_acao, v_uid, v_nome, v_justificativa, v_referencia,
          v_c.status, v_n.status, v_antes, v_depois);

  return jsonb_build_object('id', v_n.id, 'status', v_n.status, 'max_tentativas', v_n.max_tentativas);
end;
$$;

revoke all on function public.listar_comunicacoes_reversa(text, text, text, uuid, integer, integer)
  from public, anon, authenticated, service_role;
revoke all on function public.listar_historico_comunicacao_reversa(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.resumo_comunicacoes_reversa()
  from public, anon, authenticated, service_role;
revoke all on function public.reconciliar_comunicacao_reversa(uuid, text, text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.listar_comunicacoes_reversa(text, text, text, uuid, integer, integer) to authenticated;
grant execute on function public.listar_historico_comunicacao_reversa(uuid) to authenticated;
grant execute on function public.resumo_comunicacoes_reversa() to authenticated;
grant execute on function public.reconciliar_comunicacao_reversa(uuid, text, text, text) to authenticated;

commit;
