begin;

-- INSERT ... RETURNING avalia a política SELECT antes de a nova linha estar
-- consultável por uma busca na própria solicitacoes_reverso. A política da
-- tabela principal usa os campos da linha diretamente; tabelas relacionadas
-- continuam usando pode_ler_solicitacao(id).
drop policy if exists "select_solicitacoes_por_escopo" on public.solicitacoes_reverso;
create policy "select_solicitacoes_por_escopo" on public.solicitacoes_reverso
  for select to authenticated
  using (
    empresa = any (public.empresas_consulta_ampliada())
    or (
      auth.uid() is not null
      and solicitado_por = auth.uid()
      and empresa = any (public.empresas_formulario())
    )
  );

commit;
