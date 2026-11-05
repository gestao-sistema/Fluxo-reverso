-- Cadastro oficial por tela: selecionar uma tela concede as operações dela, no escopo cadastrado.
--
-- 1. Atalho de administrador. Até aqui, quem tinha a tela "usuarios" (administração de usuários)
--    também lia todos os pedidos e NCs e operava as duas empresas. Agora esse escopo total é do
--    perfil mestre, explícito (public.is_mestre()). A tela "usuarios" continua dando as funções
--    administrativas já existentes (is_admin(): cadastro de usuários, aprovadores, comunicações,
--    listas de NC, correções e exclusão de reversa sem decisão e sem PDF), mas não concede consulta
--    nem operação de pedidos e NCs: isso vem das telas e das empresas cadastradas.
--    Aprovar, emitir etiqueta e confirmar postagem já não tinham atalho de administrador
--    (20261023120000); continuam exigindo a tela, a empresa e, para aprovar, o escopo por setor.
--
-- 2. Escopo de aprovação gravado junto com o cadastro. As duas funções abaixo escrevem na mesma
--    tabela da configuração atual (reversa_aprovadores_setor); não existe segunda fonte. Só o
--    service_role as executa (Edge Function admin-usuarios, depois de validar o administrador).
--    Exigem que o usuário já tenha a tela aprovar-reversa e a empresa em empresas_acesso, como
--    salvar_config_aprovadores_reversa, e registram a auditoria por empresa.
--
-- Não altera dados existentes e não reenvia nem enfileira nada por si só.

begin;

create or replace function public.is_mestre() returns boolean
language sql stable security definer
set search_path = ''
as $$
  select
    coalesce((select u.raw_app_meta_data ->> 'perfil_acesso' = 'mestre' from auth.users u where u.id = auth.uid()), false)
    or public.current_perfil_legacy() = 'ADMIN';
$$;

revoke execute on function public.is_mestre() from public, anon;
grant execute on function public.is_mestre() to authenticated, service_role;

-- Consulta ---------------------------------------------------------------

create or replace function public.empresas_permitidas() returns text[]
language sql stable security definer
set search_path = ''
as $$
  select case
    when public.is_mestre()
      or public.current_telas() && array['dashboard-geral', 'lista-geral', 'status-geral', 'kanban', 'kanban-edit', 'nc', 'nc-edit']::text[]
      then array['Alinare', 'Novitah']::text[]
    else array(
      select distinct e
      from unnest(
        array_remove(array[
          case when public.current_telas() && array['dashboard-alinare', 'formulario-alinare', 'lista-alinare', 'status-alinare']::text[] then 'Alinare' end,
          case when public.current_telas() && array['dashboard-novitah', 'formulario-novitah', 'lista-novitah', 'status-novitah']::text[] then 'Novitah' end
        ]::text[], null)
        || case
          when public.current_telas() && array['aprovar-reversa', 'emitir-etiqueta', 'confirmar-checkin']::text[]
            then public.current_empresas_acesso()
          else '{}'::text[]
        end
      ) as escopo(e)
      where e in ('Alinare', 'Novitah')
    )
  end;
$$;

create or replace function public.empresas_consulta_ampliada() returns text[]
language sql stable security definer
set search_path = ''
as $$
  select case
    when public.is_mestre()
      or public.current_telas() && array[
        'dashboard-geral', 'lista-geral', 'status-geral', 'kanban', 'kanban-edit', 'nc', 'nc-edit'
      ]::text[]
      then array['Alinare', 'Novitah']::text[]
    else array(
      select distinct e
      from unnest(
        array_remove(array[
          case when public.current_telas() && array['dashboard-alinare', 'lista-alinare', 'status-alinare']::text[] then 'Alinare' end,
          case when public.current_telas() && array['dashboard-novitah', 'lista-novitah', 'status-novitah']::text[] then 'Novitah' end
        ]::text[], null)
        || case
          when public.current_telas() && array['aprovar-reversa', 'emitir-etiqueta', 'confirmar-checkin']::text[]
            then public.current_empresas_acesso()
          else '{}'::text[]
        end
      ) as escopo(e)
      where e in ('Alinare', 'Novitah')
    )
  end;
$$;

-- Solicitação e operação -------------------------------------------------

create or replace function public.empresas_formulario() returns text[]
language sql stable security definer
set search_path = ''
as $$
  select case
    when public.is_mestre() or 'nc-edit' = any (public.current_telas())
      then array['Alinare', 'Novitah']::text[]
    else array_remove(array[
      case when 'formulario-alinare' = any (public.current_telas()) then 'Alinare' end,
      case when 'formulario-novitah' = any (public.current_telas()) then 'Novitah' end
    ]::text[], null)
  end;
$$;

create or replace function public.empresas_operaveis() returns text[]
language sql stable security definer
set search_path = ''
as $$
  select case when public.is_mestre() then array['Alinare', 'Novitah']::text[]
    else array(
      select distinct e
      from unnest(
        public.empresas_formulario()
        || public.empresas_aprovaveis()
        || public.empresas_etiquetaveis()
        || public.empresas_checkin()
      ) as escopo(e)
      where e in ('Alinare', 'Novitah')
    )
  end;
$$;

create or replace function public.empresas_recebimento_manual() returns text[]
language sql stable security definer
set search_path = ''
as $$
  select case
    when public.is_mestre() then array['Alinare', 'Novitah']::text[]
    when public.current_telas() && array['kanban-edit', 'confirmar-checkin']::text[]
      then public.current_empresas_acesso()
    else '{}'::text[]
  end;
$$;

-- Não conformidades ------------------------------------------------------

create or replace function public.pode_ver_nc() returns boolean
language sql stable security definer
set search_path = ''
as $$
  select public.is_mestre() or public.current_telas() && array['nc', 'nc-edit']::text[];
$$;

create or replace function public.pode_editar_nc() returns boolean
language sql stable security definer
set search_path = ''
as $$
  select public.is_mestre() or 'nc-edit' = any (public.current_telas());
$$;

-- Escopo de aprovação do usuário (mesma tabela da configuração por empresa e setor) -------------

create or replace function public.admin_acesso_aprovacao_usuario(p_usuario_id uuid)
returns jsonb
language sql stable security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'empresa', a.empresa,
    'todos_setores', a.todos_setores,
    'setores', to_jsonb(a.setores)
  ) order by a.empresa), '[]'::jsonb)
  from public.reversa_aprovadores_setor a
  where a.usuario_id = p_usuario_id;
$$;

revoke all on function public.admin_acesso_aprovacao_usuario(uuid) from public, anon, authenticated;
grant execute on function public.admin_acesso_aprovacao_usuario(uuid) to service_role;

create or replace function public.admin_salvar_escopo_aprovacao_usuario(
  p_usuario_id uuid,
  p_configuracao jsonb,
  p_alterado_por uuid
) returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  v_item jsonb;
  v_empresa text;
  v_todos boolean;
  v_setores text[];
  v_empresas_config text[] := '{}'::text[];
  v_existente public.reversa_aprovadores_setor;
  v_anterior jsonb;
  v_nova jsonb;
  v_nome text;
begin
  -- Somente o serviço (Edge Function admin-usuarios, que já validou o administrador).
  if auth.uid() is not null then
    raise exception 'Função restrita ao serviço de administração de usuários.' using errcode = '42501';
  end if;
  if p_usuario_id is null or not exists (select 1 from auth.users u where u.id = p_usuario_id) then
    raise exception 'Usuário inexistente.' using errcode = '22023';
  end if;
  if p_alterado_por is null or not exists (select 1 from auth.users u where u.id = p_alterado_por) then
    raise exception 'Administrador responsável pela alteração não identificado.' using errcode = '22023';
  end if;
  if jsonb_typeof(p_configuracao) is distinct from 'array' then
    raise exception 'O escopo de aprovação deve ser uma lista.' using errcode = '22023';
  end if;

  -- Mesma ordem de travas em toda chamada; serializa com salvar_config_aprovadores_reversa.
  perform pg_advisory_xact_lock(hashtext('reversa_aprovadores:Alinare'));
  perform pg_advisory_xact_lock(hashtext('reversa_aprovadores:Novitah'));

  for v_item in select value from jsonb_array_elements(p_configuracao)
  loop
    if jsonb_typeof(v_item) is distinct from 'object'
      or jsonb_typeof(v_item -> 'empresa') is distinct from 'string'
      or jsonb_typeof(v_item -> 'todos_setores') is distinct from 'boolean'
      or jsonb_typeof(v_item -> 'setores') is distinct from 'array' then
      raise exception 'Cada empresa deve informar o escopo e os setores.' using errcode = '22023';
    end if;
    v_empresa := v_item ->> 'empresa';
    if v_empresa not in ('Alinare', 'Novitah') then
      raise exception 'Empresa inválida para o escopo de aprovação.' using errcode = '22023';
    end if;
    if v_empresa = any (v_empresas_config) then
      raise exception 'Cada empresa só pode aparecer uma vez no escopo de aprovação.' using errcode = '22023';
    end if;
    v_empresas_config := array_append(v_empresas_config, v_empresa);

    v_todos := (v_item ->> 'todos_setores')::boolean;
    select coalesce(array_agg(distinct btrim(value) order by btrim(value)), '{}'::text[])
      into v_setores
    from jsonb_array_elements_text(v_item -> 'setores') as s(value);
    if (v_todos and cardinality(v_setores) <> 0)
      or (not v_todos and cardinality(v_setores) = 0)
      or array_position(v_setores, '') is not null then
      raise exception 'Selecione todos os setores ou um ou mais setores específicos.' using errcode = '22023';
    end if;

    if not exists (
      select 1 from auth.users u
      where u.id = p_usuario_id
        and coalesce(u.raw_app_meta_data -> 'telas', '[]'::jsonb) ? 'aprovar-reversa'
        and coalesce(u.raw_app_meta_data -> 'empresas_acesso', '[]'::jsonb) ? v_empresa
    ) then
      raise exception 'O usuário não possui a tela de aprovação para a empresa %.', v_empresa using errcode = '42501';
    end if;
  end loop;

  v_nome := coalesce(public.usuario_nome(p_alterado_por), 'Usuário ' || p_alterado_por::text);

  foreach v_empresa in array array['Alinare', 'Novitah']
  loop
    select coalesce(jsonb_agg(jsonb_build_object(
      'usuario_id', a.usuario_id, 'todos_setores', a.todos_setores, 'setores', to_jsonb(a.setores)
    ) order by a.usuario_id), '[]'::jsonb)
      into v_anterior
    from public.reversa_aprovadores_setor a where a.empresa = v_empresa;

    select * into v_existente
    from public.reversa_aprovadores_setor a
    where a.empresa = v_empresa and a.usuario_id = p_usuario_id;

    select value into v_item
    from jsonb_array_elements(p_configuracao) as c(value)
    where c.value ->> 'empresa' = v_empresa;

    if v_item is null then
      delete from public.reversa_aprovadores_setor where empresa = v_empresa and usuario_id = p_usuario_id;
    else
      v_todos := (v_item ->> 'todos_setores')::boolean;
      select coalesce(array_agg(distinct btrim(value) order by btrim(value)), '{}'::text[])
        into v_setores
      from jsonb_array_elements_text(v_item -> 'setores') as s(value);

      if v_existente.usuario_id is null then
        insert into public.reversa_aprovadores_setor (empresa, usuario_id, todos_setores, setores, alterado_por, alterado_em)
        values (v_empresa, p_usuario_id, v_todos, v_setores, p_alterado_por, now());
      elsif v_existente.todos_setores is distinct from v_todos or v_existente.setores is distinct from v_setores then
        update public.reversa_aprovadores_setor
           set todos_setores = v_todos, setores = v_setores, alterado_por = p_alterado_por, alterado_em = now()
         where empresa = v_empresa and usuario_id = p_usuario_id;
      end if;
    end if;

    select coalesce(jsonb_agg(jsonb_build_object(
      'usuario_id', a.usuario_id, 'todos_setores', a.todos_setores, 'setores', to_jsonb(a.setores)
    ) order by a.usuario_id), '[]'::jsonb)
      into v_nova
    from public.reversa_aprovadores_setor a where a.empresa = v_empresa;

    if v_anterior is distinct from v_nova then
      insert into public.reversa_aprovadores_setor_auditoria
        (empresa, alterado_por, alterado_por_nome, configuracao_anterior, configuracao_nova)
      values (v_empresa, p_alterado_por, v_nome, v_anterior, v_nova);
    end if;
  end loop;
end;
$$;

revoke all on function public.admin_salvar_escopo_aprovacao_usuario(uuid, jsonb, uuid) from public, anon, authenticated;
grant execute on function public.admin_salvar_escopo_aprovacao_usuario(uuid, jsonb, uuid) to service_role;

commit;
