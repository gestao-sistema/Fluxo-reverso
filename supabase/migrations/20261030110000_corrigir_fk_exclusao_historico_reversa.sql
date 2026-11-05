-- Remove the original RESTRICT foreign key. The migration that introduced
-- approval history added a cascading FK but left this original constraint in place.
-- The exclusão trigger still protects approved/rejected and emitted requests.
begin;

alter table public.solicitacoes_aprovacoes
  drop constraint if exists solicitacoes_aprovacoes_solicitacao_id_fkey;

commit;
