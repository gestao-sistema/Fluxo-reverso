-- `usuario_nome` só é usada por triggers e funções internas autorizadas.
-- A migration de capacidades concedeu EXECUTE em lote para authenticated;
-- esta revogação restaura o limite sem alterar os caminhos SECURITY DEFINER.
revoke execute on function public.usuario_nome(uuid)
  from public, anon, authenticated;
-- The same blanket grant reopened this internal record-comparison helper.
revoke execute on function public.reversa_campos_do_pedido_alterados(
  public.solicitacoes_reverso,
  public.solicitacoes_reverso
)
  from public, anon, authenticated;
