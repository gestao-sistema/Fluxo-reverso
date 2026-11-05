-- OBSOLETO: não executar. Versão antiga das permissões (reabre a validação por perfis de consulta).
-- Use supabase/SQL_EDITOR_SETUP_NC_REVERSA.sql, gerado a partir da cadeia atual.
-- Atualização pontual para o banco existente no Supabase.
-- Libera novas reversas sem NC e preserva como legado o histórico anterior ao rollout.
-- Não remove reversas, NCs nem outros dados.

begin;

update public.solicitacoes_reverso
set legado = true
where nc_id is null
  and not legado
  and created_at < timestamptz '2026-10-21 12:00:00+00';

alter table public.solicitacoes_reverso alter column nc_id drop not null;

alter table public.solicitacoes_reverso
  drop constraint if exists solicitacoes_reverso_origem_nc_check;

comment on column public.solicitacoes_reverso.nc_id is
  'NC de origem opcional. Quando informada, deve ser da mesma empresa e estar aberta.';

comment on column public.solicitacoes_reverso.legado is
  'Reversa criada antes da liberação de novos registros sem NC vinculada.';

commit;
