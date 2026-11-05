-- ============================================================
-- Não conformidades (NC) da Expedição
-- ------------------------------------------------------------
-- Espelha a planilha "Análise de não conformidades — Expedição":
--   REGISTRO_NC → nao_conformidades (36 colunas; 6 calculadas)
--   LISTAS_NC   → nc_origens (com área e "evitável") e nc_listas
--   linha do tempo → nc_historico (eventos automáticos + anotações)
-- A NC de origem é opcional. Quando vinculada, precisa ser da mesma empresa
-- e estar Aberta ou Em tratativa. Reversas antigas ficam marcadas como legado.
--
-- Requer: 20261020130000_permissoes_app_metadata.sql
-- Idempotente: pode ser executada mais de uma vez.
-- ============================================================

-- 1. Listas (LISTAS_NC). Editáveis pelos administradores na tela "Listas de NC".
create table if not exists public.nc_origens (
  nome text primary key,
  area text not null,
  evitavel text not null check (evitavel in ('Sim', 'Não', 'A avaliar')),
  ordem integer not null default 0,
  ativo boolean not null default true
);

-- Compatibilidade com instalações que usavam "Nao" sem acento.
alter table public.nc_origens drop constraint if exists nc_origens_evitavel_check;
update public.nc_origens
set evitavel = case lower(btrim(evitavel))
  when 'nao' then 'Não'
  when 'não' then 'Não'
  when 'nã£o' then 'Não'
  when 'sim' then 'Sim'
  when 'a avaliar' then 'A avaliar'
  else evitavel
end;
alter table public.nc_origens
  add constraint nc_origens_evitavel_check check (evitavel in ('Sim', 'Não', 'A avaliar'));

comment on table public.nc_origens is 'Origens de NC com a área responsável e a classificação "evitável internamente" (LISTAS_NC, colunas A–C).';

create table if not exists public.nc_listas (
  lista text not null check (lista in ('area', 'tipo_saida', 'resolucao', 'empresa', 'como_identificada', 'reembolso')),
  valor text not null,
  ordem integer not null default 0,
  ativo boolean not null default true,
  primary key (lista, valor)
);

comment on table public.nc_listas is 'Listas de opções da NC (LISTAS_NC). Valores inativos continuam válidos nos registros antigos.';

-- Carga idempotente das opções oficiais da planilha; preserva ativa/inativa.
insert into public.nc_origens (nome, area, evitavel, ordem)
select v.nome, v.area, v.evitavel, v.ordem
from (values
  ('Erro expedição – endereço incorreto', 'Expedição', 'Sim', 1),
  ('Erro expedição – mercadoria trocada ou embalada junto', 'Expedição', 'Sim', 2),
  ('Erro expedição – etiqueta ou pré-postagem', 'Expedição', 'Sim', 3),
  ('Embalagem inadequada / avaria por embalagem', 'Expedição', 'Sim', 4),
  ('Atraso de postagem', 'Expedição', 'Sim', 5),
  ('Postagem duplicada', 'Expedição', 'Sim', 6),
  ('Postagem sem NF', 'Expedição', 'Sim', 7),
  ('Erro de faturamento / NF (destinatário ou endereço)', 'Financeiro', 'Sim', 8),
  ('Erro da expedição e do financeiro', 'Expedição e Financeiro', 'Sim', 9),
  ('Erro vendedora – endereço incorreto', 'Comercial', 'Sim', 10),
  ('Tipo de frete incorreto (CIF/FOB)', 'Comercial', 'Sim', 11),
  ('Frete não cobrado na venda', 'Comercial', 'Sim', 12),
  ('Reverso sem autorização', 'Comercial', 'Sim', 13),
  ('Frete carona (pacote de terceiro com pedido da marca)', 'Comercial', 'Sim', 14),
  ('Mercadoria apreendida (fiscalização)', 'Fiscalização', 'A avaliar', 15),
  ('Extravio Correios', 'Correios', 'Não', 16),
  ('Avaria no transporte', 'Correios', 'Não', 17),
  ('Entregue para a pessoa errada', 'Correios', 'Não', 18),
  ('Consta entregue / não entregue no local', 'Correios', 'Não', 19),
  ('Endereço não localizado', 'Correios', 'Não', 20),
  ('Entregador não atendido', 'Cliente / destinatário', 'Não', 21),
  ('Cliente desconhecido', 'Cliente / destinatário', 'Não', 22),
  ('Entregue, porém cliente afirma que não recebeu', 'Cliente / destinatário', 'Não', 23),
  ('Mercadoria devolvida pelo destinatário', 'Cliente / destinatário', 'Não', 24),
  ('Não retirada no prazo (aguardando retirada)', 'Cliente / destinatário', 'Não', 25),
  ('Erro da/o cliente', 'Cliente / destinatário', 'Não', 26),
  ('Peça de outra marca recebida', 'Cliente / destinatário', 'Não', 27),
  ('Outro', 'A definir', 'A avaliar', 28)
) as v (nome, area, evitavel, ordem)
where true
on conflict (nome) do update
set area = excluded.area,
    evitavel = excluded.evitavel,
    ordem = excluded.ordem;

insert into public.nc_listas (lista, valor, ordem)
select v.lista, v.valor, v.ordem
from (values
  ('area', 'Expedição', 1),
  ('area', 'Financeiro', 2),
  ('area', 'Expedição e Financeiro', 3),
  ('area', 'Comercial', 4),
  ('area', 'Fiscalização', 5),
  ('area', 'Correios', 6),
  ('area', 'Cliente / destinatário', 7),
  ('area', 'A definir', 8),
  ('tipo_saida', 'Venda', 1),
  ('tipo_saida', 'Conserto', 2),
  ('tipo_saida', 'Reenvio', 3),
  ('tipo_saida', 'Reverso', 4),
  ('tipo_saida', 'Brinde / envio especial', 5),
  ('tipo_saida', 'Recebimento (entrada)', 6),
  ('resolucao', 'Envio de nova mercadoria', 1),
  ('resolucao', 'Reenvio da mesma mercadoria', 2),
  ('resolucao', 'Crédito para a cliente', 3),
  ('resolucao', 'Devolução', 4),
  ('resolucao', 'Reverso', 5),
  ('resolucao', 'Resolvido com a vendedora', 6),
  ('resolucao', 'Multa paga', 7),
  ('resolucao', 'Mercadoria retirada no correio', 8),
  ('resolucao', 'Pedido de indenização aberto', 9),
  ('resolucao', 'Em análise', 10),
  ('resolucao', 'Sem ação necessária', 11),
  ('empresa', 'Alinare', 1),
  ('empresa', 'Artikler', 2),
  ('empresa', 'Azime', 3),
  ('empresa', 'Trice', 4),
  ('empresa', 'Novitah', 5),
  ('empresa', 'A identificar', 6),
  ('como_identificada', 'Conferência da embalagem', 1),
  ('como_identificada', 'Rastreio / Correios', 2),
  ('como_identificada', 'Reclamação da cliente', 3),
  ('como_identificada', 'Vendedora', 4),
  ('como_identificada', 'Recebimento / correspondências', 5),
  ('como_identificada', 'Conciliação de fatura', 6),
  ('como_identificada', 'Relatório VIPP', 7),
  ('como_identificada', 'Auditoria de processos', 8),
  ('como_identificada', 'Outro', 9),
  ('reembolso', 'Sim', 1),
  ('reembolso', 'Não', 2),
  ('reembolso', 'Em análise', 3),
  ('reembolso', 'Não se aplica', 4)
) as v (lista, valor, ordem)
where true
on conflict (lista, valor) do update
set ordem = excluded.ordem;

-- 2. Registro de NC (REGISTRO_NC)
-- A numeração começa em 26: NC-0001 a NC-0025 ficam reservadas para as
-- ocorrências que já estão na planilha e serão importadas com o mesmo ID.
-- O número é atribuído por trigger (nc_proteger_campos), nunca pelo cliente.
create sequence if not exists public.nc_numero_seq start with 26;

create table if not exists public.nao_conformidades (
  id uuid primary key default gen_random_uuid(),
  numero integer not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  importada boolean not null default false,

  -- Identificação
  data_ocorrencia date,
  data_identificacao date,
  empresa text,
  cliente text,
  vendedora text,
  romaneio text,
  valor_romaneio numeric(12, 2),
  nf text,
  rastreio text,
  data_postagem date,

  -- Classificação (área responsável e "evitável" vêm da origem: ver vw_nao_conformidades)
  tipo_saida text,
  origem text references public.nc_origens (nome) on update cascade,
  como_identificada text,

  -- Ocorrência e resolução
  status_correios text,
  descricao text,
  resolucao text,
  novo_rastreio text,

  -- Valor real
  valor_declarado numeric(12, 2),
  valor_venda numeric(12, 2),
  frete_original numeric(12, 2),

  -- Custo da não conformidade
  custo_produto numeric(12, 2),
  custo_frete_adicional numeric(12, 2),
  custo_multa_outros numeric(12, 2),
  -- Planilha: =IF(COUNT(X:Z)=0,"",SUM(X:Z))
  custo_total numeric(12, 2) generated always as (
    case
      when custo_produto is null and custo_frete_adicional is null and custo_multa_outros is null then null
      else coalesce(custo_produto, 0) + coalesce(custo_frete_adicional, 0) + coalesce(custo_multa_outros, 0)
    end
  ) stored,
  reembolso_correios text,
  numero_pi text,
  valor_reembolsado numeric(12, 2),
  -- Planilha: =IF(AA="","",AA-N(AD))
  custo_liquido numeric(12, 2) generated always as (
    case
      when custo_produto is null and custo_frete_adicional is null and custo_multa_outros is null then null
      else coalesce(custo_produto, 0) + coalesce(custo_frete_adicional, 0) + coalesce(custo_multa_outros, 0)
        - coalesce(valor_reembolsado, 0)
    end
  ) stored,

  -- Esforço e status
  tempo_tratativa_min integer check (tempo_tratativa_min is null or tempo_tratativa_min >= 0),
  status text default 'Aberta' check (status is null or status in ('Aberta', 'Em tratativa', 'Encerrada', 'Cancelada')),
  data_encerramento date,

  check (valor_romaneio is null or valor_romaneio >= 0),
  check (valor_declarado is null or valor_declarado >= 0),
  check (valor_venda is null or valor_venda >= 0),
  check (frete_original is null or frete_original >= 0),
  check (custo_produto is null or custo_produto >= 0),
  check (custo_frete_adicional is null or custo_frete_adicional >= 0),
  check (custo_multa_outros is null or custo_multa_outros >= 0),
  check (valor_reembolsado is null or valor_reembolsado >= 0)
);

alter table public.nao_conformidades alter column numero drop default;
alter sequence public.nc_numero_seq owned by public.nao_conformidades.numero;

comment on table public.nao_conformidades is 'Não conformidades da Expedição, com ou sem reversa (REGISTRO_NC). status nulo = sem status informado (histórico da planilha).';

create index if not exists idx_nc_data_ocorrencia on public.nao_conformidades (data_ocorrencia desc);
create index if not exists idx_nc_empresa on public.nao_conformidades (empresa);
create index if not exists idx_nc_status on public.nao_conformidades (status);
create index if not exists idx_nc_origem on public.nao_conformidades (origem);

-- Nome de quem está logado (para a linha do tempo), lido de auth.users.
create or replace function public.nc_usuario_nome() returns text
language sql stable security definer
set search_path = ''
as $$
  select coalesce(
    (select coalesce(nullif(u.raw_user_meta_data ->> 'nome', ''), u.email) from auth.users u where u.id = auth.uid()),
    'Sistema'
  );
$$;

-- Campos de controle: número sequencial, importação e autoria não vêm do cliente
-- (só a importação do admin define o número); a empresa não muda se já há reversa.
create or replace function public.nc_proteger_campos() returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.numero is null or (auth.uid() is not null and not public.is_admin()) then
      new.numero := nextval('public.nc_numero_seq');
      new.importada := false;
    end if;
    if auth.uid() is not null then
      new.created_by := auth.uid();
    end if;
    new.created_at := now();
    new.updated_at := now();
    return new;
  end if;

  new.numero := old.numero;
  new.importada := old.importada;
  new.created_at := old.created_at;
  new.created_by := old.created_by;
  new.updated_at := now();

  if new.empresa is distinct from old.empresa
     and exists (select 1 from public.solicitacoes_reverso r where r.nc_id = old.id) then
    raise exception 'Esta NC já tem reversa vinculada: a empresa / contrato não pode mudar.' using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_nc_updated_at on public.nao_conformidades;
drop function if exists public.nc_atualizar_updated_at();

drop trigger if exists trg_nc_proteger_campos on public.nao_conformidades;
create trigger trg_nc_proteger_campos before insert or update on public.nao_conformidades
  for each row execute function public.nc_proteger_campos();

-- Valores fora das listas são recusados (só quando o campo muda, para não
-- travar registros antigos cujo valor foi desativado depois).
create or replace function public.nc_exigir_valor_da_lista(p_lista text, p_valor text, p_rotulo text) returns void
language plpgsql stable
set search_path = ''
as $$
begin
  if p_valor is not null and not exists (
    select 1 from public.nc_listas l where l.lista = p_lista and l.valor = p_valor
  ) then
    raise exception '% fora da lista: %', p_rotulo, p_valor using errcode = '23514';
  end if;
end;
$$;

create or replace function public.nc_validar_listas() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' or new.empresa is distinct from old.empresa then
    perform public.nc_exigir_valor_da_lista('empresa', new.empresa, 'Empresa / contrato');
  end if;
  if tg_op = 'INSERT' or new.tipo_saida is distinct from old.tipo_saida then
    perform public.nc_exigir_valor_da_lista('tipo_saida', new.tipo_saida, 'Tipo de saída');
  end if;
  if tg_op = 'INSERT' or new.resolucao is distinct from old.resolucao then
    perform public.nc_exigir_valor_da_lista('resolucao', new.resolucao, 'Resolução');
  end if;
  if tg_op = 'INSERT' or new.como_identificada is distinct from old.como_identificada then
    perform public.nc_exigir_valor_da_lista('como_identificada', new.como_identificada, 'Como foi identificada');
  end if;
  if tg_op = 'INSERT' or new.reembolso_correios is distinct from old.reembolso_correios then
    perform public.nc_exigir_valor_da_lista('reembolso', new.reembolso_correios, 'Reembolso Correios?');
  end if;
  return new;
end;
$$;

drop trigger if exists trg_nc_validar_listas on public.nao_conformidades;
create trigger trg_nc_validar_listas before insert or update on public.nao_conformidades
  for each row execute function public.nc_validar_listas();

-- 3. Linha do tempo (eventos automáticos + anotações manuais)
create table if not exists public.nc_historico (
  id uuid primary key default gen_random_uuid(),
  nc_id uuid not null references public.nao_conformidades (id) on delete cascade,
  created_at timestamptz not null default now(),
  user_id uuid,
  user_nome text not null default '',
  tipo text not null default 'evento' check (tipo in ('evento', 'nota')),
  acao text not null
);

comment on table public.nc_historico is 'Linha do tempo da NC: eventos gravados por trigger e anotações dos usuários.';

create index if not exists idx_nch_nc on public.nc_historico (nc_id, created_at desc);

-- Autor e data de cada item vêm do servidor (não dá para forjar nem antedatar).
create or replace function public.nc_historico_preencher() returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  new.created_at := now();
  if auth.uid() is not null then
    new.user_id := auth.uid();
    new.user_nome := public.nc_usuario_nome();
  end if;
  return new;
end;
$$;

drop trigger if exists trg_nc_historico_preencher on public.nc_historico;
create trigger trg_nc_historico_preencher before insert on public.nc_historico
  for each row execute function public.nc_historico_preencher();

create or replace function public.nc_registrar_historico() returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  v_nome text := public.nc_usuario_nome();
  v_rotulos constant jsonb := '{
    "data_ocorrencia": "Data da ocorrência",
    "data_identificacao": "Data de identificação",
    "empresa": "Empresa / contrato",
    "cliente": "Cliente",
    "vendedora": "Vendedora",
    "romaneio": "Romaneio",
    "valor_romaneio": "Valor do romaneio",
    "nf": "NF",
    "rastreio": "Rastreio",
    "data_postagem": "Data de postagem",
    "tipo_saida": "Tipo de saída",
    "origem": "Origem da não conformidade",
    "como_identificada": "Como foi identificada",
    "status_correios": "Status no Correios",
    "descricao": "Descrição / observação",
    "novo_rastreio": "Novo rastreio",
    "valor_declarado": "Valor declarado do produto",
    "valor_venda": "Valor da venda",
    "frete_original": "Frete original",
    "custo_produto": "Custo — produto",
    "custo_frete_adicional": "Custo — frete adicional",
    "custo_multa_outros": "Custo — multa / outros",
    "reembolso_correios": "Reembolso Correios?",
    "numero_pi": "Nº do pedido de indenização (PI)",
    "valor_reembolsado": "Valor reembolsado",
    "tempo_tratativa_min": "Tempo de tratativa (min)",
    "data_encerramento": "Data de encerramento"
  }'::jsonb;
  v_novo jsonb;
  v_antigo jsonb;
  v_campos text[] := '{}';
  v_chave text;
begin
  if tg_op = 'INSERT' then
    insert into public.nc_historico (nc_id, user_nome, acao)
    values (new.id, v_nome, case when new.importada then 'NC importada da planilha' else 'NC registrada' end);
    return new;
  end if;

  if new.status is distinct from old.status then
    insert into public.nc_historico (nc_id, user_nome, acao)
    values (new.id, v_nome, 'Status: ' || coalesce(old.status, 'sem status') || ' → ' || coalesce(new.status, 'sem status'));
  end if;

  if new.resolucao is distinct from old.resolucao then
    insert into public.nc_historico (nc_id, user_nome, acao)
    values (new.id, v_nome, 'Resolução: ' || coalesce(new.resolucao, 'removida'));
  end if;

  v_novo := to_jsonb(new);
  v_antigo := to_jsonb(old);
  for v_chave in select k from jsonb_object_keys(v_rotulos) as k order by k loop
    if (v_novo -> v_chave) is distinct from (v_antigo -> v_chave) then
      v_campos := v_campos || (v_rotulos ->> v_chave);
    end if;
  end loop;

  if cardinality(v_campos) > 0 then
    insert into public.nc_historico (nc_id, user_nome, acao)
    values (new.id, v_nome, 'Dados atualizados: ' || array_to_string(v_campos, ', '));
  end if;

  return new;
end;
$$;

drop trigger if exists trg_nc_historico on public.nao_conformidades;
create trigger trg_nc_historico after insert or update on public.nao_conformidades
  for each row execute function public.nc_registrar_historico();

-- 4. Reversa com vínculo opcional à NC de origem
alter table public.solicitacoes_reverso
  add column if not exists nc_id uuid references public.nao_conformidades (id) on delete restrict,
  add column if not exists nc_numero integer,
  add column if not exists legado boolean not null default false;

comment on column public.solicitacoes_reverso.nc_id is 'NC de origem opcional. Quando informada, deve ser da mesma empresa e estar aberta.';
comment on column public.solicitacoes_reverso.legado is 'Reversa criada antes da implantação do vínculo opcional com NC.';

-- Preserva como legado o histórico anterior à liberação de reversas sem NC.
-- A data fixa impede que uma reaplicação marque novas reversas como legado.
update public.solicitacoes_reverso
set legado = true
where nc_id is null
  and not legado
  and created_at < timestamptz '2026-10-21 12:00:00+00';

alter table public.solicitacoes_reverso alter column nc_id drop not null;

-- Remove a regra antiga que exigia NC em todas as novas reversas.
alter table public.solicitacoes_reverso
  drop constraint if exists solicitacoes_reverso_origem_nc_check;

create index if not exists idx_sr_nc on public.solicitacoes_reverso (nc_id);

-- "legado" e o número da NC são do servidor. O vínculo é opcional; quando
-- informado, a NC precisa existir, ser da mesma empresa e estar aberta.
create or replace function public.reversa_vincular_nc() returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  v_numero integer;
  v_empresa text;
  v_status text;
begin
  if tg_op = 'INSERT' then
    new.legado := false;
  else
    new.legado := old.legado;
  end if;

  if new.nc_id is null then
    new.nc_numero := null;
    return new;
  end if;

  -- Mesma NC e mesma empresa: mantém o número gravado
  if tg_op = 'UPDATE' and new.nc_id is not distinct from old.nc_id and new.empresa is not distinct from old.empresa then
    new.nc_numero := old.nc_numero;
    return new;
  end if;

  select nc.numero, nc.empresa, nc.status into v_numero, v_empresa, v_status
  from public.nao_conformidades nc
  where nc.id = new.nc_id;

  if not found then
    raise exception 'NC de origem não encontrada.' using errcode = '23503';
  end if;
  if v_empresa is distinct from new.empresa then
    raise exception 'A reversa (%) precisa ser da mesma empresa da NC (%).', new.empresa, coalesce(v_empresa, 'sem empresa')
      using errcode = '23514';
  end if;
  if (tg_op = 'INSERT' or new.nc_id is distinct from old.nc_id)
     and coalesce(v_status, '') not in ('Aberta', 'Em tratativa') then
    raise exception 'A NC precisa estar Aberta ou Em tratativa para gerar reversa.' using errcode = '23514';
  end if;

  new.nc_numero := v_numero;
  return new;
end;
$$;

drop trigger if exists trg_reversa_vincular_nc on public.solicitacoes_reverso;
create trigger trg_reversa_vincular_nc before insert or update on public.solicitacoes_reverso
  for each row execute function public.reversa_vincular_nc();

-- Registra na linha do tempo da NC a reversa gerada e cada mudança de etapa.
create or replace function public.reversa_registrar_na_nc() returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  v_etapa text;
begin
  if new.nc_id is null then
    return new;
  end if;

  if tg_op = 'INSERT' then
    insert into public.nc_historico (nc_id, user_nome, acao)
    values (new.nc_id, public.nc_usuario_nome(), 'Reversa gerada (' || new.empresa || ') para ' || new.nome_cliente);
  elsif new.status is distinct from old.status then
    v_etapa := case new.status
      when 'pendente' then 'Pendente'
      when 'etiqueta_gerada' then 'Etiqueta gerada'
      when 'postado' then 'Postado'
      when 'em_transito' then 'Em trânsito'
      when 'concluido' then 'Concluído'
      else new.status
    end;
    insert into public.nc_historico (nc_id, user_nome, acao)
    values (new.nc_id, public.nc_usuario_nome(), 'Reversa de ' || new.nome_cliente || ': ' || v_etapa);
  end if;

  return new;
end;
$$;

drop trigger if exists trg_reversa_historico_nc on public.solicitacoes_reverso;
create trigger trg_reversa_historico_nc after insert or update of status on public.solicitacoes_reverso
  for each row execute function public.reversa_registrar_na_nc();

-- 5. Visão com os campos calculados da planilha
--   ID              = "NC-" & TEXT(n, "0000")
--   Área / Evitável = VLOOKUP(origem, LISTAS_NC) com "A definir" / "A avaliar"
--   Dias em aberto  = (encerramento ou hoje) − (identificação ou ocorrência)
create or replace view public.vw_nao_conformidades with (security_invoker = true) as
select
  nc.*,
  'NC-' || lpad(nc.numero::text, greatest(4, length(nc.numero::text)), '0') as codigo,
  case when nc.origem is null then null else coalesce(o.area, 'A definir') end as area_responsavel,
  case when nc.origem is null then null else coalesce(o.evitavel, 'A avaliar') end as evitavel,
  case
    when nc.data_ocorrencia is null and nc.data_identificacao is null then null
    else coalesce(nc.data_encerramento, current_date) - coalesce(nc.data_identificacao, nc.data_ocorrencia)
  end as dias_em_aberto,
  (select count(*)::integer from public.solicitacoes_reverso r where r.nc_id = nc.id) as qtd_reversas
from public.nao_conformidades nc
left join public.nc_origens o on o.nome = nc.origem;

-- 6. Permissões (telas 'nc' = consultar, 'nc-edit' = registrar/editar/gerar reversa)
create or replace function public.pode_ver_nc() returns boolean
language sql stable security definer
set search_path = ''
as $$
  select public.is_admin() or public.current_telas() && array['nc', 'nc-edit']::text[];
$$;

create or replace function public.pode_editar_nc() returns boolean
language sql stable security definer
set search_path = ''
as $$
  select public.is_admin() or 'nc-edit' = any (public.current_telas());
$$;

alter table public.nao_conformidades enable row level security;

drop policy if exists "nc_select" on public.nao_conformidades;
create policy "nc_select" on public.nao_conformidades
  for select to authenticated using ((select public.pode_ver_nc()));

drop policy if exists "nc_insert" on public.nao_conformidades;
create policy "nc_insert" on public.nao_conformidades
  for insert to authenticated with check ((select public.pode_editar_nc()));

drop policy if exists "nc_update" on public.nao_conformidades;
create policy "nc_update" on public.nao_conformidades
  for update to authenticated using ((select public.pode_editar_nc())) with check ((select public.pode_editar_nc()));

drop policy if exists "nc_delete" on public.nao_conformidades;
create policy "nc_delete" on public.nao_conformidades
  for delete to authenticated using ((select public.is_admin()));

alter table public.nc_historico enable row level security;

drop policy if exists "nc_historico_select" on public.nc_historico;
create policy "nc_historico_select" on public.nc_historico
  for select to authenticated using ((select public.pode_ver_nc()));

drop policy if exists "nc_historico_insert_nota" on public.nc_historico;
create policy "nc_historico_insert_nota" on public.nc_historico
  for insert to authenticated with check ((select public.pode_editar_nc()) and tipo = 'nota');

alter table public.nc_origens enable row level security;

drop policy if exists "nc_origens_select" on public.nc_origens;
create policy "nc_origens_select" on public.nc_origens
  for select to authenticated using (true);

drop policy if exists "nc_origens_admin" on public.nc_origens;
create policy "nc_origens_admin" on public.nc_origens
  for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));

alter table public.nc_listas enable row level security;

drop policy if exists "nc_listas_select" on public.nc_listas;
create policy "nc_listas_select" on public.nc_listas
  for select to authenticated using (true);

drop policy if exists "nc_listas_admin" on public.nc_listas;
create policy "nc_listas_admin" on public.nc_listas
  for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));

-- Privilégios explícitos (sem depender dos default privileges do projeto)
revoke all on public.nao_conformidades, public.nc_historico, public.nc_origens, public.nc_listas, public.vw_nao_conformidades from anon;
grant select, insert, update, delete on public.nao_conformidades to authenticated;
grant select, insert on public.nc_historico to authenticated;
revoke update, delete on public.nc_historico from authenticated;
grant select, insert, update, delete on public.nc_origens, public.nc_listas to authenticated;
grant select on public.vw_nao_conformidades to authenticated;

-- 7. Funções chamadas pelo frontend
-- NCs abertas que podem originar uma reversa no formulário da empresa.
-- Devolve só os campos de identificação: quem tem apenas o formulário não vê custos.
create or replace function public.ncs_para_reversa(p_empresa text)
returns table (id uuid, numero integer, codigo text, data_ocorrencia date, cliente text, origem text, status text)
language sql stable security definer
set search_path = ''
as $$
  select
    nc.id,
    nc.numero,
    'NC-' || lpad(nc.numero::text, greatest(4, length(nc.numero::text)), '0'),
    nc.data_ocorrencia,
    nc.cliente,
    nc.origem,
    nc.status
  from public.nao_conformidades nc
  where nc.empresa = p_empresa
    and nc.status in ('Aberta', 'Em tratativa')
    and (public.pode_ver_nc() or p_empresa = any (public.empresas_formulario()))
  order by nc.numero desc;
$$;

-- Ajusta a sequência depois da importação da planilha (NCs com número explícito).
-- Nunca volta: o próximo número é o maior entre (maior NC + 1), 26 e o próximo atual.
create or replace function public.nc_sincronizar_numeracao() returns integer
language plpgsql security definer
set search_path = ''
as $$
declare
  v_max integer;
  v_proximo bigint;
begin
  if not public.is_admin() then
    raise exception 'Apenas administradores podem ajustar a numeração das NCs.' using errcode = '42501';
  end if;
  select coalesce(max(numero), 0) into v_max from public.nao_conformidades;
  select case when s.is_called then s.last_value + 1 else s.last_value end into v_proximo from public.nc_numero_seq s;
  perform setval('public.nc_numero_seq', greatest(v_max + 1, 26, v_proximo), false);
  return v_max;
end;
$$;

revoke execute on function public.ncs_para_reversa(text), public.nc_sincronizar_numeracao() from public, anon;
grant execute on function public.ncs_para_reversa(text), public.nc_sincronizar_numeracao() to authenticated;
