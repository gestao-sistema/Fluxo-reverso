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
