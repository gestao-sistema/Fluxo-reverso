-- Confirmação física do recebimento depois que os Correios já informaram a entrega.
--
-- Três fatos distintos:
--   1. entrega informada pela transportadora (rastreio, service_role) -> status 'concluido'
--   2. recebimento físico confirmado pela empresa -> linha em reversa_recebimentos_confirmados
--   3. encerramento do pedido -> status 'concluido' (regra de encerramento INALTERADA)
-- Até aqui a confirmação manual só existia em 'em_transito'; se os Correios entregavam
-- primeiro, o pedido ia a 'concluido' e a empresa não conseguia mais registrar o fato físico.
--
-- Esta migration permite registrar a confirmação física de um pedido já 'concluido' pela
-- entrega dos Correios, quando ainda não existe confirmação física. Não reabre o ticket,
-- não altera status nem concluido_em, não gera emissão e exige operador autenticado
-- com permissão na empresa. Nada é gravado retroativamente.
begin;

-- Origem da conclusão, sem coluna nova: só há dois caminhos que concluem um pedido —
-- a confirmação manual (que deixa linha em reversa_recebimentos_confirmados ou, nos
-- registros anteriores, a entrada "Recebimento da mercadoria confirmado manualmente" no
-- histórico) e o rastreio dos Correios (service_role, que deixa "Sistema (Correios)" /
-- "Rastreio: ..." no histórico). O histórico não é forjável por usuário: o gatilho
-- solicitacoes_historico_autor sobrescreve user_nome com o nome do usuário autenticado.
-- Pedido concluído sem esse rastro (dado convertido, por exemplo) NÃO é elegível.
create or replace function public.reversa_conclusao_por_correios(p_solicitacao_id uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
           select 1 from public.solicitacoes_historico h
            where h.solicitacao_id = p_solicitacao_id
              and h.user_nome = 'Sistema (Correios)'
              and h.acao like 'Rastreio:%'
         )
     and not exists (
           select 1 from public.solicitacoes_historico h
            where h.solicitacao_id = p_solicitacao_id
              and h.acao = 'Recebimento da mercadoria confirmado manualmente'
         )
     and not exists (
           select 1 from public.reversa_recebimentos_confirmados rc
            where rc.solicitacao_id = p_solicitacao_id
         );
$$;
revoke all on function public.reversa_conclusao_por_correios(uuid)
  from public, anon, authenticated, service_role;

-- Pedidos que o chamador pode confirmar fisicamente depois da entrega dos Correios.
-- O escopo de empresa é o da própria confirmação (empresas_recebimento_manual).
create or replace function public.listar_recebimentos_fisicos_pendentes()
returns table (solicitacao_id uuid, concluido_em timestamptz)
language sql stable security definer
set search_path = ''
as $$
  select r.id, r.concluido_em
    from public.solicitacoes_reverso r
   where auth.uid() is not null
     and r.status = 'concluido'
     and r.empresa = any (public.empresas_recebimento_manual())
     and public.reversa_conclusao_por_correios(r.id)
   order by r.concluido_em desc nulls last, r.id
   limit 500;
$$;
revoke all on function public.listar_recebimentos_fisicos_pendentes() from public, anon;
grant execute on function public.listar_recebimentos_fisicos_pendentes() to authenticated;
comment on function public.listar_recebimentos_fisicos_pendentes() is
  'Pedidos concluídos pela entrega dos Correios sem confirmação física da empresa, nas empresas em que o chamador pode confirmar.';

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
  -- A linha travada serializa confirmações simultâneas do mesmo pedido.
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

  if exists (select 1 from public.reversa_recebimentos_confirmados rc where rc.solicitacao_id = p_solicitacao_id) then
    raise exception 'O recebimento físico deste pedido já foi confirmado.' using errcode = '55000';
  end if;

  if v_solicitacao.status = 'em_transito' then
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
  end if;

  if v_solicitacao.status = 'concluido' then
    -- Só um operador identificado registra o fato físico; nenhuma data ou autor é inventado.
    if auth.uid() is null then
      raise exception 'A confirmação do recebimento físico exige um operador autenticado.' using errcode = '42501';
    end if;
    if not public.reversa_conclusao_por_correios(p_solicitacao_id) then
      raise exception 'Este pedido concluído não tem registro de entrega informada pelos Correios; a confirmação física não está disponível.'
        using errcode = '55000';
    end if;

    -- Somente o registro da confirmação: o pedido não é atualizado (status, concluido_em e
    -- demais campos ficam como os Correios deixaram) e nenhuma emissão é criada.
    insert into public.reversa_recebimentos_confirmados
      (solicitacao_id, confirmado_em, confirmado_por, confirmado_por_nome)
    values (p_solicitacao_id, now(), auth.uid(), v_nome);

    insert into public.solicitacoes_historico (solicitacao_id, user_nome, acao)
    values (p_solicitacao_id, v_nome, 'Recebimento físico confirmado pela empresa após a entrega informada pelos Correios');

    return v_solicitacao;
  end if;

  raise exception 'A confirmação manual só está disponível para pedidos em trânsito ou concluídos pela entrega dos Correios.'
    using errcode = '55000';
end;
$$;
revoke all on function public.confirmar_recebimento_mercadoria(uuid) from public, anon;
grant execute on function public.confirmar_recebimento_mercadoria(uuid) to authenticated, service_role;

commit;
