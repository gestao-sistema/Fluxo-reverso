// Privilégios das funções de gatilho e do auxiliar de classificação, e disparo dos gatilhos para quem grava.
// Gatilhos disparam sem EXECUTE de quem grava: a API não os chama. O auxiliar nc_classificacao_legada é
// chamado pelo gatilho de origem com o papel de quem grava a NC, então authenticated e service_role mantêm
// o EXECUTE. Também cobre inutilizar e restaurar da Lixeira. PostgreSQL local e temporário (embedded-postgres).
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { como, criarUsuario, iniciarBanco, migrationsNovas } from './lib/banco.mjs';

const INSERIR_NC = `insert into public.nao_conformidades
  (empresa, cliente, tipo_saida, data_ocorrencia, status, origem, tipo_problema, causador, custo_situacao, custo_produto, descricao)
  values ('Alinare', $1, 'Venda', '2026-10-01', 'Aberta', $2, $3, $4, $5, $6, 'Teste de gatilho')
  returning id, numero, tipo_problema, causador`;
const INSERIR_REVERSA = `insert into public.solicitacoes_reverso
  (empresa, data_solicitacao, solicitante, setor, codigo_cliente, nome_cliente, endereco_postagem, motivo)
  values ($1, current_date, 'Fulana', 'Financeiro', 1, $2, 'Rua A, 1', 'Outros') returning *`;
const PRIVILEGIOS = `select p.proname,
    exists (select 1 from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
            where a.grantee = 0 and a.privilege_type = 'EXECUTE') as publico,
    has_function_privilege('anon', p.oid, 'EXECUTE') as anon,
    has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated,
    has_function_privilege('service_role', p.oid, 'EXECUTE') as service_role
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname in (
    'chamado_lixeira_proteger_atualizacao', 'nc_validar_custo_situacao', 'nc_classificar_origem_legada',
    'nc_validar_classificacao_registro', 'nc_classificacao_legada')`;

let banco;
let db; // dono do banco: prepara dados e confere resultados sem RLS
let c1; // conexão dos usuários (cada chamada assume o papel na transação)
const u = {};

const falha = (promessa) => promessa.then(() => null, (erro) => erro);

before(async () => {
  banco = await iniciarBanco();
  db = banco.dono;
  c1 = await banco.conectar();
  for (const arquivo of migrationsNovas()) await banco.aplicar(arquivo);

  u.editor = await criarUsuario(db, 'Editora Gatilho', ['nc-edit']);
  // Admin que vê e opera a Alinare: a leitura e a política de UPDATE do reverso exigem escopo da empresa
  u.admin = await criarUsuario(db, 'Administradora Gatilho', ['usuarios', 'lista-geral', 'formulario-alinare']);
  u.solicitante = await criarUsuario(db, 'Solicitante Gatilho', ['formulario-alinare']);
});

after(async () => {
  await banco?.encerrar();
});

describe('privilégios de EXECUTE', () => {
  it('funções de gatilho não são executáveis por PUBLIC, anon, authenticated nem service_role; o auxiliar só por authenticated e service_role', async () => {
    const { rows } = await db.query(PRIVILEGIOS);
    const real = Object.fromEntries(rows.map((r) => [r.proname, {
      publico: r.publico, anon: r.anon, authenticated: r.authenticated, service_role: r.service_role,
    }]));
    const negado = { publico: false, anon: false, authenticated: false, service_role: false };
    assert.deepEqual(real, {
      chamado_lixeira_proteger_atualizacao: negado,
      nc_validar_custo_situacao: negado,
      nc_classificar_origem_legada: negado,
      nc_validar_classificacao_registro: negado,
      nc_classificacao_legada: { publico: false, anon: false, authenticated: true, service_role: true },
    });
  });
});

describe('gatilhos disparam para quem grava, sem EXECUTE na função', () => {
  it('a regra da situação do custo recusa "Não" com valor, também na criação pelo editor', async () => {
    const erro = await falha(como(c1, u.editor, INSERIR_NC, ['Casa Custo', null, 'Endereço incorreto', 'Expedição', 'Não', 20]));
    assert.equal(erro?.code, '23514');
    assert.match(erro.message, /exige custos sem valor/);
  });

  it('a origem antiga é classificada pelo gatilho com o papel do editor (o auxiliar roda com esse papel)', async () => {
    const criada = (await como(c1, u.editor, INSERIR_NC, ['Casa Mapeada', 'Atraso de postagem', null, null, 'Em apuração', null])).rows[0];
    assert.equal(criada.tipo_problema, 'Atraso de postagem');
    assert.equal(criada.causador, 'Expedição');
  });

  it('registro sem tipo do problema é recusado pelo gatilho, também para o editor', async () => {
    const erro = await falha(como(c1, u.editor, INSERIR_NC, ['Casa Sem Tipo', null, null, 'Expedição', 'Em apuração', null]));
    assert.equal(erro?.code, '23514');
    assert.match(erro.message, /Informe o tipo do problema/);
  });
});

describe('Lixeira: inutilizar e restaurar continuam, e o gatilho segue valendo para quem grava', () => {
  it('só o admin arquiva; o arquivado não muda por UPDATE de quem não é dono; restaurar devolve o chamado', async () => {
    const chamado = (await db.query(INSERIR_REVERSA, ['Alinare', 'Cliente Lixeira'])).rows[0];
    const recusado = await falha(como(c1, u.solicitante, 'select * from public.inutilizar_chamado($1)', [chamado.id]));
    assert.equal(recusado?.code, '42501');

    const arquivado = (await como(c1, u.admin, 'select * from public.inutilizar_chamado($1)', [chamado.id])).rows[0];
    assert.notEqual(arquivado.inutilizada_em, null);

    // Arquivado: a leitura (RLS) deixa a linha de fora, então o UPDATE não alcança nada
    const alterado = await como(c1, u.admin, 'update public.solicitacoes_reverso set nome_cliente = $1 where id = $2', ['Alterado', chamado.id]);
    assert.equal(alterado.rowCount, 0);
    const [{ nome_cliente: nomeDepois }] = (await db.query('select nome_cliente from public.solicitacoes_reverso where id = $1', [chamado.id])).rows;
    assert.equal(nomeDepois, 'Cliente Lixeira', 'o chamado arquivado não foi alterado');

    const restaurado = (await como(c1, u.admin, 'select * from public.restaurar_chamado($1)', [chamado.id])).rows[0];
    assert.equal(restaurado.inutilizada_em, null);
  });

  it('arquivar por UPDATE direto é recusado pelo gatilho, com o papel do admin (a linha está visível para ele)', async () => {
    const chamado = (await db.query(INSERIR_REVERSA, ['Alinare', 'Cliente Visível'])).rows[0];
    const erro = await falha(como(c1, u.admin,
      "update public.solicitacoes_reverso set inutilizada_em = now(), inutilizada_por_nome = 'Admin' where id = $1", [chamado.id]));
    assert.equal(erro?.code, '42501');
    assert.match(erro.message, /Use a operação administrativa da Lixeira/);
  });

  it('o gatilho recusa criar um chamado já arquivado pela API', async () => {
    const erro = await falha(como(c1, u.solicitante,
      `insert into public.solicitacoes_reverso
        (empresa, data_solicitacao, solicitante, setor, codigo_cliente, nome_cliente, endereco_postagem, motivo, inutilizada_em, inutilizada_por_nome)
        values ('Alinare', current_date, 'Fulana', 'Financeiro', 1, 'Arquivada', 'Rua A, 1', 'Outros', now(), 'Fulana')`));
    assert.match(erro?.message ?? '', /Use a operação administrativa da Lixeira/);
  });
});
