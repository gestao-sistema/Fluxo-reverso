-- ============================================================
-- Aprovação: quem decide é sempre outra pessoa (sem autoaprovação)
-- ------------------------------------------------------------
-- Regra definida pelo negócio (12/11/2026): o aprovador decide pedidos de OUTRA pessoa.
-- Não há exceção administrativa. Até aqui havia:
--   * aprovacao_config.permitir_autoaprovacao, com UPDATE concedido ao administrador:
--     ligada, o autor aprovava o próprio pedido;
--   * a rejeição do próprio pedido liberada ("desistência");
--   * pedido sem autor identificado (solicitado_por nulo inserido por SQL sem JWT):
--     a comparação com auth.uid() dava NULL e o bloqueio não disparava. O legado convertido
--     pelo administrador também não tem autor, por desenho, e continua decidível.
--
-- Esta migration:
--   1. desliga e trava a autoaprovação (CHECK + revogação do UPDATE). A coluna continua
--      existindo porque fila, avisos e comunicação a leem; travada em false, todos passam
--      a aplicar a regra sem precisar ser recriados;
--   2. recria registrar_decisao_reversa (usada por aprovar_reversa e rejeitar_reversa):
--      - identidade sempre de auth.uid() (nenhum id vindo do cliente);
--      - escopo (empresa + setor configurados + tela) conferido antes de travar a linha
--        e de novo depois do lock;
--      - chamado na Lixeira não recebe decisão;
--      - autor ou quem produziu a versão atual não aprova NEM rejeita;
--      - pedido sem autor identificado não recebe decisão;
--      - decisão repetida sobre a mesma versão continua recusada (55000) sem alterar nada;
--   3. reversa_aprovador_pode_decidir (tarefa de aprovação no Teams) deixa de chamar
--      o autor ou um pedido sem autor identificado.
--
-- Requer: 20261023190000 (aprovadores por setor) e 20261030120000 (Lixeira: coluna
-- inutilizada_em). NÃO depende da cadeia NC de 20261109*.
-- Dado alterado: no máximo a linha única de aprovacao_config (true -> false). Em
-- produção, em 12/11/2026, o valor já era false (consulta somente leitura).
-- Idempotente.
-- ============================================================
begin;

-- 1. Autoaprovação desligada e travada
update public.aprovacao_config set permitir_autoaprovacao = false where permitir_autoaprovacao;

alter table public.aprovacao_config drop constraint if exists aprovacao_config_sem_autoaprovacao;
alter table public.aprovacao_config
  add constraint aprovacao_config_sem_autoaprovacao check (not permitir_autoaprovacao);

revoke update (permitir_autoaprovacao) on public.aprovacao_config from authenticated;
revoke update on public.aprovacao_config from authenticated;
drop policy if exists "aprovacao_config_admin" on public.aprovacao_config;

comment on column public.aprovacao_config.permitir_autoaprovacao is
  'Obsoleta desde 20261112100000: sempre false (CHECK). A decisão é sempre de outra pessoa; não há autoaprovação.';

-- 2. Autoria conhecida: autor registrado, ou legado convertido pelo administrador
-- (solicitado_por nulo por desenho: o pedido é anterior às contas e não é atribuído pelo nome).
-- Pedido sem autor e sem essa conversão só surge por SQL sem JWT e não recebe decisão.
create or replace function public.reversa_autoria_conhecida(p_solicitacao_id uuid, p_solicitado_por uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select p_solicitado_por is not null
    or exists (
      select 1 from public.solicitacoes_aprovacoes a
      where a.solicitacao_id = p_solicitacao_id and a.situacao_anterior = 'legado'
    );
$$;
revoke all on function public.reversa_autoria_conhecida(uuid, uuid) from public, anon, authenticated;
grant execute on function public.reversa_autoria_conhecida(uuid, uuid) to service_role;

-- 3. Decisão
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
  v_empresa text;
  v_setor text;
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

  -- Escopo antes do lock: quem não aprova a combinação não trava a linha de ninguém
  select r.empresa, r.setor into v_empresa, v_setor
    from public.solicitacoes_reverso r where r.id = p_solicitacao_id;
  if not found or not public.usuario_pode_aprovar_reversa(v_empresa, v_setor) then
    raise exception 'Solicitação não encontrada ou fora das combinações de empresa e setor que você aprova.' using errcode = '42501';
  end if;

  select * into v_r from public.solicitacoes_reverso r where r.id = p_solicitacao_id for update;
  if not found then
    raise exception 'Solicitação não encontrada ou fora das combinações de empresa e setor que você aprova.' using errcode = '42501';
  end if;
  -- Mesmo lock da configuração de aprovadores: revogação e decisão concorrentes são serializadas
  perform pg_advisory_xact_lock(hashtext('reversa_aprovadores:' || v_r.empresa));
  if not public.usuario_pode_aprovar_reversa(v_r.empresa, v_r.setor) then
    raise exception 'Solicitação não encontrada ou fora das combinações de empresa e setor que você aprova.' using errcode = '42501';
  end if;
  if v_r.inutilizada_em is not null then
    raise exception 'Este chamado está na Lixeira e não recebe decisão.' using errcode = '55000';
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
  -- Autoria: sem autor identificado, não há como garantir que quem decide é outra pessoa.
  -- Exceção prevista: legado convertido por exigir_aprovacao_legado_pendente (anterior às contas;
  -- a conversão fica no histórico de aprovação, que usuários não gravam diretamente).
  if not public.reversa_autoria_conhecida(v_r.id, v_r.solicitado_por) then
    raise exception 'Esta solicitação não tem autor identificado e não pode ser decidida. Peça ao administrador para regularizar o registro.'
      using errcode = '42501';
  end if;
  if v_r.solicitado_por = v_uid or v_r.aprovacao_versao_por is not distinct from v_uid then
    raise exception 'Você não pode aprovar nem rejeitar uma solicitação registrada ou alterada por você. Outro aprovador precisa decidir.'
      using errcode = '42501';
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

-- Interna (como em 20261023100000): só aprovar_reversa/rejeitar_reversa a chamam
revoke all on function public.registrar_decisao_reversa(uuid, text, integer, text)
  from public, anon, authenticated, service_role;

-- 4. Tarefa de aprovação: só quem pode decidir (nunca o autor; nunca pedido sem autoria conhecida)
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
      and public.reversa_autoria_conhecida(r.id, r.solicitado_por)
      and r.solicitado_por is distinct from p_usuario_id
      and r.aprovacao_versao_por is distinct from p_usuario_id
  );
$$;
revoke all on function public.reversa_aprovador_pode_decidir(uuid, uuid)
  from public, anon, authenticated, service_role;

commit;
