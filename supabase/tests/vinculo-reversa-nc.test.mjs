// Vínculo da reversa com a NC, pelo trigger reversa_vincular_nc (migration 20261020130100).
// Regra: um vínculo NOVO (criação, ou troca de NC) exige NC existente, da mesma empresa e
// Aberta ou Em tratativa. Um vínculo que não muda não é revalidado: NC encerrada depois de
// vinculada não impede as atualizações logísticas nem apaga o vínculo.
// Roda no PostgreSQL local do harness, como os outros testes do banco.
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { como, criarUsuario, iniciarBanco, migrationsNovas } from './lib/banco.mjs';

let banco;
let db;
const u = {};
const nc = {};

const falha = (promessa) => promessa.then(() => null, (erro) => erro);

const INSERIR_REVERSA = `insert into public.solicitacoes_reverso
  (empresa, data_solicitacao, solicitante, setor, codigo_cliente, nome_cliente, endereco_postagem, motivo, nc_id)
  values ($1, current_date, 'Fulana', 'Financeiro', 77, $3, 'Rua B, 2', 'Outros', $2)
  returning *`;

const criarReversa = async (persona, empresa, ncId, cliente) =>
  (await como(db, persona, INSERIR_REVERSA, [empresa, ncId, cliente])).rows[0];

const tentarReversa = (persona, empresa, ncId, cliente) =>
  falha(como(db, persona, INSERIR_REVERSA, [empresa, ncId, cliente]));

// Atualizações feitas pelo dono do banco: o trigger roda do mesmo jeito, e o teste fica
// focado na regra do vínculo, não na política de RLS de quem opera a reversa.
const atualizarVinculo = (reversaId, ncId) =>
  db.query('update public.solicitacoes_reverso set nc_id = $2 where id = $1 returning *', [reversaId, ncId]);

const criarNc = async (empresa, status, cliente) => (
  await como(
    db,
    u.editorNc,
    `insert into public.nao_conformidades (empresa, cliente, origem, status, data_ocorrencia, descricao, tipo_problema, causador)
     values ($1, $2, null, $3, current_date, 'Teste de vínculo', 'Endereço incorreto', 'Comercial') returning id, numero`,
    [empresa, cliente, status]
  )
).rows[0];

// Quantas reversas e quantos eventos de histórico da NC existem. Recusa não pode mudar nenhum dos dois.
const contagem = async () => (await db.query(`
  select (select count(*)::int from public.solicitacoes_reverso) as reversas,
         (select count(*)::int from public.nc_historico) as historico_nc
`)).rows[0];

before(
  async () => {
    banco = await iniciarBanco();
    db = banco.dono;
    for (const arquivo of migrationsNovas()) await banco.aplicar(arquivo);

    Object.assign(u, {
      admin: await criarUsuario(db, 'Administradora', ['usuarios']),
      solicitanteAlinare: await criarUsuario(db, 'Solicitante Alinare', ['formulario-alinare']),
      solicitanteNovitah: await criarUsuario(db, 'Solicitante Novitah', ['formulario-novitah']),
      editorNc: await criarUsuario(db, 'Editora NC', ['nc-edit']),
    });

    nc.aberta = await criarNc('Alinare', 'Aberta', 'Cliente NC aberta');
    nc.emTratativa = await criarNc('Alinare', 'Em tratativa', 'Cliente NC em tratativa');
    nc.encerrada = await criarNc('Alinare', 'Encerrada', 'Cliente NC encerrada');
    nc.cancelada = await criarNc('Alinare', 'Cancelada', 'Cliente NC cancelada');
    nc.novitah = await criarNc('Novitah', 'Aberta', 'Cliente NC Novitah');
    // Destino de troca que continua aberta: nc.emTratativa é encerrada no teste de histórico.
    nc.abertaDestino = await criarNc('Alinare', 'Aberta', 'Cliente NC aberta destino');
  },
  { timeout: 300_000 }
);

after(async () => {
  await banco?.encerrar();
});

describe('novo vínculo na criação da reversa', () => {
  it('NC Aberta e NC Em tratativa da mesma empresa são aceitas', async () => {
    const aberta = await criarReversa(u.solicitanteAlinare, 'Alinare', nc.aberta.id, 'Cliente aberta');
    assert.equal(aberta.nc_id, nc.aberta.id);
    const emTratativa = await criarReversa(u.solicitanteAlinare, 'Alinare', nc.emTratativa.id, 'Cliente em tratativa');
    assert.equal(emTratativa.nc_id, nc.emTratativa.id);
  });

  it('NC Encerrada é recusada, e nada é gravado (nem reversa, nem histórico da NC)', async () => {
    const antes = await contagem();
    const erro = await tentarReversa(u.solicitanteAlinare, 'Alinare', nc.encerrada.id, 'Cliente encerrada');
    assert.ok(erro, 'a criação com NC encerrada precisa ser recusada');
    assert.match(erro.message, /precisa estar Aberta ou Em tratativa/);
    assert.deepEqual(await contagem(), antes);
  });

  it('NC Cancelada é recusada, e nada é gravado', async () => {
    const antes = await contagem();
    const erro = await tentarReversa(u.solicitanteAlinare, 'Alinare', nc.cancelada.id, 'Cliente cancelada');
    assert.ok(erro, 'a criação com NC cancelada precisa ser recusada');
    assert.match(erro.message, /precisa estar Aberta ou Em tratativa/);
    assert.deepEqual(await contagem(), antes);
  });

  it('NC inexistente é recusada', async () => {
    const erro = await tentarReversa(u.solicitanteAlinare, 'Alinare', '00000000-0000-4000-8000-000000000000', 'Cliente sem NC');
    assert.ok(erro);
    assert.match(erro.message, /NC de origem não encontrada/);
  });

  it('NC de outra empresa é recusada', async () => {
    const erro = await tentarReversa(u.solicitanteAlinare, 'Alinare', nc.novitah.id, 'Cliente cruzado');
    assert.ok(erro);
    assert.match(erro.message, /precisa ser da mesma empresa da NC/);
  });

  it('reversa sem NC continua permitida', async () => {
    const semNc = await criarReversa(u.solicitanteAlinare, 'Alinare', null, 'Cliente sem NC');
    assert.equal(semNc.nc_id, null);
  });
});

describe('vínculo histórico e troca de NC', () => {
  it('NC encerrada depois de vinculada não impede atualização logística nem apaga o vínculo', async () => {
    const reversa = await criarReversa(u.solicitanteAlinare, 'Alinare', nc.emTratativa.id, 'Cliente histórica');
    await db.query("update public.nao_conformidades set status = 'Encerrada' where id = $1", [nc.emTratativa.id]);
    const { rows } = await db.query(
      "update public.solicitacoes_reverso set anotacoes = 'Nota depois do encerramento' where id = $1 returning *",
      [reversa.id]
    );
    assert.equal(rows[0].nc_id, nc.emTratativa.id);
    assert.equal(rows[0].anotacoes, 'Nota depois do encerramento');
  });

  it('trocar para NC encerrada é recusado e a reversa fica com a NC anterior', async () => {
    const reversa = await criarReversa(u.solicitanteAlinare, 'Alinare', nc.aberta.id, 'Cliente troca encerrada');
    const antes = await contagem();
    const erro = await falha(atualizarVinculo(reversa.id, nc.encerrada.id));
    assert.ok(erro, 'a troca para NC encerrada precisa ser recusada');
    assert.match(erro.message, /precisa estar Aberta ou Em tratativa/);
    const { rows } = await db.query('select nc_id from public.solicitacoes_reverso where id = $1', [reversa.id]);
    assert.equal(rows[0].nc_id, nc.aberta.id);
    assert.deepEqual(await contagem(), antes);
  });

  it('trocar para NC Cancelada é recusado', async () => {
    const reversa = await criarReversa(u.solicitanteAlinare, 'Alinare', nc.aberta.id, 'Cliente troca cancelada');
    const erro = await falha(atualizarVinculo(reversa.id, nc.cancelada.id));
    assert.ok(erro);
    assert.match(erro.message, /precisa estar Aberta ou Em tratativa/);
  });

  it('trocar para NC aberta da mesma empresa é aceito', async () => {
    const reversa = await criarReversa(u.solicitanteAlinare, 'Alinare', nc.aberta.id, 'Cliente troca aberta');
    const { rows } = await atualizarVinculo(reversa.id, nc.abertaDestino.id);
    assert.equal(rows[0].nc_id, nc.abertaDestino.id);
  });

  it('trocar para NC de outra empresa é recusado', async () => {
    const reversa = await criarReversa(u.solicitanteAlinare, 'Alinare', nc.aberta.id, 'Cliente troca cruzada');
    const erro = await falha(atualizarVinculo(reversa.id, nc.novitah.id));
    assert.ok(erro);
    assert.match(erro.message, /precisa ser da mesma empresa da NC/);
  });
});
