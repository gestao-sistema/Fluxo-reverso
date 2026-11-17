-- ============================================================
-- PDF da etiqueta: lê quem lê o pedido (correção de 20261030120000)
-- ------------------------------------------------------------
-- Até 20261023160000 (regra que está em produção em 12/11/2026), o PDF do bucket
-- privado "etiquetas" era lido por quem podia ler o pedido (pode_ler_solicitacao):
-- consulta/operação da empresa ou o próprio autor.
-- 20261030120000 (Lixeira) trocou essa condição por empresas_permitidas(), que também
-- inclui as telas de formulário. Efeitos não pretendidos:
--   * quem só tem o formulário da empresa passaria a ler o PDF de pedidos de OUTRAS
--     pessoas da mesma empresa (bastando conhecer o caminho);
--   * usuários da empresa continuariam lendo PDFs de chamados na Lixeira, que a própria
--     Lixeira restringe ao administrador.
-- Esta migration volta à regra por pedido e mantém o que a Lixeira acrescentou:
--   * chamado ativo: pode_ler_solicitacao (já recusa chamado na Lixeira a não administrador);
--   * chamado na Lixeira: somente administrador (histórico arquivado);
--   * objeto cuja pasta não é um pedido existente (dado legado órfão): somente administrador.
-- Bucket continua privado; nenhuma policy nova; nenhum dado alterado.
-- Requer: 20261030120000. Idempotente.
-- ============================================================
begin;

create or replace function public.pode_acessar_etiqueta(p_objeto text) returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.solicitacoes_reverso r
    where r.id::text = split_part(p_objeto, '/', 1)
      and (
        (r.inutilizada_em is null and public.pode_ler_solicitacao(r.id))
        or (r.inutilizada_em is not null and public.is_admin())
      )
  )
  or (
    public.is_admin()
    and not exists (
      select 1 from public.solicitacoes_reverso r
      where r.id::text = split_part(p_objeto, '/', 1)
    )
  );
$$;

comment on function public.pode_acessar_etiqueta(text) is
  'Leitura do PDF da etiqueta (policy etiquetas_select): quem lê o pedido ativo; chamado na Lixeira e objeto órfão só para administrador.';

revoke execute on function public.pode_acessar_etiqueta(text) from public, anon;
grant execute on function public.pode_acessar_etiqueta(text) to authenticated, service_role;

commit;
