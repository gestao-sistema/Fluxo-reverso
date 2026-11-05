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
