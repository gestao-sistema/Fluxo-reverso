import { describe, expect, it } from 'vitest';
import {
  DEFINICOES_LEGADAS,
  DEFINICOES_TELAS,
  EMPRESAS_VALIDAS,
  TELAS_LEGADAS,
  TELAS_OFICIAIS,
  normalizarAcesso,
  pendenciasDoAcesso,
  setoresDaEmpresa,
  telasLegadasDe,
  telasOficiaisDe,
  type EscopoAprovacao,
} from '../lib/acesso';
import { SETORES } from '../types';

// Cadastro oficial por tela: o que o administrador grava (perfil, empresas, telas e escopo de
// aprovação) e o mapeamento tela → operações. A autoridade final é o banco
// (supabase/tests/acesso-por-tela.test.mjs); aqui se verifica a validação do cadastro.

const todos = (empresa: string): EscopoAprovacao => ({ empresa, todos_setores: true, setores: [] });
const setores = (empresa: string, ...lista: string[]): EscopoAprovacao => ({ empresa, todos_setores: false, setores: lista });

describe('mapeamento tela → operações', () => {
  it('cada tela oferecida no cadastro tem definição, e só elas', () => {
    expect(DEFINICOES_TELAS.map((item) => item.tela).sort()).toEqual([...TELAS_OFICIAIS].sort());
    for (const definicao of DEFINICOES_TELAS) {
      expect(definicao.operacoes.length, definicao.tela).toBeGreaterThan(0);
      expect(definicao.rotulo.trim(), definicao.tela).not.toBe('');
    }
  });

  it('Kanban, check-in e Status não são oferecidos; continuam como identificadores antigos com definição', () => {
    for (const antiga of ['kanban', 'kanban-edit', 'confirmar-checkin', 'status-geral', 'nc']) {
      expect((TELAS_OFICIAIS as readonly string[]).includes(antiga), antiga).toBe(false);
      expect((TELAS_LEGADAS as readonly string[]).includes(antiga), antiga).toBe(true);
      expect(DEFINICOES_LEGADAS[antiga].rotulo.length).toBeGreaterThan(0);
    }
    expect(Object.keys(DEFINICOES_LEGADAS).sort()).toEqual([...TELAS_LEGADAS].sort());
  });

  it('uma ação especializada só vem da tela dela: Pedidos e Dashboard não aprovam, emitem nem recebem', () => {
    for (const tela of ['lista-geral', 'lista-alinare', 'lista-novitah', 'dashboard-geral', 'dashboard-alinare', 'dashboard-novitah']) {
      const definicao = DEFINICOES_TELAS.find((item) => item.tela === tela)!;
      expect(definicao.operacoes.join(' ')).not.toMatch(/aprovar|emitir|reemitir|registrar|confirmar/i);
      expect(definicao.naoConcede.join(' ')).toMatch(/Aprovar/);
    }
    const aprovacoes = DEFINICOES_TELAS.find((item) => item.tela === 'aprovar-reversa')!;
    expect(aprovacoes.escopo).toBe('aprovacao');
    expect(aprovacoes.naoConcede.join(' ')).toMatch(/próprio pedido/);
    expect(DEFINICOES_TELAS.find((item) => item.tela === 'emitir-etiqueta')!.escopo).toBe('empresas');
    expect(DEFINICOES_TELAS.find((item) => item.tela === 'usuarios')!.naoConcede.join(' ')).toMatch(/Consultar pedidos e NC/);
  });

  it('telas oficiais e antigas se separam sem perder nenhum identificador', () => {
    const telas = ['dashboard-geral', 'kanban-edit', 'aprovar-reversa', 'status-geral'];
    expect(telasOficiaisDe(telas)).toEqual(['dashboard-geral', 'aprovar-reversa']);
    expect(telasLegadasDe(telas)).toEqual(['kanban-edit', 'status-geral']);
  });

  it('setores oferecidos: os padrão da empresa e os já usados, sem o Comercial da outra empresa', () => {
    const alinare = setoresDaEmpresa('Alinare', SETORES, [{ empresa: 'Alinare', setor: 'Setor antigo' }, { empresa: 'Novitah', setor: 'Outro' }]);
    expect(alinare).toContain('Comercial Alinare');
    expect(alinare).not.toContain('Comercial Novitah');
    expect(alinare).toContain('Setor antigo');
    expect(alinare).not.toContain('Outro');
  });
});

describe('cadastro de usuário personalizado', () => {
  it('solicitante de uma empresa: só o formulário dela, sem escopo de aprovação', () => {
    const acesso = normalizarAcesso({ perfilAcesso: 'personalizado', telas: ['formulario-alinare'], empresasAcesso: [] });
    expect(acesso).toEqual({ perfilAcesso: 'personalizado', empresasAcesso: [], telas: ['formulario-alinare'], aprovacao: [] });
  });

  it('aprovador de uma empresa e um setor: tela, empresa e escopo gravados juntos', () => {
    const acesso = normalizarAcesso({
      perfilAcesso: 'personalizado', telas: ['aprovar-reversa'], empresasAcesso: ['Alinare'],
      aprovacao: [setores('Alinare', 'Comercial Alinare')],
    });
    expect(acesso.telas).toEqual(['aprovar-reversa']);
    expect(acesso.empresasAcesso).toEqual(['Alinare']);
    expect(acesso.aprovacao).toEqual([setores('Alinare', 'Comercial Alinare')]);
  });

  it('aprovador de todos os setores das empresas selecionadas, explicitamente', () => {
    const acesso = normalizarAcesso({
      perfilAcesso: 'personalizado', telas: ['aprovar-reversa'], empresasAcesso: ['Alinare', 'Novitah'],
      aprovacao: [todos('Alinare'), setores('Novitah', 'Financeiro', 'Comercial Novitah')],
    });
    expect(acesso.aprovacao).toEqual([todos('Alinare'), setores('Novitah', 'Comercial Novitah', 'Financeiro')]);
  });

  it('exige empresa e escopo válido antes de salvar Aprovações', () => {
    const base = { perfilAcesso: 'personalizado', telas: ['aprovar-reversa'] };
    expect(() => normalizarAcesso({ ...base, empresasAcesso: [] })).toThrow(/ao menos uma empresa/);
    expect(() => normalizarAcesso({ ...base, empresasAcesso: ['Alinare'] })).toThrow(/Informe os setores de aprovação de Alinare/);
    expect(() => normalizarAcesso({ ...base, empresasAcesso: ['Alinare'], aprovacao: [setores('Alinare')] }))
      .toThrow(/Informe os setores de aprovação de Alinare/);
    expect(() => normalizarAcesso({ ...base, empresasAcesso: ['Alinare'], aprovacao: [{ empresa: 'Alinare', todos_setores: true, setores: ['Financeiro'] }] }))
      .toThrow(/todos os setores ou setores específicos, não os dois/);
    expect(() => normalizarAcesso({ ...base, empresasAcesso: ['Alinare', 'Novitah'], aprovacao: [todos('Alinare')] }))
      .toThrow(/Informe os setores de aprovação de Novitah/);
    expect(() => normalizarAcesso({ ...base, empresasAcesso: ['Alinare'], aprovacao: [todos('Alinare'), todos('Novitah')] }))
      .toThrow(/Remova Novitah do escopo/);
    expect(() => normalizarAcesso({ ...base, empresasAcesso: ['Alinare'], aprovacao: [todos('Alinare'), todos('Alinare')] }))
      .toThrow(/só pode aparecer uma vez/);
    expect(() => normalizarAcesso({ ...base, empresasAcesso: ['Alinare'], aprovacao: [todos('Outra')] })).toThrow(/Empresa inválida/);
  });

  it('empresa vazia nunca vira acesso às duas empresas', () => {
    expect(() => normalizarAcesso({ perfilAcesso: 'personalizado', telas: ['emitir-etiqueta'], empresasAcesso: [] })).toThrow(/ao menos uma empresa/);
    const marcada = normalizarAcesso({ perfilAcesso: 'personalizado', telas: ['emitir-etiqueta'], empresasAcesso: ['Alinare'] });
    expect(marcada.empresasAcesso).toEqual(['Alinare']);
  });

  it('emissor de uma empresa, e acesso às duas empresas somente quando selecionado', () => {
    expect(normalizarAcesso({ perfilAcesso: 'personalizado', telas: ['emitir-etiqueta'], empresasAcesso: ['Novitah'] }))
      .toEqual({ perfilAcesso: 'personalizado', empresasAcesso: ['Novitah'], telas: ['emitir-etiqueta'], aprovacao: [] });
    const duas = normalizarAcesso({ perfilAcesso: 'personalizado', telas: ['emitir-etiqueta'], empresasAcesso: ['Alinare', 'Novitah'] });
    expect([...duas.empresasAcesso].sort()).toEqual([...EMPRESAS_VALIDAS].sort());
  });

  it('empresas só ficam gravadas quando alguma tela depende delas', () => {
    const acesso = normalizarAcesso({ perfilAcesso: 'personalizado', telas: ['dashboard-geral', 'lista-alinare'], empresasAcesso: ['Alinare', 'Novitah'] });
    expect(acesso.empresasAcesso).toEqual([]);
  });

  it('retirar o acesso: desmarcar Aprovações remove o escopo e as empresas que só ela exigia', () => {
    const antes = normalizarAcesso({
      perfilAcesso: 'personalizado', telas: ['aprovar-reversa', 'dashboard-geral'], empresasAcesso: ['Alinare'], aprovacao: [todos('Alinare')],
    });
    expect(antes.aprovacao).toHaveLength(1);
    const depois = normalizarAcesso({
      perfilAcesso: 'personalizado', telas: ['dashboard-geral'], empresasAcesso: ['Alinare'],
      telasAtuais: antes.telas, aprovacaoAtual: antes.aprovacao,
    });
    expect(depois).toEqual({ perfilAcesso: 'personalizado', empresasAcesso: [], telas: ['dashboard-geral'], aprovacao: [] });
  });

  it('na edição, o escopo gravado vale quando não é reenviado, e falta de escopo é recusada', () => {
    const base = { perfilAcesso: 'personalizado', telas: ['aprovar-reversa'], empresasAcesso: ['Alinare'] };
    expect(normalizarAcesso({ ...base, aprovacaoAtual: [setores('Alinare', 'Financeiro')] }).aprovacao).toEqual([setores('Alinare', 'Financeiro')]);
    expect(() => normalizarAcesso({ ...base, aprovacaoAtual: [] })).toThrow(/Informe os setores de aprovação de Alinare/);
  });

  it('identificadores antigos: preservados em quem já os tem, nunca concedidos a novos acessos', () => {
    expect(() => normalizarAcesso({ perfilAcesso: 'personalizado', telas: ['kanban-edit'], empresasAcesso: ['Alinare'] }))
      .toThrow(/não pode ser concedida a novos acessos/);
    const preservado = normalizarAcesso({
      perfilAcesso: 'personalizado', telas: ['kanban-edit', 'lista-geral'], empresasAcesso: ['Alinare'], telasAtuais: ['kanban-edit', 'lista-geral'],
    });
    expect(preservado.telas).toEqual(['kanban-edit', 'lista-geral']);
    // O recebimento físico antigo continua dependendo de empresa explícita.
    expect(() => normalizarAcesso({ perfilAcesso: 'personalizado', telas: ['kanban-edit'], empresasAcesso: [], telasAtuais: ['kanban-edit'] }))
      .toThrow(/ao menos uma empresa/);
    // Retirar o identificador antigo é permitido.
    expect(normalizarAcesso({ perfilAcesso: 'personalizado', telas: ['lista-geral'], empresasAcesso: [], telasAtuais: ['kanban-edit', 'lista-geral'] }).telas)
      .toEqual(['lista-geral']);
  });

  it('recusa tela desconhecida e cadastro sem nenhuma tela', () => {
    expect(() => normalizarAcesso({ perfilAcesso: 'personalizado', telas: ['inexistente'] })).toThrow(/Tela desconhecida/);
    expect(() => normalizarAcesso({ perfilAcesso: 'personalizado', telas: [] })).toThrow(/ao menos uma tela/);
  });

  it('Gestão de usuários é marcada explicitamente e não concede nenhuma outra operação', () => {
    const acesso = normalizarAcesso({ perfilAcesso: 'personalizado', telas: ['usuarios'], empresasAcesso: ['Alinare', 'Novitah'] });
    expect(acesso).toEqual({ perfilAcesso: 'personalizado', empresasAcesso: [], telas: ['usuarios'], aprovacao: [] });
  });
});

describe('perfis prontos e mestre usam as mesmas regras efetivas', () => {
  it('cada perfil pronto produz a tela, a empresa e o escopo que o personalizado equivalente produziria', () => {
    const empresas = ['Alinare', 'Novitah'];
    const pronto = normalizarAcesso({ perfilAcesso: 'aprovador', empresasAcesso: empresas });
    const manual = normalizarAcesso({ perfilAcesso: 'personalizado', telas: ['aprovar-reversa'], empresasAcesso: empresas, aprovacao: empresas.map(todos) });
    expect({ ...pronto, perfilAcesso: '' }).toEqual({ ...manual, perfilAcesso: '' });

    const emissor = normalizarAcesso({ perfilAcesso: 'emissor_etiqueta', empresasAcesso: ['Alinare'] });
    const emissorManual = normalizarAcesso({ perfilAcesso: 'personalizado', telas: ['emitir-etiqueta'], empresasAcesso: ['Alinare'] });
    expect({ ...emissor, perfilAcesso: '' }).toEqual({ ...emissorManual, perfilAcesso: '' });

    expect(normalizarAcesso({ perfilAcesso: 'solicitante', empresasAcesso: ['Novitah'] }).telas).toEqual(['formulario-novitah']);
    expect(() => normalizarAcesso({ perfilAcesso: 'aprovador', empresasAcesso: [] })).toThrow(/ao menos uma empresa/);
  });

  it('mestre: acesso total deliberado, com as duas empresas e aprovação em todos os setores', () => {
    const mestre = normalizarAcesso({ perfilAcesso: 'mestre' });
    expect(mestre.empresasAcesso).toEqual(['Alinare', 'Novitah']);
    expect(mestre.aprovacao).toEqual([todos('Alinare'), todos('Novitah')]);
    for (const tela of [...TELAS_OFICIAIS, ...TELAS_LEGADAS]) expect(mestre.telas).toContain(tela);
  });
});

describe('pendências do cadastro existente', () => {
  it('Aprovações sem escopo gravado e tela dependente de empresa sem empresa são sinalizadas', () => {
    const semEscopo = pendenciasDoAcesso({ telas: ['aprovar-reversa'], empresasAcesso: ['Alinare', 'Novitah'] }, [todos('Alinare')]);
    expect(semEscopo).toEqual(['Falta o escopo de aprovação de Novitah (todos os setores ou setores específicos).']);
    const semEmpresa = pendenciasDoAcesso({ telas: ['aprovar-reversa', 'emitir-etiqueta'], empresasAcesso: [] }, []);
    expect(semEmpresa).toHaveLength(1);
    expect(semEmpresa[0]).toMatch(/nenhuma empresa está marcada/);
  });

  it('cadastro completo, sem telas de empresa ou só com a gestão de usuários não gera pendência', () => {
    expect(pendenciasDoAcesso({ telas: ['aprovar-reversa'], empresasAcesso: ['Alinare'] }, [todos('Alinare')])).toEqual([]);
    expect(pendenciasDoAcesso({ telas: ['usuarios'], empresasAcesso: [] }, [])).toEqual([]);
    expect(pendenciasDoAcesso({ telas: ['dashboard-geral', 'lista-geral'] }, null)).toEqual([]);
  });

  it('sem o escopo carregado (erro de consulta) não se afirma pendência de aprovação', () => {
    expect(pendenciasDoAcesso({ telas: ['aprovar-reversa'], empresasAcesso: ['Alinare'] }, null)).toEqual([]);
  });
});
