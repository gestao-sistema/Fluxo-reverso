-- Distingue sucesso reportado pelo conector de entrega ao destinatario e
-- impede retry automatico quando o resultado externo pode ser ambiguo.
begin;

alter table public.reversa_comunicacoes_etiqueta
  drop constraint reversa_comunicacoes_etiqueta_status_check;
update public.reversa_comunicacoes_etiqueta
   set status = 'acao_conector_concluida'
 where status = 'aceito_pelo_fluxo';
alter table public.reversa_comunicacoes_etiqueta
  add constraint reversa_comunicacoes_etiqueta_status_check
  check (status in (
    'aguardando_pdf', 'aguardando_rastreio', 'aguardando_identidade', 'aguardando_email',
    'pendente', 'processando', 'falhou', 'acao_conector_concluida', 'resultado_indeterminado',
    'acesso_revogado', 'emissao_substituida', 'aprovacao_indisponivel', 'limite_tentativas'
  ));

alter table public.reversa_comunicacoes_etiqueta_tentativas
  drop constraint reversa_comunicacoes_etiqueta_tentativas_resultado_check;
update public.reversa_comunicacoes_etiqueta_tentativas
   set resultado = 'acao_conector_concluida'
 where resultado = 'aceito_pelo_fluxo';
alter table public.reversa_comunicacoes_etiqueta_tentativas
  add constraint reversa_comunicacoes_etiqueta_tentativas_resultado_check
  check (resultado in (
    'em_andamento', 'acao_conector_concluida', 'falhou', 'resultado_indeterminado', 'expirou'
  ));

comment on table public.reversa_comunicacoes_etiqueta is
  'Fila privada por emissao, autor e canal. Acao do conector concluida nao comprova entrega ou leitura da mensagem.';

-- Reserva concorrente de um canal. Uma interrupcao antes de criar tentativa e
-- segura para repetir; depois que a tentativa existe, o efeito externo pode
-- ter ocorrido e a fila passa a resultado_indeterminado, sem retry automatico.
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
    raise exception 'Somente o worker de comunicacao pode retirar itens da fila.' using errcode = '42501';
  end if;

  update public.reversa_comunicacoes_etiqueta_tentativas t
     set resultado = 'resultado_indeterminado', finalizada_em = now(),
         detalhe = 'Worker interrompido apos iniciar a chamada; verificar o historico do fluxo antes de reenviar.'
    from public.reversa_comunicacoes_etiqueta c
   where t.lock_token = c.lock_token
     and c.status = 'processando'
     and c.lock_expira_em < now()
     and t.resultado = 'em_andamento';

  update public.reversa_comunicacoes_etiqueta c
     set status = case
           when exists (
             select 1 from public.reversa_comunicacoes_etiqueta_tentativas t
              where t.lock_token = c.lock_token
           ) then 'resultado_indeterminado'
           else 'pendente'
         end,
         proxima_tentativa_em = case
           when exists (
             select 1 from public.reversa_comunicacoes_etiqueta_tentativas t
              where t.lock_token = c.lock_token
           ) then c.proxima_tentativa_em
           else now()
         end,
         ultimo_erro = case
           when exists (
             select 1 from public.reversa_comunicacoes_etiqueta_tentativas t
              where t.lock_token = c.lock_token
           ) then 'Worker interrompido apos iniciar a chamada; resultado externo indeterminado.'
           else null
         end,
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

-- Mantem a API antiga sem permissao de execucao para nao deixar uma via de
-- finalizacao booleana que nao represente resultado ambiguo.
revoke all on function public.reversa_finalizar_comunicacao_etiqueta(uuid, uuid, boolean, integer, text)
  from public, anon, authenticated, service_role;

create or replace function public.reversa_finalizar_comunicacao_etiqueta_v2(
  p_comunicacao_id uuid,
  p_lock_token uuid,
  p_resultado text,
  p_http_status integer default null,
  p_detalhe text default null
) returns boolean
language plpgsql security definer
set search_path = ''
as $$
declare
  v_c public.reversa_comunicacoes_etiqueta;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Somente o worker de comunicacao pode concluir a chamada.' using errcode = '42501';
  end if;
  if p_resultado is null or p_resultado not in ('acao_conector_concluida', 'falhou', 'resultado_indeterminado') then
    raise exception 'Resultado de comunicacao invalido.' using errcode = '22023';
  end if;

  select c.* into v_c from public.reversa_comunicacoes_etiqueta c
   where c.id = p_comunicacao_id and c.status = 'processando' and c.lock_token = p_lock_token
   for update;
  if not found then
    return false;
  end if;

  update public.reversa_comunicacoes_etiqueta_tentativas
     set resultado = p_resultado,
         finalizada_em = now(),
         http_status = p_http_status,
         detalhe = left(nullif(btrim(p_detalhe), ''), 500)
   where lock_token = p_lock_token and resultado = 'em_andamento';

  update public.reversa_comunicacoes_etiqueta
     set status = case
           when p_resultado = 'acao_conector_concluida' then 'acao_conector_concluida'
           when p_resultado = 'resultado_indeterminado' then 'resultado_indeterminado'
           when tentativas >= max_tentativas then 'limite_tentativas'
           else 'falhou'
         end,
         aceito_pelo_fluxo_em = case when p_resultado = 'acao_conector_concluida' then now() else aceito_pelo_fluxo_em end,
         ultimo_erro = case when p_resultado = 'acao_conector_concluida' then null else left(nullif(btrim(p_detalhe), ''), 500) end,
         proxima_tentativa_em = case when p_resultado = 'falhou'
           then now() + make_interval(mins => least(60, power(2, greatest(tentativas - 1, 0))::integer))
           else proxima_tentativa_em end,
         lock_token = null, lock_expira_em = null, atualizado_em = now()
   where id = v_c.id;
  return true;
end;
$$;

-- Atualiza o estado legado usado pelos triggers ao preservar comunicacoes ja
-- concluidas em uma substituicao e registra como ambiguo o worker interrompido.
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
       set resultado = 'resultado_indeterminado', finalizada_em = now(),
           detalhe = 'Emissao substituida durante chamada sem retorno conclusivo.'
      from public.reversa_comunicacoes_etiqueta c
     where c.emissao_id = new.id
       and c.status = 'processando'
       and t.lock_token = c.lock_token
       and t.resultado = 'em_andamento';

    update public.reversa_comunicacoes_etiqueta c
       set status = 'emissao_substituida', lock_token = null, lock_expira_em = null,
           atualizado_em = now()
     where c.emissao_id = new.id
       and c.status not in ('acao_conector_concluida', 'resultado_indeterminado', 'emissao_substituida');
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

revoke all on function public.reversa_claim_comunicacao_etiqueta() from public, anon, authenticated;
revoke all on function public.reversa_finalizar_comunicacao_etiqueta_v2(uuid, uuid, text, integer, text)
  from public, anon, authenticated;
grant execute on function public.reversa_claim_comunicacao_etiqueta() to service_role;
grant execute on function public.reversa_finalizar_comunicacao_etiqueta_v2(uuid, uuid, text, integer, text)
  to service_role;
revoke all on function public.reversa_criar_ou_aguardar_comunicacao_etiqueta() from public, anon, authenticated;

commit;
