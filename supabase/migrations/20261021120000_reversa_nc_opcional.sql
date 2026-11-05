-- Permite criar novas reversas sem uma não conformidade vinculada.
-- Uma NC selecionada continua validada pelo trigger reversa_vincular_nc.
-- Seguro para reaplicação: só marca como legado registros anteriores ao rollout.

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
