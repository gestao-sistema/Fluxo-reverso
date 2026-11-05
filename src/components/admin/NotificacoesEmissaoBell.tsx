import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, Check, ExternalLink, RefreshCw } from 'lucide-react';
import apiService from '../../services/apiService';
import { useAuth } from '../../context/AuthContext';
import { codigoPedido } from '../../lib/pedido';
import type { NotificacaoEmissao } from '../../types';
import './notificacoes-emissao.css';

const identificacaoPedido = codigoPedido;

function formatarData(valor: string): string {
  const data = new Date(valor);
  return Number.isFinite(data.getTime())
    ? new Intl.DateTimeFormat('pt-BR', {
      day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo',
    }).format(data).replace('.', '')
    : 'Data não informada';
}

export default function NotificacoesEmissaoBell() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [avisos, setAvisos] = useState<NotificacaoEmissao[]>([]);
  const [naoLidasTotal, setNaoLidasTotal] = useState(0);
  const [aberto, setAberto] = useState(false);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');
  const [atualizando, setAtualizando] = useState(false);
  const [marcando, setMarcando] = useState<string | null>(null);

  // Resposta de uma consulta feita para o perfil anterior (troca rápida) não pode sobrescrever a atual
  const sequencia = useRef(0);
  const carregar = useCallback(async (silencioso = false) => {
    const minha = ++sequencia.current;
    if (!silencioso) setAtualizando(true);
    try {
      const resultado = await apiService.getNotificacoesEmissao();
      if (minha !== sequencia.current) return;
      setAvisos(resultado.notificacoes);
      setNaoLidasTotal(resultado.naoLidas);
      setErro('');
    } catch (falha) {
      if (minha !== sequencia.current) return;
      setErro(falha instanceof Error ? falha.message : 'Não foi possível carregar as notificações.');
    } finally {
      if (minha === sequencia.current) {
        setCarregando(false);
        setAtualizando(false);
      }
    }
  }, []);

  useEffect(() => {
    if (!user?.telas.includes('emitir-etiqueta') || !user.empresasAcesso?.length) {
      sequencia.current += 1;
      setAvisos([]);
      setNaoLidasTotal(0);
      setCarregando(false);
      return;
    }
    setAvisos([]);
    setNaoLidasTotal(0);
    setCarregando(true);
    void carregar();
    const intervalo = window.setInterval(() => {
      if (document.visibilityState === 'visible') void carregar(true);
    }, 60_000);
    const aoRetomar = () => {
      if (document.visibilityState === 'visible') void carregar(true);
    };
    window.addEventListener('focus', aoRetomar);
    return () => {
      window.clearInterval(intervalo);
      window.removeEventListener('focus', aoRetomar);
    };
  }, [carregar, user?.id, user?.telas, user?.empresasAcesso]);

  useEffect(() => {
    if (!aberto) return;
    const fecharComEsc = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setAberto(false);
    };
    window.addEventListener('keydown', fecharComEsc);
    return () => window.removeEventListener('keydown', fecharComEsc);
  }, [aberto]);

  if (!user?.telas.includes('emitir-etiqueta') || !user.empresasAcesso?.length) return null;

  const marcarLida = async (aviso: NotificacaoEmissao) => {
    setMarcando(aviso.id);
    try {
      const sucesso = await apiService.marcarNotificacaoEmissaoLida(aviso.id);
      if (!sucesso) throw new Error('A notificação não está mais disponível para este usuário. Atualize a lista.');
      setAvisos((atuais) => atuais.map((item) => item.id === aviso.id ? { ...item, lida_em: item.lida_em ?? new Date().toISOString() } : item));
      setNaoLidasTotal((atual) => Math.max(0, atual - (aviso.lida_em ? 0 : 1)));
      void carregar(true);
      setErro('');
      return true;
    } catch (falha) {
      setErro(falha instanceof Error ? falha.message : 'Não foi possível salvar a leitura.');
      return false;
    } finally {
      setMarcando(null);
    }
  };

  const abrirPedido = async (aviso: NotificacaoEmissao) => {
    if (!aviso.lida_em && !(await marcarLida(aviso))) return;
    setAberto(false);
    navigate(`/admin/etiquetas?pedido=${encodeURIComponent(aviso.solicitacao_id)}`);
  };

  const naoLidas = naoLidasTotal;

  return (
    <div className="notificacoes-emissao">
      <button
        type="button"
        className="notificacoes-emissao-trigger"
        aria-label={naoLidas ? `Notificações de emissão, ${naoLidas} não lidas` : 'Notificações de emissão'}
        aria-expanded={aberto}
        aria-controls="notificacoes-emissao-painel"
        onClick={() => setAberto((atual) => !atual)}
      >
        <Bell size={18} aria-hidden="true" />
        {naoLidas > 0 && <span className="notificacoes-emissao-count" aria-hidden="true">{naoLidas > 99 ? '99+' : naoLidas}</span>}
      </button>
      {aberto && (
        <section id="notificacoes-emissao-painel" className="notificacoes-emissao-panel" role="dialog" aria-label="Notificações recentes de emissão">
          <header>
            <div><strong>Emissões</strong><span>{naoLidas ? `${naoLidas} não lida${naoLidas === 1 ? '' : 's'}` : 'Avisos recentes'}</span></div>
            <button type="button" className="notificacoes-emissao-refresh" onClick={() => void carregar()} disabled={atualizando} aria-label="Atualizar notificações" title="Atualizar">
              <RefreshCw size={15} className={atualizando ? 'approval-refreshing' : ''} aria-hidden="true" />
            </button>
          </header>
          {erro && <div className="notificacoes-emissao-error" role="alert"><span>{erro}</span><button type="button" onClick={() => void carregar()}>Tentar novamente</button></div>}
          {carregando ? <p className="notificacoes-emissao-empty" role="status">Carregando notificações…</p>
            : avisos.length === 0 ? <p className="notificacoes-emissao-empty">Nenhuma aprovação recente para emissão.</p>
              : <ul>
                {avisos.map((aviso) => (
                  <li key={aviso.id} className={!aviso.lida_em ? 'is-unread' : ''}>
                    <div className="notificacoes-emissao-copy">
                      <strong>{identificacaoPedido(aviso.solicitacao_id)} · {aviso.empresa}</strong>
                      <time dateTime={aviso.created_at}>{formatarData(aviso.created_at)}</time>
                    </div>
                    <div className="notificacoes-emissao-actions">
                      <button type="button" onClick={() => void abrirPedido(aviso)} disabled={marcando === aviso.id}>
                        <ExternalLink size={14} aria-hidden="true" />Abrir na fila
                      </button>
                      {!aviso.lida_em && <button type="button" className="notificacoes-emissao-mark" onClick={() => void marcarLida(aviso)} disabled={marcando === aviso.id} aria-label={`Marcar ${identificacaoPedido(aviso.solicitacao_id)} como lida`} title="Marcar como lida">
                        <Check size={15} aria-hidden="true" />
                      </button>}
                    </div>
                  </li>
                ))}
              </ul>}
        </section>
      )}
    </div>
  );
}
