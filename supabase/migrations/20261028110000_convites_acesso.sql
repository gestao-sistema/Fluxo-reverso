-- Cadastro por convite: acompanhamento do envio do convite de acesso.
--
-- O link de convite é uma credencial. Ele é gerado na Edge Function admin-usuarios
-- (auth.admin.generateLink, type invite), entregue ao fluxo "Reverso — Convite de acesso" do
-- Power Automate e descartado: NADA do link nem do token é gravado aqui. Esta tabela guarda só o
-- estado da tentativa (para acompanhar, impedir envio simultâneo e não reenviar às cegas).
-- Um reenvio gera um link novo; o do Supabase invalida o anterior.
--
-- Acesso: somente service_role (Edge Function). RLS ligada, sem policy; nenhum privilégio de
-- tabela para anon/authenticated. Nenhuma linha é criada por esta migration, e nada é enviado.

begin;

create table if not exists public.convites_acesso (
  usuario_id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  estado text not null check (estado in (
    'preparado',               -- conta e permissões gravadas; envio ainda não tentado (ou desabilitado)
    'envio_em_andamento',      -- tentativa reservada, aguardando o fluxo
    'enviado',                 -- o conector do fluxo concluiu a ação (não prova entrega nem leitura)
    'falhou',                  -- falha com certeza de que nada foi aceito pelo conector
    'resultado_indeterminado', -- timeout/resposta incerta: pode ter sido enviado
    'rejeitado'                -- o fluxo recusou o contrato; corrigir o fluxo antes de reenviar
  )),
  tentativa_id uuid,
  tentativas integer not null default 0 check (tentativas >= 0),
  convidado_por uuid references auth.users (id) on delete set null,
  criado_em timestamptz not null default now(),
  iniciado_em timestamptz,
  concluido_em timestamptz,
  ultimo_http integer,
  detalhe text check (detalhe is null or char_length(detalhe) <= 200)
);

alter table public.convites_acesso enable row level security;
revoke all on table public.convites_acesso from public, anon, authenticated;

-- Localiza a conta pelo e-mail (a API administrativa não tem busca por e-mail).
create or replace function public.admin_convite_localizar_usuario(p_email text)
returns table (id uuid, confirmado boolean, tem_senha boolean)
language plpgsql stable security definer
set search_path = ''
as $$
begin
  if auth.uid() is not null then
    raise exception 'Função restrita ao serviço de administração de usuários.' using errcode = '42501';
  end if;
  return query
    select u.id,
           u.email_confirmed_at is not null,
           coalesce(u.encrypted_password, '') <> ''
      from auth.users u
     where lower(u.email) = lower(btrim(p_email))
     limit 1;
end;
$$;

-- Registra o convite como preparado sem tentar o envio (envio de convites desabilitado, ou
-- permissões gravadas antes de o envio acontecer). Não rebaixa um estado mais avançado.
create or replace function public.admin_convite_preparar(p_usuario_id uuid, p_email text, p_convidado_por uuid)
returns text
language plpgsql security definer
set search_path = ''
as $$
declare
  v_estado text;
begin
  if auth.uid() is not null then
    raise exception 'Função restrita ao serviço de administração de usuários.' using errcode = '42501';
  end if;
  if not exists (select 1 from auth.users u where u.id = p_usuario_id) then
    raise exception 'Usuário inexistente.' using errcode = '22023';
  end if;
  insert into public.convites_acesso (usuario_id, email, estado, convidado_por)
  values (p_usuario_id, lower(btrim(p_email)), 'preparado', p_convidado_por)
  on conflict (usuario_id) do nothing;
  select c.estado into v_estado from public.convites_acesso c where c.usuario_id = p_usuario_id;
  return v_estado;
end;
$$;

-- Reserva atômica da tentativa de envio. Duas chamadas simultâneas nunca recebem tentativa:
-- a segunda vê 'em_andamento'. Resultado incerto exige confirmação explícita para nova tentativa.
create or replace function public.admin_convite_iniciar_envio(
  p_usuario_id uuid,
  p_email text,
  p_convidado_por uuid,
  p_confirmou_incerto boolean default false
) returns table (resultado text, tentativa_id uuid)
language plpgsql security definer
set search_path = ''
as $$
declare
  v_linha public.convites_acesso;
  v_expirada boolean;
  v_nova uuid := gen_random_uuid();
begin
  if auth.uid() is not null then
    raise exception 'Função restrita ao serviço de administração de usuários.' using errcode = '42501';
  end if;
  if not exists (select 1 from auth.users u where u.id = p_usuario_id) then
    raise exception 'Usuário inexistente.' using errcode = '22023';
  end if;
  if exists (select 1 from auth.users u where u.id = p_usuario_id and u.email_confirmed_at is not null) then
    return query select 'usuario_ativo'::text, null::uuid;
    return;
  end if;

  insert into public.convites_acesso (usuario_id, email, estado, convidado_por)
  values (p_usuario_id, lower(btrim(p_email)), 'preparado', p_convidado_por)
  on conflict (usuario_id) do nothing;

  select * into v_linha from public.convites_acesso c where c.usuario_id = p_usuario_id for update;
  v_expirada := v_linha.estado = 'envio_em_andamento'
    and (v_linha.iniciado_em is null or v_linha.iniciado_em < now() - interval '3 minutes');

  if v_linha.estado = 'envio_em_andamento' and not v_expirada then
    return query select 'em_andamento'::text, null::uuid;
    return;
  end if;
  -- Uma tentativa que nunca terminou (função interrompida) também pode ter chegado ao fluxo.
  if (v_linha.estado = 'resultado_indeterminado' or v_expirada) and not coalesce(p_confirmou_incerto, false) then
    return query select 'confirmacao_necessaria'::text, null::uuid;
    return;
  end if;

  update public.convites_acesso c
     set estado = 'envio_em_andamento',
         tentativa_id = v_nova,
         tentativas = c.tentativas + 1,
         email = lower(btrim(p_email)),
         convidado_por = p_convidado_por,
         iniciado_em = now(),
         concluido_em = null,
         ultimo_http = null,
         detalhe = null
   where c.usuario_id = p_usuario_id;
  return query select 'ok'::text, v_nova;
end;
$$;

-- Fecha a tentativa. Só vale para a tentativa reservada e ainda em andamento (idempotente).
create or replace function public.admin_convite_finalizar_envio(
  p_tentativa_id uuid,
  p_estado text,
  p_http_status integer,
  p_detalhe text
) returns boolean
language plpgsql security definer
set search_path = ''
as $$
declare
  v_linhas integer;
begin
  if auth.uid() is not null then
    raise exception 'Função restrita ao serviço de administração de usuários.' using errcode = '42501';
  end if;
  if p_estado not in ('enviado', 'falhou', 'resultado_indeterminado', 'rejeitado') then
    raise exception 'Estado de convite inválido.' using errcode = '22023';
  end if;
  update public.convites_acesso c
     set estado = p_estado,
         concluido_em = now(),
         ultimo_http = p_http_status,
         detalhe = left(p_detalhe, 200)
   where c.tentativa_id = p_tentativa_id
     and c.estado = 'envio_em_andamento';
  get diagnostics v_linhas = row_count;
  return v_linhas = 1;
end;
$$;

-- Situação dos convites para a tela de usuários (sem link, sem token).
create or replace function public.admin_convites_listar()
returns table (
  usuario_id uuid, estado text, tentativas integer, iniciado_em timestamptz, concluido_em timestamptz,
  confirmado boolean, tem_senha boolean
)
language plpgsql stable security definer
set search_path = ''
as $$
begin
  if auth.uid() is not null then
    raise exception 'Função restrita ao serviço de administração de usuários.' using errcode = '42501';
  end if;
  return query
    select c.usuario_id, c.estado, c.tentativas, c.iniciado_em, c.concluido_em,
           u.email_confirmed_at is not null,
           coalesce(u.encrypted_password, '') <> ''
      from public.convites_acesso c
      join auth.users u on u.id = c.usuario_id;
end;
$$;

revoke all on function public.admin_convite_localizar_usuario(text) from public, anon, authenticated;
revoke all on function public.admin_convite_preparar(uuid, text, uuid) from public, anon, authenticated;
revoke all on function public.admin_convite_iniciar_envio(uuid, text, uuid, boolean) from public, anon, authenticated;
revoke all on function public.admin_convite_finalizar_envio(uuid, text, integer, text) from public, anon, authenticated;
revoke all on function public.admin_convites_listar() from public, anon, authenticated;
grant execute on function public.admin_convite_localizar_usuario(text) to service_role;
grant execute on function public.admin_convite_preparar(uuid, text, uuid) to service_role;
grant execute on function public.admin_convite_iniciar_envio(uuid, text, uuid, boolean) to service_role;
grant execute on function public.admin_convite_finalizar_envio(uuid, text, integer, text) to service_role;
grant execute on function public.admin_convites_listar() to service_role;
grant all on table public.convites_acesso to service_role;

commit;
