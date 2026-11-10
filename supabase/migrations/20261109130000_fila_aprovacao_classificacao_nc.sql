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
