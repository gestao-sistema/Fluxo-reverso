-- Correções incrementais da fila de comunicação do ciclo da reversa
-- (20261026200000 a 20261026220000 permanecem como publicadas).
--
-- 1. Uma ocorrência por pedido e versão de aprovação, qualquer que seja a origem
--    do aviso (criação, alteração, invalidação ou nova configuração de aprovadores).
-- 2. Aprovador que não pode decidir aquele pedido (autor ou produtor da versão sem
--    autoaprovação) não recebe tarefa de aprovação.
-- 3. Postagem confirmada = confirmação registrada na emissão (manual ou rastreio
--    gravado como tal). Mudança de etapa feita pelo rastreio automático não avisa.
-- 4. Recebimento confirmado = confirmação manual da empresa, registrada em tabela
--    própria. A entrega informada pelos Correios também conclui o pedido, mas não
--    é recebimento físico e não gera aviso de recebimento.
-- 5. Atualizações históricas ao solicitante não perdem validade só porque o pedido
--    avançou; tarefas (aprovação/emissão pendente) perdem.
-- 6. A leitura do destinatário é avaliada pela própria pode_ler_solicitacao.
-- Nada é enfileirado retroativamente: somente triggers de eventos novos.
begin;

-- A migration 20261026220000 tentou remover esta unique pelo nome no plural e ela
-- permaneceu ativa: com ON CONFLICT DO NOTHING, um segundo evento da mesma emissão,
-- destinatário e canal (ex.: postagem após etiqueta) seria descartado em silêncio.
-- A deduplicação vigente é (evento, ocorrencia_id, destinatario_id, canal).
alter table public.reversa_comunicacoes_etiqueta
  drop constraint if exists reversa_comunicacao_etiqueta_unique_dest;

-- Limite de tentativas por canal: permite autorizar nova tentativa após reconciliação.
alter table public.reversa_comunicacoes_etiqueta
  drop constraint if exists reversa_comunicacoes_etiqueta_max_tentativas_check;
alter table public.reversa_comunicacoes_etiqueta
  add constraint reversa_comunicacoes_etiqueta_max_tentativas_check
  check (max_tentativas between 1 and 20);

-- Tabela própria do recebimento físico confirmado pela empresa.
create table if not exists public.reversa_recebimentos_confirmados (
  solicitacao_id uuid primary key references public.solicitacoes_reverso(id) on delete cascade,
  confirmado_em timestamptz not null default now(),
  confirmado_por uuid references auth.users(id) on delete set null,
  confirmado_por_nome text not null
);
comment on table public.reversa_recebimentos_confirmados is
  'Recebimento físico confirmado manualmente pela empresa (confirmar_recebimento_mercadoria). Entrega informada pelos Correios não cria linha aqui.';
alter table public.reversa_recebimentos_confirmados enable row level security;
revoke all on table public.reversa_recebimentos_confirmados from public, anon, authenticated;
grant select on table public.reversa_recebimentos_confirmados to authenticated;
drop policy if exists "recebimentos_confirmados_select" on public.reversa_recebimentos_confirmados;
create policy "recebimentos_confirmados_select" on public.reversa_recebimentos_confirmados
  for select to authenticated
  using (public.pode_ler_solicitacao(solicitacao_id));

-- Avisos de postagem/recebimento da versão anterior vinham de mudança de etapa
-- (inclusive do rastreio automático). Os ainda não enviados deixam de valer.
update public.reversa_comunicacoes_etiqueta
   set status = 'evento_obsoleto', lock_token = null, lock_expira_em = null, atualizado_em = now()
 where evento in ('postagem_confirmada', 'recebimento_confirmado')
   and emissao_id is null
   and status in ('pendente', 'falhou', 'aguardando_email', 'aguardando_identidade');

-- Autoridade do aprovador sobre aquele pedido, no momento atual.
create or replace function public.reversa_aprovador_pode_decidir(
  p_usuario_id uuid,
  p_solicitacao_id uuid
) returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.solicitacoes_reverso r
    join public.reversa_aprovadores_setor a
      on a.empresa = r.empresa and a.usuario_id = p_usuario_id
     and (a.todos_setores or r.setor = any (a.setores))
    join auth.users u on u.id = p_usuario_id
    where r.id = p_solicitacao_id
      and coalesce(u.raw_app_meta_data -> 'telas', '[]'::jsonb) ? 'aprovar-reversa'
      and coalesce(u.raw_app_meta_data -> 'empresas_acesso', '[]'::jsonb) ? r.empresa
      and (
        coalesce((select c.permitir_autoaprovacao from public.aprovacao_config c where c.id), false)
        or (r.solicitado_por is distinct from p_usuario_id
            and r.aprovacao_versao_por is distinct from p_usuario_id)
      )
  );
$$;
revoke all on function public.reversa_aprovador_pode_decidir(uuid, uuid)
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
     where a.empresa = v_r.empresa
       and public.reversa_aprovador_pode_decidir(a.usuario_id, v_r.id)
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

-- Uma configuração de aprovadores regravada (ou um novo aprovador) avisa sobre os pedidos
-- pendentes DESTA infraestrutura. Pedidos que já estavam pendentes antes da fila de
-- comunicação (sem a linha pedido_criado) não geram aviso retroativo em lote: continuam
-- visíveis na fila de aprovação.
create or replace function public.reversa_comunicacao_apos_config_aprovador()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  v_r public.solicitacoes_reverso;
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
      and exists (select 1 from public.reversa_comunicacoes_etiqueta c
                   where c.solicitacao_id = r.id and c.evento = 'pedido_criado')
  loop
    perform public.reversa_enfileirar_aprovadores(
      v_r.id, md5('aprovacao:' || v_r.id::text || ':' || v_r.aprovacao_versao::text)::uuid, v_r.aprovacao_versao);
  end loop;
  return new;
end;
$$;
revoke all on function public.reversa_comunicacao_apos_config_aprovador()
  from public, anon, authenticated, service_role;

-- Pedido novo: e-mail ao autor e Teams aos aprovadores da rodada 1.
create or replace function public.reversa_comunicacao_apos_criar_pedido()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  perform public.reversa_enfileirar_comunicacao(
    new.id, 'pedido_criado', new.id, new.solicitado_por, 'email', null,
    jsonb_build_object('transicao_em', new.created_at)
  );
  if new.aprovacao_status = 'aguardando_aprovacao' then
    perform public.reversa_enfileirar_aprovadores(
      new.id, md5('aprovacao:' || new.id::text || ':' || new.aprovacao_versao::text)::uuid, new.aprovacao_versao);
  end if;
  return new;
end;
$$;
revoke all on function public.reversa_comunicacao_apos_criar_pedido()
  from public, anon, authenticated, service_role;

-- Decisões e rodadas. Alteração relevante que devolve o pedido à análise cria nova
-- versão (e, portanto, nova ocorrência). Consulta, F5 e edição cosmética não mudam versão.
create or replace function public.reversa_comunicacao_apos_evento_aprovacao()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  v_r public.solicitacoes_reverso;
begin
  select r.* into v_r from public.solicitacoes_reverso r where r.id = new.solicitacao_id;
  if not found then return new; end if;

  if new.evento in ('alterada', 'invalidada') then
    if v_r.aprovacao_status = 'aguardando_aprovacao' and v_r.aprovacao_versao = new.versao then
      perform public.reversa_enfileirar_aprovadores(
        v_r.id, md5('aprovacao:' || v_r.id::text || ':' || new.versao::text)::uuid, new.versao);
    end if;
  elsif new.evento = 'aprovada' then
    perform public.reversa_enfileirar_comunicacao(
      v_r.id, 'pedido_aprovado', new.id, v_r.solicitado_por, 'email', null,
      jsonb_build_object('versao', new.versao, 'transicao_em', new.created_at)
    );
    perform public.reversa_enfileirar_operadores(v_r.id, new.id, new.versao);
  elsif new.evento = 'rejeitada' then
    perform public.reversa_enfileirar_comunicacao(
      v_r.id, 'pedido_rejeitado', new.id, v_r.solicitado_por, 'email', null,
      jsonb_build_object('versao', new.versao, 'justificativa', new.justificativa,
                         'transicao_em', new.created_at)
    );
  end if;
  return new;
end;
$$;
revoke all on function public.reversa_comunicacao_apos_evento_aprovacao()
  from public, anon, authenticated, service_role;

-- Postagem: somente a confirmação registrada na emissão (manual ou fonte rastreio).
-- A confirmação "legado" vem da conversão de dados antigos e nunca avisa ninguém.
drop trigger if exists reversa_comunicacao_apos_transicao_logistica on public.solicitacoes_reverso;
drop function if exists public.reversa_comunicacao_apos_transicao_logistica();

create or replace function public.reversa_comunicacao_apos_postagem()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  v_solicitante uuid;
begin
  if new.postagem_confirmada_em is null
     or new.postagem_fonte not in ('manual', 'rastreio')
     or (tg_op = 'UPDATE' and old.postagem_confirmada_em is not distinct from new.postagem_confirmada_em) then
    return new;
  end if;
  select r.solicitado_por into v_solicitante
    from public.solicitacoes_reverso r where r.id = new.solicitacao_id;
  perform public.reversa_enfileirar_comunicacao(
    new.solicitacao_id, 'postagem_confirmada',
    md5('postagem_confirmada:' || new.id::text || ':' || extract(epoch from new.postagem_confirmada_em)::text)::uuid,
    v_solicitante, 'email', new.id,
    jsonb_build_object('transicao_em', new.postagem_confirmada_em, 'postagem_em', new.postagem_em)
  );
  return new;
end;
$$;
revoke all on function public.reversa_comunicacao_apos_postagem()
  from public, anon, authenticated, service_role;
drop trigger if exists reversa_comunicacao_apos_postagem on public.reversa_emissoes;
create trigger reversa_comunicacao_apos_postagem
  after insert or update of postagem_confirmada_em on public.reversa_emissoes
  for each row execute function public.reversa_comunicacao_apos_postagem();

-- Recebimento físico: somente a confirmação manual registrada.
create or replace function public.reversa_comunicacao_apos_recebimento()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  v_solicitante uuid;
begin
  select r.solicitado_por into v_solicitante
    from public.solicitacoes_reverso r where r.id = new.solicitacao_id;
  perform public.reversa_enfileirar_comunicacao(
    new.solicitacao_id, 'recebimento_confirmado',
    md5('recebimento_confirmado:' || new.solicitacao_id::text || ':' || extract(epoch from new.confirmado_em)::text)::uuid,
    v_solicitante, 'email', null,
    jsonb_build_object('transicao_em', new.confirmado_em)
  );
  return new;
end;
$$;
revoke all on function public.reversa_comunicacao_apos_recebimento()
  from public, anon, authenticated, service_role;
drop trigger if exists reversa_comunicacao_apos_recebimento on public.reversa_recebimentos_confirmados;
create trigger reversa_comunicacao_apos_recebimento
  after insert on public.reversa_recebimentos_confirmados
  for each row execute function public.reversa_comunicacao_apos_recebimento();

-- A confirmação manual passa a registrar quem confirmou, na mesma transação da conclusão.
create or replace function public.confirmar_recebimento_mercadoria(p_solicitacao_id uuid)
returns public.solicitacoes_reverso
language plpgsql security definer
set search_path = ''
as $$
declare
  v_solicitacao public.solicitacoes_reverso%rowtype;
  v_flag_manual text := coalesce(current_setting('app.reversa_recebimento_manual', true), '');
  v_nome text := coalesce(public.usuario_nome(auth.uid()), 'Sistema');
begin
  select * into v_solicitacao
  from public.solicitacoes_reverso
  where id = p_solicitacao_id
  for update;

  if not found then
    raise exception 'Solicitação não encontrada.' using errcode = 'P0002';
  end if;

  if auth.uid() is not null
     and not public.is_admin()
     and not (v_solicitacao.empresa = any (public.empresas_recebimento_manual())) then
    raise exception 'Seu perfil não pode confirmar recebimento para esta empresa.' using errcode = '42501';
  end if;

  if v_solicitacao.status <> 'em_transito' then
    raise exception 'A confirmação manual só está disponível para pedidos em trânsito.' using errcode = '55000';
  end if;

  perform set_config('app.reversa_recebimento_manual', 'sim', true);

  update public.solicitacoes_reverso
  set status = 'concluido', concluido_em = now()
  where id = p_solicitacao_id
  returning * into v_solicitacao;

  perform set_config('app.reversa_recebimento_manual', v_flag_manual, true);

  insert into public.reversa_recebimentos_confirmados
    (solicitacao_id, confirmado_em, confirmado_por, confirmado_por_nome)
  values (p_solicitacao_id, v_solicitacao.concluido_em, auth.uid(), v_nome);

  insert into public.solicitacoes_historico (solicitacao_id, user_nome, acao)
  values (p_solicitacao_id, v_nome, 'Recebimento da mercadoria confirmado manualmente');

  return v_solicitacao;
end;
$$;
revoke all on function public.confirmar_recebimento_mercadoria(uuid) from public, anon;
grant execute on function public.confirmar_recebimento_mercadoria(uuid) to authenticated, service_role;

-- A autorização de leitura do destinatário é a mesma das políticas de acesso:
-- executa pode_ler_solicitacao como aquele usuário, restaurando o contexto depois.
create or replace function public.reversa_usuario_pode_ler_para_comunicacao(
  p_usuario_id uuid,
  p_solicitacao_id uuid
) returns boolean
language plpgsql security definer
set search_path = ''
as $$
declare
  v_claims text := coalesce(current_setting('request.jwt.claims', true), '');
  v_sub text := coalesce(current_setting('request.jwt.claim.sub', true), '');
  v_pode boolean;
begin
  if p_usuario_id is null then return false; end if;
  -- Versões antigas do PostgREST também expõem o sub em request.jwt.claim.sub e ele teria prioridade.
  perform set_config('request.jwt.claim.sub', p_usuario_id::text, true);
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', p_usuario_id::text, 'role', 'authenticated')::text, true);
  v_pode := public.pode_ler_solicitacao(p_solicitacao_id);
  perform set_config('request.jwt.claims', v_claims, true);
  perform set_config('request.jwt.claim.sub', v_sub, true);
  return coalesce(v_pode, false);
end;
$$;
revoke all on function public.reversa_usuario_pode_ler_para_comunicacao(uuid, uuid)
  from public, anon, authenticated, service_role;

-- Revalidação imediatamente antes de cada chamada externa.
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
    -- Atualização histórica ao autor: vale enquanto o fato registrado continuar
    -- verdadeiro e o autor ainda puder ler o pedido. O avanço do pedido não a cancela.
    if v_r.solicitado_por is distinct from v_c.destinatario_id
       or not public.reversa_usuario_pode_ler_para_comunicacao(v_c.destinatario_id, v_r.id) then
      v_status := 'acesso_revogado';
    elsif v_c.evento in ('pedido_aprovado', 'pedido_rejeitado') and not exists (
      select 1 from public.solicitacoes_aprovacoes a
       where a.id = v_c.ocorrencia_id and a.solicitacao_id = v_r.id
         and a.evento = case v_c.evento when 'pedido_aprovado' then 'aprovada' else 'rejeitada' end
    ) then
      v_status := 'evento_obsoleto';
    elsif v_c.evento = 'etiqueta_disponivel' and (
      v_e.id is null or v_e.substituida_em is not null or v_e.pdf_path is null
    ) then
      v_status := 'emissao_substituida';
    elsif v_c.evento = 'postagem_confirmada' and not coalesce(
      v_e.id is not null
      and v_e.postagem_fonte in ('manual', 'rastreio')
      and v_e.postagem_confirmada_em = (v_contexto ->> 'transicao_em')::timestamptz,
      false
    ) then
      v_status := 'evento_obsoleto';
    elsif v_c.evento = 'recebimento_confirmado' and not exists (
      select 1 from public.reversa_recebimentos_confirmados rc
       where rc.solicitacao_id = v_r.id
         and rc.confirmado_em = (v_contexto ->> 'transicao_em')::timestamptz
    ) then
      v_status := 'evento_obsoleto';
    end if;
  elsif v_c.evento = 'aprovacao_pendente' then
    -- Tarefa: só vale para quem ainda pode decidir esta versão.
    if not public.reversa_usuario_pode_ler_para_comunicacao(v_c.destinatario_id, v_r.id)
       or not public.reversa_aprovador_pode_decidir(v_c.destinatario_id, v_r.id) then
      v_status := 'aprovacao_indisponivel';
    elsif v_r.aprovacao_status <> 'aguardando_aprovacao'
       or v_r.aprovacao_versao <> (v_contexto ->> 'versao')::integer then
      v_status := 'evento_obsoleto';
    end if;
  elsif v_c.evento = 'emissao_pendente' then
    -- Tarefa: perde pertinência quando a emissão é concluída com PDF vinculado.
    if not public.reversa_usuario_pode_ler_para_comunicacao(v_c.destinatario_id, v_r.id)
       or not (coalesce(v_u.raw_app_meta_data -> 'telas', '[]'::jsonb) ? 'emitir-etiqueta')
       or not (coalesce(v_u.raw_app_meta_data -> 'empresas_acesso', '[]'::jsonb) ? v_r.empresa) then
      v_status := 'acesso_revogado';
    elsif not (v_r.aprovacao_status = 'aprovada' or v_r.aprovacao_legada)
       or v_r.status not in ('pendente', 'etiqueta_gerada')
       or exists (select 1 from public.reversa_emissoes e
         where e.solicitacao_id = v_r.id and e.substituida_em is null and e.pdf_path is not null) then
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
    'motivo', v_r.motivo,
    'data_solicitacao', v_r.data_solicitacao,
    'codigo_rastreio', v_e.codigo_rastreio,
    'valida_ate', v_e.valida_ate,
    'emitida_em', v_e.emitida_em,
    'justificativa', v_contexto ->> 'justificativa',
    'versao', nullif(v_contexto ->> 'versao', '')::integer,
    'transicao_em', v_contexto ->> 'transicao_em',
    'postagem_em', v_contexto ->> 'postagem_em'
  );
end;
$$;
revoke all on function public.reversa_iniciar_comunicacao_etiqueta(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.reversa_iniciar_comunicacao_etiqueta(uuid, uuid) to service_role;

commit;
