-- Sessao de convite aceita, mas ainda sem senha: pode concluir a senha ou sair;
-- nao opera nenhuma parte do Reverso enquanto isso.
-- A regra so alcanca contas registradas em convites_acesso. Usuarios antigos e
-- convidados que ja definiram senha mantem suas permissoes e sessoes.

begin;

create or replace function public.current_telas() returns text[]
language sql stable security definer
set search_path = ''
as $$
  select case
    when public.convite_senha_pendente() then '{}'::text[]
    else coalesce(
      (
        select array(
          select jsonb_array_elements_text(
            case
              when jsonb_typeof(u.raw_app_meta_data -> 'telas') = 'array' then u.raw_app_meta_data -> 'telas'
              else '[]'::jsonb
            end
          )
        )
        from auth.users u
        where u.id = auth.uid()
      ),
      '{}'::text[]
    )
  end;
$$;

create or replace function public.current_perfil_legacy() returns text
language sql stable security definer
set search_path = ''
as $$
  select case
    when public.convite_senha_pendente() then ''
    else coalesce((select u.raw_app_meta_data ->> 'perfil' from auth.users u where u.id = auth.uid()), '')
  end;
$$;

-- is_admin() tambem e usado por policies e RPCs legados; a tela de usuarios,
-- perfil mestre ou perfil ADMIN nao podem contornar a exigencia de senha.
create or replace function public.is_admin() returns boolean
language sql stable security definer
set search_path = ''
as $$
  select not public.convite_senha_pendente()
    and (
      coalesce((select u.raw_app_meta_data ->> 'perfil_acesso' = 'mestre' from auth.users u where u.id = auth.uid()), false)
      or 'usuarios' = any (public.current_telas())
      or public.current_perfil_legacy() = 'ADMIN'
    );
$$;

create or replace function public.is_mestre() returns boolean
language sql stable security definer
set search_path = ''
as $$
  select not public.convite_senha_pendente()
    and (
      coalesce((select u.raw_app_meta_data ->> 'perfil_acesso' = 'mestre' from auth.users u where u.id = auth.uid()), false)
      or public.current_perfil_legacy() = 'ADMIN'
    );
$$;

commit;
