// Aplica migrations SQL no Supabase via DATABASE_URL (conexão direta com o Postgres).
// Uso: DATABASE_URL="postgresql://postgres:SENHA@db.ymrrguubkqbxndhoxhor.supabase.co:5432/postgres" node run-sql-rls.cjs [arquivo.sql ...]
// Sem argumentos, aplica as migrations atuais em ordem (permissões, NC, etiqueta,
// vínculo opcional e filas operacionais por setor).
// Os scripts antigos src/sql/rls_solicitacoes*.sql liam permissões de user_metadata
// (editável pelo próprio usuário) e não devem mais ser usados.
const { Client } = require('pg');
const { readFileSync } = require('fs');
const { resolve } = require('path');
require('dotenv').config();

const PADRAO = [
  'supabase/migrations/20261020130000_permissoes_app_metadata.sql',
  'supabase/migrations/20261020130100_nao_conformidades.sql',
  'supabase/migrations/20261020130200_etiqueta_reversa.sql',
  'supabase/migrations/20261021120000_reversa_nc_opcional.sql',
  'supabase/migrations/20261021130000_setores_fluxo_reverso.sql',
];
const arquivos = process.argv.length > 2 ? process.argv.slice(2) : PADRAO;

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('Defina DATABASE_URL com a connection string do Supabase.');
  process.exit(1);
}
if (!/^postgres(?:ql)?:\/\//i.test(connectionString)) {
  console.error('DATABASE_URL deve ser uma URI PostgreSQL (postgresql://...). A URL https://<projeto>.supabase.co é a URL da API, não a conexão do banco.');
  process.exit(1);
}

const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } });

async function main() {
  try {
    await client.connect();
    console.log('Conectado ao Supabase');

    for (const arquivo of arquivos) {
      await client.query(readFileSync(resolve(__dirname, arquivo), 'utf8'));
      console.log(`Aplicado: ${arquivo}`);
    }

    const { rows } = await client.query(
      `SELECT count(*)::int AS n FROM auth.users WHERE raw_app_meta_data ? 'telas'`
    );
    console.log(`Usuários com telas em app_metadata: ${rows[0].n}`);
  } catch (err) {
    console.error('Erro:', err.message?.trim() || err.code || 'Falha na conexão ou execução SQL.');
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
