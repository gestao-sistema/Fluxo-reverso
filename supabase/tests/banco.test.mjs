// Testes do banco: migrations, RLS, triggers e funções, num PostgreSQL 17 local
// e temporário (embedded-postgres) com os stubs do Supabase.
// Uso: cd supabase/tests && npm ci && npm test
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  ANON,
  SERVICE_ROLE,
  como,
  criarUsuario,
  esperarBloqueio,
  iniciarBanco,
  iniciarSessao,
  migrationsNovas,
} from './lib/banco.mjs';

const MIGRATION_APROVACAO = '20261023100000_aprovacao_reversas.sql';
const MIGRATION_FILA_APROVACAO_ATUALIZADA = '20261023130000_motivos_reverso_endereco_troca.sql';
const MIGRATION_APROVADORES_EMPRESA_SETOR = '20261023190000_aprovadores_empresa_setor.sql';

let banco;
let db; // dono do banco: prepara dados e confere resultados sem RLS
let c1; // conexão dos usuários nos testes sequenciais
const u = {};
const legado = {};
const nc = {};

const q = async (sql, params) => (await db.query(sql, params)).rows;
const um = async (sql, params) => (await q(sql, params))[0];
const falha = (promessa) => promessa.then(() => null, (erro) => erro);

const INSERIR_REVERSA = `insert into public.solicitacoes_reverso
  (empresa, data_solicitacao, solicitante, setor, codigo_cliente, nome_cliente, endereco_postagem, motivo, nc_id)
  values ($1, current_date, 'Fulana', 'Financeiro', 77, $3, 'Rua B, 2', 'Outros', $2)
  returning *`;

const novaReversa = async (persona, empresa, ncId, cliente = 'Cliente Teste') =>
  (await como(c1, persona, INSERIR_REVERSA, [empresa, ncId, cliente])).rows[0];
const aprovar = (persona, id, versao, observacao = null, conexao = c1) =>
  como(conexao, persona, 'select * from public.aprovar_reversa($1, $2, $3)', [id, versao, observacao]);
const rejeitar = (persona, id, versao, justificativa, conexao = c1) =>
  como(conexao, persona, 'select * from public.rejeitar_reversa($1, $2, $3)', [id, versao, justificativa]);
const fila = async (persona) => (await como(c1, persona, 'select * from public.fila_aprovacao_reversas()')).rows;
const configAprovadores = (persona, empresa, configuracao) =>
  como(c1, persona, 'select public.salvar_config_aprovadores_reversa($1, $2::jsonb)', [empresa, JSON.stringify(configuracao)]);
const aprovadorEspecifico = (usuario, setores) => ({ usuario_id: usuario.id, todos_setores: false, setores });
const aprovadorTodosSetores = (usuario) => ({ usuario_id: usuario.id, todos_setores: true, setores: [] });
const novaReversaSetor = async (persona, empresa, setor, nome = 'Cliente Setor') => (
  await como(c1, persona, `insert into public.solicitacoes_reverso
    (empresa, data_solicitacao, solicitante, setor, codigo_cliente, nome_cliente, endereco_postagem, motivo, nc_id)
    values ($1, current_date, 'Fulana', $2, 77, $3, 'Rua B, 2', 'Outros', $4) returning *`,
  [empresa, setor, nome, nc[empresa.toLowerCase()].id])
).rows[0];
const reversa = (id) => um('select * from public.solicitacoes_reverso where id = $1', [id]);
const eventos = (id) =>
  q('select * from public.solicitacoes_aprovacoes where solicitacao_id = $1 order by created_at, versao, evento', [id]);
const atualizar = (persona, id, campos) => {
  const colunas = Object.keys(campos);
  const sets = colunas.map((coluna, i) => `${coluna} = $${i + 2}`).join(', ');
  return como(c1, persona, `update public.solicitacoes_reverso set ${sets} where id = $1 returning *`, [
    id,
    ...Object.values(campos),
  ]);
};
const verificar = async (persona, id) =>
  (await como(c1, persona, 'select * from public.verificar_operacao_logistica($1)', [id])).rows[0];
const exigir = (persona, id, versao = null) =>
  como(c1, persona, 'select public.exigir_operacao_logistica($1, $2) as versao', [id, versao]);

before(
  async () => {
    banco = await iniciarBanco();
    db = banco.dono;

    // Antes das migrations novas: permissões em user_metadata e reversas antigas
    for (const [chave, metadados] of Object.entries({
      adminAntigo: { nome: 'Admin', telas: ['usuarios'] },
      expedicaoAntiga: { nome: 'Exp', perfil: 'Expedicao' },
      multiAntigo: { nome: 'Multi', telas: ['formulario-alinare', 'formulario-novitah'] },
      semTelasAntigo: { nome: 'Sem' },
    })) {
      legado[chave] = (
        await um('insert into auth.users (email, raw_user_meta_data) values ($1, $2) returning id', [
          `${chave}@cr.internal`,
          metadados,
        ])
      ).id;
    }
    // Contas que já tinham capacidade de aprovação antes da migration nova.
    legado.aprovadorComercialExistente = (await um(
      `insert into auth.users (email, raw_app_meta_data) values ($1, $2) returning id`,
      ['aprovador-existente@cr.internal', { telas: ['aprovar-reversa'], empresas_acesso: ['Alinare'] }]
    )).id;
    legado.gestorSemAprovacaoExistente = (await um(
      `insert into auth.users (email, raw_app_meta_data) values ($1, $2) returning id`,
      ['gestor-sem-aprovacao@cr.internal', { telas: ['usuarios', 'lista-geral'], empresas_acesso: ['Alinare', 'Novitah'] }]
    )).id;
    const inserirAntiga = (empresa, autorizacao, status, rastreio = null) =>
      um(
        `insert into public.solicitacoes_reverso
          (empresa, data_solicitacao, solicitante, setor, codigo_cliente, nome_cliente, endereco_postagem, motivo, autorizacao, status, codigo_rastreio)
          values ($1, current_date, 'Fulana', 'Financeiro', 1, 'Cliente antiga', 'Rua A, 1', 'Outros', $2, $3, $4)
          returning id`,
        [empresa, autorizacao, status, rastreio]
      );
    legado.alinarePendente = (await inserirAntiga('Alinare', 'Autorizadora Declarada A', 'pendente')).id;
    legado.novitahPostado = (await inserirAntiga('Novitah', 'Autorizador Declarado B', 'postado', 'AA000000001BR')).id;
    legado.paraApagar = (await inserirAntiga('Alinare', 'Autorizadora Declarada A', 'pendente')).id;

    // Usuários com capacidade existente antes da migration de compatibilidade.
    Object.assign(u, {
      aprovadorAlinare: await criarUsuario(db, 'Aprovadora Alinare', ['aprovar-alinare']),
      aprovadorAlinare2: await criarUsuario(db, 'Segunda Aprovadora Alinare', ['aprovar-alinare']),
      aprovadorNovitah: await criarUsuario(db, 'Aprovador Novitah', ['aprovar-novitah']),
      solicitanteAprovador: await criarUsuario(db, 'Solicita e Aprova Alinare', ['formulario-alinare', 'aprovar-alinare']),
      operadorAprovador: await criarUsuario(db, 'Opera e Aprova Alinare', ['lista-alinare', 'aprovar-alinare']),
    });

    // Migrations anteriores à aprovação e uma reversa criada nesse intervalo
    // (já com NC, ainda com autorizador declarado)
    for (const arquivo of migrationsNovas().filter((f) => f < MIGRATION_APROVACAO)) await banco.aplicar(arquivo);
    legado.ncAntiga = await um(
      `insert into public.nao_conformidades (empresa, cliente, origem, status, data_ocorrencia)
       values ('Alinare', 'Cliente era NC', 'Outro', 'Aberta', current_date) returning id, numero`
    );
    legado.comNc = (
      await um(
        `insert into public.solicitacoes_reverso
          (empresa, data_solicitacao, solicitante, setor, codigo_cliente, nome_cliente, endereco_postagem, motivo, autorizacao, nc_id, status)
          values ('Alinare', current_date, 'Fulana', 'Financeiro', 2, 'Cliente era NC', 'Rua C, 3', 'Outros', 'Autorizadora Declarada C', $1, 'pendente')
          returning id`,
        [legado.ncAntiga.id]
      )
    ).id;

    // Em aguardando aprovação: o status só existe nas migrations do modelo antigo (aplicadas acima)
    legado.aguardandoAntiga = (await inserirAntiga('Alinare', 'Autorizadora Declarada D', 'aguardando_aprovacao')).id;

    for (const arquivo of migrationsNovas().filter((f) => f >= MIGRATION_APROVACAO)) await banco.aplicar(arquivo);
    // A sequência acima valida a atualização da base antiga para o contrato atual.
    // Não reaplicar a migration antiga de aprovação após 23130000: ela declara a
    // assinatura anterior de fila_aprovacao_reversas() e o CREATE OR REPLACE não
    // pode desfazer a coluna adicionada pela migration posterior.

    c1 = await banco.conectar();
    Object.assign(u, {
      admin: await criarUsuario(db, 'Administradora', ['usuarios']),
      // Apagar reversa é função administrativa, mas só vale sobre o que a pessoa enxerga: precisa da tela Pedidos.
      adminPedidos: await criarUsuario(db, 'Administradora com Pedidos', ['usuarios', 'lista-geral']),
      solicitanteAlinare: await criarUsuario(db, 'Solicitante Alinare', ['formulario-alinare']),
      solicitanteNovitah: await criarUsuario(db, 'Solicitante Novitah', ['formulario-novitah']),
      solicitanteAmbas: await criarUsuario(db, 'Solicitante Ambas', ['formulario-alinare', 'formulario-novitah']),
      solicitanteOperador: await criarUsuario(db, 'Solicita e Opera Alinare', ['formulario-alinare', 'lista-alinare']),
      gestorGeral: await criarUsuario(db, 'Gestor Geral', ['dashboard-geral', 'lista-geral', 'kanban-edit', 'nc']),
      expedicao: await criarUsuario(db, 'Expedicao', ['lista-geral', 'kanban-edit']),
      listaAlinareNc: await criarUsuario(db, 'Lista Alinare', ['lista-alinare', 'nc']),
      listaNovitah: await criarUsuario(db, 'Lista Novitah', ['lista-novitah']),
      consultaNc: await criarUsuario(db, 'Consulta NC', ['nc']),
      editorNc: await criarUsuario(db, 'Editora NC', ['nc-edit']),
      semTelas: await criarUsuario(db, 'Sem Telas', []),
      // Operação de emissão e de postagem (capacidades próprias, por empresa)
      emissorAlinare: await criarUsuario(db, 'Emissora Alinare', ['emitir-alinare']),
      checkinAlinare: await criarUsuario(db, 'Postagem Alinare', ['confirmar-alinare']),
      emissorNovitah: await criarUsuario(db, 'Emissora Novitah', ['emitir-novitah']),
    });

    const novaNc = async (empresa, cliente) =>
      (
        await como(
          c1,
          u.editorNc,
          `insert into public.nao_conformidades (empresa, cliente, origem, status, data_ocorrencia)
           values ($1, $2, 'Erro expedição – endereço incorreto', 'Aberta', current_date) returning *`,
          [empresa, cliente]
        )
      ).rows[0];
    nc.alinare = await novaNc('Alinare', 'Cliente NC Alinare');
    nc.novitah = await novaNc('Novitah', 'Cliente NC Novitah');
  },
  { timeout: 300_000 }
);

after(async () => {
  await banco?.encerrar();
});

// ─────────────────────────────────────────────────────────────────────────────
describe('aprovação — legado e migração', () => {
  it('reversas anteriores viram legado, sem decisão inventada e com o autorizador declarado preservado', async () => {
    for (const id of [legado.alinarePendente, legado.novitahPostado, legado.comNc]) {
      const r = await reversa(id);
      assert.equal(r.aprovacao_legada, true);
      assert.equal(r.aprovacao_status, null);
      assert.equal(r.aprovacao_decidida_por, null);
      assert.equal((await eventos(id)).length, 0, 'nenhum evento de aprovação para o legado');
    }
    const aguardandoAntiga = await reversa(legado.aguardandoAntiga);
    assert.equal(aguardandoAntiga.aprovacao_status, 'aguardando_aprovacao');
    assert.equal(aguardandoAntiga.aprovacao_legada, false);
    assert.equal((await reversa(legado.alinarePendente)).autorizacao, 'Autorizadora Declarada A');
    assert.equal((await reversa(legado.comNc)).autorizacao, 'Autorizadora Declarada C');
  });

  it('autorizacao deixou de ser obrigatória', async () => {
    const col = await um(
      `select is_nullable from information_schema.columns
       where table_schema = 'public' and table_name = 'solicitacoes_reverso' and column_name = 'autorizacao'`
    );
    assert.equal(col.is_nullable, 'YES');
  });

  it('compatibilidade mantém todos os setores apenas para quem já tinha a capacidade e a empresa', async () => {
    const autorizada = await um(
      `select empresa, todos_setores, setores from public.reversa_aprovadores_setor where usuario_id = $1`,
      [legado.aprovadorComercialExistente]
    );
    assert.deepEqual(autorizada, { empresa: 'Alinare', todos_setores: true, setores: [] });
    const personaCompatibilidade = {
      nome: 'Aprovador antigo autorizado', papel: 'authenticated',
      claims: { sub: legado.aprovadorComercialExistente, role: 'authenticated' },
    };
    const pedido = await novaReversaSetor(u.solicitanteAlinare, 'Alinare', 'Financeiro', 'Pedido compatibilidade');
    assert.ok((await fila(personaCompatibilidade)).some((item) => item.id === pedido.id));
    const semCapacidade = await um(
      `select count(*)::int as total from public.reversa_aprovadores_setor where usuario_id = $1`,
      [legado.gestorSemAprovacaoExistente]
    );
    assert.equal(semCapacidade.total, 0, 'gestor e lista geral não viram aprovadores');
    assert.equal((await um(
      `select count(*)::int as total from public.reversa_aprovadores_setor where usuario_id = $1`,
      [legado.adminAntigo]
    )).total, 0, 'admin sem capacidade de aprovação não é promovido');
  });

  it('reaplicar a migration que atualiza a fila preserva pedidos novos, assinatura e privilégios', async () => {
    const r = await novaReversa(u.solicitanteAlinare, 'Alinare', nc.alinare.id, 'Cliente reaplicação');
    await banco.aplicar(MIGRATION_FILA_APROVACAO_ATUALIZADA);
    // O replay de uma migration histórica é artificial; reaplica a definição
    // vigente para não deixar a fila no contrato anterior por empresa apenas.
    await banco.aplicar(MIGRATION_APROVADORES_EMPRESA_SETOR);
    const depois = await reversa(r.id);
    assert.equal(depois.aprovacao_status, 'aguardando_aprovacao');
    assert.equal(depois.aprovacao_legada, false);

    const filaAtualizada = await um(`
      select pg_get_function_result('public.fila_aprovacao_reversas()'::regprocedure) as retorno,
             has_function_privilege('authenticated', 'public.fila_aprovacao_reversas()', 'EXECUTE') as authenticated,
             has_function_privilege('anon', 'public.fila_aprovacao_reversas()', 'EXECUTE') as anon
    `);
    assert.match(filaAtualizada.retorno, /endereco_destino_troca/);
    assert.equal(filaAtualizada.authenticated, true);
    assert.equal(filaAtualizada.anon, false);
  });
});

describe('aprovação — escopo por empresa e setor', () => {
  after(async () => {
    await configAprovadores(u.admin, 'Alinare', [
      u.aprovadorAlinare, u.aprovadorAlinare2, u.solicitanteAprovador, u.operadorAprovador,
    ].map(aprovadorTodosSetores));
    await configAprovadores(u.admin, 'Novitah', [u.aprovadorNovitah].map(aprovadorTodosSetores));
  });

  it('aprovador do Comercial não vê nem decide pedido do Financeiro sem configuração', async () => {
    const comercial = await novaReversaSetor(u.solicitanteAlinare, 'Alinare', 'Comercial Alinare', 'Pedido Comercial isolado');
    const financeiro = await novaReversaSetor(u.solicitanteAlinare, 'Alinare', 'Financeiro', 'Pedido Financeiro isolado');
    await configAprovadores(u.admin, 'Alinare', [aprovadorEspecifico(u.aprovadorAlinare, ['Comercial Alinare'])]);

    const itens = await fila(u.aprovadorAlinare);
    assert.ok(itens.some((item) => item.id === comercial.id));
    assert.ok(!itens.some((item) => item.id === financeiro.id));
    const erro = await falha(aprovar(u.aprovadorAlinare, financeiro.id, financeiro.aprovacao_versao));
    assert.equal(erro?.code, '42501');
    assert.equal((await reversa(financeiro.id)).aprovacao_status, 'aguardando_aprovacao');
  });

  it('capacidade de uma empresa não permite decidir pela outra', async () => {
    const novitah = await novaReversaSetor(u.solicitanteNovitah, 'Novitah', 'Comercial Novitah', 'Pedido Novitah isolado');
    await configAprovadores(u.admin, 'Alinare', [aprovadorEspecifico(u.aprovadorAlinare, ['Comercial Alinare'])]);
    const erro = await falha(aprovar(u.aprovadorAlinare, novitah.id, novitah.aprovacao_versao));
    assert.equal(erro?.code, '42501');
    assert.ok(!(await fila(u.aprovadorAlinare)).some((item) => item.id === novitah.id));
  });

  it('uma decisão válida basta quando duas pessoas estão habilitadas', async () => {
    const pedido = await novaReversaSetor(u.solicitanteAlinare, 'Alinare', 'Comercial Alinare', 'Pedido com dois aprovadores');
    await configAprovadores(u.admin, 'Alinare', [
      aprovadorEspecifico(u.aprovadorAlinare, ['Comercial Alinare']),
      aprovadorEspecifico(u.aprovadorAlinare2, ['Comercial Alinare']),
    ]);
    assert.ok((await fila(u.aprovadorAlinare2)).some((item) => item.id === pedido.id));
    await aprovar(u.aprovadorAlinare, pedido.id, pedido.aprovacao_versao);
    assert.equal((await reversa(pedido.id)).aprovacao_status, 'aprovada');
    assert.equal((await eventos(pedido.id)).length, 1);
    const segunda = await falha(aprovar(u.aprovadorAlinare2, pedido.id, pedido.aprovacao_versao));
    assert.equal(segunda?.code, '55000', 'a segunda pessoa não é exigida nem gera outra decisão');
  });

  it('usuário comum não pode conceder permissão nem alterar o escopo', async () => {
    const antes = await um('select count(*)::int as total from public.reversa_aprovadores_setor where empresa = $1', ['Alinare']);
    const erro = await falha(configAprovadores(u.solicitanteAlinare, 'Alinare', [
      aprovadorEspecifico(u.solicitanteAlinare, ['Financeiro']),
    ]));
    assert.equal(erro?.code, '42501');
    const adminSemCapacidade = await falha(configAprovadores(u.admin, 'Alinare', [
      aprovadorEspecifico(u.admin, ['Financeiro']),
    ]));
    assert.equal(adminSemCapacidade?.code, '42501', 'admin sem capacidade não se concede aprovação');
    const consultaComum = await falha(como(c1, u.solicitanteAlinare, 'select * from public.listar_config_aprovadores_reversa()'));
    assert.equal(consultaComum?.code, '42501', 'usuário comum não lista a configuração administrativa');
    const leituraDireta = await falha(como(c1, u.admin, 'select * from public.reversa_aprovadores_setor'));
    assert.equal(leituraDireta?.code, '42501', 'as tabelas de configuração não são expostas diretamente');
    const depois = await um('select count(*)::int as total from public.reversa_aprovadores_setor where empresa = $1', ['Alinare']);
    assert.equal(depois.total, antes.total);
  });

  it('grava auditoria do administrador, horário e configuração anterior e nova', async () => {
    const antes = await um('select count(*)::int as total from public.reversa_aprovadores_setor_auditoria where empresa = $1', ['Alinare']);
    await configAprovadores(u.admin, 'Alinare', [aprovadorEspecifico(u.aprovadorAlinare, ['Financeiro'])]);
    const evento = await um(
      `select alterado_por, alterado_por_nome, alterado_em, configuracao_anterior, configuracao_nova
       from public.reversa_aprovadores_setor_auditoria where empresa = 'Alinare' order by id desc limit 1`
    );
    assert.equal(evento.alterado_por, u.admin.id);
    assert.equal(evento.alterado_por_nome, 'Administradora');
    assert.ok(evento.alterado_em);
    assert.ok(Array.isArray(evento.configuracao_anterior));
    assert.deepEqual(evento.configuracao_nova[0].setores, ['Financeiro']);
    const depois = await um('select count(*)::int as total from public.reversa_aprovadores_setor_auditoria where empresa = $1', ['Alinare']);
    assert.equal(depois.total, antes.total + 1);
  });

  it('retirar a autorização bloqueia a decisão já aberta e mantém o pedido pendente', async () => {
    const pedido = await novaReversaSetor(u.solicitanteAlinare, 'Alinare', 'Comercial Alinare', 'Pedido autorização retirada');
    await configAprovadores(u.admin, 'Alinare', [aprovadorEspecifico(u.aprovadorAlinare, ['Comercial Alinare'])]);
    assert.ok((await fila(u.aprovadorAlinare)).some((item) => item.id === pedido.id));
    await configAprovadores(u.admin, 'Alinare', []);
    const erro = await falha(aprovar(u.aprovadorAlinare, pedido.id, pedido.aprovacao_versao));
    assert.equal(erro?.code, '42501');
    assert.equal((await reversa(pedido.id)).aprovacao_status, 'aguardando_aprovacao');
  });

  it('sem aprovador, a fila continua vazia e a solicitação permanece aguardando', async () => {
    const pedido = await novaReversaSetor(u.solicitanteAlinare, 'Alinare', 'Financeiro', 'Pedido sem configuração');
    await configAprovadores(u.admin, 'Alinare', []);
    assert.equal((await fila(u.aprovadorAlinare)).some((item) => item.id === pedido.id), false);
    assert.equal((await reversa(pedido.id)).aprovacao_status, 'aguardando_aprovacao');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('aprovação — criação da solicitação', () => {
  it('nasce aguardando aprovação, mesmo com campos de aprovação e de expedição forjados', async () => {
    const forjada = (
      await como(
        c1,
        u.solicitanteAlinare,
        `insert into public.solicitacoes_reverso
          (empresa, data_solicitacao, solicitante, setor, codigo_cliente, nome_cliente, endereco_postagem, motivo, nc_id,
           autorizacao, aprovacao_status, aprovacao_legada, aprovacao_versao, aprovacao_decidida_por, aprovacao_decidida_por_nome,
           aprovacao_decidida_em, solicitado_por, status, codigo_rastreio, etiqueta_path, concluido_em, created_at)
          values ('Alinare', current_date, 'Fulana', 'Financeiro', 77, 'Cliente Forjada', 'Rua B, 2', 'Outros', $1,
           'Autorizadora Declarada A', 'aprovada', true, 9, $2, 'Outra Pessoa',
           now(), $2, 'concluido', 'AA999999999BR', 'x/etiqueta.pdf', now(), '2020-01-01')
          returning *`,
        [nc.alinare.id, u.aprovadorAlinare.id]
      )
    ).rows[0];
    assert.equal(forjada.aprovacao_status, 'aguardando_aprovacao');
    assert.equal(forjada.aprovacao_legada, false);
    assert.equal(forjada.aprovacao_versao, 1);
    assert.equal(forjada.aprovacao_decidida_por, null);
    assert.equal(forjada.aprovacao_decidida_por_nome, null);
    assert.equal(forjada.autorizacao, null);
    assert.equal(forjada.solicitado_por, u.solicitanteAlinare.id);
    assert.equal(forjada.solicitado_por_nome, 'Solicitante Alinare');
    assert.equal(forjada.status, 'pendente');
    assert.equal(forjada.codigo_rastreio, null);
    assert.equal(forjada.etiqueta_path, null);
    assert.equal(forjada.concluido_em, null);
    assert.ok(Date.now() - new Date(forjada.created_at).getTime() < 60_000, 'created_at é do servidor');
  });

  it('backend (service_role) também cria aguardando aprovação', async () => {
    const r = (
      await como(
        c1,
        SERVICE_ROLE,
        `insert into public.solicitacoes_reverso
          (empresa, data_solicitacao, solicitante, setor, codigo_cliente, nome_cliente, endereco_postagem, motivo, nc_id, aprovacao_status)
          values ('Alinare', current_date, 'Integração', 'Financeiro', 5, 'Cliente Backend', 'Rua D, 4', 'Outros', $1, 'aprovada')
          returning *`,
        [nc.alinare.id]
      )
    ).rows[0];
    assert.equal(r.aprovacao_status, 'aguardando_aprovacao');
    assert.equal(r.solicitado_por, null);
  });

  it('quem não tem o formulário da empresa não solicita', async () => {
    const erro = await falha(novaReversa(u.solicitanteAlinare, 'Novitah', nc.novitah.id));
    assert.ok(erro, 'insert recusado');
    assert.match(erro.message, /row-level security|Sem permissão para registrar/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('aprovação — fila e acesso por empresa', () => {
  let alinare;
  let novitah;

  before(async () => {
    alinare = await novaReversa(u.solicitanteAlinare, 'Alinare', nc.alinare.id, 'Cliente Fila Alinare');
    novitah = await novaReversa(u.solicitanteNovitah, 'Novitah', nc.novitah.id, 'Cliente Fila Novitah');
  });

  it('fila do aprovador da Alinare só tem reversas da Alinare aguardando, com o contexto da NC', async () => {
    const itens = await fila(u.aprovadorAlinare);
    assert.ok(itens.length > 0);
    assert.ok(itens.every((item) => item.empresa === 'Alinare'));
    const item = itens.find((i) => i.id === alinare.id);
    assert.ok(item, 'reversa da Alinare na fila');
    assert.equal(item.nc_codigo, `NC-${String(nc.alinare.numero).padStart(4, '0')}`);
    assert.equal(item.nc_origem, 'Erro expedição – endereço incorreto');
    assert.equal(item.solicitado_por_nome, 'Solicitante Alinare');
    assert.equal(item.aprovacao_versao, 1);
    assert.equal(item.pode_aprovar, true);
    assert.ok(!itens.some((i) => i.id === legado.alinarePendente), 'legado não entra na fila');
  });

  it('fila do aprovador da Novitah só tem reversas da Novitah', async () => {
    const itens = await fila(u.aprovadorNovitah);
    assert.ok(itens.some((i) => i.id === novitah.id));
    assert.ok(itens.every((i) => i.empresa === 'Novitah'));
  });

  it('dashboard, lista, kanban, NC e admin não dão acesso à fila', async () => {
    for (const persona of [u.gestorGeral, u.admin, u.solicitanteAmbas, u.consultaNc, u.semTelas]) {
      assert.equal((await fila(persona)).length, 0, `${persona.nome} não aprova`);
    }
  });

  it('quem aprova uma empresa consulta só as reversas dela', async () => {
    const vistas = (await como(c1, u.aprovadorAlinare, 'select empresa from public.solicitacoes_reverso')).rows;
    assert.ok(vistas.length > 0);
    assert.ok(vistas.every((r) => r.empresa === 'Alinare'));
  });

  it('aprovador de outra empresa, gestor, admin e solicitante não aprovam', async () => {
    for (const persona of [u.aprovadorNovitah, u.gestorGeral, u.admin, u.solicitanteAlinare, u.expedicao]) {
      const erro = await falha(aprovar(persona, alinare.id, 1));
      assert.equal(erro?.code, '42501', `${persona.nome} não aprova a Alinare`);
    }
    assert.equal((await reversa(alinare.id)).aprovacao_status, 'aguardando_aprovacao');
    assert.equal((await eventos(alinare.id)).length, 0);
  });

  it('anon não executa as funções de aprovação; as internas nem usuários logados', async () => {
    const privilegio = async (papel, funcao) =>
      (await um('select has_function_privilege($1, $2, $3) as ok', [papel, funcao, 'execute'])).ok;
    const publicas = [
      'public.aprovar_reversa(uuid, integer, text)',
      'public.rejeitar_reversa(uuid, integer, text)',
      'public.fila_aprovacao_reversas()',
      'public.verificar_operacao_logistica(uuid)',
      'public.exigir_operacao_logistica(uuid, integer)',
      'public.exigir_aprovacao_legado_pendente()',
      'public.empresas_aprovaveis()',
      'public.pode_anexar_etiqueta(text)',
    ];
    const internas = [
      'public.registrar_decisao_reversa(uuid, text, integer, text)',
      'public.usuario_nome(uuid)',
      'public.reversa_campos_do_pedido_alterados(public.solicitacoes_reverso, public.solicitacoes_reverso)',
    ];
    for (const funcao of [...publicas, ...internas]) {
      assert.equal(await privilegio('anon', funcao), false, `anon: ${funcao}`);
    }
    for (const funcao of publicas) {
      assert.equal(await privilegio('authenticated', funcao), true, `authenticated: ${funcao}`);
    }
    for (const funcao of internas) {
      assert.equal(await privilegio('authenticated', funcao), false, `authenticated: ${funcao}`);
    }
    // E na prática, pela API
    const erro = await falha(como(c1, ANON, 'select * from public.fila_aprovacao_reversas()'));
    assert.equal(erro?.code, '42501');
  });

  it('upsert não muda a aprovação nem pula a expedição', async () => {
    const campos = `(id, empresa, data_solicitacao, solicitante, setor, codigo_cliente, nome_cliente, endereco_postagem, motivo, nc_id,
       aprovacao_status, aprovacao_legada)
      values ($1, 'Alinare', current_date, 'Fulana', 'Financeiro', 77, 'Cliente Fila Alinare', 'Rua B, 2', 'Outros', $2,
       'aprovada', true)`;
    const semMudanca = (
      await como(
        c1,
        u.solicitanteOperador,
        `insert into public.solicitacoes_reverso ${campos}
         on conflict (id) do update set aprovacao_status = 'aprovada', aprovacao_legada = true, anotacoes = 'upsert'
         returning aprovacao_status, aprovacao_legada, anotacoes`,
        [alinare.id, nc.alinare.id]
      )
    ).rows[0];
    assert.deepEqual(semMudanca, { aprovacao_status: 'aguardando_aprovacao', aprovacao_legada: false, anotacoes: 'upsert' });
    // Quem só solicita não altera etapa: a regra de etapa recusa antes da expedição
    const erro = await falha(
      como(
        c1,
        u.solicitanteOperador,
        `insert into public.solicitacoes_reverso ${campos} on conflict (id) do update set status = 'etiqueta_gerada'`,
        [alinare.id, nc.alinare.id]
      )
    );
    assert.equal(erro?.code, '42501');
  });

  it('data de registro não muda', async () => {
    const antes = (await reversa(alinare.id)).created_at;
    await atualizar(u.solicitanteAlinare, alinare.id, { created_at: '2020-01-01T00:00:00Z' });
    assert.equal((await reversa(alinare.id)).created_at.getTime(), antes.getTime());
  });

  it('a situação da aprovação não muda por update direto, nem por quem solicita', async () => {
    const r = await atualizar(u.solicitanteAlinare, alinare.id, {
      aprovacao_status: 'aprovada',
      aprovacao_legada: true,
      aprovacao_decidida_por: u.expedicao.id,
      aprovacao_versao: 7,
      solicitado_por: u.expedicao.id,
      autorizacao: 'Autorizadora Declarada A',
    });
    const linha = r.rows[0];
    assert.equal(linha.aprovacao_status, 'aguardando_aprovacao');
    assert.equal(linha.aprovacao_legada, false);
    assert.equal(linha.aprovacao_decidida_por, null);
    assert.equal(linha.aprovacao_versao, 1);
    assert.equal(linha.solicitado_por, u.solicitanteAlinare.id);
    assert.equal(linha.autorizacao, null);
  });

  it('o histórico de decisões não aceita gravação direta', async () => {
    const tentativas = [
      `insert into public.solicitacoes_aprovacoes (solicitacao_id, versao, evento, empresa, user_id, user_nome)
       values ('${alinare.id}', 1, 'aprovada', 'Alinare', '${u.aprovadorAlinare.id}', 'Forjada')`,
      `update public.solicitacoes_aprovacoes set justificativa = 'x'`,
      `delete from public.solicitacoes_aprovacoes`,
    ];
    for (const sql of tentativas) {
      for (const persona of [u.aprovadorAlinare, u.admin, SERVICE_ROLE]) {
        const erro = await falha(como(c1, persona, sql));
        assert.equal(erro?.code, '42501', `${persona.nome}: ${sql.slice(0, 30)}`);
      }
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('aprovação — decisões', () => {
  it('rejeitar exige justificativa', async () => {
    const r = await novaReversa(u.solicitanteAlinare, 'Alinare', nc.alinare.id, 'Cliente Rejeição Vazia');
    for (const justificativa of [null, '', '   ']) {
      const erro = await falha(rejeitar(u.aprovadorAlinare, r.id, 1, justificativa));
      assert.equal(erro?.code, '23514');
      assert.match(erro.message, /justificativa/);
    }
    assert.equal((await reversa(r.id)).aprovacao_status, 'aguardando_aprovacao');
  });

  it('rejeição grava decisão e histórico com usuário, data do servidor e justificativa', async () => {
    const r = await novaReversa(u.solicitanteAlinare, 'Alinare', nc.alinare.id, 'Cliente Rejeitada');
    const antes = Date.now();
    const decidida = (await rejeitar(u.aprovadorAlinare, r.id, 1, '  Cliente desistiu da troca  ')).rows[0];
    assert.equal(decidida.aprovacao_status, 'rejeitada');
    assert.equal(decidida.aprovacao_decidida_por, u.aprovadorAlinare.id);
    assert.equal(decidida.aprovacao_decidida_por_nome, 'Aprovadora Alinare');
    assert.equal(decidida.aprovacao_justificativa, 'Cliente desistiu da troca');

    const [evento, ...outros] = await eventos(r.id);
    assert.equal(outros.length, 0);
    assert.equal(evento.evento, 'rejeitada');
    assert.equal(evento.versao, 1);
    assert.equal(evento.justificativa, 'Cliente desistiu da troca');
    assert.equal(evento.user_id, u.aprovadorAlinare.id);
    assert.equal(evento.user_nome, 'Aprovadora Alinare');
    assert.equal(evento.user_login, u.aprovadorAlinare.email);
    assert.equal(evento.empresa, 'Alinare');
    assert.ok(Math.abs(new Date(evento.created_at).getTime() - antes) < 60_000);
  });

  it('aprovação grava decisão, histórico e linha do tempo da NC; observação é opcional', async () => {
    const r = await novaReversa(u.solicitanteAlinare, 'Alinare', nc.alinare.id, 'Cliente Aprovada');
    const decidida = (await aprovar(u.aprovadorAlinare, r.id, 1)).rows[0];
    assert.equal(decidida.aprovacao_status, 'aprovada');
    assert.equal(decidida.aprovacao_justificativa, null);
    const [evento] = await eventos(r.id);
    assert.equal(evento.evento, 'aprovada');
    assert.equal(evento.user_id, u.aprovadorAlinare.id);
    const timeline = await q('select acao from public.nc_historico where nc_id = $1', [nc.alinare.id]);
    assert.ok(timeline.some((t) => t.acao === 'Reversa de Cliente Aprovada: aprovada'));
  });

  it('decisão já tomada não é refeita', async () => {
    const r = await novaReversa(u.solicitanteAlinare, 'Alinare', nc.alinare.id, 'Cliente Decidida');
    await aprovar(u.aprovadorAlinare, r.id, 1);
    const outraAprovacao = await falha(aprovar(u.aprovadorAlinare2, r.id, 1));
    assert.equal(outraAprovacao?.code, '55000');
    assert.match(outraAprovacao.message, /já foi aprovada por Aprovadora Alinare/);
    const rejeicao = await falha(rejeitar(u.aprovadorAlinare2, r.id, 1, 'Mudei de ideia'));
    assert.equal(rejeicao?.code, '55000');
    assert.equal((await eventos(r.id)).length, 1);
  });

  it('versão diferente da analisada é recusada', async () => {
    const r = await novaReversa(u.solicitanteAlinare, 'Alinare', nc.alinare.id, 'Cliente Versão');
    const erro = await falha(aprovar(u.aprovadorAlinare, r.id, 2));
    assert.equal(erro?.code, '55000');
    assert.match(erro.message, /alterada/);
  });

  it('legado não recebe decisão', async () => {
    const erro = await falha(aprovar(u.aprovadorAlinare, legado.alinarePendente, 1));
    assert.equal(erro?.code, '55000');
    assert.match(erro.message, /legado/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('aprovação — próprio pedido (configuração provisória)', () => {
  it('por padrão, quem registrou não aprova a própria solicitação, mas pode rejeitá-la', async () => {
    const config = await um('select permitir_autoaprovacao from public.aprovacao_config');
    assert.equal(config.permitir_autoaprovacao, false);

    const propria = await novaReversa(u.solicitanteAprovador, 'Alinare', nc.alinare.id, 'Cliente Próprio Pedido');
    const item = (await fila(u.solicitanteAprovador)).find((i) => i.id === propria.id);
    assert.equal(item.proprio_pedido, true);
    assert.equal(item.pode_aprovar, false);

    const erro = await falha(aprovar(u.solicitanteAprovador, propria.id, 1));
    assert.equal(erro?.code, '42501');
    assert.match(erro.message, /registrada ou alterada por você/);
    // Outro aprovador da empresa decide normalmente
    assert.equal((await aprovar(u.aprovadorAlinare, propria.id, 1)).rows[0].aprovacao_status, 'aprovada');

    const desistencia = await novaReversa(u.solicitanteAprovador, 'Alinare', nc.alinare.id, 'Cliente Desistência');
    const rejeitada = (await rejeitar(u.solicitanteAprovador, desistencia.id, 1, 'Pedido aberto por engano')).rows[0];
    assert.equal(rejeitada.aprovacao_status, 'rejeitada');
  });

  it('quem alterou o pedido não aprova a versão que produziu', async () => {
    const r = await novaReversa(u.solicitanteAlinare, 'Alinare', nc.alinare.id, 'Cliente Editada e Aprovada');
    await rejeitar(u.aprovadorAlinare, r.id, 1, 'Endereço incompleto');
    // Quem solicita e aprova a empresa altera o pedido (nova versão) e tenta aprovar
    await atualizar(u.solicitanteAprovador, r.id, { endereco_postagem: 'Rua Corrigida, 10' });
    const item = (await fila(u.solicitanteAprovador)).find((i) => i.id === r.id);
    assert.equal(item.proprio_pedido, true);
    assert.equal(item.pode_aprovar, false);
    const erro = await falha(aprovar(u.solicitanteAprovador, r.id, 2));
    assert.equal(erro?.code, '42501');
    assert.match(erro.message, /registrada ou alterada por você/);
    assert.equal((await reversa(r.id)).aprovacao_versao_por, u.solicitanteAprovador.id);
    // Outra pessoa aprova a versão nova
    assert.equal((await aprovar(u.aprovadorAlinare, r.id, 2)).rows[0].aprovacao_status, 'aprovada');
  });

  it('o nome gravado na decisão é o do cadastro (app_metadata), não o que o usuário muda sozinho', async () => {
    const r = await novaReversa(u.solicitanteAlinare, 'Alinare', nc.alinare.id, 'Cliente Nome Trocado');
    // O próprio usuário altera user_metadata (supabase.auth.updateUser) para se passar por outra pessoa
    await db.query(
      `update auth.users set raw_user_meta_data = raw_user_meta_data || '{"nome": "Segunda Aprovadora Alinare"}' where id = $1`,
      [u.aprovadorAlinare.id]
    );
    try {
      const decidida = (await aprovar(u.aprovadorAlinare, r.id, 1)).rows[0];
      assert.equal(decidida.aprovacao_decidida_por_nome, 'Aprovadora Alinare');
      const [evento] = await eventos(r.id);
      assert.equal(evento.user_nome, 'Aprovadora Alinare');
      assert.equal(evento.user_login, u.aprovadorAlinare.email);
    } finally {
      await db.query(
        `update auth.users set raw_user_meta_data = raw_user_meta_data || '{"nome": "Aprovadora Alinare"}' where id = $1`,
        [u.aprovadorAlinare.id]
      );
    }
  });

  it('nome dos usuários antigos copiado para app_metadata', async () => {
    const nome = async (id) => (await um("select raw_app_meta_data ->> 'nome' as n from auth.users where id = $1", [id])).n;
    assert.equal(await nome(legado.adminAntigo), 'Admin');
    assert.equal(await nome(legado.semTelasAntigo), 'Sem');
  });

  it('só o admin muda a configuração; ligada, o próprio pedido pode ser aprovado', async () => {
    const naoAdmin = await como(
      c1,
      u.aprovadorAlinare,
      'update public.aprovacao_config set permitir_autoaprovacao = true returning *'
    );
    assert.equal(naoAdmin.rows.length, 0, 'não-admin não altera');
    const inserir = await falha(como(c1, u.admin, 'insert into public.aprovacao_config (id) values (true)'));
    assert.equal(inserir?.code, '42501');

    const ligada = (
      await como(c1, u.admin, 'update public.aprovacao_config set permitir_autoaprovacao = true returning *')
    ).rows[0];
    assert.equal(ligada.permitir_autoaprovacao, true);
    assert.equal(ligada.atualizado_por, u.admin.id);

    const propria = await novaReversa(u.solicitanteAprovador, 'Alinare', nc.alinare.id, 'Cliente Autoaprovação');
    assert.equal((await fila(u.solicitanteAprovador)).find((i) => i.id === propria.id).pode_aprovar, true);
    assert.equal((await aprovar(u.solicitanteAprovador, propria.id, 1)).rows[0].aprovacao_status, 'aprovada');

    await como(c1, u.admin, 'update public.aprovacao_config set permitir_autoaprovacao = false');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('aprovação — concorrência', () => {
  it('duas decisões ao mesmo tempo: a segunda espera a primeira e é recusada', async () => {
    const r = await novaReversa(u.solicitanteAlinare, 'Alinare', nc.alinare.id, 'Cliente Concorrência');
    const a = await banco.conectar();
    const b = await banco.conectar();
    const pidB = (await b.query('select pg_backend_pid() as pid')).rows[0].pid;

    await a.query('begin');
    await iniciarSessao(a, u.aprovadorAlinare);
    await a.query('select * from public.aprovar_reversa($1, 1, null)', [r.id]);

    await b.query('begin');
    await iniciarSessao(b, u.aprovadorAlinare2);
    const decisaoB = b
      .query('select * from public.rejeitar_reversa($1, 1, $2)', [r.id, 'Endereço suspeito'])
      .then(() => null, (erro) => erro);

    assert.equal(await esperarBloqueio(db, pidB), true, 'segunda decisão aguarda a trava da primeira');
    await a.query('commit');

    const erroB = await decisaoB;
    await b.query('rollback');
    assert.equal(erroB?.code, '55000');
    assert.match(erroB.message, /já foi aprovada por Aprovadora Alinare/);

    const evts = await eventos(r.id);
    assert.equal(evts.length, 1);
    assert.equal(evts[0].evento, 'aprovada');
    assert.equal((await reversa(r.id)).aprovacao_status, 'aprovada');
  });

  it('disparadas juntas, só uma decisão vale e o histórico tem uma linha', async () => {
    const r = await novaReversa(u.solicitanteAlinare, 'Alinare', nc.alinare.id, 'Cliente Corrida');
    const a = await banco.conectar();
    const b = await banco.conectar();
    const resultados = await Promise.allSettled([
      aprovar(u.aprovadorAlinare, r.id, 1, null, a),
      rejeitar(u.aprovadorAlinare2, r.id, 1, 'Fora do prazo', b),
    ]);
    const ok = resultados.filter((res) => res.status === 'fulfilled');
    const recusadas = resultados.filter((res) => res.status === 'rejected');
    assert.equal(ok.length, 1);
    assert.equal(recusadas.length, 1);
    assert.equal(recusadas[0].reason.code, '55000');
    const evts = await eventos(r.id);
    assert.equal(evts.length, 1);
    assert.equal((await reversa(r.id)).aprovacao_status, evts[0].evento);
  });

  it('alteração do pedido durante a análise: a aprovação da versão antiga é recusada', async () => {
    const r = await novaReversa(u.solicitanteAlinare, 'Alinare', nc.alinare.id, 'Cliente Alterada na Análise');
    const a = await banco.conectar();
    const b = await banco.conectar();
    const pidB = (await b.query('select pg_backend_pid() as pid')).rows[0].pid;

    await a.query('begin');
    await iniciarSessao(a, u.solicitanteAlinare);
    await a.query("update public.solicitacoes_reverso set endereco_postagem = 'Rua Nova, 10' where id = $1", [r.id]);

    await b.query('begin');
    await iniciarSessao(b, u.aprovadorAlinare);
    const aprovacaoB = b.query('select * from public.aprovar_reversa($1, 1, null)', [r.id]).then(() => null, (e) => e);
    assert.equal(await esperarBloqueio(db, pidB), true);
    await a.query('commit');

    const erroB = await aprovacaoB;
    await b.query('rollback');
    assert.equal(erroB?.code, '55000');
    assert.match(erroB.message, /alterada/);
    const atual = await reversa(r.id);
    assert.equal(atual.aprovacao_status, 'aguardando_aprovacao');
    assert.equal(atual.aprovacao_versao, 2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('aprovação — alterações depois da decisão', () => {
  it('anotações não desfazem a aprovação; etapa e rastreio não mudam por update direto', async () => {
    const r = await novaReversa(u.solicitanteAlinare, 'Alinare', nc.alinare.id, 'Cliente Operacional');
    await aprovar(u.aprovadorAlinare, r.id, 1);
    const anotada = (await atualizar(u.solicitanteAlinare, r.id, { anotacoes: 'ligar antes' })).rows[0];
    assert.equal(anotada.aprovacao_status, 'aprovada');
    assert.equal(anotada.aprovacao_versao, 1);
    // Etapa e rastreio são da emissão (RPC), não de update direto, mesmo para quem emite
    const direto = await falha(atualizar(u.emissorAlinare, r.id, { status: 'etiqueta_gerada', codigo_rastreio: 'AB123456789BR' }));
    assert.equal(direto?.code, '42501');
    const depois = await reversa(r.id);
    assert.equal(depois.status, 'pendente');
    assert.equal(depois.aprovacao_status, 'aprovada');
    assert.equal(depois.aprovacao_versao, 1);
    assert.equal((await eventos(r.id)).length, 1);
  });

  it('dado do pedido alterado desfaz a aprovação: nova versão, histórico e linha do tempo da NC', async () => {
    const r = await novaReversa(u.solicitanteAlinare, 'Alinare', nc.alinare.id, 'Cliente Endereço');
    await aprovar(u.aprovadorAlinare, r.id, 1);
    const depois = (
      await atualizar(u.solicitanteAlinare, r.id, { endereco_postagem: 'Rua Trocada, 99', motivo: 'Mercadoria errada' })
    ).rows[0];
    assert.equal(depois.aprovacao_status, 'aguardando_aprovacao');
    assert.equal(depois.aprovacao_versao, 2);
    assert.equal(depois.aprovacao_decidida_por, null);

    const ultimo = (await eventos(r.id)).at(-1);
    assert.equal(ultimo.evento, 'invalidada');
    assert.equal(ultimo.versao, 2);
    assert.equal(ultimo.situacao_anterior, 'aprovada');
    assert.deepEqual(ultimo.campos_alterados, ['Endereço de postagem', 'Motivo']);
    assert.equal(ultimo.user_id, u.solicitanteAlinare.id);

    const timeline = await q('select acao from public.nc_historico where nc_id = $1', [nc.alinare.id]);
    assert.ok(timeline.some((t) => t.acao.startsWith('Reversa de Cliente Endereço voltou para aprovação')));

    assert.equal((await falha(aprovar(u.aprovadorAlinare, r.id, 1)))?.code, '55000', 'versão antiga não vale');
    assert.equal((await aprovar(u.aprovadorAlinare, r.id, 2)).rows[0].aprovacao_status, 'aprovada');
  });

  it('rejeitada e alterada volta para a fila', async () => {
    const r = await novaReversa(u.solicitanteAlinare, 'Alinare', nc.alinare.id, 'Cliente Corrigida');
    await rejeitar(u.aprovadorAlinare, r.id, 1, 'Endereço incompleto');
    await atualizar(u.solicitanteAlinare, r.id, { endereco_postagem: 'Rua Completa, 100, Centro' });
    assert.ok((await fila(u.aprovadorAlinare)).some((i) => i.id === r.id && i.aprovacao_versao === 2));
  });

  it('alteração enquanto aguarda gera nova versão e evento "alterada"', async () => {
    const r = await novaReversa(u.solicitanteAlinare, 'Alinare', nc.alinare.id, 'Cliente Aguardando');
    await atualizar(u.solicitanteAlinare, r.id, { codigo_cliente: 78 });
    const [evento] = await eventos(r.id);
    assert.equal(evento.evento, 'alterada');
    assert.equal(evento.situacao_anterior, 'aguardando_aprovacao');
    assert.deepEqual(evento.campos_alterados, ['Código da cliente']);
  });

  it('legado alterado deixa de ser legado e passa a exigir aprovação', async () => {
    const visiveis = await como(c1, u.solicitanteAlinare, 'select id from public.solicitacoes_reverso where id = $1', [
      legado.alinarePendente,
    ]);
    const alteracao = await atualizar(u.solicitanteAlinare, legado.alinarePendente, { nome_cliente: 'Cliente antiga corrigida' });
    assert.equal(visiveis.rows.length, 0, 'pedido legado sem autor não é associado pelo nome do solicitante');
    assert.equal(alteracao.rows.length, 0, 'sem autorização ampliada, o usuário não altera o legado');
    const depois = await reversa(legado.alinarePendente);
    assert.equal(depois.aprovacao_legada, true);
    assert.equal(depois.aprovacao_status, null);
    assert.equal(depois.solicitado_por, null);
    assert.equal(depois.autorizacao, 'Autorizadora Declarada A', 'autorizador declarado continua para consulta ampliada');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('aprovação — bloqueio da expedição', () => {
  let aguardando;
  let rejeitada;
  let aprovada;

  before(async () => {
    aguardando = await novaReversa(u.solicitanteAlinare, 'Alinare', nc.alinare.id, 'Cliente Bloqueio Aguardando');
    rejeitada = await novaReversa(u.solicitanteAlinare, 'Alinare', nc.alinare.id, 'Cliente Bloqueio Rejeitada');
    await rejeitar(u.aprovadorAlinare, rejeitada.id, 1, 'Sem NF');
    aprovada = await novaReversa(u.solicitanteAlinare, 'Alinare', nc.alinare.id, 'Cliente Bloqueio Aprovada');
    await aprovar(u.aprovadorAlinare, aprovada.id, 1);
  });

  // Etapa, rastreio e etiqueta só mudam pelas operações de emissão (RPC), nunca por update direto.
  it('etapa, rastreio, etiqueta e datas não mudam por update direto, nem em reversa aguardando ou rejeitada', async () => {
    const tentativas = [
      { status: 'etiqueta_gerada' },
      { codigo_rastreio: 'AC123456789BR' },
      { etiqueta_path: 'x/etiqueta.pdf', etiqueta_nome: 'etiqueta.pdf' },
      { etiqueta_gerada_em: new Date().toISOString() },
      { postado_em: new Date().toISOString() },
    ];
    for (const id of [aguardando.id, rejeitada.id]) {
      for (const campos of tentativas) {
        const erro = await falha(atualizar(u.emissorAlinare, id, campos));
        assert.equal(erro?.code, '42501', JSON.stringify(campos));
      }
    }
    assert.equal((await reversa(aguardando.id)).status, 'pendente');
  });

  it('a emissão não registra antes da aprovação', async () => {
    const erro = await falha(
      como(c1, u.emissorAlinare, 'select public.registrar_emissao_reversa($1, null, $2, $3, current_date, null)', [
        aguardando.id,
        'AUT-ANTES',
        'AA000000011BR',
      ])
    );
    assert.equal(erro?.code, '55000');
    assert.match(erro.message, /aprovação/);
  });

  it('anexar o PDF da etiqueta exige reversa aprovada; o PDF não é sobrescrito', async () => {
    for (const id of [aguardando.id, rejeitada.id]) {
      const erro = await falha(
        como(c1, u.emissorAlinare, "insert into storage.objects (bucket_id, name) values ('etiquetas', $1)", [`${id}/etiqueta.pdf`])
      );
      assert.match(erro?.message ?? '', /row-level security/);
    }
    await como(c1, u.emissorAlinare, "insert into storage.objects (bucket_id, name) values ('etiquetas', $1)", [
      `${aprovada.id}/etiqueta.pdf`,
    ]);
    const troca = await como(
      c1,
      u.emissorAlinare,
      'update storage.objects set owner = $2 where name = $1 returning id',
      [`${aprovada.id}/etiqueta.pdf`, u.emissorAlinare.id]
    );
    assert.equal(troca.rows.length, 0, 'objeto existente não é alterado');
  });

  it('reversa aprovada entra na expedição pela emissão; quem só solicita e consulta não opera', async () => {
    const emitida = await como(c1, u.emissorAlinare, 'select public.registrar_emissao_reversa($1, null, $2, $3, current_date, null) as e', [
      aprovada.id,
      'AUT-OK',
      'AA000000012BR',
    ]);
    assert.ok(emitida.rows[0].e, 'emissão registrada');
    assert.equal((await verificar(u.emissorAlinare, aprovada.id)).permitido, true);
    assert.equal((await verificar(u.solicitanteAlinare, aprovada.id)).motivo, 'sem_permissao');
    assert.equal((await verificar(u.listaAlinareNc, aprovada.id)).motivo, 'sem_permissao');
  });

  it('depois que a expedição começou, os dados do pedido não mudam (nem no legado)', async () => {
    const r = await novaReversa(u.solicitanteAlinare, 'Alinare', nc.alinare.id, 'Cliente Já Expedida');
    await aprovar(u.aprovadorAlinare, r.id, 1);
    await como(c1, u.emissorAlinare, 'select public.registrar_emissao_reversa($1, null, $2, $3, current_date, null)', [
      r.id,
      'AUT-EXP',
      'AE000000013BR',
    ]);
    const erro = await falha(atualizar(u.solicitanteAlinare, r.id, { endereco_postagem: 'Rua Mudou, 1' }));
    assert.equal(erro?.code, '55000');
    assert.match(erro.message, /já começou/);
    assert.equal((await reversa(r.id)).aprovacao_status, 'aprovada');
    // Anotações continuam livres
    assert.equal((await atualizar(u.solicitanteAlinare, r.id, { anotacoes: 'cliente avisada' })).rows.length, 1);
    const legadoEmTransito = await falha(atualizar(u.solicitanteNovitah, legado.novitahPostado, { nome_cliente: 'Outra' }));
    assert.equal(legadoEmTransito, null);
    assert.equal((await atualizar(u.solicitanteNovitah, legado.novitahPostado, { nome_cliente: 'Outra' })).rows.length, 0);
    assert.equal((await reversa(legado.novitahPostado)).nome_cliente, 'Cliente antiga');
  });

  it('correção feita por backend desfaz a aprovação; o serviço corrige a etapa sem a regra de usuário', async () => {
    const r = await novaReversa(u.solicitanteAlinare, 'Alinare', nc.alinare.id, 'Cliente Etiqueta Invalidada');
    await aprovar(u.aprovadorAlinare, r.id, 1);
    await como(c1, u.emissorAlinare, 'select public.registrar_emissao_reversa($1, null, $2, $3, current_date, null)', [
      r.id,
      'AUT-INV',
      'AD000000014BR',
    ]);
    await como(c1, SERVICE_ROLE, "update public.solicitacoes_reverso set endereco_postagem = 'Rua Mudou, 1' where id = $1", [r.id]);
    const evento = (await eventos(r.id)).at(-1);
    assert.equal(evento.evento, 'invalidada');
    assert.equal(evento.user_id, null);
    assert.equal(evento.user_nome, 'Sistema');
    const limpa = (
      await como(
        c1,
        SERVICE_ROLE,
        "update public.solicitacoes_reverso set status = 'pendente', codigo_rastreio = null where id = $1 returning status, codigo_rastreio",
        [r.id]
      )
    ).rows[0];
    assert.equal(limpa.status, 'pendente');
    assert.equal(limpa.codigo_rastreio, null);
  });

  it('alterar o pedido e avançar a etapa no mesmo comando é recusado por inteiro', async () => {
    const r = await novaReversa(u.solicitanteAlinare, 'Alinare', nc.alinare.id, 'Cliente Comando Duplo');
    await aprovar(u.aprovadorAlinare, r.id, 1);
    const erro = await falha(atualizar(u.solicitanteAlinare, r.id, { endereco_postagem: 'Rua Outra, 2', status: 'etiqueta_gerada' }));
    assert.equal(erro?.code, '42501');
    const atual = await reversa(r.id);
    assert.equal(atual.aprovacao_status, 'aprovada');
    assert.equal(atual.endereco_postagem, 'Rua B, 2');
  });

  it('backend com service_role não passa pelo bloqueio do usuário (usa exigir_operacao_logistica)', async () => {
    const r = await novaReversa(u.solicitanteAlinare, 'Alinare', nc.alinare.id, 'Cliente Backend Status');
    const atual = (
      await como(c1, SERVICE_ROLE, "update public.solicitacoes_reverso set status = 'postado' where id = $1 returning status", [r.id])
    ).rows[0];
    assert.equal(atual.status, 'postado');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('contrato para a emissão e a expedição', () => {
  let aguardando;
  let aprovada;
  let rejeitada;

  before(async () => {
    aguardando = await novaReversa(u.solicitanteAlinare, 'Alinare', nc.alinare.id, 'Cliente Contrato Aguardando');
    aprovada = await novaReversa(u.solicitanteAlinare, 'Alinare', nc.alinare.id, 'Cliente Contrato Aprovada');
    await aprovar(u.aprovadorAlinare, aprovada.id, 1);
    rejeitada = await novaReversa(u.solicitanteAlinare, 'Alinare', nc.alinare.id, 'Cliente Contrato Rejeitada');
    await rejeitar(u.aprovadorAlinare, rejeitada.id, 1, 'Duplicada');
  });

  it('verificar_operacao_logistica responde sem erro para cada situação', async () => {
    assert.deepEqual(await verificar(u.emissorAlinare, aguardando.id), {
      permitido: false,
      motivo: 'aguardando_aprovacao',
      situacao: 'aguardando_aprovacao',
      aprovacao_versao: 1,
    });
    assert.deepEqual(await verificar(u.emissorAlinare, rejeitada.id), {
      permitido: false,
      motivo: 'rejeitada',
      situacao: 'rejeitada',
      aprovacao_versao: 1,
    });
    assert.deepEqual(await verificar(u.emissorAlinare, aprovada.id), {
      permitido: true,
      motivo: null,
      situacao: 'aprovada',
      aprovacao_versao: 1,
    });
    assert.equal((await verificar(u.emissorAlinare, legado.comNc)).situacao, 'legado');
    assert.equal((await verificar(u.emissorAlinare, legado.comNc)).permitido, true);
    // Vê mas não opera a expedição
    assert.equal((await verificar(u.aprovadorAlinare, aprovada.id)).motivo, 'sem_permissao');
    // Não vê a reversa (outra empresa) e id inexistente: mesma resposta
    assert.equal((await verificar(u.listaNovitah, aprovada.id)).motivo, 'nao_encontrada');
    assert.equal((await verificar(u.emissorAlinare, '00000000-0000-0000-0000-000000000000')).motivo, 'nao_encontrada');
    // Backend sem usuário: só a situação da aprovação conta
    assert.equal((await verificar(SERVICE_ROLE, aprovada.id)).permitido, true);
    assert.equal((await verificar(SERVICE_ROLE, aguardando.id)).permitido, false);
  });

  it('exigir_operacao_logistica devolve a versão aprovada ou levanta erro', async () => {
    assert.equal((await exigir(u.emissorAlinare, aprovada.id)).rows[0].versao, 1);
    assert.equal((await exigir(u.emissorAlinare, aprovada.id, 1)).rows[0].versao, 1);
    assert.equal((await falha(exigir(u.emissorAlinare, aprovada.id, 2)))?.code, '55000');
    assert.equal((await falha(exigir(u.emissorAlinare, aguardando.id)))?.code, '55000');
    assert.equal((await falha(exigir(u.emissorAlinare, rejeitada.id)))?.code, '55000');
    assert.equal((await falha(exigir(u.aprovadorAlinare, aprovada.id)))?.code, '42501');
    assert.equal((await falha(exigir(u.listaNovitah, aprovada.id)))?.code, 'P0002');
    assert.equal((await exigir(SERVICE_ROLE, aprovada.id)).rows[0].versao, 1);
    assert.equal((await falha(exigir(SERVICE_ROLE, aguardando.id)))?.code, '55000');
    assert.equal((await exigir(u.emissorAlinare, legado.comNc)).rows[0].versao, 1);
  });

  it('exigir_operacao_logistica segura a aprovação até o fim da transação', async () => {
    const a = await banco.conectar();
    const b = await banco.conectar();
    const pidB = (await b.query('select pg_backend_pid() as pid')).rows[0].pid;

    await a.query('begin');
    await iniciarSessao(a, u.emissorAlinare);
    await a.query('select public.exigir_operacao_logistica($1, 1)', [aprovada.id]);

    const alteracao = como(b, u.solicitanteAlinare, "update public.solicitacoes_reverso set nome_cliente = 'Outra Cliente' where id = $1", [
      aprovada.id,
    ]);
    assert.equal(await esperarBloqueio(db, pidB), true, 'alteração espera a operação terminar');
    await a.query('commit');
    await alteracao;
    assert.equal((await reversa(aprovada.id)).aprovacao_status, 'aguardando_aprovacao');
  });

  it('duas operações simultâneas na mesma reversa: a segunda espera a primeira (sem deadlock)', async () => {
    const r = await novaReversa(u.solicitanteAlinare, 'Alinare', nc.alinare.id, 'Cliente Emissão Dupla');
    await aprovar(u.aprovadorAlinare, r.id, 1);
    const a = await banco.conectar();
    const b = await banco.conectar();
    const pidB = (await b.query('select pg_backend_pid() as pid')).rows[0].pid;
    const operar = async (conexao) => {
      await conexao.query('select public.exigir_operacao_logistica($1, 1)', [r.id]);
      await conexao.query("update public.solicitacoes_reverso set anotacoes = coalesce(anotacoes, '') || 'emitida;' where id = $1", [r.id]);
    };

    await a.query('begin');
    await iniciarSessao(a, u.emissorAlinare);
    await operar(a);

    await b.query('begin');
    await iniciarSessao(b, u.emissorAlinare);
    const segunda = operar(b).then(() => null, (erro) => erro);
    assert.equal(await esperarBloqueio(db, pidB), true, 'segunda operação espera');
    await a.query('commit');
    assert.equal(await segunda, null, 'segunda operação conclui sem erro');
    await b.query('commit');
    assert.equal((await reversa(r.id)).anotacoes, 'emitida;emitida;');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('aprovação — histórico protegido', () => {
  it('quem não vê a reversa não vê o histórico dela', async () => {
    const r = await novaReversa(u.solicitanteAlinare, 'Alinare', nc.alinare.id, 'Cliente Histórico');
    await aprovar(u.aprovadorAlinare, r.id, 1);
    const sql = 'select * from public.solicitacoes_aprovacoes where solicitacao_id = $1';
    assert.equal((await como(c1, u.aprovadorNovitah, sql, [r.id])).rows.length, 0);
    assert.equal((await como(c1, u.solicitanteAlinare, sql, [r.id])).rows.length, 1);
  });

  it('PDF de reversa já apagada: só o admin vê e remove', async () => {
    const caminho = `${legado.paraApagar}/etiqueta.pdf`;
    await como(c1, u.emissorAlinare, "insert into storage.objects (bucket_id, name) values ('etiquetas', $1)", [caminho]);
    // A exclusão apaga o registro antes dos PDFs (a tela faz nessa ordem)
    await como(c1, u.adminPedidos, 'delete from public.solicitacoes_reverso where id = $1', [legado.paraApagar]);
    const ver = (persona) => como(c1, persona, 'select count(*)::int as n from storage.objects where name = $1', [caminho]);
    assert.equal((await ver(u.expedicao)).rows[0].n, 0);
    assert.equal((await como(c1, u.expedicao, 'delete from storage.objects where name = $1 returning id', [caminho])).rows.length, 0);
    assert.equal((await ver(u.admin)).rows[0].n, 1);
    assert.equal((await como(c1, u.admin, 'delete from storage.objects where name = $1 returning id', [caminho])).rows.length, 1);
  });

  it('reversa com decisão não pode ser apagada; sem decisão, o admin apaga', async () => {
    const decidida = await novaReversa(u.solicitanteAlinare, 'Alinare', nc.alinare.id, 'Cliente Apagar Decidida');
    await aprovar(u.aprovadorAlinare, decidida.id, 1);
    const erro = await falha(como(c1, u.adminPedidos, 'delete from public.solicitacoes_reverso where id = $1', [decidida.id]));
    assert.equal(erro?.code, '55000');

    const semDecisao = await novaReversa(u.solicitanteAlinare, 'Alinare', nc.alinare.id, 'Cliente Apagar Livre');
    const apagadas = await como(c1, u.adminPedidos, 'delete from public.solicitacoes_reverso where id = $1 returning id', [semDecisao.id]);
    assert.equal(apagadas.rows.length, 1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Regras da base (permissões, NC e etiqueta), conferidas junto com a aprovação
describe('base — permissões em app_metadata', () => {
  it('telas antigas copiadas para app_metadata (perfil legado convertido)', async () => {
    const telas = async (id) => (await um("select raw_app_meta_data -> 'telas' as t from auth.users where id = $1", [id])).t;
    assert.deepEqual(await telas(legado.adminAntigo), ['usuarios']);
    assert.deepEqual(await telas(legado.expedicaoAntiga), ['dashboard-geral', 'lista-geral', 'kanban', 'kanban-edit']);
    assert.deepEqual(await telas(legado.multiAntigo), ['formulario-alinare', 'formulario-novitah']);
    assert.deepEqual(await telas(legado.semTelasAntigo), []);
  });

  it('o token não dá permissão: vale o que está em auth.users, na hora', async () => {
    assert.equal((await como(c1, u.semTelas, 'select public.is_admin() as a')).rows[0].a, false);
    assert.equal((await como(c1, u.semTelas, 'select count(*)::int as n from public.solicitacoes_reverso')).rows[0].n, 0);
    const contar = async () =>
      (await como(c1, u.solicitanteAlinare, 'select count(*)::int as n from public.solicitacoes_reverso')).rows[0].n;
    const antes = await contar();
    assert.ok(antes > 0);
    await db.query("update auth.users set raw_app_meta_data = jsonb_set(raw_app_meta_data, '{telas}', '[]') where id = $1", [
      u.solicitanteAlinare.id,
    ]);
    assert.equal(await contar(), 0, 'revogação vale na hora');
    await db.query(
      `update auth.users set raw_app_meta_data = jsonb_set(raw_app_meta_data, '{telas}', '["formulario-alinare"]') where id = $1`,
      [u.solicitanteAlinare.id]
    );
    assert.equal(await contar(), antes);
  });

  it('escopo de leitura por empresa', async () => {
    const empresas = async (persona) =>
      new Set((await como(c1, persona, 'select empresa from public.solicitacoes_reverso')).rows.map((r) => r.empresa));
    const pedidoA = await novaReversa(u.solicitanteAmbas, 'Alinare', nc.alinare.id, 'Pedido próprio Alinare');
    const pedidoB = await novaReversa(u.solicitanteAmbas, 'Novitah', nc.novitah.id, 'Pedido próprio Novitah');
    assert.deepEqual(await empresas(u.solicitanteAmbas), new Set(['Alinare', 'Novitah']));
    assert.deepEqual(await empresas(u.solicitanteAlinare), new Set(['Alinare']));
    assert.deepEqual(await empresas(u.listaAlinareNc), new Set(['Alinare', 'Novitah']), 'tela nc consulta as duas');
    const idsProprios = new Set(
      (await como(c1, u.solicitanteAmbas, 'select id from public.solicitacoes_reverso')).rows.map((r) => r.id)
    );
    assert.deepEqual(idsProprios, new Set([pedidoA.id, pedidoB.id]), 'sem permissão ampliada, consulta apenas pedidos próprios');
  });

  it('movimentar é por empresa: lista-alinare + nc não altera reversa da Novitah', async () => {
    const r = await novaReversa(u.solicitanteNovitah, 'Novitah', nc.novitah.id, 'Cliente Escopo Novitah');
    assert.equal((await atualizar(u.listaAlinareNc, r.id, { anotacoes: 'x' })).rows.length, 0);
    assert.equal((await atualizar(u.listaNovitah, r.id, { anotacoes: 'ok' })).rows.length, 0, 'consulta não anota');
    assert.equal((await atualizar(u.solicitanteNovitah, r.id, { anotacoes: 'ok' })).rows.length, 1);
  });

  it('só admin apaga reversas', async () => {
    const r = await novaReversa(u.solicitanteAlinare, 'Alinare', nc.alinare.id, 'Cliente Não Apagar');
    assert.equal((await como(c1, u.expedicao, 'delete from public.solicitacoes_reverso where id = $1 returning id', [r.id])).rows.length, 0);
  });

  it('anon não lê NCs nem chama ncs_para_reversa', async () => {
    assert.equal((await falha(como(c1, ANON, 'select count(*) from public.nao_conformidades')))?.code, '42501');
    assert.equal((await falha(como(c1, ANON, "select * from public.ncs_para_reversa('Alinare')")))?.code, '42501');
  });
});

describe('base — não conformidades', () => {
  it('numeração começa em 26 e o número não é escolhido pelo cliente', async () => {
    assert.equal(legado.ncAntiga.numero, 26);
    const forjada = (
      await como(
        c1,
        u.editorNc,
        `insert into public.nao_conformidades (numero, importada, created_by, empresa, origem)
         values (3, true, $1, 'Trice', 'Outro') returning numero, importada, created_by`,
        [u.admin.id]
      )
    ).rows[0];
    assert.notEqual(forjada.numero, 3);
    assert.equal(forjada.importada, false);
    assert.equal(forjada.created_by, u.editorNc.id);
  });

  it('custos e campos calculados como na planilha', async () => {
    const criada = (
      await como(
        c1,
        u.editorNc,
        `insert into public.nao_conformidades
          (data_ocorrencia, data_identificacao, empresa, cliente, origem, tipo_saida, custo_produto, custo_frete_adicional, valor_reembolsado, status)
          values ('2026-10-01', '2026-10-05', 'Novitah', 'Cliente Custos', 'Erro expedição – endereço incorreto', 'Venda', 10, 5.5, 3, 'Aberta')
          returning id, custo_total, custo_liquido`
      )
    ).rows[0];
    assert.equal(Number(criada.custo_total), 15.5);
    assert.equal(Number(criada.custo_liquido), 12.5);
    const vw = (await como(c1, u.consultaNc, 'select area_responsavel, evitavel from public.vw_nao_conformidades where id = $1', [criada.id]))
      .rows[0];
    assert.deepEqual(vw, { area_responsavel: 'Expedição', evitavel: 'Sim' });
  });

  it('valores fora das listas são recusados', async () => {
    const erro = await falha(como(c1, u.admin, "insert into public.nao_conformidades (empresa, origem) values ('Empresa X', 'Outro')"));
    assert.match(erro?.message ?? '', /Empresa \/ contrato fora da lista/);
  });

  it('tela "nc" consulta e não edita; formulário não lê a tabela de NC', async () => {
    assert.ok((await como(c1, u.consultaNc, 'select count(*)::int as n from public.vw_nao_conformidades')).rows[0].n > 0);
    assert.equal((await como(c1, u.consultaNc, "update public.nao_conformidades set cliente = 'x' returning id")).rows.length, 0);
    assert.equal((await como(c1, u.solicitanteAlinare, 'select count(*)::int as n from public.nao_conformidades')).rows[0].n, 0);
  });

  it('NC é opcional; quando informada, é da mesma empresa e está aberta; nc_numero vem do banco', async () => {
    const semNc = await falha(
      como(
        c1,
        u.solicitanteAmbas,
        `insert into public.solicitacoes_reverso
          (empresa, data_solicitacao, solicitante, setor, codigo_cliente, nome_cliente, endereco_postagem, motivo)
          values ('Novitah', current_date, 'Fulana', 'Financeiro', 77, 'Sem NC', 'Rua B, 2', 'Outros')`
      )
    );
    assert.equal(semNc, null, 'NC é opcional na abertura direta de reversa');
    const outraEmpresa = await falha(novaReversa(u.solicitanteAmbas, 'Alinare', nc.novitah.id));
    assert.match(outraEmpresa?.message ?? '', /mesma empresa da NC/);

    const r = await novaReversa(u.solicitanteAmbas, 'Novitah', nc.novitah.id, 'Cliente Vínculo');
    assert.equal(r.nc_numero, nc.novitah.numero);
    assert.equal(r.legado, false);

    const ncFechada = (
      await como(
        c1,
        u.editorNc,
        "insert into public.nao_conformidades (empresa, cliente, origem, status) values ('Alinare', 'Cliente Fechada', 'Outro', 'Encerrada') returning id"
      )
    ).rows[0];
    const erro = await falha(novaReversa(u.solicitanteAlinare, 'Alinare', ncFechada.id));
    assert.match(erro?.message ?? '', /Aberta ou Em tratativa/);
  });

  it('empresa da NC trava depois da primeira reversa', async () => {
    const erro = await falha(como(c1, u.editorNc, "update public.nao_conformidades set empresa = 'Azime' where id = $1", [nc.alinare.id]));
    assert.match(erro?.message ?? '', /não pode mudar/);
  });

  it('linha do tempo da NC registra a reversa gerada', async () => {
    const timeline = await q('select acao from public.nc_historico where nc_id = $1', [nc.novitah.id]);
    assert.ok(timeline.some((t) => t.acao.startsWith('Reversa gerada (Novitah)')));
  });

  it('formulário lista só NCs abertas da empresa', async () => {
    const codigos = (await como(c1, u.solicitanteAlinare, "select codigo from public.ncs_para_reversa('Alinare')")).rows.map(
      (r) => r.codigo
    );
    assert.ok(codigos.includes(`NC-${String(nc.alinare.numero).padStart(4, '0')}`));
    assert.equal((await como(c1, u.solicitanteAlinare, "select count(*)::int as n from public.ncs_para_reversa('Novitah')")).rows[0].n, 0);
  });
});

describe('base — etiqueta (storage)', () => {
  it('quem não movimenta a empresa não anexa; quem não vê não abre', async () => {
    const r = await novaReversa(u.solicitanteNovitah, 'Novitah', nc.novitah.id, 'Cliente Etiqueta Novitah');
    await aprovar(u.aprovadorNovitah, r.id, 1);
    const caminho = `${r.id}/etiqueta.pdf`;
    const inserir = (persona) =>
      como(c1, persona, "insert into storage.objects (bucket_id, name) values ('etiquetas', $1)", [caminho]);
    assert.match((await falha(inserir(u.solicitanteNovitah)))?.message ?? '', /row-level security/);
    assert.match((await falha(inserir(u.listaAlinareNc)))?.message ?? '', /row-level security/);
    assert.match((await falha(inserir(u.emissorAlinare)))?.message ?? '', /row-level security/);
    await inserir(u.emissorNovitah);
    const contar = async (persona) =>
      (await como(c1, persona, "select count(*)::int as n from storage.objects where name = $1", [caminho])).rows[0].n;
    assert.equal(await contar(u.solicitanteNovitah), 1);
    assert.equal(await contar(u.solicitanteAlinare), 0);
    assert.equal((await como(c1, u.listaAlinareNc, 'delete from storage.objects where name = $1 returning id', [caminho])).rows.length, 0);
  });

  it('bucket privado e só PDF', async () => {
    const bucket = await um("select public, allowed_mime_types from storage.buckets where id = 'etiquetas'");
    assert.equal(bucket.public, false);
    assert.deepEqual(bucket.allowed_mime_types, ['application/pdf']);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('script único do SQL Editor', () => {
  it('atualiza uma base legada quando executado uma vez e mantém o contrato final da fila', async () => {
    // O pacote do SQL Editor reaplica migrations históricas em ordem; testar no
    // banco já atualizado tentaria aplicar a assinatura antiga antes da nova.
    const bancoScript = await iniciarBanco();
    try {
      await bancoScript.aplicarArquivo('SQL_EDITOR_SETUP_NC_REVERSA.sql');
      const funcao = (
        await bancoScript.dono.query(`
          select pg_get_function_result('public.fila_aprovacao_reversas()'::regprocedure) as retorno,
                 has_function_privilege('authenticated', 'public.fila_aprovacao_reversas()', 'EXECUTE') as authenticated,
                 has_function_privilege('anon', 'public.fila_aprovacao_reversas()', 'EXECUTE') as anon
        `)
      ).rows[0];
      assert.match(funcao.retorno, /endereco_destino_troca/);
      assert.equal(funcao.authenticated, true);
      assert.equal(funcao.anon, false);
      // Contrato final da comunicação, reconciliação e relatórios (migrations 20261027*).
      const objetos = (await bancoScript.dono.query(`
        select to_regprocedure('public.reconciliar_comunicacao_reversa(uuid,text,text,text)') is not null as reconciliar,
               to_regprocedure('public.relatorio_reversa(text,text,date,date)') is not null as relatorio,
               to_regprocedure('public.listar_recebimentos_fisicos_pendentes()') is not null as fisico_pendentes,
               to_regprocedure('public.reversa_conclusao_por_correios(uuid)') is not null as origem_conclusao,
               has_function_privilege('authenticated', 'public.reversa_conclusao_por_correios(uuid)', 'EXECUTE') as origem_exposta,
               to_regprocedure('public.registrar_postagem_rastreio(uuid,text,date)') is not null as postagem_rastreio,
               has_function_privilege('authenticated', 'public.registrar_postagem_rastreio(uuid,text,date)', 'EXECUTE') as postagem_rastreio_exposta,
               has_function_privilege('service_role', 'public.registrar_postagem_rastreio(uuid,text,date)', 'EXECUTE') as postagem_rastreio_servico,
               to_regclass('public.reversa_recebimentos_confirmados') is not null as recebimentos,
               to_regclass('public.reversa_comunicacoes_reconciliacoes') is not null as auditoria,
               (select count(*) from pg_constraint where conrelid = 'public.reversa_comunicacoes_etiqueta'::regclass and contype = 'u') as uniques,
               has_function_privilege('anon', 'public.reconciliar_comunicacao_reversa(uuid,text,text,text)', 'EXECUTE') as anon_reconcilia
      `)).rows[0];
      assert.deepEqual(objetos, {
        reconciliar: true, relatorio: true, fisico_pendentes: true, origem_conclusao: true, origem_exposta: false, postagem_rastreio: true, postagem_rastreio_exposta: false, postagem_rastreio_servico: true, recebimentos: true, auditoria: true, uniques: '0', anon_reconcilia: false,
      });
    } finally {
      await bancoScript.encerrar();
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Por último: muda o legado que os testes anteriores usam
describe('legado pendente passa a exigir aprovação (opcional, admin)', () => {
  it('só o admin converte; só o legado que não começou a expedição; registra no histórico', async () => {
    const naoAdmin = await falha(como(c1, u.gestorGeral, 'select public.exigir_aprovacao_legado_pendente()'));
    assert.equal(naoAdmin?.code, '42501');

    const convertidas = (await como(c1, u.admin, 'select public.exigir_aprovacao_legado_pendente() as n')).rows[0].n;
    assert.ok(convertidas >= 1);

    const r = await reversa(legado.comNc);
    assert.equal(r.aprovacao_legada, false);
    assert.equal(r.aprovacao_status, 'aguardando_aprovacao');
    assert.equal(r.aprovacao_versao, 2);
    assert.equal(r.aprovacao_versao_por, null, 'conversão não conta como alteração de quem aprova');
    assert.equal(r.autorizacao, 'Autorizadora Declarada C', 'autorizador declarado continua para consulta');
    const [evento, ...outros] = await eventos(legado.comNc);
    assert.equal(outros.length, 0);
    assert.equal(evento.evento, 'invalidada');
    assert.equal(evento.situacao_anterior, 'legado');
    assert.equal(evento.user_id, u.admin.id);
    assert.match(evento.justificativa, /decisão administrativa/);

    // Em trânsito continua legado
    assert.equal((await reversa(legado.novitahPostado)).aprovacao_legada, true);
    // A marca de decisão não ficou ligada: proteções seguem valendo
    const tentativa = await atualizar(u.solicitanteAlinare, legado.comNc, { aprovacao_status: 'aprovada' });
    assert.equal(tentativa.rows.length, 0, 'legado convertido sem autoria não é atribuído ao solicitante pelo nome');
    assert.equal((await reversa(legado.comNc)).aprovacao_status, 'aguardando_aprovacao');
    // Agora entra na fila e é aprovada normalmente
    assert.ok((await fila(u.aprovadorAlinare)).some((i) => i.id === legado.comNc && i.aprovacao_versao === 2));
    assert.equal((await aprovar(u.aprovadorAlinare, legado.comNc, 2)).rows[0].aprovacao_status, 'aprovada');
  });
});
