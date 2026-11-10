-- Privilégios das funções de gatilho e da função auxiliar de classificação (correção incremental).
--
-- Funções de gatilho: o banco as dispara quando a tabela é gravada; a API não precisa chamá-las e o
-- disparo não depende de EXECUTE de quem grava. Por isso o EXECUTE sai de PUBLIC, anon, authenticated
-- e service_role, o que fecha a chamada direta por RPC sem mudar nenhum disparo:
--   chamado_lixeira_proteger_atualizacao() (security definer)
--   nc_validar_custo_situacao(), nc_classificar_origem_legada(), nc_validar_classificacao_registro()
--   (security invoker)
--
-- Função auxiliar (não é gatilho): nc_classificacao_legada(text), immutable. O gatilho
-- nc_classificar_origem_legada a chama com o papel de quem grava a NC; por isso authenticated e
-- service_role mantêm o EXECUTE. PUBLIC e anon perdem.
--
-- Migração incremental: não altera migrations anteriores nem os dados existentes.
-- ─────────────────────────────────────────────────────────────────────────────

revoke all on function public.chamado_lixeira_proteger_atualizacao() from public, anon, authenticated, service_role;
revoke all on function public.nc_validar_custo_situacao() from public, anon, authenticated, service_role;
revoke all on function public.nc_classificar_origem_legada() from public, anon, authenticated, service_role;
revoke all on function public.nc_validar_classificacao_registro() from public, anon, authenticated, service_role;

revoke all on function public.nc_classificacao_legada(text) from public, anon;
grant execute on function public.nc_classificacao_legada(text) to authenticated, service_role;
