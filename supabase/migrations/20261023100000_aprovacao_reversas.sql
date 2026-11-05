-- ============================================================
-- Aprovação de reversas
-- ------------------------------------------------------------
-- A autorização deixa de ser um nome escolhido no formulário e passa a ser a
-- decisão de um usuário autenticado com a tela 'aprovar-<empresa>'. Uma
-- aprovação basta. A aprovação é uma dimensão própria (aprovacao_status),
-- separada do andamento logístico (status):
--   aguardando_aprovacao → aprovada | rejeitada
-- Reversas anteriores a esta migration ficam como legado (aprovacao_legada):
-- sem decisão inventada; o nome declarado no formulário antigo (autorizacao)
-- continua só para consulta.
--
-- Regras (todas garantidas no banco, não só na tela):
-- - Toda reversa nova nasce aguardando aprovação, sem etapa logística e sem
--   autorização declarada, mesmo que o cliente envie outros valores.
-- - Decidir só pelas funções aprovar_reversa / rejeitar_reversa: confere a
--   empresa, trava a linha (decisões simultâneas: vale a primeira) e grava a
--   decisão e o histórico na mesma transação. Rejeitar exige justificativa.
-- - Aprovar o que a própria pessoa registrou ou alterou: bloqueado enquanto
--   aprovacao_config.permitir_autoaprovacao = false (padrão; decisão provisória).
-- - Mudar um dado do pedido (empresa, NC, data, solicitante, setor, cliente,
--   endereço, motivo, justificativa) desfaz a decisão: volta a aguardar
--   aprovação numa versão nova. Etapa, rastreio, etiqueta e anotações não.
--   Depois que a expedição começou, os dados do pedido não mudam mais.
-- - A expedição (etapa, rastreio, etiqueta) só avança em reversa aprovada ou
--   legado. Contrato para outras frentes: verificar_operacao_logistica() e
--   exigir_operacao_logistica().
-- - Nomes gravados na aprovação vêm de app_metadata (só o admin altera), não
--   de user_metadata (o próprio usuário altera).
--
-- Requer: 20261022100000 (último estado do banco remoto no repositório).
-- Substitui a versão de 20261020135000 da branch integracao/aprovacao-emissoes: a
-- situação de aprovação usa empresas_acesso + tela aprovar-reversa (modelo do HEAD).
-- Idempotente: pode ser executada mais de uma vez (em ordem, depois das anteriores).
-- ============================================================

-- 1. Permissões: empresas_permitidas() e empresas_aprovaveis() vêm de 20261021130000
-- (aprovação por empresas_acesso + tela aprovar-reversa). Nada é redefinido aqui.

-- Nome de exibição nos registros de aprovação: o de app_metadata (o admin grava
-- pela tela Usuários); sem nome, o e-mail de login.
create or replace function public.usuario_nome(p_usuario uuid) returns text
language sql stable security definer
set search_path = ''
as $$
  select coalesce(nullif(u.raw_app_meta_data ->> 'nome', ''), u.email)
  from auth.users u
  where u.id = p_usuario;
$$;

-- Copia o nome atual de user_metadata para app_metadata (só de quem ainda não tem).
-- Revise a auditoria de telas da migration de permissões: nomes podem ter sido
-- alterados pelo próprio usuário antes desta cópia.
update auth.users
set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb)
  || jsonb_build_object('nome', raw_user_meta_data ->> 'nome')
where not (coalesce(raw_app_meta_data, '{}'::jsonb) ? 'nome')
  and coalesce(raw_user_meta_data ->> 'nome', '') <> '';

-- 2. Colunas da aprovação na reversa
alter table public.solicitacoes_reverso
  add column if not exists solicitado_por uuid,
  add column if not exists solicitado_por_nome text,
  add column if not exists aprovacao_status text,
  add column if not exists aprovacao_legada boolean not null default false,
  add column if not exists aprovacao_versao integer not null default 1,
  add column if not exists aprovacao_versao_por uuid,
  add column if not exists aprovacao_decidida_por uuid,
  add column if not exists aprovacao_decidida_por_nome text,
  add column if not exists aprovacao_decidida_em timestamptz,
  add column if not exists aprovacao_justificativa text;

-- Pedidos do modelo anterior: a situação de aprovação saía de status. Agora ela vai
-- para aprovacao_status, antes da marcação de legado abaixo; sem isso, pedidos que
-- aguardavam aprovação virariam legado e seriam liberados sem decisão.
-- "reprovado" vira rejeitada sem responsável (o modelo antigo não gravava quem
-- decidiu de forma verificável). "pendente" (já aprovado no modelo antigo) fica como
-- legado, com o nome do autorizador preservado em autorizacao.
do $$
begin
  perform set_config('app.aprovacao_decisao', 'sim', true);
  update public.solicitacoes_reverso
  set aprovacao_status = case when status = 'aguardando_aprovacao' then 'aguardando_aprovacao' else 'rejeitada' end,
      status = 'pendente'
  where status in ('aguardando_aprovacao', 'reprovado');
  perform set_config('app.aprovacao_decisao', '', true);
end;
$$;

-- Reversas anteriores: legado, sem decisão registrada. Depois da primeira
-- execução toda linha tem aprovacao_status ou já é legado; a marca de decisão
-- garante que a cópia vale mesmo com o trigger de proteção já criado.
do $$
begin
  perform set_config('app.aprovacao_decisao', 'sim', true);
  update public.solicitacoes_reverso
  set aprovacao_legada = true
  where aprovacao_status is null and not aprovacao_legada;
  perform set_config('app.aprovacao_decisao', '', true);
end;
$$;

alter table public.solicitacoes_reverso alter column aprovacao_status set default 'aguardando_aprovacao';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'solicitacoes_reverso_aprovacao_status_check') then
    alter table public.solicitacoes_reverso
      add constraint solicitacoes_reverso_aprovacao_status_check
      check (aprovacao_status is null or aprovacao_status in ('aguardando_aprovacao', 'aprovada', 'rejeitada'));
  end if;
  -- Só o legado fica sem situação de aprovação
  if not exists (select 1 from pg_constraint where conname = 'solicitacoes_reverso_aprovacao_legada_check') then
    alter table public.solicitacoes_reverso
      add constraint solicitacoes_reverso_aprovacao_legada_check
      check ((aprovacao_status is null) = aprovacao_legada);
  end if;
end;
$$;

-- Situação logística: os valores de aprovação saíram daqui (agora vivem em aprovacao_status).
alter table public.solicitacoes_reverso drop constraint if exists solicitacoes_reverso_status_check;
alter table public.solicitacoes_reverso add constraint solicitacoes_reverso_status_check
  check (status in ('pendente', 'etiqueta_gerada', 'postado', 'em_transito', 'concluido'));
alter table public.solicitacoes_reverso alter column status set default 'pendente';

-- A autorização declarada à mão deixa de ser exigida (fica só no legado)
alter table public.solicitacoes_reverso alter column autorizacao drop not null;

comment on column public.solicitacoes_reverso.autorizacao is 'Legado: nome declarado como autorizador no formulário antigo (texto livre, não verificado). Reversas novas não preenchem; a decisão real fica em aprovacao_* e solicitacoes_aprovacoes.';
comment on column public.solicitacoes_reverso.aprovacao_status is 'aguardando_aprovacao | aprovada | rejeitada. Nulo só no legado (aprovacao_legada).';
comment on column public.solicitacoes_reverso.aprovacao_legada is 'Reversa anterior ao fluxo de aprovação: sem decisão registrada; a expedição segue liberada.';
comment on column public.solicitacoes_reverso.aprovacao_versao is 'Versão dos dados do pedido. Muda quando um dado do pedido é alterado; a decisão vale para a versão analisada.';
comment on column public.solicitacoes_reverso.aprovacao_versao_por is 'Quem produziu a versão atual dos dados (registro ou alteração). Não aprova essa versão sem autoaprovação.';
comment on column public.solicitacoes_reverso.solicitado_por is 'Usuário que registrou a reversa (auth.uid() no servidor).';

create index if not exists idx_sr_aguardando_aprovacao on public.solicitacoes_reverso (empresa, created_at)
  where aprovacao_status = 'aguardando_aprovacao';

-- 3. Histórico de decisões (só as funções deste arquivo gravam)
create table if not exists public.solicitacoes_aprovacoes (
  id uuid primary key default gen_random_uuid(),
  -- restrict: reversa com histórico de aprovação não pode ser apagada
  solicitacao_id uuid not null references public.solicitacoes_reverso (id) on delete restrict,
  versao integer not null,
  evento text not null check (evento in ('aprovada', 'rejeitada', 'invalidada', 'alterada')),
  justificativa text check (justificativa is null or length(justificativa) <= 1000),
  campos_alterados text[],
  situacao_anterior text,
  empresa text not null,
  user_id uuid,
  user_nome text not null,
  user_login text,
  created_at timestamptz not null default now(),
  check (evento <> 'rejeitada' or btrim(coalesce(justificativa, '')) <> ''),
  check (evento not in ('aprovada', 'rejeitada') or user_id is not null)
);

comment on table public.solicitacoes_aprovacoes is 'Decisões de aprovação (aprovada/rejeitada) e eventos que as desfazem (invalidada/alterada), com usuário e data/hora do servidor.';

-- Uma decisão por versão: segunda trava contra decisões simultâneas
create unique index if not exists idx_sa_uma_decisao_por_versao on public.solicitacoes_aprovacoes (solicitacao_id, versao)
  where evento in ('aprovada', 'rejeitada');
create index if not exists idx_sa_solicitacao on public.solicitacoes_aprovacoes (solicitacao_id, created_at desc);

alter table public.solicitacoes_aprovacoes enable row level security;

-- Vê o histórico quem vê a reversa (o RLS da reversa vale dentro da subconsulta)
drop policy if exists "aprovacoes_select" on public.solicitacoes_aprovacoes;
create policy "aprovacoes_select" on public.solicitacoes_aprovacoes
  for select to authenticated
  using (exists (select 1 from public.solicitacoes_reverso r where r.id = solicitacao_id));

revoke all on public.solicitacoes_aprovacoes from anon, authenticated, service_role;
grant select on public.solicitacoes_aprovacoes to authenticated, service_role;

-- 4. Configuração (decisão provisória: aprovar o próprio pedido fica desabilitado)
create table if not exists public.aprovacao_config (
  id boolean primary key default true check (id),
  permitir_autoaprovacao boolean not null default false,
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid
);

comment on table public.aprovacao_config is 'Configuração única da aprovação. permitir_autoaprovacao: quem registrou ou alterou a reversa pode aprová-la (padrão: não; a validar com o negócio).';

insert into public.aprovacao_config (id) values (true) on conflict (id) do nothing;

create or replace function public.aprovacao_config_registrar() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.id := true;
  new.atualizado_em := now();
  new.atualizado_por := auth.uid();
  return new;
end;
$$;

drop trigger if exists trg_aprovacao_config_registrar on public.aprovacao_config;
create trigger trg_aprovacao_config_registrar before update on public.aprovacao_config
  for each row execute function public.aprovacao_config_registrar();

alter table public.aprovacao_config enable row level security;

drop policy if exists "aprovacao_config_select" on public.aprovacao_config;
create policy "aprovacao_config_select" on public.aprovacao_config
  for select to authenticated using (true);

drop policy if exists "aprovacao_config_admin" on public.aprovacao_config;
create policy "aprovacao_config_admin" on public.aprovacao_config
  for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));

revoke all on public.aprovacao_config from anon, authenticated;
grant select on public.aprovacao_config to authenticated;
grant update (permitir_autoaprovacao) on public.aprovacao_config to authenticated;

-- 5. Regras na reversa
-- Liberada para a expedição: aprovada ou legado
create or replace function public.aprovacao_libera_logistica(p_status text, p_legada boolean) returns boolean
language sql immutable
set search_path = ''
as $$
  select coalesce(p_legada, false) or coalesce(p_status = 'aprovada', false);
$$;

-- Ordem das etapas logísticas (para separar avanço de retorno)
create or replace function public.reversa_ordem_etapa(p_status text) returns integer
language sql immutable
set search_path = ''
as $$
  select case p_status
    when 'pendente' then 1
    when 'etiqueta_gerada' then 2
    when 'postado' then 3
    when 'em_transito' then 4
    when 'concluido' then 5
    else 0
  end;
$$;

-- Dados do pedido que a decisão cobriu (rótulos para o histórico)
create or replace function public.reversa_campos_do_pedido_alterados(a public.solicitacoes_reverso, b public.solicitacoes_reverso)
returns text[]
language sql immutable
set search_path = ''
as $$
  select array_remove(array[
    case when a.empresa is distinct from b.empresa then 'Empresa' end,
    case when a.nc_id is distinct from b.nc_id then 'NC de origem' end,
    case when a.data_solicitacao is distinct from b.data_solicitacao then 'Data da solicitação' end,
    case when a.solicitante is distinct from b.solicitante then 'Solicitante' end,
    case when a.setor is distinct from b.setor then 'Setor' end,
    case when a.codigo_cliente is distinct from b.codigo_cliente then 'Código da cliente' end,
    case when a.nome_cliente is distinct from b.nome_cliente then 'Nome da cliente' end,
    case when a.endereco_postagem is distinct from b.endereco_postagem then 'Endereço de postagem' end,
    case when a.motivo is distinct from b.motivo then 'Motivo' end,
    case when a.justificativa_outros is distinct from b.justificativa_outros then 'Justificativa' end
  ]::text[], null);
$$;

-- Os triggers de aprovação levam "zz" no nome para rodar depois dos demais
-- BEFORE triggers da tabela (o Postgres segue a ordem alfabética): comparam o
-- pedido já com os valores finais.
drop trigger if exists trg_reversa_aprovacao_ao_criar on public.solicitacoes_reverso;
drop trigger if exists trg_reversa_aprovacao_ao_alterar on public.solicitacoes_reverso;
drop trigger if exists trg_reversa_aprovacao_registrar_alteracao on public.solicitacoes_reverso;

-- Toda reversa nova nasce aguardando aprovação e sem etapa logística
create or replace function public.reversa_aprovacao_ao_criar() returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  new.created_at := now();
  new.solicitado_por := auth.uid();
  new.solicitado_por_nome := public.usuario_nome(auth.uid());
  new.autorizacao := null;

  new.aprovacao_status := 'aguardando_aprovacao';
  new.aprovacao_legada := false;
  new.aprovacao_versao := 1;
  new.aprovacao_versao_por := auth.uid();
  new.aprovacao_decidida_por := null;
  new.aprovacao_decidida_por_nome := null;
  new.aprovacao_decidida_em := null;
  new.aprovacao_justificativa := null;

  new.status := 'pendente';
  new.etiqueta_gerada_em := null;
  new.postado_em := null;
  new.em_transito_em := null;
  new.concluido_em := null;
  new.codigo_rastreio := null;
  new.ultima_cidade_rastreio := null;
  new.etiqueta_path := null;
  new.etiqueta_nome := null;
  new.etiqueta_enviada_em := null;
  return new;
end;
$$;

drop trigger if exists trg_zz_reversa_aprovacao_ao_criar on public.solicitacoes_reverso;
create trigger trg_zz_reversa_aprovacao_ao_criar before insert on public.solicitacoes_reverso
  for each row execute function public.reversa_aprovacao_ao_criar();

-- Protege a decisão, desfaz a decisão quando o pedido muda e segura a expedição
create or replace function public.reversa_aprovacao_ao_alterar() returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  v_campos text[];
begin
  -- Quem registrou, quando e a autorização declarada (legado) não mudam
  new.created_at := old.created_at;
  new.solicitado_por := old.solicitado_por;
  new.solicitado_por_nome := old.solicitado_por_nome;
  new.autorizacao := old.autorizacao;

  -- Fora das funções de aprovação, a situação da aprovação não muda
  if coalesce(current_setting('app.aprovacao_decisao', true), '') <> 'sim' then
    new.aprovacao_status := old.aprovacao_status;
    new.aprovacao_legada := old.aprovacao_legada;
    new.aprovacao_versao := old.aprovacao_versao;
    new.aprovacao_versao_por := old.aprovacao_versao_por;
    new.aprovacao_decidida_por := old.aprovacao_decidida_por;
    new.aprovacao_decidida_por_nome := old.aprovacao_decidida_por_nome;
    new.aprovacao_decidida_em := old.aprovacao_decidida_em;
    new.aprovacao_justificativa := old.aprovacao_justificativa;

    v_campos := public.reversa_campos_do_pedido_alterados(old, new);
    if cardinality(v_campos) > 0 then
      -- Expedição em andamento: os dados ficam como foram aprovados
      if auth.uid() is not null
         and (old.status <> 'pendente' or old.codigo_rastreio is not null or old.etiqueta_path is not null) then
        raise exception 'A expedição desta reversa já começou: os dados do pedido (%) não podem mais mudar.',
          array_to_string(v_campos, ', ')
          using errcode = '55000';
      end if;
      -- A decisão (ou a autorização declarada do legado) não cobre os dados novos:
      -- volta a aguardar aprovação numa versão nova, produzida por quem alterou.
      new.aprovacao_status := 'aguardando_aprovacao';
      new.aprovacao_legada := false;
      new.aprovacao_versao := old.aprovacao_versao + 1;
      new.aprovacao_versao_por := auth.uid();
      new.aprovacao_decidida_por := null;
      new.aprovacao_decidida_por_nome := null;
      new.aprovacao_decidida_em := null;
      new.aprovacao_justificativa := null;
    end if;
  end if;

  -- Usuário final (API com token): a expedição só avança com a reversa liberada.
  -- Limpar rastreio/etiqueta e voltar etapa continuam permitidos.
  -- Backends com service_role usam exigir_operacao_logistica().
  if auth.uid() is not null and not public.aprovacao_libera_logistica(new.aprovacao_status, new.aprovacao_legada) then
    if public.reversa_ordem_etapa(new.status) > public.reversa_ordem_etapa(old.status)
       or (new.codigo_rastreio is not null and new.codigo_rastreio is distinct from old.codigo_rastreio)
       or (new.etiqueta_path is not null and new.etiqueta_path is distinct from old.etiqueta_path)
       or (new.etiqueta_nome is not null and new.etiqueta_nome is distinct from old.etiqueta_nome)
       or (new.etiqueta_enviada_em is not null and new.etiqueta_enviada_em is distinct from old.etiqueta_enviada_em)
       or (new.etiqueta_gerada_em is not null and new.etiqueta_gerada_em is distinct from old.etiqueta_gerada_em)
       or (new.postado_em is not null and new.postado_em is distinct from old.postado_em)
       or (new.em_transito_em is not null and new.em_transito_em is distinct from old.em_transito_em)
       or (new.concluido_em is not null and new.concluido_em is distinct from old.concluido_em)
       or (new.ultima_cidade_rastreio is not null and new.ultima_cidade_rastreio is distinct from old.ultima_cidade_rastreio)
    then
      raise exception 'A expedição desta reversa só avança depois da aprovação (situação: %).',
        replace(coalesce(new.aprovacao_status, 'legado'), '_', ' ')
        using errcode = '55000';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_zz_reversa_aprovacao_ao_alterar on public.solicitacoes_reverso;
create trigger trg_zz_reversa_aprovacao_ao_alterar before update on public.solicitacoes_reverso
  for each row execute function public.reversa_aprovacao_ao_alterar();

-- Registra no histórico a decisão desfeita (ou o pedido alterado durante a análise).
-- As funções de aprovação (marca app.aprovacao_decisao) gravam os próprios eventos.
create or replace function public.reversa_aprovacao_registrar_alteracao() returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  v_campos text[];
begin
  if coalesce(current_setting('app.aprovacao_decisao', true), '') = 'sim' then
    return new;
  end if;
  if new.aprovacao_versao is distinct from old.aprovacao_versao then
    v_campos := public.reversa_campos_do_pedido_alterados(old, new);
    insert into public.solicitacoes_aprovacoes
      (solicitacao_id, versao, evento, campos_alterados, situacao_anterior, empresa, user_id, user_nome, user_login)
    select
      new.id,
      new.aprovacao_versao,
      case when old.aprovacao_status = 'aguardando_aprovacao' then 'alterada' else 'invalidada' end,
      v_campos,
      case when old.aprovacao_legada then 'legado' else old.aprovacao_status end,
      new.empresa,
      auth.uid(),
      coalesce(public.usuario_nome(auth.uid()), 'Sistema'),
      (select u.email from auth.users u where u.id = auth.uid());

    if new.nc_id is not null and old.aprovacao_status is distinct from 'aguardando_aprovacao' then
      insert into public.nc_historico (nc_id, user_nome, acao)
      values (new.nc_id, coalesce(public.usuario_nome(auth.uid()), 'Sistema'),
        'Reversa de ' || new.nome_cliente || ' voltou para aprovação (alterado: ' || array_to_string(v_campos, ', ') || ')');
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_zz_reversa_aprovacao_registrar_alteracao on public.solicitacoes_reverso;
create trigger trg_zz_reversa_aprovacao_registrar_alteracao after update on public.solicitacoes_reverso
  for each row execute function public.reversa_aprovacao_registrar_alteracao();

-- 6. Decisão (aprovar / rejeitar)
-- Atômica: trava a reversa, confere permissão, situação e versão, grava a
-- decisão na reversa e no histórico. Duas pessoas ao mesmo tempo: a segunda
-- espera a primeira terminar e recebe "já foi aprovada/rejeitada".
create or replace function public.registrar_decisao_reversa(
  p_solicitacao_id uuid,
  p_decisao text,
  p_versao integer,
  p_justificativa text
) returns public.solicitacoes_reverso
language plpgsql security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_justificativa text := nullif(btrim(coalesce(p_justificativa, '')), '');
  v_nome text;
  v_login text;
  v_autoaprovacao boolean;
  v_r public.solicitacoes_reverso;
begin
  if v_uid is null then
    raise exception 'Entre no sistema para decidir aprovações.' using errcode = '42501';
  end if;
  if p_decisao is null or p_decisao not in ('aprovada', 'rejeitada') then
    raise exception 'Decisão inválida: use aprovada ou rejeitada.' using errcode = '22023';
  end if;
  if p_versao is null then
    raise exception 'Informe a versão da solicitação analisada.' using errcode = '22023';
  end if;
  if p_decisao = 'rejeitada' and v_justificativa is null then
    raise exception 'Informe a justificativa da rejeição.' using errcode = '23514';
  end if;
  if length(v_justificativa) > 1000 then
    raise exception 'Justificativa muito longa (máximo de 1000 caracteres).' using errcode = '22001';
  end if;

  select * into v_r from public.solicitacoes_reverso r where r.id = p_solicitacao_id for update;
  if not found or not (v_r.empresa = any (public.empresas_aprovaveis())) then
    raise exception 'Solicitação não encontrada ou fora das empresas que você aprova.' using errcode = '42501';
  end if;
  if v_r.aprovacao_legada then
    raise exception 'Solicitação anterior ao fluxo de aprovação (legado): não recebe decisão.' using errcode = '55000';
  end if;
  if v_r.aprovacao_status <> 'aguardando_aprovacao' then
    raise exception 'Esta solicitação já foi % por % em %.',
      v_r.aprovacao_status,
      coalesce(v_r.aprovacao_decidida_por_nome, 'outra pessoa'),
      to_char(v_r.aprovacao_decidida_em at time zone 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI')
      using errcode = '55000';
  end if;
  if v_r.aprovacao_versao <> p_versao then
    raise exception 'A solicitação foi alterada depois que você a abriu. Revise os dados atualizados e decida de novo.'
      using errcode = '55000';
  end if;
  -- Quem registrou o pedido ou produziu a versão atual não a aprova sozinho
  if p_decisao = 'aprovada' and (v_r.solicitado_por = v_uid or v_r.aprovacao_versao_por = v_uid) then
    select c.permitir_autoaprovacao into v_autoaprovacao from public.aprovacao_config c where c.id;
    if not coalesce(v_autoaprovacao, false) then
      raise exception 'Você não pode aprovar uma solicitação registrada ou alterada por você.' using errcode = '42501';
    end if;
  end if;

  v_nome := coalesce(public.usuario_nome(v_uid), 'Usuário ' || v_uid::text);
  select u.email into v_login from auth.users u where u.id = v_uid;

  perform set_config('app.aprovacao_decisao', 'sim', true);
  update public.solicitacoes_reverso r
     set aprovacao_status = p_decisao,
         aprovacao_decidida_por = v_uid,
         aprovacao_decidida_por_nome = v_nome,
         aprovacao_decidida_em = now(),
         aprovacao_justificativa = v_justificativa
   where r.id = p_solicitacao_id
  returning * into v_r;
  perform set_config('app.aprovacao_decisao', '', true);

  insert into public.solicitacoes_aprovacoes
    (solicitacao_id, versao, evento, justificativa, empresa, user_id, user_nome, user_login)
  values
    (v_r.id, v_r.aprovacao_versao, p_decisao, v_justificativa, v_r.empresa, v_uid, v_nome, v_login);

  if v_r.nc_id is not null then
    insert into public.nc_historico (nc_id, user_nome, acao)
    values (v_r.nc_id, v_nome, 'Reversa de ' || v_r.nome_cliente || ': '
      || case when p_decisao = 'aprovada' then 'aprovada' else 'rejeitada — ' || v_justificativa end);
  end if;

  return v_r;
end;
$$;

create or replace function public.aprovar_reversa(p_solicitacao_id uuid, p_versao integer, p_observacao text default null)
returns public.solicitacoes_reverso
language plpgsql security definer
set search_path = ''
as $$
begin
  return public.registrar_decisao_reversa(p_solicitacao_id, 'aprovada', p_versao, p_observacao);
end;
$$;

create or replace function public.rejeitar_reversa(p_solicitacao_id uuid, p_versao integer, p_justificativa text)
returns public.solicitacoes_reverso
language plpgsql security definer
set search_path = ''
as $$
begin
  return public.registrar_decisao_reversa(p_solicitacao_id, 'rejeitada', p_versao, p_justificativa);
end;
$$;

-- 7. Fila de aprovação: reversas aguardando, só das empresas que o usuário aprova.
-- Traz o contexto da NC (sem custos) para quem não tem a tela de NC.
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
    r.id,
    r.empresa,
    r.created_at,
    r.data_solicitacao,
    r.solicitante,
    r.setor,
    r.codigo_cliente,
    r.nome_cliente,
    r.endereco_postagem,
    r.motivo,
    r.justificativa_outros,
    r.solicitado_por_nome,
    r.aprovacao_versao,
    r.nc_id,
    case when nc.numero is null then null
      else 'NC-' || lpad(nc.numero::text, greatest(4, length(nc.numero::text)), '0') end,
    nc.origem,
    nc.descricao,
    p.proprio,
    not p.proprio or coalesce((select c.permitir_autoaprovacao from public.aprovacao_config c where c.id), false)
  from public.solicitacoes_reverso r
  left join public.nao_conformidades nc on nc.id = r.nc_id
  -- Registrou o pedido ou produziu a versão atual
  cross join lateral (
    select coalesce(r.solicitado_por = auth.uid(), false) or coalesce(r.aprovacao_versao_por = auth.uid(), false) as proprio
  ) p
  where r.aprovacao_status = 'aguardando_aprovacao'
    and r.empresa = any (public.empresas_aprovaveis())
  order by r.created_at, r.id;
$$;

-- 8. Contrato para a expedição (verificar_operacao_logistica e exigir_operacao_logistica)
-- não fica aqui: a versão vigente está em 20261023120000_permissoes_capacidades.sql, que
-- roda depois. Redefinir a função aqui reverteria a regra de capacidade numa reexecução.

-- 9. Legado pendente passa a exigir aprovação (opcional; decisão do negócio).
-- Só o admin. Converte as reversas legadas que ainda não começaram a
-- expedição (pendente, sem rastreio nem etiqueta) e registra no histórico.
-- Devolve quantas foram convertidas.
create or replace function public.exigir_aprovacao_legado_pendente() returns integer
language plpgsql security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_qtd integer;
begin
  if v_uid is not null and not public.is_admin() then
    raise exception 'Apenas administradores convertem reversas legadas.' using errcode = '42501';
  end if;

  perform set_config('app.aprovacao_decisao', 'sim', true);
  with convertidas as (
    update public.solicitacoes_reverso r
       set aprovacao_legada = false,
           aprovacao_status = 'aguardando_aprovacao',
           aprovacao_versao = r.aprovacao_versao + 1,
           aprovacao_versao_por = null
     where r.aprovacao_legada
       and r.status = 'pendente'
       and r.codigo_rastreio is null
       and r.etiqueta_path is null
    returning r.id, r.aprovacao_versao, r.empresa
  )
  insert into public.solicitacoes_aprovacoes
    (solicitacao_id, versao, evento, justificativa, situacao_anterior, empresa, user_id, user_nome, user_login)
  select
    c.id,
    c.aprovacao_versao,
    'invalidada',
    'Legado pendente passou a exigir aprovação (decisão administrativa).',
    'legado',
    c.empresa,
    v_uid,
    coalesce(public.usuario_nome(v_uid), 'Sistema'),
    (select u.email from auth.users u where u.id = v_uid)
  from convertidas c;
  get diagnostics v_qtd = row_count;
  perform set_config('app.aprovacao_decisao', '', true);
  return v_qtd;
end;
$$;

-- 10. Etiqueta (storage) e validação por etapa: não ficam aqui. Estão em
-- 20261023120000_permissoes_capacidades.sql, que roda depois e é a versão vigente.
-- Redefinir o trigger aqui reabriria os caminhos antigos numa reexecução desta migration.

-- 11. Quem executa o quê
-- Funções internas: só triggers e as próprias funções de aprovação
revoke execute on function
  public.registrar_decisao_reversa(uuid, text, integer, text),
  public.reversa_aprovacao_ao_criar(),
  public.reversa_aprovacao_ao_alterar(),
  public.reversa_aprovacao_registrar_alteracao(),
  public.aprovacao_config_registrar(),
  public.reversa_campos_do_pedido_alterados(public.solicitacoes_reverso, public.solicitacoes_reverso),
  public.usuario_nome(uuid)
  from public, anon, authenticated, service_role;

-- Ações e consultas: usuários logados e backends (service_role); nunca anon
revoke execute on function
  public.aprovar_reversa(uuid, integer, text),
  public.rejeitar_reversa(uuid, integer, text),
  public.fila_aprovacao_reversas(),
  public.exigir_aprovacao_legado_pendente(),
  public.empresas_aprovaveis()
  from public, anon;

grant execute on function
  public.aprovar_reversa(uuid, integer, text),
  public.rejeitar_reversa(uuid, integer, text),
  public.fila_aprovacao_reversas(),
  public.exigir_aprovacao_legado_pendente(),
  public.empresas_aprovaveis()
  to authenticated, service_role;

