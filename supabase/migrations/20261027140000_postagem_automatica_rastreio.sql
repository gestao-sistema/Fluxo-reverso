begin;

-- A postagem, o trânsito e a entrega chegam sozinhos pela integração dos Correios. Até aqui a
-- integração só mudava o status do pedido: o aviso "postagem confirmada" dependia de alguém
-- confirmar a postagem na emissão (postagem_fonte = 'manual'). A coluna já reservava a fonte
-- 'rastreio' para este caso, mas nada a gravava.
--
-- Esta função é chamada pela Edge Function correios-rastreio (service_role) quando o rastreio
-- muda o pedido de etapa. Ela grava a postagem na emissão que carrega aquele código, com fonte
-- 'rastreio', e o gatilho existente enfileira o aviso uma única vez. Não cria recebimento físico
-- e não gera aviso de recebimento: a entrega informada pelos Correios continua sendo só a etapa.
--
-- Não há retroativo: nada é gravado para pedidos que já estão postados; só vale para a próxima
-- transição que a integração registrar.
create or replace function public.registrar_postagem_rastreio(
  p_solicitacao_id uuid,
  p_codigo_rastreio text,
  p_postagem_em date default null
) returns public.reversa_emissoes
language plpgsql security definer
set search_path = ''
as $$
declare
  v public.reversa_emissoes;
  v_nova public.reversa_emissoes;
  v_data date := p_postagem_em;
begin
  perform 1 from public.solicitacoes_reverso where id = p_solicitacao_id for update;
  if not found then
    return null;
  end if;

  -- A emissão que carrega o código consultado. Sem emissão com esse código não há o que confirmar.
  select * into v
    from public.reversa_emissoes e
   where e.solicitacao_id = p_solicitacao_id
     and e.codigo_rastreio = upper(btrim(p_codigo_rastreio))
   order by e.sequencia desc
   limit 1
   for update;
  if not found then
    return null;
  end if;

  -- Já confirmada (manual ou pelo rastreio): nada muda e nenhum aviso novo é gerado.
  if v.postagem_confirmada_em is not null then
    return v;
  end if;

  -- Data do evento dos Correios: nunca futura (relógio de São Paulo) e nunca anterior à emissão.
  if v_data is not null and v_data > (now() at time zone 'America/Sao_Paulo')::date then
    v_data := null;
  end if;
  if v_data is not null and v.emitida_em is not null and v_data < v.emitida_em then
    v_data := null;
  end if;

  update public.reversa_emissoes
     set postagem_confirmada_em = now(),
         postagem_em = v_data,
         postagem_fonte = 'rastreio',
         postagem_confirmada_por = null,
         postagem_confirmada_por_nome = 'Sistema (Correios)'
   where id = v.id
  returning * into v_nova;

  perform public.emissao_registrar_evento(
    v_nova, 'postagem_confirmada',
    'Postagem informada pelos Correios na emissão #' || v_nova.sequencia
      || coalesce(' — postada em ' || to_char(v_data, 'DD/MM/YYYY'), ''),
    jsonb_build_object('postagem_em', v_data, 'fonte', 'rastreio'),
    true,
    'Sistema (Correios)');

  return v_nova;
end;
$$;

revoke all on function public.registrar_postagem_rastreio(uuid, text, date) from public, anon, authenticated;
grant execute on function public.registrar_postagem_rastreio(uuid, text, date) to service_role;

comment on function public.registrar_postagem_rastreio(uuid, text, date) is
  'Grava a postagem informada pelo rastreio dos Correios na emissão do código (fonte rastreio), uma única vez. Só service_role; não cria recebimento físico.';

commit;
