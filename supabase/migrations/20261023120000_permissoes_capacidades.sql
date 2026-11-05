-- ============================================================
-- Permissões por capacidade (segurança do banco e do storage)
-- ------------------------------------------------------------
-- Capacidades, todas por empresa (empresas_acesso) e pela tela correspondente:
--   consultar         dashboard-*, lista-*, status-*, kanban (somente leitura)
--   solicitar         formulario-<empresa> ou nc-edit: registra reversa e edita dados do pedido
--   aprovar           aprovar-reversa + empresas_acesso: decide (aprovar/rejeitar)
--   emitir            emitir-etiqueta + empresas_acesso: emissão, PDF, dados e envio da etiqueta
--   confirmar postagem confirmar-checkin + empresas_acesso
-- Consulta não concede nenhuma das demais. As telas lista-*, kanban e status-* deixam
-- de ser operação (antes valiam como operador legado em validar_etapa_por_setor).
--
-- Regras por tipo de alteração (validar_etapa_por_setor, BEFORE UPDATE):
--   decisão de aprovação  só pela RPC (flag app.aprovacao_decisao) e só quem aprova a empresa
--   espelho de emissão     etiqueta, rastreio e etapa: só pela RPC de emissão (flag
--                          emissoes.sincronizando) e só quem emite ou confirma postagem
--   dados do pedido        quem solicita a empresa, e a expedição ainda não começou (zz_*)
--   anotações              quem opera a empresa (solicitar, emitir ou confirmar postagem)
-- Flag interna nunca basta sozinha: a RPC liga a flag, e o trigger ainda confere a capacidade.
--
-- Exceções:
--   admin (perfil_acesso mestre, tela usuarios, ou perfil legado ADMIN) e serviço (auth.uid() nulo,
--   ex.: Edge Function com service_role) passam por estas regras, como antes.
--
-- Requer: 20261023110000_emissoes_reversa.sql.
-- Idempotente: pode ser executada mais de uma vez.
-- ============================================================

-- 1. Empresas por capacidade ---------------------------------------------

-- Perfil legado de operação: não concede mais operação. Admin continua com tudo.
create or replace function public.empresas_legacy_operaveis() returns text[]
language sql stable security definer
set search_path = ''
as $$
  select case when public.is_admin() then array['Alinare', 'Novitah']::text[] else '{}'::text[] end;
$$;

-- Operações (decidir, emitir, confirmar postagem) são capacidades das telas e das empresas
-- de empresas_acesso. Admin administra (usuários, correções, exclusão) e não decide nem
-- emite no lugar de quem opera: a exceção administrativa fica explícita aqui.
create or replace function public.empresas_aprovaveis() returns text[]
language sql stable security definer
set search_path = ''
as $$
  select case when 'aprovar-reversa' = any (public.current_telas())
    then public.current_empresas_acesso() else '{}'::text[] end;
$$;

create or replace function public.empresas_etiquetaveis() returns text[]
language sql stable security definer
set search_path = ''
as $$
  select case when 'emitir-etiqueta' = any (public.current_telas())
    then public.current_empresas_acesso() else '{}'::text[] end;
$$;

create or replace function public.empresas_checkin() returns text[]
language sql stable security definer
set search_path = ''
as $$
  select case when 'confirmar-checkin' = any (public.current_telas())
    then public.current_empresas_acesso() else '{}'::text[] end;
$$;

-- Empresas em que a pessoa atua de alguma forma (anotações, escrita de histórico e
-- correções de dados). Admin tem todas, como administração.
create or replace function public.empresas_operaveis() returns text[]
language sql stable security definer
set search_path = ''
as $$
  select case when public.is_admin() then array['Alinare', 'Novitah']::text[]
    else array(
      select distinct e
      from unnest(
        public.empresas_formulario()
        || public.empresas_aprovaveis()
        || public.empresas_etiquetaveis()
        || public.empresas_checkin()
      ) as escopo(e)
      where e in ('Alinare', 'Novitah')
    )
  end;
$$;

-- Empresas em que a pessoa emite etiqueta ou confirma postagem (expedição).
create or replace function public.empresas_logisticas() returns text[]
language sql stable security definer
set search_path = ''
as $$
  select array(
    select distinct e
    from unnest(public.empresas_etiquetaveis() || public.empresas_checkin()) as escopo(e)
    where e in ('Alinare', 'Novitah')
  );
$$;

-- Operações de emissão usam as capacidades certas (ver 20261023110000).
-- Recriada aqui para não depender da ordem: emitir para anexar/registrar/dados/envio;
-- confirmar postagem para postagem.
create or replace function public.empresas_operacao_emissao(p_operacao text) returns text[]
language sql stable security definer
set search_path = ''
as $$
  select case
    when p_operacao = 'postagem' then public.empresas_checkin()
    when p_operacao in ('registrar', 'anexar_pdf', 'dados', 'envio') then public.empresas_etiquetaveis()
    else '{}'::text[]
  end;
$$;

-- Contrato da expedição (usado pela emissão e por backends): só etiqueta e postagem.
create or replace function public.verificar_operacao_logistica(p_solicitacao_id uuid)
returns table (permitido boolean, motivo text, situacao text, aprovacao_versao integer)
language plpgsql stable security definer
set search_path = ''
as $$
declare
  v_usuario boolean := auth.uid() is not null;
  v_r record;
  v_situacao text;
begin
  select r.empresa, r.aprovacao_status, r.aprovacao_legada, r.aprovacao_versao
    into v_r
  from public.solicitacoes_reverso r
  where r.id = p_solicitacao_id;

  if not found or (v_usuario and not (v_r.empresa = any (public.empresas_permitidas()))) then
    return query select false, 'nao_encontrada'::text, null::text, null::integer;
    return;
  end if;

  v_situacao := case when v_r.aprovacao_legada then 'legado' else v_r.aprovacao_status end;

  if v_usuario and not (v_r.empresa = any (public.empresas_logisticas())) then
    return query select false, 'sem_permissao'::text, v_situacao, v_r.aprovacao_versao;
  elsif not public.aprovacao_libera_logistica(v_r.aprovacao_status, v_r.aprovacao_legada) then
    return query select false, v_situacao, v_situacao, v_r.aprovacao_versao;
  else
    return query select true, null::text, v_situacao, v_r.aprovacao_versao;
  end if;
end;
$$;

create or replace function public.exigir_operacao_logistica(p_solicitacao_id uuid, p_versao_aprovada integer default null)
returns integer
language plpgsql security definer
set search_path = ''
as $$
declare
  v_usuario boolean := auth.uid() is not null;
  v_r record;
begin
  select r.empresa, r.aprovacao_status, r.aprovacao_legada, r.aprovacao_versao
    into v_r
  from public.solicitacoes_reverso r
  where r.id = p_solicitacao_id
  for no key update;

  if not found or (v_usuario and not (v_r.empresa = any (public.empresas_permitidas()))) then
    raise exception 'Solicitação não encontrada.' using errcode = 'P0002';
  end if;
  if v_usuario and not (v_r.empresa = any (public.empresas_logisticas())) then
    raise exception 'Sem permissão para operar a expedição da %.', v_r.empresa using errcode = '42501';
  end if;
  if not public.aprovacao_libera_logistica(v_r.aprovacao_status, v_r.aprovacao_legada) then
    raise exception 'Solicitação não aprovada (situação: %): a expedição não pode avançar.',
      replace(coalesce(v_r.aprovacao_status, 'legado'), '_', ' ')
      using errcode = '55000';
  end if;
  if p_versao_aprovada is not null and p_versao_aprovada <> v_r.aprovacao_versao then
    raise exception 'A aprovação mudou (versão % → %). Confira a solicitação antes de continuar.',
      p_versao_aprovada, v_r.aprovacao_versao
      using errcode = '55000';
  end if;
  return v_r.aprovacao_versao;
end;
$$;

-- 2. Validação por tipo de alteração --------------------------------------

-- Subconjunto de um registro (jsonb) pelas chaves dadas; usado para comparar colunas.
create or replace function public.reversa_trecho(p jsonb, chaves text[]) returns jsonb
language sql immutable
set search_path = ''
as $$
  select coalesce(jsonb_object_agg(e.key, e.value), '{}'::jsonb)
  from jsonb_each(p) as e
  where e.key = any (chaves);
$$;

create or replace function public.validar_etapa_por_setor() returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  v_decisao boolean := coalesce(current_setting('app.aprovacao_decisao', true), '') = 'sim';
  v_emissao boolean := coalesce(current_setting('emissoes.sincronizando', true), '') = 'sim';
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
  -- Serviço e setor mestre: as regras de cada função e a expedição (zz_*) continuam valendo.
  if auth.uid() is null or public.is_admin() then
    return new;
  end if;

  if tg_op = 'INSERT' then
    -- Toda reversa nova entra na aprovação. Registrar exige solicitar a empresa.
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

  -- Decisão: só a RPC de aprovação, e só para quem aprova a empresa. Não muda o resto.
  if v_decisao then
    if not (old.empresa = any (public.empresas_aprovaveis()) and new.empresa = any (public.empresas_aprovaveis())) then
      raise exception 'Sem permissão para decidir aprovações desta empresa.' using errcode = '42501';
    end if;
    if v_espelho_mudou or v_dados_mudou or v_anotacoes_mudou then
      raise exception 'A decisão de aprovação não altera outros dados do pedido.' using errcode = '42501';
    end if;
    return new;
  end if;

  -- Emissão e postagem: só a RPC de emissão, e só para quem emite ou confirma postagem.
  if v_emissao then
    if not (old.empresa = any (public.empresas_logisticas()) and new.empresa = any (public.empresas_logisticas())) then
      raise exception 'Sem permissão para esta operação de emissão.' using errcode = '42501';
    end if;
    if v_dados_mudou or v_anotacoes_mudou then
      raise exception 'A operação de emissão não altera os dados do pedido.' using errcode = '42501';
    end if;
    -- Cada campo exige a capacidade da sua etapa: postagem (confirmar-checkin) ou etiqueta
    -- e rastreio (emitir-etiqueta). Quem só tem uma delas não registra a outra.
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

  -- Alteração direta (sem RPC). Etiqueta, rastreio e etapa nunca mudam assim.
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

-- 3. Histórico, decisões e exclusão ---------------------------------------

-- Histórico e decisões não mudam. Apagar só em cascata de uma exclusão de reversa
-- autorizada (reversa_proteger_exclusao), que marca a reversa na transação.
create or replace function public.historico_imutavel() returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    raise exception 'O histórico não pode ser alterado.' using errcode = '42501';
  end if;
  if coalesce(current_setting('app.exclusao_reversa', true), '') = old.solicitacao_id::text then
    return old;
  end if;
  raise exception 'O histórico não pode ser apagado.' using errcode = '42501';
end;
$$;

drop trigger if exists trg_historico_imutavel on public.solicitacoes_historico;
create trigger trg_historico_imutavel before update or delete on public.solicitacoes_historico
  for each row execute function public.historico_imutavel();

drop trigger if exists trg_aprovacoes_imutavel on public.solicitacoes_aprovacoes;
create trigger trg_aprovacoes_imutavel before update or delete on public.solicitacoes_aprovacoes
  for each row execute function public.historico_imutavel();

-- Chaves estrangeiras: histórico e decisões acompanham a reversa (em cascata, na exclusão autorizada).
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'solicitacoes_historico_solicitacao_fk') then
    alter table public.solicitacoes_historico add constraint solicitacoes_historico_solicitacao_fk
      foreign key (solicitacao_id) references public.solicitacoes_reverso (id) on delete cascade not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'solicitacoes_aprovacoes_solicitacao_fk') then
    alter table public.solicitacoes_aprovacoes add constraint solicitacoes_aprovacoes_solicitacao_fk
      foreign key (solicitacao_id) references public.solicitacoes_reverso (id) on delete cascade not valid;
  end if;
end;
$$;

-- Exclusão de reversa: só admin; não com decisão de aprovação, emissão ou etiqueta
-- (PDF preservado). Sem isso, a exclusão em cascata apagaria o histórico.
create or replace function public.reversa_proteger_exclusao() returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  if auth.uid() is not null and not public.is_admin() then
    raise exception 'Só o administrador apaga uma reversa.' using errcode = '42501';
  end if;
  if old.aprovacao_status in ('aprovada', 'rejeitada') then
    raise exception 'Reversa com decisão de aprovação não pode ser apagada.' using errcode = '55000';
  end if;
  if old.etiqueta_path is not null
     or exists (select 1 from public.reversa_emissoes e where e.solicitacao_id = old.id) then
    raise exception 'Reversa com etiqueta ou emissões não pode ser apagada: os PDFs ficam preservados.' using errcode = '55000';
  end if;
  perform set_config('app.exclusao_reversa', old.id::text, true);
  return old;
end;
$$;

drop trigger if exists trg_reversa_proteger_exclusao on public.solicitacoes_reverso;
create trigger trg_reversa_proteger_exclusao before delete on public.solicitacoes_reverso
  for each row execute function public.reversa_proteger_exclusao();

-- 4. Policies efetivas -----------------------------------------------------
-- Policies permissivas se somam: as antigas são removidas antes das novas.

-- Reversas: leitura pelo escopo de consulta; inserção por solicitar; alteração por
-- qualquer capacidade da empresa (a coluna é checada no trigger); exclusão só admin.
drop policy if exists "update_solicitacoes_admins" on public.solicitacoes_reverso;
create policy "update_solicitacoes_admins" on public.solicitacoes_reverso
  for update to authenticated
  using (empresa = any (public.empresas_operaveis()))
  with check (empresa = any (public.empresas_operaveis()));

-- Histórico: leitura pelo escopo de consulta; gravação só por quem opera a empresa.
drop policy if exists "select_historico" on public.solicitacoes_historico;
drop policy if exists "insert_historico" on public.solicitacoes_historico;
create policy "select_historico" on public.solicitacoes_historico
  for select to authenticated
  using (exists (
    select 1 from public.solicitacoes_reverso r
    where r.id = solicitacoes_historico.solicitacao_id
      and r.empresa = any (public.empresas_permitidas())
  ));
create policy "insert_historico" on public.solicitacoes_historico
  for insert to authenticated
  with check (exists (
    select 1 from public.solicitacoes_reverso r
    where r.id = solicitacoes_historico.solicitacao_id
      and r.empresa = any (public.empresas_operaveis())
  ));

-- Rastreio, emissões e decisões: só leitura para usuário; escrita só por funções/serviço.
drop policy if exists "insert_rastreamento" on public.rastreamento_correios;
drop policy if exists "update_rastreamento" on public.rastreamento_correios;
drop policy if exists "delete_rastreamento" on public.rastreamento_correios;

-- Storage (etiquetas): PDF é criado uma vez e não é sobrescrito. Não há mais update.
drop policy if exists "etiquetas_update" on storage.objects;
drop policy if exists "etiquetas_insert" on storage.objects;
create policy "etiquetas_insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'etiquetas' and public.pode_anexar_pdf_etiqueta(name));

-- Caminhos antigos de PDF: as funções ficam inertes (nenhuma policy as usa). Não são
-- removidas porque a reexecução da cadeia (as migrations são idempotentes) as recria antes
-- de esta migration rodar de novo.
create or replace function public.pode_operar_etiqueta(p_objeto text) returns boolean
language sql immutable
set search_path = ''
as $$ select false $$;

create or replace function public.pode_anexar_etiqueta(p_objeto text) returns boolean
language sql immutable
set search_path = ''
as $$ select false $$;

-- 5. Privilégios -----------------------------------------------------------

-- anon não tem acesso a dados nem a funções.
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke execute on all functions in schema public from anon, public;
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on sequences from anon;
alter default privileges in schema public revoke execute on functions from anon, public;

-- authenticated: sem TRUNCATE (ignora RLS), REFERENCES e TRIGGER.
revoke truncate, references, trigger on all tables in schema public from authenticated;

-- Histórico, decisões, rastreio e emissões: sem alteração nem exclusão direta.
revoke update, delete on public.solicitacoes_historico from authenticated;
revoke update, delete on public.solicitacoes_aprovacoes from authenticated;
revoke insert, update, delete on public.solicitacoes_aprovacoes from authenticated;
revoke insert, update, delete on public.rastreamento_correios from authenticated;
revoke insert, update, delete on public.reversa_emissoes from authenticated;
revoke insert, update, delete on public.reversa_emissao_eventos from authenticated;
revoke all on public.vw_reversa_emissoes from anon, authenticated;
grant select on public.vw_reversa_emissoes to authenticated;

-- Funções: authenticated mantém as que as policies e o frontend chamam.
grant execute on all functions in schema public to authenticated;

-- Gatilhos e funções internas: nunca chamadas por usuário (o gatilho roda com o dono).
-- Revogado por nome, para cobrir todas as assinaturas que existirem.
do $$
declare
  r record;
begin
  for r in
    select p.oid::regprocedure as assinatura
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = any (array[
        'validar_etapa_por_setor', 'reversa_aprovacao_ao_criar', 'reversa_aprovacao_ao_alterar',
        'reversa_aprovacao_registrar_alteracao', 'reversa_proteger_exclusao', 'historico_imutavel',
        'reversa_legado_para_emissoes', 'reversa_legado_proteger_espelho', 'reversa_emissoes_proteger',
        'reversa_emissao_eventos_imutavel', 'solicitacoes_historico_autor', 'reversa_vincular_nc',
        'aprovacao_config_registrar', 'emissoes_absorver_legado', 'emissoes_sincronizar_legado',
        'emissao_avancar_etapa', 'emissao_registrar_evento', 'emissao_validar_pdf',
        'rastreio_indica_postagem', 'registrar_decisao_reversa', 'exigir_operacao_emissao'
      ]::text[])
  loop
    execute format('revoke execute on function %s from authenticated', r.assinatura);
  end loop;
end;
$$;

-- Serviço (Edge Function, cron): recebe o que precisa.
do $$
declare r record;
begin
  for r in select p.oid::regprocedure as assinatura from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'exigir_operacao_logistica' loop
    execute format('grant execute on function %s to service_role', r.assinatura);
  end loop;
end;
$$;
grant execute on function public.verificar_operacao_logistica(uuid) to authenticated, service_role;
