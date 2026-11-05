// ── Definição da própria senha pelo convite de acesso ────────────────────────
// Rota pública /definir-senha?token_hash=...&type=invite (link montado pela Edge Function admin-usuarios).
// - O token é lido uma única vez e removido da URL na hora; nunca vai para analytics nem para logs.
// - A abertura da página NÃO consome o convite: scanners de e-mail que só fazem GET não o invalidam.
//   O convite só é verificado (verifyOtp) quando a própria pessoa envia a nova senha.
// - A senha só é aplicada à sessão que este convite abriu (conferida no servidor), nunca a outra pessoa.
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { ArrowRight, Eye, EyeOff, Gem, Loader2, LockKeyhole } from 'lucide-react';
import authService, { MSG_CONVITE_INVALIDO, SENHA_MINIMA_CONVITE } from '../services/authService';
import type { TipoConvite } from '../services/authService';
import { useAuth } from '../context/AuthContext';
import { useEfeitosFundoPausados } from '../hooks/useEfeitosFundo';
import BotaoModoCor from '../components/ui/BotaoModoCor';
import BotaoEfeitosFundo from '../components/ui/BotaoEfeitosFundo';

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
  const [efeitosPausados] = useEfeitosFundoPausados();
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
    navigate('/login', { replace: true });
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

  return <div className={`login-page ${efeitosPausados ? 'effects-paused' : ''}`}>
    <div className="login-controls">
      <BotaoModoCor />
      <BotaoEfeitosFundo className="login-efeitos" />
    </div>
    <section className="login-pane" aria-label="Definir senha de acesso">
      <div className="login-form-wrap login-card">
        <header className="login-head">
          <div className="login-emblem" aria-hidden="true"><Gem size={20} strokeWidth={1.6}/></div>
          <p className="flow-eyebrow">Convite de acesso</p>
          <h1 className="login-title">Reverso</h1>
          <div className="login-divisor" aria-hidden="true" />
        </header>
        {user && <button type="button" className="login-submit" style={{ marginBottom: 12 }} onClick={() => void sair()}>
          Sair sem definir a senha
        </button>}
        {verificandoSessao ? <p role="status" className="flow-eyebrow" style={{ textAlign: 'center' }}>
          <Loader2 className="animate-spin" size={16} style={{ display: 'inline', marginRight: 6 }}/>Verificando o seu acesso…
        </p> : painelSemFormulario ? <div>
          <div role="alert" className="login-error">
            {linkInvalido ? MSG_CONVITE_INVALIDO : 'Abra o link do convite que você recebeu por e-mail para definir sua senha. Se você já criou a senha, entre pelo login. Se abriu o link e não terminou, peça um novo envio a quem administra o sistema.'}
          </div>
          <Link to="/login" className="login-submit" style={{ textDecoration: 'none', justifyContent: 'center' }}>
            Ir para o login <ArrowRight size={16}/>
          </Link>
        </div> : <form onSubmit={onSubmit} noValidate>
          <p className="flow-eyebrow" style={{ textAlign: 'center', marginBottom: 12 }}>
            Crie a senha do Reverso. Ela é só deste sistema e independe da sua senha Microsoft.
          </p>
          {retomada && <p role="status" className="flow-eyebrow" style={{ textAlign: 'center', marginBottom: 12 }}>
            O seu convite já foi aberto e falta só criar a senha do Reverso.
          </p>}
          {user && !convidadoId && <p role="status" className="flow-eyebrow" style={{ textAlign: 'center', marginBottom: 12 }}>
            Há uma pessoa conectada neste navegador. Ao continuar, essa sessão será substituída pela do convite.
          </p>}
          <div className="login-field"><label htmlFor="nova-senha">NOVA SENHA</label><div className="login-input-wrap"><LockKeyhole size={18}/><input id="nova-senha" type={mostrarSenha?'text':'password'} autoComplete="new-password" value={senha} onChange={e=>setSenha(e.target.value)} minLength={SENHA_MINIMA_CONVITE} required/><button type="button" onClick={()=>setMostrarSenha(v=>!v)} aria-label={mostrarSenha?'Ocultar senhas':'Exibir senhas'} title={mostrarSenha?'Ocultar senhas':'Exibir senhas'}>{mostrarSenha?<EyeOff size={17}/>:<Eye size={17}/>}</button></div></div>
          <div className="login-field"><label htmlFor="confirmar-senha">CONFIRMAR SENHA</label><div className="login-input-wrap"><LockKeyhole size={18}/><input id="confirmar-senha" type={mostrarSenha?'text':'password'} autoComplete="new-password" value={confirmacao} onChange={e=>setConfirmacao(e.target.value)} required/></div></div>
          {erro&&<div role="alert" className="login-error">{erro}</div>}
          <button type="submit" disabled={enviando} className="login-submit">{enviando?<Loader2 className="animate-spin" size={18}/>:<LockKeyhole size={17}/>} Salvar senha <ArrowRight size={16}/></button>
        </form>}
      </div>
    </section>
  </div>;
}
