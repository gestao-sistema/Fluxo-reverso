// Avisos internos do ciclo da reversa (migration 20261109150000): destinatários, permissões,
// deduplicação entre canais, aprovação pendente superada por decisão ou nova versão, leitura
// individual sem efeito no pedido, e a Expedição sem aviso duplicado (já tem o aviso de emissão).
// Roda no PostgreSQL local do harness, como os outros testes do banco.
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ANON, como, criarUsuario, iniciarBanco, migrationsNovas } from './lib/banco.mjs';

let banco;
let db;
const u = {};
const r = {};

const falha = (promessa) => promessa.then(() => null, (erro) => erro);

const INSERIR_REVERSA = `insert into public.solicitacoes_reverso
  (empresa, data_solicitacao, solicitante, setor, codigo_cliente, nome_cliente, endereco_postagem, motivo, nc_id)
  values ($1, current_date, 'Fulana', 'Financeiro', 77, $2, 'Rua B, 2', 'Outros', null)
  returning *`;

const novaReversa = async (persona, empresa, cliente) =>
  (await como(db, persona, INSERIR_REVERSA, [empresa, cliente])).rows[0];

const avisosDe = async (persona) => (await como(db, persona, 'select * from public.listar_avisos_reverso(100)')).rows;
const avisosDoPedido = async (persona, solicitacaoId) =>
  (await avisosDe(persona)).filter((aviso) => aviso.solicitacao_id === solicitacaoId);
const naoLidos = async (persona) =>
  (await como(db, persona, 'select public.contar_avisos_reverso_nao_lidos() as total')).rows[0].total;
const marcarLido = async (persona, avisoId) =>
  (await como(db, persona, 'select public.marcar_aviso_reverso_lido($1) as marcado', [avisoId])).rows[0].marcado;
const configurar = (empresa, aprovadores) => como(
  db,
  u.admin,
  'select public.salvar_config_aprovadores_reversa($1, $2::jsonb)',
  [empresa, JSON.stringify(aprovadores.map((pessoa) => ({ usuario_id: pessoa.id, todos_setores: true, setores: [] })))]
);
const estadoDoPedido = async (id) => (await db.query(
  'select status, aprovacao_status, aprovacao_versao, nome_cliente, nc_id from public.solicitacoes_reverso where id = $1',
  [id]
)).rows[0];

before(
  async () => {
    banco = await iniciarBanco();
    db = banco.dono;
    for (const arquivo of migrationsNovas()) await banco.aplicar(arquivo);

    Object.assign(u, {
      admin: await criarUsuario(db, 'Administradora', ['usuarios']),
      solicitanteAlinare: await criarUsuario(db, 'Solicitante Alinare', ['formulario-alinare']),
      solicitanteAprovador: await criarUsuario(db, 'Solicita e Aprova Alinare', ['formulario-alinare', 'aprovar-alinare']),
      solicitanteNovitah: await criarUsuario(db, 'Solicitante Novitah', ['formulario-novitah']),
      aprovadorAlinare: await criarUsuario(db, 'Aprovadora Alinare', ['aprovar-alinare']),
      aprovadorAlinare2: await criarUsuario(db, 'Segunda Aprovadora Alinare', ['aprovar-alinare']),
      aprovadorNovitah: await criarUsuario(db, 'Aprovador Novitah', ['aprovar-novitah']),
      emissorAlinare: await criarUsuario(db, 'Emissora Alinare', ['emitir-alinare']),
      semTelas: await criarUsuario(db, 'Sem Telas', []),
    });
    await configurar('Alinare', [u.aprovadorAlinare, u.aprovadorAlinare2]);
    await configurar('Novitah', [u.aprovadorNovitah]);
  },
  { timeout: 300_000 }
);

after(async () => {
  await banco?.encerrar();
});

describe('destinatários e permissões', () => {
  it('pedido novo: o solicitante recebe a confirmação; só os aprovadores elegíveis recebem a aprovação pendente', async () => {
    r.um = await novaReversa(u.solicitanteAlinare, 'Alinare', 'Cliente avisos um');
    assert.deepEqual((await avisosDoPedido(u.solicitanteAlinare, r.um.id)).map((a) => a.evento), ['pedido_criado']);
    assert.deepEqual(
      (await avisosDoPedido(u.aprovadorAlinare, r.um.id)).map((a) => [a.evento, a.versao]),
      [['aprovacao_pendente', 1]]
    );
    assert.equal((await avisosDoPedido(u.aprovadorAlinare2, r.um.id)).length, 1);
    assert.equal((await avisosDoPedido(u.aprovadorNovitah, r.um.id)).length, 0, 'aprovador de outra empresa não recebe');
    assert.equal((await avisosDoPedido(u.solicitanteNovitah, r.um.id)).length, 0, 'solicitante de outra empresa não recebe');
    assert.equal((await avisosDoPedido(u.emissorAlinare, r.um.id)).length, 0, 'Expedição usa o aviso de emissão existente');
    assert.deepEqual(await avisosDe(u.semTelas), [], 'sem telas, nenhum aviso');
  });

  it('quem registrou o pedido não recebe a própria aprovação pendente', async () => {
    await configurar('Alinare', [u.aprovadorAlinare, u.aprovadorAlinare2, u.solicitanteAprovador]);
    const pedido = await novaReversa(u.solicitanteAprovador, 'Alinare', 'Cliente autor aprovador');
    assert.equal((await avisosDoPedido(u.solicitanteAprovador, pedido.id)).some((a) => a.evento === 'aprovacao_pendente'), false);
    assert.equal((await avisosDoPedido(u.aprovadorAlinare, pedido.id)).length, 1);
    await configurar('Alinare', [u.aprovadorAlinare, u.aprovadorAlinare2]);
  });

  it('acesso anônimo à lista de avisos é recusado', async () => {
    const erro = await falha(como(db, ANON, 'select * from public.listar_avisos_reverso()'));
    assert.equal(erro?.code, '42501');
  });
});

describe('duplicação', () => {
  it('repetir a configuração de aprovadores não duplica o aviso pendente', async () => {
    await configurar('Alinare', [u.aprovadorAlinare, u.aprovadorAlinare2]);
    assert.equal((await avisosDoPedido(u.aprovadorAlinare, r.um.id)).length, 1);
    assert.equal((await avisosDoPedido(u.aprovadorAlinare2, r.um.id)).length, 1);
  });

  it('etiqueta disponível: e-mail e Teams da mesma emissão geram um aviso só para o solicitante', async () => {
    r.quatro = await novaReversa(u.solicitanteAlinare, 'Alinare', 'Cliente avisos quatro');
    await como(db, u.aprovadorAlinare, 'select public.aprovar_reversa($1, $2, $3)', [r.quatro.id, 1, null]);
    // O PDF precisa existir no bucket antes do registro (como nos testes de emissão do banco)
    await como(db, u.emissorAlinare, "insert into storage.objects (bucket_id, name) values ('etiquetas', $1)", [`${r.quatro.id}/etiqueta.pdf`]);
    await como(
      db,
      u.emissorAlinare,
      'select public.registrar_emissao_reversa($1, null, $2, $3, current_date, null, $4, $5, $6, null, null, null)',
      [r.quatro.id, 'AUT-QUATRO', 'AA000000004BR', `${r.quatro.id}/etiqueta.pdf`, 'etiqueta.pdf', 'a'.repeat(64)]
    );
    const linhasDaFila = await db.query(
      "select count(*)::int as total from public.reversa_comunicacoes_etiqueta where solicitacao_id = $1 and evento = 'etiqueta_disponivel'",
      [r.quatro.id]
    );
    assert.equal(linhasDaFila.rows[0].total, 2, 'a fila tem uma linha por canal (e-mail e Teams)');
    const etiquetas = (await avisosDoPedido(u.solicitanteAlinare, r.quatro.id)).filter((a) => a.evento === 'etiqueta_disponivel');
    assert.equal(etiquetas.length, 1, 'mas o aviso interno é um só');
  });
});

describe('decisão e nova versão superam a pendência', () => {
  it('aprovação: a pendência fica superada, o solicitante recebe a observação, e a Expedição tem só o aviso de emissão', async () => {
    const naoLidosAntes = await naoLidos(u.aprovadorAlinare);
    await como(db, u.aprovadorAlinare, 'select public.aprovar_reversa($1, $2, $3)', [r.um.id, 1, 'Conferido com a NF']);
    const pendencias = (await avisosDoPedido(u.aprovadorAlinare, r.um.id)).filter((a) => a.evento === 'aprovacao_pendente');
    assert.ok(pendencias.length > 0 && pendencias.every((a) => a.superado_em), 'pendência superada pela decisão');
    const aprovado = (await avisosDoPedido(u.solicitanteAlinare, r.um.id)).find((a) => a.evento === 'pedido_aprovado');
    assert.ok(aprovado, 'solicitante recebe pedido aprovado');
    assert.equal(aprovado.justificativa, 'Conferido com a NF');
    assert.equal(aprovado.versao, 1);
    assert.equal(await naoLidos(u.aprovadorAlinare), naoLidosAntes - 1, 'pendência superada deixa de contar como não lida');
    const emissao = (await como(db, u.emissorAlinare, 'select * from public.listar_notificacoes_emissao()')).rows
      .filter((n) => n.solicitacao_id === r.um.id);
    assert.equal(emissao.length, 1, 'Expedição recebe o aviso de emissão existente');
    assert.equal((await avisosDoPedido(u.emissorAlinare, r.um.id)).length, 0, 'sem segundo aviso equivalente');
  });

  it('rejeição: o solicitante recebe o motivo e a pendência é superada', async () => {
    r.dois = await novaReversa(u.solicitanteAlinare, 'Alinare', 'Cliente avisos dois');
    await como(db, u.aprovadorAlinare, 'select public.rejeitar_reversa($1, $2, $3)', [r.dois.id, 1, 'Endereço incompleto']);
    const rejeitado = (await avisosDoPedido(u.solicitanteAlinare, r.dois.id)).find((a) => a.evento === 'pedido_rejeitado');
    assert.equal(rejeitado?.justificativa, 'Endereço incompleto');
    assert.ok((await avisosDoPedido(u.aprovadorAlinare, r.dois.id)).every((a) => a.superado_em));
  });

  it('alteração que devolve à análise: a versão anterior fica superada e a nova rodada fica pendente', async () => {
    r.tres = await novaReversa(u.solicitanteAlinare, 'Alinare', 'Cliente avisos tres');
    await como(db, u.solicitanteAlinare, 'update public.solicitacoes_reverso set nome_cliente = $2 where id = $1', [r.tres.id, 'Cliente avisos tres alterado']);
    const pendentes = (await avisosDoPedido(u.aprovadorAlinare, r.tres.id)).filter((a) => a.evento === 'aprovacao_pendente');
    const v1 = pendentes.find((a) => a.versao === 1);
    const v2 = pendentes.find((a) => a.versao === 2);
    assert.ok(v1?.superado_em, 'versão 1 superada pela alteração');
    assert.ok(v2 && !v2.superado_em, 'versão 2 segue pendente');
  });
});

describe('leitura individual e autoridade', () => {
  it('marcar leitura é individual, não aprova nem altera o pedido', async () => {
    const pendente = (await avisosDoPedido(u.aprovadorAlinare, r.tres.id)).find((a) => a.evento === 'aprovacao_pendente' && !a.superado_em);
    const pedidoAntes = await estadoDoPedido(r.tres.id);
    assert.equal(await marcarLido(u.aprovadorAlinare2, pendente.id), false, 'outra aprovadora não marca o aviso alheio');
    assert.equal(await marcarLido(u.solicitanteNovitah, pendente.id), false, 'outra empresa não marca');
    const antes = await naoLidos(u.aprovadorAlinare);
    assert.equal(await marcarLido(u.aprovadorAlinare, pendente.id), true);
    assert.equal(await naoLidos(u.aprovadorAlinare), antes - 1);
    assert.deepEqual(await estadoDoPedido(r.tres.id), pedidoAntes, 'leitura não aprova, conclui nem altera o pedido');
  });

  it('quem perde a autoridade de decidir deixa de ver a pendência; ao recuperar, volta a ver', async () => {
    const pendentesDe = async (persona) => (await avisosDoPedido(persona, r.tres.id))
      .filter((aviso) => aviso.evento === 'aprovacao_pendente' && !aviso.superado_em);
    await configurar('Alinare', [u.aprovadorAlinare]);
    assert.equal((await avisosDoPedido(u.aprovadorAlinare2, r.tres.id)).length, 0, 'sem autoridade, nem o histórico aparece');
    await configurar('Alinare', [u.aprovadorAlinare, u.aprovadorAlinare2]);
    assert.equal((await pendentesDe(u.aprovadorAlinare2)).length, 1, 'com a autoridade de volta, a pendência volta a valer');
  });
});

describe('eventos depois da decisão: postagem e recebimento', () => {
  it('postagem confirmada e recebimento confirmado geram aviso para o solicitante, sem tarefa pendente', async () => {
    const emissao = (await db.query(
      'select id from public.reversa_emissoes where solicitacao_id = $1 order by sequencia desc limit 1',
      [r.quatro.id]
    )).rows[0];
    await db.query("update public.reversa_emissoes set postagem_confirmada_em = now(), postagem_fonte = 'manual' where id = $1", [emissao.id]);
    await db.query(
      'insert into public.reversa_recebimentos_confirmados (solicitacao_id, confirmado_por_nome) values ($1, $2)',
      [r.quatro.id, 'Recebedora Alinare']
    );
    const eventos = (await avisosDoPedido(u.solicitanteAlinare, r.quatro.id)).map((a) => a.evento);
    assert.ok(eventos.includes('postagem_confirmada'));
    assert.ok(eventos.includes('recebimento_confirmado'));
    assert.equal((await avisosDoPedido(u.solicitanteAlinare, r.quatro.id)).some((a) => a.superado_em), false, 'histórico não vira pendência superada');
  });

  it('o solicitante de outra empresa não vê avisos da Alinare', async () => {
    assert.equal((await avisosDoPedido(u.solicitanteNovitah, r.quatro.id)).length, 0);
    assert.equal(await naoLidos(u.solicitanteNovitah), 0);
  });
});
