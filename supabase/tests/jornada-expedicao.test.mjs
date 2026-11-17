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

// Jornada pedida na correção de 12/11/2026, ponta a ponta no banco (RLS por papel, Storage simulado):
// A abre -> A não decide -> B decide -> expedição anexa a etiqueta e o rastreio -> o PDF continua legível
// depois de "recarregar" (nova consulta) -> administrador move para a Lixeira e restaura.
describe('jornada completa: autoria, decisão, etiqueta, PDF e Lixeira', () => {
  const lerPdf = async (persona, caminho) =>
    (await como(c1, persona, "select count(*)::int as n from storage.objects where bucket_id = 'etiquetas' and name = $1", [caminho])).rows[0].n;

  it('o autor não decide, outro aprovador decide, o PDF reabre para quem lê o pedido e a Lixeira preserva tudo', async () => {
    const autorA = await criarUsuario(db, 'Autora e aprovadora jornada', ['formulario-alinare', 'aprovar-alinare']);
    const colegaFormulario = await criarUsuario(db, 'Colega so formulario jornada', ['formulario-alinare']);
    await como(c1, u.admin, 'select public.salvar_config_aprovadores_reversa($1, $2::jsonb)', ['Alinare', JSON.stringify([
      { usuario_id: u.aprovador.id, todos_setores: true, setores: [] },
      { usuario_id: autorA.id, todos_setores: true, setores: [] },
    ])]);

    // 1. A abre o pedido e não consegue decidir (nem pela tela nem pela API)
    const pedido = await novoPedido('Alinare', 'Jornada completa', autorA);
    const naFilaDeA = (await como(c1, autorA, 'select id, proprio_pedido, pode_aprovar from public.fila_aprovacao_reversas()')).rows
      .find((r) => r.id === pedido.id);
    assert.deepEqual({ ...naFilaDeA }, { id: pedido.id, proprio_pedido: true, pode_aprovar: false });
    for (const sql of [
      'select * from public.aprovar_reversa($1, $2, null)',
      "select * from public.rejeitar_reversa($1, $2, 'desistência')",
    ]) {
      const erro = await falha(como(c1, autorA, sql, [pedido.id, pedido.aprovacao_versao]));
      assert.equal(erro?.code, '42501');
    }

    // 2. B decide; segunda decisão sobre a mesma versão não muda nada
    await como(c1, u.aprovador, 'select * from public.aprovar_reversa($1, $2, null)', [pedido.id, pedido.aprovacao_versao]);
    const repetida = await falha(como(c1, u.aprovador, "select * from public.rejeitar_reversa($1, $2, 'mudei')", [pedido.id, pedido.aprovacao_versao]));
    assert.equal(repetida?.code, '55000');
    assert.equal((await q('select aprovacao_status from public.solicitacoes_reverso where id = $1', [pedido.id]))[0].aprovacao_status, 'aprovada');

    // 3. Expedição envia o PDF e registra a emissão com o rastreio lido da etiqueta
    const caminho = `${pedido.id}/emissao-1-etiqueta.pdf`;
    await como(c1, u.emissorAlinare, "insert into storage.objects (bucket_id, name) values ('etiquetas', $1)", [caminho]);
    const emissao = (await como(c1, u.emissorAlinare,
      'select * from public.registrar_emissao_reversa($1, null, $2, $3, current_date, null, $4, $5)',
      [pedido.id, 'AUT-JORNADA', 'AB123456789BR', caminho, 'etiqueta.pdf'])).rows[0];
    assert.equal(emissao.codigo_rastreio, 'AB123456789BR');
    assert.equal(emissao.pdf_path, caminho);

    // 4. "Atualizar a página": nova consulta devolve o mesmo vínculo e o PDF continua legível
    const reaberta = (await como(c1, u.emissorAlinare,
      'select pdf_path, codigo_rastreio from public.reversa_emissoes where solicitacao_id = $1 and substituida_em is null', [pedido.id])).rows[0];
    assert.deepEqual({ ...reaberta }, { pdf_path: caminho, codigo_rastreio: 'AB123456789BR' });
    const pedidoReaberto = (await q('select etiqueta_path, codigo_rastreio, status from public.solicitacoes_reverso where id = $1', [pedido.id]))[0];
    assert.equal(pedidoReaberto.etiqueta_path, caminho);
    assert.equal(pedidoReaberto.codigo_rastreio, 'AB123456789BR');
    assert.equal(await lerPdf(u.emissorAlinare, caminho), 1, 'expedição reabre o PDF');
    assert.equal(await lerPdf(autorA, caminho), 1, 'a autora reabre a etiqueta do próprio pedido');
    assert.equal(await lerPdf(u.aprovador, caminho), 1, 'o aprovador da empresa lê');
    assert.equal(await lerPdf(colegaFormulario, caminho), 0, 'só o formulário da empresa não dá leitura do PDF de outra pessoa');
    assert.equal(await lerPdf(u.solicitanteNovitah, caminho), 0, 'outra empresa não lê');
    assert.equal(await lerPdf(u.emissorNovitah, caminho), 0, 'expedição de outra empresa não lê');

    // 5. Só o administrador move para a Lixeira; o arquivo e a emissão ficam guardados
    for (const persona of [u.emissorAlinare, u.aprovador, autorA]) {
      const erro = await falha(como(c1, persona, 'select public.inutilizar_chamado($1)', [pedido.id]));
      assert.equal(erro?.code, '42501');
      const lista = await falha(como(c1, persona, 'select * from public.listar_chamados_lixeira()'));
      assert.equal(lista?.code, '42501');
    }
    await como(c1, u.admin, 'select public.inutilizar_chamado($1)', [pedido.id]);
    const naLixeira = (await como(c1, u.admin, 'select id from public.listar_chamados_lixeira()')).rows.map((r) => r.id);
    assert.ok(naLixeira.includes(pedido.id));
    assert.equal((await q("select count(*)::int as n from storage.objects where bucket_id = 'etiquetas' and name = $1", [caminho]))[0].n, 1, 'o PDF não é apagado');
    assert.equal((await q('select count(*)::int as n from public.reversa_emissoes where solicitacao_id = $1', [pedido.id]))[0].n, 1, 'a emissão é preservada');
    assert.equal(await lerPdf(u.emissorAlinare, caminho), 0, 'chamado na Lixeira: PDF só para administrador');
    assert.equal(await lerPdf(autorA, caminho), 0);
    assert.equal(await lerPdf(u.admin, caminho), 1, 'o administrador consulta o histórico arquivado');
    const operar = await falha(como(c1, u.emissorAlinare, "select * from public.atualizar_dados_emissao($1, 'AUT-JORNADA', 'AC123456789BR', current_date, null)", [emissao.id]));
    assert.ok(operar, 'chamado na Lixeira não é operado');

    // 6. Restaurar devolve o mesmo arquivo, o mesmo rastreio e a mesma leitura
    await como(c1, u.admin, 'select public.restaurar_chamado($1)', [pedido.id]);
    assert.equal(await lerPdf(u.emissorAlinare, caminho), 1);
    assert.equal(await lerPdf(autorA, caminho), 1);
    const restaurada = (await como(c1, u.emissorAlinare,
      'select pdf_path, codigo_rastreio from public.reversa_emissoes where solicitacao_id = $1 and substituida_em is null', [pedido.id])).rows[0];
    assert.deepEqual({ ...restaurada }, { pdf_path: caminho, codigo_rastreio: 'AB123456789BR' });
  });
});
