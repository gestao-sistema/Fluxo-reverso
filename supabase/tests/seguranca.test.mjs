// Testes de segurança do banco: papéis anon e authenticated (RLS de verdade, sem superusuário),
// usuários de empresas diferentes, capacidades, atomicidade, histórico imutável e PDFs.
// Uso: cd supabase/tests && npm test
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ANON, como, criarUsuario, iniciarBanco, migrationsNovas } from './lib/banco.mjs';

let banco;
let db; // dono do banco: prepara dados e confere resultados sem RLS
let c1; // conexão dos usuários
const u = {};
const r = {};

const falha = (promessa) => promessa.then(() => null, (erro) => erro);
const linhas = async (persona, sql, params) => (await como(c1, persona, sql, params)).rows;

const INSERIR = `insert into public.solicitacoes_reverso
  (empresa, data_solicitacao, solicitante, setor, codigo_cliente, nome_cliente, endereco_postagem, motivo)
  values ($1, current_date, 'Fulana', 'Financeiro', 1, $2, 'Rua A, 1', 'Outros') returning *`;

async function novaReversa(solicitante, aprovador, empresa, cliente) {
  const criada = (await como(c1, solicitante, INSERIR, [empresa, cliente])).rows[0];
  await como(c1, aprovador, 'select public.aprovar_reversa($1, 1, null)', [criada.id]);
  return criada;
}

before(async () => {
  banco = await iniciarBanco();
  db = banco.dono;
  for (const arquivo of migrationsNovas()) await banco.aplicar(arquivo);
  c1 = await banco.conectar();

  u.consulta = await criarUsuario(db, 'Consulta Geral', ['dashboard-geral', 'lista-geral', 'kanban-edit']);
  u.solicitanteAlinare = await criarUsuario(db, 'Solicitante Alinare', ['formulario-alinare']);
  u.solicitanteNovitah = await criarUsuario(db, 'Solicitante Novitah', ['formulario-novitah']);
  u.aprovadorAlinare = await criarUsuario(db, 'Aprovadora Alinare', ['aprovar-alinare']);
  u.aprovadorNovitah = await criarUsuario(db, 'Aprovador Novitah', ['aprovar-novitah']);
  u.emissorAlinare = await criarUsuario(db, 'Emissora Alinare', ['emitir-alinare']);
  u.emissorNovitah = await criarUsuario(db, 'Emissora Novitah', ['emitir-novitah']);
  u.checkinAlinare = await criarUsuario(db, 'Postagem Alinare', ['confirmar-alinare']);
  u.admin = await criarUsuario(db, 'Administradora', ['usuarios']);
  // Apagar reversa é função administrativa, mas só vale sobre o que a pessoa enxerga: precisa da tela Pedidos.
  u.adminPedidos = await criarUsuario(db, 'Administradora com Pedidos', ['usuarios', 'lista-geral']);
  u.semTelas = await criarUsuario(db, 'Sem Telas', []);

  // Setup administrativo explícito das combinações usadas nesta suíte.
  const todosSetores = (usuario) => ({ usuario_id: usuario.id, todos_setores: true, setores: [] });
  await como(c1, u.admin, 'select public.salvar_config_aprovadores_reversa($1, $2::jsonb)', [
    'Alinare', JSON.stringify([todosSetores(u.aprovadorAlinare)]),
  ]);
  await como(c1, u.admin, 'select public.salvar_config_aprovadores_reversa($1, $2::jsonb)', [
    'Novitah', JSON.stringify([todosSetores(u.aprovadorNovitah)]),
  ]);

  r.alinare = await novaReversa(u.solicitanteAlinare, u.aprovadorAlinare, 'Alinare', 'Cliente Alinare');
  r.novitah = await novaReversa(u.solicitanteNovitah, u.aprovadorNovitah, 'Novitah', 'Cliente Novitah');
  // Emissão vigente da reversa da Alinare (sem PDF): alvo das operações de emissão e postagem
  await como(c1, u.emissorAlinare, 'select public.registrar_emissao_reversa($1, null, $2, $3, current_date, null)', [
    r.alinare.id,
    'AUT-0',
    'AA000000020BR',
  ]);
});

after(async () => {
  await banco?.encerrar();
});

describe('autoria em INSERT autenticado', () => {
  it('RETURNING funciona para o solicitante autorizado e a autoria vem do servidor', () => {
    assert.equal(r.alinare.empresa, 'Alinare');
    assert.equal(r.alinare.solicitado_por, u.solicitanteAlinare.id);
    assert.equal(r.alinare.solicitante, u.solicitanteAlinare.nome);
    assert.equal(r.alinare.solicitado_por_nome, u.solicitanteAlinare.nome);
  });
});

describe('anon não acessa dados nem funções', () => {
  it('anon não lê, não grava e não chama as funções de aprovação e emissão', async () => {
    assert.equal((await falha(como(c1, ANON, 'select count(*) from public.solicitacoes_reverso')))?.code, '42501');
    assert.equal((await falha(como(c1, ANON, INSERIR, ['Alinare', 'Cliente anon'])))?.code, '42501');
    assert.equal((await falha(como(c1, ANON, 'select public.aprovar_reversa($1, 1, null)', [r.alinare.id])))?.code, '42501');
    assert.equal(
      (await falha(como(c1, ANON, 'select public.pode_operar_emissao($1, $2)', [r.alinare.id, 'registrar'])))?.code,
      '42501'
    );
  });

  it('nenhuma tabela do schema public é concedida a anon', async () => {
    const { rows } = await db.query(
      "select table_name from information_schema.role_table_grants where grantee = 'anon' and table_schema = 'public'"
    );
    assert.deepEqual(rows, []);
  });

  it('nenhuma função do schema public é executável por PUBLIC nem por anon', async () => {
    const { rows: publico } = await db.query(`
      select p.proname
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace,
           aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
      where n.nspname = 'public' and a.grantee = 0 and a.privilege_type = 'EXECUTE'`);
    assert.deepEqual(publico, [], 'EXECUTE para PUBLIC');
    const { rows: anon } = await db.query(`
      select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'EXECUTE')`);
    assert.deepEqual(anon, [], 'EXECUTE para anon');
  });

  it('authenticated não tem TRUNCATE, REFERENCES nem TRIGGER nas tabelas de negócio', async () => {
    const { rows } = await db.query(`
      select table_name, privilege_type from information_schema.role_table_grants
      where grantee = 'authenticated' and table_schema = 'public'
        and privilege_type in ('TRUNCATE', 'REFERENCES', 'TRIGGER')`);
    assert.deepEqual(rows, []);
  });
});

describe('consulta não altera, não aprova, não emite e não confirma postagem', () => {
  it('não insere reversa', async () => {
    assert.ok(await falha(como(c1, u.consulta, INSERIR, ['Alinare', 'Cliente consulta'])));
  });

  it('não altera dados, anotações nem etapa (a RLS filtra; nada muda)', async () => {
    const antes = (await db.query('select * from public.solicitacoes_reverso where id = $1', [r.alinare.id])).rows[0];
    const alterados = await linhas(u.consulta, "update public.solicitacoes_reverso set motivo = 'Mercadoria errada', anotacoes = 'x', status = 'postado' where id = $1 returning id", [
      r.alinare.id,
    ]);
    assert.equal(alterados.length, 0);
    const depois = (await db.query('select * from public.solicitacoes_reverso where id = $1', [r.alinare.id])).rows[0];
    assert.deepEqual(depois, antes);
  });

  it('não aprova nem rejeita', async () => {
    assert.ok(await falha(como(c1, u.consulta, 'select public.aprovar_reversa($1, 1, null)', [r.alinare.id])));
    assert.ok(await falha(como(c1, u.consulta, "select public.rejeitar_reversa($1, 1, 'motivo')", [r.alinare.id])));
  });

  it('não registra emissão nem anexa PDF', async () => {
    assert.equal(
      (await falha(como(c1, u.consulta, 'select public.registrar_emissao_reversa($1, null, $2, $3, current_date, null)', [
        r.alinare.id,
        'AUT-CONSULTA',
        'AA000000021BR',
      ])))?.code,
      '42501'
    );
    assert.ok(
      await falha(como(c1, u.consulta, "insert into storage.objects (bucket_id, name) values ('etiquetas', $1)", [`${r.alinare.id}/x.pdf`]))
    );
  });

  it('não confirma postagem', async () => {
    const emissao = (await db.query('select id from public.reversa_emissoes where solicitacao_id = $1', [r.alinare.id])).rows[0];
    assert.equal(
      (await falha(como(c1, u.consulta, 'select public.confirmar_postagem_emissao($1, current_date, null)', [emissao.id])))?.code,
      '42501'
    );
  });

  it('não altera a configuração de autoaprovação', async () => {
    const alterados = await linhas(u.consulta, 'update public.aprovacao_config set permitir_autoaprovacao = true returning id');
    assert.equal(alterados.length, 0);
    const { rows } = await db.query('select permitir_autoaprovacao from public.aprovacao_config');
    assert.equal(rows[0].permitir_autoaprovacao, false);
  });

  // A flag liga o caminho da RPC, mas a capacidade de quem executa ainda é conferida no trigger.
  it('flag de aprovação não basta: consulta não muda a decisão (a linha nem fica visível para ela)', async () => {
    const erro = await falha(
      como(
        c1,
        u.consulta,
        `select set_config('app.aprovacao_decisao', 'sim', true);
         update public.solicitacoes_reverso set aprovacao_status = 'rejeitada' where id = '${r.alinare.id}'`
      )
    );
    assert.ok(erro === null || erro.code === '42501', String(erro?.message));
    const { rows } = await db.query('select aprovacao_status from public.solicitacoes_reverso where id = $1', [r.alinare.id]);
    assert.equal(rows[0].aprovacao_status, 'aprovada');
  });

  it('flag de aprovação não basta: quem só emite é recusado pela capacidade de aprovar', async () => {
    const erro = await falha(
      como(
        c1,
        u.emissorAlinare,
        `select set_config('app.aprovacao_decisao', 'sim', true);
         update public.solicitacoes_reverso set aprovacao_status = 'rejeitada' where id = '${r.alinare.id}'`
      )
    );
    assert.equal(erro?.code, '42501');
    const { rows } = await db.query('select aprovacao_status from public.solicitacoes_reverso where id = $1', [r.alinare.id]);
    assert.equal(rows[0].aprovacao_status, 'aprovada');
  });

  it('flag de emissão não basta: quem só emite não registra postagem (exige confirmar-checkin)', async () => {
    const erro = await falha(
      como(
        c1,
        u.emissorAlinare,
        `select set_config('emissoes.sincronizando', 'sim', true);
         update public.solicitacoes_reverso set status = 'postado', postado_em = now() where id = '${r.alinare.id}'`
      )
    );
    assert.equal(erro?.code, '42501');
    const { rows } = await db.query('select status from public.solicitacoes_reverso where id = $1', [r.alinare.id]);
    assert.notEqual(rows[0].status, 'postado', 'a etapa não avançou para postado');
  });

  it('flag de emissão não basta: quem só confirma postagem não registra etiqueta', async () => {
    const erro = await falha(
      como(
        c1,
        u.checkinAlinare,
        `select set_config('emissoes.sincronizando', 'sim', true);
         update public.solicitacoes_reverso set codigo_rastreio = 'AA000000099BR' where id = '${r.alinare.id}'`
      )
    );
    assert.equal(erro?.code, '42501');
  });
});

describe('empresa A não acessa a empresa B', () => {
  it('não lê nem altera reversa de outra empresa', async () => {
    assert.equal((await linhas(u.solicitanteAlinare, 'select id from public.solicitacoes_reverso where id = $1', [r.novitah.id])).length, 0);
    const alterados = await linhas(u.solicitanteAlinare, "update public.solicitacoes_reverso set motivo = 'Outros' where id = $1 returning id", [
      r.novitah.id,
    ]);
    assert.equal(alterados.length, 0);
  });

  it('não registra emissão nem lê PDF de outra empresa', async () => {
    assert.equal(
      (await falha(como(c1, u.emissorAlinare, 'select public.registrar_emissao_reversa($1, null, $2, $3, current_date, null)', [
        r.novitah.id,
        'AUT-CRUZADA',
        'AA000000022BR',
      ])))?.code,
      '42501'
    );
    await db.query("insert into storage.objects (bucket_id, name) values ('etiquetas', $1)", [`${r.novitah.id}/cruzado.pdf`]);
    assert.equal(
      (await linhas(u.solicitanteAlinare, "select id from storage.objects where bucket_id = 'etiquetas' and name = $1", [
        `${r.novitah.id}/cruzado.pdf`,
      ])).length,
      0
    );
    assert.ok(
      await falha(como(c1, u.emissorAlinare, "insert into storage.objects (bucket_id, name) values ('etiquetas', $1)", [
        `${r.novitah.id}/outro.pdf`,
      ]))
    );
  });

  it('o aprovador de uma empresa não decide sobre a outra', async () => {
    assert.ok(await falha(como(c1, u.aprovadorAlinare, 'select public.aprovar_reversa($1, 1, null)', [r.novitah.id])));
  });
  it('não lê emissões nem histórico da outra empresa', async () => {
    await db.query("insert into public.solicitacoes_historico (solicitacao_id, user_nome, acao) values ($1, 'Teste', 'leitura cruzada')", [r.alinare.id]);
    assert.equal((await linhas(u.solicitanteNovitah, 'select id from public.reversa_emissoes where solicitacao_id = $1', [r.alinare.id])).length, 0);
    assert.equal((await linhas(u.solicitanteNovitah, 'select 1 from public.solicitacoes_historico where solicitacao_id = $1', [r.alinare.id])).length, 0);
    assert.equal((await linhas(u.solicitanteNovitah, 'select 1 from public.rastreamento_correios where solicitacao_id = $1', [r.alinare.id])).length, 0);
    // A própria empresa lê o que é dela
    assert.ok((await linhas(u.solicitanteAlinare, 'select 1 from public.solicitacoes_historico where solicitacao_id = $1', [r.alinare.id])).length >= 1);
  });
});

describe('decisão, histórico e exclusão', () => {
  it('rejeição sem justificativa é recusada no backend', async () => {
    const pendente = await novaReversa(u.solicitanteAlinare, u.aprovadorAlinare, 'Alinare', 'Cliente sem justificativa');
    await como(c1, u.aprovadorAlinare, 'select public.aprovar_reversa($1, 1, null)', [pendente.id]).catch(() => null);
    const outra = await como(c1, u.solicitanteAlinare, INSERIR, ['Alinare', 'Cliente rejeição']);
    const id = outra.rows[0].id;
    for (const justificativa of ['', '   ', null]) {
      const erro = await falha(como(c1, u.aprovadorAlinare, 'select public.rejeitar_reversa($1, 1, $2)', [id, justificativa]));
      assert.equal(erro?.code, '23514', `justificativa ${JSON.stringify(justificativa)}`);
    }
    assert.equal((await db.query('select aprovacao_status from public.solicitacoes_reverso where id = $1', [id])).rows[0].aprovacao_status, 'aguardando_aprovacao');
  });

  it('decisão e histórico são atômicos: se o histórico falha, a decisão não fica gravada', async () => {
    const pendente = await como(c1, u.solicitanteAlinare, INSERIR, ['Alinare', 'Cliente atomicidade']);
    const id = pendente.rows[0].id;
    await db.query(`create or replace function public.teste_falha_historico() returns trigger language plpgsql as $$
      begin raise exception 'falha simulada no histórico'; end; $$;
      create trigger teste_falha_historico before insert on public.solicitacoes_aprovacoes
        for each row execute function public.teste_falha_historico();`);
    try {
      const erro = await falha(como(c1, u.aprovadorAlinare, 'select public.aprovar_reversa($1, 1, null)', [id]));
      assert.match(erro?.message ?? '', /falha simulada/);
    } finally {
      await db.query('drop trigger teste_falha_historico on public.solicitacoes_aprovacoes; drop function public.teste_falha_historico();');
    }
    const depois = (await db.query('select aprovacao_status, aprovacao_decidida_por from public.solicitacoes_reverso where id = $1', [id])).rows[0];
    assert.equal(depois.aprovacao_status, 'aguardando_aprovacao');
    assert.equal(depois.aprovacao_decidida_por, null);
    assert.equal((await db.query('select count(*)::int as n from public.solicitacoes_aprovacoes where solicitacao_id = $1', [id])).rows[0].n, 0);
  });

  it('histórico da reversa não é alterado nem apagado, nem pelo admin', async () => {
    await db.query(
      "insert into public.solicitacoes_historico (solicitacao_id, user_nome, acao) values ($1, 'Teste', 'registro de teste')",
      [r.alinare.id]
    );
    // Sem permissão de UPDATE na tabela (nem o admin): a alteração é recusada
    const alterado = await falha(
      como(c1, u.admin, "update public.solicitacoes_historico set acao = 'adulterado' where solicitacao_id = $1 returning id", [r.alinare.id])
    );
    assert.equal(alterado?.code, '42501');
    assert.ok(await falha(como(c1, u.admin, 'delete from public.solicitacoes_historico where solicitacao_id = $1', [r.alinare.id])));
    const { rows } = await db.query(
      "select count(*)::int as n from public.solicitacoes_historico where solicitacao_id = $1 and acao = 'adulterado'",
      [r.alinare.id]
    );
    assert.equal(rows[0].n, 0);
  });

  it('decisões de aprovação não são alteradas nem apagadas', async () => {
    assert.ok(await falha(db.query("update public.solicitacoes_aprovacoes set user_nome = 'X' where solicitacao_id = $1", [r.alinare.id])));
    assert.ok(await falha(db.query('delete from public.solicitacoes_aprovacoes where solicitacao_id = $1', [r.alinare.id])));
  });

  it('reversa com decisão não é apagada, nem pelo admin', async () => {
    assert.ok(await falha(como(c1, u.adminPedidos, 'delete from public.solicitacoes_reverso where id = $1', [r.alinare.id])));
  });

  it('usuário comum não apaga reversa', async () => {
    const apagadas = await linhas(u.solicitanteAlinare, 'delete from public.solicitacoes_reverso where id = $1 returning id', [r.alinare.id]);
    assert.equal(apagadas.length, 0);
  });
});

describe('administração e processamento em lote', () => {
  it('usuário comum não converte legado nem administra a aprovação', async () => {
    assert.equal((await falha(como(c1, u.consulta, 'select public.exigir_aprovacao_legado_pendente()')))?.code, '42501');
  });

  it('usuário comum não grava rastreio (o lote roda com o serviço)', async () => {
    assert.ok(
      await falha(como(c1, u.emissorAlinare, "insert into public.rastreamento_correios (codigo_rastreio, solicitacao_id) values ('AA000000023BR', $1)", [r.alinare.id]))
    );
    assert.ok(
      await falha(como(c1, u.checkinAlinare, "update public.rastreamento_correios set codigo_rastreio = 'AA000000024BR' where solicitacao_id = $1", [r.alinare.id]))
    );
  });
});

describe('PDFs e reemissão', () => {
  it('reemissão cria nova emissão e preserva o PDF anterior (não é apagado nem sobrescrito)', async () => {
    const caminho1 = `${r.alinare.id}/emissao1.pdf`;
    const caminho2 = `${r.alinare.id}/emissao2.pdf`;
    const enviado1 = await linhas(u.emissorAlinare, "insert into storage.objects (bucket_id, name) values ('etiquetas', $1) returning name", [caminho1]);
    assert.equal(enviado1.length, 1, 'PDF 1 enviado pelo emissor');
    const vigente = (await db.query('select id from public.reversa_emissoes where solicitacao_id = $1 and substituida_em is null', [r.alinare.id])).rows[0];
    await como(c1, u.emissorAlinare, 'select public.anexar_pdf_emissao($1, $2, $3, null)', [vigente.id, caminho1, 'emissao1.pdf']);

    const enviado2 = await linhas(u.emissorAlinare, "insert into storage.objects (bucket_id, name) values ('etiquetas', $1) returning name", [caminho2]);
    assert.equal(enviado2.length, 1, 'PDF 2 enviado pelo emissor');
    await como(c1, u.emissorAlinare, 'select public.registrar_emissao_reversa($1, null, $2, $3, current_date, null, $4, $5, null, $6, null, null)', [
      r.alinare.id,
      'AUT-P2',
      'AA000000026BR',
      caminho2,
      'emissao2.pdf',
      'vencida_sem_uso',
    ]);

    const emissoes = (await db.query(
      'select sequencia, pdf_path, substituida_em from public.reversa_emissoes where solicitacao_id = $1 order by sequencia',
      [r.alinare.id]
    )).rows;
    const anterior = emissoes.find((e) => e.pdf_path === caminho1);
    assert.ok(anterior, 'emissão anterior continua registrada com o PDF');
    assert.ok(anterior.substituida_em, 'marcada como substituída, não apagada');
    assert.equal(emissoes.filter((e) => e.substituida_em === null).length, 1, 'uma emissão vigente');

    // O PDF anterior continua no armazenamento: nem o emissor nem o admin apagam, nem sobrescrevem
    assert.equal((await linhas(u.emissorAlinare, 'delete from storage.objects where name = $1 returning id', [caminho1])).length, 0);
    assert.equal((await linhas(u.admin, 'delete from storage.objects where name = $1 returning id', [caminho1])).length, 0);
    assert.equal((await linhas(u.emissorAlinare, 'update storage.objects set owner = $2 where name = $1 returning id', [caminho1, u.emissorAlinare.id])).length, 0);
    assert.equal((await db.query('select count(*)::int as n from storage.objects where name = $1', [caminho1])).rows[0].n, 1);
  });
});
