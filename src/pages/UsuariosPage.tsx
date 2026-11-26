// ── Gerenciamento de Usuários (admin only) ───────────────────────────────────
// Cadastro oficial por tela: marcar uma tela concede as operações dela (ver src/lib/acesso.ts),
// no escopo de empresa e setor informado aqui mesmo. O banco é a autoridade; esta tela valida com
// as mesmas regras da Edge Function admin-usuarios.
import { useEffect, useMemo, useRef, useState } from 'react';
import { CONSULTA_CELULAR, useMediaQuery } from '../hooks/useMediaQuery';
import toast from 'react-hot-toast';
import { Loader2, Plus, Pencil, Trash2, X, UserPlus, Send } from 'lucide-react';
import authService from '../services/authService';
import apiService, { type ConfigAprovadoresReversa } from '../services/apiService';
import { useAuth } from '../context/AuthContext';
import { PERFIL_ACESSO_LABEL, SETORES, isMestre } from '../types';
import {
  DEFINICOES_LEGADAS,
  GRUPOS_TELAS,
  normalizarAcesso,
  pendenciasDoAcesso,
  rotuloDaTela,
  setoresDaEmpresa,
  telaTemEscopoDeEmpresa,
  telasLegadasDe,
  telasOficiaisDe,
  type EscopoAprovacao,
} from '../lib/acesso';
import { DOMINIO_CONVITE, DOMINIOS_CONVITE_TEXTO, normalizarEmailCorporativo } from '../lib/emailCorporativo';
import PageHeading from '../components/ui/PageHeading';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import AprovadoresSetorConfig from '../components/admin/AprovadoresSetorConfig';
import { ShieldCheck } from 'lucide-react';
import type { Usuario, Tela, UpdateUsuarioPayload, PerfilAcesso, Empresa, ResultadoConvite } from '../types';

type ModoAprovacao = 'todos' | 'setores' | null;
type RascunhoAprovacao = { modo: ModoAprovacao; setores: string[] };
type RascunhosAprovacao = Record<Empresa, RascunhoAprovacao>;

type FormState = {
  id?: string;
  nome: string;
  usuario: string;
  /** Cadastro por convite: e-mail corporativo (só em novo usuário). */
  email: string;
  senha: string;
  confirmarSenha: string;
  /** Telas oficiais marcadas (cada uma concede as operações próprias dela). */
  telas: Tela[];
  /** Identificadores antigos que o usuário já tem e que continuam marcados (preservados). */
  legadas: string[];
  perfilAcesso: PerfilAcesso;
  empresasAcesso: Empresa[];
  aprovacao: RascunhosAprovacao;
  protegido?: boolean;
};

const EMPRESAS: Empresa[] = ['Alinare', 'Novitah'];
const SEM_APROVACAO: RascunhosAprovacao = {
  Alinare: { modo: null, setores: [] },
  Novitah: { modo: null, setores: [] },
};

const VAZIO: FormState = {
  nome: '', usuario: '', email: '', senha: '', confirmarSenha: '', telas: [], legadas: [],
  // Nenhuma empresa é presumida: o administrador escolhe.
  perfilAcesso: 'solicitante', empresasAcesso: [], aprovacao: SEM_APROVACAO,
};

/** Perfis prontos (cada um tem regra fixa) e o personalizado (telas marcadas uma a uma). */
const OPCOES_PERFIL: Array<{ valor: PerfilAcesso; rotulo: string }> = [
  { valor: 'solicitante', rotulo: 'Abre chamados' },
  { valor: 'aprovador', rotulo: 'Aprova chamados' },
  { valor: 'emissor_etiqueta', rotulo: 'Emite etiqueta do reverso' },
  { valor: 'checkin_correios', rotulo: 'Acompanha e confirma check-in' },
  { valor: 'mestre', rotulo: 'Mestre — acesso total' },
  { valor: 'personalizado', rotulo: PERFIL_ACESSO_LABEL.personalizado },
];

const ROTULO_ESTADO_CONVITE: Record<string, string> = {
  preparado: 'não enviado',
  envio_em_andamento: 'enviando',
  enviado: 'enviado',
  smtp_aceito: 'aceito pelo SMTP',
  falhou: 'envio falhou',
  resultado_indeterminado: 'envio incerto',
  rejeitado: 'recusado pelo SMTP',
};

/** Código tipado do erro do backend (ex.: confirmacao_necessaria), sem depender da classe do serviço. */
const codigoDoErro = (err: unknown): string | undefined => (err as { codigo?: string } | null)?.codigo;

function rascunhosDoEscopo(escopo: EscopoAprovacao[]): RascunhosAprovacao {
  const resultado: RascunhosAprovacao = { Alinare: { modo: null, setores: [] }, Novitah: { modo: null, setores: [] } };
  for (const item of escopo) {
    if (item.empresa !== 'Alinare' && item.empresa !== 'Novitah') continue;
    resultado[item.empresa] = { modo: item.todos_setores ? 'todos' : 'setores', setores: [...item.setores] };
  }
  return resultado;
}

/** Escopo de aprovação gravado para o usuário (mesma tabela da configuração de aprovadores); null se não carregou. */
function escopoDoUsuario(config: ConfigAprovadoresReversa | null, usuarioId: string): EscopoAprovacao[] | null {
  if (!config) return null;
  return config.configuracoes
    .filter((item) => item.usuario_id === usuarioId)
    .map((item) => ({ empresa: item.empresa, todos_setores: item.todos_setores, setores: item.setores }));
}

export default function UsuariosPage() {
  const { user } = useAuth();
  const emCelular = useMediaQuery(CONSULTA_CELULAR);
  const [lista, setLista] = useState<Usuario[]>([]);
  const [configAprovadores, setConfigAprovadores] = useState<ConfigAprovadoresReversa | null>(null);
  const [erroConfig, setErroConfig] = useState<string | null>(null);
  const [versaoConfig, setVersaoConfig] = useState(0);
  const [loading, setLoading] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [abrirForm, setAbrirForm] = useState(false);
  const [form, setForm] = useState<FormState>(VAZIO);
  const [pendencias, setPendencias] = useState<string[]>([]);
  const [telasOriginais, setTelasOriginais] = useState<string[]>([]);
  const [modoEdicao, setModoEdicao] = useState(false);
  const [usuarioParaRemover, setUsuarioParaRemover] = useState<Usuario | null>(null);
  const [removendoUsuario, setRemovendoUsuario] = useState(false);
  // Convite: bloqueia cliques repetidos e guarda o reenvio aguardando confirmação.
  const emEnvioRef = useRef(false);
  const [reenvio, setReenvio] = useState<{ usuario: Pick<Usuario, 'id' | 'nome'>; incerto: boolean; definicaoSenha?: boolean } | null>(null);
  const [reenviando, setReenviando] = useState(false);
  const [confirmarIncertoNovo, setConfirmarIncertoNovo] = useState(false);

  const editarSelf = modoEdicao && form.id === user?.id;
  const isAdminDefault = modoEdicao && !!form.protegido;
  const telasFixas = isAdminDefault;
  const personalizado = form.perfilAcesso === 'personalizado';
  const perfilPronto = form.perfilAcesso !== 'personalizado' && form.perfilAcesso !== 'mestre';
  const usaEscopoEmpresa = perfilPronto
    || (personalizado && [...form.telas, ...form.legadas].some(telaTemEscopoDeEmpresa));
  const mostraAprovacao = personalizado && form.telas.includes('aprovar-reversa');

  const carregar = async () => {
    setLoading(true);
    try {
      const dados = await authService.listarUsuarios();
      setLista(dados);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao carregar usuários.');
    } finally {
      setLoading(false);
    }
    // O escopo de aprovação vem da mesma tabela da configuração de aprovadores.
    try {
      setConfigAprovadores(await apiService.listarConfigAprovadoresReversa());
      setErroConfig(null);
    } catch (err) {
      setConfigAprovadores(null);
      setErroConfig(err instanceof Error ? err.message : 'Não foi possível carregar o escopo de aprovação.');
    }
  };

  useEffect(() => {
    carregar();
  }, []);

  const pendenciasPorUsuario = useMemo(() => Object.fromEntries(lista.map((u) => [
    u.id,
    isMestre(u) ? [] : pendenciasDoAcesso(u, escopoDoUsuario(configAprovadores, u.id)),
  ])) as Record<string, string[]>, [lista, configAprovadores]);

  const abrirNovo = () => {
    setForm(VAZIO);
    setPendencias([]);
    setTelasOriginais([]);
    setModoEdicao(false);
    setAbrirForm(true);
  };

  const abrirEditar = (u: Usuario) => {
    const escopo = escopoDoUsuario(configAprovadores, u.id) ?? [];
    setForm({
      id: u.id, nome: u.nome, usuario: u.usuario, email: '', senha: '', confirmarSenha: '',
      telas: telasOficiaisDe(u.telas ?? []), legadas: telasLegadasDe(u.telas ?? []),
      perfilAcesso: u.perfilAcesso ?? 'personalizado',
      empresasAcesso: u.empresasAcesso ?? [], aprovacao: rascunhosDoEscopo(escopo), protegido: u.protegido,
    });
    setPendencias(pendenciasPorUsuario[u.id] ?? []);
    setTelasOriginais(u.telas ?? []);
    setModoEdicao(true);
    setAbrirForm(true);
  };

  const fecharForm = () => {
    setAbrirForm(false);
    setForm(VAZIO);
    setPendencias([]);
    setModoEdicao(false);
  };

  const toggleTela = (tela: Tela) => {
    setForm((prev) => ({
      ...prev,
      telas: prev.telas.includes(tela) ? prev.telas.filter((t) => t !== tela) : [...prev.telas, tela],
    }));
  };

  const toggleLegada = (tela: string) => {
    setForm((prev) => ({
      ...prev,
      legadas: prev.legadas.includes(tela) ? prev.legadas.filter((t) => t !== tela) : [...prev.legadas, tela],
    }));
  };

  const toggleEmpresa = (empresa: Empresa) => {
    setForm((prev) => ({
      ...prev,
      empresasAcesso: prev.empresasAcesso.includes(empresa)
        ? prev.empresasAcesso.filter((e) => e !== empresa)
        : [...prev.empresasAcesso, empresa],
    }));
  };

  const definirModoAprovacao = (empresa: Empresa, modo: Exclude<ModoAprovacao, null>) => {
    setForm((prev) => ({ ...prev, aprovacao: { ...prev.aprovacao, [empresa]: { modo, setores: modo === 'todos' ? [] : prev.aprovacao[empresa].setores } } }));
  };

  const toggleSetor = (empresa: Empresa, setor: string) => {
    setForm((prev) => {
      const atuais = prev.aprovacao[empresa].setores;
      return {
        ...prev,
        aprovacao: {
          ...prev.aprovacao,
          [empresa]: { modo: 'setores', setores: atuais.includes(setor) ? atuais.filter((item) => item !== setor) : [...atuais, setor] },
        },
      };
    });
  };

  /** Escopo de aprovação exatamente como será gravado (uma entrada por empresa marcada). */
  const aprovacaoParaSalvar = (): EscopoAprovacao[] => form.empresasAcesso.map((empresa) => {
    const rascunho = form.aprovacao[empresa];
    return {
      empresa,
      todos_setores: rascunho.modo === 'todos',
      setores: rascunho.modo === 'setores' ? [...rascunho.setores].sort((a, b) => a.localeCompare(b, 'pt-BR')) : [],
    };
  });

  const telasParaSalvar = (): string[] => [...form.telas, ...form.legadas];

  /** Mesma validação da Edge Function: devolve a mensagem de erro ou null. */
  const validarAcesso = (): string | null => {
    if (telasFixas) return null;
    if (editarSelf && !(isMestre(form) || (personalizado && form.telas.includes('usuarios')))) {
      return 'Não é possível remover a própria gestão de usuários.';
    }
    try {
      normalizarAcesso({
        perfilAcesso: form.perfilAcesso,
        empresasAcesso: form.empresasAcesso,
        telas: telasParaSalvar(),
        aprovacao: mostraAprovacao ? aprovacaoParaSalvar() : [],
        telasAtuais: telasOriginais,
      });
      return null;
    } catch (err) {
      return err instanceof Error ? err.message : 'Acesso inválido.';
    }
  };
  const erroAcesso = abrirForm ? validarAcesso() : null;

  /** Acesso exatamente como será gravado (perfil, empresas, telas e escopo de aprovação). */
  const montarAcesso = (): UpdateUsuarioPayload => ({
    perfilAcesso: form.perfilAcesso,
    empresasAcesso: usaEscopoEmpresa ? form.empresasAcesso : [],
    ...(personalizado
      ? { telas: telasParaSalvar() as Tela[], aprovacao: mostraAprovacao ? aprovacaoParaSalvar() as UpdateUsuarioPayload['aprovacao'] : [] }
      : {}),
  });

  /** Falha de envio nunca é apresentada como sucesso: cada estado tem a sua mensagem. */
  const avisarResultadoConvite = (resultado: ResultadoConvite) => {
    switch (resultado.estado) {
      case 'enviado':
        toast.success(`${resultado.link === 'definicao_senha' ? 'Link de definição de senha' : 'Convite'} enviado para ${resultado.email}. O sistema não confirma a entrega na caixa de entrada.`);
        break;
      case 'smtp_aceito':
        toast.success(`O servidor SMTP aceitou ${resultado.link === 'definicao_senha' ? 'o link de definição de senha' : 'o convite'} para ${resultado.email}. Isso não confirma entrega nem leitura.`);
        break;
      case 'preparado':
        toast('Cadastro salvo. O envio de convites está desabilitado: nenhum e-mail foi enviado.', { icon: 'ℹ️', duration: 8000 });
        break;
      case 'falhou':
        toast.error('O convite NÃO foi enviado. O cadastro foi salvo; tente novamente.');
        break;
      case 'rejeitado':
        toast.error('O servidor SMTP recusou o envio. Confira a configuração de autenticação e permissão do remetente.', { duration: 8000 });
        break;
      default:
        toast.error('Resultado SMTP incerto. O convite pode ter sido aceito: confira os registros do servidor antes de reenviar.', { duration: 10000 });
    }
  };

  /** Salva o acesso e solicita o envio. Reutiliza a conta pendente: repetir não cria outro usuário. */
  const convidar = async (confirmarResultadoIncerto: boolean) => {
    const acesso = montarAcesso();
    const resultado = await authService.convidarUsuario({
      nome: form.nome.trim(),
      email: form.email,
      telas: (acesso.telas ?? []) as Tela[],
      perfilAcesso: form.perfilAcesso,
      empresasAcesso: acesso.empresasAcesso ?? [],
      aprovacao: acesso.aprovacao,
      confirmarResultadoIncerto,
    });
    avisarResultadoConvite(resultado);
    return resultado;
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (emEnvioRef.current) return;

    if (!form.nome.trim()) {
      toast.error('Informe o nome do usuário.');
      return;
    }
    if (modoEdicao && !form.usuario.trim()) {
      toast.error('Informe o login do usuário.');
      return;
    }
    if (!modoEdicao) {
      try {
        normalizarEmailCorporativo(form.email);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Informe um e-mail corporativo válido.');
        return;
      }
    }
    if (erroAcesso) {
      toast.error(erroAcesso);
      return;
    }

    // Verificação dupla para senhas
    if (form.senha && form.senha !== form.confirmarSenha) {
      toast.error('As senhas não conferem.');
      return;
    }
    if (form.senha && form.senha.length < 6) {
      toast.error('A senha deve ter pelo menos 6 caracteres.');
      return;
    }

    emEnvioRef.current = true;
    setSalvando(true);
    try {
      const acesso = montarAcesso();
      if (modoEdicao && form.id) {
        const payload: UpdateUsuarioPayload = { nome: form.nome };
        if (!isAdminDefault) payload.usuario = form.usuario;
        if (!telasFixas) Object.assign(payload, acesso);
        if (form.senha) payload.senha = form.senha;
        await authService.atualizarUsuario(form.id, payload);
        toast.success('Usuário atualizado.');
      } else {
        const resultado = await convidar(false);
        if (resultado.estado === 'falhou') {
          // Conta e permissões já estão salvas: o formulário fica aberto e repetir reutiliza a conta pendente.
          await carregar();
          return;
        }
      }
      fecharForm();
      await carregar();
      setVersaoConfig((versao) => versao + 1);
    } catch (err) {
      if (!modoEdicao && codigoDoErro(err) === 'confirmacao_necessaria') {
        setConfirmarIncertoNovo(true);
      } else {
        toast.error(err instanceof Error ? err.message : 'Erro ao salvar usuário.');
      }
    } finally {
      emEnvioRef.current = false;
      setSalvando(false);
    }
  };

  const confirmarConviteIncerto = async () => {
    if (emEnvioRef.current) return;
    emEnvioRef.current = true;
    setSalvando(true);
    try {
      const resultado = await convidar(true);
      setConfirmarIncertoNovo(false);
      if (resultado.estado !== 'falhou') {
        fecharForm();
        setVersaoConfig((versao) => versao + 1);
      }
      await carregar();
    } catch (err) {
      setConfirmarIncertoNovo(false);
      toast.error(err instanceof Error ? err.message : 'Erro ao enviar o convite.');
    } finally {
      emEnvioRef.current = false;
      setSalvando(false);
    }
  };

  /** Reenvio explícito de convite pendente: o link anterior deixa de valer. */
  const confirmarReenvio = async () => {
    if (!reenvio || emEnvioRef.current) return;
    emEnvioRef.current = true;
    setReenviando(true);
    try {
      const resultado = await authService.reenviarConvite(reenvio.usuario.id, reenvio.incerto);
      avisarResultadoConvite(resultado);
      setReenvio(null);
      await carregar();
    } catch (err) {
      if (codigoDoErro(err) === 'confirmacao_necessaria') {
        // O último resultado é incerto: pede a confirmação explícita em vez de reenviar às cegas.
        setReenvio({ usuario: reenvio.usuario, incerto: true, definicaoSenha: reenvio.definicaoSenha });
      } else {
        toast.error(err instanceof Error ? err.message : 'Erro ao reenviar o convite.');
        setReenvio(null);
      }
    } finally {
      emEnvioRef.current = false;
      setReenviando(false);
    }
  };

  const onRemover = async (u: Usuario) => {
    setUsuarioParaRemover(u);
  };

  const confirmarRemocaoUsuario = async () => {
    if (!usuarioParaRemover) return;
    setRemovendoUsuario(true);
    try {
      await authService.removerUsuario(usuarioParaRemover.id);
      toast.success('Usuário removido.');
      setUsuarioParaRemover(null);
      await carregar();
      setVersaoConfig((versao) => versao + 1);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao remover usuário.');
    } finally {
      setRemovendoUsuario(false);
    }
  };

  const inputCls =
    'h-10 w-full px-3 rounded-lg border border-slate-300 bg-white text-sm text-slate-900 ' +
    'focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors';

  const checkboxCls =
    'h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer';

  const setoresConhecidos = configAprovadores?.setores ?? [];

  /** Selos de acesso e situação do convite de uma pessoa (mesma informação na tabela e nos cards). */
  const chipsDeAcesso = (u: Usuario) => (
      <div className="row-wrap" style={{ gap: 6 }}>
        {isMestre(u) ? (
          <span className="badge badge-accent">
            Mestre · acesso total
          </span>
        ) : (
          <>
            <span className="badge badge-neutral plain">
              {PERFIL_ACESSO_LABEL[u.perfilAcesso ?? 'personalizado']}
            </span>
            {(u.empresasAcesso ?? []).map((empresa) => (
              <span key={empresa} className={`record-empresa-pill ${empresa === 'Alinare' ? 'is-alinare' : 'is-novitah'} badge plain`}>
                {empresa}
              </span>
            ))}
            {u.perfilAcesso === 'personalizado' && u.telas.slice(0, 3).map((t) => (
              <span
                key={t}
                className="badge badge-neutral plain"
              >
                {rotuloDaTela(t)}
              </span>
            ))}
            {u.perfilAcesso === 'personalizado' && u.telas.length > 3 && (
              <span className="badge badge-neutral plain">
                +{u.telas.length - 3}
              </span>
            )}
            {u.perfilAcesso !== 'personalizado' && u.telas.includes('usuarios') && (
              <span className="badge badge-neutral plain">
                {rotuloDaTela('usuarios')}
              </span>
            )}
          </>
        )}
        {u.situacao === 'convite_pendente' && (
          <span
            className="badge badge-warn"
            title="A pessoa ainda não aceitou o convite e não definiu a senha."
          >
            Convite pendente{u.convite ? ` · ${ROTULO_ESTADO_CONVITE[u.convite.estado] ?? u.convite.estado}` : ''}
          </span>
        )}
        {u.situacao === 'senha_nao_definida' && (
          <span
            className="badge badge-danger"
            title="O convite foi aberto, mas a senha não foi definida. Use Reenviar para enviar um link de definição de senha."
          >
            Convite aceito · senha não definida
          </span>
        )}
        {(pendenciasPorUsuario[u.id]?.length ?? 0) > 0 && (
          <span
            className="badge badge-warn"
            title={pendenciasPorUsuario[u.id].join(' ')}
          >
            Revisar acesso
          </span>
        )}
      </div>
  );

  /** Ações da linha: reenviar convite, editar e remover. */
  const acoesDoUsuario = (u: Usuario) => (
  <div className="record-actions">
    {(u.situacao === 'convite_pendente' || u.situacao === 'senha_nao_definida') && (
      <button
        type="button"
        onClick={() => setReenvio({
          usuario: { id: u.id, nome: u.nome },
          incerto: u.convite?.estado === 'resultado_indeterminado',
          definicaoSenha: u.situacao === 'senha_nao_definida',
        })}
        className="icon-btn"
        aria-label={u.situacao === 'senha_nao_definida' ? `Enviar link de definição de senha para ${u.nome}` : `Reenviar convite para ${u.nome}`}
        title={u.situacao === 'senha_nao_definida' ? 'Enviar link de definição de senha' : 'Reenviar convite'}
      >
        <Send size={18} aria-hidden="true" />
      </button>
    )}
    <button
      type="button"
      onClick={() => abrirEditar(u)}
      className="icon-btn"
      aria-label={`Editar ${u.nome}`}
    >
      <Pencil size={18} aria-hidden="true" />
    </button>
    <button
      type="button"
      onClick={() => onRemover(u)}
      disabled={u.protegido}
      className="icon-btn is-danger"
      aria-label={`Remover ${u.nome}`}
      title={u.protegido ? 'Administrador padrão não pode ser removido' : 'Remover'}
    >
      <Trash2 size={18} aria-hidden="true" />
    </button>
  </div>
  );


  return (
    <div>
      <PageHeading
        icon={ShieldCheck}
        title="Usuários"
        action={(
          <button type="button" onClick={abrirNovo} className="btn btn-primary">
            <Plus size={16} aria-hidden="true" />
            Novo usuário
          </button>
        )}
      />

      <div className="card" style={{ overflow: 'hidden' }}>
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
          </div>
        ) : lista.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-slate-400">
            <UserPlus className="w-8 h-8 mb-2" />
            <p className="text-sm">Nenhum usuário cadastrado.</p>
          </div>
        ) : (
          emCelular ? (
          <div className="mobile-cards" style={{ display: 'block' }}>
            {lista.map((u) => (
              <article key={u.id} className="m-card">
                <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                  <div style={{ minWidth: 0 }}>
                    <strong className="strong" style={{ display: 'block', overflowWrap: 'anywhere' }}>{u.nome}</strong>
                    <span className="xs muted">@{u.usuario}</span>
                  </div>
                  {acoesDoUsuario(u)}
                </div>
                <div style={{ marginTop: 10 }}>{chipsDeAcesso(u)}</div>
              </article>
            ))}
          </div>
          ) : (
          <>
            <div className="table-wrap">
              <table className="tbl" style={{ minWidth: 560 }}>
                <thead>
                  <tr><th>Nome</th><th>Login</th><th>Acesso</th><th className="r">Ações</th></tr>
                </thead>
                <tbody>
                  {lista.map((u) => (
                    <tr key={u.id}>
                      <td className="strong" style={{ whiteSpace: 'nowrap' }}>{u.nome}</td>
                      <td style={{ whiteSpace: 'nowrap' }}>{u.usuario}</td>
                      <td>{chipsDeAcesso(u)}</td>
                      <td className="r">{acoesDoUsuario(u)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
          )
        )}
      </div>

      <AprovadoresSetorConfig key={versaoConfig} usuarios={lista} />

      {abrirForm && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 px-4 pt-[5vh]">
          <div className="w-full max-w-lg bg-white rounded-2xl shadow-xl border border-slate-200 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 sticky top-0 bg-white rounded-t-2xl">
              <h2 className="text-lg font-semibold text-slate-900">
                {modoEdicao ? 'Editar usuário' : 'Novo usuário'}
              </h2>
              <button
                type="button"
                onClick={fecharForm}
                className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors cursor-pointer"
                aria-label="Fechar"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={onSubmit} noValidate className="px-6 py-5 space-y-4">
              <div className="flex flex-col">
                <label htmlFor="u-nome" className="text-xs font-medium text-slate-500 mb-1">Nome</label>
                <input id="u-nome" type="text" value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} className={inputCls} required />
              </div>
              {!modoEdicao ? (
                <div className="flex flex-col">
                  <label htmlFor="u-email" className="text-xs font-medium text-slate-500 mb-1">E-mail corporativo</label>
                  <input
                    id="u-email"
                    type="email"
                    inputMode="email"
                    autoComplete="off"
                    placeholder={`nome@${DOMINIO_CONVITE}`}
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    className={inputCls}
                    required
                  />
                  <p className="mt-1 text-xs text-slate-500">
                    A pessoa recebe um convite por e-mail e define a própria senha do Reverso (independente da senha Microsoft). Somente endereços {DOMINIOS_CONVITE_TEXTO}.
                  </p>
                </div>
              ) : (<>
              <div className="flex flex-col">
                <label htmlFor="u-login" className="text-xs font-medium text-slate-500 mb-1">Login</label>
                <input
                  id="u-login"
                  type="text"
                  value={form.usuario}
                  onChange={(e) => setForm({ ...form, usuario: e.target.value })}
                  className={inputCls + (isAdminDefault ? ' bg-slate-50 text-slate-500' : '')}
                  required
                  readOnly={isAdminDefault}
                />
              </div>
              <div className="flex flex-col">
                <label htmlFor="u-senha" className="text-xs font-medium text-slate-500 mb-1">
                  {modoEdicao ? 'Nova senha (deixe vazio para manter)' : 'Senha'}
                </label>
                <input id="u-senha" type="password" value={form.senha} onChange={(e) => setForm({ ...form, senha: e.target.value })} className={inputCls} required={!modoEdicao} minLength={modoEdicao ? undefined : 6} />
              </div>
              {form.senha && (
                <div className="flex flex-col">
                  <label htmlFor="u-confirmar-senha" className="text-xs font-medium text-slate-500 mb-1">
                    Confirmar senha
                  </label>
                  <input
                    id="u-confirmar-senha"
                    type="password"
                    value={form.confirmarSenha}
                    onChange={(e) => setForm({ ...form, confirmarSenha: e.target.value })}
                    className={inputCls}
                    required
                    minLength={6}
                  />
                </div>
              )}
              </>)}

              {/* Perfil de acesso: perfis prontos ou personalizado (telas marcadas uma a uma) */}
              <div className="flex flex-col">
                {pendencias.length > 0 && (
                  <div role="alert" className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                    <p className="font-medium">Este acesso precisa ser revisado antes de salvar:</p>
                    <ul className="mt-1 list-disc pl-5">
                      {pendencias.map((pendencia) => <li key={pendencia}>{pendencia}</li>)}
                    </ul>
                  </div>
                )}
                <label htmlFor="u-perfil-acesso" className="text-xs font-medium text-slate-500 mb-2">
                  Perfil de acesso {telasFixas && (
                    <span className="text-slate-400">(não editável — administrador padrão)</span>
                  )}
                </label>
                <select
                  id="u-perfil-acesso"
                  value={form.perfilAcesso}
                  disabled={telasFixas}
                  onChange={(e) => setForm({ ...form, perfilAcesso: e.target.value as PerfilAcesso })}
                  className={inputCls + (telasFixas ? ' bg-slate-50 text-slate-500' : '')}
                >
                  {OPCOES_PERFIL.map((opcao) => <option key={opcao.valor} value={opcao.valor}>{opcao.rotulo}</option>)}
                </select>

                {!telasFixas && usaEscopoEmpresa && (
                  <div className="mt-3">
                    <p className="text-xs font-medium text-slate-500 mb-1">
                      {personalizado ? 'Empresas de Aprovações e Emissão de etiquetas' : 'Empresas atendidas'}
                    </p>
                    <p className="text-xs text-slate-400 mb-2">Nenhuma empresa é presumida: marque as que esta pessoa atende.</p>
                    <div className="flex gap-2">
                      {EMPRESAS.map((empresa) => (
                        <label key={empresa} className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 text-sm text-slate-700 cursor-pointer">
                          <input type="checkbox" checked={form.empresasAcesso.includes(empresa)} onChange={() => toggleEmpresa(empresa)} className={checkboxCls} />
                          {empresa}
                        </label>
                      ))}
                    </div>
                  </div>
                )}

                {form.perfilAcesso === 'aprovador' && !telasFixas && (
                  <p className="mt-2 text-xs text-slate-500">Este perfil aprova os pedidos de todos os setores das empresas marcadas. Para limitar por setor, use Personalizado.</p>
                )}

                {form.perfilAcesso === 'mestre' && (
                  <div className="mt-3 rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-sm text-blue-800">
                    Acesso a todas as telas, às duas empresas, à aprovação de todos os setores e à gestão de usuários.
                  </div>
                )}

                {personalizado && !telasFixas ? (
                  <div className="mt-3 space-y-3 rounded-lg border border-slate-200 p-3">
                    <p className="text-xs text-slate-500">Marcar uma tela concede as operações descritas nela, e nada além disso.</p>
                    {GRUPOS_TELAS.map((grupo) => (
                      <div key={grupo.titulo}>
                        <p className="text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">{grupo.titulo}</p>
                        <div className="grid grid-cols-1 gap-1.5">
                          {grupo.telas.map((definicao) => (
                            <label key={definicao.tela} className="flex items-start gap-2 px-2 py-1.5 rounded-md hover:bg-slate-50 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={form.telas.includes(definicao.tela)}
                                disabled={editarSelf && definicao.tela === 'usuarios'}
                                onChange={() => toggleTela(definicao.tela)}
                                className={checkboxCls + ' mt-0.5'}
                              />
                              <span>
                                <span className="block text-sm text-slate-700">{definicao.rotulo}</span>
                                <span className="block text-xs text-slate-500">{definicao.operacoes.join(' · ')}</span>
                              </span>
                            </label>
                          ))}
                        </div>
                      </div>
                    ))}
                    {form.telas.includes('usuarios') && (
                      <p className="rounded-md bg-amber-50 px-2 py-1.5 text-xs text-amber-900">
                        Gestão de usuários concede a administração (cadastro, aprovadores, comunicações e listas de NC). Ela não dá acesso a pedidos, aprovação nem emissão: marque essas telas à parte.
                      </p>
                    )}

                    {mostraAprovacao && (
                      <div className="space-y-3 rounded-lg border border-slate-200 p-3" aria-label="Escopo de aprovação">
                        <p className="text-xs font-semibold text-slate-700 uppercase tracking-wider">Aprovações: empresas e setores</p>
                        {erroConfig && (
                          <p className="text-xs text-red-700">Não foi possível carregar o escopo atual ({erroConfig}). Ao salvar, informe-o novamente.</p>
                        )}
                        {form.empresasAcesso.length === 0 && (
                          <p className="text-xs text-amber-700">Marque ao menos uma empresa acima para definir os setores.</p>
                        )}
                        {form.empresasAcesso.map((empresa) => {
                          const rascunho = form.aprovacao[empresa];
                          const setores = setoresDaEmpresa(empresa, SETORES, setoresConhecidos);
                          return (
                            <fieldset key={empresa} className="rounded-lg border border-slate-100 p-3">
                              <legend className="px-1 text-sm font-medium text-slate-800">Aprova pedidos da {empresa}</legend>
                              <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm">
                                <label className="flex items-center gap-2 text-slate-700">
                                  <input type="radio" name={`aprov-${empresa}`} checked={rascunho.modo === 'todos'} onChange={() => definirModoAprovacao(empresa, 'todos')} />
                                  Todos os setores
                                </label>
                                <label className="flex items-center gap-2 text-slate-700">
                                  <input type="radio" name={`aprov-${empresa}`} checked={rascunho.modo === 'setores'} onChange={() => definirModoAprovacao(empresa, 'setores')} />
                                  Setores específicos
                                </label>
                              </div>
                              {rascunho.modo === null && (
                                <p className="mt-2 text-xs text-amber-700">Defina o escopo de aprovação da {empresa}.</p>
                              )}
                              {rascunho.modo === 'setores' && (
                                <div className="mt-2 grid gap-1 sm:grid-cols-2">
                                  {setores.map((setor) => (
                                    <label key={setor} className="flex items-center gap-2 text-sm text-slate-700">
                                      <input
                                        type="checkbox"
                                        aria-label={`${setor} (${empresa})`}
                                        checked={rascunho.setores.includes(setor)}
                                        onChange={() => toggleSetor(empresa, setor)}
                                        className={checkboxCls}
                                      />
                                      {setor}
                                    </label>
                                  ))}
                                </div>
                              )}
                            </fieldset>
                          );
                        })}
                      </div>
                    )}

                    {telasOriginais.some((tela) => tela in DEFINICOES_LEGADAS) && (
                      <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                        <p className="text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">Acessos antigos (preservados)</p>
                        <p className="text-xs text-slate-500 mb-2">Telas que saíram do produto e não são oferecidas a novos acessos. Desmarque para retirar.</p>
                        {telasOriginais.filter((tela) => tela in DEFINICOES_LEGADAS).map((tela) => (
                          <label key={tela} className="flex items-start gap-2 py-1 cursor-pointer">
                            <input type="checkbox" checked={form.legadas.includes(tela)} onChange={() => toggleLegada(tela)} className={checkboxCls + ' mt-0.5'} />
                            <span>
                              <span className="block text-sm text-slate-700">{DEFINICOES_LEGADAS[tela].rotulo}</span>
                              <span className="block text-xs text-slate-500">{DEFINICOES_LEGADAS[tela].nota}</span>
                            </span>
                          </label>
                        ))}
                      </div>
                    )}

                    {form.telas.length === 0 && form.legadas.length === 0 && (
                      <p className="text-xs text-amber-600">Selecione ao menos uma tela.</p>
                    )}
                  </div>
                ) : null}

                {erroAcesso && !telasFixas && (
                  <p role="status" className="mt-3 text-xs text-amber-700">{erroAcesso}</p>
                )}
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button type="button" onClick={fecharForm} className="h-10 px-4 rounded-lg border border-slate-300 text-slate-700 text-sm font-medium hover:bg-slate-50 transition-colors cursor-pointer">
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={salvando || !!erroAcesso}
                  className="h-10 px-4 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors flex items-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer"
                >
                  {salvando && <Loader2 className="w-4 h-4 animate-spin" />}
                  {modoEdicao ? 'Salvar' : 'Salvar e enviar convite'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      <ConfirmDialog
        open={!!reenvio}
        title={reenvio?.incerto ? 'Reenviar mesmo com resultado incerto?' : reenvio?.definicaoSenha ? 'Enviar link de definição de senha?' : 'Reenviar convite?'}
        message={reenvio?.incerto
          ? `O último envio para ${reenvio.usuario.nome} teve resultado incerto: o servidor pode ter aceitado a mensagem. Confira os registros SMTP antes de continuar. Um novo envio invalida o link anterior e pode gerar duas mensagens.`
          : reenvio?.definicaoSenha
            ? `${reenvio.usuario.nome} já abriu o convite e ainda não criou a senha. Será enviado um link para criar a senha; o acesso e as permissões não mudam. Um link de definição enviado antes deixa de valer.`
            : `Um novo convite será enviado para ${reenvio?.usuario.nome ?? 'este usuário'}. O link anterior deixa de valer.`}
        confirmLabel={reenvio?.incerto ? 'Reenviar mesmo assim' : reenvio?.definicaoSenha ? 'Enviar link' : 'Reenviar convite'}
        tone={reenvio?.incerto ? 'danger' : 'primary'}
        busy={reenviando}
        onCancel={() => setReenvio(null)}
        onConfirm={() => void confirmarReenvio()}
      />
      <ConfirmDialog
        open={confirmarIncertoNovo}
        title="Reenviar mesmo com resultado incerto?"
        message="Já existe um convite pendente para este e-mail cujo último envio teve resultado incerto: o SMTP pode já ter aceitado a mensagem. Confira os registros SMTP antes de continuar. Um novo envio invalida o link anterior e pode gerar mensagens duplicadas."
        confirmLabel="Reenviar mesmo assim"
        busy={salvando}
        onCancel={() => setConfirmarIncertoNovo(false)}
        onConfirm={() => void confirmarConviteIncerto()}
      />
      <ConfirmDialog
        open={!!usuarioParaRemover}
        title="Remover usuário?"
        message={`O acesso de ${usuarioParaRemover?.nome ?? 'este usuário'} será removido.`}
        confirmLabel="Remover usuário"
        busy={removendoUsuario}
        onCancel={() => setUsuarioParaRemover(null)}
        onConfirm={() => void confirmarRemocaoUsuario()}
      />
    </div>
  );
}
