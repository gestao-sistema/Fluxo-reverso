-- Mantém as tentativas e os avisos históricos quando a FK perde o destinatário.
-- Linhas já nulas têm origem desconhecida e conservam a deduplicação anterior.
begin;

alter table public.reversa_comunicacoes_etiqueta
  add column if not exists destinatario_desvinculado boolean not null default false;

create or replace function public.reversa_marcar_destinatario_desvinculado()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.destinatario_desvinculado := new.destinatario_id is null;
  return new;
end;
$$;

create or replace trigger trg_reversa_marcar_destinatario_desvinculado
before update of destinatario_id on public.reversa_comunicacoes_etiqueta
for each row when (old.destinatario_id is distinct from new.destinatario_id)
execute function public.reversa_marcar_destinatario_desvinculado();

revoke all on function public.reversa_marcar_destinatario_desvinculado()
  from public, anon, authenticated, service_role;

drop index if exists public.reversa_comunicacoes_evento_sem_destinatario_uk;
create unique index reversa_comunicacoes_evento_sem_destinatario_uk
  on public.reversa_comunicacoes_etiqueta (evento, ocorrencia_id, canal)
  where destinatario_id is null and not destinatario_desvinculado;

comment on column public.reversa_comunicacoes_etiqueta.destinatario_desvinculado is
  'A FK passou de um destinatário identificado para NULL. A comunicação conserva seu próprio histórico e não ocupa a vaga de uma ocorrência criada sem destinatário.';

commit;
