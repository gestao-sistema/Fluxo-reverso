-- Autoria do solicitante e leitura segura de Meus Pedidos.
-- Pedidos antigos permanecem sem autor verificável; nenhuma associação é feita por nome.

create or replace function public.empresas_consulta_ampliada() returns text[]
language sql stable security definer
set search_path = ''
as $$
  select case
    when public.is_admin()
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

-- Security definer evita recursão no RLS e preserva os acessos de leitura
-- ampliados já concedidos. Capacidades de aprovação, etiqueta e check-in valem
-- apenas nas empresas explicitamente cadastradas em empresas_acesso.
create or replace function public.pode_ler_solicitacao(p_solicitacao_id uuid) returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.solicitacoes_reverso r
    where r.id = p_solicitacao_id
      and (
        r.empresa = any (public.empresas_consulta_ampliada())
        or (
          auth.uid() is not null
          and r.solicitado_por = auth.uid()
          and r.empresa = any (public.empresas_formulario())
        )
      )
  );
$$;

revoke execute on function public.empresas_consulta_ampliada(), public.pode_ler_solicitacao(uuid)
  from public, anon;
grant execute on function public.empresas_consulta_ampliada(), public.pode_ler_solicitacao(uuid)
  to authenticated, service_role;

-- Substitui a policy ampla por empresa; permissive policies em PostgreSQL se somam.
drop policy if exists "select_solicitacoes_por_escopo" on public.solicitacoes_reverso;
create policy "select_solicitacoes_por_escopo" on public.solicitacoes_reverso
  for select to authenticated
  using (public.pode_ler_solicitacao(id));

-- O autor exibido também vem do servidor em novas solicitações autenticadas.
-- solicitado_por continua sendo a chave de propriedade; nenhuma linha antiga é alterada.
create or replace function public.reversa_solicitante_autenticado() returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  if auth.uid() is not null then
    new.solicitante := coalesce(public.usuario_nome(auth.uid()), 'Usuário ' || auth.uid()::text);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_zzz_reversa_solicitante_autenticado on public.solicitacoes_reverso;
create trigger trg_zzz_reversa_solicitante_autenticado
  before insert on public.solicitacoes_reverso
  for each row execute function public.reversa_solicitante_autenticado();
revoke execute on function public.reversa_solicitante_autenticado() from public, anon, authenticated, service_role;

-- Histórico de operação e aprovação acompanha a visibilidade da própria solicitação.
drop policy if exists "select_historico" on public.solicitacoes_historico;
create policy "select_historico" on public.solicitacoes_historico
  for select to authenticated
  using (public.pode_ler_solicitacao(solicitacao_id));

drop policy if exists "aprovacoes_select" on public.solicitacoes_aprovacoes;
create policy "aprovacoes_select" on public.solicitacoes_aprovacoes
  for select to authenticated
  using (public.pode_ler_solicitacao(solicitacao_id));

-- Rastreio, emissões e eventos também não podem revelar registros fora do escopo.
drop policy if exists "select_rastreamento" on public.rastreamento_correios;
create policy "select_rastreamento" on public.rastreamento_correios
  for select to authenticated
  using (public.pode_ler_solicitacao(solicitacao_id));

drop policy if exists "reversa_emissoes_select" on public.reversa_emissoes;
create policy "reversa_emissoes_select" on public.reversa_emissoes
  for select to authenticated
  using (public.pode_ler_solicitacao(solicitacao_id));

drop policy if exists "reversa_emissao_eventos_select" on public.reversa_emissao_eventos;
create policy "reversa_emissao_eventos_select" on public.reversa_emissao_eventos
  for select to authenticated
  using (public.pode_ler_solicitacao(solicitacao_id));

-- A etiqueta continua privada e temporária; a policy não libera leitura por empresa.
create or replace function public.pode_acessar_etiqueta(p_objeto text) returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.solicitacoes_reverso r
    where r.id::text = split_part(p_objeto, '/', 1)
      and public.pode_ler_solicitacao(r.id)
  )
  or (
    public.is_admin()
    and not exists (
      select 1 from public.solicitacoes_reverso r
      where r.id::text = split_part(p_objeto, '/', 1)
    )
  );
$$;

drop policy if exists "etiquetas_select" on storage.objects;
create policy "etiquetas_select" on storage.objects
  for select to authenticated
  using (bucket_id = 'etiquetas' and public.pode_acessar_etiqueta(name));

revoke execute on function public.pode_acessar_etiqueta(text) from public, anon;
grant execute on function public.pode_acessar_etiqueta(text) to authenticated, service_role;
