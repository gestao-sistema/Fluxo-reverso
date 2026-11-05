-- Transporte SMTP direto para convites e o canal e-mail da fila.
-- Mantém registros históricos do Power Automate inalterados e não processa Teams.
begin;

-- Convites: SMTP aceito é um estado próprio; não afirma entrega ou leitura.
alter table public.convites_acesso
  add column if not exists ultimo_smtp integer;
alter table public.convites_acesso
  drop constraint if exists convites_acesso_estado_check;
alter table public.convites_acesso
  add constraint convites_acesso_estado_check check (estado in (
    'preparado', 'envio_em_andamento', 'enviado', 'smtp_aceito', 'falhou',
    'resultado_indeterminado', 'rejeitado'
  ));
alter table public.convites_acesso
  drop constraint if exists convites_acesso_ultimo_smtp_check;
alter table public.convites_acesso
  add constraint convites_acesso_ultimo_smtp_check
  check (ultimo_smtp is null or ultimo_smtp between 100 and 599);

create or replace function public.admin_convite_limpar_codigo_smtp()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.estado = 'envio_em_andamento' and old.estado is distinct from new.estado then
    new.ultimo_smtp := null;
  end if;
  return new;
end;
$$;
revoke all on function public.admin_convite_limpar_codigo_smtp() from public, anon, authenticated, service_role;
drop trigger if exists admin_convite_limpar_codigo_smtp on public.convites_acesso;
create trigger admin_convite_limpar_codigo_smtp
  before update of estado on public.convites_acesso
  for each row execute function public.admin_convite_limpar_codigo_smtp();

create or replace function public.admin_convite_finalizar_envio_smtp(
  p_tentativa_id uuid,
  p_estado text,
  p_codigo_smtp integer default null,
  p_detalhe text default null
) returns boolean
language plpgsql security definer
set search_path = ''
as $$
declare
  v_linhas integer;
begin
  if auth.uid() is not null then
    raise exception 'Função restrita ao serviço de administração de usuários.' using errcode = '42501';
  end if;
  if p_estado is null or p_estado not in ('smtp_aceito', 'falhou', 'resultado_indeterminado', 'rejeitado') then
    raise exception 'Estado SMTP de convite inválido.' using errcode = '22023';
  end if;
  if p_codigo_smtp is not null and p_codigo_smtp not between 100 and 599 then
    raise exception 'Código SMTP inválido.' using errcode = '22023';
  end if;
  update public.convites_acesso c
     set estado = p_estado,
         concluido_em = now(),
         ultimo_http = null,
         ultimo_smtp = p_codigo_smtp,
         detalhe = left(nullif(btrim(p_detalhe), ''), 200)
   where c.tentativa_id = p_tentativa_id
     and c.estado = 'envio_em_andamento';
  get diagnostics v_linhas = row_count;
  return v_linhas = 1;
end;
$$;
revoke all on function public.admin_convite_finalizar_envio_smtp(uuid, text, integer, text)
  from public, anon, authenticated;
grant execute on function public.admin_convite_finalizar_envio_smtp(uuid, text, integer, text) to service_role;

-- A fila distingue a aceitação pelo SMTP de resultados históricos do conector.
alter table public.reversa_comunicacoes_etiqueta
  add column if not exists smtp_aceito_em timestamptz;
alter table public.reversa_comunicacoes_etiqueta
  drop constraint if exists reversa_comunicacoes_etiqueta_status_check;
alter table public.reversa_comunicacoes_etiqueta
  add constraint reversa_comunicacoes_etiqueta_status_check check (status in (
    'aguardando_pdf', 'aguardando_rastreio', 'aguardando_identidade', 'aguardando_email',
    'pendente', 'processando', 'falhou', 'acao_conector_concluida', 'smtp_aceito',
    'resultado_indeterminado', 'acesso_revogado', 'emissao_substituida',
    'aprovacao_indisponivel', 'limite_tentativas', 'evento_obsoleto', 'erro_permanente'
  ));

alter table public.reversa_comunicacoes_etiqueta_tentativas
  add column if not exists transporte text,
  add column if not exists codigo_smtp integer;
alter table public.reversa_comunicacoes_etiqueta_tentativas
  drop constraint if exists reversa_comunicacoes_etiqueta_tentativas_resultado_check;
alter table public.reversa_comunicacoes_etiqueta_tentativas
  add constraint reversa_comunicacoes_etiqueta_tentativas_resultado_check check (resultado in (
    'em_andamento', 'acao_conector_concluida', 'smtp_aceito', 'falhou',
    'resultado_indeterminado', 'expirou', 'erro_permanente'
  ));
alter table public.reversa_comunicacoes_etiqueta_tentativas
  drop constraint if exists reversa_comunicacoes_tentativas_transporte_check,
  drop constraint if exists reversa_comunicacoes_tentativas_codigo_smtp_check;
alter table public.reversa_comunicacoes_etiqueta_tentativas
  add constraint reversa_comunicacoes_tentativas_transporte_check
    check (transporte is null or transporte in ('power_automate', 'smtp')),
  add constraint reversa_comunicacoes_tentativas_codigo_smtp_check
    check (codigo_smtp is null or codigo_smtp between 100 and 599);

comment on column public.reversa_comunicacoes_etiqueta.smtp_aceito_em is
  'Horário em que o servidor SMTP respondeu com aceitação. Não comprova entrega nem leitura.';
comment on column public.reversa_comunicacoes_etiqueta_tentativas.transporte is
  'Transporte desta tentativa; null preserva as tentativas históricas anteriores a esta coluna.';

-- Claim específico de e-mail: estados expirados e pendências de Teams não são tocados.
create or replace function public.reversa_claim_comunicacao_email()
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

  update public.reversa_comunicacoes_etiqueta_tentativas t
     set resultado = 'resultado_indeterminado', finalizada_em = now(),
         detalhe = 'Worker SMTP interrompido após iniciar a chamada; conferir logs antes de qualquer reenvio.'
    from public.reversa_comunicacoes_etiqueta c
   where t.lock_token = c.lock_token and c.canal = 'email'
     and c.status = 'processando' and c.lock_expira_em < now()
     and t.resultado = 'em_andamento';

  update public.reversa_comunicacoes_etiqueta c
     set status = case
           when exists (select 1 from public.reversa_comunicacoes_etiqueta_tentativas t where t.lock_token = c.lock_token)
             then 'resultado_indeterminado'
           else 'pendente'
         end,
         proxima_tentativa_em = case
           when exists (select 1 from public.reversa_comunicacoes_etiqueta_tentativas t where t.lock_token = c.lock_token)
             then c.proxima_tentativa_em
           else now()
         end,
         ultimo_erro = case
           when exists (select 1 from public.reversa_comunicacoes_etiqueta_tentativas t where t.lock_token = c.lock_token)
             then 'Worker SMTP interrompido após iniciar a chamada; conferir logs antes de qualquer reenvio.'
           else null
         end,
         lock_token = null, lock_expira_em = null, atualizado_em = now()
   where c.canal = 'email' and c.status = 'processando' and c.lock_expira_em < now();

  select c.* into v_comunicacao
    from public.reversa_comunicacoes_etiqueta c
   where c.canal = 'email' and c.status in ('pendente', 'falhou')
     and c.tentativas < c.max_tentativas
     and c.proxima_tentativa_em <= now()
   order by c.criado_em, c.id
   for update skip locked
   limit 1;
  if not found then return null; end if;

  v_token := gen_random_uuid();
  update public.reversa_comunicacoes_etiqueta
     set status = 'processando', lock_token = v_token,
         lock_expira_em = now() + interval '3 minutes', atualizado_em = now()
   where id = v_comunicacao.id;

  return jsonb_build_object('comunicacao_id', v_comunicacao.id, 'lock_token', v_token);
end;
$$;
revoke all on function public.reversa_claim_comunicacao_email() from public, anon, authenticated;
grant execute on function public.reversa_claim_comunicacao_email() to service_role;

create or replace function public.reversa_marcar_tentativa_comunicacao_smtp(
  p_comunicacao_id uuid,
  p_lock_token uuid
) returns boolean
language plpgsql security definer
set search_path = ''
as $$
declare
  v_linhas integer;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Somente o worker de comunicação pode marcar o transporte.' using errcode = '42501';
  end if;
  update public.reversa_comunicacoes_etiqueta_tentativas t
     set transporte = 'smtp'
    from public.reversa_comunicacoes_etiqueta c
   where t.comunicacao_id = p_comunicacao_id and t.lock_token = p_lock_token
     and t.resultado = 'em_andamento'
     and c.id = t.comunicacao_id and c.canal = 'email'
     and c.status = 'processando' and c.lock_token = p_lock_token and c.lock_expira_em > now();
  get diagnostics v_linhas = row_count;
  return v_linhas = 1;
end;
$$;
revoke all on function public.reversa_marcar_tentativa_comunicacao_smtp(uuid, uuid) from public, anon, authenticated;
grant execute on function public.reversa_marcar_tentativa_comunicacao_smtp(uuid, uuid) to service_role;

create or replace function public.reversa_finalizar_comunicacao_email(
  p_comunicacao_id uuid,
  p_lock_token uuid,
  p_resultado text,
  p_codigo_smtp integer default null,
  p_detalhe text default null
) returns boolean
language plpgsql security definer
set search_path = ''
as $$
declare
  v_c public.reversa_comunicacoes_etiqueta;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Somente o worker de comunicação pode concluir a chamada SMTP.' using errcode = '42501';
  end if;
  if p_resultado is null or p_resultado not in ('smtp_aceito', 'falhou', 'resultado_indeterminado', 'erro_permanente') then
    raise exception 'Resultado SMTP inválido.' using errcode = '22023';
  end if;
  if p_codigo_smtp is not null and p_codigo_smtp not between 100 and 599 then
    raise exception 'Código SMTP inválido.' using errcode = '22023';
  end if;

  select c.* into v_c from public.reversa_comunicacoes_etiqueta c
   where c.id = p_comunicacao_id and c.canal = 'email'
     and c.status = 'processando' and c.lock_token = p_lock_token
   for update;
  if not found then return false; end if;

  update public.reversa_comunicacoes_etiqueta_tentativas
     set resultado = p_resultado, finalizada_em = now(), http_status = null,
         codigo_smtp = p_codigo_smtp,
         detalhe = left(nullif(btrim(p_detalhe), ''), 500)
   where comunicacao_id = p_comunicacao_id and lock_token = p_lock_token and resultado = 'em_andamento';

  update public.reversa_comunicacoes_etiqueta
     set status = case
           when p_resultado = 'smtp_aceito' then 'smtp_aceito'
           when p_resultado = 'resultado_indeterminado' then 'resultado_indeterminado'
           when p_resultado = 'erro_permanente' then 'erro_permanente'
           when tentativas >= max_tentativas then 'limite_tentativas'
           else 'falhou'
         end,
         smtp_aceito_em = case when p_resultado = 'smtp_aceito' then now() else smtp_aceito_em end,
         ultimo_erro = case when p_resultado = 'smtp_aceito' then null else left(nullif(btrim(p_detalhe), ''), 500) end,
         proxima_tentativa_em = case when p_resultado = 'falhou'
           then now() + make_interval(mins => least(60, power(2, greatest(tentativas - 1, 0))::integer))
           else proxima_tentativa_em end,
         lock_token = null, lock_expira_em = null, atualizado_em = now()
   where id = v_c.id;
  return true;
end;
$$;
revoke all on function public.reversa_finalizar_comunicacao_email(uuid, uuid, text, integer, text)
  from public, anon, authenticated;
grant execute on function public.reversa_finalizar_comunicacao_email(uuid, uuid, text, integer, text) to service_role;

-- Uma substituição de emissão não reabre um e-mail já aceito pelo servidor SMTP.
create or replace function public.reversa_comunicacao_apos_substituicao()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  if old.substituida_em is not null or new.substituida_em is null then return new; end if;
  update public.reversa_comunicacoes_etiqueta_tentativas t
     set resultado = 'resultado_indeterminado', finalizada_em = now(),
         detalhe = 'Emissão substituída durante chamada sem retorno conclusivo.'
    from public.reversa_comunicacoes_etiqueta c
   where c.emissao_id = new.id and c.status = 'processando'
     and t.lock_token = c.lock_token and t.resultado = 'em_andamento';
  update public.reversa_comunicacoes_etiqueta c
     set status = 'emissao_substituida', lock_token = null, lock_expira_em = null, atualizado_em = now()
   where c.emissao_id = new.id
     and c.status not in ('acao_conector_concluida', 'smtp_aceito', 'resultado_indeterminado', 'emissao_substituida');
  return new;
end;
$$;
revoke all on function public.reversa_comunicacao_apos_substituicao() from public, anon, authenticated, service_role;

-- Histórico novo identifica o transporte; null continua significando tentativa legada.
create or replace function public.listar_comunicacoes_reversa(
  p_status text default null,
  p_evento text default null,
  p_canal text default null,
  p_solicitacao_id uuid default null,
  p_limite integer default 50,
  p_deslocamento integer default 0
) returns table (
  id uuid, solicitacao_id uuid, pedido text, empresa text, evento text, canal text,
  destinatario_nome text, destinatario_email text, status text, tentativas integer,
  max_tentativas integer, criado_em timestamptz, atualizado_em timestamptz,
  proxima_tentativa_em timestamptz, acao_conector_em timestamptz, ultimo_erro text,
  reconciliacoes integer, total bigint
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
  select c.id, c.solicitacao_id,
         'RV-' || upper(substr(c.solicitacao_id::text, 1, 8)), c.empresa, c.evento, c.canal,
         coalesce(public.usuario_nome(c.destinatario_id), 'Sem usuário'), u.email::text,
         c.status, c.tentativas, c.max_tentativas, c.criado_em, c.atualizado_em,
         c.proxima_tentativa_em, coalesce(c.aceito_pelo_fluxo_em, c.smtp_aceito_em),
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
        'iniciada_em', t.iniciada_em, 'finalizada_em', t.finalizada_em,
        'resultado', t.resultado, 'transporte', t.transporte,
        'http_status', t.http_status, 'codigo_smtp', t.codigo_smtp,
        'detalhe', left(regexp_replace(coalesce(t.detalhe, ''), '[[:cntrl:]]+', ' ', 'g'), 300)
      ) order by t.iniciada_em)
      from public.reversa_comunicacoes_etiqueta_tentativas t where t.comunicacao_id = p_comunicacao_id
    ), '[]'::jsonb),
    'reconciliacoes', coalesce((
      select jsonb_agg(jsonb_build_object(
        'acao', r.acao, 'administrador_nome', r.administrador_nome, 'realizado_em', r.realizado_em,
        'justificativa', r.justificativa, 'referencia', r.referencia,
        'status_anterior', r.status_anterior, 'status_novo', r.status_novo,
        'valores_anteriores', r.valores_anteriores, 'valores_novos', r.valores_novos
      ) order by r.realizado_em)
      from public.reversa_comunicacoes_reconciliacoes r where r.comunicacao_id = p_comunicacao_id
    ), '[]'::jsonb)
  );
end;
$$;

-- Reconciliação conserva o provedor conhecido da última tentativa sem reclassificar o histórico.
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
  v_transporte text;
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

  select c.* into v_c from public.reversa_comunicacoes_etiqueta c
   where c.id = p_comunicacao_id for update;
  if not found then raise exception 'Comunicação não encontrada.' using errcode = 'P0002'; end if;
  if v_c.status <> 'resultado_indeterminado' then
    raise exception 'Só comunicações com resultado indeterminado podem ser reconciliadas (situação atual: %).', v_c.status
      using errcode = '55000';
  end if;
  select t.transporte into v_transporte
    from public.reversa_comunicacoes_etiqueta_tentativas t
   where t.comunicacao_id = v_c.id
   order by t.iniciada_em desc limit 1;

  v_antes := jsonb_build_object(
    'status', v_c.status, 'tentativas', v_c.tentativas, 'max_tentativas', v_c.max_tentativas,
    'proxima_tentativa_em', v_c.proxima_tentativa_em, 'acao_conector_em', v_c.aceito_pelo_fluxo_em,
    'smtp_aceito_em', v_c.smtp_aceito_em, 'ultimo_erro', v_c.ultimo_erro);

  if p_acao = 'confirmar_conclusao_conector' then
    if v_transporte = 'smtp' then
      update public.reversa_comunicacoes_etiqueta
         set status = 'smtp_aceito', smtp_aceito_em = now(),
             ultimo_erro = null, lock_token = null, lock_expira_em = null, atualizado_em = now()
       where id = v_c.id returning * into v_n;
    else
      update public.reversa_comunicacoes_etiqueta
         set status = 'acao_conector_concluida', aceito_pelo_fluxo_em = now(),
             ultimo_erro = null, lock_token = null, lock_expira_em = null, atualizado_em = now()
       where id = v_c.id returning * into v_n;
    end if;
  else
    if v_c.tentativas >= 20 then
      raise exception 'A comunicação atingiu o limite máximo absoluto de tentativas.' using errcode = '55000';
    end if;
    update public.reversa_comunicacoes_etiqueta
       set status = 'pendente', max_tentativas = greatest(max_tentativas, tentativas + 1),
           proxima_tentativa_em = now(), lock_token = null, lock_expira_em = null, atualizado_em = now()
     where id = v_c.id returning * into v_n;
  end if;

  v_depois := jsonb_build_object(
    'status', v_n.status, 'tentativas', v_n.tentativas, 'max_tentativas', v_n.max_tentativas,
    'proxima_tentativa_em', v_n.proxima_tentativa_em, 'acao_conector_em', v_n.aceito_pelo_fluxo_em,
    'smtp_aceito_em', v_n.smtp_aceito_em, 'ultimo_erro', v_n.ultimo_erro);
  v_nome := coalesce(public.usuario_nome(v_uid), 'Usuário ' || v_uid::text);
  insert into public.reversa_comunicacoes_reconciliacoes
    (comunicacao_id, acao, administrador_id, administrador_nome, justificativa, referencia,
     status_anterior, status_novo, valores_anteriores, valores_novos)
  values (v_c.id, p_acao, v_uid, v_nome, v_justificativa, v_referencia,
          v_c.status, v_n.status, v_antes, v_depois);
  return jsonb_build_object('id', v_n.id, 'status', v_n.status, 'max_tentativas', v_n.max_tentativas);
end;
$$;

commit;
