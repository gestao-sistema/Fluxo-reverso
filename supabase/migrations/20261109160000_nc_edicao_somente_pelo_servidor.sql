-- Não conformidades: a edição passa só pela função nc_salvar_edicao (proteção no servidor).
--
-- Antes desta migration, o papel authenticated podia dar UPDATE direto na NC: a política nc_update
-- aceitava qualquer coluna, sem conferir a versão (NC001) nem a justificativa (NC002), e a trilha
-- financeira registrava a gravação com origem 'direta' e sem motivo. Reproduzido em
-- supabase/tests/nc-protecao-servidor.test.mjs.
--
-- 1. authenticated perde o UPDATE na tabela: nenhuma gravação direta da NC passa (REST ou SQL).
--    Os caminhos legítimos não usam esse privilégio: a edição usa nc_salvar_edicao (item 2); a criação
--    usa INSERT; a importação usa INSERT ... ON CONFLICT DO NOTHING (não faz UPDATE); a exclusão usa
--    DELETE, só para o admin (política nc_delete). Os UPDATEs das migrations rodam como dono.
-- 2. nc_salvar_edicao passa a SECURITY DEFINER, para gravar com o privilégio do dono. A permissão
--    continua conferida dentro da função (pode_editar_nc()), e search_path segue vazio. A função não
--    recebe nenhuma flag do cliente: origem e motivo são definidos pelo próprio servidor.
-- Migração incremental: não altera migrations anteriores nem os dados existentes.
-- ─────────────────────────────────────────────────────────────────────────────

revoke update on public.nao_conformidades from authenticated;

alter function public.nc_salvar_edicao(uuid, timestamptz, jsonb, text) security definer;
