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
