-- Permite conferir e salvar o código de rastreio na fila de check-in.
-- O escopo fica restrito a pedidos ainda aguardando check-in; emissão e
-- confirmação de postagem mantêm suas permissões atuais.
create or replace function public.pode_operar_emissao(p_solicitacao_id uuid, p_operacao text) returns boolean
language sql stable security definer
set search_path = ''
as $$
  select p_operacao in ('registrar', 'anexar_pdf', 'dados', 'envio', 'postagem')
    and exists (
      select 1
      from public.solicitacoes_reverso r
      where r.id = p_solicitacao_id
        and (
          r.empresa = any (public.empresas_operacao_emissao(p_operacao))
          or (
            p_operacao = 'dados'
            and r.status = 'etiqueta_gerada'
            and r.empresa = any (public.empresas_checkin())
          )
        )
    )
    and public.emissao_liberada_pela_aprovacao(p_solicitacao_id, p_operacao);
$$;

comment on function public.pode_operar_emissao(uuid, text) is
  'Autoriza operações de emissão; check-in também pode corrigir dados de rastreio somente enquanto o pedido aguarda check-in.';
