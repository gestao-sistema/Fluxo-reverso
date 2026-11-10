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
