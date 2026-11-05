import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { como, criarUsuario, iniciarBanco, iniciarSessao, migrationsNovas } from './lib/banco.mjs';

let banco;
let db;
let c1;
const usuarios = {};
const falha = (promessa) => promessa.then(() => null, (erro) => erro);

async function inserirPedido(persona, empresa, cliente) {
  return (await como(c1, persona, `
    insert into public.solicitacoes_reverso
      (empresa, data_solicitacao, solicitante, setor, codigo_cliente, nome_cliente, endereco_postagem, motivo)
    values ($1, current_date, 'Pessoa solicitante', 'Comercial', 9901, $2, 'Rua de teste, 1', 'Outros')
    returning *`, [empresa, cliente])).rows[0];
}

async function decidir(persona, pedido, decisao, justificativa = null) {
  return como(c1, persona, decisao === 'aprovada'
    ? 'select * from public.aprovar_reversa($1, $2, null)'
    : 'select * from public.rejeitar_reversa($1, $2, $3)',
  decisao === 'aprovada' ? [pedido.id, pedido.aprovacao_versao] : [pedido.id, pedido.aprovacao_versao, justificativa]);
}

before(async () => {
  banco = await iniciarBanco();
  db = banco.dono;
  for (const migration of migrationsNovas()) await banco.aplicar(migration);
  c1 = await banco.conectar();

  Object.assign(usuarios, {
    admin: await criarUsuario(db, 'Admin de teste', ['usuarios']),
    solicitanteA: await criarUsuario(db, 'Solicitante A', ['formulario-alinare']),
    solicitanteB: await criarUsuario(db, 'Solicitante B', ['formulario-novitah']),
    aprovadorA: await criarUsuario(db, 'Aprovador A', ['aprovar-alinare']),
    aprovadorB: await criarUsuario(db, 'Aprovador B', ['aprovar-novitah']),
    emissorA: await criarUsuario(db, 'Emissor A', ['emitir-alinare']),
    emissorA2: await criarUsuario(db, 'Segundo emissor A', ['emitir-alinare']),
    emissorB: await criarUsuario(db, 'Emissor B', ['emitir-novitah']),
    comumA: await criarUsuario(db, 'Usuário comum A', ['lista-alinare']),
  });

  for (const empresa of ['Alinare', 'Novitah']) {
    const aprovador = empresa === 'Alinare' ? usuarios.aprovadorA : usuarios.aprovadorB;
    await como(c1, usuarios.admin, 'select public.salvar_config_aprovadores_reversa($1, $2::jsonb)', [empresa, JSON.stringify([
      { usuario_id: aprovador.id, todos_setores: false, setores: ['Comercial'] },
    ])]);
  }
}, { timeout: 300_000 });

after(async () => {
  await banco?.encerrar();
});

describe('notificações de aprovação para expedição', () => {
  it('grava a aprovação e o aviso na mesma transação', async () => {
    const pedido = await inserirPedido(usuarios.solicitanteA, 'Alinare', 'Cliente aprovação transacional');
    await c1.query('begin');
    try {
      await iniciarSessao(c1, usuarios.aprovadorA);
      await c1.query('select * from public.aprovar_reversa($1, $2, null)', [pedido.id, pedido.aprovacao_versao]);
      await iniciarSessao(c1, usuarios.emissorA);
      const avisosNaTransacao = (await c1.query('select * from public.listar_notificacoes_emissao()')).rows;
      assert.ok(avisosNaTransacao.some((item) => item.solicitacao_id === pedido.id));
    } finally {
      await c1.query('rollback');
    }
    assert.equal((await db.query('select aprovacao_status from public.solicitacoes_reverso where id = $1', [pedido.id])).rows[0].aprovacao_status, 'aguardando_aprovacao');
    assert.equal((await db.query('select count(*)::int as n from public.reversa_notificacoes_emissao where solicitacao_id = $1', [pedido.id])).rows[0].n, 0);
  });

  it('aprovação notifica o emissor da empresa, rejeição não notifica e repetição não duplica', async () => {
    const aprovado = await inserirPedido(usuarios.solicitanteA, 'Alinare', 'Cliente aprovado');
    await decidir(usuarios.aprovadorA, aprovado, 'aprovada');
    const aviso = (await db.query('select * from public.reversa_notificacoes_emissao where solicitacao_id = $1', [aprovado.id])).rows[0];
    assert.equal(aviso.empresa, 'Alinare');
    assert.equal(aviso.aprovacao_versao, aprovado.aprovacao_versao);
    assert.equal(aviso.destinatario_id, usuarios.emissorA.id);
    const destinatarios = (await db.query('select destinatario_id from public.reversa_notificacoes_emissao where solicitacao_id = $1', [aprovado.id])).rows.map((row) => row.destinatario_id);
    assert.deepEqual(new Set(destinatarios), new Set([usuarios.emissorA.id, usuarios.emissorA2.id]));

    const repetida = await falha(decidir(usuarios.aprovadorA, aprovado, 'aprovada'));
    assert.equal(repetida?.code, '55000');
    assert.equal((await db.query('select count(*)::int as n from public.reversa_notificacoes_emissao where solicitacao_id = $1', [aprovado.id])).rows[0].n, 2);

    const insercaoDireta = await falha(como(c1, usuarios.comumA, `
      insert into public.reversa_notificacoes_emissao (solicitacao_id, empresa, aprovacao_versao, destinatario_id)
      values ($1, 'Alinare', 99, $2)`, [aprovado.id, usuarios.comumA.id]));
    assert.equal(insercaoDireta?.code, '42501', 'usuário comum não cria aviso nem escolhe destinatário pela API');

    const rejeitado = await inserirPedido(usuarios.solicitanteA, 'Alinare', 'Cliente rejeitado');
    await decidir(usuarios.aprovadorA, rejeitado, 'rejeitada', 'Endereço incompleto');
    assert.equal((await db.query('select count(*)::int as n from public.reversa_notificacoes_emissao where solicitacao_id = $1', [rejeitado.id])).rows[0].n, 0);
  });

  it('isola destinatários, persiste a leitura sem mudar o pedido e revoga acesso junto com a capacidade', async () => {
    const pedidoA = await inserirPedido(usuarios.solicitanteA, 'Alinare', 'Aviso Alinare');
    await decidir(usuarios.aprovadorA, pedidoA, 'aprovada');
    const avisosA = (await db.query('select id, destinatario_id from public.reversa_notificacoes_emissao where solicitacao_id = $1', [pedidoA.id])).rows;
    const avisoA = avisosA.find((item) => item.destinatario_id === usuarios.emissorA.id);
    const avisoA2 = avisosA.find((item) => item.destinatario_id === usuarios.emissorA2.id);

    const pedidoB = await inserirPedido(usuarios.solicitanteB, 'Novitah', 'Aviso Novitah');
    await decidir(usuarios.aprovadorB, pedidoB, 'aprovada');
    const avisoB = (await db.query('select id from public.reversa_notificacoes_emissao where solicitacao_id = $1', [pedidoB.id])).rows[0];

    const listaA = (await como(c1, usuarios.emissorA, 'select * from public.listar_notificacoes_emissao()')).rows;
    assert.ok(listaA.some((item) => item.id === avisoA.id));
    assert.ok(!listaA.some((item) => item.id === avisoA2.id), 'outro emissor da mesma empresa não acessa avisos pessoais');
    assert.ok(!listaA.some((item) => item.id === avisoB.id));
    assert.equal((await como(c1, usuarios.emissorA, 'select public.marcar_notificacao_emissao_lida($1) as lida', [avisoB.id])).rows[0].lida, false);
    assert.equal((await como(c1, usuarios.emissorA, 'select public.marcar_notificacao_emissao_lida($1) as lida', [avisoA2.id])).rows[0].lida, false);

    assert.equal((await como(c1, usuarios.emissorA, 'select public.marcar_notificacao_emissao_lida($1) as lida', [avisoA.id])).rows[0].lida, true);
    assert.ok((await db.query('select lida_em from public.reversa_notificacoes_emissao where id = $1', [avisoA.id])).rows[0].lida_em);
    assert.equal((await db.query('select status from public.solicitacoes_reverso where id = $1', [pedidoA.id])).rows[0].status, 'pendente');

    const { rows: [metadata] } = await db.query('select raw_app_meta_data from auth.users where id = $1', [usuarios.emissorA.id]);
    await db.query(`update auth.users
      set raw_app_meta_data = jsonb_set(raw_app_meta_data, '{telas}', coalesce(raw_app_meta_data -> 'telas', '[]'::jsonb) - 'emitir-etiqueta')
      where id = $1`, [usuarios.emissorA.id]);
    const semCapacidade = (await como(c1, usuarios.emissorA, 'select * from public.listar_notificacoes_emissao()')).rows;
    assert.ok(!semCapacidade.some((item) => item.id === avisoA.id));
    assert.equal((await como(c1, usuarios.emissorA, 'select public.marcar_notificacao_emissao_lida($1) as lida', [avisoA.id])).rows[0].lida, false);
    await db.query('update auth.users set raw_app_meta_data = $2 where id = $1', [usuarios.emissorA.id, metadata.raw_app_meta_data]);
  });
});
