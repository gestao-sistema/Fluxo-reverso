-- Conclusão por entrega dos Correios ou confirmação explícita de recebimento.
-- Usuários não podem concluir pedidos por edição direta de status; a confirmação
-- manual exige pedido em trânsito e permissão de edição do Kanban ou check-in.

create or replace function public.empresas_recebimento_manual() returns text[]
language sql stable security definer
set search_path = ''
as $$
  select case
    when public.is_admin() then array['Alinare', 'Novitah']::text[]
    when public.current_telas() && array['kanban-edit', 'confirmar-checkin']::text[]
      then public.current_empresas_acesso()
    else '{}'::text[]
  end;
$$;

-- A confirmação manual tem capacidade própria, vinculada ao escopo de empresas
-- do Kanban editável ou do check-in. Nenhuma outra alteração pode usar essa flag.
create or replace function public.validar_etapa_por_setor() returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  v_decisao boolean := coalesce(current_setting('app.aprovacao_decisao', true), '') = 'sim';
  v_emissao boolean := coalesce(current_setting('emissoes.sincronizando', true), '') = 'sim';
  v_recebimento_manual boolean := coalesce(current_setting('app.reversa_recebimento_manual', true), '') = 'sim';
  v_decisao_cols text[] := array[
    'aprovacao_status', 'aprovacao_legada', 'aprovacao_versao', 'aprovacao_versao_por',
    'aprovacao_decidida_por', 'aprovacao_decidida_por_nome', 'aprovacao_decidida_em',
    'aprovacao_justificativa', 'solicitado_por', 'solicitado_por_nome', 'autorizacao', 'created_at'];
  v_espelho_cols text[] := array[
    'status', 'etiqueta_path', 'etiqueta_nome', 'etiqueta_enviada_em', 'codigo_rastreio',
    'ultima_cidade_rastreio', 'etiqueta_gerada_em', 'postado_em', 'em_transito_em', 'concluido_em'];
  v_fora_dos_dados text[] := v_decisao_cols || v_espelho_cols || array['anotacoes', 'id'];
  v_espelho_mudou boolean;
  v_dados_mudou boolean;
  v_anotacoes_mudou boolean;
begin
  if auth.uid() is null or public.is_admin() then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if not (new.empresa = any (public.empresas_formulario())) then
      raise exception 'Sem permissão para registrar reversa nesta empresa.' using errcode = '42501';
    end if;
    new.status := 'pendente';
    new.autorizacao := null;
    return new;
  end if;

  v_espelho_mudou := public.reversa_trecho(to_jsonb(new), v_espelho_cols)
    is distinct from public.reversa_trecho(to_jsonb(old), v_espelho_cols);
  v_dados_mudou := (to_jsonb(new) - v_fora_dos_dados) is distinct from (to_jsonb(old) - v_fora_dos_dados);
  v_anotacoes_mudou := new.anotacoes is distinct from old.anotacoes;

  if v_decisao then
    if not (old.empresa = any (public.empresas_aprovaveis()) and new.empresa = any (public.empresas_aprovaveis())) then
      raise exception 'Sem permissão para decidir aprovações desta empresa.' using errcode = '42501';
    end if;
    if v_espelho_mudou or v_dados_mudou or v_anotacoes_mudou then
      raise exception 'A decisão de aprovação não altera outros dados do pedido.' using errcode = '42501';
    end if;
    return new;
  end if;

  if v_recebimento_manual then
    if not (old.empresa = any (public.empresas_recebimento_manual()) and new.empresa = any (public.empresas_recebimento_manual())) then
      raise exception 'Sem permissão para confirmar recebimento nesta empresa.' using errcode = '42501';
    end if;
    if old.status <> 'em_transito' or new.status <> 'concluido' or new.concluido_em is null then
      raise exception 'A confirmação manual só conclui pedidos em trânsito.' using errcode = '55000';
    end if;
    if v_dados_mudou or v_anotacoes_mudou
       or public.reversa_trecho(to_jsonb(new), v_decisao_cols) is distinct from public.reversa_trecho(to_jsonb(old), v_decisao_cols)
       or public.reversa_trecho(to_jsonb(new), array[
         'etiqueta_path', 'etiqueta_nome', 'etiqueta_enviada_em', 'codigo_rastreio',
         'ultima_cidade_rastreio', 'etiqueta_gerada_em', 'postado_em', 'em_transito_em'
       ]) is distinct from public.reversa_trecho(to_jsonb(old), array[
         'etiqueta_path', 'etiqueta_nome', 'etiqueta_enviada_em', 'codigo_rastreio',
         'ultima_cidade_rastreio', 'etiqueta_gerada_em', 'postado_em', 'em_transito_em'
       ]) then
      raise exception 'A confirmação de recebimento só altera a etapa e a data de conclusão.' using errcode = '42501';
    end if;
    return new;
  end if;

  if v_emissao then
    if not (old.empresa = any (public.empresas_logisticas()) and new.empresa = any (public.empresas_logisticas())) then
      raise exception 'Sem permissão para esta operação de emissão.' using errcode = '42501';
    end if;
    if v_dados_mudou or v_anotacoes_mudou then
      raise exception 'A operação de emissão não altera os dados do pedido.' using errcode = '42501';
    end if;
    if (new.status in ('postado', 'em_transito', 'concluido') and new.status is distinct from old.status)
       or new.postado_em is distinct from old.postado_em
       or new.em_transito_em is distinct from old.em_transito_em
       or new.concluido_em is distinct from old.concluido_em then
      if not (new.empresa = any (public.empresas_checkin())) then
        raise exception 'Só quem confirma a postagem registra postagem, trânsito ou entrega.' using errcode = '42501';
      end if;
    end if;
    if (new.status = 'etiqueta_gerada' and new.status is distinct from old.status)
       or new.etiqueta_path is distinct from old.etiqueta_path
       or new.etiqueta_nome is distinct from old.etiqueta_nome
       or new.etiqueta_enviada_em is distinct from old.etiqueta_enviada_em
       or new.etiqueta_gerada_em is distinct from old.etiqueta_gerada_em
       or new.codigo_rastreio is distinct from old.codigo_rastreio then
      if not (new.empresa = any (public.empresas_etiquetaveis())) then
        raise exception 'Só quem emite a etiqueta registra etiqueta e rastreio.' using errcode = '42501';
      end if;
    end if;
    return new;
  end if;

  if v_espelho_mudou then
    raise exception 'Etiqueta, rastreio e etapa são alterados pelas operações de emissão e postagem.'
      using errcode = '42501';
  end if;
  if v_dados_mudou and not (old.empresa = any (public.empresas_formulario())
                            and new.empresa = any (public.empresas_formulario())) then
    raise exception 'Sem permissão para alterar os dados desta reversa.' using errcode = '42501';
  end if;
  if v_anotacoes_mudou and not (new.empresa = any (public.empresas_operaveis())) then
    raise exception 'Sem permissão para anotar nesta reversa.' using errcode = '42501';
  end if;
  return new;
end;
$$;

create or replace function public.reversa_conclusao_proteger() returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  v_confirmacao_manual boolean := coalesce(current_setting('app.reversa_recebimento_manual', true), '') = 'sim';
begin
  if new.status is distinct from old.status and new.status = 'concluido' then
    if v_confirmacao_manual then
      if old.status <> 'em_transito' then
        raise exception 'A confirmação manual só conclui pedidos em trânsito.' using errcode = '55000';
      end if;
      return new;
    end if;

    -- A Edge Function dos Correios usa service_role. Ela é o único caminho
    -- automático autorizado a registrar conclusão por evento BDE.
    if coalesce(auth.role(), '') = 'service_role' then
      return new;
    end if;

    raise exception 'Concluído só pelo rastreamento dos Correios ou pela confirmação de recebimento.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_reversa_conclusao_proteger on public.solicitacoes_reverso;
create trigger trg_reversa_conclusao_proteger
  before update of status on public.solicitacoes_reverso
  for each row execute function public.reversa_conclusao_proteger();

create or replace function public.confirmar_recebimento_mercadoria(p_solicitacao_id uuid)
returns public.solicitacoes_reverso
language plpgsql security definer
set search_path = ''
as $$
declare
  v_solicitacao public.solicitacoes_reverso%rowtype;
  v_flag_manual text := coalesce(current_setting('app.reversa_recebimento_manual', true), '');
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

  insert into public.solicitacoes_historico (solicitacao_id, user_nome, acao)
  values (
    p_solicitacao_id,
    coalesce(public.usuario_nome(auth.uid()), 'Sistema'),
    'Recebimento da mercadoria confirmado manualmente'
  );

  return v_solicitacao;
end;
$$;

revoke execute on function public.reversa_conclusao_proteger() from public, anon, authenticated, service_role;
revoke execute on function public.empresas_recebimento_manual() from public, anon;
grant execute on function public.empresas_recebimento_manual() to authenticated, service_role;
revoke all on function public.confirmar_recebimento_mercadoria(uuid) from public, anon;
grant execute on function public.confirmar_recebimento_mercadoria(uuid) to authenticated, service_role;

comment on function public.confirmar_recebimento_mercadoria(uuid) is
  'Conclui um pedido em trânsito após confirmação manual de recebimento e registra a ação no histórico.';
