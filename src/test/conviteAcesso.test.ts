import { describe, expect, it } from 'vitest';
import {
  convitesHabilitados,
  criarServicoConvite,
  ErroConvite,
  montarLinkConvite,
  normalizarEmailCorporativo,
  origemAplicativoValida,
  situacaoDoUsuario,
  type ClienteAdminConvite,
  type UsuarioAuth,
} from '../../supabase/functions/admin-usuarios/convite';
import { classificarAceitacaoSmtp, classificarErroSmtp, smtpConfigurado } from '../../supabase/functions/_shared/smtp-contract';

const APP = 'http://localhost:5173';
const SMTP_PASS_TESTE = 'senha-falsa-nao-usada';
const envSmtp = {
  CONVITE_TRANSPORTE: 'smtp',
  SMTP_HOST: 'smtp.office365.com',
  SMTP_PORT: '587',
  SMTP_SECURE: 'false',
  SMTP_USER: 'nao-responda@azime.com.br',
  SMTP_FROM: 'Chamados Azime <chamados@azime.com.br>',
  SMTP_PASS: SMTP_PASS_TESTE,
  APP_BASE_URL: APP,
};
const administrador = { id: 'admin-1', app_metadata: { telas: ['usuarios'] } };
const usuarioComum = { id: 'user-1', app_metadata: { telas: ['lista-geral'] } };
const entrada = {
  nome: 'Maria da Silva',
  email: 'maria.silva@azime.com.br',
  perfilAcesso: 'personalizado',
  empresasAcesso: [],
  telas: ['lista-geral'],
};

type Estado = 'smtp_aceito' | 'falhou' | 'rejeitado' | 'resultado_indeterminado';
type Resultado = { estado: Estado; codigo_smtp: number | null; detalhe: string };
type LinhaConvite = { usuario_id: string; email: string; estado: string; tentativas: number; tentativa_id: string | null };

const smtpAceito: Resultado = { estado: 'smtp_aceito', codigo_smtp: 250, detalhe: 'smtp_aceitou_mensagem_nao_confirma_entrega' };

function ambiente(opcoes: {
  env?: Record<string, string | undefined>;
  respostaSmtp?: Resultado | (() => Promise<Resultado>);
  erroEscopo?: boolean;
} = {}) {
  const usuarios = new Map<string, UsuarioAuth & { senha?: string }>();
  const convites = new Map<string, LinhaConvite>();
  const eventos: string[] = [];
  const logs: string[] = [];
  const emails: Array<{ para: string; assunto: string; html: string; texto?: string }> = [];
  const tiposGerados: string[] = [];
  let geracoesLink = 0;
  let enviosSmtp = 0;
  let sequencia = 0;
  let tentativaPendente: string | null = null;
  let linkFalha = false;

  const cliente: ClienteAdminConvite = {
    auth: {
      admin: {
        async createUser(atributos: any) {
          eventos.push('createUser');
          if ([...usuarios.values()].some((u) => u.email === atributos.email)) {
            return { data: { user: null }, error: { message: 'duplicado', code: 'email_exists' } };
          }
          const id = `usuario-${++sequencia}`;
          const user = {
            id,
            email: atributos.email,
            email_confirmed_at: atributos.email_confirm ? 'agora' : null,
            app_metadata: atributos.app_metadata,
            user_metadata: atributos.user_metadata,
            senha: atributos.password,
          };
          usuarios.set(id, user);
          return { data: { user }, error: null };
        },
        async getUserById(id: string) {
          const user = usuarios.get(id);
          return { data: { user: user ?? null }, error: user ? null : { message: 'não encontrado' } };
        },
        async updateUserById(id: string, atributos: any) {
          const user = usuarios.get(id);
          if (!user) return { data: { user: null }, error: { message: 'não encontrado' } };
          Object.assign(user, atributos);
          return { data: { user }, error: null };
        },
        async deleteUser(id: string) {
          usuarios.delete(id);
          convites.delete(id);
          return { error: null };
        },
        async generateLink(parametros: any) {
          geracoesLink += 1;
          eventos.push('generateLink');
          tiposGerados.push(parametros.type);
          const user = [...usuarios.values()].find((u) => u.email === parametros.email);
          if (linkFalha || !user) return { data: null, error: { code: 'unexpected_failure' } };
          if (parametros.type === 'invite' && user.email_confirmed_at) {
            return { data: null, error: { code: 'email_exists' } };
          }
          return { data: { properties: { hashed_token: `TOKENHASHSECRETO${geracoesLink}000000000000` } }, error: null };
        },
      },
    },
    async rpc(nome: string, p: any = {}) {
      eventos.push(`rpc:${nome}`);
      switch (nome) {
        case 'admin_convite_localizar_usuario': {
          const user = [...usuarios.values()].find((u) => u.email === String(p.p_email).toLowerCase());
          return { data: user ? [{ id: user.id, confirmado: !!user.email_confirmed_at, tem_senha: !!user.senha }] : [], error: null };
        }
        case 'admin_salvar_escopo_aprovacao_usuario':
          return opcoes.erroEscopo ? { data: null, error: { code: 'XX000', message: 'falha de escopo' } } : { data: null, error: null };
        case 'admin_convite_preparar': {
          if (!convites.has(p.p_usuario_id)) {
            convites.set(p.p_usuario_id, { usuario_id: p.p_usuario_id, email: p.p_email, estado: 'preparado', tentativas: 0, tentativa_id: null });
          }
          return { data: convites.get(p.p_usuario_id)!.estado, error: null };
        }
        case 'admin_convite_iniciar_envio': {
          const user = usuarios.get(p.p_usuario_id);
          if (user?.email_confirmed_at && (user.senha || !convites.has(p.p_usuario_id))) {
            return { data: [{ resultado: 'usuario_ativo', tentativa_id: null }], error: null };
          }
          const linha = convites.get(p.p_usuario_id)
            ?? { usuario_id: p.p_usuario_id, email: p.p_email, estado: 'preparado', tentativas: 0, tentativa_id: null };
          convites.set(p.p_usuario_id, linha);
          if (linha.estado === 'envio_em_andamento') return { data: [{ resultado: 'em_andamento', tentativa_id: null }], error: null };
          if (linha.estado === 'resultado_indeterminado' && !p.p_confirmou_incerto) {
            return { data: [{ resultado: 'confirmacao_necessaria', tentativa_id: null }], error: null };
          }
          linha.estado = 'envio_em_andamento';
          linha.tentativas += 1;
          linha.tentativa_id = `tentativa-${linha.tentativas}-${p.p_usuario_id}`;
          tentativaPendente = linha.tentativa_id;
          return { data: [{ resultado: 'ok', tentativa_id: linha.tentativa_id }], error: null };
        }
        case 'admin_convite_finalizar_envio_smtp': {
          const linha = [...convites.values()].find((x) => x.tentativa_id === p.p_tentativa_id);
          if (!linha || linha.estado !== 'envio_em_andamento') return { data: false, error: null };
          linha.estado = p.p_estado;
          return { data: true, error: null };
        }
        default:
          return { data: null, error: { code: 'desconhecida' } };
      }
    },
  };

  const service = criarServicoConvite({
    env: opcoes.env ?? envSmtp,
    admin: cliente,
    enviarEmail: async (email) => {
      enviosSmtp += 1;
      emails.push(email);
      eventos.push('smtp');
      if (typeof opcoes.respostaSmtp === 'function') return opcoes.respostaSmtp();
      return opcoes.respostaSmtp ?? smtpAceito;
    },
    log: (mensagem, detalhe) => logs.push(`${mensagem} ${detalhe ?? ''}`),
  });

  return {
    service, usuarios, convites, eventos, logs, emails, tiposGerados,
    get geracoesLink() { return geracoesLink; },
    get enviosSmtp() { return enviosSmtp; },
    set linkFalha(valor: boolean) { linkFalha = valor; },
    get tentativaPendente() { return tentativaPendente; },
  };
}

const falha = async (promessa: Promise<unknown>): Promise<ErroConvite> => {
  try { await promessa; } catch (erro) { return erro as ErroConvite; }
  throw new Error('era esperada uma falha');
};
const linkDaMensagem = (html: string) => {
  const href = html.match(/href="([^"]+)"/)?.[1];
  if (!href) throw new Error('link não encontrado no template SMTP');
  return new URL(href.replace(/&amp;/g, '&'));
};

describe('convite por e-mail corporativo', () => {
  it('normaliza o endereço e só aceita o domínio exato', () => {
    expect(normalizarEmailCorporativo('  Maria.Silva@AZIME.com.br  ')).toBe('maria.silva@azime.com.br');
    for (const email of ['a@azime.com.br.outro', 'a@sub.azime.com.br', 'a..b@azime.com.br', 'a@@azime.com.br']) {
      expect(() => normalizarEmailCorporativo(email)).toThrow();
    }
  });

  it('cria conta sem senha, grava permissões, gera link Supabase e envia o template pelo SMTP', async () => {
    const a = ambiente();
    const resultado = await a.service.convidar(administrador, entrada);
    expect(resultado).toMatchObject({ estado: 'smtp_aceito', conta_criada: true, envio_habilitado: true });
    const user = [...a.usuarios.values()][0];
    expect(user.senha).toBeUndefined();
    expect(user.email_confirmed_at).toBeNull();
    expect(user.app_metadata).toMatchObject({ telas: ['lista-geral'] });
    expect(a.eventos.indexOf('createUser')).toBeLessThan(a.eventos.indexOf('generateLink'));
    expect(a.eventos.indexOf('generateLink')).toBeLessThan(a.eventos.indexOf('smtp'));
    expect(a.convites.get(user.id)?.estado).toBe('smtp_aceito');
    expect(a.emails[0].para).toBe(entrada.email);
    expect(a.emails[0].assunto).toBe('Convite de acesso ao Reverso');
    expect(a.emails[0].html).toContain('Seu acesso está pronto.');
    expect(a.emails[0].html).toContain('Olá, Maria.');
    expect(a.emails[0].texto).toContain('Criar minha senha:');
    const link = linkDaMensagem(a.emails[0].html);
    expect(link.origin).toBe(APP);
    expect(link.pathname).toBe('/definir-senha');
    expect(link.searchParams.get('type')).toBe('invite');
    expect(link.searchParams.get('token_hash')).toMatch(/^TOKENHASHSECRETO/);
    expect(JSON.stringify(resultado) + a.logs.join('\n')).not.toContain('TOKENHASHSECRETO');
  });

  it('só usuário com tela usuarios pode convidar e configura permissões antes do link', async () => {
    const a = ambiente();
    const semAcesso = await falha(a.service.convidar(usuarioComum, entrada));
    expect(semAcesso.status).toBe(403);
    const escopo = ambiente({ erroEscopo: true });
    const erro = await falha(escopo.service.convidar(administrador, {
      ...entrada, telas: ['aprovar-reversa'], empresasAcesso: ['Alinare'],
      aprovacao: [{ empresa: 'Alinare', todos_setores: true, setores: [] }],
    }));
    expect(erro.status).toBe(500);
    expect(escopo.geracoesLink).toBe(0);
    expect(escopo.enviosSmtp).toBe(0);
  });

  it.each([
    ['conexão recusada antes de DATA', { estado: 'falhou', codigo_smtp: null, detalhe: 'smtp_falha_antes_da_aceitacao' }],
    ['recusa explícita do servidor', { estado: 'rejeitado', codigo_smtp: 550, detalhe: 'smtp_destinatario_ou_mensagem_recusada' }],
    ['timeout depois de DATA', { estado: 'resultado_indeterminado', codigo_smtp: null, detalhe: 'smtp_resultado_indeterminado_conferir_logs' }],
  ] as const)('%s não é registrado como aceite SMTP', async (_nome, resposta) => {
    const a = ambiente({ respostaSmtp: resposta });
    const resultado = await a.service.convidar(administrador, entrada);
    expect(resultado.estado).toBe(resposta.estado);
    expect(a.convites.get(resultado.usuario_id)?.estado).toBe(resposta.estado);
  });

  it('não repete resultado indeterminado sem confirmação explícita e gera novo link ao confirmar', async () => {
    let chamadas = 0;
    const a = ambiente({ respostaSmtp: async () => {
      chamadas += 1;
      return chamadas === 1
        ? { estado: 'resultado_indeterminado', codigo_smtp: null, detalhe: 'smtp_resultado_indeterminado_conferir_logs' }
        : smtpAceito;
    } });
    const primeiro = await a.service.convidar(administrador, entrada);
    expect(primeiro.estado).toBe('resultado_indeterminado');
    const erro = await falha(a.service.reenviar(administrador, { id: primeiro.usuario_id }));
    expect(erro.codigo).toBe('confirmacao_necessaria');
    const segundo = await a.service.reenviar(administrador, { id: primeiro.usuario_id, confirmarResultadoIncerto: true });
    expect(segundo.estado).toBe('smtp_aceito');
    expect(a.emails).toHaveLength(2);
    expect(linkDaMensagem(a.emails[0].html).searchParams.get('token_hash'))
      .not.toBe(linkDaMensagem(a.emails[1].html).searchParams.get('token_hash'));
  });

  it('bloqueia chamadas simultâneas enquanto a tentativa está em andamento', async () => {
    let terminar!: () => void;
    let iniciou!: () => void;
    const pronta = new Promise<void>((resolve) => { iniciou = resolve; });
    const a = ambiente({ respostaSmtp: async () => {
      iniciou();
      await new Promise<void>((resolve) => { terminar = resolve; });
      return smtpAceito;
    } });
    const primeiro = a.service.convidar(administrador, entrada);
    await pronta;
    const erro = await falha(a.service.reenviar(administrador, { id: 'usuario-1' }));
    expect(erro.codigo).toBe('envio_em_andamento');
    terminar();
    expect((await primeiro).estado).toBe('smtp_aceito');
    expect(a.enviosSmtp).toBe(1);
  });

  it('preserva recovery para conta convidada sem senha e impede envio para conta ativa', async () => {
    const a = ambiente();
    const convite = await a.service.convidar(administrador, entrada);
    const conta = a.usuarios.get(convite.usuario_id)!;
    conta.email_confirmed_at = '2026-10-28T10:00:00Z';
    const recovery = await a.service.reenviar(administrador, { id: conta.id });
    expect(recovery).toMatchObject({ estado: 'smtp_aceito', link: 'definicao_senha' });
    expect(a.tiposGerados).toEqual(['invite', 'recovery']);
    expect(linkDaMensagem(a.emails[1].html).searchParams.get('type')).toBe('recovery');
    expect(a.emails[1].html).toContain('Conclua seu acesso.');
    expect(a.emails[1].html).toContain('Olá, Maria.');
    conta.senha = 'senha-definida-pela-pessoa';
    const erro = await falha(a.service.reenviar(administrador, { id: conta.id }));
    expect(erro.codigo).toBe('usuario_ativo');
    expect(a.enviosSmtp).toBe(2);
  });

  it('não envia convite a conta ativa nem transforma uma conta antiga em recuperação', async () => {
    const a = ambiente();
    a.usuarios.set('legada', { id: 'legada', email: entrada.email, email_confirmed_at: '2025-01-01', senha: 'existente', app_metadata: { telas: ['lista-geral'] } });
    const erro = await falha(a.service.convidar(administrador, entrada));
    expect(erro.codigo).toBe('usuario_ativo');
    expect(a.enviosSmtp).toBe(0);
    expect(a.tiposGerados).toEqual([]);
  });

  it('mantém o cadastro salvo e não gera link quando o controle de convites está desligado', async () => {
    const a = ambiente({ env: { ...envSmtp, CONVITE_TRANSPORTE: 'simulado', NOTIFICACAO_EMAIL_TRANSPORTE: 'smtp' } });
    const resultado = await a.service.convidar(administrador, entrada);
    expect(resultado).toMatchObject({ estado: 'preparado', envio_habilitado: false, conta_criada: true });
    expect(a.geracoesLink).toBe(0);
    expect(a.enviosSmtp).toBe(0);
    expect(convitesHabilitados({ ...envSmtp, CONVITE_TRANSPORTE: undefined, NOTIFICACAO_EMAIL_TRANSPORTE: 'smtp' })).toBe(false);
  });

  it('habilita convites só com configuração SMTP completa e origem do app válida', () => {
    expect(convitesHabilitados(envSmtp)).toBe(true);
    for (const chave of ['SMTP_HOST', 'SMTP_PORT', 'SMTP_SECURE', 'SMTP_USER', 'SMTP_FROM', 'SMTP_PASS', 'APP_BASE_URL'] as const) {
      expect(convitesHabilitados({ ...envSmtp, [chave]: undefined })).toBe(false);
    }
    expect(convitesHabilitados({ ...envSmtp, SMTP_SECURE: 'true' })).toBe(false);
    expect(convitesHabilitados({ ...envSmtp, APP_BASE_URL: 'http://app.example.test' })).toBe(false);
  });

  it('o link usa origem confiável e valida o token_hash', () => {
    const origem = origemAplicativoValida('https://reverso.example.test')!;
    expect(montarLinkConvite(origem, 'a'.repeat(20))).toBe(`https://reverso.example.test/definir-senha?token_hash=${'a'.repeat(20)}&type=invite`);
    for (const token of ['curto', 'a'.repeat(20) + '&x=1', 'a b'.repeat(10), 'a'.repeat(300)]) {
      expect(() => montarLinkConvite(origem, token)).toThrow();
    }
    expect(origemAplicativoValida('https://u:p@reverso.example.test')).toBeNull();
    expect(origemAplicativoValida('https://reverso.example.test/app')).toBeNull();
  });

  it('a listagem preserva a situação de usuários antigos', () => {
    const antigo: UsuarioAuth = { id: 'old', email_confirmed_at: '2025-01-01' };
    expect(situacaoDoUsuario(antigo, undefined).situacao).toBe('ativo');
    expect(situacaoDoUsuario({ id: 'pending', email_confirmed_at: null }, undefined).situacao).toBe('convite_pendente');
  });
});

describe('classificação SMTP', () => {
  it('só considera aceitação quando há resposta 250 e destinatário aceito', () => {
    expect(classificarAceitacaoSmtp({ response: '250 2.0.0 queued', accepted: ['tiago@azime.com.br'], rejected: [] }, 'tiago@azime.com.br').estado).toBe('smtp_aceito');
    expect(classificarAceitacaoSmtp({ response: '250 ok', accepted: [], rejected: [] }, 'tiago@azime.com.br').estado).toBe('resultado_indeterminado');
    expect(classificarAceitacaoSmtp({ response: '550 rejected', accepted: [], rejected: ['tiago@azime.com.br'] }, 'tiago@azime.com.br').estado).toBe('rejeitado');
  });

  it('não repete autenticação recusada nem conexão perdida durante DATA', () => {
    expect(classificarErroSmtp({ code: 'EAUTH', command: 'AUTH LOGIN', responseCode: 535 }).estado).toBe('rejeitado');
    expect(classificarErroSmtp({ code: 'ECONNECTION', command: 'CONN' }).estado).toBe('falhou');
    expect(classificarErroSmtp({ code: 'ECONNRESET', command: 'DATA' }).estado).toBe('resultado_indeterminado');
  });

  it('configuração só considera fixa a conexão Office 365 em STARTTLS/587', () => {
    expect(smtpConfigurado(envSmtp)).toBe(true);
    expect(smtpConfigurado({ ...envSmtp, SMTP_SECURE: 'true' })).toBe(false);
    expect(smtpConfigurado({ ...envSmtp, SMTP_PORT: '25' })).toBe(false);
  });
});
