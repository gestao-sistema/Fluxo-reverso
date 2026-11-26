// ── Definição da própria senha pelo convite de acesso ────────────────────────
// Rota pública /definir-senha?token_hash=...&type=invite (link montado pela Edge Function admin-usuarios).
// - O token é lido uma única vez e removido da URL na hora; nunca vai para analytics nem para logs.
// - A abertura da página NÃO consome o convite: scanners de e-mail que só fazem GET não o invalidam.
//   O convite só é verificado (verifyOtp) quando a própria pessoa envia a nova senha.
// - A senha só é aplicada à sessão que este convite abriu (conferida no servidor), nunca a outra pessoa.
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { ArrowRight, CircleAlert, Eye, EyeOff, Loader2, LockKeyhole } from 'lucide-react';
import authService, { MSG_CONVITE_INVALIDO, SENHA_MINIMA_CONVITE } from '../services/authService';
import type { TipoConvite } from '../services/authService';
import { useAuth } from '../context/AuthContext';
import EntradaLayout from '../components/shell/EntradaLayout';

const FORMATO_TOKEN = /^[A-Za-z0-9_-]{16,200}$/;

/** Lê o token_hash e o tipo (convite ou definição de senha). Qualquer outro tipo ou formato é link inválido. */
function lerLinkDaUrl(): { token: string; tipo: TipoConvite } | null {
  const parametros = new URLSearchParams(window.location.search);
  const token = parametros.get('token_hash');
  const tipo = parametros.get('type');
  return token && (tipo === 'invite' || tipo === 'recovery') && FORMATO_TOKEN.test(token) ? { token, tipo } : null;
}

export default function DefinirSenhaPage() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const [link] = useState(lerLinkDaUrl);
  const [tokenHash, setTokenHash] = useState<string | null>(link?.token ?? null);
  const [convidadoId, setConvidadoId] = useState<string | null>(null);
  // Sem token na URL (F5, página reaberta): procura uma sessão de convidado que ainda não tem senha.
  const [verificandoSessao, setVerificandoSessao] = useState(!link);
  const [retomada, setRetomada] = useState(false);
  const [linkInvalido, setLinkInvalido] = useState(false);
  const [senha, setSenha] = useState('');
  const [confirmacao, setConfirmacao] = useState('');
  const [mostrarSenha, setMostrarSenha] = useState(false);
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);
  const emEnvio = useRef(false);

  // Retira token e fragmento da barra de endereço e do histórico assim que a página abre.
  useEffect(() => {
    if (window.location.search || window.location.hash) {
      window.history.replaceState(window.history.state, '', window.location.pathname);
    }
  }, []);

  useEffect(() => {
    if (link) return;
    let ativo = true;
    authService.sessaoDeConvitePendente()
      .then((pendente) => {
        if (!ativo || !pendente) return;
        setConvidadoId(pendente.usuarioId);
        setRetomada(true);
      })
      .catch(() => undefined)
      .finally(() => { if (ativo) setVerificandoSessao(false); });
    return () => { ativo = false; };
  }, [link]);

  const semLink = !tokenHash && !convidadoId;

  const sair = async () => {
    await logout();
    navigate('/login/azime', { replace: true });
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (emEnvio.current) return;
    setErro('');
    if (senha.length < SENHA_MINIMA_CONVITE) {
      setErro(`A senha deve ter pelo menos ${SENHA_MINIMA_CONVITE} caracteres.`);
      return;
    }
    if (senha !== confirmacao) {
      setErro('As senhas não conferem.');
      return;
    }
    emEnvio.current = true;
    setEnviando(true);
    try {
      let id = convidadoId;
      if (!id) {
        let convite: { usuarioId: string };
        try {
          convite = await authService.validarConvite(tokenHash!, link?.tipo ?? 'invite');
        } catch (falha) {
          // Link já usado, mas esta sessão é de quem ainda não definiu a senha (convite aberto e página
          // fechada): continua daqui, sem precisar do link. A senha só vale para a própria sessão.
          if (falha instanceof Error && falha.message === MSG_CONVITE_INVALIDO) {
            const pendente = await authService.sessaoDeConvitePendente().catch(() => null);
            if (pendente) {
              setConvidadoId(pendente.usuarioId);
              setTokenHash(null);
              setRetomada(true);
              setErro('Este link já foi usado, mas a sua conta ainda não tem senha. Clique em Salvar senha para concluir.');
              return;
            }
          }
          throw falha;
        }
        id = convite.usuarioId;
        // O convite já foi consumido: o token não é mais necessário nem fica em memória.
        setConvidadoId(id);
        setTokenHash(null);
      }
      await authService.definirSenhaDoConvite(id, senha);
      setSenha('');
      setConfirmacao('');
      toast.success('Senha definida. Bem-vindo ao Reverso.');
      navigate('/', { replace: true });
    } catch (err) {
      const mensagem = err instanceof Error ? err.message : 'Não foi possível concluir. Tente novamente.';
      // Convite recusado (inválido, expirado ou já usado): não há o que repetir com este link.
      if (mensagem === MSG_CONVITE_INVALIDO) setLinkInvalido(true);
      else setErro(mensagem);
    } finally {
      emEnvio.current = false;
      setEnviando(false);
    }
  };

  const painelSemFormulario = !verificandoSessao && (linkInvalido || semLink);

  return (
    <EntradaLayout rotulo="Definir senha de acesso">
      <h1 className="entry-titulo">Defina sua senha</h1>
      <p className="muted entry-lede">Convite de acesso ao Reverso.</p>
      {user && (
        <button type="button" className="btn btn-secondary btn-block" style={{ marginBottom: 14 }} onClick={() => void sair()}>
          Sair sem definir a senha
        </button>
      )}
      {verificandoSessao ? (
        <p role="status" className="row muted" style={{ justifyContent: 'center' }}>
          <Loader2 className="spin" size={16} aria-hidden="true" />Verificando o seu acesso…
        </p>
      ) : painelSemFormulario ? (
        <div className="stack">
          <div role="alert" className="banner banner-danger">
            <CircleAlert size={18} aria-hidden="true" style={{ flexShrink: 0, marginTop: 1 }} />
            <span className="b-text">
              {linkInvalido ? MSG_CONVITE_INVALIDO : 'Abra o link do convite que você recebeu por e-mail para definir sua senha. Se você já criou a senha, entre pelo login. Se abriu o link e não terminou, peça um novo envio a quem administra o sistema.'}
            </span>
          </div>
          <Link to="/login/azime" className="btn btn-primary btn-block btn-entry">
            Ir para o login <ArrowRight size={16} aria-hidden="true" />
          </Link>
        </div>
      ) : (
        <form onSubmit={onSubmit} noValidate className="stack" style={{ gap: 18 }}>
          <p className="small muted">Crie a senha do Reverso. Ela é só deste sistema e independe da sua senha Microsoft.</p>
          {retomada && (
            <p role="status" className="banner banner-info">
              <span className="b-text">O seu convite já foi aberto e falta só criar a senha do Reverso.</span>
            </p>
          )}
          {user && !convidadoId && (
            <p role="status" className="banner banner-warn">
              <span className="b-text">Há uma pessoa conectada neste navegador. Ao continuar, essa sessão será substituída pela do convite.</span>
            </p>
          )}
          <div className="field">
            <label htmlFor="nova-senha">Nova senha</label>
            <div className="input-icon">
              <LockKeyhole size={17} aria-hidden="true" />
              <input id="nova-senha" className="input" style={{ paddingRight: 48 }} type={mostrarSenha ? 'text' : 'password'} autoComplete="new-password" value={senha} onChange={(e) => setSenha(e.target.value)} minLength={SENHA_MINIMA_CONVITE} required />
              <span className="trail">
                <button type="button" className="icon-btn" onClick={() => setMostrarSenha((v) => !v)} aria-label={mostrarSenha ? 'Ocultar senhas' : 'Exibir senhas'} title={mostrarSenha ? 'Ocultar senhas' : 'Exibir senhas'}>
                  {mostrarSenha ? <EyeOff size={17} aria-hidden="true" /> : <Eye size={17} aria-hidden="true" />}
                </button>
              </span>
            </div>
            <span className="help">Mínimo de {SENHA_MINIMA_CONVITE} caracteres.</span>
          </div>
          <div className="field">
            <label htmlFor="confirmar-senha">Confirmar senha</label>
            <div className="input-icon">
              <LockKeyhole size={17} aria-hidden="true" />
              <input id="confirmar-senha" className="input" type={mostrarSenha ? 'text' : 'password'} autoComplete="new-password" value={confirmacao} onChange={(e) => setConfirmacao(e.target.value)} required />
            </div>
          </div>
          {erro && (
            <div role="alert" className="banner banner-danger">
              <CircleAlert size={18} aria-hidden="true" style={{ flexShrink: 0, marginTop: 1 }} />
              <span className="b-text">{erro}</span>
            </div>
          )}
          <button type="submit" disabled={enviando} className="btn btn-primary btn-block btn-entry">
            {enviando ? <Loader2 className="spin" size={17} aria-hidden="true" /> : <LockKeyhole size={17} aria-hidden="true" />}
            Salvar senha {!enviando && <ArrowRight size={16} aria-hidden="true" />}
          </button>
        </form>
      )}
    </EntradaLayout>
  );
}
