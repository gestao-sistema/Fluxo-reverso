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
