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
