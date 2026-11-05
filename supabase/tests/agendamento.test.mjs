// Os scripts de agendamento são operacionais (pg_cron + pg_net + Vault, indisponíveis no
// PostgreSQL local). Aqui só se verifica o que é verificável sem eles: nenhuma migration nem
// o pacote do SQL Editor instala agendamento, o script de habilitar recusa o ambiente sem
// pré-requisitos com mensagem clara e o de desabilitar é inofensivo.
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { iniciarBanco } from './lib/banco.mjs';

const SUPABASE = join(dirname(fileURLToPath(import.meta.url)), '..');
let banco;

before(async () => { banco = await iniciarBanco(); }, { timeout: 120_000 });
after(async () => { await banco?.encerrar(); });

describe('agendamento do worker de comunicação', () => {
  it('nenhuma migration nem o pacote do SQL Editor agenda o worker', () => {
    const arquivos = readdirSync(join(SUPABASE, 'migrations')).filter((a) => a.endsWith('.sql') && a >= '20261026');
    for (const arquivo of arquivos) {
      const sql = readFileSync(join(SUPABASE, 'migrations', arquivo), 'utf8');
      assert.doesNotMatch(sql, /cron\.schedule|net\.http_post/i, arquivo);
    }
    const pacote = readFileSync(join(SUPABASE, 'SQL_EDITOR_SETUP_NC_REVERSA.sql'), 'utf8');
    assert.doesNotMatch(pacote, /cron\.schedule\(\s*'comunicacao/i);
  });

  it('habilitar recusa o ambiente sem extensões e segredos; não contém chave nem URL de projeto', async () => {
    const habilitar = readFileSync(join(SUPABASE, 'agendamento', 'habilitar-worker-comunicacao.sql'), 'utf8');
    assert.doesNotMatch(habilitar, /eyJ[A-Za-z0-9_-]{20,}/, 'nenhum JWT no arquivo');
    assert.doesNotMatch(habilitar, /https?:\/\/[a-z0-9]{20}\.supabase\.co/i, 'nenhuma URL de projeto');
    await assert.rejects(banco.dono.query(habilitar), /pg_cron/);
  });

  it('desabilitar é inofensivo quando o agendador não existe e remove somente o job do worker', async () => {
    const desabilitar = readFileSync(join(SUPABASE, 'agendamento', 'desabilitar-worker-comunicacao.sql'), 'utf8');
    await banco.dono.query(desabilitar);
    assert.match(desabilitar, /cron\.unschedule\('comunicacao-reversa-5min'\)/);
    assert.doesNotMatch(desabilitar, /correios-rastreio/);
  });
});
