-- Fila transacional e privada para avisar o autor quando uma emissao tem PDF
-- vinculado e codigo de rastreio. Email e Teams possuem estados/retries proprios.
begin;

create table if not exists public.reversa_comunicacoes_etiqueta (
  id uuid primary key default gen_random_uuid(),
  emissao_id uuid not null references public.reversa_emissoes(id) on delete cascade,
  solicitacao_id uuid not null references public.solicitacoes_reverso(id) on delete cascade,
  empresa text not null check (empresa in ('Alinare', 'Novitah')),
  destinatario_id uuid references auth.users(id) on delete set null,
  canal text not null check (canal in ('email', 'teams')),
  status text not null check (status in (
    'aguardando_pdf', 'aguardando_rastreio', 'aguardando_identidade', 'aguardando_email',
    'pendente', 'processando', 'falhou', 'aceito_pelo_fluxo', 'acesso_revogado',
    'emissao_substituida', 'aprovacao_indisponivel', 'limite_tentativas'
  )),
  tentativas integer not null default 0 check (tentativas >= 0),
  max_tentativas integer not null default 5 check (max_tentativas between 1 and 10),
  proxima_tentativa_em timestamptz not null default now(),
  lock_token uuid,
  lock_expira_em timestamptz,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  aceito_pelo_fluxo_em timestamptz,
  ultimo_erro text,
  constraint reversa_comunicacao_etiqueta_lock_check
    check ((status = 'processando') = (lock_token is not null and lock_expira_em is not null)),
  constraint reversa_comunicacao_etiqueta_unique_dest
    unique (emissao_id, destinatario_id, canal)
);

create unique index if not exists reversa_comunicacao_etiqueta_sem_destinatario_uk
  on public.reversa_comunicacoes_etiqueta (emissao_id, canal)
  where destinatario_id is null;
create index if not exists reversa_comunicacao_etiqueta_fila_idx
  on public.reversa_comunicacoes_etiqueta (status, proxima_tentativa_em, criado_em)
  where status in ('pendente', 'falhou');

create table if not exists public.reversa_comunicacoes_etiqueta_tentativas (
  id uuid primary key default gen_random_uuid(),
  comunicacao_id uuid not null references public.reversa_comunicacoes_etiqueta(id) on delete cascade,
  lock_token uuid not null unique,
  iniciada_em timestamptz not null default now(),
  finalizada_em timestamptz,
  resultado text not null check (resultado in ('em_andamento', 'aceito_pelo_fluxo', 'falhou', 'expirou')),
  http_status integer,
  detalhe text,
  constraint reversa_comunicacao_tentativa_finalizada_check
    check ((resultado = 'em_andamento') = (finalizada_em is null))
);
create index if not exists reversa_comunicacoes_tentativas_hist_idx
  on public.reversa_comunicacoes_etiqueta_tentativas (comunicacao_id, iniciada_em desc);

comment on table public.reversa_comunicacoes_etiqueta is
  'Fila privada por emissao, autor e canal. Aceito pelo fluxo nao comprova entrega da mensagem.';
comment on table public.reversa_comunicacoes_etiqueta_tentativas is
  'Historico independente das chamadas por canal ao fluxo Power Automate; nao guarda destinatario nem corpo da mensagem.';

alter table public.reversa_comunicacoes_etiqueta enable row level security;
alter table public.reversa_comunicacoes_etiqueta_tentativas enable row level security;
revoke all on table public.reversa_comunicacoes_etiqueta,
  public.reversa_comunicacoes_etiqueta_tentativas from public, anon, authenticated;

-- Reavalia a leitura usando os mesmos escopos atuais de empresas_permitidas()
-- e o acesso proprio de Meus Pedidos. Lida somente app_metadata do servidor.
create or replace function public.reversa_usuario_pode_ler_para_comunicacao(
  p_usuario_id uuid,
  p_solicitacao_id uuid
) returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.solicitacoes_reverso r
    join auth.users u on u.id = p_usuario_id
    where r.id = p_solicitacao_id
      and (
        coalesce(u.raw_app_meta_data -> 'telas', '[]'::jsonb) ? 'usuarios'
        or u.raw_app_meta_data ->> 'perfil' = 'ADMIN'
        or coalesce(u.raw_app_meta_data -> 'telas', '[]'::jsonb) ?| array[
          'dashboard-geral', 'lista-geral', 'status-geral', 'kanban', 'kanban-edit', 'nc', 'nc-edit'
        ]
        or (
          case r.empresa
            when 'Alinare' then coalesce(u.raw_app_meta_data -> 'telas', '[]'::jsonb) ?| array[
              'dashboard-alinare', 'formulario-alinare', 'lista-alinare', 'status-alinare'
            ]
            when 'Novitah' then coalesce(u.raw_app_meta_data -> 'telas', '[]'::jsonb) ?| array[
              'dashboard-novitah', 'formulario-novitah', 'lista-novitah', 'status-novitah'
            ]
            else false
          end
        )
        or (
          coalesce(u.raw_app_meta_data -> 'telas', '[]'::jsonb) ?| array[
            'aprovar-reversa', 'emitir-etiqueta', 'confirmar-checkin'
          ]
          and coalesce(u.raw_app_meta_data -> 'empresas_acesso', '[]'::jsonb) ? r.empresa
        )
        or (
          r.solicitado_por = p_usuario_id
          and (
            coalesce(u.raw_app_meta_data -> 'telas', '[]'::jsonb) ? 'usuarios'
            or u.raw_app_meta_data ->> 'perfil' = 'ADMIN'
            or coalesce(u.raw_app_meta_data -> 'telas', '[]'::jsonb) ? 'nc-edit'
            or (r.empresa = 'Alinare' and coalesce(u.raw_app_meta_data -> 'telas', '[]'::jsonb) ? 'formulario-alinare')
            or (r.empresa = 'Novitah' and coalesce(u.raw_app_meta_data -> 'telas', '[]'::jsonb) ? 'formulario-novitah')
          )
        )
      )
  );
$$;
revoke all on function public.reversa_usuario_pode_ler_para_comunicacao(uuid, uuid) from public, anon, authenticated;

create or replace function public.reversa_criar_ou_aguardar_comunicacao_etiqueta()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  v_solicitacao public.solicitacoes_reverso;
  v_email text;
  v_status text;
begin
  if new.substituida_em is not null then
    update public.reversa_comunicacoes_etiqueta_tentativas t
       set resultado = 'expirou', finalizada_em = now(),
           detalhe = 'Emissao substituida durante uma chamada ao fluxo.'
      from public.reversa_comunicacoes_etiqueta c
     where c.emissao_id = new.id
       and c.status = 'processando'
       and t.lock_token = c.lock_token
       and t.resultado = 'em_andamento';

    update public.reversa_comunicacoes_etiqueta c
       set status = 'emissao_substituida', lock_token = null, lock_expira_em = null,
           atualizado_em = now()
     where c.emissao_id = new.id
       and c.status not in ('aceito_pelo_fluxo', 'emissao_substituida');
    return new;
  end if;

  if new.pdf_path is null then
    return new;
  end if;

  select r.* into v_solicitacao
    from public.solicitacoes_reverso r
   where r.id = new.solicitacao_id;
  if not found then
    return new;
  end if;

  select u.email into v_email
    from auth.users u
   where u.id = v_solicitacao.solicitado_por;

  v_status := case
    when v_solicitacao.solicitado_por is null then 'aguardando_identidade'
    when new.codigo_rastreio is null then 'aguardando_rastreio'
    when v_email is null or v_email !~* '^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$' then 'aguardando_email'
    else 'pendente'
  end;

  insert into public.reversa_comunicacoes_etiqueta
    (emissao_id, solicitacao_id, empresa, destinatario_id, canal, status)
  values
    (new.id, v_solicitacao.id, v_solicitacao.empresa, v_solicitacao.solicitado_por, 'email', v_status),
    (new.id, v_solicitacao.id, v_solicitacao.empresa, v_solicitacao.solicitado_por, 'teams', v_status)
  on conflict do nothing;

  -- Um codigo informado depois libera a mesma pendencia/canal. Falhas existentes
  -- conservam backoff e contador; somente estados de espera sao reavaliados aqui.
  update public.reversa_comunicacoes_etiqueta c
     set status = case
           when v_solicitacao.solicitado_por is null then 'aguardando_identidade'
           when new.codigo_rastreio is null then 'aguardando_rastreio'
           when v_email is null or v_email !~* '^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$' then 'aguardando_email'
           when c.tentativas >= c.max_tentativas then 'limite_tentativas'
           else 'pendente'
         end,
         proxima_tentativa_em = case
           when c.status in ('aguardando_pdf', 'aguardando_rastreio', 'aguardando_identidade', 'aguardando_email')
             then now()
           else c.proxima_tentativa_em
         end,
         atualizado_em = now()
   where c.emissao_id = new.id
     and c.status in ('aguardando_pdf', 'aguardando_rastreio', 'aguardando_identidade', 'aguardando_email');

  return new;
end;
$$;
revoke all on function public.reversa_criar_ou_aguardar_comunicacao_etiqueta() from public, anon, authenticated;

drop trigger if exists reversa_comunicacao_etiqueta_sync on public.reversa_emissoes;
create trigger reversa_comunicacao_etiqueta_sync
  after insert or update of pdf_path, codigo_rastreio, substituida_em on public.reversa_emissoes
  for each row execute function public.reversa_criar_ou_aguardar_comunicacao_etiqueta();

-- Corrigir um e-mail ausente/invalido na conta libera apenas os canais ainda
-- aguardando e nunca cria uma comunicacao para outro destinatario.
create or replace function public.reversa_atualizar_comunicacao_apos_email()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  if new.email is not distinct from old.email then
    return new;
  end if;

  update public.reversa_comunicacoes_etiqueta c
     set status = case
           when new.email is null or new.email !~* '^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$' then 'aguardando_email'
           when e.substituida_em is not null then 'emissao_substituida'
           when e.pdf_path is null then 'aguardando_pdf'
           when e.codigo_rastreio is null then 'aguardando_rastreio'
           else 'pendente'
         end,
         proxima_tentativa_em = now(), atualizado_em = now()
    from public.reversa_emissoes e
   where c.destinatario_id = new.id
     and c.emissao_id = e.id
     and c.status in ('aguardando_email', 'aguardando_rastreio', 'aguardando_pdf');
  return new;
end;
$$;
revoke all on function public.reversa_atualizar_comunicacao_apos_email() from public, anon, authenticated;
drop trigger if exists reversa_comunicacao_etiqueta_email_auth on auth.users;
create trigger reversa_comunicacao_etiqueta_email_auth
  after update of email on auth.users
  for each row execute function public.reversa_atualizar_comunicacao_apos_email();

-- Reserva um canal por vez. Nenhuma entrada do navegador participa da seleção.
create or replace function public.reversa_claim_comunicacao_etiqueta()
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  v_comunicacao public.reversa_comunicacoes_etiqueta;
  v_token uuid;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Somente o worker de comunicação pode retirar itens da fila.' using errcode = '42501';
  end if;

  -- Solta reservas abandonadas. A tentativa iniciada permanece no histórico.
  update public.reversa_comunicacoes_etiqueta_tentativas t
     set resultado = 'expirou', finalizada_em = now(),
         detalhe = 'Reserva do worker expirou antes do retorno do fluxo.'
    from public.reversa_comunicacoes_etiqueta c
   where t.lock_token = c.lock_token
     and c.status = 'processando'
     and c.lock_expira_em < now()
     and t.resultado = 'em_andamento';

  update public.reversa_comunicacoes_etiqueta c
     set status = case when c.tentativas >= c.max_tentativas then 'limite_tentativas' else 'falhou' end,
         proxima_tentativa_em = case when c.tentativas = 0 then now()
           else now() + make_interval(mins => least(60, power(2, greatest(c.tentativas - 1, 0))::integer)) end,
         ultimo_erro = 'Reserva do worker expirou antes do retorno do fluxo.',
         lock_token = null, lock_expira_em = null, atualizado_em = now()
   where c.status = 'processando' and c.lock_expira_em < now();

  select c.* into v_comunicacao
    from public.reversa_comunicacoes_etiqueta c
   where c.status in ('pendente', 'falhou')
     and c.tentativas < c.max_tentativas
     and c.proxima_tentativa_em <= now()
   order by c.criado_em, c.id
   for update skip locked
   limit 1;
  if not found then
    return null;
  end if;

  v_token := gen_random_uuid();
  update public.reversa_comunicacoes_etiqueta
     set status = 'processando', lock_token = v_token,
         lock_expira_em = now() + interval '3 minutes', atualizado_em = now()
   where id = v_comunicacao.id;

  return jsonb_build_object('comunicacao_id', v_comunicacao.id, 'lock_token', v_token);
end;
$$;

-- Revalida solicitante, email, aprovacao, acesso atual, emissao vigente, PDF e
-- rastreio imediatamente antes de iniciar cada chamada externa.
create or replace function public.reversa_iniciar_comunicacao_etiqueta(
  p_comunicacao_id uuid,
  p_lock_token uuid
) returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  v_c public.reversa_comunicacoes_etiqueta;
  v_e public.reversa_emissoes;
  v_r public.solicitacoes_reverso;
  v_u auth.users;
  v_tentativa uuid;
  v_status text;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Somente o worker de comunicacao pode iniciar o envio.' using errcode = '42501';
  end if;

  select c.* into v_c from public.reversa_comunicacoes_etiqueta c
   where c.id = p_comunicacao_id and c.status = 'processando'
     and c.lock_token = p_lock_token and c.lock_expira_em > now()
   for update;
  if not found then
    return null;
  end if;

  select e.* into v_e from public.reversa_emissoes e where e.id = v_c.emissao_id;
  select r.* into v_r from public.solicitacoes_reverso r where r.id = v_c.solicitacao_id;
  select u.* into v_u from auth.users u where u.id = v_c.destinatario_id;

  v_status := case
    when v_c.destinatario_id is null or v_r.solicitado_por is null then 'aguardando_identidade'
    when v_r.solicitado_por is distinct from v_c.destinatario_id then 'acesso_revogado'
    when v_e.substituida_em is not null then 'emissao_substituida'
    when v_e.pdf_path is null then 'aguardando_pdf'
    when v_e.codigo_rastreio is null then 'aguardando_rastreio'
    when not (v_r.aprovacao_status = 'aprovada' or v_r.aprovacao_legada) then 'aprovacao_indisponivel'
    when not public.reversa_usuario_pode_ler_para_comunicacao(v_c.destinatario_id, v_c.solicitacao_id) then 'acesso_revogado'
    when v_u.id is null or v_u.email is null or v_u.email !~* '^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$' then 'aguardando_email'
    when v_c.tentativas >= v_c.max_tentativas then 'limite_tentativas'
    else null
  end;

  if v_status is not null then
    update public.reversa_comunicacoes_etiqueta
       set status = v_status, lock_token = null, lock_expira_em = null,
           atualizado_em = now()
     where id = v_c.id;
    return null;
  end if;

  v_tentativa := gen_random_uuid();
  insert into public.reversa_comunicacoes_etiqueta_tentativas
    (id, comunicacao_id, lock_token, resultado)
  values (v_tentativa, v_c.id, p_lock_token, 'em_andamento');
  update public.reversa_comunicacoes_etiqueta
     set tentativas = tentativas + 1, atualizado_em = now()
   where id = v_c.id;

  return jsonb_build_object(
    'comunicacao_id', v_c.id,
    'tentativa_id', v_tentativa,
    'lock_token', p_lock_token,
    'canal', v_c.canal,
    'destinatario_id', v_u.id,
    'destinatario_email', v_u.email,
    'emissao_id', v_e.id,
    'solicitacao_id', v_r.id,
    'empresa', v_r.empresa,
    'cliente_codigo', v_r.codigo_cliente::text,
    'cliente_nome', v_r.nome_cliente,
    'codigo_rastreio', v_e.codigo_rastreio,
    'valida_ate', v_e.valida_ate,
    'emitida_em', v_e.emitida_em
  );
end;
$$;

create or replace function public.reversa_finalizar_comunicacao_etiqueta(
  p_comunicacao_id uuid,
  p_lock_token uuid,
  p_aceito boolean,
  p_http_status integer default null,
  p_detalhe text default null
) returns boolean
language plpgsql security definer
set search_path = ''
as $$
declare
  v_c public.reversa_comunicacoes_etiqueta;
  v_resultado text;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Somente o worker de comunicacao pode concluir a chamada.' using errcode = '42501';
  end if;

  select c.* into v_c from public.reversa_comunicacoes_etiqueta c
   where c.id = p_comunicacao_id and c.status = 'processando' and c.lock_token = p_lock_token
   for update;
  if not found then
    return false;
  end if;

  v_resultado := case when p_aceito then 'aceito_pelo_fluxo' else 'falhou' end;
  update public.reversa_comunicacoes_etiqueta_tentativas
     set resultado = v_resultado,
         finalizada_em = now(),
         http_status = p_http_status,
         detalhe = left(nullif(btrim(p_detalhe), ''), 500)
   where lock_token = p_lock_token and resultado = 'em_andamento';

  update public.reversa_comunicacoes_etiqueta
     set status = case
           when p_aceito then 'aceito_pelo_fluxo'
           when tentativas >= max_tentativas then 'limite_tentativas'
           else 'falhou'
         end,
         aceito_pelo_fluxo_em = case when p_aceito then now() else aceito_pelo_fluxo_em end,
         ultimo_erro = case when p_aceito then null else left(nullif(btrim(p_detalhe), ''), 500) end,
         proxima_tentativa_em = case when p_aceito then proxima_tentativa_em
           else now() + make_interval(mins => least(60, power(2, greatest(tentativas - 1, 0))::integer)) end,
         lock_token = null, lock_expira_em = null, atualizado_em = now()
   where id = v_c.id;
  return true;
end;
$$;

create or replace function public.reversa_contar_comunicacoes_pendentes()
returns jsonb
language sql stable security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'email', count(*) filter (where canal = 'email'),
    'teams', count(*) filter (where canal = 'teams'),
    'total', count(*)
  )
  from public.reversa_comunicacoes_etiqueta
  where status in ('pendente', 'falhou') and tentativas < max_tentativas;
$$;

revoke all on function public.reversa_claim_comunicacao_etiqueta() from public, anon, authenticated;
revoke all on function public.reversa_iniciar_comunicacao_etiqueta(uuid, uuid) from public, anon, authenticated;
revoke all on function public.reversa_finalizar_comunicacao_etiqueta(uuid, uuid, boolean, integer, text) from public, anon, authenticated;
revoke all on function public.reversa_contar_comunicacoes_pendentes() from public, anon, authenticated;
grant execute on function public.reversa_claim_comunicacao_etiqueta() to service_role;
grant execute on function public.reversa_iniciar_comunicacao_etiqueta(uuid, uuid) to service_role;
grant execute on function public.reversa_finalizar_comunicacao_etiqueta(uuid, uuid, boolean, integer, text) to service_role;
grant execute on function public.reversa_contar_comunicacoes_pendentes() to service_role;

commit;
