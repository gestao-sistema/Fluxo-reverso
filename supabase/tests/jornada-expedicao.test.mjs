import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { como, criarUsuario, iniciarBanco, migrationsNovas } from './lib/banco.mjs';

// Jornada do pedido até a etiqueta, no banco real (RLS por papel): o pedido novo é visível ao
// operador da empresa mas ainda NÃO é elegível; depois da aprovação passa a ser; outra empresa
// nunca opera; PDF e rastreamento seguem as regras de vínculo. Não prova o Storage de produção.
let banco; let db; let c1;
const u = {};
const falha = (promessa) => promessa.then(() => null, (erro) => erro);
const q = async (sql, params) => (await db.query(sql, params)).rows;

const novoPedido = async (empresa, cliente, autor = u.solicitante) =>
  (await como(c1, autor, `
    insert into public.solicitacoes_reverso
      (empresa, data_solicitacao, solicitante, setor, codigo_cliente, nome_cliente, endereco_postagem, motivo)
    values ($1, current_date, 'x', 'Comercial', 9903, $2, 'Rua de teste, 1', 'Outros') returning *`, [empresa, cliente])).rows[0];
const visiveis = async (persona) =>
  (await como(c1, persona, "select id, status, aprovacao_status from public.solicitacoes_reverso where status in ('pendente','etiqueta_gerada')")).rows;
const pode = async (persona, id) =>
  (await como(c1, persona, "select public.pode_operar_emissao($1, 'registrar') as ok", [id])).rows[0].ok;

before(async () => {
  banco = await iniciarBanco();
  db = banco.dono;
  for (const arquivo of migrationsNovas()) await banco.aplicar(arquivo);
  c1 = await banco.conectar();
  Object.assign(u, {
    admin: await criarUsuario(db, 'Admin jornada', ['usuarios']),
    solicitante: await criarUsuario(db, 'Solicitante jornada', ['formulario-alinare']),
    solicitanteNovitah: await criarUsuario(db, 'Solicitante Novitah jornada', ['formulario-novitah']),
    aprovador: await criarUsuario(db, 'Aprovador jornada', ['aprovar-alinare']),
    aprovadorNovitah: await criarUsuario(db, 'Aprovador Novitah jornada', ['aprovar-novitah']),
    emissorAlinare: await criarUsuario(db, 'Emissor Alinare jornada', ['emitir-alinare']),
    emissorNovitah: await criarUsuario(db, 'Emissor Novitah jornada', ['emitir-novitah']),
  });
  for (const [empresa, aprovador] of [['Alinare', u.aprovador], ['Novitah', u.aprovadorNovitah]]) {
    await como(c1, u.admin, 'select public.salvar_config_aprovadores_reversa($1, $2::jsonb)', [empresa, JSON.stringify([
      { usuario_id: aprovador.id, todos_setores: true, setores: [] },
    ])]);
  }
});
after(async () => { await banco?.encerrar(); });

describe('jornada: pedido novo -> aprovação -> expedição -> etiqueta', () => {
  it('pedido novo: gravado como pendente + aguardando aprovação, visível ao operador, mas não elegível', async () => {
    const pedido = await novoPedido('Alinare', 'Jornada nova');
    assert.equal(pedido.empresa, 'Alinare');
    assert.equal(pedido.status, 'pendente', 'o banco não usa mais "aguardando_aprovacao" como situação logística');
    assert.equal(pedido.aprovacao_status, 'aguardando_aprovacao');
    assert.ok((await visiveis(u.emissorAlinare)).some((r) => r.id === pedido.id), 'o operador da empresa enxerga o pedido');
    assert.equal(await pode(u.emissorAlinare, pedido.id), false, 'mas ele só é elegível depois da aprovação');
    const erro = await falha(como(c1, u.emissorAlinare, 'select public.registrar_emissao_reversa($1, null, $2, null, current_date, null)', [pedido.id, 'AUT-CEDO']));
    assert.equal(erro?.code, '55000');
    assert.match(erro.message, /aprovação/);
  });

  it('depois da aprovação o operador da empresa opera; o de outra empresa não vê nem opera', async () => {
    const pedido = await novoPedido('Alinare', 'Jornada aprovada');
    await como(c1, u.aprovador, 'select * from public.aprovar_reversa($1, $2, null)', [pedido.id, pedido.aprovacao_versao]);
    assert.equal(await pode(u.emissorAlinare, pedido.id), true);
    assert.equal(await pode(u.emissorNovitah, pedido.id), false);
    assert.ok(!(await visiveis(u.emissorNovitah)).some((r) => r.id === pedido.id), 'a outra empresa não enxerga o pedido');
    assert.equal(await pode(u.solicitante, pedido.id), false, 'quem solicita não emite');
  });

  it('pedido rejeitado nunca é elegível', async () => {
    const pedido = await novoPedido('Alinare', 'Jornada rejeitada');
    await como(c1, u.aprovador, 'select * from public.rejeitar_reversa($1, $2, $3)', [pedido.id, pedido.aprovacao_versao, 'Endereço suspeito']);
    const atual = (await q('select status, aprovacao_status from public.solicitacoes_reverso where id = $1', [pedido.id]))[0];
    assert.deepEqual({ ...atual }, { status: 'pendente', aprovacao_status: 'rejeitada' });
    assert.equal(await pode(u.emissorAlinare, pedido.id), false);
  });

  it('o mesmo vale para Novitah, e o aprovador de uma empresa não decide a outra', async () => {
    const pedido = await novoPedido('Novitah', 'Jornada Novitah', u.solicitanteNovitah);
    const erro = await falha(como(c1, u.aprovador, 'select * from public.aprovar_reversa($1, $2, null)', [pedido.id, pedido.aprovacao_versao]));
    assert.ok(erro, 'aprovador da Alinare não aprova pedido da Novitah');
    assert.equal(await pode(u.emissorNovitah, pedido.id), false);
    await como(c1, u.aprovadorNovitah, 'select * from public.aprovar_reversa($1, $2, null)', [pedido.id, pedido.aprovacao_versao]);
    assert.equal(await pode(u.emissorNovitah, pedido.id), true);
    assert.equal(await pode(u.emissorAlinare, pedido.id), false);
  });

  it('emissão parcial (sem PDF, sem rastreamento) é recuperável: o PDF é vinculado depois', async () => {
    const pedido = await novoPedido('Alinare', 'Jornada parcial');
    await como(c1, u.aprovador, 'select * from public.aprovar_reversa($1, $2, null)', [pedido.id, pedido.aprovacao_versao]);
    const emissao = (await como(c1, u.emissorAlinare, 'select * from public.registrar_emissao_reversa($1, null, $2, null, current_date, null)', [pedido.id, 'AUT-PARCIAL'])).rows[0];
    assert.equal(emissao.pdf_path, null);
    assert.equal(emissao.codigo_rastreio, null, 'o rastreamento é opcional');
    const parcial = (await q('select status, etiqueta_path from public.solicitacoes_reverso where id = $1', [pedido.id]))[0];
    assert.equal(parcial.etiqueta_path, null, 'sem PDF vinculado nada é dado como anexado (a fila mantém o pedido para recuperar)');

    const caminho = `${pedido.id}/${emissao.id}-1-etiqueta.pdf`;
    await como(c1, u.emissorAlinare, "insert into storage.objects (bucket_id, name) values ('etiquetas', $1)", [caminho]);
    const vinculada = (await como(c1, u.emissorAlinare, 'select * from public.anexar_pdf_emissao($1, $2, $3, null)', [emissao.id, caminho, 'etiqueta.pdf'])).rows[0];
    assert.equal(vinculada.pdf_nome, 'etiqueta.pdf');
    const depois = (await q('select status, etiqueta_path from public.solicitacoes_reverso where id = $1', [pedido.id]))[0];
    assert.equal(depois.status, 'etiqueta_gerada');
    assert.equal(depois.etiqueta_path, caminho);
    // o solicitante lê a emissão (para abrir e baixar a etiqueta); a outra empresa não
    const lida = await como(c1, u.solicitante, 'select pdf_path from public.reversa_emissoes where solicitacao_id = $1', [pedido.id]);
    assert.equal(lida.rows.length, 1);
    const alheia = await como(c1, u.solicitanteNovitah, 'select pdf_path from public.reversa_emissoes where solicitacao_id = $1', [pedido.id]);
    assert.equal(alheia.rows.length, 0);
  });

  it('PDF enviado ao Storage sem vínculo não move o pedido (falha no vínculo)', async () => {
    const pedido = await novoPedido('Alinare', 'Jornada vínculo');
    await como(c1, u.aprovador, 'select * from public.aprovar_reversa($1, $2, null)', [pedido.id, pedido.aprovacao_versao]);
    await como(c1, u.emissorAlinare, "insert into storage.objects (bucket_id, name) values ('etiquetas', $1)", [`${pedido.id}/orfao.pdf`]);
    const atual = (await q('select status, etiqueta_path from public.solicitacoes_reverso where id = $1', [pedido.id]))[0];
    assert.equal(atual.status, 'pendente');
    assert.equal(atual.etiqueta_path, null);
  });
});
