-- Generaliza a fila existente para eventos do ciclo da reversa.
-- Destinatarios e ocorrencias sao derivados no banco e gravados na transacao
-- que cria/decide o pedido, vincula o PDF ou confirma postagem/recebimento.
begin;

alter table public.reversa_comunicacoes_etiqueta
  add column if not exists evento text not null default 'etiqueta_disponivel',
  add column if not exists ocorrencia_id uuid not null default gen_random_uuid(),
  add column if not exists contexto jsonb not null default '{}'::jsonb,
  alter column emissao_id drop not null;

alter table public.reversa_comunicacoes_etiqueta
  drop constraint if exists reversa_comunicacoes_etiqueta_unique_dest,
  drop constraint if exists reversa_comunicacoes_etiqueta_evento_check,
  drop constraint if exists reversa_comunicacoes_etiqueta_status_check;

drop index if exists public.reversa_comunicacao_etiqueta_sem_destinatario_uk;

alter table public.reversa_comunicacoes_etiqueta
  add constraint reversa_comunicacoes_etiqueta_evento_check check (evento in (
    'pedido_criado', 'aprovacao_pendente', 'pedido_aprovado', 'pedido_rejeitado',
    'emissao_pendente', 'etiqueta_disponivel', 'postagem_confirmada', 'recebimento_confirmado'
  )),
  add constraint reversa_comunicacoes_etiqueta_status_check check (status in (
    'aguardando_pdf', 'aguardando_rastreio', 'aguardando_identidade', 'aguardando_email',
    'pendente', 'processando', 'falhou', 'acao_conector_concluida', 'resultado_indeterminado',
    'acesso_revogado', 'emissao_substituida', 'aprovacao_indisponivel', 'limite_tentativas',
    'evento_obsoleto', 'erro_permanente'
  ));

alter table public.reversa_comunicacoes_etiqueta_tentativas
  drop constraint if exists reversa_comunicacoes_etiqueta_tentativas_resultado_check;
alter table public.reversa_comunicacoes_etiqueta_tentativas
  add constraint reversa_comunicacoes_etiqueta_tentativas_resultado_check check (resultado in (
    'em_andamento', 'acao_conector_concluida', 'falhou', 'resultado_indeterminado', 'expirou', 'erro_permanente'
  ));

create unique index reversa_comunicacoes_evento_destinatario_uk
  on public.reversa_comunicacoes_etiqueta (evento, ocorrencia_id, destinatario_id, canal)
  where destinatario_id is not null;
create unique index reversa_comunicacoes_evento_sem_destinatario_uk
  on public.reversa_comunicacoes_etiqueta (evento, ocorrencia_id, canal)
  where destinatario_id is null;

comment on column public.reversa_comunicacoes_etiqueta.evento is
  'Tipo de evento de negocio que originou esta comunicacao.';
comment on column public.reversa_comunicacoes_etiqueta.ocorrencia_id is
  'ID estavel da ocorrencia de negocio; deduplicacao por evento, destinatario e canal.';
comment on column public.reversa_comunicacoes_etiqueta.contexto is
  'Snapshot minimo e nao pessoal necessario para qualificar a ocorrencia (versao, justificativa ou timestamp).';
comment on table public.reversa_comunicacoes_etiqueta is
  'Fila transacional por ocorrencia de reversa, destinatario e canal. Acao do conector concluida nao comprova entrega ou leitura da mensagem.';

-- Os avisos antigos de etiqueta aguardavam rastreamento. O PDF vinculado e a
-- condicao de disponibilidade; rastreamento e validade continuam opcionais.
update public.reversa_comunicacoes_etiqueta c
   set status = case
         when c.destinatario_id is null then 'aguardando_identidade'
         when not exists (select 1 from auth.users u where u.id = c.destinatario_id
           and u.email is not null and u.email ~* '^[a-z0-9._%+-]+@[a-z0-9.-]+[.][a-z]{2,}$') then 'aguardando_email'
         when e.pdf_path is null then 'aguardando_pdf'
         else 'pendente'
       end,
       proxima_tentativa_em = now(), atualizado_em = now()
  from public.reversa_emissoes e
 where c.emissao_id = e.id
   and c.evento = 'etiqueta_disponivel'
   and c.status in ('aguardando_rastreio', 'aguardando_pdf', 'aguardando_email', 'aguardando_identidade');

-- Enfileiramento interno comum. O valor de destinatario nunca vem da API web.
create or replace function public.reversa_enfileirar_comunicacao(
  p_solicitacao_id uuid,
  p_evento text,
  p_ocorrencia_id uuid,
  p_destinatario_id uuid,
  p_canal text,
  p_emissao_id uuid default null,
  p_contexto jsonb default '{}'::jsonb
) returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  v_empresa text;
  v_email text;
  v_status text;
begin
  select r.empresa into v_empresa
    from public.solicitacoes_reverso r
   where r.id = p_solicitacao_id;
  if not found then return; end if;

  select u.email into v_email from auth.users u where u.id = p_destinatario_id;
  v_status := case
    when p_destinatario_id is null then 'aguardando_identidade'
    when v_email is null or v_email !~* '^[a-z0-9._%+-]+@[a-z0-9.-]+[.][a-z]{2,}$' then 'aguardando_email'
    else 'pendente'
  end;

  insert into public.reversa_comunicacoes_etiqueta
    (emissao_id, solicitacao_id, empresa, destinatario_id, canal, status, evento, ocorrencia_id, contexto)
  values
    (p_emissao_id, p_solicitacao_id, v_empresa, p_destinatario_id, p_canal, v_status,
     p_evento, p_ocorrencia_id, coalesce(p_contexto, '{}'::jsonb))
  on conflict do nothing;
end;
$$;
revoke all on function public.reversa_enfileirar_comunicacao(uuid, text, uuid, uuid, text, uuid, jsonb)
  from public, anon, authenticated, service_role;

create or replace function public.reversa_enfileirar_aprovadores(
  p_solicitacao_id uuid,
  p_ocorrencia_id uuid,
  p_versao integer
) returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  v_r public.solicitacoes_reverso;
  v_usuario uuid;
begin
  select r.* into v_r from public.solicitacoes_reverso r where r.id = p_solicitacao_id;
  if not found or v_r.aprovacao_status <> 'aguardando_aprovacao' or v_r.aprovacao_versao <> p_versao then return; end if;

  for v_usuario in
    select distinct a.usuario_id
      from public.reversa_aprovadores_setor a
      join auth.users u on u.id = a.usuario_id
     where a.empresa = v_r.empresa
       and (a.todos_setores or v_r.setor = any(a.setores))
       and coalesce(u.raw_app_meta_data -> 'telas', '[]'::jsonb) ? 'aprovar-reversa'
       and coalesce(u.raw_app_meta_data -> 'empresas_acesso', '[]'::jsonb) ? v_r.empresa
  loop
    perform public.reversa_enfileirar_comunicacao(
      v_r.id, 'aprovacao_pendente', p_ocorrencia_id, v_usuario, 'teams', null,
      jsonb_build_object('versao', p_versao)
    );
  end loop;
end;
$$;
revoke all on function public.reversa_enfileirar_aprovadores(uuid, uuid, integer)
  from public, anon, authenticated, service_role;

create or replace function public.reversa_comunicacao_apos_config_aprovador()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  v_r public.solicitacoes_reverso;
  v_ocorrencia uuid;
begin
  if not exists (
    select 1 from auth.users u
    where u.id = new.usuario_id
      and coalesce(u.raw_app_meta_data -> 'telas', '[]'::jsonb) ? 'aprovar-reversa'
      and coalesce(u.raw_app_meta_data -> 'empresas_acesso', '[]'::jsonb) ? new.empresa
  ) then return new; end if;

  for v_r in
    select r.* from public.solicitacoes_reverso r
    where r.empresa = new.empresa and r.aprovacao_status = 'aguardando_aprovacao'
      and (new.todos_setores or r.setor = any(new.setores))
  loop
    v_ocorrencia := md5('aprovacao:' || v_r.id::text || ':' || v_r.aprovacao_versao::text)::uuid;
    perform public.reversa_enfileirar_aprovadores(v_r.id, v_ocorrencia, v_r.aprovacao_versao);
  end loop;
  return new;
end;
$$;
revoke all on function public.reversa_comunicacao_apos_config_aprovador() from public, anon, authenticated, service_role;
drop trigger if exists reversa_comunicacao_apos_config_aprovador on public.reversa_aprovadores_setor;
create trigger reversa_comunicacao_apos_config_aprovador
  after insert or update on public.reversa_aprovadores_setor
  for each row execute function public.reversa_comunicacao_apos_config_aprovador();

create or replace function public.reversa_enfileirar_operadores(
  p_solicitacao_id uuid,
  p_ocorrencia_id uuid,
  p_versao integer
) returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  v_r public.solicitacoes_reverso;
  v_usuario uuid;
begin
  select r.* into v_r from public.solicitacoes_reverso r where r.id = p_solicitacao_id;
  if not found or not (v_r.aprovacao_status = 'aprovada' or v_r.aprovacao_legada) then return; end if;

  for v_usuario in
    select u.id
      from auth.users u
     where coalesce(u.raw_app_meta_data -> 'telas', '[]'::jsonb) ? 'emitir-etiqueta'
       and coalesce(u.raw_app_meta_data -> 'empresas_acesso', '[]'::jsonb) ? v_r.empresa
  loop
    perform public.reversa_enfileirar_comunicacao(
      v_r.id, 'emissao_pendente', p_ocorrencia_id, v_usuario, 'teams', null,
      jsonb_build_object('versao', p_versao)
    );
  end loop;
end;
$$;
revoke all on function public.reversa_enfileirar_operadores(uuid, uuid, integer)
  from public, anon, authenticated, service_role;

create or replace function public.reversa_comunicacao_apos_criar_pedido()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  v_ocorrencia uuid;
begin
  perform public.reversa_enfileirar_comunicacao(
    new.id, 'pedido_criado', new.id, new.solicitado_por, 'email', null, '{}'::jsonb
  );
  if new.aprovacao_status = 'aguardando_aprovacao' then
    v_ocorrencia := md5('aprovacao:' || new.id::text || ':' || new.aprovacao_versao::text)::uuid;
    perform public.reversa_enfileirar_aprovadores(new.id, v_ocorrencia, new.aprovacao_versao);
  end if;
  return new;
end;
$$;
revoke all on function public.reversa_comunicacao_apos_criar_pedido() from public, anon, authenticated, service_role;
drop trigger if exists reversa_comunicacao_apos_criar_pedido on public.solicitacoes_reverso;
create trigger reversa_comunicacao_apos_criar_pedido
  after insert on public.solicitacoes_reverso
  for each row execute function public.reversa_comunicacao_apos_criar_pedido();

create or replace function public.reversa_comunicacao_apos_evento_aprovacao()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  v_r public.solicitacoes_reverso;
  v_contexto jsonb;
begin
  select r.* into v_r from public.solicitacoes_reverso r where r.id = new.solicitacao_id;
  if not found then return new; end if;

  if new.evento in ('alterada', 'invalidada') then
    if v_r.aprovacao_status = 'aguardando_aprovacao' and v_r.aprovacao_versao = new.versao then
      perform public.reversa_enfileirar_aprovadores(v_r.id, new.id, new.versao);
    end if;
  elsif new.evento = 'aprovada' then
    v_contexto := jsonb_build_object('versao', new.versao);
    perform public.reversa_enfileirar_comunicacao(
      v_r.id, 'pedido_aprovado', new.id, v_r.solicitado_por, 'email', null, v_contexto
    );
    perform public.reversa_enfileirar_operadores(v_r.id, new.id, new.versao);
  elsif new.evento = 'rejeitada' then
    perform public.reversa_enfileirar_comunicacao(
      v_r.id, 'pedido_rejeitado', new.id, v_r.solicitado_por, 'email', null,
      jsonb_build_object('versao', new.versao, 'justificativa', new.justificativa)
    );
  end if;
  return new;
end;
$$;
revoke all on function public.reversa_comunicacao_apos_evento_aprovacao() from public, anon, authenticated, service_role;
drop trigger if exists reversa_comunicacao_apos_evento_aprovacao on public.solicitacoes_aprovacoes;
create trigger reversa_comunicacao_apos_evento_aprovacao
  after insert on public.solicitacoes_aprovacoes
  for each row execute function public.reversa_comunicacao_apos_evento_aprovacao();

-- Um evento PDF e o instante em que a emissao ganhou PDF. Nao depende do
-- rastreamento e nao reabre ao atualizar codigo ou consultar a emissao.
create or replace function public.reversa_comunicacao_apos_pdf()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  v_ocorrencia uuid;
  v_solicitante uuid;
begin
  if new.pdf_path is null or (tg_op = 'UPDATE' and old.pdf_path is not null) then return new; end if;
  select r.solicitado_por into v_solicitante
    from public.solicitacoes_reverso r where r.id = new.solicitacao_id;
  v_ocorrencia := md5('etiqueta_disponivel:' || new.id::text)::uuid;
  perform public.reversa_enfileirar_comunicacao(
    new.solicitacao_id, 'etiqueta_disponivel', v_ocorrencia, v_solicitante, 'email', new.id, '{}'::jsonb
  );
  -- Preserva o canal Teams da comunicacao de etiqueta ja existente.
  perform public.reversa_enfileirar_comunicacao(
    new.solicitacao_id, 'etiqueta_disponivel', v_ocorrencia, v_solicitante, 'teams', new.id, '{}'::jsonb
  );
  return new;
end;
$$;
revoke all on function public.reversa_comunicacao_apos_pdf() from public, anon, authenticated, service_role;
drop trigger if exists reversa_comunicacao_etiqueta_sync on public.reversa_emissoes;
drop trigger if exists reversa_comunicacao_apos_pdf on public.reversa_emissoes;
create trigger reversa_comunicacao_apos_pdf
  after insert or update of pdf_path on public.reversa_emissoes
  for each row execute function public.reversa_comunicacao_apos_pdf();

create or replace function public.reversa_comunicacao_apos_substituicao()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  if old.substituida_em is not null or new.substituida_em is null then return new; end if;

  update public.reversa_comunicacoes_etiqueta_tentativas t
     set resultado = 'resultado_indeterminado', finalizada_em = now(),
         detalhe = 'Emissao substituida durante chamada sem retorno conclusivo.'
    from public.reversa_comunicacoes_etiqueta c
   where c.emissao_id = new.id and c.status = 'processando'
     and t.lock_token = c.lock_token and t.resultado = 'em_andamento';

  update public.reversa_comunicacoes_etiqueta c
     set status = 'emissao_substituida', lock_token = null, lock_expira_em = null, atualizado_em = now()
   where c.emissao_id = new.id
     and c.status not in ('acao_conector_concluida', 'resultado_indeterminado', 'emissao_substituida');
  return new;
end;
$$;
revoke all on function public.reversa_comunicacao_apos_substituicao() from public, anon, authenticated, service_role;
drop trigger if exists reversa_comunicacao_apos_substituicao on public.reversa_emissoes;
create trigger reversa_comunicacao_apos_substituicao
  after update of substituida_em on public.reversa_emissoes
  for each row execute function public.reversa_comunicacao_apos_substituicao();

create or replace function public.reversa_comunicacao_apos_transicao_logistica()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  v_ocorrencia uuid;
begin
  if new.postado_em is not null and new.postado_em is distinct from old.postado_em
     and new.status in ('postado', 'em_transito', 'concluido') then
    v_ocorrencia := md5('postagem_confirmada:' || new.id::text || ':' || extract(epoch from new.postado_em)::text)::uuid;
    perform public.reversa_enfileirar_comunicacao(
      new.id, 'postagem_confirmada', v_ocorrencia, new.solicitado_por, 'email', null,
      jsonb_build_object('transicao_em', new.postado_em)
    );
  end if;

  if new.status = 'concluido' and old.status is distinct from 'concluido'
     and new.concluido_em is not null then
    v_ocorrencia := md5('recebimento_confirmado:' || new.id::text || ':' || extract(epoch from new.concluido_em)::text)::uuid;
    perform public.reversa_enfileirar_comunicacao(
      new.id, 'recebimento_confirmado', v_ocorrencia, new.solicitado_por, 'email', null,
      jsonb_build_object('transicao_em', new.concluido_em)
    );
  end if;
  return new;
end;
$$;
revoke all on function public.reversa_comunicacao_apos_transicao_logistica() from public, anon, authenticated, service_role;
drop trigger if exists reversa_comunicacao_apos_transicao_logistica on public.solicitacoes_reverso;
create trigger reversa_comunicacao_apos_transicao_logistica
  after update of status, postado_em, concluido_em on public.solicitacoes_reverso
  for each row execute function public.reversa_comunicacao_apos_transicao_logistica();

-- Uma correção do e-mail reativa somente destinatários/canais ainda à espera.
create or replace function public.reversa_atualizar_comunicacao_apos_email()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  if new.email is not distinct from old.email then return new; end if;
  update public.reversa_comunicacoes_etiqueta c
     set status = case
           when new.email is null or new.email !~* '^[a-z0-9._%+-]+@[a-z0-9.-]+[.][a-z]{2,}$' then 'aguardando_email'
           else 'pendente'
         end,
         proxima_tentativa_em = now(), atualizado_em = now()
   where c.destinatario_id = new.id and c.status = 'aguardando_email';
  return new;
end;
$$;
revoke all on function public.reversa_atualizar_comunicacao_apos_email() from public, anon, authenticated, service_role;

-- RPC worker: autor e destinatario/permissao sao revalidados imediatamente
-- antes de cada canal. Nenhum envio depende de dados recebidos do navegador.
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
  v_contexto jsonb;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Somente o worker de comunicacao pode iniciar o envio.' using errcode = '42501';
  end if;

  select c.* into v_c from public.reversa_comunicacoes_etiqueta c
   where c.id = p_comunicacao_id and c.status = 'processando'
     and c.lock_token = p_lock_token and c.lock_expira_em > now()
   for update;
  if not found then return null; end if;

  select r.* into v_r from public.solicitacoes_reverso r where r.id = v_c.solicitacao_id;
  select e.* into v_e from public.reversa_emissoes e where e.id = v_c.emissao_id;
  select u.* into v_u from auth.users u where u.id = v_c.destinatario_id;
  v_contexto := coalesce(v_c.contexto, '{}'::jsonb);
  v_status := null;

  if v_r.id is null then
    v_status := 'evento_obsoleto';
  elsif v_c.destinatario_id is null then
    v_status := 'aguardando_identidade';
  elsif v_u.id is null then
    v_status := 'acesso_revogado';
  elsif v_u.email is null or v_u.email !~* '^[a-z0-9._%+-]+@[a-z0-9.-]+[.][a-z]{2,}$' then
    v_status := 'aguardando_email';
  elsif v_c.evento in ('pedido_criado', 'pedido_aprovado', 'pedido_rejeitado',
                        'etiqueta_disponivel', 'postagem_confirmada', 'recebimento_confirmado') then
    if v_r.solicitado_por is distinct from v_c.destinatario_id
       or not public.reversa_usuario_pode_ler_para_comunicacao(v_c.destinatario_id, v_r.id) then
      v_status := 'acesso_revogado';
    elsif v_c.evento = 'pedido_aprovado' and not (
      v_r.aprovacao_status = 'aprovada'
      and v_r.aprovacao_versao = (v_contexto ->> 'versao')::integer
      and exists (select 1 from public.solicitacoes_aprovacoes a
        where a.id = v_c.ocorrencia_id and a.solicitacao_id = v_r.id and a.evento = 'aprovada')
    ) then
      v_status := 'evento_obsoleto';
    elsif v_c.evento = 'pedido_rejeitado' and not (
      v_r.aprovacao_status = 'rejeitada'
      and v_r.aprovacao_versao = (v_contexto ->> 'versao')::integer
      and exists (select 1 from public.solicitacoes_aprovacoes a
        where a.id = v_c.ocorrencia_id and a.solicitacao_id = v_r.id and a.evento = 'rejeitada')
    ) then
      v_status := 'evento_obsoleto';
    elsif v_c.evento = 'etiqueta_disponivel' and (
      v_e.id is null or v_e.substituida_em is not null or v_e.pdf_path is null
    ) then
      v_status := 'emissao_substituida';
    elsif v_c.evento = 'postagem_confirmada' and not (
      v_r.postado_em = (v_contexto ->> 'transicao_em')::timestamptz
      and v_r.status in ('postado', 'em_transito', 'concluido')
    ) then
      v_status := 'evento_obsoleto';
    elsif v_c.evento = 'recebimento_confirmado' and not (
      v_r.status = 'concluido'
      and v_r.concluido_em = (v_contexto ->> 'transicao_em')::timestamptz
    ) then
      v_status := 'evento_obsoleto';
    end if;
  elsif v_c.evento = 'aprovacao_pendente' then
    if not public.reversa_usuario_pode_ler_para_comunicacao(v_c.destinatario_id, v_r.id)
       or not exists (
         select 1 from public.reversa_aprovadores_setor a
         where a.empresa = v_r.empresa and a.usuario_id = v_c.destinatario_id
           and (a.todos_setores or v_r.setor = any(a.setores))
       )
       or not (coalesce(v_u.raw_app_meta_data -> 'telas', '[]'::jsonb) ? 'aprovar-reversa')
       or not (coalesce(v_u.raw_app_meta_data -> 'empresas_acesso', '[]'::jsonb) ? v_r.empresa) then
      v_status := 'aprovacao_indisponivel';
    elsif v_r.aprovacao_status <> 'aguardando_aprovacao'
       or v_r.aprovacao_versao <> (v_contexto ->> 'versao')::integer then
      v_status := 'evento_obsoleto';
    end if;
  elsif v_c.evento = 'emissao_pendente' then
    if not public.reversa_usuario_pode_ler_para_comunicacao(v_c.destinatario_id, v_r.id)
       or not (coalesce(v_u.raw_app_meta_data -> 'telas', '[]'::jsonb) ? 'emitir-etiqueta')
       or not (coalesce(v_u.raw_app_meta_data -> 'empresas_acesso', '[]'::jsonb) ? v_r.empresa) then
      v_status := 'acesso_revogado';
    elsif not (v_r.aprovacao_status = 'aprovada' or v_r.aprovacao_legada)
       or v_r.status not in ('pendente', 'etiqueta_gerada')
       or exists (select 1 from public.reversa_emissoes e
         where e.solicitacao_id = v_r.id and e.substituida_em is null and e.pdf_path is not null)
       or (v_r.etiqueta_path is not null and not exists (select 1 from public.reversa_emissoes e
         where e.solicitacao_id = v_r.id and e.substituida_em is null and e.pdf_path is null)) then
      v_status := 'evento_obsoleto';
    end if;
  else
    v_status := 'evento_obsoleto';
  end if;

  if v_status is null and v_c.tentativas >= v_c.max_tentativas then v_status := 'limite_tentativas'; end if;
  if v_status is not null then
    update public.reversa_comunicacoes_etiqueta
       set status = v_status, lock_token = null, lock_expira_em = null, atualizado_em = now()
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
    'evento', v_c.evento,
    'ocorrencia_id', v_c.ocorrencia_id,
    'canal', v_c.canal,
    'destinatario_id', v_u.id,
    'destinatario_email', v_u.email,
    'emissao_id', v_e.id,
    'solicitacao_id', v_r.id,
    'empresa', v_r.empresa,
    'setor', v_r.setor,
    'cliente_codigo', v_r.codigo_cliente::text,
    'cliente_nome', v_r.nome_cliente,
    'codigo_rastreio', v_e.codigo_rastreio,
    'valida_ate', v_e.valida_ate,
    'emitida_em', v_e.emitida_em,
    'justificativa', v_contexto ->> 'justificativa',
    'versao', nullif(v_contexto ->> 'versao', '')::integer,
    'transicao_em', v_contexto ->> 'transicao_em'
  );
end;
$$;

-- Um contrato rejeitado explicitamente antes do conector nao deve ser
-- confundido com timeout nem retentado sem corrigir a configuracao.
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
  if p_resultado is null or p_resultado not in (
    'acao_conector_concluida', 'falhou', 'resultado_indeterminado', 'erro_permanente'
  ) then
    raise exception 'Resultado de comunicacao invalido.' using errcode = '22023';
  end if;

  select c.* into v_c from public.reversa_comunicacoes_etiqueta c
   where c.id = p_comunicacao_id and c.status = 'processando' and c.lock_token = p_lock_token
   for update;
  if not found then return false; end if;

  update public.reversa_comunicacoes_etiqueta_tentativas
     set resultado = p_resultado, finalizada_em = now(), http_status = p_http_status,
         detalhe = left(nullif(btrim(p_detalhe), ''), 500)
   where lock_token = p_lock_token and resultado = 'em_andamento';

  update public.reversa_comunicacoes_etiqueta
     set status = case
           when p_resultado = 'acao_conector_concluida' then 'acao_conector_concluida'
           when p_resultado = 'resultado_indeterminado' then 'resultado_indeterminado'
           when p_resultado = 'erro_permanente' then 'erro_permanente'
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

commit;
