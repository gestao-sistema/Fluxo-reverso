import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { ArrowRight, Eye, EyeOff, FlaskConical, Gem, KeyRound, Loader2, LockKeyhole, UserRound } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { homeDoUsuario } from '../lib/perfil';
import { useEfeitosFundoPausados } from '../hooks/useEfeitosFundo';
import BotaoEfeitosFundo from '../components/ui/BotaoEfeitosFundo';
import BotaoModoCor from '../components/ui/BotaoModoCor';
import { demoDisponivel } from '../demo/demoMode';
import alinareLogo from '../../assets/alinare_logo.jpg';
import novitahLogo from '../../assets/novitah_logo.jpg';

function caminhoInternoSolicitado(state: unknown): string | null {
  if (!state || typeof state !== 'object') return null;
  const from = (state as { from?: { pathname?: unknown; search?: unknown; hash?: unknown } }).from;
  if (!from || typeof from.pathname !== 'string' || !from.pathname.startsWith('/admin/') || /[?#]/.test(from.pathname)) return null;
  const search = typeof from.search === 'string' && from.search.startsWith('?') ? from.search : '';
  const hash = typeof from.hash === 'string' && from.hash.startsWith('#') ? from.hash : '';
  return `${from.pathname}${search}${hash}`;
}

export default function LoginPage(){
  const {login, iniciarDemonstracao}=useAuth();
  const [efeitosPausados]=useEfeitosFundoPausados();
  const navigate=useNavigate();
  const location=useLocation();
  const retornoSolicitado=caminhoInternoSolicitado(location.state);
  const [usuario,setUsuario]=useState('');
  const [senha,setSenha]=useState('');
  const [mostrarSenha,setMostrarSenha]=useState(false);
  const [erro,setErro]=useState('');
  const [enviando,setEnviando]=useState(false);
  const onSubmit=async(e:React.FormEvent)=>{
    e.preventDefault();setErro('');
    if(!usuario.trim()||!senha){setErro('Informe seu usuário e sua senha.');return;}
    setEnviando(true);
    try{const sessao=await login(usuario,senha);toast.success(`Bem-vindo, ${sessao.nome}.`);navigate(retornoSolicitado ?? homeDoUsuario(sessao),{replace:true});}
    catch(err){const msg=err instanceof Error?err.message:'Falha ao entrar.';setErro(msg);toast.error(msg);}
    finally{setEnviando(false)}
  };
  const abrirDemonstracao=()=>{
    iniciarDemonstracao();
    navigate(retornoSolicitado ?? '/admin/dashboard',{replace:true});
  };
  return <div className={`login-page ${efeitosPausados ? 'effects-paused' : ''}`}>
    <div className="login-controls">
      <BotaoModoCor />
      <BotaoEfeitosFundo className="login-efeitos" />
    </div>
    <section className="login-pane" aria-label="Acesso ao sistema">
      <div className="login-form-wrap login-card">
        <header className="login-head">
          <div className="login-emblem" aria-hidden="true"><Gem size={20} strokeWidth={1.6}/></div>
          <p className="flow-eyebrow">Logística reversa</p>
          <h1 className="login-title">Reverso</h1>
          <div className="login-divisor" aria-hidden="true" />
          <div className="login-marcas" role="group" aria-label="Alinare e Novitah">
            <img className="login-marca-logo" src={alinareLogo} alt="Alinare" />
            <img className="login-marca-logo" src={novitahLogo} alt="Novitah" />
          </div>
        </header>
        <form onSubmit={onSubmit} noValidate>
          <div className="login-field"><label htmlFor="usuario">USUÁRIO</label><div className="login-input-wrap"><UserRound size={18}/><input id="usuario" type="text" autoComplete="username" value={usuario} onChange={e=>setUsuario(e.target.value)} required/></div></div>
          <div className="login-field"><label htmlFor="senha">SENHA</label><div className="login-input-wrap"><LockKeyhole size={18}/><input id="senha" type={mostrarSenha?'text':'password'} autoComplete="current-password" value={senha} onChange={e=>setSenha(e.target.value)} required/><button type="button" onClick={()=>setMostrarSenha(v=>!v)} aria-label={mostrarSenha?'Ocultar senha':'Exibir senha'} title={mostrarSenha?'Ocultar senha':'Exibir senha'}>{mostrarSenha?<EyeOff size={17}/>:<Eye size={17}/>}</button></div></div>
          {erro&&<div role="alert" className="login-error">{erro}</div>}
          <button type="submit" disabled={enviando} className="login-submit">{enviando?<Loader2 className="animate-spin" size={18}/>:<KeyRound size={17}/>} Acessar plataforma <ArrowRight size={16}/></button>
        </form>
        {demoDisponivel() && <button type="button" className="login-demo" onClick={abrirDemonstracao}><FlaskConical size={17}/><span><strong>Iniciar demonstração</strong></span><ArrowRight size={16}/></button>}
      </div>
    </section>
  </div>;
}
