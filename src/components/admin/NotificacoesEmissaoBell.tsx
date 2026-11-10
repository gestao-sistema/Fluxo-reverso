import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, Check, ExternalLink, RefreshCw } from 'lucide-react';
import toast from 'react-hot-toast';
import apiService from '../../services/apiService';
import avisosReversoService from '../../services/avisosReversoService';
import { useAuth } from '../../context/AuthContext';
import { codigoPedido } from '../../lib/pedido';
import {
  ROTULO_EVENTO_AVISO,
  avisoNaoLidoAtivo,
  identificacaoDoAviso,
  rotaDoAviso,
  textoDoAviso,
  type AvisoReverso,
} from '../../lib/avisosReverso';
import type { NotificacaoEmissao } from '../../types';
import './notificacoes-emissao.css';

// Sino único: avisos do ciclo da reversa (todos os usuários autorizados) e, para quem emite,
// os avisos de emissão de sempre. Os dois vêm de consultas separadas: a falha de uma não
// apaga a outra, e a falha nunca aparece como "nenhuma notificação".

const identificacaoPedido = codigoPedido;

function formatarData(valor: string): string {
  const data = new Date(valor);
  return Number.isFinite(data.getTime())
    ? new Intl.DateTimeFormat('pt-BR', {
      day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo',
    }).format(data).replace('.', '')
    : 'Data não informada';
}

function mensagemDe(falha: unknown, padrao: string): string {
  return falha instanceof Error && falha.message ? falha.message : padrao;
}

type ItemDoSino =
  | { chave: string; criadoEm: string; tipo: 'emissao'; emissao: NotificacaoEmissao }
  | { chave: string; criadoEm: string; tipo: 'aviso'; aviso: AvisoReverso };

export default function NotificacoesEmissaoBell() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const usuarioId = user?.id ?? null;
  const podeEmitir = !!user?.telas.includes('emitir-etiqueta') && !!user.empresasAcesso?.length;

  const [emissoes, setEmissoes] = useState<NotificacaoEmissao[]>([]);
  const [naoLidasEmissoes, setNaoLidasEmissoes] = useState(0);
  const [avisos, setAvisos] = useState<AvisoReverso[]>([]);
  const [naoLidosAvisos, setNaoLidosAvisos] = useState(0);
  const [erroEmissoes, setErroEmissoes] = useState('');
  const [erroAvisos, setErroAvisos] = useState('');
  const [erroAcao, setErroAcao] = useState('');
  const [aberto, setAberto] = useState(false);
  const [carregando, setCarregando] = useState(true);
  const [atualizando, setAtualizando] = useState(false);
  const [marcando, setMarcando] = useState<string | null>(null);

  // Resposta de uma consulta feita para o perfil anterior (troca rápida) não pode sobrescrever a atual
  const sequencia = useRef(0);
  const carregar = useCallback(async (silencioso = false) => {
    if (!usuarioId) return;
    const minha = ++sequencia.current;
    if (!silencioso) setAtualizando(true);
    const [emissao, lista, contagem] = await Promise.allSettled([
      podeEmitir ? apiService.getNotificacoesEmissao() : Promise.resolve(null),
      avisosReversoService.listarAvisos(),
      avisosReversoService.contarAvisosNaoLidos(),
    ]);
    if (minha !== sequencia.current) return;

    if (emissao.status === 'fulfilled') {
      setEmissoes(emissao.value?.notificacoes ?? []);
      setNaoLidasEmissoes(emissao.value?.naoLidas ?? 0);
      setErroEmissoes('');
    } else {
      setErroEmissoes(mensagemDe(emissao.reason, 'Não foi possível carregar as notificações de emissão.'));
    }

    if (lista.status === 'fulfilled') setAvisos(lista.value);
    if (contagem.status === 'fulfilled') setNaoLidosAvisos(contagem.value);
    const falhouAviso = lista.status === 'rejected' || contagem.status === 'rejected';
    setErroAvisos(falhouAviso
      ? mensagemDe(lista.status === 'rejected' ? lista.reason : contagem.status === 'rejected' ? contagem.reason : null,
        'Não foi possível carregar as notificações agora. Tente novamente.')
      : '');

    setCarregando(false);
    setAtualizando(false);
  }, [podeEmitir, usuarioId]);

  useEffect(() => {
    // Troca de usuário: descarta o que era do anterior e ignora respostas em voo
    sequencia.current += 1;
    setEmissoes([]);
    setNaoLidasEmissoes(0);
    setAvisos([]);
    setNaoLidosAvisos(0);
    setErroEmissoes('');
    setErroAvisos('');
    setErroAcao('');
    setAberto(false);
    if (!usuarioId) {
      setCarregando(false);
      return;
    }
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
  }, [carregar, usuarioId]);

  useEffect(() => {
    if (!aberto) return;
    const fecharComEsc = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setAberto(false);
    };
    window.addEventListener('keydown', fecharComEsc);
    return () => window.removeEventListener('keydown', fecharComEsc);
  }, [aberto]);

  const itens = useMemo<ItemDoSino[]>(() => [
    ...emissoes.map((emissao): ItemDoSino => ({ chave: `emissao-${emissao.id}`, criadoEm: emissao.created_at, tipo: 'emissao', emissao })),
    ...avisos.map((aviso): ItemDoSino => ({ chave: `aviso-${aviso.id}`, criadoEm: aviso.criado_em, tipo: 'aviso', aviso })),
  ].sort((a, b) => b.criadoEm.localeCompare(a.criadoEm)), [emissoes, avisos]);

  if (!user) return null;

  const naoLidas = naoLidasEmissoes + naoLidosAvisos;
  const erroConsulta = erroAvisos || erroEmissoes;

  const marcarEmissaoLida = async (aviso: NotificacaoEmissao) => {
    setMarcando(aviso.id);
    try {
      const sucesso = await apiService.marcarNotificacaoEmissaoLida(aviso.id);
      if (!sucesso) throw new Error('A notificação não está mais disponível para este usuário. Atualize a lista.');
      setEmissoes((atuais) => atuais.map((item) => item.id === aviso.id ? { ...item, lida_em: item.lida_em ?? new Date().toISOString() } : item));
      setNaoLidasEmissoes((atual) => Math.max(0, atual - (aviso.lida_em ? 0 : 1)));
      void carregar(true);
      setErroAcao('');
      return true;
    } catch (falha) {
      setErroAcao(mensagemDe(falha, 'Não foi possível salvar a leitura.'));
      return false;
    } finally {
      setMarcando(null);
    }
  };

  const marcarAvisoLido = async (aviso: AvisoReverso): Promise<boolean> => {
    setMarcando(aviso.id);
    try {
      const sucesso = await avisosReversoService.marcarAvisoLido(aviso.id);
      if (!sucesso) throw new Error('A notificação não está mais disponível para este usuário. Atualize a lista.');
      const agora = new Date().toISOString();
      setAvisos((atuais) => atuais.map((item) => item.id === aviso.id ? { ...item, lido_em: item.lido_em ?? agora } : item));
      if (avisoNaoLidoAtivo(aviso)) setNaoLidosAvisos((atual) => Math.max(0, atual - 1));
      setErroAcao('');
      return true;
    } catch (falha) {
      setErroAcao(mensagemDe(falha, 'Não foi possível salvar a leitura.'));
      return false;
    } finally {
      setMarcando(null);
    }
  };

  const abrirPedido = async (aviso: NotificacaoEmissao) => {
    if (!aviso.lida_em && !(await marcarEmissaoLida(aviso))) return;
    setAberto(false);
    navigate(`/admin/etiquetas?pedido=${encodeURIComponent(aviso.solicitacao_id)}`);
  };

  const abrirAviso = async (aviso: AvisoReverso) => {
    // A tela do pedido abre mesmo se a leitura falhar; a falha é avisada, e o aviso segue não lido.
    if (!aviso.lido_em && !(await marcarAvisoLido(aviso))) {
      toast.error('Não foi possível registrar a leitura. O pedido foi aberto mesmo assim.');
    }
    setAberto(false);
    navigate(rotaDoAviso(aviso));
  };

  return (
    <div className="notificacoes-emissao">
      <button
        type="button"
        className="notificacoes-emissao-trigger"
        aria-label={naoLidas ? `Notificações, ${naoLidas} não lidas` : 'Notificações'}
        aria-expanded={aberto}
        aria-controls="notificacoes-emissao-painel"
        onClick={() => setAberto((atual) => !atual)}
      >
        <Bell size={18} aria-hidden="true" />
        {naoLidas > 0 && <span className="notificacoes-emissao-count" aria-hidden="true">{naoLidas > 99 ? '99+' : naoLidas}</span>}
      </button>
      {aberto && (
        <section id="notificacoes-emissao-painel" className="notificacoes-emissao-panel" role="dialog" aria-label="Notificações recentes">
          <header>
            <div><strong>Notificações</strong><span>{naoLidas ? `${naoLidas} não lida${naoLidas === 1 ? '' : 's'}` : 'Nada novo'}</span></div>
            <button type="button" className="notificacoes-emissao-refresh" onClick={() => void carregar()} disabled={atualizando} aria-label="Atualizar notificações" title="Atualizar">
              <RefreshCw size={15} className={atualizando ? 'approval-refreshing' : ''} aria-hidden="true" />
            </button>
          </header>
          {erroConsulta && (
            <div className="notificacoes-emissao-error" role="alert">
              <span>{erroConsulta}</span>
              <button type="button" onClick={() => void carregar()}>Tentar novamente</button>
            </div>
          )}
          {erroAcao && <p className="notificacoes-emissao-error" role="alert"><span>{erroAcao}</span></p>}
          {carregando ? <p className="notificacoes-emissao-empty" role="status">Carregando notificações…</p>
            : itens.length === 0 ? (erroConsulta ? null : <p className="notificacoes-emissao-empty">Nenhuma notificação recente.</p>)
              : <ul>
                {itens.map((item) => item.tipo === 'emissao' ? (
                  <li key={item.chave} className={!item.emissao.lida_em ? 'is-unread' : ''}>
                    <div className="notificacoes-emissao-copy">
                      <span className="notificacoes-emissao-kind">Emissão</span>
                      <strong>{identificacaoPedido(item.emissao.solicitacao_id)} · {item.emissao.empresa}</strong>
                      <time dateTime={item.emissao.created_at}>{formatarData(item.emissao.created_at)}</time>
                    </div>
                    <div className="notificacoes-emissao-actions">
                      <button type="button" onClick={() => void abrirPedido(item.emissao)} disabled={marcando === item.emissao.id}>
                        <ExternalLink size={14} aria-hidden="true" />Abrir na fila
                      </button>
                      {!item.emissao.lida_em && <button type="button" className="notificacoes-emissao-mark" onClick={() => void marcarEmissaoLida(item.emissao)} disabled={marcando === item.emissao.id} aria-label={`Marcar ${identificacaoPedido(item.emissao.solicitacao_id)} como lida`} title="Marcar como lida">
                        <Check size={15} aria-hidden="true" />
                      </button>}
                    </div>
                  </li>
                ) : (
                  <li key={item.chave} className={[avisoNaoLidoAtivo(item.aviso) ? 'is-unread' : '', item.aviso.superado_em ? 'is-superseded' : ''].filter(Boolean).join(' ')}>
                    <div className="notificacoes-emissao-copy">
                      <span className="notificacoes-emissao-kind">{ROTULO_EVENTO_AVISO[item.aviso.evento]}</span>
                      <strong>{identificacaoDoAviso(item.aviso)} · {item.aviso.empresa}</strong>
                      <p className="notificacoes-emissao-text">{textoDoAviso(item.aviso)}</p>
                      <time dateTime={item.aviso.criado_em}>{formatarData(item.aviso.criado_em)}</time>
                    </div>
                    <div className="notificacoes-emissao-actions">
                      <button type="button" onClick={() => void abrirAviso(item.aviso)} disabled={marcando === item.aviso.id}>
                        <ExternalLink size={14} aria-hidden="true" />{item.aviso.evento === 'aprovacao_pendente' ? 'Abrir na aprovação' : 'Abrir pedido'}
                      </button>
                      {!item.aviso.lido_em && <button type="button" className="notificacoes-emissao-mark" onClick={() => void marcarAvisoLido(item.aviso)} disabled={marcando === item.aviso.id} aria-label={`Marcar ${identificacaoDoAviso(item.aviso)} como lida`} title="Marcar como lida">
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
