-- Corrige o envio do motivo "Clientes trocados" sem aplicar as migrações
-- pendentes do fluxo de aprovações.
-- Idempotente: pode ser executado mais de uma vez no SQL Editor do Supabase.
begin;

alter table public.solicitacoes_reverso
  add column if not exists endereco_destino_troca text;

comment on column public.solicitacoes_reverso.endereco_destino_troca is
  'Endereço da outra cliente quando o motivo da reversa é Clientes trocados.';

alter table public.solicitacoes_reverso
  drop constraint if exists solicitacoes_reverso_clientes_trocados_destino_check;

alter table public.solicitacoes_reverso
  add constraint solicitacoes_reverso_clientes_trocados_destino_check
  check (motivo <> 'Clientes trocados' or nullif(btrim(endereco_destino_troca), '') is not null);

alter table public.solicitacoes_reverso
  drop constraint if exists solicitacoes_reverso_motivo_check;

alter table public.solicitacoes_reverso
  add constraint solicitacoes_reverso_motivo_check
  check (motivo = any (array[
    'Erro expedição – endereço incorreto',
    'Erro expedição – mercadoria trocada ou embalada junto',
    'Erro expedição – etiqueta ou pré-postagem',
    'Embalagem inadequada / avaria por embalagem',
    'Postagem duplicada',
    'Erro de faturamento / NF (destinatário ou endereço)',
    'Erro da expedição e do financeiro',
    'Erro vendedora – endereço incorreto',
    'Peça com defeito',
    'Mercadoria Errada',
    'Baixa qualidade no conserto',
    'Clientes trocados',
    'Mercadoria errada',
    'Endereço incorreto',
    'Outros'
  ]::text[]));

commit;

notify pgrst, 'reload schema';
