// Cadastro oficial por tela (20261028100000): selecionar uma tela concede as operações dela,
// no escopo de empresa e setor cadastrado, e nada além disso. PostgreSQL real, papéis reais
// (authenticated/service_role) e RLS ligada. O que a Edge Function admin-usuarios grava
// (app_metadata + escopo de aprovação) é reproduzido aqui com as mesmas funções do banco.
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { como, criarUsuario, iniciarBanco, migrationsNovas, SERVICE_ROLE } from './lib/banco.mjs';

let banco;
let db;
let c1;
const u = {};
const falha = (promessa) => promessa.then(() => null, (erro) => erro);
const q = async (sql, params) => (await db.query(sql, params)).rows;

/** Conta com o app_metadata que o cadastro grava (perfil, telas e empresas). */
async function conta(nome, { perfil = 'personalizado', telas = [], empresas = [] } = {}) {
  const usuario = await criarUsuario(db, nome, []);
  await db.query('update auth.users set raw_app_meta_data = $2 where id = $1', [
    usuario.id, { provider: 'email', perfil_acesso: perfil, telas, empresas_acesso: empresas, nome },
  ]);
  return usuario;
}

/** O que a Edge Function faz depois de gravar o app_metadata. */
const salvarEscopo = (usuario, configuracao, por = u.admin) => como(c1, SERVICE_ROLE,
  'select public.admin_salvar_escopo_aprovacao_usuario($1, $2::jsonb, $3)', [usuario.id, JSON.stringify(configuracao), por.id]);
const escopoDe = async (usuario) => (await como(c1, SERVICE_ROLE, 'select public.admin_acesso_aprovacao_usuario($1) as r', [usuario.id])).rows[0].r;
const metadados = (usuario, telas, empresas, perfil = 'personalizado') => db.query(
  'update auth.users set raw_app_meta_data = $2 where id = $1',
  [usuario.id, { provider: 'email', perfil_acesso: perfil, telas, empresas_acesso: empresas, nome: usuario.nome }]);

async function pedido(autor, empresa, setor) {
  return (await como(c1, autor, `insert into public.solicitacoes_reverso
    (empresa, data_solicitacao, solicitante, setor, codigo_cliente, nome_cliente, endereco_postagem, motivo)
    values ($1, current_date, 'x', $2, 7001, 'Cliente do cadastro', 'Rua de teste, 1', 'Outros') returning *`, [empresa, setor])).rows[0];
}
const fila = async (persona) => (await como(c1, persona, 'select id, pode_aprovar, proprio_pedido from public.fila_aprovacao_reversas()')).rows;
const idsDaFila = async (persona) => (await fila(persona)).map((linha) => linha.id);
const pedidosVisiveis = async (persona) => (await como(c1, persona, 'select id from public.solicitacoes_reverso')).rows.map((linha) => linha.id);
const aprovar = (persona, p) => como(c1, persona, 'select * from public.aprovar_reversa($1, $2, null)', [p.id, p.aprovacao_versao]);

before(async () => {
  banco = await iniciarBanco();
  db = banco.dono;
  for (const migration of migrationsNovas()) await banco.aplicar(migration);
  c1 = await banco.conectar();
  Object.assign(u, {
    admin: await conta('Admin do cadastro', { telas: ['usuarios'] }),
    autorAlinare: await conta('Autor Alinare cadastro', { telas: ['formulario-alinare'], empresas: ['Alinare'] }),
    autorNovitah: await conta('Autor Novitah cadastro', { telas: ['formulario-novitah'], empresas: ['Novitah'] }),
  });
}, { timeout: 300_000 });

after(async () => { await banco?.encerrar(); });

describe('cadastro por tela: aprovador por empresa e setor', () => {
  it('aprovador de uma empresa e um setor vê e decide só o que está no escopo gravado', async () => {
    const aprovador = await conta('Aprovador Alinare Comercial', { telas: ['aprovar-reversa'], empresas: ['Alinare'] });
    await salvarEscopo(aprovador, [{ empresa: 'Alinare', todos_setores: false, setores: ['Comercial'] }]);
    const dentro = await pedido(u.autorAlinare, 'Alinare', 'Comercial');
    const outroSetor = await pedido(u.autorAlinare, 'Alinare', 'Financeiro');
    const outraEmpresa = await pedido(u.autorNovitah, 'Novitah', 'Comercial');

    const visiveis = await idsDaFila(aprovador);
    assert.ok(visiveis.includes(dentro.id), 'o pedido do escopo aparece na fila');
    assert.ok(!visiveis.includes(outroSetor.id), 'outro setor continua bloqueado');
    assert.ok(!visiveis.includes(outraEmpresa.id), 'outra empresa continua bloqueada');
    assert.equal((await fila(aprovador)).find((linha) => linha.id === dentro.id).pode_aprovar, true);

    // Chamada direta à RPC, sem escopo: recusada pelo banco (não só escondida na tela).
    assert.ok(await falha(aprovar(aprovador, outroSetor)), 'aprovar outro setor direto na API é recusado');
    assert.ok(await falha(aprovar(aprovador, outraEmpresa)), 'aprovar outra empresa direto na API é recusado');
    await aprovar(aprovador, dentro);
    assert.equal((await q('select aprovacao_status from public.solicitacoes_reverso where id = $1', [dentro.id]))[0].aprovacao_status, 'aprovada');
  });

  it('salvar e recarregar preserva as escolhas (empresas, todos os setores e setores específicos)', async () => {
    const aprovador = await conta('Aprovador misto', { telas: ['aprovar-reversa'], empresas: ['Alinare', 'Novitah'] });
    const configuracao = [
      { empresa: 'Alinare', todos_setores: true, setores: [] },
      { empresa: 'Novitah', todos_setores: false, setores: ['Comercial', 'Financeiro'] },
    ];
    await salvarEscopo(aprovador, configuracao);
    assert.deepEqual(await escopoDe(aprovador), configuracao);
    // Salvar de novo a mesma coisa não altera nada nem duplica auditoria.
    const auditoriaAntes = (await q('select count(*)::int as n from public.reversa_aprovadores_setor_auditoria'))[0].n;
    await salvarEscopo(aprovador, configuracao);
    assert.deepEqual(await escopoDe(aprovador), configuracao);
    assert.equal((await q('select count(*)::int as n from public.reversa_aprovadores_setor_auditoria'))[0].n, auditoriaAntes);
    // Mudar uma empresa grava auditoria só dela, com o administrador responsável.
    await salvarEscopo(aprovador, [{ empresa: 'Alinare', todos_setores: true, setores: [] }]);
    assert.deepEqual(await escopoDe(aprovador), [{ empresa: 'Alinare', todos_setores: true, setores: [] }]);
    const ultima = (await q('select empresa, alterado_por from public.reversa_aprovadores_setor_auditoria order by id desc limit 1'))[0];
    assert.equal(ultima.empresa, 'Novitah');
    assert.equal(ultima.alterado_por, u.admin.id);
  });

  it('todos os setores das duas empresas selecionadas, explicitamente', async () => {
    const aprovador = await conta('Aprovador das duas', { telas: ['aprovar-reversa'], empresas: ['Alinare', 'Novitah'] });
    await salvarEscopo(aprovador, [
      { empresa: 'Alinare', todos_setores: true, setores: [] },
      { empresa: 'Novitah', todos_setores: true, setores: [] },
    ]);
    const a = await pedido(u.autorAlinare, 'Alinare', 'Assistência Técnica');
    const n = await pedido(u.autorNovitah, 'Novitah', 'Expedição');
    const visiveis = await idsDaFila(aprovador);
    assert.ok(visiveis.includes(a.id) && visiveis.includes(n.id));
  });

  it('empresa vazia não vira acesso às duas empresas; tela sem escopo gravado não enxerga a fila', async () => {
    const semEmpresa = await conta('Aprovador sem empresa', { telas: ['aprovar-reversa'], empresas: [] });
    const semEscopo = await conta('Aprovador sem escopo', { telas: ['aprovar-reversa'], empresas: ['Alinare'] });
    const p = await pedido(u.autorAlinare, 'Alinare', 'Comercial');
    assert.deepEqual((await idsDaFila(semEmpresa)).filter((id) => id === p.id), []);
    assert.deepEqual((await idsDaFila(semEscopo)).filter((id) => id === p.id), []);
    assert.ok(await falha(aprovar(semEscopo, p)));
    // A RPC também não aceita gravar escopo de empresa fora do cadastro do usuário.
    const erro = await falha(salvarEscopo(semEmpresa, [{ empresa: 'Alinare', todos_setores: true, setores: [] }]));
    assert.equal(erro?.code, '42501');
  });

  it('a RPC recusa escopo inválido e não grava nada pela metade', async () => {
    const aprovador = await conta('Aprovador validação', { telas: ['aprovar-reversa'], empresas: ['Alinare', 'Novitah'] });
    await salvarEscopo(aprovador, [{ empresa: 'Alinare', todos_setores: true, setores: [] }]);
    const antes = await escopoDe(aprovador);
    for (const invalida of [
      [{ empresa: 'Alinare', todos_setores: true, setores: ['Comercial'] }],
      [{ empresa: 'Alinare', todos_setores: false, setores: [] }],
      [{ empresa: 'Alinare', todos_setores: false, setores: ['  '] }],
      [{ empresa: 'Outra', todos_setores: true, setores: [] }],
      [{ empresa: 'Alinare', todos_setores: true, setores: [] }, { empresa: 'Alinare', todos_setores: true, setores: [] }],
      [{ empresa: 'Alinare', todos_setores: true, setores: [] }, { empresa: 'Novitah', todos_setores: false, setores: [] }],
      { empresa: 'Alinare' },
    ]) {
      const erro = await falha(salvarEscopo(aprovador, invalida));
      assert.equal(erro?.code, '22023', JSON.stringify(invalida));
    }
    assert.deepEqual(await escopoDe(aprovador), antes, 'nada foi gravado pela metade');
  });

  it('retirar o acesso bloqueia novas operações e os envios futuros', async () => {
    const aprovador = await conta('Aprovador a revogar', { telas: ['aprovar-reversa'], empresas: ['Alinare'] });
    await salvarEscopo(aprovador, [{ empresa: 'Alinare', todos_setores: true, setores: [] }]);
    const p = await pedido(u.autorAlinare, 'Alinare', 'Comercial');
    assert.ok((await idsDaFila(aprovador)).includes(p.id));
    const aviso = (await q(`select id, status from public.reversa_comunicacoes_etiqueta
      where solicitacao_id = $1 and evento = 'aprovacao_pendente' and destinatario_id = $2`, [p.id, aprovador.id]))[0];
    assert.equal(aviso.status, 'pendente', 'o aprovador do escopo é destinatário do aviso');

    // Como o cadastro faz ao desmarcar Aprovações: metadados primeiro, escopo depois.
    await metadados(aprovador, [], ['Alinare']);
    await salvarEscopo(aprovador, []);
    assert.deepEqual(await escopoDe(aprovador), []);
    assert.deepEqual((await idsDaFila(aprovador)).filter((id) => id === p.id), []);
    assert.ok(await falha(aprovar(aprovador, p)), 'a decisão direta na API é recusada');

    await q(`update public.reversa_comunicacoes_etiqueta set status = 'acao_conector_concluida' where id <> $1 and status = 'pendente'`, [aviso.id]);
    const reserva = (await como(c1, SERVICE_ROLE, 'select public.reversa_claim_comunicacao_etiqueta() as r')).rows[0].r;
    assert.equal(reserva.comunicacao_id, aviso.id);
    const dados = (await como(c1, SERVICE_ROLE, 'select public.reversa_iniciar_comunicacao_etiqueta($1, $2) as d', [reserva.comunicacao_id, reserva.lock_token])).rows[0].d;
    assert.equal(dados, null, 'a revalidação não libera o envio a quem perdeu o acesso');
    assert.equal((await q('select status from public.reversa_comunicacoes_etiqueta where id = $1', [aviso.id]))[0].status, 'aprovacao_indisponivel');
  });

  it('a autoaprovação continua desligada: o pedido próprio aparece, sem poder decidir', async () => {
    const autorAprovador = await conta('Autor e aprovador', { telas: ['formulario-alinare', 'aprovar-reversa'], empresas: ['Alinare'] });
    await salvarEscopo(autorAprovador, [{ empresa: 'Alinare', todos_setores: true, setores: [] }]);
    const proprio = await pedido(autorAprovador, 'Alinare', 'Comercial');
    const linha = (await fila(autorAprovador)).find((item) => item.id === proprio.id);
    assert.ok(linha, 'o pedido próprio aparece na fila');
    assert.equal(linha.proprio_pedido, true);
    assert.equal(linha.pode_aprovar, false);
    assert.ok(await falha(aprovar(autorAprovador, proprio)), 'não aprova o próprio pedido');
    // Quem não é o autor, com o mesmo escopo, decide.
    const outro = await conta('Segundo aprovador', { telas: ['aprovar-reversa'], empresas: ['Alinare'] });
    await salvarEscopo(outro, [{ empresa: 'Alinare', todos_setores: true, setores: [] }]);
    await aprovar(outro, proprio);
  });

  it('o aviso de aprovação vai ao autor do escopo e só a ele; fora do escopo não há destinatário', async () => {
    const dentro = await conta('Aprovador Financeiro', { telas: ['aprovar-reversa'], empresas: ['Alinare'] });
    const fora = await conta('Aprovador Comercial', { telas: ['aprovar-reversa'], empresas: ['Alinare'] });
    await salvarEscopo(dentro, [{ empresa: 'Alinare', todos_setores: false, setores: ['Financeiro'] }]);
    await salvarEscopo(fora, [{ empresa: 'Alinare', todos_setores: false, setores: ['Comercial'] }]);
    const p = await pedido(u.autorAlinare, 'Alinare', 'Financeiro');
    const destinatarios = (await q(`select destinatario_id from public.reversa_comunicacoes_etiqueta
      where solicitacao_id = $1 and evento = 'aprovacao_pendente' and canal = 'teams'`, [p.id])).map((linha) => linha.destinatario_id);
    assert.ok(destinatarios.includes(dentro.id));
    assert.ok(!destinatarios.includes(fora.id));
  });
});

describe('cadastro por tela: demais operações e administração', () => {
  it('emissor de uma empresa e acesso às duas empresas só quando selecionado', async () => {
    const umaEmpresa = await conta('Emissor Alinare', { telas: ['emitir-etiqueta'], empresas: ['Alinare'] });
    const duasEmpresas = await conta('Emissor das duas', { telas: ['emitir-etiqueta'], empresas: ['Alinare', 'Novitah'] });
    const semEmpresa = await conta('Emissor sem empresa', { telas: ['emitir-etiqueta'], empresas: [] });
    const empresasDe = async (persona) => (await como(c1, persona, 'select public.empresas_etiquetaveis() as e')).rows[0].e;
    assert.deepEqual(await empresasDe(umaEmpresa), ['Alinare']);
    assert.deepEqual((await empresasDe(duasEmpresas)).sort(), ['Alinare', 'Novitah']);
    assert.deepEqual(await empresasDe(semEmpresa), []);
    // Emitir não concede aprovar nem consultar o que está fora do escopo.
    assert.deepEqual(await idsDaFila(umaEmpresa), []);
  });

  it('a tela de gestão de usuários não opera nem consulta pedidos e NC; continua administrando', async () => {
    const p = await pedido(u.autorAlinare, 'Alinare', 'Comercial');
    assert.deepEqual((await pedidosVisiveis(u.admin)).filter((id) => id === p.id), [], 'não lê pedidos só por ter a tela usuarios');
    assert.equal((await como(c1, u.admin, 'select public.pode_ver_nc() as v, public.pode_editar_nc() as e')).rows[0].v, false);
    assert.deepEqual(await idsDaFila(u.admin), []);
    assert.ok(await falha(aprovar(u.admin, p)), 'administrador não decide pedidos');
    // Administração preservada: configuração de aprovadores e identidade de administrador.
    assert.equal((await como(c1, u.admin, 'select public.is_admin() as a, public.is_mestre() as m')).rows[0].a, true);
    assert.equal((await como(c1, u.admin, 'select public.is_mestre() as m')).rows[0].m, false);
    await como(c1, u.admin, 'select public.listar_config_aprovadores_reversa()');
    // Com a tela de consulta selecionada, passa a ler, e só isso.
    const consulta = await conta('Admin e consulta', { telas: ['usuarios', 'lista-alinare'], empresas: [] });
    assert.ok((await pedidosVisiveis(consulta)).includes(p.id));
    assert.deepEqual(await idsDaFila(consulta), []);
  });

  it('o perfil mestre explícito mantém acesso total, coerente com as telas e o escopo gravado', async () => {
    const mestre = await conta('Mestre do cadastro', { perfil: 'mestre', empresas: ['Alinare', 'Novitah'],
      telas: ['dashboard-geral', 'lista-geral', 'nc', 'nc-edit', 'aprovar-reversa', 'emitir-etiqueta', 'usuarios', 'formulario-alinare', 'formulario-novitah'] });
    await salvarEscopo(mestre, [
      { empresa: 'Alinare', todos_setores: true, setores: [] },
      { empresa: 'Novitah', todos_setores: true, setores: [] },
    ]);
    const a = await pedido(u.autorAlinare, 'Alinare', 'Comercial');
    const n = await pedido(u.autorNovitah, 'Novitah', 'Comercial');
    const lidos = await pedidosVisiveis(mestre);
    assert.ok(lidos.includes(a.id) && lidos.includes(n.id));
    assert.equal((await como(c1, mestre, 'select public.pode_ver_nc() as v')).rows[0].v, true);
    assert.ok((await idsDaFila(mestre)).includes(a.id));
    await aprovar(mestre, a);
  });

  it('perfil pronto e personalizado seguem a mesma regra efetiva', async () => {
    const pronto = await conta('Aprovador perfil pronto', { perfil: 'aprovador', telas: ['aprovar-reversa'], empresas: ['Alinare'] });
    const personalizado = await conta('Aprovador personalizado', { perfil: 'personalizado', telas: ['aprovar-reversa'], empresas: ['Alinare'] });
    const escopo = [{ empresa: 'Alinare', todos_setores: true, setores: [] }];
    await salvarEscopo(pronto, escopo);
    await salvarEscopo(personalizado, escopo);
    const p = await pedido(u.autorAlinare, 'Alinare', 'Expedição');
    const outra = await pedido(u.autorNovitah, 'Novitah', 'Expedição');
    for (const persona of [pronto, personalizado]) {
      const ids = await idsDaFila(persona);
      assert.ok(ids.includes(p.id));
      assert.ok(!ids.includes(outra.id));
    }
  });

  it('só o serviço grava escopo; usuário comum e administrador não alteram permissões pela API', async () => {
    const alvo = await conta('Alvo da escalada', { telas: ['aprovar-reversa'], empresas: ['Alinare'] });
    for (const persona of [u.autorAlinare, u.admin]) {
      const erro = await falha(como(c1, persona, 'select public.admin_salvar_escopo_aprovacao_usuario($1, $2::jsonb, $3)', [alvo.id, '[]', persona.id]));
      assert.equal(erro?.code, '42501');
      const leitura = await falha(como(c1, persona, 'select public.admin_acesso_aprovacao_usuario($1)', [alvo.id]));
      assert.equal(leitura?.code, '42501');
    }
    // Usuário comum não consulta nem altera a configuração de aprovadores...
    assert.equal((await falha(como(c1, u.autorAlinare, 'select public.listar_config_aprovadores_reversa()')))?.code, '42501');
    assert.equal((await falha(como(c1, u.autorAlinare, "select public.salvar_config_aprovadores_reversa('Alinare', '[]'::jsonb)")))?.code, '42501');
    // ...nem consegue se conceder telas: auth.users não é acessível pela API.
    const direto = await falha(como(c1, u.autorAlinare,
      `update auth.users set raw_app_meta_data = jsonb_build_object('telas', jsonb_build_array('usuarios', 'aprovar-reversa')) where id = $1`, [u.autorAlinare.id]));
    assert.ok(direto, 'atualizar o próprio app_metadata pela API é recusado');
    assert.equal((await como(c1, u.autorAlinare, 'select public.is_admin() as a')).rows[0].a, false);
  });

  it('gravar o escopo não altera pedidos existentes nem enfileira avisos retroativos de decisões já tomadas', async () => {
    const antes = (await q('select count(*)::int as n from public.solicitacoes_reverso'))[0].n;
    const decididos = (await q(`select count(*)::int as n from public.solicitacoes_reverso where aprovacao_status <> 'aguardando_aprovacao'`))[0].n;
    const novo = await conta('Aprovador sem retroativo', { telas: ['aprovar-reversa'], empresas: ['Alinare'] });
    await salvarEscopo(novo, [{ empresa: 'Alinare', todos_setores: true, setores: [] }]);
    assert.equal((await q('select count(*)::int as n from public.solicitacoes_reverso'))[0].n, antes);
    assert.equal((await q(`select count(*)::int as n from public.solicitacoes_reverso where aprovacao_status <> 'aguardando_aprovacao'`))[0].n, decididos);
    const avisosDecididos = (await q(`select count(*)::int as n from public.reversa_comunicacoes_etiqueta c
      join public.solicitacoes_reverso r on r.id = c.solicitacao_id
      where c.destinatario_id = $1 and r.aprovacao_status <> 'aguardando_aprovacao'`, [novo.id]))[0].n;
    assert.equal(avisosDecididos, 0);
  });
});

describe('cadastro por tela: Storage da etiqueta e telas de consulta', () => {
  const inserirPdf = (persona, caminho) => como(c1, persona, "insert into storage.objects (bucket_id, name) values ('etiquetas', $1)", [caminho]);
  const lerPdf = async (persona, caminho) => (await como(c1, persona, 'select count(*)::int as n from storage.objects where name = $1', [caminho])).rows[0].n;

  it('o PDF só entra pela tela de emissão, na empresa marcada, e só quem lê o pedido o vê', async () => {
    const aprovador = await conta('Aprovador do PDF', { telas: ['aprovar-reversa'], empresas: ['Alinare', 'Novitah'] });
    await salvarEscopo(aprovador, [
      { empresa: 'Alinare', todos_setores: true, setores: [] },
      { empresa: 'Novitah', todos_setores: true, setores: [] },
    ]);
    const emissorAlinare = await conta('Emissor do PDF Alinare', { telas: ['emitir-etiqueta'], empresas: ['Alinare'] });
    const emissorSemEmpresa = await conta('Emissor do PDF sem empresa', { telas: ['emitir-etiqueta'], empresas: [] });
    const gestao = await conta('Gestão sem pedidos', { telas: ['usuarios'] });
    const consulta = await conta('Consulta Alinare', { telas: ['lista-alinare', 'dashboard-alinare'] });
    const alinare = await pedido(u.autorAlinare, 'Alinare', 'Comercial');
    const novitah = await pedido(u.autorNovitah, 'Novitah', 'Comercial');
    await aprovar(aprovador, alinare);
    await aprovar(aprovador, novitah);

    const caminhoAlinare = `${alinare.id}/etiqueta.pdf`;
    const caminhoNovitah = `${novitah.id}/etiqueta.pdf`;
    await inserirPdf(emissorAlinare, caminhoAlinare);
    for (const [persona, caminho] of [
      [emissorAlinare, caminhoNovitah],      // outra empresa
      [emissorSemEmpresa, caminhoAlinare],   // tela sem empresa marcada
      [gestao, caminhoNovitah],              // gestão de usuários não emite
      [consulta, caminhoNovitah],            // consulta não emite
      [aprovador, caminhoNovitah],           // aprovar não emite
    ]) {
      const erro = await falha(inserirPdf(persona, caminho));
      assert.match(erro?.message ?? '', /row-level security/);
    }

    assert.equal(await lerPdf(emissorAlinare, caminhoAlinare), 1, 'a emissora vê o PDF do pedido da empresa dela');
    assert.equal(await lerPdf(consulta, caminhoAlinare), 1, 'quem consulta a empresa lê o PDF, sem poder alterá-lo');
    assert.equal(await lerPdf(gestao, caminhoAlinare), 0, 'gestão de usuários não lê o PDF de pedidos');
    assert.equal(await lerPdf(u.autorNovitah, caminhoAlinare), 0, 'quem não é da empresa não lê');
    assert.equal((await como(c1, consulta, 'delete from storage.objects where name = $1 returning id', [caminhoAlinare])).rows.length, 0);
  });

  it('Dashboard e Pedidos só consultam: não aprovam, não emitem e não recebem', async () => {
    const dashboard = await conta('Dashboard geral', { telas: ['dashboard-geral', 'lista-geral'], empresas: ['Alinare', 'Novitah'] });
    const p = await pedido(u.autorAlinare, 'Alinare', 'Comercial');
    assert.ok((await pedidosVisiveis(dashboard)).includes(p.id), 'consulta as duas empresas');
    assert.deepEqual(await idsDaFila(dashboard), []);
    assert.ok(await falha(aprovar(dashboard, p)));
    const emitir = await como(c1, dashboard, 'select public.empresas_etiquetaveis() as e, public.empresas_checkin() as c, public.empresas_recebimento_manual() as r');
    assert.deepEqual(emitir.rows[0], { e: [], c: [], r: [] });
    // Mesmo com empresas marcadas, empresas_acesso sozinho não concede operação: falta a tela.
    assert.deepEqual((await como(c1, dashboard, 'select public.empresas_aprovaveis() as a')).rows[0].a, []);
  });

  it('o cadastro do Formulário de uma empresa só solicita nela', async () => {
    const solicitante = await conta('Solicitante Novitah apenas', { telas: ['formulario-novitah'] });
    const ok = await pedido(solicitante, 'Novitah', 'Comercial');
    assert.ok(ok.id);
    assert.ok(await falha(pedido(solicitante, 'Alinare', 'Comercial')), 'não registra na outra empresa');
    assert.deepEqual(await idsDaFila(solicitante), []);
  });
});
