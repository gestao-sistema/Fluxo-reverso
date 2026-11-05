/**
 * Identificação visível do pedido de reversa (ex.: RV-1A2B3C4D). Única forma usada na
 * interface, nos e-mails/Teams e nos relatórios: as oito primeiras posições do UUID.
 */
export function codigoPedido(id: string): string {
  // Pedidos de exemplo da demonstração (demo-0000-0000-0000-0000000000NN) diferem só no fim: o número
  // exibido usa esse fim para não repetir "RV-DEMO0000" em todos. Os ids reais não mudam.
  const exemplo = /^demo-0000-0000-0000-\d{8}(\d{4})$/.exec(id);
  if (exemplo) return `RV-DEMO${exemplo[1]}`;
  return `RV-${id.replaceAll('-', '').slice(0, 8).toUpperCase()}`;
}

/** Busca da lista de pedidos: nome da cliente, código interno da cliente ou número exibido (com ou sem "RV-"). */
export function pedidoCorrespondeABusca(
  pedido: { id: string; nome_cliente: string; codigo_cliente: number | string },
  busca: string,
): boolean {
  const termo = busca.trim().toLocaleLowerCase('pt-BR');
  if (!termo) return true;
  const numero = codigoPedido(pedido.id).toLocaleLowerCase('pt-BR');
  return pedido.nome_cliente.toLocaleLowerCase('pt-BR').includes(termo)
    || String(pedido.codigo_cliente).includes(termo)
    || numero.includes(termo)
    || numero.replace(/^rv-/, '').includes(termo.replace(/^rv-/, ''));
}
