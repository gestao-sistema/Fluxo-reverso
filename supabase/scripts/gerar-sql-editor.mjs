// Gera supabase/SQL_EDITOR_SETUP_NC_REVERSA.sql: junta, em ordem, as migrations
// posteriores ao dump do banco remoto (UTF-8, sem BOM), para colar no SQL Editor.
// Uso: node supabase/scripts/gerar-sql-editor.mjs
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const PASTA_SUPABASE = join(dirname(fileURLToPath(import.meta.url)), '..');
const PASTA_MIGRATIONS = join(PASTA_SUPABASE, 'migrations');
const MIGRATION_BASE = '20260828171717_remote_commit.sql';
const DESTINO = join(PASTA_SUPABASE, 'SQL_EDITOR_SETUP_NC_REVERSA.sql');

const migrations = readdirSync(PASTA_MIGRATIONS)
  .filter((arquivo) => arquivo.endsWith('.sql') && arquivo !== MIGRATION_BASE)
  .sort();
const ler = (arquivo) => readFileSync(join(PASTA_MIGRATIONS, arquivo), 'utf8').replace(/^﻿/, '').trimEnd();

const cabecalho = `-- Script único para o SQL Editor do Supabase.
-- Junta as migrations de supabase/migrations/ em ordem:
${migrations.map((arquivo) => `--   ${arquivo}`).join('\n')}
-- Não edite à mão: altere as migrations e gere de novo com
-- node supabase/scripts/gerar-sql-editor.mjs
-- Aplicar somente no projeto existente que já contém public.solicitacoes_reverso.
-- Antes de executar: publique a Edge Function admin-usuarios nova.
-- Depois de executar: confira a auditoria de telas (último resultado) e publique o
-- frontend novo em seguida (reversa nova exige NC de origem e aprovação).
-- Não executar os scripts antigos src/sql/create_table.sql ou src/sql/rls_solicitacoes*.sql.
`;

const partes = migrations.map(
  (arquivo) =>
    `\n-- ============================================================\n-- SOURCE: supabase/migrations/${arquivo}\n-- ============================================================\n${ler(arquivo)}\n`
);

// O SQL Editor mostra só o resultado do último comando: repete a auditoria no fim
const permissoes = migrations.find((arquivo) => arquivo.includes('permissoes_app_metadata'));
const textoPermissoes = permissoes ? ler(permissoes) : '';
const inicioAuditoria = textoPermissoes.indexOf('-- 4. Auditoria');
if (inicioAuditoria < 0) throw new Error('Auditoria de telas não encontrada na migration de permissões.');

const saida = `${cabecalho}${partes.join('')}
-- ============================================================
-- Auditoria de telas (repetida da migration de permissões)
-- ============================================================
${textoPermissoes.slice(inicioAuditoria)}
`;

writeFileSync(DESTINO, saida, 'utf8');
console.log(`Gerado ${DESTINO} (${migrations.length} migrations, ${saida.split('\n').length} linhas)`);
