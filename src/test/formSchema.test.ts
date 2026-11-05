import { describe, it, expect } from 'vitest';
import { formSchema } from '../schemas/formSchema';

const baseline = {
  nc_id: 'b5f1c2d3-4e5f-4a6b-8c7d-9e0f1a2b3c4d',
  data_solicitacao: '2024-01-15',
  solicitante: 'Maria Silva',
  setor: 'Comercial Alinare' as const,
  codigo_cliente: 1234,
  nome_cliente: 'Cliente Teste',
  endereco_postagem: 'Rua das Flores, Bairro, Cidade/SP',
  numero_endereco: '123',
  motivo: 'Peça com defeito' as const,
  justificativa_outros: '',
};

function valid(overrides: object = {}) {
  return formSchema.safeParse({ ...baseline, ...overrides });
}

describe('formSchema', () => {
  it('baseline válido passa', () => {
    expect(valid().success).toBe(true);
  });

  // ── Campos obrigatórios ──────────────────────────────────────────────────────

  it('data_solicitacao vazia falha', () => {
    const r = valid({ data_solicitacao: '' });
    expect(r.success).toBe(false);
  });

  it('data_solicitacao ausente falha', () => {
    const r = formSchema.safeParse({ ...baseline, data_solicitacao: undefined });
    expect(r.success).toBe(false);
  });

  it('sem NC de origem passa', () => {
    expect(valid({ nc_id: '' }).success).toBe(true);
  });

  it('NC de origem ausente passa', () => {
    const r = formSchema.safeParse({ ...baseline, nc_id: undefined });
    expect(r.success).toBe(true);
  });

  it('setor inválido falha com mensagem correta', () => {
    const r = valid({ setor: 'Inexistente' });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues[0].message).toContain('setor válido');
    }
  });

  it('motivo inválido falha', () => {
    const r = valid({ motivo: 'Motivo inexistente' });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues[0].message).toContain('motivo válido');
    }
  });

  // O autorizador manual foi removido: a decisão é de um aprovador cadastrado e registrada
  // pelo banco. O schema não pede nem repassa esse campo, mesmo que venha no objeto.
  it('não exige autorizador e não repassa o campo se vier no objeto', () => {
    const r = valid({ autorizacao: 'Fulano da Silva' });
    expect(r.success).toBe(true);
    if (r.success) expect('autorizacao' in r.data).toBe(false);
  });

  // ── Número do endereço (campo separado do endereço retornado pelo CEP) ───────

  it('numero_endereco ausente falha no campo correto', () => {
    const r = formSchema.safeParse({ ...baseline, numero_endereco: undefined });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues.map(i => i.path.join('.'))).toContain('numero_endereco');
  });

  it('numero_endereco vazio falha', () => {
    expect(valid({ numero_endereco: '  ' }).success).toBe(false);
  });

  it('numero_endereco aceita S/N e rejeita mais de 20 caracteres', () => {
    expect(valid({ numero_endereco: 'S/N' }).success).toBe(true);
    expect(valid({ numero_endereco: '1'.repeat(21) }).success).toBe(false);
  });

  // ── codigo_cliente ────────────────────────────────────────────────────────────

  it('codigo_cliente 0 falha', () => {
    expect(valid({ codigo_cliente: 0 }).success).toBe(false);
  });

  it('codigo_cliente negativo falha', () => {
    expect(valid({ codigo_cliente: -1 }).success).toBe(false);
  });

  it('codigo_cliente decimal falha', () => {
    expect(valid({ codigo_cliente: 1.5 }).success).toBe(false);
  });

  it('codigo_cliente inteiro positivo passa', () => {
    expect(valid({ codigo_cliente: 1 }).success).toBe(true);
  });

  // ── Strip HTML ────────────────────────────────────────────────────────────────

  it('solicitante com tags HTML: tag removida, texto mantido', () => {
    const r = valid({ solicitante: '<b>João</b>' });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.solicitante).toBe('João');
    }
  });

  it('solicitante com script injection: tag removida', () => {
    const r = valid({ solicitante: '<script>alert(1)</script>Ana' });
    expect(r.success).toBe(true);
    if (r.success) {
      // conteúdo entre tags permanece, tags são removidas
      expect(r.data.solicitante).not.toContain('<');
    }
  });

  it('nome_cliente com HTML removido', () => {
    const r = valid({ nome_cliente: '<em>Empresa</em> LTDA' });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.nome_cliente).toBe('Empresa LTDA');
    }
  });

  it('endereco_postagem com HTML removido', () => {
    const r = valid({ endereco_postagem: '<div>Rua A, 100</div>' });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.endereco_postagem).toBe('Rua A, 100');
    }
  });

  // ── Limites de tamanho ────────────────────────────────────────────────────────

  it('solicitante 1 char falha', () => {
    expect(valid({ solicitante: 'A' }).success).toBe(false);
  });

  it('solicitante 2 chars passa', () => {
    expect(valid({ solicitante: 'AB' }).success).toBe(true);
  });

  it('solicitante 100 chars passa', () => {
    expect(valid({ solicitante: 'A'.repeat(100) }).success).toBe(true);
  });

  it('solicitante 101 chars falha', () => {
    expect(valid({ solicitante: 'A'.repeat(101) }).success).toBe(false);
  });

  it('nome_cliente 1 char falha', () => {
    expect(valid({ nome_cliente: 'A' }).success).toBe(false);
  });

  it('nome_cliente 2 chars passa', () => {
    expect(valid({ nome_cliente: 'AB' }).success).toBe(true);
  });

  it('nome_cliente 150 chars passa', () => {
    expect(valid({ nome_cliente: 'A'.repeat(150) }).success).toBe(true);
  });

  it('nome_cliente 151 chars falha', () => {
    expect(valid({ nome_cliente: 'A'.repeat(151) }).success).toBe(false);
  });

  it('endereco_postagem 4 chars falha', () => {
    expect(valid({ endereco_postagem: 'Rua ' }).success).toBe(false);
  });

  it('endereco_postagem 5 chars passa', () => {
    expect(valid({ endereco_postagem: 'Rua X' }).success).toBe(true);
  });

  it('endereco_postagem 300 chars passa', () => {
    expect(valid({ endereco_postagem: 'A'.repeat(300) }).success).toBe(true);
  });

  it('endereco_postagem 301 chars falha', () => {
    expect(valid({ endereco_postagem: 'A'.repeat(301) }).success).toBe(false);
  });

  it('justificativa_outros 500 chars passa', () => {
    expect(valid({ motivo: 'Outros', justificativa_outros: 'A'.repeat(500) }).success).toBe(true);
  });

  it('justificativa_outros 501 chars falha', () => {
    const r = valid({ motivo: 'Outros', justificativa_outros: 'A'.repeat(501) });
    expect(r.success).toBe(false);
  });

  // ── superRefine: Outros ───────────────────────────────────────────────────────

  it('motivo=Outros sem justificativa falha no path correto', () => {
    const r = valid({ motivo: 'Outros', justificativa_outros: '' });
    expect(r.success).toBe(false);
    if (!r.success) {
      const paths = r.error.issues.map(i => i.path.join('.'));
      expect(paths).toContain('justificativa_outros');
      expect(r.error.issues.some(i => i.message.includes('Justifique'))).toBe(true);
    }
  });

  it('motivo=Outros com justificativa preenchida passa', () => {
    expect(valid({ motivo: 'Outros', justificativa_outros: 'Motivo específico aqui' }).success).toBe(true);
  });

  it('motivo != Outros com justificativa vazia passa', () => {
    expect(valid({ motivo: 'Mercadoria errada', justificativa_outros: '' }).success).toBe(true);
  });

  it('motivo != Outros sem justificativa_outros passa', () => {
    const data = { ...baseline, motivo: 'Endereço incorreto', justificativa_outros: undefined };
    expect(formSchema.safeParse(data).success).toBe(true);
  });

  it('motivo atual "Mercadoria Errada" e o valor antigo "Mercadoria errada" passam', () => {
    expect(valid({ motivo: 'Mercadoria Errada' }).success).toBe(true);
    expect(valid({ motivo: 'Mercadoria errada' }).success).toBe(true);
  });

  // ── Clientes trocados: endereço da outra cliente ──────────────────────────────

  it('Clientes trocados exige endereço e número da outra cliente', () => {
    const r = valid({ motivo: 'Clientes trocados' });
    expect(r.success).toBe(false);
    if (!r.success) {
      const paths = r.error.issues.map(i => i.path.join('.'));
      expect(paths).toContain('endereco_destino_troca');
      expect(paths).toContain('numero_destino_troca');
    }
  });

  it('Clientes trocados com endereço e número da outra cliente passa', () => {
    expect(valid({
      motivo: 'Clientes trocados',
      endereco_destino_troca: 'Rua Outra, Centro, Cidade/SP',
      numero_destino_troca: '45',
      cep_destino_troca: '01310-100',
    }).success).toBe(true);
  });

  it('Clientes trocados com CEP da outra cliente incompleto falha; vazio é aceito', () => {
    const base = { motivo: 'Clientes trocados', endereco_destino_troca: 'Rua Outra, Centro', numero_destino_troca: '45' };
    expect(valid({ ...base, cep_destino_troca: '0131' }).success).toBe(false);
    expect(valid({ ...base, cep_destino_troca: '' }).success).toBe(true);
  });

  it('os dados da outra cliente não são exigidos para os demais motivos', () => {
    expect(valid({ motivo: 'Peça com defeito' }).success).toBe(true);
  });

  // ── Setores válidos ───────────────────────────────────────────────────────────

  it('setor Expedição passa', () => {
    expect(valid({ setor: 'Expedição' }).success).toBe(true);
  });


  it('setor Comercial Novitah passa', () => {
    expect(valid({ setor: 'Comercial Novitah' }).success).toBe(true);
  });

  it('setor Financeiro passa', () => {
    expect(valid({ setor: 'Financeiro' }).success).toBe(true);
  });

  it('setor Assistência Técnica passa', () => {
    expect(valid({ setor: 'Assistência Técnica' }).success).toBe(true);
  });
});

describe('código da cliente: intervalo suportado pelo banco (integer)', () => {
  const comCodigo = (codigo: number) => formSchema.safeParse({ ...baseline, codigo_cliente: codigo });
  const mensagem = (codigo: number) => {
    const r = comCodigo(codigo);
    return r.success ? null : r.error.issues.find((i) => i.path[0] === 'codigo_cliente')?.message ?? null;
  };

  it('aceita valor válido e o limite exato, sem alterar o número', () => {
    for (const valor of [1, 10842, 2_147_483_647]) {
      const r = comCodigo(valor);
      expect(r.success).toBe(true);
      if (r.success) expect(r.data.codigo_cliente).toBe(valor);
    }
  });

  it('recusa zero, negativo, decimal, acima do limite e 20 dígitos (nunca arredonda)', () => {
    expect(mensagem(0)).toBe('O código deve ser maior que zero.');
    expect(mensagem(-5)).toBe('O código deve ser maior que zero.');
    expect(mensagem(1.5)).toBe('O código deve ser um número inteiro.');
    expect(mensagem(2_147_483_648)).toMatch(/no máximo 2\.147\.483\.647/);
    expect(mensagem(Number('99999999999999999999'))).toMatch(/no máximo/);
  });
});
