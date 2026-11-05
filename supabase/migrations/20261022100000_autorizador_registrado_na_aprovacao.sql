ALTER TABLE public.solicitacoes_reverso
  ALTER COLUMN autorizacao DROP NOT NULL;

-- Na etapa de aprovação, registre quem decidiu. Os demais campos do pedido
-- continuam imutáveis para esse perfil durante a decisão.
create or replace function public.validar_etapa_por_setor() returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  v_telas text[];
  v_legado boolean;
  v_nome_aprovador text;
begin
  -- Operações de serviço (rastreio/automações) e setor mestre.
  if auth.uid() is null or public.is_admin() then
    return new;
  end if;

  v_telas := public.current_telas();
  v_legado := public.empresas_legacy_operaveis() @> array[new.empresa]::text[];

  if tg_op = 'INSERT' then
    new.status := 'aguardando_aprovacao';
    new.autorizacao := null;
    return new;
  end if;

  if v_legado then
    return new;
  end if;

  if 'aprovar-reversa' = any (v_telas)
    and old.status = 'aguardando_aprovacao'
    and new.status in ('pendente', 'reprovado')
    and (to_jsonb(new) - array['status', 'autorizacao']::text[]) = (to_jsonb(old) - array['status', 'autorizacao']::text[])
  then
    if new.status = 'pendente' then
      select coalesce(u.raw_user_meta_data ->> 'nome', u.email)
        into v_nome_aprovador
        from auth.users u
        where u.id = auth.uid();
      if new.autorizacao is distinct from v_nome_aprovador then
        raise exception 'O nome do aprovador deve corresponder ao usuário autenticado.' using errcode = '42501';
      end if;
    elsif new.autorizacao is distinct from old.autorizacao then
      raise exception 'A rejeição não pode alterar o autorizador.' using errcode = '42501';
    end if;
    return new;
  end if;

  if 'emitir-etiqueta' = any (v_telas)
    and old.status = 'pendente'
    and old.etiqueta_path is null
    and new.status = 'etiqueta_gerada'
    and new.etiqueta_path is not null
    and (to_jsonb(new) - array['status', 'etiqueta_path', 'etiqueta_nome', 'etiqueta_enviada_em', 'etiqueta_gerada_em']::text[])
        = (to_jsonb(old) - array['status', 'etiqueta_path', 'etiqueta_nome', 'etiqueta_enviada_em', 'etiqueta_gerada_em']::text[])
  then
    return new;
  end if;

  if 'confirmar-checkin' = any (v_telas)
    and old.status = 'etiqueta_gerada'
    and new.status = 'postado'
    and new.postado_em is not null
    and (to_jsonb(new) - array['status', 'postado_em']::text[])
        = (to_jsonb(old) - array['status', 'postado_em']::text[])
  then
    return new;
  end if;

  raise exception 'Seu setor não pode executar esta alteração nesta etapa.' using errcode = '42501';
end;
$$;
