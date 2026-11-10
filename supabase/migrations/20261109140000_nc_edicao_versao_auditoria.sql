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
