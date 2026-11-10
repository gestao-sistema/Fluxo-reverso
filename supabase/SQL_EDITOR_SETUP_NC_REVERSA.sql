-- Script único para o SQL Editor do Supabase.
-- Junta as migrations de supabase/migrations/ em ordem:
--   20261020130000_permissoes_app_metadata.sql
--   20261020130100_nao_conformidades.sql
--   20261020130200_etiqueta_reversa.sql
--   20261021120000_reversa_nc_opcional.sql
--   20261021130000_setores_fluxo_reverso.sql
--   20261021140000_alinhar_listas_nc.sql
--   20261022100000_autorizador_registrado_na_aprovacao.sql
--   20261023100000_aprovacao_reversas.sql
--   20261023110000_emissoes_reversa.sql
--   20261023120000_permissoes_capacidades.sql
--   20261023130000_motivos_reverso_endereco_troca.sql
--   20261023140000_checkin_rastreio.sql
--   20261023150000_recebimento_mercadoria.sql
--   20261023160000_meus_pedidos_autoria_rls.sql
--   20261023170000_politica_leitura_insert_reversa.sql
--   20261023180000_revogar_execucao_usuario_nome.sql
--   20261023190000_aprovadores_empresa_setor.sql
--   20261023200000_notificacoes_aprovacao_expedicao.sql
--   20261026200000_comunicacao_etiqueta_solicitante.sql
--   20261026210000_comunicacao_resultado_indeterminado.sql
--   20261026220000_comunicacao_eventos_logistica.sql
--   20261027100000_comunicacao_ciclo_pedido.sql
--   20261027110000_comunicacao_reconciliacao_admin.sql
--   20261027120000_relatorios_reversa.sql
--   20261027130000_recebimento_fisico_apos_entrega.sql
--   20261027140000_postagem_automatica_rastreio.sql
--   20261028100000_acesso_por_tela_cadastro.sql
--   20261028110000_convites_acesso.sql
--   20261028120000_convite_senha_pendente.sql
--   20261028130000_bloquear_operacao_sem_senha_convite.sql
--   20261028140000_smtp_direto_email.sql
--   20261030100000_auditoria_aprovadores_usuario_opcional.sql
--   20261030110000_corrigir_fk_exclusao_historico_reversa.sql
--   20261030120000_lixeira_chamados.sql
--   20261109100000_nc_classificacao_separada.sql
--   20261109120000_nc_registro_classificacao.sql
--   20261109130000_fila_aprovacao_classificacao_nc.sql
--   20261109140000_nc_edicao_versao_auditoria.sql
--   20261109150000_avisos_ciclo_reverso.sql
--   20261109160000_nc_edicao_somente_pelo_servidor.sql
--   20261109170000_privilegios_funcoes_de_gatilho.sql
--   20261109180000_privilegios_tabelas_authenticated.sql
-- Não edite à mão: altere as migrations e gere de novo com
-- node supabase/scripts/gerar-sql-editor.mjs
-- Aplicar somente no projeto existente que já contém public.solicitacoes_reverso.
-- Antes de executar: publique a Edge Function admin-usuarios nova.
-- Depois de executar: confira a auditoria de telas (último resultado) e publique o
-- frontend novo em seguida (reversa nova exige NC de origem e aprovação).
-- Não executar os scripts antigos src/sql/create_table.sql ou src/sql/rls_solicitacoes*.sql.

-- ============================================================
-- SOURCE: supabase/migrations/20261020130000_permissoes_app_metadata.sql
-- ============================================================
-- ============================================================
-- Permissões em app_metadata + escopo por lista de empresas
-- ------------------------------------------------------------
-- Antes, as telas ficavam em user_metadata, que o próprio usuário altera com
-- supabase.auth.updateUser({ data }). As policies e a Edge Function
-- admin-usuarios confiavam nesse campo: qualquer usuário logado podia se dar
-- a tela 'usuarios' (admin).
-- Agora as telas ficam em app_metadata (só o service_role grava) e são lidas
-- direto de auth.users a cada consulta: mudanças e revogações valem na hora,
-- sem esperar o token expirar. O escopo de empresa é uma lista (quem tem
-- telas de Alinare e de Novitah acessa as duas), separado em leitura,
-- cadastro e movimentação.
--
-- Idempotente: pode ser executada mais de uma vez.
-- Ordem: publique antes a Edge Function admin-usuarios nova (ela já lê
-- app_metadata) e rode esta migration logo em seguida. O resultado final é a
-- auditoria das telas de cada usuário: confira antes de seguir.
-- ============================================================

-- 1. Copia as telas para app_metadata (só de quem ainda não tem).
--    user_metadata fica como está até o deploy do frontend novo.
--    ATENÇÃO: user_metadata era editável pelo usuário — revise a auditoria no fim.
update auth.users
set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || jsonb_build_object(
  'telas',
  case
    when jsonb_typeof(raw_user_meta_data -> 'telas') = 'array'
     and jsonb_array_length(raw_user_meta_data -> 'telas') > 0
      then raw_user_meta_data -> 'telas'
    -- Perfis legados (anteriores às telas granulares)
    when raw_user_meta_data ->> 'perfil' = 'ADMIN' then '["usuarios"]'::jsonb
    when raw_user_meta_data ->> 'perfil' = 'Expedicao' then '["dashboard-geral","lista-geral","kanban","kanban-edit"]'::jsonb
    when raw_user_meta_data ->> 'perfil' = 'Alinare' then '["dashboard-alinare","formulario-alinare","lista-alinare"]'::jsonb
    when raw_user_meta_data ->> 'perfil' = 'Novitah' then '["dashboard-novitah","formulario-novitah","lista-novitah"]'::jsonb
    else '[]'::jsonb
  end
)
where not (coalesce(raw_app_meta_data, '{}'::jsonb) ? 'telas');

-- 2. Permissões do usuário logado, lidas de auth.users (não do token)
create or replace function public.current_telas() returns text[]
language sql stable security definer
set search_path = ''
as $$
  select coalesce(
    (
      select array(
        select jsonb_array_elements_text(
          case
            when jsonb_typeof(u.raw_app_meta_data -> 'telas') = 'array' then u.raw_app_meta_data -> 'telas'
            else '[]'::jsonb
          end
        )
      )
      from auth.users u
      where u.id = auth.uid()
    ),
    '{}'::text[]
  );
$$;

create or replace function public.current_perfil_legacy() returns text
language sql stable security definer
set search_path = ''
as $$
  select coalesce((select u.raw_app_meta_data ->> 'perfil' from auth.users u where u.id = auth.uid()), '');
$$;

create or replace function public.is_admin() returns boolean
language sql stable security definer
set search_path = ''
as $$
  select ('usuarios' = any (public.current_telas())) or public.current_perfil_legacy() = 'ADMIN';
$$;

-- Leitura: empresas cujas reversas o usuário vê.
-- Telas gerais (e as de NC, que abrangem todas as empresas) liberam as duas.
create or replace function public.empresas_permitidas() returns text[]
language sql stable security definer
set search_path = ''
as $$
  select case
    when public.is_admin()
      or public.current_telas() && array['dashboard-geral', 'lista-geral', 'status-geral', 'kanban', 'kanban-edit', 'nc', 'nc-edit']::text[]
      then array['Alinare', 'Novitah']::text[]
    else array_remove(array[
      case when public.current_telas() && array['dashboard-alinare', 'formulario-alinare', 'lista-alinare', 'status-alinare']::text[] then 'Alinare' end,
      case when public.current_telas() && array['dashboard-novitah', 'formulario-novitah', 'lista-novitah', 'status-novitah']::text[] then 'Novitah' end
    ]::text[], null)
  end;
$$;

-- Cadastro: empresas em que o usuário abre o formulário de reversa
-- (formulário da empresa, ou 'nc-edit' gerando a reversa a partir da NC).
create or replace function public.empresas_formulario() returns text[]
language sql stable security definer
set search_path = ''
as $$
  select case
    when public.is_admin() or 'nc-edit' = any (public.current_telas())
      then array['Alinare', 'Novitah']::text[]
    else array_remove(array[
      case when 'formulario-alinare' = any (public.current_telas()) then 'Alinare' end,
      case when 'formulario-novitah' = any (public.current_telas()) then 'Novitah' end
    ]::text[], null)
  end;
$$;

-- Movimentação: empresas em que o usuário altera reversas (etapa, rastreio,
-- anotações, etiqueta). Só telas operacionais contam — consultar NC não dá escrita.
create or replace function public.empresas_operaveis() returns text[]
language sql stable security definer
set search_path = ''
as $$
  select case
    when public.is_admin()
      or public.current_telas() && array['lista-geral', 'status-geral', 'kanban', 'kanban-edit']::text[]
      then array['Alinare', 'Novitah']::text[]
    else array_remove(array[
      case when public.current_telas() && array['lista-alinare', 'status-alinare']::text[] then 'Alinare' end,
      case when public.current_telas() && array['lista-novitah', 'status-novitah']::text[] then 'Novitah' end
    ]::text[], null)
  end;
$$;

-- 3. Policies de solicitacoes_reverso (subconsulta: a função roda uma vez por consulta, não por linha)
drop policy if exists "select_solicitacoes_por_escopo" on public.solicitacoes_reverso;
create policy "select_solicitacoes_por_escopo" on public.solicitacoes_reverso
  for select to authenticated
  using (empresa in (select unnest(public.empresas_permitidas())));

drop policy if exists "insert_solicitacoes_por_escopo" on public.solicitacoes_reverso;
create policy "insert_solicitacoes_por_escopo" on public.solicitacoes_reverso
  for insert to authenticated
  with check (empresa in (select unnest(public.empresas_formulario())));

drop policy if exists "update_solicitacoes_admins" on public.solicitacoes_reverso;
create policy "update_solicitacoes_admins" on public.solicitacoes_reverso
  for update to authenticated
  using (empresa in (select unnest(public.empresas_operaveis())))
  with check (empresa in (select unnest(public.empresas_operaveis())));

drop policy if exists "delete_solicitacoes_admin" on public.solicitacoes_reverso;
create policy "delete_solicitacoes_admin" on public.solicitacoes_reverso
  for delete to authenticated
  using ((select public.is_admin()));

-- O escopo de uma única empresa foi substituído pelas funções acima.
drop function if exists public.current_empresa_scope();

-- 4. Auditoria: confira quem ficou com cada tela antes de seguir.
--    Atenção especial a 'usuarios' (admin) e a contas desconhecidas: como
--    user_metadata era editável, alguém pode ter se dado telas.
--    Para corrigir: tela Usuários (depois do deploy) ou
--    update auth.users set raw_app_meta_data = raw_app_meta_data || '{"telas": [...]}' where email = '...';
select
  u.email,
  u.raw_app_meta_data -> 'telas' as telas_app_metadata,
  u.raw_user_meta_data -> 'telas' as telas_user_metadata_antigas,
  u.raw_user_meta_data ->> 'perfil' as perfil_antigo,
  u.last_sign_in_at
from auth.users u
order by (u.raw_app_meta_data -> 'telas') ? 'usuarios' desc, u.email;

-- ============================================================
-- SOURCE: supabase/migrations/20261020130100_nao_conformidades.sql
-- ============================================================
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

-- ============================================================
-- SOURCE: supabase/migrations/20261020130200_etiqueta_reversa.sql
-- ============================================================
-- ============================================================
-- Etiqueta de postagem dos Correios (PDF) vinculada à reversa
-- ------------------------------------------------------------
-- O PDF fica no bucket privado "etiquetas", no caminho
-- <id da solicitação>/<arquivo>.pdf. Baixa quem enxerga a reversa
-- (empresas_permitidas); anexa/troca/remove quem movimenta reversas daquela
-- empresa (empresas_operaveis).
--
-- Requer: 20261020130000_permissoes_app_metadata.sql
-- Idempotente: pode ser executada mais de uma vez.
-- ============================================================

alter table public.solicitacoes_reverso
  add column if not exists etiqueta_path text,
  add column if not exists etiqueta_nome text,
  add column if not exists etiqueta_enviada_em timestamptz;

comment on column public.solicitacoes_reverso.etiqueta_path is 'Caminho do PDF da etiqueta no bucket "etiquetas".';

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('etiquetas', 'etiquetas', false, 5242880, array['application/pdf'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- O primeiro segmento do caminho é o id da reversa.
create or replace function public.pode_acessar_etiqueta(p_objeto text) returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.solicitacoes_reverso r
    where r.id::text = split_part(p_objeto, '/', 1)
      and r.empresa = any (public.empresas_permitidas())
  );
$$;

create or replace function public.pode_operar_etiqueta(p_objeto text) returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.solicitacoes_reverso r
    where r.id::text = split_part(p_objeto, '/', 1)
      and r.empresa = any (public.empresas_operaveis())
  );
$$;

drop policy if exists "etiquetas_select" on storage.objects;
create policy "etiquetas_select" on storage.objects
  for select to authenticated
  using (bucket_id = 'etiquetas' and public.pode_acessar_etiqueta(name));

drop policy if exists "etiquetas_insert" on storage.objects;
create policy "etiquetas_insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'etiquetas' and public.pode_operar_etiqueta(name));

drop policy if exists "etiquetas_update" on storage.objects;
create policy "etiquetas_update" on storage.objects
  for update to authenticated
  using (bucket_id = 'etiquetas' and public.pode_operar_etiqueta(name))
  with check (bucket_id = 'etiquetas' and public.pode_operar_etiqueta(name));

drop policy if exists "etiquetas_delete" on storage.objects;
create policy "etiquetas_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'etiquetas' and public.pode_operar_etiqueta(name));

-- ============================================================
-- SOURCE: supabase/migrations/20261021120000_reversa_nc_opcional.sql
-- ============================================================
-- Permite criar novas reversas sem uma não conformidade vinculada.
-- Uma NC selecionada continua validada pelo trigger reversa_vincular_nc.
-- Seguro para reaplicação: só marca como legado registros anteriores ao rollout.

update public.solicitacoes_reverso
set legado = true
where nc_id is null
  and not legado
  and created_at < timestamptz '2026-10-21 12:00:00+00';

alter table public.solicitacoes_reverso alter column nc_id drop not null;

alter table public.solicitacoes_reverso
  drop constraint if exists solicitacoes_reverso_origem_nc_check;

comment on column public.solicitacoes_reverso.nc_id is
  'NC de origem opcional. Quando informada, deve ser da mesma empresa e estar aberta.';

comment on column public.solicitacoes_reverso.legado is
  'Reversa criada antes da liberação de novos registros sem NC vinculada.';

-- ============================================================
-- SOURCE: supabase/migrations/20261021130000_setores_fluxo_reverso.sql
-- ============================================================
-- Perfis operacionais e fluxo de aprovação, etiqueta e check-in dos Correios.
-- Idempotente; requer as migrations de app_metadata, etiqueta e NC opcionais.

begin;

create or replace function public.is_admin() returns boolean
language sql stable security definer
set search_path = ''
as $$
  select
    coalesce((select u.raw_app_meta_data ->> 'perfil_acesso' = 'mestre' from auth.users u where u.id = auth.uid()), false)
    or 'usuarios' = any (public.current_telas())
    or public.current_perfil_legacy() = 'ADMIN';
$$;

create or replace function public.current_empresas_acesso() returns text[]
language sql stable security definer
set search_path = ''
as $$
  select coalesce(array(
    select distinct e.value
    from auth.users u
    cross join lateral jsonb_array_elements_text(
      case
        when jsonb_typeof(u.raw_app_meta_data -> 'empresas_acesso') = 'array'
          then u.raw_app_meta_data -> 'empresas_acesso'
        else '[]'::jsonb
      end
    ) as e(value)
    where u.id = auth.uid()
      and e.value in ('Alinare', 'Novitah')
  ), '{}'::text[]);
$$;

create or replace function public.empresas_permitidas() returns text[]
language sql stable security definer
set search_path = ''
as $$
  select case
    when public.is_admin()
      or public.current_telas() && array['dashboard-geral', 'lista-geral', 'status-geral', 'kanban', 'kanban-edit', 'nc', 'nc-edit']::text[]
      then array['Alinare', 'Novitah']::text[]
    else array(
      select distinct e
      from unnest(
        array_remove(array[
          case when public.current_telas() && array['dashboard-alinare', 'formulario-alinare', 'lista-alinare', 'status-alinare']::text[] then 'Alinare' end,
          case when public.current_telas() && array['dashboard-novitah', 'formulario-novitah', 'lista-novitah', 'status-novitah']::text[] then 'Novitah' end
        ]::text[], null)
        || case
          when public.current_telas() && array['aprovar-reversa', 'emitir-etiqueta', 'confirmar-checkin']::text[]
            then public.current_empresas_acesso()
          else '{}'::text[]
        end
      ) as escopo(e)
      where e in ('Alinare', 'Novitah')
    )
  end;
$$;

create or replace function public.empresas_formulario() returns text[]
language sql stable security definer
set search_path = ''
as $$
  select case
    when public.is_admin() or 'nc-edit' = any (public.current_telas())
      then array['Alinare', 'Novitah']::text[]
    else array_remove(array[
      case when 'formulario-alinare' = any (public.current_telas()) then 'Alinare' end,
      case when 'formulario-novitah' = any (public.current_telas()) then 'Novitah' end
    ]::text[], null)
  end;
$$;

create or replace function public.empresas_legacy_operaveis() returns text[]
language sql stable security definer
set search_path = ''
as $$
  select case
    when public.is_admin()
      or public.current_perfil_legacy() = 'Expedicao'
      or public.current_telas() && array['lista-geral', 'status-geral', 'kanban', 'kanban-edit']::text[]
      then array['Alinare', 'Novitah']::text[]
    else array_remove(array[
      case when public.current_telas() && array['lista-alinare', 'status-alinare']::text[] then 'Alinare' end,
      case when public.current_telas() && array['lista-novitah', 'status-novitah']::text[] then 'Novitah' end
    ]::text[], null)
  end;
$$;

create or replace function public.empresas_aprovaveis() returns text[]
language sql stable security definer
set search_path = ''
as $$
  select case when public.is_admin() then array['Alinare', 'Novitah']::text[]
    when 'aprovar-reversa' = any (public.current_telas()) then public.current_empresas_acesso()
    else '{}'::text[] end;
$$;

create or replace function public.empresas_etiquetaveis() returns text[]
language sql stable security definer
set search_path = ''
as $$
  select case when public.is_admin() then array['Alinare', 'Novitah']::text[]
    when 'emitir-etiqueta' = any (public.current_telas()) then public.current_empresas_acesso()
    else '{}'::text[] end;
$$;

create or replace function public.empresas_checkin() returns text[]
language sql stable security definer
set search_path = ''
as $$
  select case when public.is_admin() then array['Alinare', 'Novitah']::text[]
    when 'confirmar-checkin' = any (public.current_telas()) then public.current_empresas_acesso()
    else '{}'::text[] end;
$$;

create or replace function public.empresas_operaveis() returns text[]
language sql stable security definer
set search_path = ''
as $$
  select array(
    select distinct e
    from unnest(
      public.empresas_legacy_operaveis()
      || public.empresas_aprovaveis()
      || public.empresas_etiquetaveis()
      || public.empresas_checkin()
    ) as escopo(e)
    where e in ('Alinare', 'Novitah')
  );
$$;

create or replace function public.pode_anexar_etiqueta(p_objeto text) returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.solicitacoes_reverso r
    where r.id::text = split_part(p_objeto, '/', 1)
      and (
        r.empresa = any (public.empresas_legacy_operaveis())
        or (
          r.status = 'pendente'
          and r.etiqueta_path is null
          and r.empresa = any (public.empresas_etiquetaveis())
        )
      )
  );
$$;

-- Mantém operações de substituição/remoção restritas aos perfis operacionais antigos e mestre.
create or replace function public.pode_operar_etiqueta(p_objeto text) returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.solicitacoes_reverso r
    where r.id::text = split_part(p_objeto, '/', 1)
      and r.empresa = any (public.empresas_legacy_operaveis())
  );
$$;

alter table public.solicitacoes_reverso
  drop constraint if exists solicitacoes_reverso_status_check;
alter table public.solicitacoes_reverso
  add constraint solicitacoes_reverso_status_check
  check (status in ('aguardando_aprovacao', 'reprovado', 'pendente', 'etiqueta_gerada', 'postado', 'em_transito', 'concluido'));
alter table public.solicitacoes_reverso
  alter column status set default 'aguardando_aprovacao';

drop policy if exists "select_solicitacoes_por_escopo" on public.solicitacoes_reverso;
create policy "select_solicitacoes_por_escopo" on public.solicitacoes_reverso
  for select to authenticated
  using (empresa = any (public.empresas_permitidas()));

drop policy if exists "insert_solicitacoes_por_escopo" on public.solicitacoes_reverso;
create policy "insert_solicitacoes_por_escopo" on public.solicitacoes_reverso
  for insert to authenticated
  with check (empresa = any (public.empresas_formulario()));

drop policy if exists "update_solicitacoes_admins" on public.solicitacoes_reverso;
create policy "update_solicitacoes_admins" on public.solicitacoes_reverso
  for update to authenticated
  using (empresa = any (public.empresas_operaveis()))
  with check (empresa = any (public.empresas_operaveis()));

create or replace function public.validar_etapa_por_setor() returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  v_telas text[];
  v_legado boolean;
begin
  -- Operações de serviço (rastreio/automação) e setor mestre.
  if auth.uid() is null or public.is_admin() then
    return new;
  end if;

  v_telas := public.current_telas();
  v_legado := public.empresas_legacy_operaveis() @> array[new.empresa]::text[];

  if tg_op = 'INSERT' then
    -- Todo chamado feito pela equipe entra na aprovação, mesmo que o cliente tente enviar outro status.
    new.status := 'aguardando_aprovacao';
    return new;
  end if;

  if v_legado then
    return new;
  end if;

  if 'aprovar-reversa' = any (v_telas)
    and old.status = 'aguardando_aprovacao'
    and new.status in ('pendente', 'reprovado')
    and (to_jsonb(new) - array['status']::text[]) = (to_jsonb(old) - array['status']::text[])
  then
    return new;
  end if;

  if 'emitir-etiqueta' = any (v_telas)
    and old.status = 'pendente'
    and old.etiqueta_path is null
    and new.status = 'etiqueta_gerada'
    and new.etiqueta_path is not null
    and (to_jsonb(new) - array['status', 'etiqueta_path', 'etiqueta_nome', 'etiqueta_enviada_em', 'etiqueta_gerada_em']::text[])
        = (to_jsonb(old) - array['status', 'etiqueta_path', 'etiqueta_nome', 'etiqueta_enviada_em', 'etiqueta_gerada_em']::text[])
  then
    return new;
  end if;

  if 'confirmar-checkin' = any (v_telas)
    and old.status = 'etiqueta_gerada'
    and new.status = 'postado'
    and new.postado_em is not null
    and (to_jsonb(new) - array['status', 'postado_em']::text[])
        = (to_jsonb(old) - array['status', 'postado_em']::text[])
  then
    return new;
  end if;

  raise exception 'Seu setor não pode executar esta alteração nesta etapa.' using errcode = '42501';
end;
$$;

drop trigger if exists trg_validar_etapa_por_setor on public.solicitacoes_reverso;
create trigger trg_validar_etapa_por_setor
  before insert or update on public.solicitacoes_reverso
  for each row execute function public.validar_etapa_por_setor();

drop policy if exists "etiquetas_insert" on storage.objects;
create policy "etiquetas_insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'etiquetas' and public.pode_anexar_etiqueta(name));

drop policy if exists "etiquetas_update" on storage.objects;
create policy "etiquetas_update" on storage.objects
  for update to authenticated
  using (bucket_id = 'etiquetas' and public.pode_operar_etiqueta(name))
  with check (bucket_id = 'etiquetas' and public.pode_operar_etiqueta(name));

drop policy if exists "etiquetas_delete" on storage.objects;
create policy "etiquetas_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'etiquetas' and public.pode_operar_etiqueta(name));

grant execute on function public.current_empresas_acesso(), public.empresas_aprovaveis(), public.empresas_etiquetaveis(), public.empresas_checkin(), public.pode_anexar_etiqueta(text) to authenticated;

commit;

-- ============================================================
-- SOURCE: supabase/migrations/20261021140000_alinhar_listas_nc.sql
-- ============================================================
-- Alinha as opções de NC à aba LISTAS_NC da planilha aprovada.
-- Também normaliza textos inseridos com mojibake e mantém os vínculos dos registros.
-- Para banco já configurado, este conteúdo pode ser colado no SQL Editor do Supabase.
begin;

-- Algumas instalações anteriores criaram este CHECK com "Nao" sem acento.
-- Removemos temporariamente para gravar e normalizar o valor oficial "Não".
alter table public.nc_origens
  drop constraint if exists nc_origens_evitavel_check;

-- Decodifica até duas camadas comuns de UTF-8 lido como Windows-1252.
create or replace function public.nc_corrigir_mojibake_migracao(p_texto text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_atual text := p_texto;
  v_proximo text;
  v_tentativa integer;
begin
  if v_atual is null then return null; end if;

  for v_tentativa in 1..2 loop
    if position('Ã' in v_atual) = 0
      and position('Â' in v_atual) = 0
      and position('â' in v_atual) = 0 then
      exit;
    end if;

    begin
      v_proximo := convert_from(convert_to(v_atual, 'WIN1252'), 'UTF8');
    exception when others then
      exit;
    end;

    exit when v_proximo = v_atual;
    v_atual := v_proximo;
  end loop;

  return v_atual;
end;
$$;

-- Garante as 28 origens e os valores das outras listas. Itens desativados
-- continuam desativados; novos valores começam ativos pelo padrão da tabela.
with nc_origens_oficiais(nome, area, evitavel, ordem) as (
  values
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
)
insert into public.nc_origens (nome, area, evitavel, ordem)
select nome, area, evitavel, ordem from nc_origens_oficiais where true
on conflict (nome) do update
set area = excluded.area,
    evitavel = excluded.evitavel,
    ordem = excluded.ordem;

with nc_listas_oficiais(lista, valor, ordem) as (
  values
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
)
insert into public.nc_listas (lista, valor, ordem)
select lista, valor, ordem from nc_listas_oficiais where true
on conflict (lista, valor) do update
set ordem = excluded.ordem;

-- Corrige metadados de área/classificação que também possam estar corrompidos.
do $$
declare
  r record;
  v_area text;
  v_evitavel text;
begin
  for r in select nome, area, evitavel from public.nc_origens loop
    v_area := public.nc_corrigir_mojibake_migracao(r.area);
    v_evitavel := public.nc_corrigir_mojibake_migracao(r.evitavel);
    v_evitavel := case lower(btrim(v_evitavel))
      when 'sim' then 'Sim'
      when 'nao' then 'Não'
      when 'não' then 'Não'
      when 'a avaliar' then 'A avaliar'
      else v_evitavel
    end;
    if v_evitavel not in ('Sim', 'Não', 'A avaliar') then
      raise exception 'Classificação de evitável não reconhecida na origem "%": "%".', r.nome, r.evitavel;
    end if;
    if v_area is distinct from r.area or v_evitavel is distinct from r.evitavel then
      update public.nc_origens
      set area = v_area, evitavel = v_evitavel
      where nome = r.nome;
    end if;
  end loop;
end;
$$;

-- Corrige nomes corrompidos, variações antigas das quatro primeiras linhas e
-- atualiza os vínculos das NCs existentes (a FK também usa ON UPDATE CASCADE).
do $$
declare
  r record;
  v_nome text;
begin
  for r in select nome from public.nc_origens loop
    v_nome := public.nc_corrigir_mojibake_migracao(r.nome);
    v_nome := case v_nome
      when 'Erro de expedição –endereço incorreto' then 'Erro expedição – endereço incorreto'
      when 'Erro de expedição – endereço incorreto' then 'Erro expedição – endereço incorreto'
      when 'Erro expedição –endereço incorreto' then 'Erro expedição – endereço incorreto'
      when 'Erro de expedição -endereço incorreto' then 'Erro expedição – endereço incorreto'
      when 'Erro expedição - endereço incorreto' then 'Erro expedição – endereço incorreto'
      when 'Erro de expedição –mercadoria trocada ou embalada junto' then 'Erro expedição – mercadoria trocada ou embalada junto'
      when 'Erro de expedição – mercadoria trocada ou embalada junto' then 'Erro expedição – mercadoria trocada ou embalada junto'
      when 'Erro expedição –mercadoria trocada ou embalada junto' then 'Erro expedição – mercadoria trocada ou embalada junto'
      when 'Erro de expedição - mercadoria trocada ou embalada junto' then 'Erro expedição – mercadoria trocada ou embalada junto'
      when 'Erro de expedição –etiqueta ou pré-postagem' then 'Erro expedição – etiqueta ou pré-postagem'
      when 'Erro de expedição – etiqueta ou pré-postagem' then 'Erro expedição – etiqueta ou pré-postagem'
      when 'Erro expedição –etiqueta ou pré-postagem' then 'Erro expedição – etiqueta ou pré-postagem'
      when 'Erro da vendedora –endereço incorreto' then 'Erro vendedora – endereço incorreto'
      when 'Erro da vendedora – endereço incorreto' then 'Erro vendedora – endereço incorreto'
      when 'Erro vendedora –endereço incorreto' then 'Erro vendedora – endereço incorreto'
      else v_nome
    end;

    if v_nome is distinct from r.nome then
      if exists (select 1 from public.nc_origens where nome = v_nome) then
        update public.nao_conformidades set origem = v_nome where origem = r.nome;
        delete from public.nc_origens where nome = r.nome;
      else
        update public.nc_origens set nome = v_nome where nome = r.nome;
      end if;
    end if;
  end loop;
end;
$$;

-- Corrige os valores das listas e os registros que já os utilizam.
do $$
declare
  r record;
  v_valor text;
begin
  for r in select lista, valor from public.nc_listas loop
    v_valor := public.nc_corrigir_mojibake_migracao(r.valor);
    if v_valor is distinct from r.valor then
      if exists (select 1 from public.nc_listas where lista = r.lista and valor = v_valor) then
        case r.lista
          when 'tipo_saida' then update public.nao_conformidades set tipo_saida = v_valor where tipo_saida = r.valor;
          when 'resolucao' then update public.nao_conformidades set resolucao = v_valor where resolucao = r.valor;
          when 'empresa' then update public.nao_conformidades set empresa = v_valor where empresa = r.valor;
          when 'como_identificada' then update public.nao_conformidades set como_identificada = v_valor where como_identificada = r.valor;
          when 'reembolso' then update public.nao_conformidades set reembolso_correios = v_valor where reembolso_correios = r.valor;
          else null;
        end case;
        delete from public.nc_listas where lista = r.lista and valor = r.valor;
      else
        update public.nc_listas set valor = v_valor where lista = r.lista and valor = r.valor;
      end if;
    end if;
  end loop;
end;
$$;

alter table public.nc_origens
  add constraint nc_origens_evitavel_check check (evitavel in ('Sim', 'Não', 'A avaliar'));

drop function public.nc_corrigir_mojibake_migracao(text);
commit;

-- ============================================================
-- SOURCE: supabase/migrations/20261022100000_autorizador_registrado_na_aprovacao.sql
-- ============================================================
ALTER TABLE public.solicitacoes_reverso
  ALTER COLUMN autorizacao DROP NOT NULL;

-- Na etapa de aprovação, registre quem decidiu. Os demais campos do pedido
-- continuam imutáveis para esse perfil durante a decisão.
create or replace function public.validar_etapa_por_setor() returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  v_telas text[];
  v_legado boolean;
  v_nome_aprovador text;
begin
  -- Operações de serviço (rastreio/automações) e setor mestre.
  if auth.uid() is null or public.is_admin() then
    return new;
  end if;

  v_telas := public.current_telas();
  v_legado := public.empresas_legacy_operaveis() @> array[new.empresa]::text[];

  if tg_op = 'INSERT' then
    new.status := 'aguardando_aprovacao';
    new.autorizacao := null;
    return new;
  end if;

  if v_legado then
    return new;
  end if;

  if 'aprovar-reversa' = any (v_telas)
    and old.status = 'aguardando_aprovacao'
    and new.status in ('pendente', 'reprovado')
    and (to_jsonb(new) - array['status', 'autorizacao']::text[]) = (to_jsonb(old) - array['status', 'autorizacao']::text[])
  then
    if new.status = 'pendente' then
      select coalesce(u.raw_user_meta_data ->> 'nome', u.email)
        into v_nome_aprovador
        from auth.users u
        where u.id = auth.uid();
      if new.autorizacao is distinct from v_nome_aprovador then
        raise exception 'O nome do aprovador deve corresponder ao usuário autenticado.' using errcode = '42501';
      end if;
    elsif new.autorizacao is distinct from old.autorizacao then
      raise exception 'A rejeição não pode alterar o autorizador.' using errcode = '42501';
    end if;
    return new;
  end if;

  if 'emitir-etiqueta' = any (v_telas)
    and old.status = 'pendente'
    and old.etiqueta_path is null
    and new.status = 'etiqueta_gerada'
    and new.etiqueta_path is not null
    and (to_jsonb(new) - array['status', 'etiqueta_path', 'etiqueta_nome', 'etiqueta_enviada_em', 'etiqueta_gerada_em']::text[])
        = (to_jsonb(old) - array['status', 'etiqueta_path', 'etiqueta_nome', 'etiqueta_enviada_em', 'etiqueta_gerada_em']::text[])
  then
    return new;
  end if;

  if 'confirmar-checkin' = any (v_telas)
    and old.status = 'etiqueta_gerada'
    and new.status = 'postado'
    and new.postado_em is not null
    and (to_jsonb(new) - array['status', 'postado_em']::text[])
        = (to_jsonb(old) - array['status', 'postado_em']::text[])
  then
    return new;
  end if;

  raise exception 'Seu setor não pode executar esta alteração nesta etapa.' using errcode = '42501';
end;
$$;

-- ============================================================
-- SOURCE: supabase/migrations/20261023100000_aprovacao_reversas.sql
-- ============================================================
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

-- ============================================================
-- SOURCE: supabase/migrations/20261023110000_emissoes_reversa.sql
-- ============================================================
-- ============================================================
-- Emissões da reversa (autorização de postagem dos Correios)
-- ------------------------------------------------------------
-- Modelo: NC → solicitação de reversa → emissões da solicitação.
-- Cada emissão é uma autorização de postagem que a Expedição emitiu nos
-- Correios: código da autorização e código de rastreio do objeto (conceitos
-- distintos), PDF, datas de emissão e validade quando conhecidas e, cada um
-- registrado à parte, o PDF anexado, o envio informado à vendedora/cliente e
-- a postagem confirmada. Reemitir cria a emissão seguinte na MESMA
-- solicitação; a anterior fica "substituída no sistema" — o que não afirma
-- cancelamento nos Correios — e nada dela é apagado (PDF, códigos, eventos,
-- rastreio).
--
-- Compatibilidade durante a integração: etiqueta_path, etiqueta_nome,
-- etiqueta_enviada_em e codigo_rastreio de solicitacoes_reverso viram espelho
-- da emissão vigente, mantido pelo banco. Escritas antigas nessas colunas
-- viram emissões (rotina de transição) sem duplicar, e a Edge Function
-- correios-rastreio continua lendo solicitacoes_reverso.codigo_rastreio.
--
-- Aprovação: toda operação de emissão é logística e exige a reversa aprovada
-- ou legado (public.emissao_liberada_pela_aprovacao, ligada à regra da
-- migration de aprovação). Aguardando aprovação ou rejeitada não registra nem
-- altera emissões — nem pela API, nem enviando PDF ao storage.
--
-- Requer: 20261020130000_permissoes_app_metadata.sql,
--         20261020130100_nao_conformidades.sql,
--         20261020130200_etiqueta_reversa.sql e
--         20261023100000_aprovacao_reversas.sql (antes 20261020135000).
-- Idempotente: pode ser executada mais de uma vez.
-- ============================================================

-- A Edge Function grava a lista de eventos do objeto; o esquema base não a tinha
alter table public.rastreamento_correios add column if not exists eventos jsonb;

-- 1. Emissões
create table if not exists public.reversa_emissoes (
  id uuid primary key default gen_random_uuid(),
  solicitacao_id uuid not null references public.solicitacoes_reverso (id) on delete cascade,
  -- 1, 2, 3… dentro da solicitação; o banco atribui com a solicitação travada
  sequencia integer not null check (sequencia > 0),
  -- sistema = registrada na tela; migracao_legado = criada por esta migration a
  -- partir das colunas antigas; transicao_legado = escrita antiga nas colunas espelho
  origem text not null default 'sistema' check (origem in ('sistema', 'migracao_legado', 'transicao_legado')),

  -- Registro no sistema: autor e momento vêm do servidor
  registrado_em timestamptz not null default now(),
  registrado_por uuid,
  registrado_por_nome text not null default '',

  -- Autorização de postagem × objeto: conceitos distintos, ambos opcionais
  codigo_autorizacao text check (codigo_autorizacao is null or char_length(codigo_autorizacao) between 1 and 60),
  codigo_rastreio text check (codigo_rastreio is null or char_length(codigo_rastreio) between 1 and 40),
  -- Datas da autorização; null = não informada (nenhum prazo é presumido)
  emitida_em date,
  valida_ate date,

  -- PDF no bucket privado "etiquetas" (<id da solicitação>/<arquivo>.pdf)
  pdf_path text,
  pdf_nome text,
  pdf_tamanho bigint,
  pdf_tipo text,
  pdf_sha256 text check (pdf_sha256 is null or pdf_sha256 ~ '^[0-9a-f]{64}$'),
  pdf_anexado_em timestamptz,
  pdf_anexado_por uuid,
  pdf_anexado_por_nome text,

  -- Reemissão: emissão anterior e motivo
  emissao_anterior_id uuid references public.reversa_emissoes (id),
  motivo_reemissao text check (motivo_reemissao is null or motivo_reemissao in (
    'vencida_sem_uso', 'cliente_nao_recebeu', 'dados_incorretos', 'pdf_incorreto', 'outro', 'nao_informado'
  )),
  motivo_reemissao_detalhe text,

  -- Substituição local: a emissão deixou de ser a vigente NO SISTEMA.
  -- Não significa cancelamento nos Correios: a autorização ainda pode ser usada.
  substituida_em timestamptz,
  substituida_por_id uuid references public.reversa_emissoes (id) deferrable initially deferred,

  -- Envio informado à vendedora/cliente (anexar o PDF não comprova envio).
  -- Guarda o primeiro envio; os seguintes ficam nos eventos.
  envio_informado_em timestamptz,
  envio_informado_para text check (envio_informado_para is null or envio_informado_para in ('vendedora', 'cliente')),
  envio_informado_por uuid,
  envio_informado_por_nome text,
  envio_observacao text,

  -- Postagem confirmada = utilização da autorização; a expiração não a desfaz.
  -- Fonte: manual (tela), legado (etapa da reversa, só na migração) ou
  -- rastreio (reservado para a frente de rastreamento gravar o evento).
  postagem_confirmada_em timestamptz,
  postagem_em date,
  postagem_fonte text check (postagem_fonte is null or postagem_fonte in ('manual', 'legado', 'rastreio')),
  postagem_confirmada_por uuid,
  postagem_confirmada_por_nome text,
  postagem_observacao text,

  observacao text,

  constraint reversa_emissoes_sequencia_unica unique (solicitacao_id, sequencia),
  constraint reversa_emissoes_pdf_unico unique (pdf_path),
  constraint reversa_emissoes_validade_check check (valida_ate is null or emitida_em is null or valida_ate >= emitida_em),
  constraint reversa_emissoes_substituicao_check check ((substituida_em is null) = (substituida_por_id is null)),
  constraint reversa_emissoes_envio_check check ((envio_informado_em is null) = (envio_informado_para is null)),
  constraint reversa_emissoes_postagem_check check ((postagem_confirmada_em is null) = (postagem_fonte is null)),
  constraint reversa_emissoes_motivo_check check (origem <> 'sistema' or emissao_anterior_id is null or motivo_reemissao is not null),
  constraint reversa_emissoes_motivo_outro_check check (
    motivo_reemissao is distinct from 'outro' or nullif(btrim(motivo_reemissao_detalhe), '') is not null
  )
);

comment on table public.reversa_emissoes is 'Emissões (autorizações de postagem) de cada solicitação de reversa. Reemissão = nova linha; a anterior fica substituída no sistema, sem apagar nada.';
comment on column public.reversa_emissoes.codigo_autorizacao is 'Código da autorização de postagem (o que a cliente apresenta na agência). Diferente do código de rastreio.';
comment on column public.reversa_emissoes.codigo_rastreio is 'Código do objeto nos Correios (AA123456789BR). Liga a emissão a rastreamento_correios.';
comment on column public.reversa_emissoes.valida_ate is 'Último dia de validade informado. Null = validade desconhecida (nenhum prazo padrão é presumido).';
comment on column public.reversa_emissoes.substituida_em is 'Quando outra emissão passou a ser a vigente no sistema. Não indica cancelamento nos Correios.';
comment on column public.reversa_emissoes.postagem_confirmada_em is 'Quando a postagem (utilização da autorização) foi confirmada. A expiração não invalida a utilização.';

-- Uma única emissão vigente (não substituída) por solicitação
create unique index if not exists idx_re_vigente on public.reversa_emissoes (solicitacao_id) where substituida_em is null;
create index if not exists idx_re_codigo_rastreio on public.reversa_emissoes (codigo_rastreio) where codigo_rastreio is not null;
create index if not exists idx_re_codigo_autorizacao on public.reversa_emissoes (codigo_autorizacao) where codigo_autorizacao is not null;

-- 2. Eventos de cada emissão (somente inclusão, gravados pelas funções abaixo)
create table if not exists public.reversa_emissao_eventos (
  id uuid primary key default gen_random_uuid(),
  emissao_id uuid not null references public.reversa_emissoes (id) on delete cascade,
  solicitacao_id uuid not null references public.solicitacoes_reverso (id) on delete cascade,
  created_at timestamptz not null default now(),
  user_id uuid,
  user_nome text not null default '',
  tipo text not null check (tipo in (
    'registrada', 'migrada_legado', 'sincronizada_legado', 'pdf_anexado', 'dados_atualizados',
    'substituida', 'envio_informado', 'postagem_confirmada', 'postagem_desfeita'
  )),
  descricao text not null,
  dados jsonb not null default '{}'::jsonb
);

comment on table public.reversa_emissao_eventos is 'Linha do tempo de cada emissão (registro, PDF, códigos, envio, postagem, substituição). Não é alterada nem apagada.';

create index if not exists idx_ree_emissao on public.reversa_emissao_eventos (emissao_id, created_at);
create index if not exists idx_ree_solicitacao on public.reversa_emissao_eventos (solicitacao_id, created_at desc);

-- 3. Funções auxiliares
create or replace function public.emissao_normalizar_codigo(p_codigo text) returns text
language sql immutable
set search_path = ''
as $$
  select nullif(upper(regexp_replace(coalesce(p_codigo, ''), '\s+', '', 'g')), '');
$$;

create or replace function public.emissao_motivo_rotulo(p_motivo text) returns text
language sql immutable
set search_path = ''
as $$
  select case p_motivo
    when 'vencida_sem_uso' then 'autorização venceu sem uso'
    when 'cliente_nao_recebeu' then 'cliente não recebeu ou perdeu a autorização'
    when 'dados_incorretos' then 'dados incorretos na emissão'
    when 'pdf_incorreto' then 'PDF incorreto ou ilegível'
    when 'outro' then 'outro motivo'
    when 'nao_informado' then 'motivo não informado (fluxo anterior)'
    else p_motivo
  end;
$$;

-- O rastreio do objeto já mostrou postagem, trânsito ou entrega (PO, RO, OEC,
-- BDE — mesmo mapeamento da Edge Function). É a prova de uso da autorização.
create or replace function public.rastreio_indica_postagem(p_solicitacao_id uuid, p_codigo text) returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.rastreamento_correios rc
    where rc.codigo_rastreio = p_codigo
      and rc.solicitacao_id = p_solicitacao_id
      and (
        rc.ultimo_evento_codigo in ('PO', 'RO', 'OEC', 'BDE')
        or exists (
          select 1
          from jsonb_array_elements(case when jsonb_typeof(rc.eventos) = 'array' then rc.eventos else '[]'::jsonb end) as x
          where x ->> 'codigo' in ('PO', 'RO', 'OEC', 'BDE')
        )
      )
  );
$$;

-- Registro, PDF, reemissão e substituição são histórico: não mudam depois de
-- gravados. Um código de rastreio pertence a uma única solicitação, e o código
-- de um objeto já postado (prova de uso) não muda, não sai e não é copiado.
create or replace function public.reversa_emissoes_proteger() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.codigo_autorizacao := public.emissao_normalizar_codigo(new.codigo_autorizacao);
  new.codigo_rastreio := public.emissao_normalizar_codigo(new.codigo_rastreio);

  if tg_op = 'UPDATE' and (
       new.id <> old.id
    or new.solicitacao_id <> old.solicitacao_id
    or new.sequencia <> old.sequencia
    or new.origem <> old.origem
    or new.registrado_em <> old.registrado_em
    or new.registrado_por is distinct from old.registrado_por
    or new.registrado_por_nome <> old.registrado_por_nome
    or new.emissao_anterior_id is distinct from old.emissao_anterior_id
    or new.motivo_reemissao is distinct from old.motivo_reemissao
    or new.motivo_reemissao_detalhe is distinct from old.motivo_reemissao_detalhe
    or (old.pdf_path is not null and (
         new.pdf_path is distinct from old.pdf_path
      or new.pdf_nome is distinct from old.pdf_nome
      or new.pdf_tamanho is distinct from old.pdf_tamanho
      or new.pdf_tipo is distinct from old.pdf_tipo
      or new.pdf_sha256 is distinct from old.pdf_sha256
      or new.pdf_anexado_em is distinct from old.pdf_anexado_em
      or new.pdf_anexado_por is distinct from old.pdf_anexado_por
      or new.pdf_anexado_por_nome is distinct from old.pdf_anexado_por_nome))
    or (old.substituida_em is not null and (
         new.substituida_em is distinct from old.substituida_em
      or new.substituida_por_id is distinct from old.substituida_por_id))
  ) then
    raise exception 'A emissão #% é histórico: registro, PDF, reemissão e substituição não podem ser alterados.', old.sequencia
      using errcode = '42501';
  end if;

  if tg_op = 'UPDATE' and old.codigo_rastreio is not null
     and new.codigo_rastreio is distinct from old.codigo_rastreio
     and public.rastreio_indica_postagem(old.solicitacao_id, old.codigo_rastreio) then
    raise exception 'O rastreio do objeto % já mostra postagem: o código da emissão #% não pode ser alterado nem removido.',
      old.codigo_rastreio, old.sequencia
      using errcode = '23514';
  end if;
  if new.codigo_rastreio is not null
     and (tg_op = 'INSERT' or new.codigo_rastreio is distinct from old.codigo_rastreio)
     and public.rastreio_indica_postagem(new.solicitacao_id, new.codigo_rastreio)
     and exists (
       select 1 from public.reversa_emissoes e
       where e.codigo_rastreio = new.codigo_rastreio and e.solicitacao_id = new.solicitacao_id and e.id <> new.id
     ) then
    raise exception 'O objeto % já foi postado com a autorização de outra emissão desta reversa.', new.codigo_rastreio
      using errcode = '23505';
  end if;

  if new.codigo_rastreio is not null
     and (tg_op = 'INSERT' or new.codigo_rastreio is distinct from old.codigo_rastreio) then
    perform pg_advisory_xact_lock(hashtextextended('reversa_emissoes.codigo_rastreio:' || new.codigo_rastreio, 0));
    if exists (
      select 1 from public.reversa_emissoes e
      where e.codigo_rastreio = new.codigo_rastreio and e.solicitacao_id <> new.solicitacao_id
    ) or exists (
      select 1 from public.solicitacoes_reverso r
      where r.codigo_rastreio = new.codigo_rastreio and r.id <> new.solicitacao_id
    ) then
      raise exception 'O código de rastreio % já está vinculado a outra solicitação.', new.codigo_rastreio
        using errcode = '23505';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_reversa_emissoes_proteger on public.reversa_emissoes;
create trigger trg_reversa_emissoes_proteger before insert or update on public.reversa_emissoes
  for each row execute function public.reversa_emissoes_proteger();

create or replace function public.reversa_emissao_eventos_imutavel() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'Eventos de emissão não são alterados.' using errcode = '42501';
end;
$$;

drop trigger if exists trg_reversa_emissao_eventos_imutavel on public.reversa_emissao_eventos;
create trigger trg_reversa_emissao_eventos_imutavel before update on public.reversa_emissao_eventos
  for each row execute function public.reversa_emissao_eventos_imutavel();

-- 4. PONTO CENTRAL DE AUTORIZAÇÃO DAS EMISSÕES
-- Toda escrita em emissões — as funções da seção 7, a rotina de transição e o
-- envio do PDF ao storage — passa por public.pode_operar_emissao(solicitação,
-- operação). Operações: registrar, anexar_pdf, dados, envio, postagem.
-- Ela combina:
--   1) a capacidade da operação: a empresa da reversa está em
--      empresas_operacao_emissao(operação) (emitir-etiqueta ou confirmar-checkin);
--   2) a aprovação: public.emissao_liberada_pela_aprovacao().
-- Espelho no frontend: podeOperarEmissao() em src/lib/perfil.ts.

-- Aprovação (migration 20261020135000): toda operação de emissão é logística
-- e exige a reversa aprovada ou legado (aprovacao_libera_logistica). Aguardando
-- aprovação ou rejeitada não registra nem altera emissões.
create or replace function public.emissao_liberada_pela_aprovacao(p_solicitacao_id uuid, p_operacao text) returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.solicitacoes_reverso r
    where r.id = p_solicitacao_id
      and public.aprovacao_libera_logistica(r.aprovacao_status, r.aprovacao_legada)
  );
$$;

-- Capacidade exigida por operação: emitir (emitir-etiqueta) para registrar, anexar,
-- dados e envio; confirmar postagem (confirmar-checkin) para postagem. Consulta,
-- solicitação e as telas de lista/kanban não operam emissões.
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

create or replace function public.pode_operar_emissao(p_solicitacao_id uuid, p_operacao text) returns boolean
language sql stable security definer
set search_path = ''
as $$
  select p_operacao in ('registrar', 'anexar_pdf', 'dados', 'envio', 'postagem')
    and exists (
      select 1
      from public.solicitacoes_reverso r
      where r.id = p_solicitacao_id
        and r.empresa = any (public.empresas_operacao_emissao(p_operacao))
    )
    and public.emissao_liberada_pela_aprovacao(p_solicitacao_id, p_operacao);
$$;

-- Erro quando não pode. Chamar com a reversa já travada (for update): a
-- aprovação não muda entre a conferência e a gravação.
create or replace function public.exigir_operacao_emissao(p_solicitacao_id uuid, p_operacao text) returns void
language plpgsql stable security definer
set search_path = ''
as $$
declare
  v_situacao text;
begin
  if public.pode_operar_emissao(p_solicitacao_id, p_operacao) then
    return;
  end if;
  -- Opera a empresa, mas a reversa não está liberada: a aprovação é o motivo
  select coalesce(r.aprovacao_status, 'legado') into v_situacao
  from public.solicitacoes_reverso r
  where r.id = p_solicitacao_id
    and r.empresa = any (public.empresas_operacao_emissao(p_operacao))
    and not public.emissao_liberada_pela_aprovacao(r.id, p_operacao);
  if found then
    raise exception 'Emissões só depois da aprovação da reversa (situação: %).', replace(v_situacao, '_', ' ')
      using errcode = '55000';
  end if;
  raise exception 'Sem permissão para esta operação nas emissões desta reversa.' using errcode = '42501';
end;
$$;

-- 5. Funções internas (só chamadas pelas funções desta migration)
create or replace function public.emissao_registrar_evento(
  p_emissao public.reversa_emissoes,
  p_tipo text,
  p_descricao text,
  p_dados jsonb default '{}'::jsonb,
  p_no_historico boolean default false,
  p_autor text default null
) returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  v_nome text := coalesce(p_autor, coalesce(public.usuario_nome(auth.uid()), 'Sistema'));
begin
  insert into public.reversa_emissao_eventos (emissao_id, solicitacao_id, user_id, user_nome, tipo, descricao, dados)
  values (p_emissao.id, p_emissao.solicitacao_id, auth.uid(), v_nome, p_tipo, p_descricao, coalesce(p_dados, '{}'::jsonb));

  -- Linha resumida no histórico da reversa (aba Histórico do detalhe)
  if p_no_historico then
    insert into public.solicitacoes_historico (solicitacao_id, user_nome, acao)
    values (p_emissao.solicitacao_id, v_nome, p_descricao);
  end if;
end;
$$;

-- Colunas antigas = espelho da emissão vigente (Edge Function, listas, exportação).
create or replace function public.emissoes_sincronizar_legado(p_solicitacao_id uuid) returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  v public.reversa_emissoes;
  v_flag text := coalesce(current_setting('emissoes.sincronizando', true), '');
begin
  select * into v
  from public.reversa_emissoes e
  where e.solicitacao_id = p_solicitacao_id and e.substituida_em is null;
  if not found then
    return;
  end if;

  perform set_config('emissoes.sincronizando', 'sim', true);
  update public.solicitacoes_reverso r
     set etiqueta_path = v.pdf_path,
         etiqueta_nome = v.pdf_nome,
         etiqueta_enviada_em = v.pdf_anexado_em,
         codigo_rastreio = v.codigo_rastreio,
         -- a última cidade era do objeto anterior
         ultima_cidade_rastreio = case
           when r.codigo_rastreio is distinct from v.codigo_rastreio then null
           else r.ultima_cidade_rastreio
         end
   where r.id = p_solicitacao_id
     and (r.etiqueta_path is distinct from v.pdf_path
       or r.etiqueta_nome is distinct from v.pdf_nome
       or r.etiqueta_enviada_em is distinct from v.pdf_anexado_em
       or r.codigo_rastreio is distinct from v.codigo_rastreio);
  perform set_config('emissoes.sincronizando', v_flag, true);
end;
$$;

create or replace function public.emissao_avancar_etapa(p_solicitacao_id uuid, p_etapa text) returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  v_status text;
  v_flag text := coalesce(current_setting('emissoes.sincronizando', true), '');
begin
  select r.status into v_status from public.solicitacoes_reverso r where r.id = p_solicitacao_id;

  -- Só as RPCs de emissão chamam esta função (revogada de authenticated); elas já checaram a permissão.
  perform set_config('emissoes.sincronizando', 'sim', true);
  if p_etapa = 'etiqueta_gerada' and v_status = 'pendente' then
    update public.solicitacoes_reverso set status = 'etiqueta_gerada', etiqueta_gerada_em = now() where id = p_solicitacao_id;
  elsif p_etapa = 'postado' and v_status in ('pendente', 'etiqueta_gerada') then
    update public.solicitacoes_reverso set status = 'postado', postado_em = now() where id = p_solicitacao_id;
  else
    perform set_config('emissoes.sincronizando', v_flag, true);
    return;
  end if;
  perform set_config('emissoes.sincronizando', v_flag, true);

  insert into public.solicitacoes_historico (solicitacao_id, user_nome, acao)
  values (
    p_solicitacao_id,
    coalesce(public.usuario_nome(auth.uid()), 'Sistema'),
    'Moveu para ' || case p_etapa when 'etiqueta_gerada' then 'Etiqueta Gerada' else 'Postado' end
  );
end;
$$;

-- O PDF precisa estar no storage, na pasta da própria solicitação, e não pode
-- ser de outra emissão. Devolve tamanho e tipo lidos do storage.
create or replace function public.emissao_validar_pdf(
  p_solicitacao_id uuid,
  p_pdf_path text,
  out tamanho bigint,
  out tipo text
)
language plpgsql stable security definer
set search_path = ''
as $$
begin
  if split_part(p_pdf_path, '/', 1) <> p_solicitacao_id::text
     or p_pdf_path !~* '^[0-9a-f-]{36}/[^/]+\.pdf$' then
    raise exception 'Caminho do PDF inválido para esta solicitação.' using errcode = '22023';
  end if;

  select (o.metadata ->> 'size')::bigint, o.metadata ->> 'mimetype'
    into tamanho, tipo
  from storage.objects o
  where o.bucket_id = 'etiquetas' and o.name = p_pdf_path;
  if not found then
    raise exception 'O PDF não foi encontrado no armazenamento. Envie o arquivo de novo.' using errcode = 'P0002';
  end if;

  if exists (select 1 from public.reversa_emissoes e where e.pdf_path = p_pdf_path) then
    raise exception 'Este PDF já está vinculado a uma emissão.' using errcode = '23505';
  end if;
end;
$$;

-- Rotina de transição: leva para as emissões o que foi gravado nas colunas
-- antigas (etiqueta_path, codigo_rastreio). Usada pela migração dos dados
-- existentes (p_origem = migracao_legado) e pelo gatilho que recebe escritas
-- de clientes antigos (transicao_legado). Idempotente: um PDF já vinculado ou
-- um código igual ao da emissão vigente não geram nada. PDF novo numa emissão
-- vigente sem PDF completa essa emissão; com PDF, vira reemissão. Não inventa
-- datas: só copia as que existem.
create or replace function public.emissoes_absorver_legado(
  p_solicitacao_id uuid,
  p_pdf boolean,
  p_codigo boolean,
  p_origem text
) returns integer
language plpgsql security definer
set search_path = ''
as $$
declare
  r public.solicitacoes_reverso;
  v_atual public.reversa_emissoes;
  v_nova public.reversa_emissoes;
  v_meta jsonb;
  v_id uuid;
  v_seq integer;
  v_criadas integer := 0;
  v_migracao boolean := p_origem = 'migracao_legado';
  -- Escrita de usuário pelo fluxo antigo: aplica o ponto central de autorização
  v_cliente boolean := p_origem = 'transicao_legado' and auth.uid() is not null;
  v_autor text;
  v_codigo text;
  v_codigo_nova text;
  v_postada boolean;
  v_completa boolean;
  v_arquivo boolean;
begin
  if p_origem not in ('migracao_legado', 'transicao_legado') then
    raise exception 'Origem inválida: %', p_origem using errcode = '22023';
  end if;
  v_autor := case when v_migracao then 'Migração (dados anteriores)' else coalesce(public.usuario_nome(auth.uid()), 'Sistema') end;

  select * into r from public.solicitacoes_reverso where id = p_solicitacao_id for update;
  if not found then
    return 0;
  end if;
  v_codigo := public.emissao_normalizar_codigo(r.codigo_rastreio);

  select * into v_atual
  from public.reversa_emissoes e
  where e.solicitacao_id = r.id and e.substituida_em is null;

  -- PDF das colunas antigas que ainda não é de nenhuma emissão
  if p_pdf and r.etiqueta_path is not null
     and not exists (select 1 from public.reversa_emissoes e where e.pdf_path = r.etiqueta_path) then
    -- A emissão vigente sem PDF recebe o PDF (é a etiqueta dela, não uma reemissão)
    v_completa := v_atual.id is not null and v_atual.pdf_path is null;
    if v_cliente then
      perform public.exigir_operacao_emissao(r.id, case when v_completa then 'anexar_pdf' else 'registrar' end);
    end if;

    select o.metadata into v_meta
    from storage.objects o
    where o.bucket_id = 'etiquetas' and o.name = r.etiqueta_path;
    v_arquivo := found;
    -- Escrita nova precisa do arquivo na pasta da reversa. Na migração, a
    -- referência antiga é preservada mesmo sem arquivo (marcada no evento).
    if not v_migracao and (not v_arquivo or split_part(r.etiqueta_path, '/', 1) <> r.id::text) then
      raise exception 'O PDF % não está no armazenamento desta reversa.', r.etiqueta_path using errcode = 'P0002';
    end if;

    if v_completa then
      update public.reversa_emissoes
         set pdf_path = r.etiqueta_path,
             pdf_nome = r.etiqueta_nome,
             pdf_tamanho = (v_meta ->> 'size')::bigint,
             pdf_tipo = v_meta ->> 'mimetype',
             pdf_anexado_em = coalesce(r.etiqueta_enviada_em, now()),
             pdf_anexado_por = auth.uid(),
             pdf_anexado_por_nome = v_autor
       where id = v_atual.id
      returning * into v_nova;
      perform public.emissao_registrar_evento(
        v_nova, 'pdf_anexado',
        'PDF anexado à emissão #' || v_nova.sequencia || ' pelo fluxo antigo de etiqueta: ' || coalesce(v_nova.pdf_nome, 'PDF'),
        jsonb_build_object('pdf_path', r.etiqueta_path, 'pdf_tamanho', v_nova.pdf_tamanho),
        false, v_autor);
    else
      select coalesce(max(e.sequencia), 0) + 1 into v_seq
      from public.reversa_emissoes e where e.solicitacao_id = r.id;

      -- Troca de PDF pelo fluxo antigo sem trocar o código: o código era da emissão anterior
      v_codigo_nova := case when v_atual.id is null or p_codigo then v_codigo end;
      -- Na migração, a etapa já registrada na reversa vale como postagem da única emissão
      v_postada := v_migracao and v_atual.id is null and r.status in ('postado', 'em_transito', 'concluido');

      v_id := gen_random_uuid();
      if v_atual.id is not null then
        update public.reversa_emissoes
           set substituida_em = now(), substituida_por_id = v_id
         where id = v_atual.id
        returning * into v_atual;
      end if;

      insert into public.reversa_emissoes (
        id, solicitacao_id, sequencia, origem, registrado_por, registrado_por_nome,
        codigo_rastreio,
        pdf_path, pdf_nome, pdf_tamanho, pdf_tipo, pdf_anexado_em, pdf_anexado_por, pdf_anexado_por_nome,
        emissao_anterior_id, motivo_reemissao,
        postagem_confirmada_em, postagem_em, postagem_fonte, postagem_confirmada_por_nome
      ) values (
        v_id, r.id, v_seq, p_origem, auth.uid(), v_autor,
        v_codigo_nova,
        r.etiqueta_path, r.etiqueta_nome, (v_meta ->> 'size')::bigint, v_meta ->> 'mimetype', r.etiqueta_enviada_em,
        case when v_migracao then null else auth.uid() end,
        case when v_migracao then null else v_autor end,
        v_atual.id, case when v_atual.id is not null then 'nao_informado' end,
        case when v_postada then now() end,
        case when v_postada then (r.postado_em at time zone 'America/Sao_Paulo')::date end,
        case when v_postada then 'legado' end,
        case when v_postada then 'Migração (etapa da reversa)' end
      )
      returning * into v_nova;

      if v_atual.id is not null then
        perform public.emissao_registrar_evento(
          v_atual, 'substituida',
          'Emissão #' || v_atual.sequencia || ' substituída no sistema pela #' || v_seq || ' (não cancelada nos Correios)',
          jsonb_build_object('substituida_por', v_nova.id), false, v_autor);
      end if;
      perform public.emissao_registrar_evento(
        v_nova,
        case when v_migracao then 'migrada_legado' else 'sincronizada_legado' end,
        case
          when v_migracao then 'Emissão #' || v_seq || ' criada a partir dos dados anteriores da reversa'
          else 'Emissão #' || v_seq || ' registrada pelo fluxo antigo de etiqueta'
        end,
        jsonb_build_object(
          'pdf_path', r.etiqueta_path, 'arquivo_encontrado', v_arquivo,
          'codigo_rastreio', v_codigo_nova, 'postagem_pela_etapa', v_postada),
        true, v_autor);
      v_criadas := v_criadas + 1;
    end if;

    v_atual := v_nova;
  end if;

  -- Código de rastreio das colunas antigas
  if p_codigo and v_codigo is distinct from v_atual.codigo_rastreio then
    if v_atual.id is null then
      if v_codigo is not null then
        if v_cliente then
          perform public.exigir_operacao_emissao(r.id, 'registrar');
        end if;
        v_postada := v_migracao and r.status in ('postado', 'em_transito', 'concluido');

        select coalesce(max(e.sequencia), 0) + 1 into v_seq
        from public.reversa_emissoes e where e.solicitacao_id = r.id;

        insert into public.reversa_emissoes (
          solicitacao_id, sequencia, origem, registrado_por, registrado_por_nome, codigo_rastreio,
          postagem_confirmada_em, postagem_em, postagem_fonte, postagem_confirmada_por_nome
        ) values (
          r.id, v_seq, p_origem, auth.uid(), v_autor, v_codigo,
          case when v_postada then now() end,
          case when v_postada then (r.postado_em at time zone 'America/Sao_Paulo')::date end,
          case when v_postada then 'legado' end,
          case when v_postada then 'Migração (etapa da reversa)' end
        )
        returning * into v_nova;

        perform public.emissao_registrar_evento(
          v_nova,
          case when v_migracao then 'migrada_legado' else 'sincronizada_legado' end,
          case
            when v_migracao then 'Emissão #' || v_seq || ' criada a partir do código de rastreio já informado'
            else 'Emissão #' || v_seq || ' registrada pelo código de rastreio informado no fluxo antigo'
          end,
          jsonb_build_object('codigo_rastreio', v_codigo, 'postagem_pela_etapa', v_postada),
          true, v_autor);
        v_criadas := v_criadas + 1;
      end if;
    else
      -- Limpar o código pela coluna antiga continua permitido sem aprovação
      -- (contrato da aprovação: limpar não avança a expedição); a RLS da
      -- reversa já exige que o usuário opere a empresa. Gravar código novo, não.
      if v_cliente and v_codigo is not null then
        perform public.exigir_operacao_emissao(r.id, 'dados');
      end if;
      update public.reversa_emissoes set codigo_rastreio = v_codigo where id = v_atual.id
      returning * into v_nova;
      perform public.emissao_registrar_evento(
        v_nova, 'dados_atualizados',
        case
          when v_codigo is null then 'Código de rastreio removido da emissão #' || v_nova.sequencia || ' (era ' || v_atual.codigo_rastreio || ')'
          else 'Código de rastreio da emissão #' || v_nova.sequencia || ': ' || coalesce(v_atual.codigo_rastreio || ' → ', '') || v_codigo
        end,
        jsonb_build_object('campo', 'codigo_rastreio', 'antes', v_atual.codigo_rastreio, 'depois', v_codigo),
        false, v_autor);
    end if;
  end if;

  perform public.emissoes_sincronizar_legado(r.id);
  return v_criadas;
end;
$$;

-- 6. Colunas antigas de solicitacoes_reverso durante a transição
comment on column public.solicitacoes_reverso.etiqueta_path is 'ESPELHO do PDF da emissão vigente (reversa_emissoes.pdf_path), mantido pelo banco. Use as emissões.';
comment on column public.solicitacoes_reverso.etiqueta_nome is 'ESPELHO de reversa_emissoes.pdf_nome da emissão vigente.';
comment on column public.solicitacoes_reverso.etiqueta_enviada_em is 'ESPELHO de reversa_emissoes.pdf_anexado_em da emissão vigente (PDF anexado; não é envio à cliente).';
comment on column public.solicitacoes_reverso.codigo_rastreio is 'ESPELHO do código de rastreio da emissão vigente; a Edge Function correios-rastreio ainda lê esta coluna.';

-- Remover o PDF pela coluna antiga não apaga a emissão: o espelho continua nela
create or replace function public.reversa_legado_proteger_espelho() returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  if coalesce(current_setting('emissoes.sincronizando', true), '') = 'sim' then
    return new;
  end if;
  if new.etiqueta_path is null and old.etiqueta_path is not null
     and exists (select 1 from public.reversa_emissoes e where e.pdf_path = old.etiqueta_path) then
    new.etiqueta_path := old.etiqueta_path;
    new.etiqueta_nome := old.etiqueta_nome;
    new.etiqueta_enviada_em := old.etiqueta_enviada_em;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_reversa_legado_proteger on public.solicitacoes_reverso;
create trigger trg_reversa_legado_proteger before update of etiqueta_path, etiqueta_nome, etiqueta_enviada_em on public.solicitacoes_reverso
  for each row execute function public.reversa_legado_proteger_espelho();

create or replace function public.reversa_legado_para_emissoes() returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  v_pdf boolean;
  v_codigo boolean;
begin
  if coalesce(current_setting('emissoes.sincronizando', true), '') = 'sim' then
    return null;
  end if;

  if tg_op = 'INSERT' then
    v_pdf := new.etiqueta_path is not null;
    v_codigo := new.codigo_rastreio is not null;
  else
    v_pdf := new.etiqueta_path is distinct from old.etiqueta_path;
    v_codigo := new.codigo_rastreio is distinct from old.codigo_rastreio;
  end if;

  if v_pdf or v_codigo then
    perform public.emissoes_absorver_legado(new.id, v_pdf, v_codigo, 'transicao_legado');
  elsif tg_op = 'UPDATE' then
    -- Mesmo PDF/código com outro nome ou data: o espelho volta para a emissão
    perform public.emissoes_sincronizar_legado(new.id);
  end if;
  return null;
end;
$$;

drop trigger if exists trg_reversa_legado_emissoes on public.solicitacoes_reverso;
create trigger trg_reversa_legado_emissoes
  after insert or update of etiqueta_path, etiqueta_nome, etiqueta_enviada_em, codigo_rastreio on public.solicitacoes_reverso
  for each row execute function public.reversa_legado_para_emissoes();

-- 7. Funções chamadas pelo frontend
-- Registra a emissão seguinte. Com uma emissão vigente, é reemissão: exige o
-- motivo e marca a anterior como substituída no sistema, preservando tudo dela.
-- p_emissao_id torna a chamada repetível: se a resposta se perder, chamar de
-- novo com o mesmo id devolve a emissão já gravada.
create or replace function public.registrar_emissao_reversa(
  p_solicitacao_id uuid,
  p_emissao_id uuid default null,
  p_codigo_autorizacao text default null,
  p_codigo_rastreio text default null,
  p_emitida_em date default null,
  p_valida_ate date default null,
  p_pdf_path text default null,
  p_pdf_nome text default null,
  p_pdf_sha256 text default null,
  p_motivo_reemissao text default null,
  p_motivo_detalhe text default null,
  p_observacao text default null
) returns public.reversa_emissoes
language plpgsql security definer
set search_path = ''
as $$
declare
  r public.solicitacoes_reverso;
  v_atual public.reversa_emissoes;
  v_nova public.reversa_emissoes;
  v_existente public.reversa_emissoes;
  v_id uuid := coalesce(p_emissao_id, gen_random_uuid());
  v_aut text := public.emissao_normalizar_codigo(p_codigo_autorizacao);
  v_ras text := public.emissao_normalizar_codigo(p_codigo_rastreio);
  v_pdf text := nullif(btrim(p_pdf_path), '');
  v_pdf_nome text;
  v_motivo text := nullif(btrim(p_motivo_reemissao), '');
  v_detalhe text := nullif(btrim(p_motivo_detalhe), '');
  v_tamanho bigint;
  v_tipo text;
  v_seq integer;
  v_nome text := coalesce(public.usuario_nome(auth.uid()), 'Sistema');
begin
  -- Trava a solicitação: emissões da mesma reversa são registradas uma por vez
  -- e a aprovação não muda entre a conferência e a gravação
  select * into r from public.solicitacoes_reverso where id = p_solicitacao_id for update;
  if not found then
    raise exception 'Solicitação não encontrada.' using errcode = 'P0002';
  end if;
  perform public.exigir_operacao_emissao(p_solicitacao_id, 'registrar');

  select * into v_existente from public.reversa_emissoes where id = v_id;
  if found then
    if v_existente.solicitacao_id <> r.id then
      raise exception 'Identificador de emissão já usado.' using errcode = '23505';
    end if;
    return v_existente;
  end if;

  if v_pdf is null and v_aut is null and v_ras is null then
    raise exception 'Informe o PDF, o código de autorização ou o código de rastreio da emissão.' using errcode = '23514';
  end if;
  if v_ras is not null and v_ras !~ '^[A-Z]{2}[0-9]{9}[A-Z]{2}$' then
    raise exception 'Código de rastreio inválido: %. Use o formato AA123456789BR.', v_ras using errcode = '22023';
  end if;
  if p_valida_ate is not null and p_emitida_em is not null and p_valida_ate < p_emitida_em then
    raise exception 'A validade não pode ser anterior à data de emissão.' using errcode = '23514';
  end if;
  if p_emitida_em is not null and p_emitida_em > (now() at time zone 'America/Sao_Paulo')::date then
    raise exception 'A data de emissão não pode ser futura.' using errcode = '23514';
  end if;

  select * into v_atual
  from public.reversa_emissoes e
  where e.solicitacao_id = r.id and e.substituida_em is null;

  if v_atual.id is not null then
    if v_motivo is null then
      raise exception 'Informe o motivo da reemissão.' using errcode = '23514';
    end if;
    if v_motivo not in ('vencida_sem_uso', 'cliente_nao_recebeu', 'dados_incorretos', 'pdf_incorreto', 'outro') then
      raise exception 'Motivo de reemissão inválido: %.', v_motivo using errcode = '22023';
    end if;
    if v_motivo = 'outro' and v_detalhe is null then
      raise exception 'Descreva o motivo da reemissão.' using errcode = '23514';
    end if;
  else
    v_motivo := null;
    v_detalhe := null;
  end if;

  if v_pdf is not null then
    select t.tamanho, t.tipo into v_tamanho, v_tipo from public.emissao_validar_pdf(r.id, v_pdf) t;
    v_pdf_nome := coalesce(left(nullif(btrim(regexp_replace(coalesce(p_pdf_nome, ''), '[/\\]', '_', 'g')), ''), 200), 'autorizacao.pdf');
  end if;

  select coalesce(max(e.sequencia), 0) + 1 into v_seq
  from public.reversa_emissoes e where e.solicitacao_id = r.id;

  if v_atual.id is not null then
    update public.reversa_emissoes
       set substituida_em = now(), substituida_por_id = v_id
     where id = v_atual.id
    returning * into v_atual;
  end if;

  insert into public.reversa_emissoes (
    id, solicitacao_id, sequencia, origem, registrado_por, registrado_por_nome,
    codigo_autorizacao, codigo_rastreio, emitida_em, valida_ate,
    pdf_path, pdf_nome, pdf_tamanho, pdf_tipo, pdf_sha256, pdf_anexado_em, pdf_anexado_por, pdf_anexado_por_nome,
    emissao_anterior_id, motivo_reemissao, motivo_reemissao_detalhe, observacao
  ) values (
    v_id, r.id, v_seq, 'sistema', auth.uid(), v_nome,
    v_aut, v_ras, p_emitida_em, p_valida_ate,
    v_pdf, v_pdf_nome, v_tamanho, v_tipo, lower(nullif(btrim(p_pdf_sha256), '')),
    case when v_pdf is not null then now() end,
    case when v_pdf is not null then auth.uid() end,
    case when v_pdf is not null then v_nome end,
    v_atual.id, v_motivo, v_detalhe, nullif(btrim(p_observacao), '')
  )
  returning * into v_nova;

  if v_atual.id is not null then
    perform public.emissao_registrar_evento(
      v_atual, 'substituida',
      'Emissão #' || v_atual.sequencia || ' substituída no sistema pela #' || v_seq || ' (não cancelada nos Correios)',
      jsonb_build_object('substituida_por', v_nova.id));
  end if;
  perform public.emissao_registrar_evento(
    v_nova, 'registrada',
    'Emissão #' || v_seq || ' registrada'
      || case when v_motivo is not null then ' (reemissão: ' || public.emissao_motivo_rotulo(v_motivo) || ')' else '' end,
    jsonb_build_object(
      'codigo_autorizacao', v_aut, 'codigo_rastreio', v_ras, 'emitida_em', p_emitida_em, 'valida_ate', p_valida_ate,
      'motivo_reemissao', v_motivo, 'motivo_detalhe', v_detalhe, 'emissao_anterior_id', v_atual.id),
    true);
  if v_pdf is not null then
    perform public.emissao_registrar_evento(
      v_nova, 'pdf_anexado', 'PDF anexado à emissão #' || v_seq || ': ' || v_pdf_nome,
      jsonb_build_object('pdf_path', v_pdf, 'pdf_tamanho', v_tamanho, 'pdf_sha256', v_nova.pdf_sha256));
  end if;

  perform public.emissoes_sincronizar_legado(r.id);
  perform public.emissao_avancar_etapa(r.id, 'etiqueta_gerada');
  return v_nova;
end;
$$;

-- Anexa o PDF a uma emissão que ainda não tem. Trocar o PDF de uma emissão não
-- é permitido: para isso, registre uma reemissão.
create or replace function public.anexar_pdf_emissao(
  p_emissao_id uuid,
  p_pdf_path text,
  p_pdf_nome text default null,
  p_pdf_sha256 text default null
) returns public.reversa_emissoes
language plpgsql security definer
set search_path = ''
as $$
declare
  v public.reversa_emissoes;
  v_nova public.reversa_emissoes;
  v_sol uuid;
  v_pdf text := nullif(btrim(p_pdf_path), '');
  v_pdf_nome text;
  v_tamanho bigint;
  v_tipo text;
  v_nome text := coalesce(public.usuario_nome(auth.uid()), 'Sistema');
begin
  select e.solicitacao_id into v_sol from public.reversa_emissoes e where e.id = p_emissao_id;
  if not found then
    raise exception 'Emissão não encontrada.' using errcode = 'P0002';
  end if;
  perform 1 from public.solicitacoes_reverso where id = v_sol for update;
  perform public.exigir_operacao_emissao(v_sol, 'anexar_pdf');
  select * into v from public.reversa_emissoes where id = p_emissao_id for update;

  if v.pdf_path is not null then
    if v.pdf_path = v_pdf then
      return v;  -- repetição da mesma chamada
    end if;
    raise exception 'A emissão #% já tem PDF. Para trocar, registre uma reemissão.', v.sequencia using errcode = '23505';
  end if;
  if v_pdf is null then
    raise exception 'Informe o PDF.' using errcode = '23514';
  end if;

  select t.tamanho, t.tipo into v_tamanho, v_tipo from public.emissao_validar_pdf(v_sol, v_pdf) t;
  v_pdf_nome := coalesce(left(nullif(btrim(regexp_replace(coalesce(p_pdf_nome, ''), '[/\\]', '_', 'g')), ''), 200), 'autorizacao.pdf');

  update public.reversa_emissoes
     set pdf_path = v_pdf,
         pdf_nome = v_pdf_nome,
         pdf_tamanho = v_tamanho,
         pdf_tipo = v_tipo,
         pdf_sha256 = lower(nullif(btrim(p_pdf_sha256), '')),
         pdf_anexado_em = now(),
         pdf_anexado_por = auth.uid(),
         pdf_anexado_por_nome = v_nome
   where id = v.id
  returning * into v_nova;

  perform public.emissao_registrar_evento(
    v_nova, 'pdf_anexado', 'PDF anexado à emissão #' || v_nova.sequencia || ': ' || v_pdf_nome,
    jsonb_build_object('pdf_path', v_pdf, 'pdf_tamanho', v_tamanho, 'pdf_sha256', v_nova.pdf_sha256),
    true);

  if v_nova.substituida_em is null then
    perform public.emissoes_sincronizar_legado(v_sol);
    perform public.emissao_avancar_etapa(v_sol, 'etiqueta_gerada');
  end if;
  return v_nova;
end;
$$;

-- Completa ou corrige códigos e datas de uma emissão (inclusive substituída:
-- o código de uma autorização antiga pode aparecer depois). Cada mudança fica
-- nos eventos com o valor anterior.
create or replace function public.atualizar_dados_emissao(
  p_emissao_id uuid,
  p_codigo_autorizacao text,
  p_codigo_rastreio text,
  p_emitida_em date,
  p_valida_ate date
) returns public.reversa_emissoes
language plpgsql security definer
set search_path = ''
as $$
declare
  v public.reversa_emissoes;
  v_nova public.reversa_emissoes;
  v_sol uuid;
  v_aut text := public.emissao_normalizar_codigo(p_codigo_autorizacao);
  v_ras text := public.emissao_normalizar_codigo(p_codigo_rastreio);
  v_mudancas text[] := '{}';
  v_dados jsonb := '{}'::jsonb;
begin
  select e.solicitacao_id into v_sol from public.reversa_emissoes e where e.id = p_emissao_id;
  if not found then
    raise exception 'Emissão não encontrada.' using errcode = 'P0002';
  end if;
  perform 1 from public.solicitacoes_reverso where id = v_sol for update;
  perform public.exigir_operacao_emissao(v_sol, 'dados');
  select * into v from public.reversa_emissoes where id = p_emissao_id for update;

  if v_ras is distinct from v.codigo_rastreio and v_ras is not null and v_ras !~ '^[A-Z]{2}[0-9]{9}[A-Z]{2}$' then
    raise exception 'Código de rastreio inválido: %. Use o formato AA123456789BR.', v_ras using errcode = '22023';
  end if;
  if p_valida_ate is not null and p_emitida_em is not null and p_valida_ate < p_emitida_em then
    raise exception 'A validade não pode ser anterior à data de emissão.' using errcode = '23514';
  end if;
  if p_emitida_em is not null and p_emitida_em > (now() at time zone 'America/Sao_Paulo')::date then
    raise exception 'A data de emissão não pode ser futura.' using errcode = '23514';
  end if;
  if p_emitida_em is not null and v.postagem_em is not null and v.postagem_em < p_emitida_em then
    raise exception 'A data de emissão não pode ser posterior à postagem confirmada.' using errcode = '23514';
  end if;

  if v_aut is distinct from v.codigo_autorizacao then
    v_mudancas := v_mudancas || ('código de autorização: ' || coalesce(v.codigo_autorizacao, '—') || ' → ' || coalesce(v_aut, '—'));
    v_dados := v_dados || jsonb_build_object('codigo_autorizacao', jsonb_build_object('antes', v.codigo_autorizacao, 'depois', v_aut));
  end if;
  if v_ras is distinct from v.codigo_rastreio then
    v_mudancas := v_mudancas || ('código de rastreio: ' || coalesce(v.codigo_rastreio, '—') || ' → ' || coalesce(v_ras, '—'));
    v_dados := v_dados || jsonb_build_object('codigo_rastreio', jsonb_build_object('antes', v.codigo_rastreio, 'depois', v_ras));
  end if;
  if p_emitida_em is distinct from v.emitida_em then
    v_mudancas := v_mudancas || ('emitida em: ' || coalesce(to_char(v.emitida_em, 'DD/MM/YYYY'), '—') || ' → ' || coalesce(to_char(p_emitida_em, 'DD/MM/YYYY'), '—'));
    v_dados := v_dados || jsonb_build_object('emitida_em', jsonb_build_object('antes', v.emitida_em, 'depois', p_emitida_em));
  end if;
  if p_valida_ate is distinct from v.valida_ate then
    v_mudancas := v_mudancas || ('válida até: ' || coalesce(to_char(v.valida_ate, 'DD/MM/YYYY'), '—') || ' → ' || coalesce(to_char(p_valida_ate, 'DD/MM/YYYY'), '—'));
    v_dados := v_dados || jsonb_build_object('valida_ate', jsonb_build_object('antes', v.valida_ate, 'depois', p_valida_ate));
  end if;

  if cardinality(v_mudancas) = 0 then
    return v;
  end if;

  update public.reversa_emissoes
     set codigo_autorizacao = v_aut,
         codigo_rastreio = v_ras,
         emitida_em = p_emitida_em,
         valida_ate = p_valida_ate
   where id = v.id
  returning * into v_nova;

  perform public.emissao_registrar_evento(
    v_nova, 'dados_atualizados',
    'Emissão #' || v_nova.sequencia || ' — ' || array_to_string(v_mudancas, '; '),
    v_dados, true);

  if v_nova.substituida_em is null then
    perform public.emissoes_sincronizar_legado(v_sol);
  end if;
  return v_nova;
end;
$$;

-- Envio da autorização informado à vendedora ou à cliente. Só na emissão
-- vigente. Guarda o primeiro envio; cada novo aviso vira um evento.
create or replace function public.informar_envio_emissao(
  p_emissao_id uuid,
  p_para text,
  p_observacao text default null
) returns public.reversa_emissoes
language plpgsql security definer
set search_path = ''
as $$
declare
  v public.reversa_emissoes;
  v_nova public.reversa_emissoes;
  v_sol uuid;
  v_obs text := nullif(btrim(p_observacao), '');
  v_nome text := coalesce(public.usuario_nome(auth.uid()), 'Sistema');
begin
  select e.solicitacao_id into v_sol from public.reversa_emissoes e where e.id = p_emissao_id;
  if not found then
    raise exception 'Emissão não encontrada.' using errcode = 'P0002';
  end if;
  perform 1 from public.solicitacoes_reverso where id = v_sol for update;
  perform public.exigir_operacao_emissao(v_sol, 'envio');
  select * into v from public.reversa_emissoes where id = p_emissao_id for update;

  if p_para is null or p_para not in ('vendedora', 'cliente') then
    raise exception 'Informe se o envio foi à vendedora ou à cliente.' using errcode = '22023';
  end if;
  if v.substituida_em is not null then
    raise exception 'A emissão #% foi substituída no sistema. Informe o envio da emissão vigente.', v.sequencia using errcode = '23514';
  end if;

  update public.reversa_emissoes
     set envio_informado_em = coalesce(envio_informado_em, now()),
         envio_informado_para = coalesce(envio_informado_para, p_para),
         envio_informado_por = case when envio_informado_em is null then auth.uid() else envio_informado_por end,
         envio_informado_por_nome = coalesce(envio_informado_por_nome, v_nome),
         envio_observacao = coalesce(envio_observacao, v_obs)
   where id = v.id
  returning * into v_nova;

  perform public.emissao_registrar_evento(
    v_nova, 'envio_informado',
    'Envio da emissão #' || v_nova.sequencia || ' informado à ' || p_para || coalesce(' — ' || v_obs, ''),
    jsonb_build_object('para', p_para, 'observacao', v_obs), true);
  return v_nova;
end;
$$;

-- Postagem confirmada (utilização). Vale também para emissão substituída: a
-- cliente pode ter usado a autorização anterior. A reversa pendente ou com
-- etiqueta gerada passa para "Postado".
create or replace function public.confirmar_postagem_emissao(
  p_emissao_id uuid,
  p_postagem_em date default null,
  p_observacao text default null
) returns public.reversa_emissoes
language plpgsql security definer
set search_path = ''
as $$
declare
  v public.reversa_emissoes;
  v_nova public.reversa_emissoes;
  v_sol uuid;
  v_obs text := nullif(btrim(p_observacao), '');
  v_nome text := coalesce(public.usuario_nome(auth.uid()), 'Sistema');
begin
  select e.solicitacao_id into v_sol from public.reversa_emissoes e where e.id = p_emissao_id;
  if not found then
    raise exception 'Emissão não encontrada.' using errcode = 'P0002';
  end if;
  perform 1 from public.solicitacoes_reverso where id = v_sol for update;
  perform public.exigir_operacao_emissao(v_sol, 'postagem');
  select * into v from public.reversa_emissoes where id = p_emissao_id for update;

  if v.postagem_confirmada_em is not null then
    raise exception 'A postagem da emissão #% já foi confirmada.', v.sequencia using errcode = '23505';
  end if;
  if p_postagem_em is not null and p_postagem_em > (now() at time zone 'America/Sao_Paulo')::date then
    raise exception 'A data da postagem não pode ser futura.' using errcode = '23514';
  end if;
  if p_postagem_em is not null and v.emitida_em is not null and p_postagem_em < v.emitida_em then
    raise exception 'A data da postagem não pode ser anterior à emissão.' using errcode = '23514';
  end if;

  update public.reversa_emissoes
     set postagem_confirmada_em = now(),
         postagem_em = p_postagem_em,
         postagem_fonte = 'manual',
         postagem_confirmada_por = auth.uid(),
         postagem_confirmada_por_nome = v_nome,
         postagem_observacao = v_obs
   where id = v.id
  returning * into v_nova;

  perform public.emissao_registrar_evento(
    v_nova, 'postagem_confirmada',
    'Postagem confirmada na emissão #' || v_nova.sequencia
      || case when v_nova.substituida_em is not null then ' (substituída no sistema)' else '' end
      || coalesce(' — postada em ' || to_char(p_postagem_em, 'DD/MM/YYYY'), ''),
    jsonb_build_object('postagem_em', p_postagem_em, 'observacao', v_obs), true);

  perform public.emissao_avancar_etapa(v_sol, 'postado');
  return v_nova;
end;
$$;

-- Desfaz uma confirmação manual (ou da migração) registrada por engano. O
-- motivo e os valores anteriores ficam no evento. A etapa da reversa não volta.
create or replace function public.desfazer_postagem_emissao(
  p_emissao_id uuid,
  p_motivo text
) returns public.reversa_emissoes
language plpgsql security definer
set search_path = ''
as $$
declare
  v public.reversa_emissoes;
  v_nova public.reversa_emissoes;
  v_sol uuid;
  v_motivo text := nullif(btrim(p_motivo), '');
begin
  select e.solicitacao_id into v_sol from public.reversa_emissoes e where e.id = p_emissao_id;
  if not found then
    raise exception 'Emissão não encontrada.' using errcode = 'P0002';
  end if;
  perform 1 from public.solicitacoes_reverso where id = v_sol for update;
  perform public.exigir_operacao_emissao(v_sol, 'postagem');
  select * into v from public.reversa_emissoes where id = p_emissao_id for update;

  if v.postagem_confirmada_em is null then
    raise exception 'A emissão #% não tem postagem confirmada.', v.sequencia using errcode = '23514';
  end if;
  if v.postagem_fonte = 'rastreio' then
    raise exception 'Postagem comprovada pelo rastreio não é desfeita manualmente.' using errcode = '42501';
  end if;
  if v_motivo is null then
    raise exception 'Informe por que a confirmação está sendo desfeita.' using errcode = '23514';
  end if;

  update public.reversa_emissoes
     set postagem_confirmada_em = null,
         postagem_em = null,
         postagem_fonte = null,
         postagem_confirmada_por = null,
         postagem_confirmada_por_nome = null,
         postagem_observacao = null
   where id = v.id
  returning * into v_nova;

  perform public.emissao_registrar_evento(
    v_nova, 'postagem_desfeita',
    'Confirmação de postagem da emissão #' || v_nova.sequencia || ' desfeita: ' || v_motivo,
    jsonb_build_object(
      'motivo', v_motivo,
      'antes', jsonb_build_object(
        'postagem_confirmada_em', v.postagem_confirmada_em, 'postagem_em', v.postagem_em,
        'postagem_fonte', v.postagem_fonte, 'postagem_confirmada_por_nome', v.postagem_confirmada_por_nome,
        'postagem_observacao', v.postagem_observacao)),
    true);
  return v_nova;
end;
$$;

-- 8. Visão das emissões com o rastreio do objeto de cada uma
-- O rastreio liga-se à emissão por (solicitacao_id, codigo_rastreio).
-- rastreio_indica_postagem: algum evento de postagem/trânsito/entrega (PO, RO,
-- OEC, BDE — mesmo mapeamento da Edge Function) já apareceu para o objeto.
create or replace view public.vw_reversa_emissoes with (security_invoker = true) as
select
  e.*,
  (e.substituida_em is null) as vigente,
  rc.ultimo_evento_codigo as rastreio_ultimo_evento_codigo,
  rc.ultimo_evento_descricao as rastreio_ultimo_evento_descricao,
  case when rc.unidade_cidade is not null then rc.unidade_cidade || coalesce('/' || rc.unidade_uf, '') end as rastreio_ultima_cidade,
  rc.ultimo_check_em as rastreio_ultimo_check_em,
  coalesce(ev.indica_postagem, false) or coalesce(rc.ultimo_evento_codigo in ('PO', 'RO', 'OEC', 'BDE'), false) as rastreio_indica_postagem,
  ev.primeira_postagem as rastreio_postagem_evento_em
from public.reversa_emissoes e
left join public.rastreamento_correios rc
  on rc.codigo_rastreio = e.codigo_rastreio and rc.solicitacao_id = e.solicitacao_id
left join lateral (
  select
    count(*) > 0 as indica_postagem,
    min(x ->> 'dtHrCriado') as primeira_postagem
  from jsonb_array_elements(case when jsonb_typeof(rc.eventos) = 'array' then rc.eventos else '[]'::jsonb end) as x
  where x ->> 'codigo' in ('PO', 'RO', 'OEC', 'BDE')
) ev on true;

comment on view public.vw_reversa_emissoes is 'Emissões + rastreio do objeto de cada uma. A situação da autorização (validade, utilização) é interpretada em src/lib/emissoes.ts.';

-- 9. Rastreio: um registro por código de objeto (antes: 1 por solicitação)
-- Com reemissão, a mesma reversa pode ter objetos diferentes; o rastreio dos
-- anteriores fica preservado. A Edge Function grava com service_role (sem RLS).
drop index if exists public.idx_rc_solicitacao;
create index if not exists idx_rc_solicitacao_id on public.rastreamento_correios (solicitacao_id);
comment on table public.rastreamento_correios is 'Último evento de rastreio por código de objeto. Liga-se à emissão por (solicitacao_id, codigo_rastreio). Códigos de emissões anteriores ficam preservados.';

drop policy if exists "select_rastreamento" on public.rastreamento_correios;
create policy "select_rastreamento" on public.rastreamento_correios
  for select to authenticated
  using (solicitacao_id in (select r.id from public.solicitacoes_reverso r));
-- Só a Edge Function (service_role) grava: o rastreio comprova utilização
drop policy if exists "insert_rastreamento" on public.rastreamento_correios;
drop policy if exists "update_rastreamento" on public.rastreamento_correios;
revoke insert, update, delete, truncate on public.rastreamento_correios from anon, authenticated;

-- O histórico da reversa passa a ter linhas das emissões: só quem vê a reversa
-- lê ou escreve nele, e autor e data vêm do servidor (ninguém assina por outro).
drop policy if exists "select_historico" on public.solicitacoes_historico;
create policy "select_historico" on public.solicitacoes_historico
  for select to authenticated
  using (solicitacao_id in (select r.id from public.solicitacoes_reverso r));

drop policy if exists "insert_historico" on public.solicitacoes_historico;
create policy "insert_historico" on public.solicitacoes_historico
  for insert to authenticated
  with check (solicitacao_id in (select r.id from public.solicitacoes_reverso r));

create or replace function public.solicitacoes_historico_autor() returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  new.created_at := now();
  if auth.uid() is not null then
    new.user_nome := coalesce(public.usuario_nome(auth.uid()), 'Sistema');
  end if;
  return new;
end;
$$;

drop trigger if exists trg_solicitacoes_historico_autor on public.solicitacoes_historico;
create trigger trg_solicitacoes_historico_autor before insert on public.solicitacoes_historico
  for each row execute function public.solicitacoes_historico_autor();

-- 10. Storage (bucket "etiquetas"): PDFs de emissão não são sobrescritos nem apagados
-- Leitura: quem vê a reversa abre os PDFs dela (inclusive de emissões
-- anteriores); o admin também enxerga o que sobrou de reversa apagada, para limpar.
create or replace function public.pode_acessar_etiqueta(p_objeto text) returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.solicitacoes_reverso r
    where r.id::text = split_part(p_objeto, '/', 1)
      and r.empresa = any (public.empresas_permitidas())
  )
  or (
    public.is_admin()
    and not exists (select 1 from public.solicitacoes_reverso r where r.id::text = split_part(p_objeto, '/', 1))
  );
$$;

-- Enviar: passa pelo ponto central (operação anexar_pdf), na pasta de uma
-- reversa, e nunca com o nome de um PDF que já pertence a uma emissão.
create or replace function public.pode_anexar_pdf_etiqueta(p_objeto text) returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.solicitacoes_reverso r
    where r.id::text = split_part(p_objeto, '/', 1)
      and r.etiqueta_path is distinct from p_objeto
      and public.pode_operar_emissao(r.id, 'anexar_pdf')
  )
  and not exists (select 1 from public.reversa_emissoes e where e.pdf_path = p_objeto);
$$;

-- Apagar: com a reversa existindo, PDF vinculado a emissão (ou ao espelho)
-- nunca é apagado — nem pelo admin. PDF órfão de envio que falhou: o próprio
-- autor, ou quem opera a reversa depois de 15 minutos (antes disso o envio
-- pode estar sendo vinculado). Reversa apagada: o admin limpa o que sobrou.
create or replace function public.pode_apagar_pdf_etiqueta(p_objeto text) returns boolean
language sql stable security definer
set search_path = ''
as $$
  select case
    when not exists (select 1 from public.solicitacoes_reverso r where r.id::text = split_part(p_objeto, '/', 1))
      then public.is_admin()
    else exists (
      select 1
      from public.solicitacoes_reverso r
      join storage.objects o on o.bucket_id = 'etiquetas' and o.name = p_objeto
      where r.id::text = split_part(p_objeto, '/', 1)
        and r.empresa = any (public.empresas_operacao_emissao('anexar_pdf'))
        and r.etiqueta_path is distinct from p_objeto
        and not exists (select 1 from public.reversa_emissoes e where e.pdf_path = p_objeto)
        and (
          (to_jsonb(o) ->> 'owner_id') = auth.uid()::text
          or (to_jsonb(o) ->> 'owner') = auth.uid()::text
          or o.created_at < now() - interval '15 minutes'
        )
    )
  end;
$$;

drop policy if exists "etiquetas_insert" on storage.objects;
create policy "etiquetas_insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'etiquetas' and public.pode_anexar_pdf_etiqueta(name));

-- Sem update: um PDF enviado não é sobrescrito
drop policy if exists "etiquetas_update" on storage.objects;

drop policy if exists "etiquetas_delete" on storage.objects;
create policy "etiquetas_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'etiquetas' and public.pode_apagar_pdf_etiqueta(name));

-- 11. RLS e privilégios: leitura igual à da reversa; escrita só pelas funções
alter table public.reversa_emissoes enable row level security;
alter table public.reversa_emissao_eventos enable row level security;

drop policy if exists "reversa_emissoes_select" on public.reversa_emissoes;
create policy "reversa_emissoes_select" on public.reversa_emissoes
  for select to authenticated
  using (solicitacao_id in (select r.id from public.solicitacoes_reverso r));

drop policy if exists "reversa_emissao_eventos_select" on public.reversa_emissao_eventos;
create policy "reversa_emissao_eventos_select" on public.reversa_emissao_eventos
  for select to authenticated
  using (solicitacao_id in (select r.id from public.solicitacoes_reverso r));

revoke all on public.reversa_emissoes, public.reversa_emissao_eventos, public.vw_reversa_emissoes from anon, authenticated;
grant select on public.reversa_emissoes, public.reversa_emissao_eventos, public.vw_reversa_emissoes to authenticated;

revoke execute on function
  public.emissao_registrar_evento(public.reversa_emissoes, text, text, jsonb, boolean, text),
  public.emissoes_sincronizar_legado(uuid),
  public.emissoes_absorver_legado(uuid, boolean, boolean, text),
  public.emissao_validar_pdf(uuid, text),
  public.emissao_avancar_etapa(uuid, text),
  public.exigir_operacao_emissao(uuid, text),
  public.rastreio_indica_postagem(uuid, text),
  public.reversa_emissoes_proteger(),
  public.reversa_emissao_eventos_imutavel(),
  public.reversa_legado_proteger_espelho(),
  public.reversa_legado_para_emissoes(),
  public.solicitacoes_historico_autor()
from public, anon, authenticated;

revoke execute on function
  public.registrar_emissao_reversa(uuid, uuid, text, text, date, date, text, text, text, text, text, text),
  public.anexar_pdf_emissao(uuid, text, text, text),
  public.atualizar_dados_emissao(uuid, text, text, date, date),
  public.informar_envio_emissao(uuid, text, text),
  public.confirmar_postagem_emissao(uuid, date, text),
  public.desfazer_postagem_emissao(uuid, text),
  public.pode_operar_emissao(uuid, text),
  public.emissao_liberada_pela_aprovacao(uuid, text),
  public.pode_anexar_pdf_etiqueta(text),
  public.pode_apagar_pdf_etiqueta(text),
  public.emissao_normalizar_codigo(text),
  public.emissao_motivo_rotulo(text)
from public, anon;

grant execute on function
  public.registrar_emissao_reversa(uuid, uuid, text, text, date, date, text, text, text, text, text, text),
  public.anexar_pdf_emissao(uuid, text, text, text),
  public.atualizar_dados_emissao(uuid, text, text, date, date),
  public.informar_envio_emissao(uuid, text, text),
  public.confirmar_postagem_emissao(uuid, date, text),
  public.desfazer_postagem_emissao(uuid, text),
  public.pode_operar_emissao(uuid, text),
  public.emissao_liberada_pela_aprovacao(uuid, text),
  public.pode_anexar_pdf_etiqueta(text),
  public.pode_apagar_pdf_etiqueta(text),
  public.emissao_normalizar_codigo(text),
  public.emissao_motivo_rotulo(text)
to authenticated;

-- 12. Dados existentes → primeira emissão de cada reversa
-- Só reversas com PDF ou código de rastreio e ainda sem emissão: rodar de
-- novo não duplica. Datas ausentes continuam ausentes (emissão, validade).
-- Uma reversa com dado inconsistente não trava as demais: aparece no aviso e
-- na auditoria abaixo, com as colunas antigas intactas.
do $$
declare
  v_id uuid;
  v_criadas integer := 0;
  v_falhas integer := 0;
begin
  for v_id in
    select r.id
    from public.solicitacoes_reverso r
    where (r.etiqueta_path is not null or r.codigo_rastreio is not null)
      and not exists (select 1 from public.reversa_emissoes e where e.solicitacao_id = r.id)
    order by r.created_at
  loop
    begin
      v_criadas := v_criadas + public.emissoes_absorver_legado(v_id, true, true, 'migracao_legado');
    exception when others then
      v_falhas := v_falhas + 1;
      raise warning 'Reversa % não migrada para emissão: %', v_id, sqlerrm;
    end;
  end loop;
  raise notice 'Emissões criadas a partir dos dados anteriores: % (reversas com falha: %)', v_criadas, v_falhas;
end;
$$;

-- 13. Auditoria da migração (último resultado)
select
  (select count(*) from public.solicitacoes_reverso r
    where r.etiqueta_path is not null or r.codigo_rastreio is not null) as reversas_com_dados_anteriores,
  (select count(*) from public.reversa_emissoes e where e.origem = 'migracao_legado') as emissoes_migradas,
  (select count(*) from public.solicitacoes_reverso r
    where (r.etiqueta_path is not null or r.codigo_rastreio is not null)
      and not exists (select 1 from public.reversa_emissoes e where e.solicitacao_id = r.id)) as reversas_sem_emissao,
  -- Referência antiga preservada, mas o arquivo não estava no storage
  (select count(*) from public.reversa_emissoes e
    where e.origem = 'migracao_legado' and e.pdf_path is not null
      and not exists (select 1 from storage.objects o where o.bucket_id = 'etiquetas' and o.name = e.pdf_path)) as pdfs_migrados_sem_arquivo;

-- ============================================================
-- SOURCE: supabase/migrations/20261023120000_permissoes_capacidades.sql
-- ============================================================
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

-- ============================================================
-- SOURCE: supabase/migrations/20261023130000_motivos_reverso_endereco_troca.sql
-- ============================================================
-- Alinha os motivos do formulário e guarda o endereço da segunda cliente
-- quando a solicitação é de clientes trocados.
begin;

alter table public.solicitacoes_reverso
  add column if not exists endereco_destino_troca text;

comment on column public.solicitacoes_reverso.endereco_destino_troca is
  'Endereço da outra cliente quando o motivo da reversa é Clientes trocados.';

alter table public.solicitacoes_reverso
  drop constraint if exists solicitacoes_reverso_clientes_trocados_destino_check;

alter table public.solicitacoes_reverso
  add constraint solicitacoes_reverso_clientes_trocados_destino_check
  check (motivo <> 'Clientes trocados' or nullif(btrim(endereco_destino_troca), '') is not null);

-- Mantém valores antigos para preservar solicitações já registradas.
alter table public.solicitacoes_reverso
  drop constraint if exists solicitacoes_reverso_motivo_check;

alter table public.solicitacoes_reverso
  add constraint solicitacoes_reverso_motivo_check
  check (motivo = any (array[
    'Erro expedição – endereço incorreto',
    'Erro expedição – mercadoria trocada ou embalada junto',
    'Erro expedição – etiqueta ou pré-postagem',
    'Embalagem inadequada / avaria por embalagem',
    'Postagem duplicada',
    'Erro de faturamento / NF (destinatário ou endereço)',
    'Erro da expedição e do financeiro',
    'Erro vendedora – endereço incorreto',
    'Peça com defeito',
    'Mercadoria Errada',
    'Baixa qualidade no conserto',
    'Clientes trocados',
    'Mercadoria errada',
    'Endereço incorreto',
    'Outros'
  ]::text[]));

-- Inclui o endereço extra no controle de revisão da aprovação.
create or replace function public.reversa_campos_do_pedido_alterados(
  a public.solicitacoes_reverso,
  b public.solicitacoes_reverso
)
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
    case when a.endereco_destino_troca is distinct from b.endereco_destino_troca then 'Endereço da outra cliente' end,
    case when a.motivo is distinct from b.motivo then 'Motivo' end,
    case when a.justificativa_outros is distinct from b.justificativa_outros then 'Justificativa' end
  ]::text[], null);
$$;

-- A assinatura retorna uma coluna a mais, então recria a RPC da fila.
drop function if exists public.fila_aprovacao_reversas();

create function public.fila_aprovacao_reversas()
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
  endereco_destino_troca text,
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
    j.dados ->> 'endereco_destino_troca',
    r.motivo,
    r.justificativa_outros,
    j.dados ->> 'solicitado_por_nome',
    coalesce(nullif(j.dados ->> 'aprovacao_versao', '')::integer, 1),
    r.nc_id,
    case when nc.numero is null then null
      else 'NC-' || lpad(nc.numero::text, greatest(4, length(nc.numero::text)), '0') end,
    nc.origem,
    nc.descricao,
    p.proprio,
    not p.proprio or coalesce((select c.permitir_autoaprovacao from public.aprovacao_config c where c.id), false)
  from public.solicitacoes_reverso r
  left join public.nao_conformidades nc on nc.id = r.nc_id
  cross join lateral (select to_jsonb(r) as dados) j
  cross join lateral (
    -- Sem os campos de autoria, não dá para provar que o aprovador é outra
    -- pessoa. Trava a aprovação até a migration do fluxo de aprovação ser aplicada.
    select case
      when nullif(j.dados ->> 'solicitado_por', '') is null
        or nullif(j.dados ->> 'aprovacao_versao_por', '') is null then true
      else coalesce((j.dados ->> 'solicitado_por')::uuid = auth.uid(), false)
        or coalesce((j.dados ->> 'aprovacao_versao_por')::uuid = auth.uid(), false)
    end as proprio
  ) p
  where coalesce(j.dados ->> 'aprovacao_status', j.dados ->> 'status') = 'aguardando_aprovacao'
    and r.empresa = any (public.empresas_aprovaveis())
  order by r.created_at, r.id;
$$;

revoke execute on function public.fila_aprovacao_reversas() from public, anon;
grant execute on function public.fila_aprovacao_reversas() to authenticated, service_role;

commit;

-- ============================================================
-- SOURCE: supabase/migrations/20261023140000_checkin_rastreio.sql
-- ============================================================
-- Permite conferir e salvar o código de rastreio na fila de check-in.
-- O escopo fica restrito a pedidos ainda aguardando check-in; emissão e
-- confirmação de postagem mantêm suas permissões atuais.
create or replace function public.pode_operar_emissao(p_solicitacao_id uuid, p_operacao text) returns boolean
language sql stable security definer
set search_path = ''
as $$
  select p_operacao in ('registrar', 'anexar_pdf', 'dados', 'envio', 'postagem')
    and exists (
      select 1
      from public.solicitacoes_reverso r
      where r.id = p_solicitacao_id
        and (
          r.empresa = any (public.empresas_operacao_emissao(p_operacao))
          or (
            p_operacao = 'dados'
            and r.status = 'etiqueta_gerada'
            and r.empresa = any (public.empresas_checkin())
          )
        )
    )
    and public.emissao_liberada_pela_aprovacao(p_solicitacao_id, p_operacao);
$$;

comment on function public.pode_operar_emissao(uuid, text) is
  'Autoriza operações de emissão; check-in também pode corrigir dados de rastreio somente enquanto o pedido aguarda check-in.';

-- ============================================================
-- SOURCE: supabase/migrations/20261023150000_recebimento_mercadoria.sql
-- ============================================================
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

-- ============================================================
-- SOURCE: supabase/migrations/20261023160000_meus_pedidos_autoria_rls.sql
-- ============================================================
-- Autoria do solicitante e leitura segura de Meus Pedidos.
-- Pedidos antigos permanecem sem autor verificável; nenhuma associação é feita por nome.

create or replace function public.empresas_consulta_ampliada() returns text[]
language sql stable security definer
set search_path = ''
as $$
  select case
    when public.is_admin()
      or public.current_telas() && array[
        'dashboard-geral', 'lista-geral', 'status-geral', 'kanban', 'kanban-edit', 'nc', 'nc-edit'
      ]::text[]
      then array['Alinare', 'Novitah']::text[]
    else array(
      select distinct e
      from unnest(
        array_remove(array[
          case when public.current_telas() && array['dashboard-alinare', 'lista-alinare', 'status-alinare']::text[] then 'Alinare' end,
          case when public.current_telas() && array['dashboard-novitah', 'lista-novitah', 'status-novitah']::text[] then 'Novitah' end
        ]::text[], null)
        || case
          when public.current_telas() && array['aprovar-reversa', 'emitir-etiqueta', 'confirmar-checkin']::text[]
            then public.current_empresas_acesso()
          else '{}'::text[]
        end
      ) as escopo(e)
      where e in ('Alinare', 'Novitah')
    )
  end;
$$;

-- Security definer evita recursão no RLS e preserva os acessos de leitura
-- ampliados já concedidos. Capacidades de aprovação, etiqueta e check-in valem
-- apenas nas empresas explicitamente cadastradas em empresas_acesso.
create or replace function public.pode_ler_solicitacao(p_solicitacao_id uuid) returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.solicitacoes_reverso r
    where r.id = p_solicitacao_id
      and (
        r.empresa = any (public.empresas_consulta_ampliada())
        or (
          auth.uid() is not null
          and r.solicitado_por = auth.uid()
          and r.empresa = any (public.empresas_formulario())
        )
      )
  );
$$;

revoke execute on function public.empresas_consulta_ampliada(), public.pode_ler_solicitacao(uuid)
  from public, anon;
grant execute on function public.empresas_consulta_ampliada(), public.pode_ler_solicitacao(uuid)
  to authenticated, service_role;

-- Substitui a policy ampla por empresa; permissive policies em PostgreSQL se somam.
drop policy if exists "select_solicitacoes_por_escopo" on public.solicitacoes_reverso;
create policy "select_solicitacoes_por_escopo" on public.solicitacoes_reverso
  for select to authenticated
  using (public.pode_ler_solicitacao(id));

-- O autor exibido também vem do servidor em novas solicitações autenticadas.
-- solicitado_por continua sendo a chave de propriedade; nenhuma linha antiga é alterada.
create or replace function public.reversa_solicitante_autenticado() returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  if auth.uid() is not null then
    new.solicitante := coalesce(public.usuario_nome(auth.uid()), 'Usuário ' || auth.uid()::text);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_zzz_reversa_solicitante_autenticado on public.solicitacoes_reverso;
create trigger trg_zzz_reversa_solicitante_autenticado
  before insert on public.solicitacoes_reverso
  for each row execute function public.reversa_solicitante_autenticado();
revoke execute on function public.reversa_solicitante_autenticado() from public, anon, authenticated, service_role;

-- Histórico de operação e aprovação acompanha a visibilidade da própria solicitação.
drop policy if exists "select_historico" on public.solicitacoes_historico;
create policy "select_historico" on public.solicitacoes_historico
  for select to authenticated
  using (public.pode_ler_solicitacao(solicitacao_id));

drop policy if exists "aprovacoes_select" on public.solicitacoes_aprovacoes;
create policy "aprovacoes_select" on public.solicitacoes_aprovacoes
  for select to authenticated
  using (public.pode_ler_solicitacao(solicitacao_id));

-- Rastreio, emissões e eventos também não podem revelar registros fora do escopo.
drop policy if exists "select_rastreamento" on public.rastreamento_correios;
create policy "select_rastreamento" on public.rastreamento_correios
  for select to authenticated
  using (public.pode_ler_solicitacao(solicitacao_id));

drop policy if exists "reversa_emissoes_select" on public.reversa_emissoes;
create policy "reversa_emissoes_select" on public.reversa_emissoes
  for select to authenticated
  using (public.pode_ler_solicitacao(solicitacao_id));

drop policy if exists "reversa_emissao_eventos_select" on public.reversa_emissao_eventos;
create policy "reversa_emissao_eventos_select" on public.reversa_emissao_eventos
  for select to authenticated
  using (public.pode_ler_solicitacao(solicitacao_id));

-- A etiqueta continua privada e temporária; a policy não libera leitura por empresa.
create or replace function public.pode_acessar_etiqueta(p_objeto text) returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.solicitacoes_reverso r
    where r.id::text = split_part(p_objeto, '/', 1)
      and public.pode_ler_solicitacao(r.id)
  )
  or (
    public.is_admin()
    and not exists (
      select 1 from public.solicitacoes_reverso r
      where r.id::text = split_part(p_objeto, '/', 1)
    )
  );
$$;

drop policy if exists "etiquetas_select" on storage.objects;
create policy "etiquetas_select" on storage.objects
  for select to authenticated
  using (bucket_id = 'etiquetas' and public.pode_acessar_etiqueta(name));

revoke execute on function public.pode_acessar_etiqueta(text) from public, anon;
grant execute on function public.pode_acessar_etiqueta(text) to authenticated, service_role;

-- ============================================================
-- SOURCE: supabase/migrations/20261023170000_politica_leitura_insert_reversa.sql
-- ============================================================
begin;

-- INSERT ... RETURNING avalia a política SELECT antes de a nova linha estar
-- consultável por uma busca na própria solicitacoes_reverso. A política da
-- tabela principal usa os campos da linha diretamente; tabelas relacionadas
-- continuam usando pode_ler_solicitacao(id).
drop policy if exists "select_solicitacoes_por_escopo" on public.solicitacoes_reverso;
create policy "select_solicitacoes_por_escopo" on public.solicitacoes_reverso
  for select to authenticated
  using (
    empresa = any (public.empresas_consulta_ampliada())
    or (
      auth.uid() is not null
      and solicitado_por = auth.uid()
      and empresa = any (public.empresas_formulario())
    )
  );

commit;

-- ============================================================
-- SOURCE: supabase/migrations/20261023180000_revogar_execucao_usuario_nome.sql
-- ============================================================
-- `usuario_nome` só é usada por triggers e funções internas autorizadas.
-- A migration de capacidades concedeu EXECUTE em lote para authenticated;
-- esta revogação restaura o limite sem alterar os caminhos SECURITY DEFINER.
revoke execute on function public.usuario_nome(uuid)
  from public, anon, authenticated;
-- The same blanket grant reopened this internal record-comparison helper.
revoke execute on function public.reversa_campos_do_pedido_alterados(
  public.solicitacoes_reverso,
  public.solicitacoes_reverso
)
  from public, anon, authenticated;

-- ============================================================
-- SOURCE: supabase/migrations/20261023190000_aprovadores_empresa_setor.sql
-- ============================================================
-- Escopo de aprovação por empresa e setor do pedido.
-- A capacidade existente (aprovar-reversa + empresas_acesso) continua necessária.
-- A carga inicial preserva somente usuários que já tinham essa capacidade,
-- atribuindo explicitamente todos os setores daquela empresa.

begin;

create table if not exists public.reversa_aprovadores_setor (
  empresa text not null check (empresa in ('Alinare', 'Novitah')),
  usuario_id uuid not null references auth.users(id) on delete cascade,
  todos_setores boolean not null default false,
  setores text[] not null default '{}'::text[],
  alterado_em timestamptz not null default now(),
  alterado_por uuid references auth.users(id) on delete set null,
  constraint reversa_aprovadores_setor_pk primary key (empresa, usuario_id),
  constraint reversa_aprovadores_setor_escopo_valido check (
    (todos_setores and cardinality(setores) = 0)
    or (not todos_setores and cardinality(setores) > 0)
  )
);

comment on table public.reversa_aprovadores_setor is
  'Escopo por empresa e setor de origem para usuários que já possuem a capacidade aprovar-reversa.';

alter table public.reversa_aprovadores_setor enable row level security;
revoke all on table public.reversa_aprovadores_setor from public, anon, authenticated;

create table if not exists public.reversa_aprovadores_setor_auditoria (
  id bigint generated always as identity primary key,
  empresa text not null check (empresa in ('Alinare', 'Novitah')),
  alterado_por uuid not null references auth.users(id),
  alterado_por_nome text not null,
  alterado_em timestamptz not null default now(),
  configuracao_anterior jsonb not null,
  configuracao_nova jsonb not null
);

alter table public.reversa_aprovadores_setor_auditoria enable row level security;
revoke all on table public.reversa_aprovadores_setor_auditoria from public, anon, authenticated;

-- Compatibilidade: capacidade atual, empresa atual, todos os setores.
-- Não usa nome, perfil de gestão, nem permissões de consulta.
insert into public.reversa_aprovadores_setor
  (empresa, usuario_id, todos_setores, setores, alterado_por)
select distinct e.value, u.id, true, '{}'::text[], null::uuid
from auth.users u
cross join lateral jsonb_array_elements_text(
  case when jsonb_typeof(u.raw_app_meta_data -> 'empresas_acesso') = 'array'
    then u.raw_app_meta_data -> 'empresas_acesso' else '[]'::jsonb end
) as e(value)
where e.value in ('Alinare', 'Novitah')
  and coalesce(u.raw_app_meta_data -> 'telas', '[]'::jsonb) ? 'aprovar-reversa'
on conflict (empresa, usuario_id) do nothing;

create or replace function public.usuario_pode_aprovar_reversa(p_empresa text, p_setor text)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select auth.uid() is not null
    and p_empresa = any (public.empresas_aprovaveis())
    and exists (
      select 1
      from public.reversa_aprovadores_setor a
      where a.empresa = p_empresa
        and a.usuario_id = auth.uid()
        and (a.todos_setores or p_setor = any (a.setores))
    );
$$;

revoke all on function public.usuario_pode_aprovar_reversa(text, text) from public, anon, authenticated;

create or replace function public.listar_config_aprovadores_reversa()
returns jsonb
language plpgsql stable security definer
set search_path = ''
as $$
declare
  v_resultado jsonb;
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'Somente administradores podem consultar a configuração de aprovadores.' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'setores', coalesce((
      select jsonb_agg(jsonb_build_object('empresa', s.empresa, 'setor', s.setor) order by s.empresa, s.setor)
      from (
        select distinct r.empresa, r.setor
        from public.solicitacoes_reverso r
        where r.empresa in ('Alinare', 'Novitah') and nullif(btrim(r.setor), '') is not null
        union
        select a.empresa, unnest(a.setores)
        from public.reversa_aprovadores_setor a
        where not a.todos_setores
      ) s
    ), '[]'::jsonb),
    'configuracoes', coalesce((
      select jsonb_agg(jsonb_build_object(
        'empresa', a.empresa,
        'usuario_id', a.usuario_id,
        'todos_setores', a.todos_setores,
        'setores', to_jsonb(a.setores)
      ) order by a.empresa, a.usuario_id)
      from public.reversa_aprovadores_setor a
    ), '[]'::jsonb)
  ) into v_resultado;

  return v_resultado;
end;
$$;

revoke all on function public.listar_config_aprovadores_reversa() from public, anon, authenticated;
grant execute on function public.listar_config_aprovadores_reversa() to authenticated;

create or replace function public.salvar_config_aprovadores_reversa(p_empresa text, p_configuracao jsonb)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_nome text;
  v_anterior jsonb;
  v_nova jsonb;
  v_item jsonb;
  v_usuario uuid;
  v_todos boolean;
  v_setores text[];
  v_ids uuid[] := '{}'::uuid[];
begin
  if v_uid is null or not public.is_admin() then
    raise exception 'Somente administradores podem alterar a configuração de aprovadores.' using errcode = '42501';
  end if;
  if p_empresa is null or p_empresa not in ('Alinare', 'Novitah') then
    raise exception 'Empresa inválida para configuração de aprovadores.' using errcode = '22023';
  end if;
  if jsonb_typeof(p_configuracao) is distinct from 'array' then
    raise exception 'A configuração de aprovadores deve ser uma lista.' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtext('reversa_aprovadores:' || p_empresa));

  select coalesce(jsonb_agg(jsonb_build_object(
    'usuario_id', a.usuario_id,
    'todos_setores', a.todos_setores,
    'setores', to_jsonb(a.setores)
  ) order by a.usuario_id), '[]'::jsonb)
    into v_anterior
  from public.reversa_aprovadores_setor a
  where a.empresa = p_empresa;

  for v_item in select value from jsonb_array_elements(p_configuracao)
  loop
    if jsonb_typeof(v_item) is distinct from 'object'
      or jsonb_typeof(v_item -> 'usuario_id') is distinct from 'string'
      or jsonb_typeof(v_item -> 'todos_setores') is distinct from 'boolean'
      or jsonb_typeof(v_item -> 'setores') is distinct from 'array' then
      raise exception 'Cada aprovador deve informar usuário, escopo e setores.' using errcode = '22023';
    end if;

    v_usuario := (v_item ->> 'usuario_id')::uuid;
    v_todos := (v_item ->> 'todos_setores')::boolean;
    select coalesce(array_agg(distinct btrim(value) order by btrim(value)), '{}'::text[])
      into v_setores
    from jsonb_array_elements_text(v_item -> 'setores') as s(value);

    if v_usuario = any(v_ids) then
      raise exception 'Um usuário só pode aparecer uma vez por empresa.' using errcode = '22023';
    end if;
    v_ids := array_append(v_ids, v_usuario);
    if (v_todos and cardinality(v_setores) <> 0)
      or (not v_todos and cardinality(v_setores) = 0)
      or array_position(v_setores, '') is not null then
      raise exception 'Selecione todos os setores ou um ou mais setores específicos.' using errcode = '22023';
    end if;
    if not exists (
      select 1
      from auth.users u
      where u.id = v_usuario
        and coalesce(u.raw_app_meta_data -> 'telas', '[]'::jsonb) ? 'aprovar-reversa'
        and coalesce(u.raw_app_meta_data -> 'empresas_acesso', '[]'::jsonb) ? p_empresa
    ) then
      raise exception 'O usuário selecionado não possui capacidade de aprovação para esta empresa.' using errcode = '42501';
    end if;
  end loop;

  select coalesce(jsonb_agg(jsonb_build_object(
    'usuario_id', (item ->> 'usuario_id')::uuid,
    'todos_setores', (item ->> 'todos_setores')::boolean,
    'setores', to_jsonb(array(
      select distinct btrim(value) from jsonb_array_elements_text(item -> 'setores') as s(value)
      order by 1
    ))
  ) order by (item ->> 'usuario_id')::uuid), '[]'::jsonb)
    into v_nova
  from jsonb_array_elements(p_configuracao) as config(item);

  if v_anterior is distinct from v_nova then
    delete from public.reversa_aprovadores_setor where empresa = p_empresa;
    insert into public.reversa_aprovadores_setor
      (empresa, usuario_id, todos_setores, setores, alterado_por, alterado_em)
    select p_empresa,
      (item ->> 'usuario_id')::uuid,
      (item ->> 'todos_setores')::boolean,
      array(select distinct btrim(value) from jsonb_array_elements_text(item -> 'setores') as s(value) order by 1),
      v_uid,
      now()
    from jsonb_array_elements(v_nova) as config(item);

    v_nome := coalesce(public.usuario_nome(v_uid), 'Usuário ' || v_uid::text);
    insert into public.reversa_aprovadores_setor_auditoria
      (empresa, alterado_por, alterado_por_nome, configuracao_anterior, configuracao_nova)
    values (p_empresa, v_uid, v_nome, v_anterior, v_nova);
  end if;
end;
$$;

revoke all on function public.salvar_config_aprovadores_reversa(text, jsonb) from public, anon, authenticated;
grant execute on function public.salvar_config_aprovadores_reversa(text, jsonb) to authenticated;

-- A definição e o contrato de retorno da fila permanecem os mesmos; muda apenas
-- o predicado de autorização para usar a empresa e o setor registrados no pedido.
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
  endereco_destino_troca text,
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
    r.endereco_destino_troca,
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
  cross join lateral (
    select coalesce(r.solicitado_por = auth.uid(), false) or coalesce(r.aprovacao_versao_por = auth.uid(), false) as proprio
  ) p
  where r.aprovacao_status = 'aguardando_aprovacao'
    and public.usuario_pode_aprovar_reversa(r.empresa, r.setor)
  order by r.created_at, r.id;
$$;

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
  if not found then
    raise exception 'Solicitação não encontrada ou fora das combinações de empresa e setor que você aprova.' using errcode = '42501';
  end if;
  -- Usa o mesmo lock da configuração para que uma revogação e uma decisão
  -- concorrentes sejam serializadas antes da revalidação da autorização.
  perform pg_advisory_xact_lock(hashtext('reversa_aprovadores:' || v_r.empresa));
  if not public.usuario_pode_aprovar_reversa(v_r.empresa, v_r.setor) then
    raise exception 'Solicitação não encontrada ou fora das combinações de empresa e setor que você aprova.' using errcode = '42501';
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

commit;

-- ============================================================
-- SOURCE: supabase/migrations/20261023200000_notificacoes_aprovacao_expedicao.sql
-- ============================================================
-- Notificações internas para emissores, ligadas atomicamente à aprovação.
-- O trigger criado agora não processa retroativamente o histórico já existente.
begin;

create table if not exists public.reversa_notificacoes_emissao (
  id uuid primary key default gen_random_uuid(),
  solicitacao_id uuid not null references public.solicitacoes_reverso (id) on delete cascade,
  empresa text not null check (empresa in ('Alinare', 'Novitah')),
  aprovacao_versao integer not null check (aprovacao_versao > 0),
  destinatario_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  lida_em timestamptz,
  constraint reversa_notificacoes_emissao_evento_destinatario_uk
    unique (solicitacao_id, aprovacao_versao, destinatario_id)
);

comment on table public.reversa_notificacoes_emissao is
  'Avisos privados para emissores, derivados de aprovações confirmadas; não representam mudança logística.';

create index if not exists idx_reversa_notificacoes_emissao_destinatario_recente
  on public.reversa_notificacoes_emissao (destinatario_id, created_at desc);

alter table public.reversa_notificacoes_emissao enable row level security;
revoke all on table public.reversa_notificacoes_emissao from public, anon, authenticated;

create or replace function public.criar_notificacoes_emissao_apos_aprovacao()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.evento <> 'aprovada' then
    return new;
  end if;

  insert into public.reversa_notificacoes_emissao
    (solicitacao_id, empresa, aprovacao_versao, destinatario_id)
  select new.solicitacao_id, new.empresa, new.versao, u.id
  from auth.users u
  where coalesce(u.raw_app_meta_data -> 'telas', '[]'::jsonb) ? 'emitir-etiqueta'
    and coalesce(u.raw_app_meta_data -> 'empresas_acesso', '[]'::jsonb) ? new.empresa
  on conflict (solicitacao_id, aprovacao_versao, destinatario_id) do nothing;

  return new;
end;
$$;

revoke all on function public.criar_notificacoes_emissao_apos_aprovacao() from public, anon, authenticated;

drop trigger if exists reversa_notificacoes_emissao_apos_aprovacao on public.solicitacoes_aprovacoes;
create trigger reversa_notificacoes_emissao_apos_aprovacao
  after insert on public.solicitacoes_aprovacoes
  for each row execute function public.criar_notificacoes_emissao_apos_aprovacao();

create or replace function public.listar_notificacoes_emissao()
returns table (
  id uuid,
  solicitacao_id uuid,
  empresa text,
  created_at timestamptz,
  lida_em timestamptz,
  nao_lidas_total integer
)
language sql
stable
security definer
set search_path = ''
as $$
  select n.id, n.solicitacao_id, n.empresa, n.created_at, n.lida_em,
    (count(*) filter (where n.lida_em is null) over ())::integer
  from public.reversa_notificacoes_emissao n
  where auth.uid() is not null
    and n.destinatario_id = auth.uid()
    and exists (
      select 1
      from auth.users u
      where u.id = auth.uid()
        and coalesce(u.raw_app_meta_data -> 'telas', '[]'::jsonb) ? 'emitir-etiqueta'
        and coalesce(u.raw_app_meta_data -> 'empresas_acesso', '[]'::jsonb) ? n.empresa
    )
    and exists (
      select 1 from public.solicitacoes_reverso r
      where r.id = n.solicitacao_id and r.empresa = n.empresa
    )
  order by n.created_at desc, n.id desc
  limit 50;
$$;

revoke all on function public.listar_notificacoes_emissao() from public, anon, authenticated;
grant execute on function public.listar_notificacoes_emissao() to authenticated;

create or replace function public.marcar_notificacao_emissao_lida(p_notificacao_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lida boolean := false;
begin
  if auth.uid() is null then
    return false;
  end if;

  update public.reversa_notificacoes_emissao n
     set lida_em = coalesce(n.lida_em, now())
   where n.id = p_notificacao_id
     and n.destinatario_id = auth.uid()
     and exists (
       select 1 from auth.users u
       where u.id = auth.uid()
         and coalesce(u.raw_app_meta_data -> 'telas', '[]'::jsonb) ? 'emitir-etiqueta'
         and coalesce(u.raw_app_meta_data -> 'empresas_acesso', '[]'::jsonb) ? n.empresa
     )
     and exists (
       select 1 from public.solicitacoes_reverso r
       where r.id = n.solicitacao_id and r.empresa = n.empresa
     );

  v_lida := found;
  return v_lida;
end;
$$;

revoke all on function public.marcar_notificacao_emissao_lida(uuid) from public, anon, authenticated;
grant execute on function public.marcar_notificacao_emissao_lida(uuid) to authenticated;

commit;

-- ============================================================
-- SOURCE: supabase/migrations/20261026200000_comunicacao_etiqueta_solicitante.sql
-- ============================================================
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

-- ============================================================
-- SOURCE: supabase/migrations/20261026210000_comunicacao_resultado_indeterminado.sql
-- ============================================================
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

-- ============================================================
-- SOURCE: supabase/migrations/20261026220000_comunicacao_eventos_logistica.sql
-- ============================================================
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

-- ============================================================
-- SOURCE: supabase/migrations/20261027100000_comunicacao_ciclo_pedido.sql
-- ============================================================
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

-- ============================================================
-- SOURCE: supabase/migrations/20261027110000_comunicacao_reconciliacao_admin.sql
-- ============================================================
-- Reconciliação administrativa de comunicações com resultado indeterminado.
-- Consulta e ação ficam no banco e exigem a capacidade administrativa existente
-- (is_admin(): tela "usuarios" ou perfil ADMIN). Gestores e solicitantes não ganham
-- acesso. Não há ação em lote: cada ação atua sobre uma única comunicação.
begin;

create table if not exists public.reversa_comunicacoes_reconciliacoes (
  id uuid primary key default gen_random_uuid(),
  comunicacao_id uuid not null references public.reversa_comunicacoes_etiqueta(id) on delete cascade,
  acao text not null check (acao in ('confirmar_conclusao_conector', 'autorizar_nova_tentativa')),
  administrador_id uuid references auth.users(id) on delete set null,
  administrador_nome text not null,
  realizado_em timestamptz not null default now(),
  justificativa text not null check (char_length(justificativa) between 10 and 1000),
  referencia text not null check (char_length(referencia) between 3 and 200),
  status_anterior text not null,
  status_novo text not null,
  valores_anteriores jsonb not null,
  valores_novos jsonb not null
);
create index if not exists reversa_comunicacoes_reconciliacoes_idx
  on public.reversa_comunicacoes_reconciliacoes (comunicacao_id, realizado_em desc);
comment on table public.reversa_comunicacoes_reconciliacoes is
  'Auditoria imutável (sem update; sem privilégio de delete, exceto a cascata da exclusão autorizada do pedido) das reconciliações manuais de comunicações com resultado_indeterminado.';
alter table public.reversa_comunicacoes_reconciliacoes enable row level security;
revoke all on table public.reversa_comunicacoes_reconciliacoes from public, anon, authenticated;

create or replace function public.reversa_comunicacoes_reconciliacoes_imutavel()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'A auditoria de reconciliação não pode ser alterada.' using errcode = '42501';
end;
$$;
revoke all on function public.reversa_comunicacoes_reconciliacoes_imutavel()
  from public, anon, authenticated, service_role;
drop trigger if exists reversa_comunicacoes_reconciliacoes_imutavel on public.reversa_comunicacoes_reconciliacoes;
create trigger reversa_comunicacoes_reconciliacoes_imutavel
  before update on public.reversa_comunicacoes_reconciliacoes
  for each row execute function public.reversa_comunicacoes_reconciliacoes_imutavel();

create or replace function public.listar_comunicacoes_reversa(
  p_status text default null,
  p_evento text default null,
  p_canal text default null,
  p_solicitacao_id uuid default null,
  p_limite integer default 50,
  p_deslocamento integer default 0
) returns table (
  id uuid,
  solicitacao_id uuid,
  pedido text,
  empresa text,
  evento text,
  canal text,
  destinatario_nome text,
  destinatario_email text,
  status text,
  tentativas integer,
  max_tentativas integer,
  criado_em timestamptz,
  atualizado_em timestamptz,
  proxima_tentativa_em timestamptz,
  acao_conector_em timestamptz,
  ultimo_erro text,
  reconciliacoes integer,
  total bigint
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
  select c.id,
         c.solicitacao_id,
         'RV-' || upper(substr(c.solicitacao_id::text, 1, 8)),
         c.empresa,
         c.evento,
         c.canal,
         coalesce(public.usuario_nome(c.destinatario_id), 'Sem usuário'),
         u.email::text,
         c.status,
         c.tentativas,
         c.max_tentativas,
         c.criado_em,
         c.atualizado_em,
         c.proxima_tentativa_em,
         c.aceito_pelo_fluxo_em,
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
        'iniciada_em', t.iniciada_em,
        'finalizada_em', t.finalizada_em,
        'resultado', t.resultado,
        'http_status', t.http_status,
        'detalhe', left(regexp_replace(coalesce(t.detalhe, ''), '[[:cntrl:]]+', ' ', 'g'), 300)
      ) order by t.iniciada_em)
      from public.reversa_comunicacoes_etiqueta_tentativas t
      where t.comunicacao_id = p_comunicacao_id
    ), '[]'::jsonb),
    'reconciliacoes', coalesce((
      select jsonb_agg(jsonb_build_object(
        'acao', r.acao,
        'administrador_nome', r.administrador_nome,
        'realizado_em', r.realizado_em,
        'justificativa', r.justificativa,
        'referencia', r.referencia,
        'status_anterior', r.status_anterior,
        'status_novo', r.status_novo,
        'valores_anteriores', r.valores_anteriores,
        'valores_novos', r.valores_novos
      ) order by r.realizado_em)
      from public.reversa_comunicacoes_reconciliacoes r
      where r.comunicacao_id = p_comunicacao_id
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.resumo_comunicacoes_reversa()
returns jsonb
language plpgsql stable security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'Somente administradores consultam as comunicações.' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_object_agg(s.status, s.quantidade)
    from (select c.status, count(*)::integer as quantidade
            from public.reversa_comunicacoes_etiqueta c group by c.status) s
  ), '{}'::jsonb);
end;
$$;

-- Ação sobre UMA comunicação em resultado_indeterminado, após conferência externa.
--  confirmar_conclusao_conector: a execução do fluxo comprova que a ação do conector
--    ocorreu; a linha passa a acao_conector_concluida (não prova entrega nem leitura).
--  autorizar_nova_tentativa: há evidência de que nada foi enviado; a linha volta à fila
--    e o worker revalida pertinência, acesso e destinatário antes de qualquer envio.
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

  -- A trava de linha serializa administradores concorrentes e faz o worker pular a linha.
  select c.* into v_c from public.reversa_comunicacoes_etiqueta c
   where c.id = p_comunicacao_id for update;
  if not found then
    raise exception 'Comunicação não encontrada.' using errcode = 'P0002';
  end if;
  if v_c.status <> 'resultado_indeterminado' then
    raise exception 'Só comunicações com resultado indeterminado podem ser reconciliadas (situação atual: %).', v_c.status
      using errcode = '55000';
  end if;

  v_antes := jsonb_build_object(
    'status', v_c.status, 'tentativas', v_c.tentativas, 'max_tentativas', v_c.max_tentativas,
    'proxima_tentativa_em', v_c.proxima_tentativa_em, 'acao_conector_em', v_c.aceito_pelo_fluxo_em,
    'ultimo_erro', v_c.ultimo_erro);

  if p_acao = 'confirmar_conclusao_conector' then
    update public.reversa_comunicacoes_etiqueta
       set status = 'acao_conector_concluida', aceito_pelo_fluxo_em = now(),
           ultimo_erro = null, lock_token = null, lock_expira_em = null, atualizado_em = now()
     where id = v_c.id
    returning * into v_n;
  else
    if v_c.tentativas >= 20 then
      raise exception 'A comunicação atingiu o limite máximo absoluto de tentativas.' using errcode = '55000';
    end if;
    update public.reversa_comunicacoes_etiqueta
       set status = 'pendente', max_tentativas = greatest(max_tentativas, tentativas + 1),
           proxima_tentativa_em = now(), lock_token = null, lock_expira_em = null, atualizado_em = now()
     where id = v_c.id
    returning * into v_n;
  end if;

  v_depois := jsonb_build_object(
    'status', v_n.status, 'tentativas', v_n.tentativas, 'max_tentativas', v_n.max_tentativas,
    'proxima_tentativa_em', v_n.proxima_tentativa_em, 'acao_conector_em', v_n.aceito_pelo_fluxo_em,
    'ultimo_erro', v_n.ultimo_erro);
  v_nome := coalesce(public.usuario_nome(v_uid), 'Usuário ' || v_uid::text);

  insert into public.reversa_comunicacoes_reconciliacoes
    (comunicacao_id, acao, administrador_id, administrador_nome, justificativa, referencia,
     status_anterior, status_novo, valores_anteriores, valores_novos)
  values (v_c.id, p_acao, v_uid, v_nome, v_justificativa, v_referencia,
          v_c.status, v_n.status, v_antes, v_depois);

  return jsonb_build_object('id', v_n.id, 'status', v_n.status, 'max_tentativas', v_n.max_tentativas);
end;
$$;

revoke all on function public.listar_comunicacoes_reversa(text, text, text, uuid, integer, integer)
  from public, anon, authenticated, service_role;
revoke all on function public.listar_historico_comunicacao_reversa(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.resumo_comunicacoes_reversa()
  from public, anon, authenticated, service_role;
revoke all on function public.reconciliar_comunicacao_reversa(uuid, text, text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.listar_comunicacoes_reversa(text, text, text, uuid, integer, integer) to authenticated;
grant execute on function public.listar_historico_comunicacao_reversa(uuid) to authenticated;
grant execute on function public.resumo_comunicacoes_reversa() to authenticated;
grant execute on function public.reconciliar_comunicacao_reversa(uuid, text, text, text) to authenticated;

commit;

-- ============================================================
-- SOURCE: supabase/migrations/20261027120000_relatorios_reversa.sql
-- ============================================================
-- Relatórios de gestão por empresa e período.
-- As funções são SECURITY INVOKER: a RLS de solicitacoes_reverso, reversa_emissoes e
-- reversa_recebimentos_confirmados (pode_ler_solicitacao) define o escopo de quem consulta.
-- Contagens apenas. O modelo da reversa não guarda custo de frete, tarifa dos Correios
-- nem economia: nenhum valor monetário é calculado ou estimado aqui.
begin;

-- O motivo "Mercadoria errada" (valor antigo, mantido para pedidos já registrados) e
-- "Mercadoria Errada" (valor atual) são o mesmo motivo; os relatórios os contam juntos.
create or replace function public.reversa_motivo_normalizado(p_motivo text)
returns text
language sql immutable
set search_path = ''
as $$
  select case when lower(p_motivo) = 'mercadoria errada' then 'Mercadoria Errada' else p_motivo end;
$$;
revoke all on function public.reversa_motivo_normalizado(text) from public, anon;
grant execute on function public.reversa_motivo_normalizado(text) to authenticated;

-- Pedidos do recorte. A data filtrada é sempre explícita (p_campo_data):
--   solicitacao: data_solicitacao
--   decisao:     data (America/Sao_Paulo) da decisão de aprovação
--   emissao:     pedidos com ao menos uma emissão cuja data de emissão está no período
--   postagem:    pedidos com ao menos uma postagem confirmada no período
create or replace function public.reversa_relatorio_base(
  p_empresa text,
  p_campo_data text,
  p_inicio date,
  p_fim date
) returns setof public.solicitacoes_reverso
language plpgsql stable security invoker
set search_path = ''
as $$
begin
  if p_empresa is not null and p_empresa not in ('Alinare', 'Novitah') then
    raise exception 'Empresa inválida.' using errcode = '22023';
  end if;
  if p_campo_data is null or p_campo_data not in ('solicitacao', 'decisao', 'emissao', 'postagem') then
    raise exception 'Informe qual data filtrar: solicitacao, decisao, emissao ou postagem.' using errcode = '22023';
  end if;
  if p_inicio is not null and p_fim is not null and p_inicio > p_fim then
    raise exception 'O início do período não pode ser posterior ao fim.' using errcode = '22023';
  end if;

  return query
  select r.*
    from public.solicitacoes_reverso r
   where (p_empresa is null or r.empresa = p_empresa)
     and case p_campo_data
       when 'solicitacao' then
         (p_inicio is null or r.data_solicitacao >= p_inicio)
         and (p_fim is null or r.data_solicitacao <= p_fim)
       when 'decisao' then
         r.aprovacao_decidida_em is not null
         and (p_inicio is null or (r.aprovacao_decidida_em at time zone 'America/Sao_Paulo')::date >= p_inicio)
         and (p_fim is null or (r.aprovacao_decidida_em at time zone 'America/Sao_Paulo')::date <= p_fim)
       when 'emissao' then
         exists (select 1 from public.reversa_emissoes e
                  where e.solicitacao_id = r.id and e.emitida_em is not null
                    and (p_inicio is null or e.emitida_em >= p_inicio)
                    and (p_fim is null or e.emitida_em <= p_fim))
       else
         exists (select 1 from public.reversa_emissoes e
                  where e.solicitacao_id = r.id and e.postagem_confirmada_em is not null
                    and (p_inicio is null or (e.postagem_confirmada_em at time zone 'America/Sao_Paulo')::date >= p_inicio)
                    and (p_fim is null or (e.postagem_confirmada_em at time zone 'America/Sao_Paulo')::date <= p_fim))
     end;
end;
$$;

create or replace function public.relatorio_reversa(
  p_empresa text default null,
  p_campo_data text default 'solicitacao',
  p_inicio date default null,
  p_fim date default null
) returns jsonb
language plpgsql stable security invoker
set search_path = ''
as $$
declare
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_resultado jsonb;
begin
  with base as (
    select * from public.reversa_relatorio_base(p_empresa, p_campo_data, p_inicio, p_fim)
  ),
  liberados as (
    select * from base where aprovacao_status = 'aprovada' or aprovacao_legada
  ),
  emissoes as (
    select e.*
      from public.reversa_emissoes e
      join base b on b.id = e.solicitacao_id
     where p_campo_data <> 'emissao'
        or (e.emitida_em is not null
            and (p_inicio is null or e.emitida_em >= p_inicio)
            and (p_fim is null or e.emitida_em <= p_fim))
  ),
  por_pedido as (
    select b.id,
           exists (select 1 from public.reversa_emissoes e
                    where e.solicitacao_id = b.id and e.postagem_confirmada_em is not null) as postagem_confirmada,
           exists (select 1 from public.reversa_emissoes e
                    where e.solicitacao_id = b.id and e.substituida_em is null
                      and e.valida_ate is not null and e.valida_ate < v_hoje) as vigente_vencida
      from base b
  )
  select jsonb_build_object(
    'filtro', jsonb_build_object('empresa', p_empresa, 'campo_data', p_campo_data, 'inicio', p_inicio, 'fim', p_fim),
    'solicitacoes', (select count(*) from base),
    'por_empresa', coalesce((select jsonb_object_agg(empresa, n) from (
        select empresa, count(*)::integer as n from base group by empresa) s), '{}'::jsonb),
    'por_motivo', coalesce((select jsonb_agg(jsonb_build_object('motivo', motivo, 'quantidade', n) order by n desc, motivo)
      from (select public.reversa_motivo_normalizado(motivo) as motivo, count(*)::integer as n from base group by 1) s), '[]'::jsonb),
    'aprovacao', jsonb_build_object(
      'aguardando', (select count(*) from base where aprovacao_status = 'aguardando_aprovacao' and not aprovacao_legada),
      'aprovada', (select count(*) from base where aprovacao_status = 'aprovada' and not aprovacao_legada),
      'rejeitada', (select count(*) from base where aprovacao_status = 'rejeitada' and not aprovacao_legada),
      'legado_sem_decisao_registrada', (select count(*) from base where aprovacao_legada)),
    'logistica', jsonb_build_object(
      'aguardando_emissao', (select count(*) from liberados where status = 'pendente'),
      'aguardando_checkin', (select count(*) from liberados where status = 'etiqueta_gerada'),
      'postado', (select count(*) from liberados where status = 'postado'),
      'em_transito', (select count(*) from liberados where status = 'em_transito'),
      'concluido', (select count(*) from liberados where status = 'concluido'),
      'sem_liberacao_logistica', (select count(*) from base where not (aprovacao_status = 'aprovada' or aprovacao_legada))),
    'emissoes', jsonb_build_object(
      'total', (select count(*) from emissoes),
      'primeiras_emissoes', (select count(*) from emissoes where emissao_anterior_id is null),
      'reemissoes', (select count(*) from emissoes where emissao_anterior_id is not null),
      'pedidos_com_emissao', (select count(distinct solicitacao_id) from emissoes),
      'pedidos_com_reemissao', (select count(distinct solicitacao_id) from emissoes where emissao_anterior_id is not null),
      'com_pdf_vinculado', (select count(*) from emissoes where pdf_path is not null)),
    'postagem', jsonb_build_object(
      'pedidos_com_postagem_confirmada', (select count(*) from por_pedido where postagem_confirmada),
      'pedidos_com_etiqueta_vencida_sem_postagem_confirmada',
        (select count(*) from por_pedido where vigente_vencida and not postagem_confirmada)),
    'recebimento', jsonb_build_object(
      'concluidos', (select count(*) from base where status = 'concluido'),
      'recebimento_confirmado_manualmente', (select count(*) from base b
        where exists (select 1 from public.reversa_recebimentos_confirmados rc where rc.solicitacao_id = b.id))),
    'custo_disponivel', false,
    'gerado_em', now()
  ) into v_resultado;

  return v_resultado;
end;
$$;

create or replace function public.relatorio_reversa_linhas(
  p_empresa text default null,
  p_campo_data text default 'solicitacao',
  p_inicio date default null,
  p_fim date default null,
  p_limite integer default 5000
) returns table (
  pedido text,
  empresa text,
  setor text,
  data_solicitacao date,
  motivo text,
  situacao_aprovacao text,
  decisao_em date,
  situacao_logistica text,
  emissoes integer,
  reemissoes integer,
  ultima_emissao_em date,
  valida_ate date,
  postagem_confirmada_em date,
  etiqueta_vencida_sem_postagem_confirmada boolean,
  recebimento_confirmado_manualmente_em date
)
language plpgsql stable security invoker
set search_path = ''
as $$
declare
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  if p_limite is null or p_limite < 1 or p_limite > 20000 then
    raise exception 'Limite de linhas inválido (1 a 20000).' using errcode = '22023';
  end if;

  return query
  select 'RV-' || upper(substr(b.id::text, 1, 8)),
         b.empresa,
         b.setor,
         b.data_solicitacao,
         public.reversa_motivo_normalizado(b.motivo),
         case when b.aprovacao_legada then 'Legado (sem decisão registrada)'
              when b.aprovacao_status = 'aprovada' then 'Aprovada'
              when b.aprovacao_status = 'rejeitada' then 'Rejeitada'
              else 'Aguardando aprovação' end,
         (b.aprovacao_decidida_em at time zone 'America/Sao_Paulo')::date,
         case when not (b.aprovacao_status = 'aprovada' or b.aprovacao_legada) then 'Sem liberação logística'
              else case b.status
                when 'pendente' then 'Aguardando emissão da etiqueta'
                when 'etiqueta_gerada' then 'Aguardando check-in'
                when 'postado' then 'Postado'
                when 'em_transito' then 'Em trânsito'
                when 'concluido' then 'Concluído'
                else b.status end end,
         (select count(*)::integer from public.reversa_emissoes e where e.solicitacao_id = b.id),
         (select count(*)::integer from public.reversa_emissoes e
           where e.solicitacao_id = b.id and e.emissao_anterior_id is not null),
         (select max(e.emitida_em) from public.reversa_emissoes e where e.solicitacao_id = b.id),
         (select e.valida_ate from public.reversa_emissoes e
           where e.solicitacao_id = b.id and e.substituida_em is null),
         (select (min(e.postagem_confirmada_em) at time zone 'America/Sao_Paulo')::date
            from public.reversa_emissoes e where e.solicitacao_id = b.id),
         exists (select 1 from public.reversa_emissoes e
                  where e.solicitacao_id = b.id and e.substituida_em is null
                    and e.valida_ate is not null and e.valida_ate < v_hoje)
           and not exists (select 1 from public.reversa_emissoes e
                  where e.solicitacao_id = b.id and e.postagem_confirmada_em is not null),
         (select (rc.confirmado_em at time zone 'America/Sao_Paulo')::date
            from public.reversa_recebimentos_confirmados rc where rc.solicitacao_id = b.id)
    from public.reversa_relatorio_base(p_empresa, p_campo_data, p_inicio, p_fim) b
   order by b.data_solicitacao, b.id
   limit p_limite;
end;
$$;

revoke all on function public.reversa_relatorio_base(text, text, date, date) from public, anon;
revoke all on function public.relatorio_reversa(text, text, date, date) from public, anon;
revoke all on function public.relatorio_reversa_linhas(text, text, date, date, integer) from public, anon;
grant execute on function public.reversa_relatorio_base(text, text, date, date) to authenticated;
grant execute on function public.relatorio_reversa(text, text, date, date) to authenticated;
grant execute on function public.relatorio_reversa_linhas(text, text, date, date, integer) to authenticated;

commit;

-- ============================================================
-- SOURCE: supabase/migrations/20261027130000_recebimento_fisico_apos_entrega.sql
-- ============================================================
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

-- ============================================================
-- SOURCE: supabase/migrations/20261027140000_postagem_automatica_rastreio.sql
-- ============================================================
begin;

-- A postagem, o trânsito e a entrega chegam sozinhos pela integração dos Correios. Até aqui a
-- integração só mudava o status do pedido: o aviso "postagem confirmada" dependia de alguém
-- confirmar a postagem na emissão (postagem_fonte = 'manual'). A coluna já reservava a fonte
-- 'rastreio' para este caso, mas nada a gravava.
--
-- Esta função é chamada pela Edge Function correios-rastreio (service_role) quando o rastreio
-- muda o pedido de etapa. Ela grava a postagem na emissão que carrega aquele código, com fonte
-- 'rastreio', e o gatilho existente enfileira o aviso uma única vez. Não cria recebimento físico
-- e não gera aviso de recebimento: a entrega informada pelos Correios continua sendo só a etapa.
--
-- Não há retroativo: nada é gravado para pedidos que já estão postados; só vale para a próxima
-- transição que a integração registrar.
create or replace function public.registrar_postagem_rastreio(
  p_solicitacao_id uuid,
  p_codigo_rastreio text,
  p_postagem_em date default null
) returns public.reversa_emissoes
language plpgsql security definer
set search_path = ''
as $$
declare
  v public.reversa_emissoes;
  v_nova public.reversa_emissoes;
  v_data date := p_postagem_em;
begin
  perform 1 from public.solicitacoes_reverso where id = p_solicitacao_id for update;
  if not found then
    return null;
  end if;

  -- A emissão que carrega o código consultado. Sem emissão com esse código não há o que confirmar.
  select * into v
    from public.reversa_emissoes e
   where e.solicitacao_id = p_solicitacao_id
     and e.codigo_rastreio = upper(btrim(p_codigo_rastreio))
   order by e.sequencia desc
   limit 1
   for update;
  if not found then
    return null;
  end if;

  -- Já confirmada (manual ou pelo rastreio): nada muda e nenhum aviso novo é gerado.
  if v.postagem_confirmada_em is not null then
    return v;
  end if;

  -- Data do evento dos Correios: nunca futura (relógio de São Paulo) e nunca anterior à emissão.
  if v_data is not null and v_data > (now() at time zone 'America/Sao_Paulo')::date then
    v_data := null;
  end if;
  if v_data is not null and v.emitida_em is not null and v_data < v.emitida_em then
    v_data := null;
  end if;

  update public.reversa_emissoes
     set postagem_confirmada_em = now(),
         postagem_em = v_data,
         postagem_fonte = 'rastreio',
         postagem_confirmada_por = null,
         postagem_confirmada_por_nome = 'Sistema (Correios)'
   where id = v.id
  returning * into v_nova;

  perform public.emissao_registrar_evento(
    v_nova, 'postagem_confirmada',
    'Postagem informada pelos Correios na emissão #' || v_nova.sequencia
      || coalesce(' — postada em ' || to_char(v_data, 'DD/MM/YYYY'), ''),
    jsonb_build_object('postagem_em', v_data, 'fonte', 'rastreio'),
    true,
    'Sistema (Correios)');

  return v_nova;
end;
$$;

revoke all on function public.registrar_postagem_rastreio(uuid, text, date) from public, anon, authenticated;
grant execute on function public.registrar_postagem_rastreio(uuid, text, date) to service_role;

comment on function public.registrar_postagem_rastreio(uuid, text, date) is
  'Grava a postagem informada pelo rastreio dos Correios na emissão do código (fonte rastreio), uma única vez. Só service_role; não cria recebimento físico.';

commit;

-- ============================================================
-- SOURCE: supabase/migrations/20261028100000_acesso_por_tela_cadastro.sql
-- ============================================================
-- Cadastro oficial por tela: selecionar uma tela concede as operações dela, no escopo cadastrado.
--
-- 1. Atalho de administrador. Até aqui, quem tinha a tela "usuarios" (administração de usuários)
--    também lia todos os pedidos e NCs e operava as duas empresas. Agora esse escopo total é do
--    perfil mestre, explícito (public.is_mestre()). A tela "usuarios" continua dando as funções
--    administrativas já existentes (is_admin(): cadastro de usuários, aprovadores, comunicações,
--    listas de NC, correções e exclusão de reversa sem decisão e sem PDF), mas não concede consulta
--    nem operação de pedidos e NCs: isso vem das telas e das empresas cadastradas.
--    Aprovar, emitir etiqueta e confirmar postagem já não tinham atalho de administrador
--    (20261023120000); continuam exigindo a tela, a empresa e, para aprovar, o escopo por setor.
--
-- 2. Escopo de aprovação gravado junto com o cadastro. As duas funções abaixo escrevem na mesma
--    tabela da configuração atual (reversa_aprovadores_setor); não existe segunda fonte. Só o
--    service_role as executa (Edge Function admin-usuarios, depois de validar o administrador).
--    Exigem que o usuário já tenha a tela aprovar-reversa e a empresa em empresas_acesso, como
--    salvar_config_aprovadores_reversa, e registram a auditoria por empresa.
--
-- Não altera dados existentes e não reenvia nem enfileira nada por si só.

begin;

create or replace function public.is_mestre() returns boolean
language sql stable security definer
set search_path = ''
as $$
  select
    coalesce((select u.raw_app_meta_data ->> 'perfil_acesso' = 'mestre' from auth.users u where u.id = auth.uid()), false)
    or public.current_perfil_legacy() = 'ADMIN';
$$;

revoke execute on function public.is_mestre() from public, anon;
grant execute on function public.is_mestre() to authenticated, service_role;

-- Consulta ---------------------------------------------------------------

create or replace function public.empresas_permitidas() returns text[]
language sql stable security definer
set search_path = ''
as $$
  select case
    when public.is_mestre()
      or public.current_telas() && array['dashboard-geral', 'lista-geral', 'status-geral', 'kanban', 'kanban-edit', 'nc', 'nc-edit']::text[]
      then array['Alinare', 'Novitah']::text[]
    else array(
      select distinct e
      from unnest(
        array_remove(array[
          case when public.current_telas() && array['dashboard-alinare', 'formulario-alinare', 'lista-alinare', 'status-alinare']::text[] then 'Alinare' end,
          case when public.current_telas() && array['dashboard-novitah', 'formulario-novitah', 'lista-novitah', 'status-novitah']::text[] then 'Novitah' end
        ]::text[], null)
        || case
          when public.current_telas() && array['aprovar-reversa', 'emitir-etiqueta', 'confirmar-checkin']::text[]
            then public.current_empresas_acesso()
          else '{}'::text[]
        end
      ) as escopo(e)
      where e in ('Alinare', 'Novitah')
    )
  end;
$$;

create or replace function public.empresas_consulta_ampliada() returns text[]
language sql stable security definer
set search_path = ''
as $$
  select case
    when public.is_mestre()
      or public.current_telas() && array[
        'dashboard-geral', 'lista-geral', 'status-geral', 'kanban', 'kanban-edit', 'nc', 'nc-edit'
      ]::text[]
      then array['Alinare', 'Novitah']::text[]
    else array(
      select distinct e
      from unnest(
        array_remove(array[
          case when public.current_telas() && array['dashboard-alinare', 'lista-alinare', 'status-alinare']::text[] then 'Alinare' end,
          case when public.current_telas() && array['dashboard-novitah', 'lista-novitah', 'status-novitah']::text[] then 'Novitah' end
        ]::text[], null)
        || case
          when public.current_telas() && array['aprovar-reversa', 'emitir-etiqueta', 'confirmar-checkin']::text[]
            then public.current_empresas_acesso()
          else '{}'::text[]
        end
      ) as escopo(e)
      where e in ('Alinare', 'Novitah')
    )
  end;
$$;

-- Solicitação e operação -------------------------------------------------

create or replace function public.empresas_formulario() returns text[]
language sql stable security definer
set search_path = ''
as $$
  select case
    when public.is_mestre() or 'nc-edit' = any (public.current_telas())
      then array['Alinare', 'Novitah']::text[]
    else array_remove(array[
      case when 'formulario-alinare' = any (public.current_telas()) then 'Alinare' end,
      case when 'formulario-novitah' = any (public.current_telas()) then 'Novitah' end
    ]::text[], null)
  end;
$$;

create or replace function public.empresas_operaveis() returns text[]
language sql stable security definer
set search_path = ''
as $$
  select case when public.is_mestre() then array['Alinare', 'Novitah']::text[]
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

create or replace function public.empresas_recebimento_manual() returns text[]
language sql stable security definer
set search_path = ''
as $$
  select case
    when public.is_mestre() then array['Alinare', 'Novitah']::text[]
    when public.current_telas() && array['kanban-edit', 'confirmar-checkin']::text[]
      then public.current_empresas_acesso()
    else '{}'::text[]
  end;
$$;

-- Não conformidades ------------------------------------------------------

create or replace function public.pode_ver_nc() returns boolean
language sql stable security definer
set search_path = ''
as $$
  select public.is_mestre() or public.current_telas() && array['nc', 'nc-edit']::text[];
$$;

create or replace function public.pode_editar_nc() returns boolean
language sql stable security definer
set search_path = ''
as $$
  select public.is_mestre() or 'nc-edit' = any (public.current_telas());
$$;

-- Escopo de aprovação do usuário (mesma tabela da configuração por empresa e setor) -------------

create or replace function public.admin_acesso_aprovacao_usuario(p_usuario_id uuid)
returns jsonb
language sql stable security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'empresa', a.empresa,
    'todos_setores', a.todos_setores,
    'setores', to_jsonb(a.setores)
  ) order by a.empresa), '[]'::jsonb)
  from public.reversa_aprovadores_setor a
  where a.usuario_id = p_usuario_id;
$$;

revoke all on function public.admin_acesso_aprovacao_usuario(uuid) from public, anon, authenticated;
grant execute on function public.admin_acesso_aprovacao_usuario(uuid) to service_role;

create or replace function public.admin_salvar_escopo_aprovacao_usuario(
  p_usuario_id uuid,
  p_configuracao jsonb,
  p_alterado_por uuid
) returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  v_item jsonb;
  v_empresa text;
  v_todos boolean;
  v_setores text[];
  v_empresas_config text[] := '{}'::text[];
  v_existente public.reversa_aprovadores_setor;
  v_anterior jsonb;
  v_nova jsonb;
  v_nome text;
begin
  -- Somente o serviço (Edge Function admin-usuarios, que já validou o administrador).
  if auth.uid() is not null then
    raise exception 'Função restrita ao serviço de administração de usuários.' using errcode = '42501';
  end if;
  if p_usuario_id is null or not exists (select 1 from auth.users u where u.id = p_usuario_id) then
    raise exception 'Usuário inexistente.' using errcode = '22023';
  end if;
  if p_alterado_por is null or not exists (select 1 from auth.users u where u.id = p_alterado_por) then
    raise exception 'Administrador responsável pela alteração não identificado.' using errcode = '22023';
  end if;
  if jsonb_typeof(p_configuracao) is distinct from 'array' then
    raise exception 'O escopo de aprovação deve ser uma lista.' using errcode = '22023';
  end if;

  -- Mesma ordem de travas em toda chamada; serializa com salvar_config_aprovadores_reversa.
  perform pg_advisory_xact_lock(hashtext('reversa_aprovadores:Alinare'));
  perform pg_advisory_xact_lock(hashtext('reversa_aprovadores:Novitah'));

  for v_item in select value from jsonb_array_elements(p_configuracao)
  loop
    if jsonb_typeof(v_item) is distinct from 'object'
      or jsonb_typeof(v_item -> 'empresa') is distinct from 'string'
      or jsonb_typeof(v_item -> 'todos_setores') is distinct from 'boolean'
      or jsonb_typeof(v_item -> 'setores') is distinct from 'array' then
      raise exception 'Cada empresa deve informar o escopo e os setores.' using errcode = '22023';
    end if;
    v_empresa := v_item ->> 'empresa';
    if v_empresa not in ('Alinare', 'Novitah') then
      raise exception 'Empresa inválida para o escopo de aprovação.' using errcode = '22023';
    end if;
    if v_empresa = any (v_empresas_config) then
      raise exception 'Cada empresa só pode aparecer uma vez no escopo de aprovação.' using errcode = '22023';
    end if;
    v_empresas_config := array_append(v_empresas_config, v_empresa);

    v_todos := (v_item ->> 'todos_setores')::boolean;
    select coalesce(array_agg(distinct btrim(value) order by btrim(value)), '{}'::text[])
      into v_setores
    from jsonb_array_elements_text(v_item -> 'setores') as s(value);
    if (v_todos and cardinality(v_setores) <> 0)
      or (not v_todos and cardinality(v_setores) = 0)
      or array_position(v_setores, '') is not null then
      raise exception 'Selecione todos os setores ou um ou mais setores específicos.' using errcode = '22023';
    end if;

    if not exists (
      select 1 from auth.users u
      where u.id = p_usuario_id
        and coalesce(u.raw_app_meta_data -> 'telas', '[]'::jsonb) ? 'aprovar-reversa'
        and coalesce(u.raw_app_meta_data -> 'empresas_acesso', '[]'::jsonb) ? v_empresa
    ) then
      raise exception 'O usuário não possui a tela de aprovação para a empresa %.', v_empresa using errcode = '42501';
    end if;
  end loop;

  v_nome := coalesce(public.usuario_nome(p_alterado_por), 'Usuário ' || p_alterado_por::text);

  foreach v_empresa in array array['Alinare', 'Novitah']
  loop
    select coalesce(jsonb_agg(jsonb_build_object(
      'usuario_id', a.usuario_id, 'todos_setores', a.todos_setores, 'setores', to_jsonb(a.setores)
    ) order by a.usuario_id), '[]'::jsonb)
      into v_anterior
    from public.reversa_aprovadores_setor a where a.empresa = v_empresa;

    select * into v_existente
    from public.reversa_aprovadores_setor a
    where a.empresa = v_empresa and a.usuario_id = p_usuario_id;

    select value into v_item
    from jsonb_array_elements(p_configuracao) as c(value)
    where c.value ->> 'empresa' = v_empresa;

    if v_item is null then
      delete from public.reversa_aprovadores_setor where empresa = v_empresa and usuario_id = p_usuario_id;
    else
      v_todos := (v_item ->> 'todos_setores')::boolean;
      select coalesce(array_agg(distinct btrim(value) order by btrim(value)), '{}'::text[])
        into v_setores
      from jsonb_array_elements_text(v_item -> 'setores') as s(value);

      if v_existente.usuario_id is null then
        insert into public.reversa_aprovadores_setor (empresa, usuario_id, todos_setores, setores, alterado_por, alterado_em)
        values (v_empresa, p_usuario_id, v_todos, v_setores, p_alterado_por, now());
      elsif v_existente.todos_setores is distinct from v_todos or v_existente.setores is distinct from v_setores then
        update public.reversa_aprovadores_setor
           set todos_setores = v_todos, setores = v_setores, alterado_por = p_alterado_por, alterado_em = now()
         where empresa = v_empresa and usuario_id = p_usuario_id;
      end if;
    end if;

    select coalesce(jsonb_agg(jsonb_build_object(
      'usuario_id', a.usuario_id, 'todos_setores', a.todos_setores, 'setores', to_jsonb(a.setores)
    ) order by a.usuario_id), '[]'::jsonb)
      into v_nova
    from public.reversa_aprovadores_setor a where a.empresa = v_empresa;

    if v_anterior is distinct from v_nova then
      insert into public.reversa_aprovadores_setor_auditoria
        (empresa, alterado_por, alterado_por_nome, configuracao_anterior, configuracao_nova)
      values (v_empresa, p_alterado_por, v_nome, v_anterior, v_nova);
    end if;
  end loop;
end;
$$;

revoke all on function public.admin_salvar_escopo_aprovacao_usuario(uuid, jsonb, uuid) from public, anon, authenticated;
grant execute on function public.admin_salvar_escopo_aprovacao_usuario(uuid, jsonb, uuid) to service_role;

commit;

-- ============================================================
-- SOURCE: supabase/migrations/20261028110000_convites_acesso.sql
-- ============================================================
-- Cadastro por convite: acompanhamento do envio do convite de acesso.
--
-- O link de convite é uma credencial. Ele é gerado na Edge Function admin-usuarios
-- (auth.admin.generateLink, type invite), entregue ao fluxo "Reverso — Convite de acesso" do
-- Power Automate e descartado: NADA do link nem do token é gravado aqui. Esta tabela guarda só o
-- estado da tentativa (para acompanhar, impedir envio simultâneo e não reenviar às cegas).
-- Um reenvio gera um link novo; o do Supabase invalida o anterior.
--
-- Acesso: somente service_role (Edge Function). RLS ligada, sem policy; nenhum privilégio de
-- tabela para anon/authenticated. Nenhuma linha é criada por esta migration, e nada é enviado.

begin;

create table if not exists public.convites_acesso (
  usuario_id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  estado text not null check (estado in (
    'preparado',               -- conta e permissões gravadas; envio ainda não tentado (ou desabilitado)
    'envio_em_andamento',      -- tentativa reservada, aguardando o fluxo
    'enviado',                 -- o conector do fluxo concluiu a ação (não prova entrega nem leitura)
    'falhou',                  -- falha com certeza de que nada foi aceito pelo conector
    'resultado_indeterminado', -- timeout/resposta incerta: pode ter sido enviado
    'rejeitado'                -- o fluxo recusou o contrato; corrigir o fluxo antes de reenviar
  )),
  tentativa_id uuid,
  tentativas integer not null default 0 check (tentativas >= 0),
  convidado_por uuid references auth.users (id) on delete set null,
  criado_em timestamptz not null default now(),
  iniciado_em timestamptz,
  concluido_em timestamptz,
  ultimo_http integer,
  detalhe text check (detalhe is null or char_length(detalhe) <= 200)
);

alter table public.convites_acesso enable row level security;
revoke all on table public.convites_acesso from public, anon, authenticated;

-- Localiza a conta pelo e-mail (a API administrativa não tem busca por e-mail).
create or replace function public.admin_convite_localizar_usuario(p_email text)
returns table (id uuid, confirmado boolean, tem_senha boolean)
language plpgsql stable security definer
set search_path = ''
as $$
begin
  if auth.uid() is not null then
    raise exception 'Função restrita ao serviço de administração de usuários.' using errcode = '42501';
  end if;
  return query
    select u.id,
           u.email_confirmed_at is not null,
           coalesce(u.encrypted_password, '') <> ''
      from auth.users u
     where lower(u.email) = lower(btrim(p_email))
     limit 1;
end;
$$;

-- Registra o convite como preparado sem tentar o envio (envio de convites desabilitado, ou
-- permissões gravadas antes de o envio acontecer). Não rebaixa um estado mais avançado.
create or replace function public.admin_convite_preparar(p_usuario_id uuid, p_email text, p_convidado_por uuid)
returns text
language plpgsql security definer
set search_path = ''
as $$
declare
  v_estado text;
begin
  if auth.uid() is not null then
    raise exception 'Função restrita ao serviço de administração de usuários.' using errcode = '42501';
  end if;
  if not exists (select 1 from auth.users u where u.id = p_usuario_id) then
    raise exception 'Usuário inexistente.' using errcode = '22023';
  end if;
  insert into public.convites_acesso (usuario_id, email, estado, convidado_por)
  values (p_usuario_id, lower(btrim(p_email)), 'preparado', p_convidado_por)
  on conflict (usuario_id) do nothing;
  select c.estado into v_estado from public.convites_acesso c where c.usuario_id = p_usuario_id;
  return v_estado;
end;
$$;

-- Reserva atômica da tentativa de envio. Duas chamadas simultâneas nunca recebem tentativa:
-- a segunda vê 'em_andamento'. Resultado incerto exige confirmação explícita para nova tentativa.
create or replace function public.admin_convite_iniciar_envio(
  p_usuario_id uuid,
  p_email text,
  p_convidado_por uuid,
  p_confirmou_incerto boolean default false
) returns table (resultado text, tentativa_id uuid)
language plpgsql security definer
set search_path = ''
as $$
declare
  v_linha public.convites_acesso;
  v_expirada boolean;
  v_nova uuid := gen_random_uuid();
begin
  if auth.uid() is not null then
    raise exception 'Função restrita ao serviço de administração de usuários.' using errcode = '42501';
  end if;
  if not exists (select 1 from auth.users u where u.id = p_usuario_id) then
    raise exception 'Usuário inexistente.' using errcode = '22023';
  end if;
  if exists (select 1 from auth.users u where u.id = p_usuario_id and u.email_confirmed_at is not null) then
    return query select 'usuario_ativo'::text, null::uuid;
    return;
  end if;

  insert into public.convites_acesso (usuario_id, email, estado, convidado_por)
  values (p_usuario_id, lower(btrim(p_email)), 'preparado', p_convidado_por)
  on conflict (usuario_id) do nothing;

  select * into v_linha from public.convites_acesso c where c.usuario_id = p_usuario_id for update;
  v_expirada := v_linha.estado = 'envio_em_andamento'
    and (v_linha.iniciado_em is null or v_linha.iniciado_em < now() - interval '3 minutes');

  if v_linha.estado = 'envio_em_andamento' and not v_expirada then
    return query select 'em_andamento'::text, null::uuid;
    return;
  end if;
  -- Uma tentativa que nunca terminou (função interrompida) também pode ter chegado ao fluxo.
  if (v_linha.estado = 'resultado_indeterminado' or v_expirada) and not coalesce(p_confirmou_incerto, false) then
    return query select 'confirmacao_necessaria'::text, null::uuid;
    return;
  end if;

  update public.convites_acesso c
     set estado = 'envio_em_andamento',
         tentativa_id = v_nova,
         tentativas = c.tentativas + 1,
         email = lower(btrim(p_email)),
         convidado_por = p_convidado_por,
         iniciado_em = now(),
         concluido_em = null,
         ultimo_http = null,
         detalhe = null
   where c.usuario_id = p_usuario_id;
  return query select 'ok'::text, v_nova;
end;
$$;

-- Fecha a tentativa. Só vale para a tentativa reservada e ainda em andamento (idempotente).
create or replace function public.admin_convite_finalizar_envio(
  p_tentativa_id uuid,
  p_estado text,
  p_http_status integer,
  p_detalhe text
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
  if p_estado not in ('enviado', 'falhou', 'resultado_indeterminado', 'rejeitado') then
    raise exception 'Estado de convite inválido.' using errcode = '22023';
  end if;
  update public.convites_acesso c
     set estado = p_estado,
         concluido_em = now(),
         ultimo_http = p_http_status,
         detalhe = left(p_detalhe, 200)
   where c.tentativa_id = p_tentativa_id
     and c.estado = 'envio_em_andamento';
  get diagnostics v_linhas = row_count;
  return v_linhas = 1;
end;
$$;

-- Situação dos convites para a tela de usuários (sem link, sem token).
create or replace function public.admin_convites_listar()
returns table (
  usuario_id uuid, estado text, tentativas integer, iniciado_em timestamptz, concluido_em timestamptz,
  confirmado boolean, tem_senha boolean
)
language plpgsql stable security definer
set search_path = ''
as $$
begin
  if auth.uid() is not null then
    raise exception 'Função restrita ao serviço de administração de usuários.' using errcode = '42501';
  end if;
  return query
    select c.usuario_id, c.estado, c.tentativas, c.iniciado_em, c.concluido_em,
           u.email_confirmed_at is not null,
           coalesce(u.encrypted_password, '') <> ''
      from public.convites_acesso c
      join auth.users u on u.id = c.usuario_id;
end;
$$;

revoke all on function public.admin_convite_localizar_usuario(text) from public, anon, authenticated;
revoke all on function public.admin_convite_preparar(uuid, text, uuid) from public, anon, authenticated;
revoke all on function public.admin_convite_iniciar_envio(uuid, text, uuid, boolean) from public, anon, authenticated;
revoke all on function public.admin_convite_finalizar_envio(uuid, text, integer, text) from public, anon, authenticated;
revoke all on function public.admin_convites_listar() from public, anon, authenticated;
grant execute on function public.admin_convite_localizar_usuario(text) to service_role;
grant execute on function public.admin_convite_preparar(uuid, text, uuid) to service_role;
grant execute on function public.admin_convite_iniciar_envio(uuid, text, uuid, boolean) to service_role;
grant execute on function public.admin_convite_finalizar_envio(uuid, text, integer, text) to service_role;
grant execute on function public.admin_convites_listar() to service_role;
grant all on table public.convites_acesso to service_role;

commit;

-- ============================================================
-- SOURCE: supabase/migrations/20261028120000_convite_senha_pendente.sql
-- ============================================================
-- Convite de acesso: conclusão segura quando o convite foi aberto e a senha não foi definida.
--
-- Caso: verifyOtp (convite) concluiu e a definição da senha falhou ou a página foi fechada. A conta
-- fica confirmada, sem senha, e o link do convite já foi consumido. Duas peças resolvem:
--   1. convite_senha_pendente(): a PRÓPRIA sessão pergunta se a sua conta é de convidado ainda sem
--      senha. Só lê a linha de auth.uid(); não aceita e-mail nem id de parâmetro, então não serve
--      para consultar outra pessoa. A página usa a resposta para retomar a definição da senha.
--   2. admin_convite_iniciar_envio passa a aceitar conta confirmada SEM senha que veio de convite
--      (então o administrador reenvia um link de definição de senha, tipo recovery). Conta com senha
--      continua recusada ('usuario_ativo'): a checagem é feita aqui, no banco.
-- Nada é gravado em auth.users; nenhuma linha é criada ou alterada por esta migration.
-- Depende de 20261028110000_convites_acesso.sql.

begin;

create or replace function public.convite_senha_pendente()
returns boolean
language plpgsql stable security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    return false;
  end if;
  return exists (
    select 1
      from auth.users u
      join public.convites_acesso c on c.usuario_id = u.id
     where u.id = auth.uid()
       and u.email_confirmed_at is not null
       and coalesce(u.encrypted_password, '') = ''
  );
end;
$$;

revoke all on function public.convite_senha_pendente() from public, anon;
grant execute on function public.convite_senha_pendente() to authenticated, service_role;

-- Mesma assinatura e mesmo retorno da versão de 20261028110000; muda só a regra da conta confirmada.
create or replace function public.admin_convite_iniciar_envio(
  p_usuario_id uuid,
  p_email text,
  p_convidado_por uuid,
  p_confirmou_incerto boolean default false
) returns table (resultado text, tentativa_id uuid)
language plpgsql security definer
set search_path = ''
as $$
declare
  v_linha public.convites_acesso;
  v_expirada boolean;
  v_nova uuid := gen_random_uuid();
  v_confirmada boolean;
  v_tem_senha boolean;
begin
  if auth.uid() is not null then
    raise exception 'Função restrita ao serviço de administração de usuários.' using errcode = '42501';
  end if;
  select u.email_confirmed_at is not null, coalesce(u.encrypted_password, '') <> ''
    into v_confirmada, v_tem_senha
    from auth.users u where u.id = p_usuario_id;
  if not found then
    raise exception 'Usuário inexistente.' using errcode = '22023';
  end if;
  -- Conta ativa (com senha) nunca recebe convite nem link de definição de senha. Conta confirmada sem
  -- senha só é aceita se veio de um convite (existe linha em convites_acesso).
  if v_confirmada and (v_tem_senha or not exists (select 1 from public.convites_acesso c where c.usuario_id = p_usuario_id)) then
    return query select 'usuario_ativo'::text, null::uuid;
    return;
  end if;

  insert into public.convites_acesso (usuario_id, email, estado, convidado_por)
  values (p_usuario_id, lower(btrim(p_email)), 'preparado', p_convidado_por)
  on conflict (usuario_id) do nothing;

  select * into v_linha from public.convites_acesso c where c.usuario_id = p_usuario_id for update;
  v_expirada := v_linha.estado = 'envio_em_andamento'
    and (v_linha.iniciado_em is null or v_linha.iniciado_em < now() - interval '3 minutes');

  if v_linha.estado = 'envio_em_andamento' and not v_expirada then
    return query select 'em_andamento'::text, null::uuid;
    return;
  end if;
  if (v_linha.estado = 'resultado_indeterminado' or v_expirada) and not coalesce(p_confirmou_incerto, false) then
    return query select 'confirmacao_necessaria'::text, null::uuid;
    return;
  end if;

  update public.convites_acesso c
     set estado = 'envio_em_andamento',
         tentativa_id = v_nova,
         tentativas = c.tentativas + 1,
         email = lower(btrim(p_email)),
         convidado_por = p_convidado_por,
         iniciado_em = now(),
         concluido_em = null,
         ultimo_http = null,
         detalhe = null
   where c.usuario_id = p_usuario_id;
  return query select 'ok'::text, v_nova;
end;
$$;

revoke all on function public.admin_convite_iniciar_envio(uuid, text, uuid, boolean) from public, anon, authenticated;
grant execute on function public.admin_convite_iniciar_envio(uuid, text, uuid, boolean) to service_role;

commit;

-- ============================================================
-- SOURCE: supabase/migrations/20261028130000_bloquear_operacao_sem_senha_convite.sql
-- ============================================================
-- Sessao de convite aceita, mas ainda sem senha: pode concluir a senha ou sair;
-- nao opera nenhuma parte do Reverso enquanto isso.
-- A regra so alcanca contas registradas em convites_acesso. Usuarios antigos e
-- convidados que ja definiram senha mantem suas permissoes e sessoes.

begin;

create or replace function public.current_telas() returns text[]
language sql stable security definer
set search_path = ''
as $$
  select case
    when public.convite_senha_pendente() then '{}'::text[]
    else coalesce(
      (
        select array(
          select jsonb_array_elements_text(
            case
              when jsonb_typeof(u.raw_app_meta_data -> 'telas') = 'array' then u.raw_app_meta_data -> 'telas'
              else '[]'::jsonb
            end
          )
        )
        from auth.users u
        where u.id = auth.uid()
      ),
      '{}'::text[]
    )
  end;
$$;

create or replace function public.current_perfil_legacy() returns text
language sql stable security definer
set search_path = ''
as $$
  select case
    when public.convite_senha_pendente() then ''
    else coalesce((select u.raw_app_meta_data ->> 'perfil' from auth.users u where u.id = auth.uid()), '')
  end;
$$;

-- is_admin() tambem e usado por policies e RPCs legados; a tela de usuarios,
-- perfil mestre ou perfil ADMIN nao podem contornar a exigencia de senha.
create or replace function public.is_admin() returns boolean
language sql stable security definer
set search_path = ''
as $$
  select not public.convite_senha_pendente()
    and (
      coalesce((select u.raw_app_meta_data ->> 'perfil_acesso' = 'mestre' from auth.users u where u.id = auth.uid()), false)
      or 'usuarios' = any (public.current_telas())
      or public.current_perfil_legacy() = 'ADMIN'
    );
$$;

create or replace function public.is_mestre() returns boolean
language sql stable security definer
set search_path = ''
as $$
  select not public.convite_senha_pendente()
    and (
      coalesce((select u.raw_app_meta_data ->> 'perfil_acesso' = 'mestre' from auth.users u where u.id = auth.uid()), false)
      or public.current_perfil_legacy() = 'ADMIN'
    );
$$;

commit;

-- ============================================================
-- SOURCE: supabase/migrations/20261028140000_smtp_direto_email.sql
-- ============================================================
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

-- ============================================================
-- SOURCE: supabase/migrations/20261030100000_auditoria_aprovadores_usuario_opcional.sql
-- ============================================================
-- Preserve the approval audit when an account is removed. The actor's name
-- remains in the audit row while the user reference becomes optional.
begin;

alter table public.reversa_aprovadores_setor_auditoria
  alter column alterado_por drop not null;

alter table public.reversa_aprovadores_setor_auditoria
  drop constraint if exists reversa_aprovadores_setor_auditoria_alterado_por_fkey;

alter table public.reversa_aprovadores_setor_auditoria
  add constraint reversa_aprovadores_setor_auditoria_alterado_por_fkey
  foreign key (alterado_por) references auth.users(id) on delete set null;

commit;

-- ============================================================
-- SOURCE: supabase/migrations/20261030110000_corrigir_fk_exclusao_historico_reversa.sql
-- ============================================================
-- Remove the original RESTRICT foreign key. The migration that introduced
-- approval history added a cascading FK but left this original constraint in place.
-- The exclusão trigger still protects approved/rejected and emitted requests.
begin;

alter table public.solicitacoes_aprovacoes
  drop constraint if exists solicitacoes_aprovacoes_solicitacao_id_fkey;

commit;

-- ============================================================
-- SOURCE: supabase/migrations/20261030120000_lixeira_chamados.sql
-- ============================================================
-- Chamados são arquivados, não removidos. A linha e suas trilhas permanecem no banco.
begin;

alter table public.solicitacoes_reverso
  add column if not exists inutilizada_em timestamptz,
  add column if not exists inutilizada_por uuid references auth.users(id) on delete set null,
  add column if not exists inutilizada_por_nome text;

create index if not exists idx_solicitacoes_reverso_lixeira
  on public.solicitacoes_reverso (inutilizada_em desc)
  where inutilizada_em is not null;

-- Chamados arquivados e suas trilhas ficam restritos a administradores.
create or replace function public.pode_ler_solicitacao(p_solicitacao_id uuid) returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.solicitacoes_reverso r
    where r.id = p_solicitacao_id
      and (r.inutilizada_em is null or public.is_admin())
      and (
        r.empresa = any (public.empresas_consulta_ampliada())
        or (
          auth.uid() is not null
          and r.solicitado_por = auth.uid()
          and r.empresa = any (public.empresas_formulario())
        )
      )
  );
$$;
revoke execute on function public.pode_ler_solicitacao(uuid) from public, anon;
grant execute on function public.pode_ler_solicitacao(uuid) to authenticated, service_role;

-- A tela operacional e as telas dos solicitantes só recebem chamados ativos.
drop policy if exists "select_solicitacoes_por_escopo" on public.solicitacoes_reverso;
create policy "select_solicitacoes_por_escopo" on public.solicitacoes_reverso
  for select to authenticated
  using (
    inutilizada_em is null
    and (
      empresa = any (public.empresas_consulta_ampliada())
      or (
        auth.uid() is not null
        and solicitado_por = auth.uid()
        and empresa = any (public.empresas_formulario())
      )
    )
  );

-- Administradores acessam trilhas arquivadas sem ganhar leitura dos chamados ativos.
create or replace function public.solicitacao_na_lixeira(p_solicitacao_id uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select public.is_admin() and exists (
    select 1 from public.solicitacoes_reverso r
    where r.id = p_solicitacao_id and r.inutilizada_em is not null
  );
$$;
revoke all on function public.solicitacao_na_lixeira(uuid) from public, anon;
grant execute on function public.solicitacao_na_lixeira(uuid) to authenticated, service_role;

drop policy if exists "select_historico_lixeira_admin" on public.solicitacoes_historico;
create policy "select_historico_lixeira_admin" on public.solicitacoes_historico
  for select to authenticated using (public.solicitacao_na_lixeira(solicitacao_id));

drop policy if exists "aprovacoes_select" on public.solicitacoes_aprovacoes;
create policy "aprovacoes_select" on public.solicitacoes_aprovacoes
  for select to authenticated
  using (
    exists (select 1 from public.solicitacoes_reverso r where r.id = solicitacao_id)
    or public.solicitacao_na_lixeira(solicitacao_id)
  );

drop policy if exists "reversa_emissoes_select_lixeira_admin" on public.reversa_emissoes;
create policy "reversa_emissoes_select_lixeira_admin" on public.reversa_emissoes
  for select to authenticated using (public.solicitacao_na_lixeira(solicitacao_id));

drop policy if exists "reversa_emissao_eventos_select_lixeira_admin" on public.reversa_emissao_eventos;
create policy "reversa_emissao_eventos_select_lixeira_admin" on public.reversa_emissao_eventos
  for select to authenticated using (public.solicitacao_na_lixeira(solicitacao_id));

drop policy if exists "select_rastreamento_lixeira_admin" on public.rastreamento_correios;
create policy "select_rastreamento_lixeira_admin" on public.rastreamento_correios
  for select to authenticated using (public.solicitacao_na_lixeira(solicitacao_id));

-- A etiqueta continua acessível no histórico arquivado, só para administradores.
create or replace function public.pode_acessar_etiqueta(p_objeto text) returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.solicitacoes_reverso r
    where r.id::text = split_part(p_objeto, '/', 1)
      and (
        r.empresa = any (public.empresas_permitidas())
        or (r.inutilizada_em is not null and public.is_admin())
      )
  )
  or (
    public.is_admin()
    and not exists (select 1 from public.solicitacoes_reverso r where r.id::text = split_part(p_objeto, '/', 1))
  );
$$;

-- Nenhuma operação de emissão pode iniciar ou continuar sobre chamado arquivado.
create or replace function public.pode_operar_emissao(p_solicitacao_id uuid, p_operacao text) returns boolean
language sql stable security definer
set search_path = ''
as $$
  select p_operacao in ('registrar', 'anexar_pdf', 'dados', 'envio', 'postagem')
    and exists (
      select 1
      from public.solicitacoes_reverso r
      where r.id = p_solicitacao_id
        and r.inutilizada_em is null
        and r.empresa = any (public.empresas_operacao_emissao(p_operacao))
    )
    and public.emissao_liberada_pela_aprovacao(p_solicitacao_id, p_operacao);
$$;
comment on function public.pode_operar_emissao(uuid, text) is
  'Authorizes emission operations on active requests; archived requests cannot be operated.';

-- Registro na lixeira e restauração ficam restritos ao perfil administrativo.
create or replace function public.listar_chamados_lixeira()
returns setof public.solicitacoes_reverso
language plpgsql stable security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'A Lixeira é restrita aos administradores.' using errcode = '42501';
  end if;
  return query
    select r.* from public.solicitacoes_reverso r
    where r.inutilizada_em is not null
    order by r.inutilizada_em desc, r.id;
end;
$$;

create or replace function public.inutilizar_chamado(p_solicitacao_id uuid)
returns public.solicitacoes_reverso
language plpgsql security definer
set search_path = ''
as $$
declare
  v_chamado public.solicitacoes_reverso%rowtype;
  v_uid uuid := auth.uid();
  v_nome text;
begin
  if not public.is_admin() then
    raise exception 'Somente administradores podem mover chamados para a Lixeira.' using errcode = '42501';
  end if;

  select * into v_chamado
  from public.solicitacoes_reverso r
  where r.id = p_solicitacao_id
  for update;
  if not found then
    raise exception 'Chamado não encontrado.' using errcode = 'P0002';
  end if;
  if v_chamado.inutilizada_em is not null then
    return v_chamado;
  end if;

  v_nome := coalesce(public.usuario_nome(v_uid), 'Administrador');
  perform set_config('app.solicitacao_lixeira', 'inutilizar', true);
  update public.solicitacoes_reverso
     set inutilizada_em = now(), inutilizada_por = v_uid, inutilizada_por_nome = v_nome
   where id = p_solicitacao_id
   returning * into v_chamado;

  insert into public.solicitacoes_historico (solicitacao_id, user_nome, acao)
  values (p_solicitacao_id, v_nome, 'Chamado movido para a Lixeira');
  return v_chamado;
end;
$$;

create or replace function public.restaurar_chamado(p_solicitacao_id uuid)
returns public.solicitacoes_reverso
language plpgsql security definer
set search_path = ''
as $$
declare
  v_chamado public.solicitacoes_reverso%rowtype;
  v_uid uuid := auth.uid();
  v_nome text;
begin
  if not public.is_admin() then
    raise exception 'Somente administradores podem restaurar chamados.' using errcode = '42501';
  end if;

  select * into v_chamado
  from public.solicitacoes_reverso r
  where r.id = p_solicitacao_id
  for update;
  if not found or v_chamado.inutilizada_em is null then
    raise exception 'Chamado não encontrado na Lixeira.' using errcode = 'P0002';
  end if;

  v_nome := coalesce(public.usuario_nome(v_uid), 'Administrador');
  perform set_config('app.solicitacao_lixeira', 'restaurar', true);
  update public.solicitacoes_reverso
     set inutilizada_em = null, inutilizada_por = null, inutilizada_por_nome = null
   where id = p_solicitacao_id
   returning * into v_chamado;

  insert into public.solicitacoes_historico (solicitacao_id, user_nome, acao)
  values (p_solicitacao_id, v_nome, 'Chamado restaurado da Lixeira');
  return v_chamado;
end;
$$;

revoke all on function public.listar_chamados_lixeira() from public, anon;
revoke all on function public.inutilizar_chamado(uuid) from public, anon;
revoke all on function public.restaurar_chamado(uuid) from public, anon;
grant execute on function public.listar_chamados_lixeira() to authenticated, service_role;
grant execute on function public.inutilizar_chamado(uuid) to authenticated, service_role;
grant execute on function public.restaurar_chamado(uuid) to authenticated, service_role;

-- O estado arquivado bloqueia alterações humanas, mas mantém os updates do rastreador (service role).
create or replace function public.chamado_lixeira_proteger_atualizacao() returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  v_acao text := coalesce(current_setting('app.solicitacao_lixeira', true), '');
begin
  if tg_op = 'INSERT' then
    if new.inutilizada_em is not null or new.inutilizada_por is not null or new.inutilizada_por_nome is not null then
      raise exception 'Use a operação administrativa da Lixeira para arquivar chamados.' using errcode = '42501';
    end if;
    return new;
  end if;

  if old.inutilizada_em is null then
    if new.inutilizada_em is not null
       and v_acao = 'inutilizar'
       and public.is_admin()
       and new.inutilizada_por = auth.uid()
       and new.inutilizada_por_nome is not null then
      return new;
    end if;
    if new.inutilizada_em is not null
       or new.inutilizada_por is distinct from old.inutilizada_por
       or new.inutilizada_por_nome is distinct from old.inutilizada_por_nome then
      raise exception 'Use a operação administrativa da Lixeira para arquivar chamados.' using errcode = '42501';
    end if;
    return new;
  end if;
  if auth.uid() is null then
    return new;
  end if;
  if v_acao = 'restaurar'
     and public.is_admin()
     and new.inutilizada_em is null
     and new.inutilizada_por is null
     and new.inutilizada_por_nome is null
     and (to_jsonb(new) - 'inutilizada_em' - 'inutilizada_por' - 'inutilizada_por_nome')
       = (to_jsonb(old) - 'inutilizada_em' - 'inutilizada_por' - 'inutilizada_por_nome') then
    return new;
  end if;
  raise exception 'Chamado na Lixeira não pode ser alterado. Restaure-o antes de operar.' using errcode = '55000';
end;
$$;

drop trigger if exists trg_chamado_lixeira_proteger_atualizacao on public.solicitacoes_reverso;
create trigger trg_chamado_lixeira_proteger_atualizacao
  before insert or update on public.solicitacoes_reverso
  for each row execute function public.chamado_lixeira_proteger_atualizacao();

-- Nenhum usuário autenticado pode remover o registro ou suas trilhas permanentemente.
drop policy if exists "delete_solicitacoes_admin" on public.solicitacoes_reverso;
revoke delete on table public.solicitacoes_reverso from authenticated;

create or replace function public.reversa_proteger_exclusao() returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  if auth.uid() is not null then
    raise exception 'Chamados não são apagados permanentemente. Mova o chamado para a Lixeira.' using errcode = '55000';
  end if;
  return old;
end;
$$;

-- Filas administrativas SECURITY DEFINER também ignoram chamados arquivados.
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
  endereco_destino_troca text,
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
    r.id, r.empresa, r.created_at, r.data_solicitacao, r.solicitante, r.setor,
    r.codigo_cliente, r.nome_cliente, r.endereco_postagem, r.endereco_destino_troca,
    r.motivo, r.justificativa_outros, r.solicitado_por_nome, r.aprovacao_versao,
    r.nc_id,
    case when nc.numero is null then null
      else 'NC-' || lpad(nc.numero::text, greatest(4, length(nc.numero::text)), '0') end,
    nc.origem, nc.descricao, p.proprio,
    not p.proprio or coalesce((select c.permitir_autoaprovacao from public.aprovacao_config c where c.id), false)
  from public.solicitacoes_reverso r
  left join public.nao_conformidades nc on nc.id = r.nc_id
  cross join lateral (
    select coalesce(r.solicitado_por = auth.uid(), false)
      or coalesce(r.aprovacao_versao_por = auth.uid(), false) as proprio
  ) p
  where r.aprovacao_status = 'aguardando_aprovacao'
    and r.inutilizada_em is null
    and public.usuario_pode_aprovar_reversa(r.empresa, r.setor)
  order by r.created_at, r.id;
$$;
grant execute on function public.fila_aprovacao_reversas() to authenticated, service_role;

create or replace function public.listar_recebimentos_fisicos_pendentes()
returns table (solicitacao_id uuid, concluido_em timestamptz)
language sql stable security definer
set search_path = ''
as $$
  select r.id, r.concluido_em
  from public.solicitacoes_reverso r
  where auth.uid() is not null
    and r.inutilizada_em is null
    and r.status = 'concluido'
    and r.empresa = any (public.empresas_recebimento_manual())
    and public.reversa_conclusao_por_correios(r.id)
  order by r.concluido_em desc nulls last, r.id
  limit 500;
$$;
grant execute on function public.listar_recebimentos_fisicos_pendentes() to authenticated;

create or replace function public.listar_notificacoes_emissao()
returns table (
  id uuid,
  solicitacao_id uuid,
  empresa text,
  created_at timestamptz,
  lida_em timestamptz,
  nao_lidas_total integer
)
language sql stable security definer
set search_path = ''
as $$
  select n.id, n.solicitacao_id, n.empresa, n.created_at, n.lida_em,
    (count(*) filter (where n.lida_em is null) over ())::integer
  from public.reversa_notificacoes_emissao n
  where auth.uid() is not null
    and n.destinatario_id = auth.uid()
    and exists (
      select 1 from auth.users u
      where u.id = auth.uid()
        and coalesce(u.raw_app_meta_data -> 'telas', '[]'::jsonb) ? 'emitir-etiqueta'
        and coalesce(u.raw_app_meta_data -> 'empresas_acesso', '[]'::jsonb) ? n.empresa
    )
    and exists (
      select 1 from public.solicitacoes_reverso r
      where r.id = n.solicitacao_id and r.empresa = n.empresa and r.inutilizada_em is null
    )
  order by n.created_at desc, n.id desc
  limit 50;
$$;
revoke all on function public.listar_notificacoes_emissao() from public, anon;
grant execute on function public.listar_notificacoes_emissao() to authenticated;

commit;

-- ============================================================
-- SOURCE: supabase/migrations/20261109100000_nc_classificacao_separada.sql
-- ============================================================
-- ============================================================
-- Não conformidades: classificação separada (incremental)
-- ------------------------------------------------------------
-- A "origem" (nc_origens) mistura o problema e o setor: "Erro expedição –
-- endereço incorreto" é o problema "Endereço incorreto" causado pela Expedição.
-- Esta migration acrescenta, sem apagar nem reescrever nada:
--   tipo_problema  → Tipo do problema (lista 'tipo_problema')
--   causador       → Origem / causador (lista 'causador')
--   area_registro  → Área que registrou (lista 'area')
--   area_tratativa → Área responsável pela tratativa (lista 'area'; nunca uma pessoa)
--   custo_situacao → 'Sim' | 'Não' | 'Em apuração'; nulo = não informada
-- Continuam como estão: origem, area_responsavel e evitavel (derivados da
-- origem), os cálculos, a planilha e o vínculo opcional NC ↔ reversa.
--
-- Mapeamento automático (nc_classificacao_legada): só o inequívoco. Origens
-- ambíguas ficam com o tipo nulo e aparecem em
-- vw_nao_conformidades.classificacao_pendente. Só preenche campos vazios.
-- Não toca em solicitacoes_reverso.setor (usado na aprovação do reverso).
--
-- Requer: 20261030120000_lixeira_chamados.sql
-- Idempotente: pode ser executada mais de uma vez sem alterar o que já foi gravado.
-- ============================================================

-- 1. Listas novas. Valores existentes ficam como estão (ordem e ativo preservados).
alter table public.nc_listas drop constraint if exists nc_listas_lista_check;
alter table public.nc_listas
  add constraint nc_listas_lista_check check (
    lista in ('area', 'tipo_saida', 'resolucao', 'empresa', 'como_identificada', 'reembolso', 'tipo_problema', 'causador')
  );

insert into public.nc_listas (lista, valor, ordem)
select v.lista, v.valor, v.ordem
from (values
  ('tipo_problema', 'Endereço incorreto', 1),
  ('tipo_problema', 'Mercadoria trocada ou embalada junto', 2),
  ('tipo_problema', 'Etiqueta ou pré-postagem', 3),
  ('tipo_problema', 'Embalagem inadequada / avaria por embalagem', 4),
  ('tipo_problema', 'Atraso de postagem', 5),
  ('tipo_problema', 'Postagem duplicada', 6),
  ('tipo_problema', 'Postagem sem NF', 7),
  ('tipo_problema', 'Erro de faturamento / NF', 8),
  ('tipo_problema', 'Tipo de frete incorreto (CIF/FOB)', 9),
  ('tipo_problema', 'Frete não cobrado na venda', 10),
  ('tipo_problema', 'Reverso sem autorização', 11),
  ('tipo_problema', 'Frete carona', 12),
  ('tipo_problema', 'Mercadoria apreendida', 13),
  ('tipo_problema', 'Extravio', 14),
  ('tipo_problema', 'Avaria no transporte', 15),
  ('tipo_problema', 'Entregue para a pessoa errada', 16),
  ('tipo_problema', 'Consta entregue / não entregue no local', 17),
  ('tipo_problema', 'Endereço não localizado', 18),
  ('tipo_problema', 'Entregador não atendido', 19),
  ('tipo_problema', 'Cliente desconhecido', 20),
  ('tipo_problema', 'Entregue, porém cliente afirma que não recebeu', 21),
  ('tipo_problema', 'Mercadoria devolvida pelo destinatário', 22),
  ('tipo_problema', 'Não retirada no prazo', 23),
  ('tipo_problema', 'Erro da/o cliente', 24),
  ('tipo_problema', 'Peça de outra marca recebida', 25),
  ('tipo_problema', 'Outro', 26),
  ('causador', 'Expedição', 1),
  ('causador', 'Financeiro', 2),
  ('causador', 'Comercial', 3),
  ('causador', 'Expedição e Financeiro', 4),
  ('causador', 'Correios', 5),
  ('causador', 'Outro transportador', 6),
  ('causador', 'Fiscalização', 7),
  ('causador', 'Cliente / destinatário', 8),
  ('causador', 'A apurar', 9)
) as v (lista, valor, ordem)
where true
on conflict (lista, valor) do nothing;

-- 2. Colunas novas (nulas: a NC existente e o formulário atual continuam válidos).
alter table public.nao_conformidades
  add column if not exists tipo_problema text,
  add column if not exists causador text,
  add column if not exists area_registro text,
  add column if not exists area_tratativa text,
  add column if not exists custo_situacao text;

alter table public.nao_conformidades drop constraint if exists nao_conformidades_custo_situacao_check;
alter table public.nao_conformidades
  add constraint nao_conformidades_custo_situacao_check
  check (custo_situacao is null or custo_situacao in ('Sim', 'Não', 'Em apuração'));

comment on column public.nao_conformidades.origem is 'Legado: origem composta (problema e setor juntos). Mantida para a fila de aprovação, o painel e a planilha. Novas telas usam tipo_problema e causador.';
comment on column public.nao_conformidades.tipo_problema is 'Tipo do problema (lista tipo_problema). Nulo = ainda não classificado (ver vw_nao_conformidades.classificacao_pendente).';
comment on column public.nao_conformidades.causador is 'Origem / causador: quem deu causa (lista causador). Não é a área que registrou nem a que trata.';
comment on column public.nao_conformidades.area_registro is 'Área que registrou a NC (lista area). Não é a responsável pela tratativa nem o causador.';
comment on column public.nao_conformidades.area_tratativa is 'Área responsável pela tratativa (lista area). Sempre área, nunca pessoa; nulo = não atribuída.';
comment on column public.nao_conformidades.custo_situacao is 'Sim, Não ou Em apuração. Nulo só em registros sem decisão: nunca significa Não nem custo zero. Mudar a situação não apaga valores.';

-- 3. Mapeamento das origens antigas: só o inequívoco. Tipo ou causador nulos = revisar.
create or replace function public.nc_classificacao_legada(p_origem text)
returns table (tipo_problema text, causador text)
language sql
immutable
set search_path = ''
as $$
  select m.tipo_problema, m.causador
  from (values
    ('Erro expedição – endereço incorreto', 'Endereço incorreto', 'Expedição'),
    ('Erro expedição – mercadoria trocada ou embalada junto', 'Mercadoria trocada ou embalada junto', 'Expedição'),
    ('Erro expedição – etiqueta ou pré-postagem', 'Etiqueta ou pré-postagem', 'Expedição'),
    ('Embalagem inadequada / avaria por embalagem', 'Embalagem inadequada / avaria por embalagem', 'Expedição'),
    ('Atraso de postagem', 'Atraso de postagem', 'Expedição'),
    ('Postagem duplicada', 'Postagem duplicada', 'Expedição'),
    ('Postagem sem NF', 'Postagem sem NF', 'Expedição'),
    ('Erro de faturamento / NF (destinatário ou endereço)', null::text, 'Financeiro'),
    ('Erro da expedição e do financeiro', null::text, 'Expedição e Financeiro'),
    ('Erro vendedora – endereço incorreto', 'Endereço incorreto', 'Comercial'),
    ('Tipo de frete incorreto (CIF/FOB)', 'Tipo de frete incorreto (CIF/FOB)', 'Comercial'),
    ('Frete não cobrado na venda', 'Frete não cobrado na venda', 'Comercial'),
    ('Reverso sem autorização', 'Reverso sem autorização', 'Comercial'),
    ('Frete carona (pacote de terceiro com pedido da marca)', 'Frete carona', 'Comercial'),
    ('Mercadoria apreendida (fiscalização)', 'Mercadoria apreendida', 'Fiscalização'),
    ('Extravio Correios', 'Extravio', 'Correios'),
    ('Avaria no transporte', 'Avaria no transporte', 'Correios'),
    ('Entregue para a pessoa errada', 'Entregue para a pessoa errada', 'Correios'),
    ('Consta entregue / não entregue no local', 'Consta entregue / não entregue no local', 'Correios'),
    ('Endereço não localizado', 'Endereço não localizado', 'Correios'),
    ('Entregador não atendido', 'Entregador não atendido', 'Cliente / destinatário'),
    ('Cliente desconhecido', 'Cliente desconhecido', 'Cliente / destinatário'),
    ('Entregue, porém cliente afirma que não recebeu', 'Entregue, porém cliente afirma que não recebeu', 'Cliente / destinatário'),
    ('Mercadoria devolvida pelo destinatário', 'Mercadoria devolvida pelo destinatário', 'Cliente / destinatário'),
    ('Não retirada no prazo (aguardando retirada)', 'Não retirada no prazo', 'Cliente / destinatário'),
    ('Erro da/o cliente', 'Erro da/o cliente', 'Cliente / destinatário'),
    ('Peça de outra marca recebida', 'Peça de outra marca recebida', 'Cliente / destinatário'),
    ('Outro', 'Outro', 'A apurar')
  ) as m (origem, tipo_problema, causador)
  where m.origem = p_origem;
$$;

-- 4. Origem gravada sem a classificação nova (formulário atual, importação):
--    preenche só os campos vazios, nunca sobrescreve.
create or replace function public.nc_classificar_origem_legada() returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_tipo text;
  v_causador text;
begin
  if new.origem is null or (tg_op = 'UPDATE' and new.origem is not distinct from old.origem) then
    return new;
  end if;
  select m.tipo_problema, m.causador into v_tipo, v_causador
  from public.nc_classificacao_legada(new.origem) m;
  new.tipo_problema := coalesce(new.tipo_problema, v_tipo);
  new.causador := coalesce(new.causador, v_causador);
  return new;
end;
$$;

drop trigger if exists trg_nc_classificar_origem_legada on public.nao_conformidades;
create trigger trg_nc_classificar_origem_legada before insert or update of origem on public.nao_conformidades
  for each row execute function public.nc_classificar_origem_legada();

-- 5. Situação do custo. Ausência de valor não vira "Não" nem custo zero.
create or replace function public.nc_validar_custo_situacao() returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_com_custo boolean;
  v_com_valor boolean;
begin
  v_com_custo := coalesce(new.custo_produto, 0) > 0
    or coalesce(new.custo_frete_adicional, 0) > 0
    or coalesce(new.custo_multa_outros, 0) > 0;
  v_com_valor := v_com_custo or coalesce(new.valor_reembolsado, 0) > 0;

  if tg_op = 'INSERT' then
    if new.custo_situacao is null then
      new.custo_situacao := case when v_com_custo then 'Sim' else 'Em apuração' end;
    end if;
  else
    if old.custo_situacao is not null and new.custo_situacao is null then
      raise exception 'A situação do custo não pode voltar a ficar sem informação.' using errcode = '23514';
    end if;
    if new.custo_situacao is distinct from old.custo_situacao and (
         (old.custo_produto is not null and new.custo_produto is null)
      or (old.custo_frete_adicional is not null and new.custo_frete_adicional is null)
      or (old.custo_multa_outros is not null and new.custo_multa_outros is null)
      or (old.valor_reembolsado is not null and new.valor_reembolsado is null)
    ) then
      raise exception 'Mudar a situação do custo não apaga valores já registrados.' using errcode = '23514';
    end if;
  end if;

  if new.custo_situacao = 'Não' and v_com_valor then
    raise exception 'Situação do custo "Não" exige custos sem valor: há valores registrados.' using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_nc_custo_situacao on public.nao_conformidades;
create trigger trg_nc_custo_situacao before insert or update on public.nao_conformidades
  for each row execute function public.nc_validar_custo_situacao();

-- 6. Valores das listas, inclusive os novos. Mesma regra dos campos antigos:
--    só confere quando o campo entra ou muda, para não travar registros antigos.
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
  if tg_op = 'INSERT' or new.tipo_problema is distinct from old.tipo_problema then
    perform public.nc_exigir_valor_da_lista('tipo_problema', new.tipo_problema, 'Tipo do problema');
  end if;
  if tg_op = 'INSERT' or new.causador is distinct from old.causador then
    perform public.nc_exigir_valor_da_lista('causador', new.causador, 'Origem / causador');
  end if;
  if tg_op = 'INSERT' or new.area_registro is distinct from old.area_registro then
    perform public.nc_exigir_valor_da_lista('area', new.area_registro, 'Área que registrou');
  end if;
  if tg_op = 'INSERT' or new.area_tratativa is distinct from old.area_tratativa then
    perform public.nc_exigir_valor_da_lista('area', new.area_tratativa, 'Área responsável pela tratativa');
  end if;
  return new;
end;
$$;

-- 7. Linha do tempo: passa a registrar também os campos novos (o restante é o mesmo).
create or replace function public.nc_registrar_historico() returns trigger
language plpgsql
security definer
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
    "data_encerramento": "Data de encerramento",
    "tipo_problema": "Tipo do problema",
    "causador": "Origem / causador",
    "area_registro": "Área que registrou",
    "area_tratativa": "Área responsável pela tratativa",
    "custo_situacao": "Situação do custo"
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

-- 8. Classificação dos registros existentes: só campos vazios, só o inequívoco.
update public.nao_conformidades nc
set tipo_problema = coalesce(nc.tipo_problema, (
      select m.tipo_problema from public.nc_classificacao_legada(nc.origem) m)),
    causador = coalesce(nc.causador, (
      select m.causador from public.nc_classificacao_legada(nc.origem) m))
where nc.origem is not null
  and exists (
    select 1 from public.nc_classificacao_legada(nc.origem) m
    where (nc.tipo_problema is null and m.tipo_problema is not null)
       or (nc.causador is null and m.causador is not null)
  );

-- Situação do custo: só onde há custo positivo registrado. O resto fica nulo (não informada).
update public.nao_conformidades
set custo_situacao = 'Sim'
where custo_situacao is null
  and (
    coalesce(custo_produto, 0) > 0
    or coalesce(custo_frete_adicional, 0) > 0
    or coalesce(custo_multa_outros, 0) > 0
  );

-- 9. Visão: mesmos campos calculados de antes, mais a pendência de classificação.
--    Recriada (não "replace") porque nc.* passa a incluir as colunas novas.
drop view if exists public.vw_nao_conformidades;
create view public.vw_nao_conformidades with (security_invoker = true) as
select
  nc.*,
  'NC-' || lpad(nc.numero::text, greatest(4, length(nc.numero::text)), '0') as codigo,
  case when nc.origem is null then null else coalesce(o.area, 'A definir') end as area_responsavel,
  case when nc.origem is null then null else coalesce(o.evitavel, 'A avaliar') end as evitavel,
  case
    when nc.data_ocorrencia is null and nc.data_identificacao is null then null
    else coalesce(nc.data_encerramento, current_date) - coalesce(nc.data_identificacao, nc.data_ocorrencia)
  end as dias_em_aberto,
  (select count(*)::integer from public.solicitacoes_reverso r where r.nc_id = nc.id) as qtd_reversas,
  (nc.tipo_problema is null or nc.causador is null) as classificacao_pendente
from public.nao_conformidades nc
left join public.nc_origens o on o.nome = nc.origem;

revoke all on public.vw_nao_conformidades from anon;
grant select on public.vw_nao_conformidades to authenticated;

-- ============================================================
-- SOURCE: supabase/migrations/20261109120000_nc_registro_classificacao.sql
-- ============================================================
-- ============================================================
-- Não conformidades: registro novo com classificação explícita (incremental)
-- ------------------------------------------------------------
-- Uma NC registrada pela aplicação (não importada da planilha) precisa de
-- tipo do problema e de origem / causador. Quando o tipo é "Outro", a descrição
-- é obrigatória. Nada disso é inventado: a origem antiga continua como está e a
-- classificação nova só vem do mapeamento inequívoco (20261109100000).
--
-- Também impede que tipo ou causador voltem a ficar sem informação, e faz
-- ncs_para_reversa devolver tipo e causador (a NC aparece no formulário da
-- reversa mesmo sem origem antiga).
--
-- A importação da planilha (importada = true, feita pelo administrador) segue
-- as mesmas regras de antes: o histórico entra como veio.
--
-- Requer: 20261109100000_nc_classificacao_separada.sql
-- Idempotente: pode ser executada mais de uma vez.
-- ============================================================

-- 1. Regra de registro novo e de conservação da classificação.
--    Roda depois de nc_proteger_campos (define importada) e de
--    nc_classificar_origem_legada (preenche o que o mapeamento der).
create or replace function public.nc_validar_classificacao_registro() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.importada then
      return new;
    end if;
    if new.tipo_problema is null then
      raise exception 'Informe o tipo do problema.' using errcode = '23514';
    end if;
    if new.causador is null then
      raise exception 'Informe a origem / causador (use A apurar se não souber).' using errcode = '23514';
    end if;
  else
    if old.tipo_problema is not null and new.tipo_problema is null then
      raise exception 'O tipo do problema não pode voltar a ficar sem informação.' using errcode = '23514';
    end if;
    if old.causador is not null and new.causador is null then
      raise exception 'A origem / causador não pode voltar a ficar sem informação.' using errcode = '23514';
    end if;
  end if;

  -- "Outro" exige descrição quando o tipo entra ou a descrição muda. Registros
  -- antigos sem descrição continuam editáveis enquanto esses dois campos não mudam.
  if new.tipo_problema = 'Outro'
     and (tg_op = 'INSERT'
          or new.tipo_problema is distinct from old.tipo_problema
          or new.descricao is distinct from old.descricao)
     and btrim(coalesce(new.descricao, '')) = '' then
    raise exception 'Descreva o problema quando o tipo for Outro.' using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_nc_validar_classificacao_registro on public.nao_conformidades;
create trigger trg_nc_validar_classificacao_registro before insert or update on public.nao_conformidades
  for each row execute function public.nc_validar_classificacao_registro();

-- 2. ncs_para_reversa devolve também tipo e causador. Muda a assinatura (novas
--    colunas no fim), então a função é recriada. Continua sem custos.
drop function if exists public.ncs_para_reversa(text);

create function public.ncs_para_reversa(p_empresa text)
returns table (id uuid, numero integer, codigo text, data_ocorrencia date, cliente text, origem text, status text, tipo_problema text, causador text)
language sql
stable
security definer
set search_path = ''
as $$
  select
    nc.id,
    nc.numero,
    'NC-' || lpad(nc.numero::text, greatest(4, length(nc.numero::text)), '0'),
    nc.data_ocorrencia,
    nc.cliente,
    nc.origem,
    nc.status,
    nc.tipo_problema,
    nc.causador
  from public.nao_conformidades nc
  where nc.empresa = p_empresa
    and nc.status in ('Aberta', 'Em tratativa')
    and (public.pode_ver_nc() or p_empresa = any (public.empresas_formulario()))
  order by nc.numero desc;
$$;

revoke execute on function public.ncs_para_reversa(text) from public, anon;
grant execute on function public.ncs_para_reversa(text) to authenticated;

-- ============================================================
-- SOURCE: supabase/migrations/20261109130000_fila_aprovacao_classificacao_nc.sql
-- ============================================================
-- ============================================================
-- Fila de aprovação da reversa: tipo do problema e origem / causador da NC vinculada
-- ------------------------------------------------------------
-- A fila devolvia só a origem antiga da NC (nc_origem). Uma NC registrada depois da
-- classificação separada não tem origem antiga, então a aprovação não mostrava o que a
-- NC é. Esta migration acrescenta nc_tipo_problema e nc_causador no fim do retorno.
-- As colunas que já existiam mantêm nome, tipo e ordem.
--
-- Não muda quem vê a fila (usuario_pode_aprovar_reversa), o filtro, a ordem, a
-- autoaprovação nem o vínculo: a NC continua lida por r.nc_id, como antes.
--
-- Muda a assinatura (colunas novas no fim), então a função é recriada. O drop apaga os
-- privilégios anteriores; eles são refeitos no fim: anon e public sem execução.
--
-- Requer: 20261109100000_nc_classificacao_separada.sql (colunas tipo_problema e causador).
-- Idempotente: pode ser executada mais de uma vez.
-- ============================================================

drop function if exists public.fila_aprovacao_reversas();

create function public.fila_aprovacao_reversas()
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
  endereco_destino_troca text,
  motivo text,
  justificativa_outros text,
  solicitado_por_nome text,
  aprovacao_versao integer,
  nc_id uuid,
  nc_codigo text,
  nc_origem text,
  nc_descricao text,
  proprio_pedido boolean,
  pode_aprovar boolean,
  nc_tipo_problema text,
  nc_causador text
)
language sql stable security definer
set search_path = ''
as $$
  select
    r.id, r.empresa, r.created_at, r.data_solicitacao, r.solicitante, r.setor,
    r.codigo_cliente, r.nome_cliente, r.endereco_postagem, r.endereco_destino_troca,
    r.motivo, r.justificativa_outros, r.solicitado_por_nome, r.aprovacao_versao,
    r.nc_id,
    case when nc.numero is null then null
      else 'NC-' || lpad(nc.numero::text, greatest(4, length(nc.numero::text)), '0') end,
    nc.origem, nc.descricao, p.proprio,
    not p.proprio or coalesce((select c.permitir_autoaprovacao from public.aprovacao_config c where c.id), false),
    nc.tipo_problema, nc.causador
  from public.solicitacoes_reverso r
  left join public.nao_conformidades nc on nc.id = r.nc_id
  cross join lateral (
    select coalesce(r.solicitado_por = auth.uid(), false)
      or coalesce(r.aprovacao_versao_por = auth.uid(), false) as proprio
  ) p
  where r.aprovacao_status = 'aguardando_aprovacao'
    and r.inutilizada_em is null
    and public.usuario_pode_aprovar_reversa(r.empresa, r.setor)
  order by r.created_at, r.id;
$$;

revoke execute on function public.fila_aprovacao_reversas() from public, anon;
grant execute on function public.fila_aprovacao_reversas() to authenticated, service_role;

-- ============================================================
-- SOURCE: supabase/migrations/20261109140000_nc_edicao_versao_auditoria.sql
-- ============================================================
-- Não conformidades: fechamento da edição (versão, gravação só do alterado e trilha financeira).
--
-- 1. updated_at passa a ser a versão da linha: gravado com clock_timestamp() (instante da escrita),
--    e não com now() (início da transação), para que a versão nunca volte a um valor antigo.
-- 2. nc_salvar_edicao: grava só os campos enviados, sob bloqueio da linha, e recusa a gravação
--    quando a versão enviada não é mais a atual (NC001). A comparação e o UPDATE são um único
--    comando dentro da função, então nenhuma gravação concorrente passa entre eles.
-- 3. nc_auditoria_financeira: trilha append-only dos valores anteriores e posteriores de custos,
--    reembolso e situação, com autor, data e justificativa. Gravada pelo banco, não pelo navegador.
-- 4. Correção de valor já registrado (inclusive para zero ou vazio) exige justificativa (NC002).
-- Migração incremental: não altera as migrations anteriores nem os dados existentes.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Versão da linha com o instante da escrita (mesmo corpo de 20261020130100, updated_at com clock_timestamp())
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
  new.updated_at := clock_timestamp();

  if new.empresa is distinct from old.empresa
     and exists (select 1 from public.solicitacoes_reverso r where r.nc_id = old.id) then
    raise exception 'Esta NC já tem reversa vinculada: a empresa / contrato não pode mudar.' using errcode = '23514';
  end if;

  return new;
end;
$$;

-- 3. Trilha financeira (append-only; sem chave estrangeira para sobreviver à exclusão da NC)
create table if not exists public.nc_auditoria_financeira (
  id uuid primary key default gen_random_uuid(),
  nc_id uuid not null,
  campo text not null check (campo in ('custo_produto', 'custo_frete_adicional', 'custo_multa_outros', 'valor_reembolsado', 'custo_situacao')),
  tipo_alteracao text not null check (tipo_alteracao in ('preenchimento', 'correcao')),
  valor_anterior numeric(12, 2),
  valor_posterior numeric(12, 2),
  texto_anterior text,
  texto_posterior text,
  motivo text,
  origem text not null default 'direta' check (origem in ('edicao', 'direta')),
  autor_id uuid,
  autor_nome text not null default 'Sistema',
  criado_em timestamptz not null default clock_timestamp(),
  constraint nc_auditoria_valor_ou_texto check (
    (campo = 'custo_situacao' and valor_anterior is null and valor_posterior is null)
    or (campo <> 'custo_situacao' and texto_anterior is null and texto_posterior is null)
  )
);

comment on table public.nc_auditoria_financeira is 'Valores anteriores e posteriores de custos, reembolso e situação do custo. Gravada pelo banco; não é apagada nem alterada.';

create index if not exists idx_nc_auditoria_nc on public.nc_auditoria_financeira (nc_id, criado_em);

alter table public.nc_auditoria_financeira enable row level security;

drop policy if exists "nc_auditoria_select" on public.nc_auditoria_financeira;
create policy "nc_auditoria_select" on public.nc_auditoria_financeira
  for select to authenticated using ((select public.pode_ver_nc()));

revoke all on public.nc_auditoria_financeira from public, anon, authenticated;
grant select on public.nc_auditoria_financeira to authenticated;

create or replace function public.nc_auditar_alteracao_financeira() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_motivo text := nullif(btrim(coalesce(current_setting('nc.motivo_correcao', true), '')), '');
  v_origem text := case when current_setting('nc.origem_alteracao', true) = 'edicao' then 'edicao' else 'direta' end;
  v_autor_id uuid := auth.uid();
  v_autor_nome text := public.nc_usuario_nome();
begin
  if old.custo_produto is distinct from new.custo_produto then
    insert into public.nc_auditoria_financeira (nc_id, campo, tipo_alteracao, valor_anterior, valor_posterior, motivo, origem, autor_id, autor_nome)
    values (new.id, 'custo_produto', case when old.custo_produto is null then 'preenchimento' else 'correcao' end,
            old.custo_produto, new.custo_produto, v_motivo, v_origem, v_autor_id, v_autor_nome);
  end if;
  if old.custo_frete_adicional is distinct from new.custo_frete_adicional then
    insert into public.nc_auditoria_financeira (nc_id, campo, tipo_alteracao, valor_anterior, valor_posterior, motivo, origem, autor_id, autor_nome)
    values (new.id, 'custo_frete_adicional', case when old.custo_frete_adicional is null then 'preenchimento' else 'correcao' end,
            old.custo_frete_adicional, new.custo_frete_adicional, v_motivo, v_origem, v_autor_id, v_autor_nome);
  end if;
  if old.custo_multa_outros is distinct from new.custo_multa_outros then
    insert into public.nc_auditoria_financeira (nc_id, campo, tipo_alteracao, valor_anterior, valor_posterior, motivo, origem, autor_id, autor_nome)
    values (new.id, 'custo_multa_outros', case when old.custo_multa_outros is null then 'preenchimento' else 'correcao' end,
            old.custo_multa_outros, new.custo_multa_outros, v_motivo, v_origem, v_autor_id, v_autor_nome);
  end if;
  if old.valor_reembolsado is distinct from new.valor_reembolsado then
    insert into public.nc_auditoria_financeira (nc_id, campo, tipo_alteracao, valor_anterior, valor_posterior, motivo, origem, autor_id, autor_nome)
    values (new.id, 'valor_reembolsado', case when old.valor_reembolsado is null then 'preenchimento' else 'correcao' end,
            old.valor_reembolsado, new.valor_reembolsado, v_motivo, v_origem, v_autor_id, v_autor_nome);
  end if;
  if old.custo_situacao is distinct from new.custo_situacao then
    insert into public.nc_auditoria_financeira (nc_id, campo, tipo_alteracao, texto_anterior, texto_posterior, motivo, origem, autor_id, autor_nome)
    values (new.id, 'custo_situacao', case when old.custo_situacao is null then 'preenchimento' else 'correcao' end,
            old.custo_situacao, new.custo_situacao, v_motivo, v_origem, v_autor_id, v_autor_nome);
  end if;
  return null;
end;
$$;

revoke all on function public.nc_auditar_alteracao_financeira() from public, anon, authenticated;

drop trigger if exists trg_nc_auditoria_financeira on public.nao_conformidades;
create trigger trg_nc_auditoria_financeira after update on public.nao_conformidades
  for each row execute function public.nc_auditar_alteracao_financeira();

-- 2. Gravação da edição: só os campos enviados, com a versão conferida na mesma transação
create or replace function public.nc_salvar_edicao(
  p_id uuid,
  p_versao timestamptz,
  p_campos jsonb,
  p_motivo text default null
) returns setof public.nao_conformidades
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_editaveis constant text[] := array[
    'data_ocorrencia', 'data_identificacao', 'empresa', 'cliente', 'vendedora', 'romaneio', 'valor_romaneio',
    'nf', 'rastreio', 'data_postagem', 'tipo_saida', 'origem', 'como_identificada', 'status_correios',
    'descricao', 'resolucao', 'novo_rastreio', 'valor_declarado', 'valor_venda', 'frete_original',
    'custo_produto', 'custo_frete_adicional', 'custo_multa_outros', 'reembolso_correios', 'numero_pi',
    'valor_reembolsado', 'tempo_tratativa_min', 'status', 'data_encerramento', 'tipo_problema', 'causador',
    'area_registro', 'area_tratativa', 'custo_situacao'
  ];
  v_financeiros constant text[] := array[
    'custo_produto', 'custo_frete_adicional', 'custo_multa_outros', 'valor_reembolsado', 'custo_situacao'
  ];
  v_atual public.nao_conformidades%rowtype;
  v_novo public.nao_conformidades%rowtype;
  v_chave text;
  v_campo text;
  v_motivo text := nullif(btrim(coalesce(p_motivo, '')), '');
  v_correcao boolean := false;
begin
  if p_versao is null then
    raise exception 'A versão da não conformidade é obrigatória para gravar.' using errcode = 'NC004';
  end if;
  if not public.pode_editar_nc() then
    raise exception 'Você não tem permissão para editar esta não conformidade.' using errcode = '42501';
  end if;
  if p_campos is null or jsonb_typeof(p_campos) <> 'object' then
    raise exception 'As alterações devem ser enviadas como um objeto de campos.' using errcode = 'NC003';
  end if;
  for v_chave in select jsonb_object_keys(p_campos) loop
    if not (v_chave = any (v_editaveis)) then
      raise exception 'Campo não editável por esta operação: %', v_chave using errcode = 'NC003';
    end if;
  end loop;

  -- Bloqueia a linha e lê a versão mais recente dela (READ COMMITTED reavalia após a trava)
  select * into v_atual from public.nao_conformidades where id = p_id for update;
  if not found then
    raise exception 'Não conformidade não encontrada.' using errcode = 'NC005';
  end if;
  if v_atual.updated_at is distinct from p_versao then
    raise exception 'Esta não conformidade foi alterada por outra pessoa depois que foi aberta. Nada foi gravado.' using errcode = 'NC001';
  end if;

  if p_campos = '{}'::jsonb then
    return query select * from public.nao_conformidades where id = p_id;
    return;
  end if;

  v_novo := jsonb_populate_record(v_atual, p_campos);

  -- Correção: muda um valor ou a situação que já estavam registrados (zero e vazio contam como alteração)
  foreach v_campo in array v_financeiros loop
    if (to_jsonb(v_atual) ->> v_campo) is not null
       and (to_jsonb(v_atual) ->> v_campo) is distinct from (to_jsonb(v_novo) ->> v_campo) then
      v_correcao := true;
    end if;
  end loop;
  if v_correcao and v_motivo is null then
    raise exception 'Para corrigir um valor já registrado, informe a justificativa.' using errcode = 'NC002';
  end if;
  if v_motivo is not null and char_length(v_motivo) > 300 then
    raise exception 'A justificativa deve ter até 300 caracteres.' using errcode = 'NC002';
  end if;

  -- Nada efetivamente mudou: não regrava (a versão continua a mesma)
  if to_jsonb(v_novo) = to_jsonb(v_atual) then
    return query select * from public.nao_conformidades where id = p_id;
    return;
  end if;

  perform set_config('nc.motivo_correcao', coalesce(v_motivo, ''), true);
  perform set_config('nc.origem_alteracao', 'edicao', true);

  update public.nao_conformidades set
    data_ocorrencia = v_novo.data_ocorrencia,
    data_identificacao = v_novo.data_identificacao,
    empresa = v_novo.empresa,
    cliente = v_novo.cliente,
    vendedora = v_novo.vendedora,
    romaneio = v_novo.romaneio,
    valor_romaneio = v_novo.valor_romaneio,
    nf = v_novo.nf,
    rastreio = v_novo.rastreio,
    data_postagem = v_novo.data_postagem,
    tipo_saida = v_novo.tipo_saida,
    origem = v_novo.origem,
    como_identificada = v_novo.como_identificada,
    status_correios = v_novo.status_correios,
    descricao = v_novo.descricao,
    resolucao = v_novo.resolucao,
    novo_rastreio = v_novo.novo_rastreio,
    valor_declarado = v_novo.valor_declarado,
    valor_venda = v_novo.valor_venda,
    frete_original = v_novo.frete_original,
    custo_produto = v_novo.custo_produto,
    custo_frete_adicional = v_novo.custo_frete_adicional,
    custo_multa_outros = v_novo.custo_multa_outros,
    reembolso_correios = v_novo.reembolso_correios,
    numero_pi = v_novo.numero_pi,
    valor_reembolsado = v_novo.valor_reembolsado,
    tempo_tratativa_min = v_novo.tempo_tratativa_min,
    status = v_novo.status,
    data_encerramento = v_novo.data_encerramento,
    tipo_problema = v_novo.tipo_problema,
    causador = v_novo.causador,
    area_registro = v_novo.area_registro,
    area_tratativa = v_novo.area_tratativa,
    custo_situacao = v_novo.custo_situacao
  where id = p_id;

  return query select * from public.nao_conformidades where id = p_id;
end;
$$;

revoke all on function public.nc_salvar_edicao(uuid, timestamptz, jsonb, text) from public, anon;
grant execute on function public.nc_salvar_edicao(uuid, timestamptz, jsonb, text) to authenticated;

-- ============================================================
-- SOURCE: supabase/migrations/20261109150000_avisos_ciclo_reverso.sql
-- ============================================================
-- ============================================================
-- Avisos internos do ciclo da reversa (sino) para solicitante e aprovadores
-- ------------------------------------------------------------
-- Os avisos nascem dos mesmos acontecimentos da fila de comunicação
-- (reversa_comunicacoes_etiqueta), na mesma transação do acontecimento. Destinatário e
-- ocorrência vêm da própria fila, então seguem as mesmas regras de quem é avisado
-- (aprovador que não pode decidir não recebe; nada é gerado retroativamente). Não
-- depende de e-mail, Teams nem da configuração do transporte externo.
--
-- - Uma linha por (destinatário, pedido, evento, ocorrência): os dois canais da fila
--   (e-mail e Teams) de um mesmo acontecimento geram um único aviso.
-- - emissao_pendente (Expedição) não entra aqui: a Expedição já recebe o aviso de
--   emissão de reversa_notificacoes_emissao, gerado pela mesma aprovação.
-- - Aprovação pendente deixa de valer quando a versão é decidida ou substituída
--   (superado_em). O histórico (pedido criado, decisão, etiqueta, postagem, recebimento)
--   continua valendo.
-- - Listar, contar e marcar leitura conferem a autorização a cada chamada: destinatário
--   = usuário atual e pode_ler_solicitacao (aprovação: reversa_aprovador_pode_decidir).
--   Marcar leitura não aprova, não conclui e não altera o pedido.
--
-- Requer: 20261027100000_comunicacao_ciclo_pedido.sql (fila vigente),
--         20261023100000_aprovacao_reversas.sql (solicitacoes_aprovacoes),
--         20261023190000_aprovadores_empresa_setor.sql (aprovadores por setor).
-- Idempotente: pode ser executada mais de uma vez.
-- ============================================================

create table if not exists public.reversa_avisos (
  id uuid primary key default gen_random_uuid(),
  destinatario_id uuid not null references auth.users (id) on delete cascade,
  solicitacao_id uuid not null references public.solicitacoes_reverso (id) on delete cascade,
  empresa text not null check (empresa in ('Alinare', 'Novitah')),
  evento text not null check (evento in (
    'pedido_criado', 'aprovacao_pendente', 'pedido_aprovado', 'pedido_rejeitado',
    'etiqueta_disponivel', 'postagem_confirmada', 'recebimento_confirmado'
  )),
  ocorrencia_id uuid not null,
  versao integer check (versao is null or versao > 0),
  justificativa text check (justificativa is null or char_length(justificativa) <= 1000),
  criado_em timestamptz not null default now(),
  lido_em timestamptz,
  superado_em timestamptz,
  constraint reversa_avisos_ocorrencia_uk
    unique (destinatario_id, solicitacao_id, evento, ocorrencia_id)
);

comment on table public.reversa_avisos is
  'Avisos internos do ciclo da reversa para solicitante e aprovadores. Derivados da fila de comunicação na mesma transação; leitura não altera o pedido.';

create index if not exists idx_reversa_avisos_destinatario_recente
  on public.reversa_avisos (destinatario_id, criado_em desc);

alter table public.reversa_avisos enable row level security;
revoke all on table public.reversa_avisos from public, anon, authenticated;

-- Quem pode ver um aviso agora. Aprovação pendente exige a autoridade de decisão
-- sobre o pedido (empresa, setor e regra de autoaprovação); os demais, a leitura do pedido.
create or replace function public.reversa_aviso_visivel(p_evento text, p_solicitacao_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when p_evento = 'aprovacao_pendente'
      then public.reversa_aprovador_pode_decidir(auth.uid(), p_solicitacao_id)
    else public.pode_ler_solicitacao(p_solicitacao_id)
  end;
$$;
revoke all on function public.reversa_aviso_visivel(text, uuid) from public, anon, authenticated, service_role;

-- Gera o aviso a partir de cada linha nova da fila. Expedição e linhas sem destinatário
-- ficam de fora. O dedupe por (destinatário, pedido, evento, ocorrência) absorve o segundo canal.
create or replace function public.reversa_criar_aviso_de_comunicacao()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_justificativa text;
  v_versao_texto text;
begin
  if new.destinatario_id is null or new.evento = 'emissao_pendente' then
    return new;
  end if;
  if new.evento not in (
    'pedido_criado', 'aprovacao_pendente', 'pedido_aprovado', 'pedido_rejeitado',
    'etiqueta_disponivel', 'postagem_confirmada', 'recebimento_confirmado'
  ) then
    return new;
  end if;

  v_justificativa := nullif(btrim(coalesce(new.contexto ->> 'justificativa', '')), '');
  if v_justificativa is null and new.evento in ('pedido_aprovado', 'pedido_rejeitado') then
    -- Na fila, a ocorrência da decisão é a própria linha de solicitacoes_aprovacoes
    select nullif(btrim(coalesce(a.justificativa, '')), '') into v_justificativa
      from public.solicitacoes_aprovacoes a
     where a.id = new.ocorrencia_id;
  end if;

  -- Sem exceção aqui: um contexto inesperado não pode impedir o acontecimento de negócio
  v_versao_texto := new.contexto ->> 'versao';

  insert into public.reversa_avisos
    (destinatario_id, solicitacao_id, empresa, evento, ocorrencia_id, versao, justificativa)
  values (
    new.destinatario_id,
    new.solicitacao_id,
    new.empresa,
    new.evento,
    new.ocorrencia_id,
    case when v_versao_texto ~ '^[0-9]{1,9}$' then v_versao_texto::integer end,
    left(v_justificativa, 1000)
  )
  on conflict (destinatario_id, solicitacao_id, evento, ocorrencia_id) do nothing;

  return new;
end;
$$;
revoke all on function public.reversa_criar_aviso_de_comunicacao()
  from public, anon, authenticated, service_role;

drop trigger if exists reversa_avisos_de_comunicacao on public.reversa_comunicacoes_etiqueta;
create trigger reversa_avisos_de_comunicacao
  after insert on public.reversa_comunicacoes_etiqueta
  for each row execute function public.reversa_criar_aviso_de_comunicacao();

-- Decisão ou nova versão deixa de ser pendência: as aprovações pendentes anteriores
-- (e, na decisão, as da própria versão) são superadas. Uma nova versão só supera as
-- anteriores, nunca a própria rodada que acabou de ser avisada.
create or replace function public.reversa_superar_avisos_de_aprovacao()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.evento not in ('aprovada', 'rejeitada', 'alterada', 'invalidada') then
    return new;
  end if;

  update public.reversa_avisos a
     set superado_em = now()
   where a.solicitacao_id = new.solicitacao_id
     and a.evento = 'aprovacao_pendente'
     and a.superado_em is null
     and (
       a.versao < new.versao
       or (a.versao <= new.versao and new.evento in ('aprovada', 'rejeitada'))
     );

  return new;
end;
$$;
revoke all on function public.reversa_superar_avisos_de_aprovacao()
  from public, anon, authenticated, service_role;

drop trigger if exists reversa_avisos_supera_pendencias on public.solicitacoes_aprovacoes;
create trigger reversa_avisos_supera_pendencias
  after insert on public.solicitacoes_aprovacoes
  for each row execute function public.reversa_superar_avisos_de_aprovacao();

-- Lista do usuário atual: só os avisos dele que ainda podem ser vistos.
create or replace function public.listar_avisos_reverso(p_limite integer default 50)
returns table (
  id uuid,
  solicitacao_id uuid,
  empresa text,
  evento text,
  versao integer,
  justificativa text,
  nome_cliente text,
  criado_em timestamptz,
  lido_em timestamptz,
  superado_em timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select a.id, a.solicitacao_id, a.empresa, a.evento, a.versao, a.justificativa,
         r.nome_cliente, a.criado_em, a.lido_em, a.superado_em
    from public.reversa_avisos a
    join public.solicitacoes_reverso r on r.id = a.solicitacao_id
   where auth.uid() is not null
     and a.destinatario_id = auth.uid()
     and public.reversa_aviso_visivel(a.evento, a.solicitacao_id)
   order by a.criado_em desc, a.id desc
   limit least(greatest(coalesce(p_limite, 50), 1), 100);
$$;
revoke all on function public.listar_avisos_reverso(integer) from public, anon, authenticated;
grant execute on function public.listar_avisos_reverso(integer) to authenticated;

-- Não lidos que ainda valem: superados não exigem ação e não entram na contagem.
create or replace function public.contar_avisos_reverso_nao_lidos()
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select case when auth.uid() is null then 0 else (
    select count(*)::integer
      from public.reversa_avisos a
     where a.destinatario_id = auth.uid()
       and a.lido_em is null
       and a.superado_em is null
       and public.reversa_aviso_visivel(a.evento, a.solicitacao_id)
  ) end;
$$;
revoke all on function public.contar_avisos_reverso_nao_lidos() from public, anon, authenticated;
grant execute on function public.contar_avisos_reverso_nao_lidos() to authenticated;

-- Marca a leitura do próprio aviso. Não aprova, não conclui e não altera o pedido.
create or replace function public.marcar_aviso_reverso_lido(p_aviso_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_marcado boolean := false;
begin
  if auth.uid() is null then
    return false;
  end if;

  update public.reversa_avisos a
     set lido_em = coalesce(a.lido_em, now())
   where a.id = p_aviso_id
     and a.destinatario_id = auth.uid()
     and public.reversa_aviso_visivel(a.evento, a.solicitacao_id);

  v_marcado := found;
  return v_marcado;
end;
$$;
revoke all on function public.marcar_aviso_reverso_lido(uuid) from public, anon, authenticated;
grant execute on function public.marcar_aviso_reverso_lido(uuid) to authenticated;

-- ============================================================
-- SOURCE: supabase/migrations/20261109160000_nc_edicao_somente_pelo_servidor.sql
-- ============================================================
-- Não conformidades: a edição passa só pela função nc_salvar_edicao (proteção no servidor).
--
-- Antes desta migration, o papel authenticated podia dar UPDATE direto na NC: a política nc_update
-- aceitava qualquer coluna, sem conferir a versão (NC001) nem a justificativa (NC002), e a trilha
-- financeira registrava a gravação com origem 'direta' e sem motivo. Reproduzido em
-- supabase/tests/nc-protecao-servidor.test.mjs.
--
-- 1. authenticated perde o UPDATE na tabela: nenhuma gravação direta da NC passa (REST ou SQL).
--    Os caminhos legítimos não usam esse privilégio: a edição usa nc_salvar_edicao (item 2); a criação
--    usa INSERT; a importação usa INSERT ... ON CONFLICT DO NOTHING (não faz UPDATE); a exclusão usa
--    DELETE, só para o admin (política nc_delete). Os UPDATEs das migrations rodam como dono.
-- 2. nc_salvar_edicao passa a SECURITY DEFINER, para gravar com o privilégio do dono. A permissão
--    continua conferida dentro da função (pode_editar_nc()), e search_path segue vazio. A função não
--    recebe nenhuma flag do cliente: origem e motivo são definidos pelo próprio servidor.
-- Migração incremental: não altera migrations anteriores nem os dados existentes.
-- ─────────────────────────────────────────────────────────────────────────────

revoke update on public.nao_conformidades from authenticated;

alter function public.nc_salvar_edicao(uuid, timestamptz, jsonb, text) security definer;

-- ============================================================
-- SOURCE: supabase/migrations/20261109170000_privilegios_funcoes_de_gatilho.sql
-- ============================================================
-- Privilégios das funções de gatilho e da função auxiliar de classificação (correção incremental).
--
-- Funções de gatilho: o banco as dispara quando a tabela é gravada; a API não precisa chamá-las e o
-- disparo não depende de EXECUTE de quem grava. Por isso o EXECUTE sai de PUBLIC, anon, authenticated
-- e service_role, o que fecha a chamada direta por RPC sem mudar nenhum disparo:
--   chamado_lixeira_proteger_atualizacao() (security definer)
--   nc_validar_custo_situacao(), nc_classificar_origem_legada(), nc_validar_classificacao_registro()
--   (security invoker)
--
-- Função auxiliar (não é gatilho): nc_classificacao_legada(text), immutable. O gatilho
-- nc_classificar_origem_legada a chama com o papel de quem grava a NC; por isso authenticated e
-- service_role mantêm o EXECUTE. PUBLIC e anon perdem.
--
-- Migração incremental: não altera migrations anteriores nem os dados existentes.
-- ─────────────────────────────────────────────────────────────────────────────

revoke all on function public.chamado_lixeira_proteger_atualizacao() from public, anon, authenticated, service_role;
revoke all on function public.nc_validar_custo_situacao() from public, anon, authenticated, service_role;
revoke all on function public.nc_classificar_origem_legada() from public, anon, authenticated, service_role;
revoke all on function public.nc_validar_classificacao_registro() from public, anon, authenticated, service_role;

revoke all on function public.nc_classificacao_legada(text) from public, anon;
grant execute on function public.nc_classificacao_legada(text) to authenticated, service_role;

-- ============================================================
-- SOURCE: supabase/migrations/20261109180000_privilegios_tabelas_authenticated.sql
-- ============================================================
-- Privilégios de tabela: authenticated não tem TRUNCATE, REFERENCES nem TRIGGER nas tabelas de public.
--
-- O dump remoto (20260828171717_remote_commit.sql) concede ALL a anon e authenticated nas tabelas do
-- schema public. A RLS e os privilégios explícitos (SELECT, INSERT, UPDATE, DELETE) controlam o acesso
-- dos usuários, mas TRUNCATE não passa pela RLS, e REFERENCES e TRIGGER não são usados pela aplicação.
-- Nenhum fluxo do sistema depende desses três privilégios para usuários: as migrations rodam como dono.
--
-- Correção incremental: afeta só as tabelas e views que já existem. Verificado por
-- supabase/tests/seguranca.test.mjs ("authenticated não tem TRUNCATE, REFERENCES nem TRIGGER...").
-- ─────────────────────────────────────────────────────────────────────────────

revoke truncate, references, trigger on all tables in schema public from anon, authenticated;

-- ============================================================
-- Auditoria de telas (repetida da migration de permissões)
-- ============================================================
-- 4. Auditoria: confira quem ficou com cada tela antes de seguir.
--    Atenção especial a 'usuarios' (admin) e a contas desconhecidas: como
--    user_metadata era editável, alguém pode ter se dado telas.
--    Para corrigir: tela Usuários (depois do deploy) ou
--    update auth.users set raw_app_meta_data = raw_app_meta_data || '{"telas": [...]}' where email = '...';
select
  u.email,
  u.raw_app_meta_data -> 'telas' as telas_app_metadata,
  u.raw_user_meta_data -> 'telas' as telas_user_metadata_antigas,
  u.raw_user_meta_data ->> 'perfil' as perfil_antigo,
  u.last_sign_in_at
from auth.users u
order by (u.raw_app_meta_data -> 'telas') ? 'usuarios' desc, u.email;
