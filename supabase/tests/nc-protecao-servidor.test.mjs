// Não conformidades: a proteção da edição está no servidor, não só na tela. O papel authenticated não
// grava as colunas da NC por UPDATE direto, nem com origem e justificativa forjadas por set_config:
// toda alteração passa por nc_salvar_edicao (permissão, versão, justificativa e trilha financeira).
// Criação, importação, leitura, edição pela função e exclusão pelo admin continuam funcionando.
// PostgreSQL local e temporário (embedded-postgres), como os outros testes do banco. A concorrência
// entre duas conexões reais não é verificada aqui.
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { como, criarUsuario, iniciarBanco, iniciarSessao, migrationsNovas } from './lib/banco.mjs';

const SALVAR = 'select * from public.nc_salvar_edicao($1::uuid, $2::timestamptz, $3::jsonb, $4)';
const INSERIR_NC = `insert into public.nao_conformidades
  (empresa, cliente, tipo_saida, data_ocorrencia, status, tipo_problema, causador, custo_situacao,
   custo_produto, custo_frete_adicional, custo_multa_outros, valor_reembolsado, nf, descricao)
  values ('Alinare', $1, 'Venda', '2026-10-01', 'Aberta', 'Endereço incorreto', 'Expedição', $2, $3, $4, $5, $6, $7, $8)
  returning id, numero`;
// Versão como texto: preserva os microssegundos que o driver converteria em Date
const LER_NC = 'select nc.*, nc.updated_at::text as versao from public.nao_conformidades nc where nc.id = $1';
const AUDITORIA = 'select * from public.nc_auditoria_financeira where nc_id = $1 order by criado_em, campo';

let banco;
let db; // dono do banco: prepara dados e confere resultados sem RLS
let c1; // conexão dos usuários (cada chamada assume o papel na transação)
const u = {};
const nc = {};

const q = async (sql, params) => (await db.query(sql, params)).rows;
const falha = (promessa) => promessa.then(() => null, (erro) => erro);
const salvar = (persona, id, versao, campos, motivo = null) =>
  como(c1, persona, SALVAR, [id, versao, JSON.stringify(campos), motivo]).then((r) => r.rows[0]);
const lerNc = async (id) => (await q(LER_NC, [id]))[0];
const auditoria = (id) => q(AUDITORIA, [id]);

/** Negado: o banco recusa (42501) ou a política do papel não casa nenhuma linha (0 linhas). */
async function negado(promessa) {
  try {
    return (await promessa).rowCount === 0;
  } catch (erro) {
    return erro.code === '42501';
  }
}

/** Vários comandos na mesma transação, como o usuário: um set_config vale só dentro dela. */
async function emTransacao(persona, passos) {
  await c1.query('begin');
  try {
    await iniciarSessao(c1, persona);
    const resultado = await passos((sql, params = []) => c1.query(sql, params));
    await c1.query('commit');
    return resultado;
  } catch (erro) {
    await c1.query('rollback').catch(() => {});
    throw erro;
  }
}

before(async () => {
  banco = await iniciarBanco();
  db = banco.dono;
  c1 = await banco.conectar();
  for (const arquivo of migrationsNovas()) await banco.aplicar(arquivo);

  u.editor = await criarUsuario(db, 'Editora NC', ['nc-edit']);
  u.consulta = await criarUsuario(db, 'Consulta NC', ['nc']);
  // Importação e exclusão são do admin, que também edita (a importação grava com a política de edição)
  u.admin = await criarUsuario(db, 'Administradora NC', ['usuarios', 'nc-edit']);

  // NCs já existentes, criadas pelo dono (sem RLS). Cada caso tem a sua, para que um não altere o dado do outro.
  const criar = async (cliente, situacao, custo, descricao) =>
    (await db.query(INSERIR_NC, [cliente, situacao, custo, null, null, null, null, descricao])).rows[0];
  nc.financeira = await criar('Ateliê Aurora', 'Sim', 95, 'Correção direta');
  nc.situacao = await criar('Pérola', 'Sim', 95, 'Situação direta');
  nc.reembolso = await criar('Vitta', null, null, 'Reembolso direto');
  nc.forjada = await criar('Sol Nascente', 'Sim', 95, 'Justificativa forjada');
  nc.descricao = await criar('Loja Verde', null, null, 'Descrição original');
  nc.igual = await criar('Casa Azul', 'Sim', 95, 'Mesmo valor');
  nc.edicao = await criar('Ateliê Lume', 'Sim', 95, 'Edição legítima');
  nc.apagar = await criar('Moda Sul', null, null, 'Para apagar');
});

after(async () => {
  await banco?.encerrar();
});

describe('UPDATE direto não grava a NC (papel authenticated)', () => {
  it('correção financeira sem justificativa é recusada e nada muda', async () => {
    const antes = await lerNc(nc.financeira.id);
    const trilhaAntes = (await auditoria(nc.financeira.id)).length;
    const erro = await falha(como(c1, u.editor, 'update public.nao_conformidades set custo_produto = $1 where id = $2', [0, nc.financeira.id]));
    assert.equal(erro?.code, '42501');
    const depois = await lerNc(nc.financeira.id);
    assert.equal(Number(depois.custo_produto), 95);
    assert.equal(depois.versao, antes.versao);
    assert.equal((await auditoria(nc.financeira.id)).length, trilhaAntes);
  });

  it('a situação do custo não muda por UPDATE direto ("Sim" para "Em apuração")', async () => {
    const erro = await falha(como(c1, u.editor, "update public.nao_conformidades set custo_situacao = 'Em apuração' where id = $1", [nc.situacao.id]));
    assert.equal(erro?.code, '42501');
    assert.equal((await lerNc(nc.situacao.id)).custo_situacao, 'Sim');
  });

  it('valor preenchido por UPDATE direto não entra sem a edição (sem justificativa, sem histórico completo)', async () => {
    const erro = await falha(como(c1, u.editor, 'update public.nao_conformidades set valor_reembolsado = $1 where id = $2', [10, nc.reembolso.id]));
    assert.equal(erro?.code, '42501');
    assert.equal((await lerNc(nc.reembolso.id)).valor_reembolsado, null);
  });

  it('origem e justificativa não podem ser forjadas com set_config dentro do próprio UPDATE', async () => {
    const erro = await falha(emTransacao(u.editor, async (executar) => {
      await executar("select set_config('nc.origem_alteracao', 'edicao', true), set_config('nc.motivo_correcao', 'Forjada', true)");
      return executar('update public.nao_conformidades set custo_produto = $1 where id = $2', [0, nc.forjada.id]);
    }));
    // A trilha é conferida antes do erro: se a gravação passou, ela mostraria a justificativa forjada
    const forjadas = (await auditoria(nc.forjada.id)).filter((r) => r.motivo === 'Forjada');
    assert.equal(forjadas.length, 0, 'nenhuma linha da trilha leva a justificativa forjada');
    assert.equal(erro?.code, '42501');
    assert.equal(Number((await lerNc(nc.forjada.id)).custo_produto), 95);
  });

  it('sobrescrever uma edição mais recente é recusado: a função recusa a versão antiga (NC001) e o UPDATE direto recusa', async () => {
    const versaoAntiga = (await lerNc(nc.descricao.id)).versao;
    await salvar(u.editor, nc.descricao.id, versaoAntiga, { status: 'Em tratativa' });
    assert.equal((await falha(salvar(u.editor, nc.descricao.id, versaoAntiga, { descricao: 'Sobrescrita' })))?.code, 'NC001');
    const erro = await falha(como(c1, u.editor, 'update public.nao_conformidades set descricao = $1 where id = $2', ['Sobrescrita', nc.descricao.id]));
    assert.equal(erro?.code, '42501');
    const depois = await lerNc(nc.descricao.id);
    assert.equal(depois.descricao, 'Descrição original');
    assert.equal(depois.status, 'Em tratativa', 'a edição mais recente foi preservada');
  });

  it('o leitor (sem nc-edit) não altera a NC, nem por UPDATE nem pela função', async () => {
    const antes = await lerNc(nc.igual.id);
    assert.ok(await negado(como(c1, u.consulta, 'update public.nao_conformidades set nf = $1 where id = $2', ['X', nc.igual.id])));
    assert.equal((await falha(salvar(u.consulta, nc.igual.id, antes.versao, { nf: 'X' })))?.code, '42501');
    assert.equal((await lerNc(nc.igual.id)).nf, antes.nf);
  });

  it('o papel authenticated não tem UPDATE na tabela, e a função de edição roda com privilégio do dono', async () => {
    const [{ pode }] = await q("select has_table_privilege('authenticated', 'public.nao_conformidades', 'UPDATE') as pode");
    assert.equal(pode, false);
    const [{ definer }] = await q(
      "select p.prosecdef as definer from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'nc_salvar_edicao'"
    );
    assert.equal(definer, true);
  });
});

describe('fluxos legítimos continuam', () => {
  it('criação pelo editor (INSERT com RETURNING) registra a NC com número', async () => {
    const criada = (await como(c1, u.editor, INSERIR_NC, ['Boutique Nova', 'Sim', 10, null, null, null, null, 'Criada pela tela'])).rows[0];
    assert.ok(criada.id);
    assert.ok(criada.numero > 0);
    assert.equal((await lerNc(criada.id)).descricao, 'Criada pela tela');
  });

  it('edição pela função com versão atual e justificativa grava, e a trilha traz origem, motivo e autor', async () => {
    const atual = await lerNc(nc.edicao.id);
    await salvar(u.editor, nc.edicao.id, atual.versao, { custo_produto: 0 }, 'Cliente cancelou');
    assert.equal(Number((await lerNc(nc.edicao.id)).custo_produto), 0);
    const [linha] = (await auditoria(nc.edicao.id)).filter((r) => r.campo === 'custo_produto');
    assert.deepEqual([Number(linha.valor_anterior), Number(linha.valor_posterior), linha.tipo_alteracao, linha.origem], [95, 0, 'correcao', 'edicao']);
    assert.equal(linha.motivo, 'Cliente cancelou');
    assert.equal(linha.autor_id, u.editor.id);
  });

  it('regravar o mesmo valor sem casas decimais não é correção: não pede justificativa e não regrava', async () => {
    const atual = await lerNc(nc.igual.id);
    await salvar(u.editor, nc.igual.id, atual.versao, { custo_produto: 95 });
    assert.equal((await lerNc(nc.igual.id)).versao, atual.versao);
  });

  it('importação (INSERT ... ON CONFLICT DO NOTHING, como o upsert com ignoreDuplicates) não exige UPDATE', async () => {
    const importar = (numero, descricao) =>
      como(c1, u.admin, `insert into public.nao_conformidades (numero, empresa, cliente, tipo_saida, data_ocorrencia, status, descricao, importada)
        values ($1, 'Alinare', 'Importada', 'Venda', '2026-09-01', 'Aberta', $2, true)
        on conflict (numero) do nothing returning id, numero`, [numero, descricao]).then((r) => r.rows);
    const nova = await importar(90001, 'Linha nova');
    assert.equal(nova.length, 1);
    assert.equal((await importar(90001, 'Repetida')).length, 0);
    // Número já existente: a importação não altera a NC
    assert.equal((await importar(nc.apagar.numero, 'Tentativa de sobrescrita')).length, 0);
    assert.equal((await lerNc(nc.apagar.id)).descricao, 'Para apagar');
  });

  it('exclusão: o admin apaga; o editor não apaga (a política não casa nenhuma linha)', async () => {
    assert.ok(await negado(como(c1, u.editor, 'delete from public.nao_conformidades where id = $1', [nc.apagar.id])));
    assert.equal((await como(c1, u.admin, 'delete from public.nao_conformidades where id = $1', [nc.apagar.id])).rowCount, 1);
    assert.equal((await q('select count(*)::int as total from public.nao_conformidades where id = $1', [nc.apagar.id]))[0].total, 0);
  });
});
