-- Preserve the approval audit when an account is removed. The actor's name
-- remains in the audit row while the user reference becomes optional.
begin;

alter table public.reversa_aprovadores_setor_auditoria
  alter column alterado_por drop not null;

alter table public.reversa_aprovadores_setor_auditoria
  drop constraint if exists reversa_aprovadores_setor_auditoria_alterado_por_fkey;

alter table public.reversa_aprovadores_setor_auditoria
  add constraint reversa_aprovadores_setor_auditoria_alterado_por_fkey
  foreign key (alterado_por) references auth.users(id) on delete set null;

commit;
