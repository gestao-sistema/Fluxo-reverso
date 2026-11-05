-- Convite de acesso: conclusão segura quando o convite foi aberto e a senha não foi definida.
--
-- Caso: verifyOtp (convite) concluiu e a definição da senha falhou ou a página foi fechada. A conta
-- fica confirmada, sem senha, e o link do convite já foi consumido. Duas peças resolvem:
--   1. convite_senha_pendente(): a PRÓPRIA sessão pergunta se a sua conta é de convidado ainda sem
--      senha. Só lê a linha de auth.uid(); não aceita e-mail nem id de parâmetro, então não serve
--      para consultar outra pessoa. A página usa a resposta para retomar a definição da senha.
--   2. admin_convite_iniciar_envio passa a aceitar conta confirmada SEM senha que veio de convite
--      (então o administrador reenvia um link de definição de senha, tipo recovery). Conta com senha
--      continua recusada ('usuario_ativo'): a checagem é feita aqui, no banco.
-- Nada é gravado em auth.users; nenhuma linha é criada ou alterada por esta migration.
-- Depende de 20261028110000_convites_acesso.sql.

begin;

create or replace function public.convite_senha_pendente()
returns boolean
language plpgsql stable security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    return false;
  end if;
  return exists (
    select 1
      from auth.users u
      join public.convites_acesso c on c.usuario_id = u.id
     where u.id = auth.uid()
       and u.email_confirmed_at is not null
       and coalesce(u.encrypted_password, '') = ''
  );
end;
$$;

revoke all on function public.convite_senha_pendente() from public, anon;
grant execute on function public.convite_senha_pendente() to authenticated, service_role;

-- Mesma assinatura e mesmo retorno da versão de 20261028110000; muda só a regra da conta confirmada.
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
  v_confirmada boolean;
  v_tem_senha boolean;
begin
  if auth.uid() is not null then
    raise exception 'Função restrita ao serviço de administração de usuários.' using errcode = '42501';
  end if;
  select u.email_confirmed_at is not null, coalesce(u.encrypted_password, '') <> ''
    into v_confirmada, v_tem_senha
    from auth.users u where u.id = p_usuario_id;
  if not found then
    raise exception 'Usuário inexistente.' using errcode = '22023';
  end if;
  -- Conta ativa (com senha) nunca recebe convite nem link de definição de senha. Conta confirmada sem
  -- senha só é aceita se veio de um convite (existe linha em convites_acesso).
  if v_confirmada and (v_tem_senha or not exists (select 1 from public.convites_acesso c where c.usuario_id = p_usuario_id)) then
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

revoke all on function public.admin_convite_iniciar_envio(uuid, text, uuid, boolean) from public, anon, authenticated;
grant execute on function public.admin_convite_iniciar_envio(uuid, text, uuid, boolean) to service_role;

commit;
