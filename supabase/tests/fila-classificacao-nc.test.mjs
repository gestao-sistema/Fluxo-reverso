// Fila de aprovação com a classificação da NC vinculada (20261109130000).
// Cobre: NC nova sem origem antiga (tipo do problema e causador), NC antiga com a origem
// preservada, reversa sem NC, vínculo com NC de outra empresa recusado pelo banco, aprovador
// de outra empresa e usuário sem acesso fora da fila, e os privilégios da função.
// Roda no PostgreSQL local do harness, como os outros testes do banco.
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ANON, como, criarUsuario, iniciarBanco, migrationsNovas } from './lib/banco.mjs';

let banco;
let db;
const u = {};
const nc = {};
const reversa = {};

const falha = (promessa) => promessa.then(() => null, (erro) => erro);

const INSERIR_REVERSA = `insert into public.solicitacoes_reverso
  (empresa, data_solicitacao, solicitante, setor, codigo_cliente, nome_cliente, endereco_postagem, motivo, nc_id)
  values ($1, current_date, 'Fulana', 'Financeiro', 77, $3, 'Rua B, 2', 'Outros', $2)
  returning *`;

const novaReversa = async (persona, empresa, ncId, cliente) =>
  (await como(db, persona, INSERIR_REVERSA, [empresa, ncId, cliente])).rows[0];

const fila = async (persona) => (await como(db, persona, 'select * from public.fila_aprovacao_reversas()')).rows;

const criarNc = async (cliente, origem, tipo, causador) => (
  await como(
    db,
    u.editorNc,
    `insert into public.nao_conformidades (empresa, cliente, origem, status, data_ocorrencia, descricao, tipo_problema, causador)
     values ('Alinare', $1, $2, 'Aberta', current_date, 'Teste de classificação', $3, $4) returning id, numero`,
    [cliente, origem, tipo, causador]
  )
).rows[0];

before(
  async () => {
    banco = await iniciarBanco();
    db = banco.dono;
    for (const arquivo of migrationsNovas()) await banco.aplicar(arquivo);

    Object.assign(u, {
      admin: await criarUsuario(db, 'Administradora', ['usuarios']),
      solicitanteAlinare: await criarUsuario(db, 'Solicitante Alinare', ['formulario-alinare']),
      solicitanteNovitah: await criarUsuario(db, 'Solicitante Novitah', ['formulario-novitah']),
      aprovadorAlinare: await criarUsuario(db, 'Aprovadora Alinare', ['aprovar-alinare']),
      aprovadorNovitah: await criarUsuario(db, 'Aprovador Novitah', ['aprovar-novitah']),
      editorNc: await criarUsuario(db, 'Editora NC', ['nc-edit']),
    });
    for (const [empresa, aprovador] of [['Alinare', u.aprovadorAlinare], ['Novitah', u.aprovadorNovitah]]) {
      await como(db, u.admin, 'select public.salvar_config_aprovadores_reversa($1, $2::jsonb)', [
        empresa,
        JSON.stringify([{ usuario_id: aprovador.id, todos_setores: true, setores: [] }]),
      ]);
    }

    // NC nova: sem origem antiga, com tipo do problema e causador.
    nc.nova = await criarNc('Cliente NC Nova', null, 'Endereço incorreto', 'Comercial');
    // NC antiga: só a origem histórica. O banco deriva tipo e causador dela, se o mapeamento for inequívoco.
    nc.antiga = await criarNc('Cliente NC Antiga', 'Erro expedição – endereço incorreto', null, null);

    reversa.nova = await novaReversa(u.solicitanteAlinare, 'Alinare', nc.nova.id, 'Cliente NC Nova');
    reversa.antiga = await novaReversa(u.solicitanteAlinare, 'Alinare', nc.antiga.id, 'Cliente NC Antiga');
    reversa.semNc = await novaReversa(u.solicitanteAlinare, 'Alinare', null, 'Cliente sem NC');
  },
  { timeout: 300_000 }
);

after(async () => {
  await banco?.encerrar();
});

describe('fila de aprovação com a classificação da NC vinculada', () => {
  it('NC nova sem origem antiga: a fila traz tipo do problema e causador, e origem nula', async () => {
    const item = (await fila(u.aprovadorAlinare)).find((i) => i.id === reversa.nova.id);
    assert.ok(item, 'reversa da NC nova aparece para o aprovador da Alinare');
    assert.equal(item.nc_codigo, `NC-${String(nc.nova.numero).padStart(4, '0')}`);
    assert.equal(item.nc_origem, null);
    assert.equal(item.nc_tipo_problema, 'Endereço incorreto');
    assert.equal(item.nc_causador, 'Comercial');
  });

  it('NC antiga: a fila mantém a origem e devolve a classificação que o banco tem para ela', async () => {
    const antiga = await um('select origem, tipo_problema, causador from public.nao_conformidades where id = $1', [nc.antiga.id]);
    assert.equal(antiga.origem, 'Erro expedição – endereço incorreto');
    const item = (await fila(u.aprovadorAlinare)).find((i) => i.id === reversa.antiga.id);
    assert.ok(item, 'reversa da NC antiga aparece para o aprovador da Alinare');
    assert.equal(item.nc_origem, antiga.origem);
    assert.equal(item.nc_tipo_problema, antiga.tipo_problema);
    assert.equal(item.nc_causador, antiga.causador);
  });

  it('reversa sem NC: a fila segue, com os campos de NC nulos', async () => {
    const item = (await fila(u.aprovadorAlinare)).find((i) => i.id === reversa.semNc.id);
    assert.ok(item, 'reversa sem NC aparece na fila');
    assert.equal(item.nc_id, null);
    assert.equal(item.nc_codigo, null);
    assert.equal(item.nc_origem, null);
    assert.equal(item.nc_tipo_problema, null);
    assert.equal(item.nc_causador, null);
  });

  it('empresa incorreta: NC da Alinare não vincula reversa da Novitah, e a reversa da Alinare não aparece para a Novitah', async () => {
    const erro = await falha(novaReversa(u.solicitanteNovitah, 'Novitah', nc.nova.id, 'Cliente cruzado'));
    assert.ok(erro, 'vínculo entre empresas recusado pelo banco');
    assert.ok(!(await fila(u.aprovadorNovitah)).some((i) => i.id === reversa.nova.id), 'aprovador da Novitah não vê reversa da Alinare');
  });

  it('usuário sem acesso de aprovação não vê a reversa na fila, nem a consulta diretamente', async () => {
    assert.ok(!(await fila(u.solicitanteAlinare)).some((i) => i.id === reversa.nova.id));
    const erro = await falha(como(db, ANON, 'select * from public.fila_aprovacao_reversas()'));
    assert.equal(erro?.code, '42501', 'anon não executa a fila');
  });

  it('privilégios: anon sem execução; authenticated e service_role com execução; PUBLIC sem execução', async () => {
    const [{ anon, autenticado, servico }] = await db.query(
      `select has_function_privilege('anon', 'public.fila_aprovacao_reversas()', 'execute') as anon,
              has_function_privilege('authenticated', 'public.fila_aprovacao_reversas()', 'execute') as autenticado,
              has_function_privilege('service_role', 'public.fila_aprovacao_reversas()', 'execute') as servico`
    ).then((r) => r.rows);
    assert.equal(anon, false);
    assert.equal(autenticado, true);
    assert.equal(servico, true);
    const [{ publico }] = await db.query(
      `select exists (select 1 from pg_proc p, aclexplode(p.proacl) a
         where p.proname = 'fila_aprovacao_reversas' and p.pronamespace = 'public'::regnamespace
           and a.grantee = 0 and a.privilege_type = 'EXECUTE') as publico`
    ).then((r) => r.rows);
    assert.equal(publico, false);
  });
});

async function um(sql, params) {
  return (await db.query(sql, params)).rows[0];
}
