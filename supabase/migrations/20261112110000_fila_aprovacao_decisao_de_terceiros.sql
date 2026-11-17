-- ============================================================
-- Fila de aprovação coerente com a decisão só por terceiros
-- ------------------------------------------------------------
-- pode_aprovar passa a ser exatamente o que registrar_decisao_reversa aceita
-- (20261112100000): falso para o autor, para quem produziu a versão atual e para
-- pedido sem autoria conhecida (public.reversa_autoria_conhecida: autor registrado ou legado
-- convertido). Não há mais configuração de autoaprovação.
-- Requer também 20261112100000 (função reversa_autoria_conhecida).
-- proprio_pedido mantém o significado anterior (o usuário é autor ou produziu a versão).
--
-- Mesma assinatura de 20261109130000 (22 colunas), por isso create or replace e os
-- privilégios são preservados; são reafirmados no fim.
-- Requer: 20261109130000 (assinatura com nc_tipo_problema/nc_causador) e 20261030120000.
-- Enquanto ela não estiver aplicada, a fila antiga já esconde a decisão do autor
-- (autoaprovação travada em false); só o pedido sem autor apareceria liberado na tela,
-- e o banco recusaria a decisão.
-- Idempotente.
-- ============================================================
begin;

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
    not p.proprio and public.reversa_autoria_conhecida(r.id, r.solicitado_por),
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

commit;
