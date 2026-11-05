// ── Modal de Detalhes da Solicitação ─────────────────────────────────────────
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { X, Timer, Calendar, User, Package, MapPin, Building2, StickyNote, History, Truck, CheckCircle2, ChevronDown, Trash2, PackageCheck } from 'lucide-react';
import type { Solicitacao, SolicitacaoHistorico, RastreamentoCorreios } from '../../types';
import { STATUS_LABEL } from '../../types';
import { statusEfetivo } from '../../lib/situacaoPedido';
import { formatarTempo } from '../../services/analytics';
import apiService from '../../services/apiService';
import { useAuth } from '../../context/AuthContext';
import { podeConfirmarCheckin, podeConfirmarRecebimentoMercadoria, podeEmitirEtiqueta, podeOperarReversa, podeVerNc } from '../../lib/perfil';
import { codigoNc } from '../../lib/ncCalculos';
import EtiquetaReversa from './EtiquetaReversa';
import ConfirmDialog from '../ui/ConfirmDialog';
import { codigoPedido } from '../../lib/pedido';

interface RecordDetailModalProps {
  isOpen: boolean;
  solicitacao: Solicitacao | null;
  onClose: () => void;
}

/** Monta linha de status por evento (mesma cor do Kanban). */
function corEvento(codigo: string | undefined): string {
  if (!codigo) return 'text-slate-400';
  if (codigo === 'PO') return 'text-violet-500';
  if (codigo === 'RO' || codigo === 'OEC') return 'text-orange-500';
  if (codigo === 'BDE') return 'text-emerald-500';
  return 'text-slate-500';
}

/**
 * Linha do tempo do pedido: operação, decisões de aprovação e emissões. Se qualquer fonte falhar,
 * a consulta falha (o erro é mostrado e pode ser repetido): nunca vira "sem histórico".
 */
async function carregarLinhaDoTempo(id: string): Promise<SolicitacaoHistorico[]> {
  const [operacao, aprovacao, emissao] = await Promise.all([
    apiService.getHistorico(id),
    apiService.getHistoricoAprovacao(id),
    apiService.getHistoricoEmissao(id),
  ]);
  return [
    ...operacao,
    ...aprovacao.map((e) => ({
      id: `aprovacao-${e.id}`, solicitacao_id: id, user_nome: e.user_nome, created_at: e.created_at,
      acao: e.evento === 'aprovada' ? 'Solicitação aprovada'
        : e.evento === 'rejeitada' ? `Solicitação rejeitada${e.justificativa ? `: ${e.justificativa}` : ''}`
        : e.evento === 'invalidada' ? 'Aprovação invalidada' : 'Solicitação alterada para nova análise',
    })),
    ...emissao.map((e) => ({ id: `emissao-${e.id}`, solicitacao_id: id, user_nome: e.user_nome, created_at: e.created_at, acao: e.descricao || e.tipo })),
  ].sort((a, b) => b.created_at.localeCompare(a.created_at));
}

/** Remove ruído do detalhe do evento (pesquisa de satisfação, links, etc). */
function limparDetalhe(detalhe: string | undefined | null): string | null {
  if (!detalhe) return null;
  const limpo = detalhe
    .replace(/https?:\/\/\S+/g, '') // links (survey etc)
    .replace(/Sua opinião é importante.*$/is, '')
    .replace(/avaliar o serviço.*$/is, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
  return limpo || null;
}

interface EventoApi {
  codigo?: string;
  descricao?: string;
  dtHrCriado?: string;
  detalhe?: string;
  unidade?: { tipo?: string; nome?: string; endereco?: { cidade?: string; uf?: string; logradouro?: string; bairro?: string } };
  unidadeDestino?: { tipo?: string; endereco?: { cidade?: string; uf?: string } };
}

/** Componente do retorno da API: resumo em chips + collapse "Mais detalhes" com timeline limpa. */
function RetornoResumo({ retorno, onUpdate }: { retorno: any; onUpdate: () => Promise<any> }) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const objeto = retorno?.objetos?.[0];

  // Auto-refresh ao abrir o collapse (só quando muda o estado de aberto)
  useEffect(() => {
    if (detailsOpen) onUpdate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detailsOpen]);

  // Casos de erro/mensagem (SRO-009, SRO-020 etc) — sem timeline
  if (!objeto || objeto.mensagem) {
    return (
      <div className="mt-4 pt-4 border-t border-slate-200">
        <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-amber-50 border border-amber-100">
          <Package className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
          <span className="text-xs text-amber-700 font-medium">
            {objeto?.mensagem ?? retorno?.erro ?? 'Sem retorno dos Correios.'}
          </span>
        </div>
      </div>
    );
  }

  const eventos: EventoApi[] = objeto.eventos ?? [];
  const ultimo = eventos[0];

  const chips: { label: string; value: string }[] = [];
  if (objeto.tipoPostal?.categoria) chips.push({ label: 'Serviço', value: objeto.tipoPostal.categoria });
  if (objeto.dtPrevista) chips.push({ label: 'Previsão', value: new Date(objeto.dtPrevista).toLocaleDateString('pt-BR') });
  if (objeto.peso) chips.push({ label: 'Peso', value: `${objeto.peso} kg` });
  if (objeto.valorDeclarado) chips.push({ label: 'Valor declarado', value: `R$ ${objeto.valorDeclarado.toFixed(2)}` });

  return (
    <div className="mt-4 pt-4 border-t border-slate-200">
      {/* Última movimentação + chips de dados úteis */}
      {ultimo && (
        <>
          <p className={`text-sm font-semibold mb-2 ${corEvento(ultimo.codigo)}`}>
            {ultimo.descricao}
          </p>
          <div className="flex flex-wrap gap-1.5 mb-3">
            {chips.map((c) => (
              <span key={c.label} className="px-2 py-0.5 rounded-full bg-white border border-slate-200 text-xs text-slate-600">
                <span className="text-slate-400">{c.label}:</span> {c.value}
              </span>
            ))}
          </div>
        </>
      )}

      {/* Colapsável com timeline completa e limpa */}
      <details className="group" open={detailsOpen} onToggle={(e) => setDetailsOpen(e.currentTarget.open)}>
        <summary className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 cursor-pointer select-none list-none hover:text-blue-700 min-h-[32px] focus:outline-none">
          <ChevronDown className="w-3.5 h-3.5 transition-transform group-open:rotate-180" />
          Mais detalhes
        </summary>
        <ul className="ml-2 mt-3 max-h-72 overflow-y-auto pr-1">
          {eventos.map((ev, i) => {
            const detalhe = limparDetalhe(ev.detalhe);
            const local = [ev.unidade?.endereco?.cidade, ev.unidade?.endereco?.uf].filter(Boolean).join('/');
            const destino = [ev.unidadeDestino?.endereco?.cidade, ev.unidadeDestino?.endereco?.uf].filter(Boolean).join('/');
            return (
              <li key={i} className="relative pl-8 pb-6 before:absolute before:left-[7px] before:top-3 before:bottom-0 before:w-[2px] before:bg-slate-200 before:content-[''] last:before:hidden">
                <span className={`absolute left-0 top-1.5 w-4 h-4 rounded-full border-2 border-white flex items-center justify-center z-10 ${i === 0 ? 'bg-blue-500' : 'bg-slate-300'}`}>
                  {i === 0 && <span className="w-1.5 h-1.5 rounded-full bg-white" />}
                </span>
                <div className="pl-1">
                  <p className={`text-sm ${i === 0 ? 'font-medium text-slate-900' : 'text-slate-700'}`}>{ev.descricao}</p>
                  <p className="text-xs text-slate-400">
                    {ev.dtHrCriado ? new Date(ev.dtHrCriado).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : ''}
                  </p>
                  {detalhe && <p className="text-xs text-slate-500 mt-0.5">{detalhe}</p>}
                  {local && <p className="text-xs text-slate-500">{ev.unidade?.tipo ? `${ev.unidade.tipo} — ` : ''}{local}</p>}
                  {destino && <p className="text-xs text-slate-400">→ {destino}</p>}
                </div>
              </li>
            );
          })}
          {eventos.length === 0 && <li className="text-xs text-slate-400">Aguardando primeiro registro nos Correios.</li>}
        </ul>
      </details>
    </div>
  );
}

export default function RecordDetailModal({
  isOpen,
  solicitacao,
  onClose,
}: RecordDetailModalProps) {
  const statusEmAberto: Solicitacao['status'][] = ['aguardando_aprovacao', 'pendente', 'etiqueta_gerada', 'postado', 'em_transito'];
  const { user } = useAuth();
  const [anotacoes, setAnotacoes] = useState('');
  const [salvandoAnot, setSalvandoAnot] = useState(false);
  const [codigoRastreio, setCodigoRastreio] = useState('');
  const [codigoRastreioLido, setCodigoRastreioLido] = useState('');
  const [salvandoRastreio, setSalvandoRastreio] = useState(false);
  const [outrosPedidosMesmoRastreio, setOutrosPedidosMesmoRastreio] = useState<Solicitacao[]>([]);
  const [buscandoDuplicidadeRastreio, setBuscandoDuplicidadeRastreio] = useState(false);
  const [erroBuscaDuplicidadeRastreio, setErroBuscaDuplicidadeRastreio] = useState(false);
  const [historicoCliente, setHistoricoCliente] = useState<Solicitacao[]>([]);
  const [carregandoHistoricoCliente, setCarregandoHistoricoCliente] = useState(false);
  const [historico, setHistorico] = useState<SolicitacaoHistorico[]>([]);
  const [carregandoHist, setCarregandoHist] = useState(false);
  const [erroHistorico, setErroHistorico] = useState(false);
  const [tentativaHistorico, setTentativaHistorico] = useState(0);
  const [rastreio, setRastreio] = useState<RastreamentoCorreios | null>(null);
  const [carregandoRastreio, setCarregandoRastreio] = useState(false);
  const [retornoApi, setRetornoApi] = useState<any | null>(null);
  const [salvandoRecebimento, setSalvandoRecebimento] = useState(false);
  // Concluído pelos Correios e ainda sem a confirmação física da empresa (consulta o servidor)
  const [recebimentoFisicoPendente, setRecebimentoFisicoPendente] = useState(false);
  const [confirmacaoOperacao, setConfirmacaoOperacao] = useState<'recebimento' | 'rastreio' | null>(null);

  useEffect(() => {
    if (!isOpen) setConfirmacaoOperacao(null);
  }, [isOpen]);

  // Sincroniza campos quando abre/troca de registro
  useEffect(() => {
    setAnotacoes(solicitacao?.anotacoes ?? '');
    setCodigoRastreio(solicitacao?.codigo_rastreio ?? '');
    setCodigoRastreioLido('');
    setRastreio(null);
    setRetornoApi(null);
  }, [solicitacao?.id, solicitacao?.anotacoes, solicitacao?.codigo_rastreio]);

  // Pendência de confirmação física: só para quem pode confirmar, e só em pedido concluído
  const idRecebimento = solicitacao?.id;
  const empresaRecebimento = solicitacao?.empresa;
  const statusRecebimento = solicitacao?.status;
  useEffect(() => {
    setRecebimentoFisicoPendente(false);
    if (!isOpen || !idRecebimento || !empresaRecebimento || statusRecebimento !== 'concluido') return;
    if (!user || !podeConfirmarRecebimentoMercadoria(user, empresaRecebimento)) return;
    let montado = true;
    apiService.listarRecebimentosFisicosPendentes()
      .then((ids) => { if (montado) setRecebimentoFisicoPendente(ids.includes(idRecebimento)); })
      .catch(() => { if (montado) setRecebimentoFisicoPendente(false); });
    return () => { montado = false; };
  }, [isOpen, idRecebimento, empresaRecebimento, statusRecebimento, user]);

  // Busca histórico quando o modal abre
  useEffect(() => {
    if (!isOpen || !solicitacao?.id) return;
    let montado = true;
    setHistorico([]);
    setErroHistorico(false);
    setCarregandoHist(true);
    carregarLinhaDoTempo(solicitacao.id)
      .then((h) => { if (montado) setHistorico(h); })
      .catch(() => { if (montado) { setHistorico([]); setErroHistorico(true); } })
      .finally(() => { if (montado) setCarregandoHist(false); });
    return () => { montado = false; };
  }, [isOpen, solicitacao?.id, tentativaHistorico]);

  useEffect(() => {
    if (!isOpen || !solicitacao?.id || !solicitacao.codigo_cliente) return;
    let montado = true;
    setHistoricoCliente([]);
    setCarregandoHistoricoCliente(true);
    apiService
      .getHistoricoCliente(solicitacao.empresa, solicitacao.codigo_cliente)
      .then((itens) => { if (montado) setHistoricoCliente(itens); })
      .catch(() => { if (montado) setHistoricoCliente([]); })
      .finally(() => { if (montado) setCarregandoHistoricoCliente(false); });
    return () => { montado = false; };
  }, [isOpen, solicitacao?.id, solicitacao?.empresa, solicitacao?.codigo_cliente]);

  useEffect(() => {
    const codigo = codigoRastreio.toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (!isOpen || !solicitacao?.id || !/^[A-Z]{2}\d{9}BR$/.test(codigo)) {
      setOutrosPedidosMesmoRastreio([]);
      setBuscandoDuplicidadeRastreio(false);
      setErroBuscaDuplicidadeRastreio(false);
      return;
    }
    let montado = true;
    setBuscandoDuplicidadeRastreio(true);
    setErroBuscaDuplicidadeRastreio(false);
    apiService
      .getSolicitacoesPorCodigoRastreio(codigo, solicitacao.id)
      .then((itens) => { if (montado) setOutrosPedidosMesmoRastreio(itens); })
      .catch(() => { if (montado) { setOutrosPedidosMesmoRastreio([]); setErroBuscaDuplicidadeRastreio(true); } })
      .finally(() => { if (montado) setBuscandoDuplicidadeRastreio(false); });
    return () => { montado = false; };
  }, [isOpen, solicitacao?.id, codigoRastreio]);

  // Busca rastreio do pacote quando há código (e dispara consulta viva)
  useEffect(() => {
    if (!isOpen || !solicitacao?.codigo_rastreio) return;
    let montado = true;
    setCarregandoRastreio(true);
    apiService
      .getRastreio(solicitacao.codigo_rastreio)
      .then((r) => { if (montado) setRastreio(r); })
      .catch(() => { if (montado) setRastreio(null); })
      .finally(() => { if (montado) setCarregandoRastreio(false); });
    // Consulta viva: refaz a chamada à API para manter dados atuais (exceto se já concluído)
    if (solicitacao.status !== 'concluido' && !solicitacao.inutilizada_em) {
      apiService
        .atualizarRastreio(solicitacao.codigo_rastreio)
        .then((raw) => { if (montado) { setRetornoApi(raw); return apiService.getRastreio(solicitacao.codigo_rastreio as string); } })
        .then((r) => { if (montado && r) setRastreio(r); })
        .catch(() => {});
    }
    return () => { montado = false; };
  }, [isOpen, solicitacao?.codigo_rastreio, solicitacao?.status, solicitacao?.inutilizada_em]);

  // Fechar com tecla esc
  useEffect(() => {
    if (!isOpen) return;
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleEsc);
    document.body.style.overflow = 'hidden';

    return () => {
      window.removeEventListener('keydown', handleEsc);
      document.body.style.overflow = '';
    };
  }, [isOpen, onClose]);

  if (!isOpen || !solicitacao) return null;

  const arquivado = !!solicitacao.inutilizada_em;
  // Rastreio, anotações e etiqueta: só quem movimenta reversas desta empresa
  const podeOperar = !arquivado && !!user && podeOperarReversa(user, solicitacao.empresa);
  const podeEmitir = !arquivado && !!user && podeEmitirEtiqueta(user, solicitacao.empresa);
  const podeReceber = !arquivado && !!user && podeConfirmarRecebimentoMercadoria(user, solicitacao.empresa);
  // Mesma regra do banco para alterar os dados da emissão (pode_operar_emissao 'dados'): emitir na empresa, ou
  // confirmar check-in na empresa enquanto o pedido aguarda postagem. Consultar a lista não basta.
  const podeSalvarRastreio = !arquivado && (podeEmitir || (!!user && podeConfirmarCheckin(user, solicitacao.empresa) && solicitacao.status === 'etiqueta_gerada'));

  /** Confirmação física da empresa: ação própria, distinta da entrega informada pelos Correios. */
  const confirmarRecebimento = async () => {
    setSalvandoRecebimento(true);
    const jaConcluido = solicitacao.status === 'concluido';
    try {
      const atualizada = await apiService.confirmarRecebimentoMercadoria(solicitacao.id, user);
      Object.assign(solicitacao, atualizada);
      setRecebimentoFisicoPendente(false);
      setConfirmacaoOperacao(null);
      setHistorico(await carregarLinhaDoTempo(solicitacao.id));
      toast.success(jaConcluido ? 'Recebimento confirmado.' : 'Recebimento confirmado. Pedido concluído.');
    } catch (err) {
      setConfirmacaoOperacao(null);
      toast.error(err instanceof Error ? err.message : 'Não foi possível confirmar o recebimento.');
    } finally {
      setSalvandoRecebimento(false);
    }
  };

  /** Salva anotações no banco. */
  const salvarAnotacoes = async () => {
    setSalvandoAnot(true);
    try {
      await apiService.updateSolicitacao(
        solicitacao.id,
        { anotacoes: anotacoes.trim() || null },
        user
      );
      solicitacao.anotacoes = anotacoes.trim() || null;
      toast.success('Anotações salvas.');
      setHistorico(await carregarLinhaDoTempo(solicitacao.id));
    } catch {
      toast.error('Erro ao salvar anotações.');
    } finally {
      setSalvandoAnot(false);
    }
  };

  /** Salva código de rastreio no banco e dispara consulta imediata. */
  const salvarRastreio = async () => {
    setSalvandoRastreio(true);
    try {
      const codigoStr = codigoRastreio.toUpperCase().replace(/[^A-Z0-9]/g, '');
      const salva = await apiService.salvarCodigoRastreio(solicitacao.id, codigoStr, user);
      Object.assign(solicitacao, salva);
      setCodigoRastreio(salva.codigo_rastreio ?? codigoStr);
      setCodigoRastreioLido('');
      carregarLinhaDoTempo(solicitacao.id).then(setHistorico).catch(() => {});
      toast.success('Código de rastreio salvo no pedido.');

      // Dispara consulta imediata e mostra retorno
      try {
        const raw = await apiService.atualizarRastreio(codigoStr);
        setRetornoApi(raw);
        // Recarrega rastreio processado (que já deve ter sido salvo no BD pela Edge)
        const r = await apiService.getRastreio(codigoStr);
        setRastreio(r);
      } catch (e) {
        setRetornoApi({ erro: (e as Error).message });
        toast.error('O código foi salvo, mas não foi possível consultar os Correios agora.');
      }
    } catch (err: any) {
      toast.error(err.message || 'Erro ao salvar código de rastreio.');
    } finally {
      setSalvandoRastreio(false);
    }
  };

  /** Remove o código de rastreio (libera o pacote e limpa dados do correios) */
  const apagarRastreio = async () => {
    setSalvandoRastreio(true);
    try {
      await apiService.removerCodigoRastreio(solicitacao.id, user);
      solicitacao.codigo_rastreio = null;
      setCodigoRastreio('');
      setRetornoApi(null);
      setRastreio(null);
      setConfirmacaoOperacao(null);
      setHistorico(await carregarLinhaDoTempo(solicitacao.id));
      toast.success('Código de rastreio removido.');
    } catch (err: any) {
      toast.error(err.message || 'Erro ao remover código.');
    } finally {
      setSalvandoRastreio(false);
    }
  };

  /** Consulta o rastreio na hora (chama Edge Function + recarrega). Silencioso: sem toast. */
  const atualizarRastreio = async () => {
    if (!solicitacao.codigo_rastreio) return;
    if (solicitacao.status === 'concluido') return; // não gasta cota de API se já entregue
    try {
      const raw = await apiService.atualizarRastreio(solicitacao.codigo_rastreio);
      setRetornoApi(raw);
      const r = await apiService.getRastreio(solicitacao.codigo_rastreio);
      setRastreio(r);
    } catch (e) {
      setRetornoApi({ erro: (e as Error).message });
    }
  };

  // Pílula da empresa com a cor de série do tema (ouro champagne ou rosé)
  const classeEmpresa = solicitacao.empresa === 'Alinare' ? 'is-alinare' : 'is-novitah';

  // Formatadores
  const formatDate = (dateStr: string) => {
    const [y, m, d] = dateStr.split('-');
    return `${d}/${m}/${y}`;
  };

  const formatDateTime = (isoStr: string) => {
    const d = new Date(isoStr);
    return new Intl.DateTimeFormat('pt-BR', {
      dateStyle: 'short',
      timeStyle: 'short',
    }).format(d);
  };

  const FieldInfo = ({ label, value, bg = false }: { label: string; value: string | number; bg?: boolean }) => (
    <div className={`p-3 rounded-lg ${bg ? 'bg-slate-50' : ''}`}>
      <span className="block text-xs font-medium text-slate-500 uppercase tracking-tight mb-1">
        {label}
      </span>
      <span className="block text-sm font-medium text-slate-900">{value}</span>
    </div>
  );

  const situacao = statusEfetivo(solicitacao);
  const temCodigo = !!solicitacao.codigo_rastreio;
  const outrosPedidosCliente = historicoCliente.filter((item) => item.id !== solicitacao.id);
  const pedidosAbertosCliente = outrosPedidosCliente.filter((item) => statusEmAberto.includes(item.status)).length;

  return (
    <>
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm transition-opacity"
      aria-modal="true"
      role="dialog"
      onClick={onClose}
    >
      <div
        className="record-detail-modal w-full max-w-2xl bg-white rounded-2xl shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header com cor da empresa */}
        <div className="flex items-start justify-between px-6 py-5 border-b border-slate-100">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <span className={`record-empresa-pill ${classeEmpresa} px-2.5 py-1 rounded-full text-xs font-semibold`}>
                {solicitacao.empresa}
              </span>
              <span
                className={`px-2.5 py-1 rounded-full text-xs font-semibold ${
                  situacao === 'concluido'
                    ? 'bg-emerald-100 text-emerald-700'
                    : situacao === 'reprovado'
                    ? 'bg-rose-100 text-rose-700'
                    : situacao === 'em_transito'
                      ? 'bg-orange-100 text-orange-700'
                      : 'bg-amber-100 text-amber-700'
                }`}
              >
                {STATUS_LABEL[situacao] ?? 'Pendente'}
              </span>
              {/* Vínculo opcional com a NC de origem */}
              {solicitacao.nc_id ? (
                user && podeVerNc(user) ? (
                  <Link
                    to={`/admin/nc/${solicitacao.nc_id}`}
                    onClick={onClose}
                    className="px-2.5 py-1 rounded-full text-xs font-semibold bg-cyan-50 text-cyan-800 border border-cyan-100 hover:bg-cyan-100"
                    title="Abrir a NC de origem"
                  >
                    {solicitacao.nc_numero ? codigoNc(solicitacao.nc_numero) : 'NC de origem'}
                  </Link>
                ) : (
                  <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-600">
                    {solicitacao.nc_numero ? codigoNc(solicitacao.nc_numero) : 'NC de origem'}
                  </span>
                )
              ) : (
                <span
                  className="px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-500"
                  title={solicitacao.legado ? 'Criada antes do vínculo com NC' : 'Esta reversa não está vinculada a uma NC'}
                >
                  {solicitacao.legado ? 'Legado · sem NC' : 'Sem NC vinculada'}
                </span>
              )}
            </div>
            <h2 className="text-lg font-bold text-slate-800">
              Detalhes da Solicitação
            </h2>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 -mr-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
            aria-label="Fechar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Corpo scrollable */}
        <div className="p-6 max-h-[70vh] overflow-y-auto">
          {arquivado && (
            <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3" role="status">
              <p className="text-sm font-semibold text-amber-950">Chamado na Lixeira</p>
              <p className="mt-1 text-xs text-amber-900">
                Movido em {formatDateTime(solicitacao.inutilizada_em!)}{solicitacao.inutilizada_por_nome ? ` por ${solicitacao.inutilizada_por_nome}` : ''}. O histórico e os PDFs foram preservados.
              </p>
            </div>
          )}
          {/* Seção 1: Origem interna */}
          <div className="mb-6">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-800 mb-3">
              <Building2 className="w-4 h-4 text-slate-400" /> Origem
            </h3>
            <div className="grid grid-cols-2 gap-2">
              <FieldInfo label="Solicitante" value={solicitacao.solicitante} bg />
              <FieldInfo label="Setor" value={solicitacao.setor} bg />
              <FieldInfo label="Autorizador" value={solicitacao.autorizacao || (situacao === 'reprovado' ? 'Não aprovada' : 'Aguardando aprovação')} bg />
              <FieldInfo label="Preenchimento" value={formatarTempo(solicitacao.tempo_preenchimento_segundos)} bg />
            </div>
          </div>

          {/* Seção 2: Dados da Cliente */}
          <div className="mb-6">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-800 mb-3">
              <User className="w-4 h-4 text-slate-400" /> Dados da Cliente
            </h3>
            <div className="grid grid-cols-2 gap-2 mb-2">
              <FieldInfo label="Cód. Cliente" value={solicitacao.codigo_cliente} />
              <FieldInfo label="Nome Cliente" value={solicitacao.nome_cliente} />
            </div>
            <div className="pl-3">
              <span className="block text-xs font-medium text-slate-500 uppercase tracking-tight mb-1">
                Endereço de Postagem
              </span>
              <div className="flex items-start gap-2 max-w-full">
                <MapPin className="w-4 h-4 mt-0.5 text-slate-300 shrink-0" />
                <span className="text-sm font-medium text-slate-900 break-words">
                  {solicitacao.endereco_postagem}
                </span>
              </div>
            </div>
            {solicitacao.endereco_destino_troca && (
              <div className="pl-3 mt-3">
                <span className="block text-xs font-medium text-slate-500 uppercase tracking-tight mb-1">
                  Endereço da outra cliente
                </span>
                <div className="flex items-start gap-2 max-w-full">
                  <MapPin className="w-4 h-4 mt-0.5 text-slate-300 shrink-0" />
                  <span className="text-sm font-medium text-slate-900 break-words">
                    {solicitacao.endereco_destino_troca}
                  </span>
                </div>
              </div>
            )}
            {carregandoHistoricoCliente && (
              <p className="mt-3 text-xs text-slate-500">Consultando outras reversas deste código de cliente...</p>
            )}
            {!carregandoHistoricoCliente && outrosPedidosCliente.length > 0 && (
              <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3" role="status">
                <p className="text-sm font-medium text-amber-950">
                  Há {outrosPedidosCliente.length} outra{outrosPedidosCliente.length === 1 ? '' : 's'} solicitação{outrosPedidosCliente.length === 1 ? '' : 'es'} de reverso para esta cliente nesta empresa; {pedidosAbertosCliente} em aberto.
                </p>
                <p className="mt-1 text-xs text-amber-900">É um aviso para conferência e não impede uma nova solicitação.</p>
                <ul className="mt-2 space-y-1 text-xs text-amber-900">
                  {outrosPedidosCliente.slice(0, 5).map((item) => (
                    <li key={item.id}>
                      {new Date(`${item.data_solicitacao}T00:00:00`).toLocaleDateString('pt-BR')} · {STATUS_LABEL[statusEfetivo(item)]} · {codigoPedido(item.id)}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {/* Seção 3: Problema/Motivo */}
          <div className="mb-6">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-800 mb-3">
              <Package className="w-4 h-4 text-slate-400" /> Motivo da Devolução
            </h3>
            <div className="bg-slate-50 border border-slate-100 rounded-xl p-4">
              <span className="inline-block px-3 py-1 rounded bg-white border border-slate-200 text-sm font-semibold text-slate-800 mb-3">
                {solicitacao.motivo}
              </span>

              {solicitacao.motivo === 'Outros' && solicitacao.justificativa_outros && (
                <div className="mt-1 border-l-2 border-slate-300 pl-3">
                  <span className="block text-xs font-medium text-slate-500 uppercase mb-1">Justificativa</span>
                  <p className="text-sm text-slate-700 italic">
                    "{solicitacao.justificativa_outros}"
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Etiqueta de postagem dos Correios (PDF) */}
          <EtiquetaReversa
            solicitacao={solicitacao}
            podeEmitir={podeEmitir}
            onAlterada={(atualizada) => {
              Object.assign(solicitacao, atualizada);
              setHistorico((h) => [...h]); // re-renderiza com a etiqueta/etapa nova
              carregarLinhaDoTempo(solicitacao.id).then(setHistorico).catch(() => {});
            }}
          />

          {/* Seção 4: Rastreamento */}
          {['etiqueta_gerada', 'postado', 'em_transito', 'concluido'].includes(solicitacao.status) && (
            <div className="mb-6">
              <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-800 mb-3">
                <Truck className="w-4 h-4 text-slate-400" /> Acompanhamento dos Correios
              </h3>
              <div className="bg-slate-50 border border-slate-100 rounded-xl p-4">
                <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
                  <input
                    type="text"
                    value={codigoRastreio}
                    onChange={(e) => {
                      setCodigoRastreio(e.target.value.toUpperCase());
                      setCodigoRastreioLido('');
                    }}
                    placeholder="Ex: AA123456789BR"
                    aria-label="Código de rastreio"
                    readOnly={!podeSalvarRastreio}
                    className="flex-1 px-3 py-2 rounded-lg border border-slate-300 bg-white text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                  />
                  {podeSalvarRastreio && (
                    <button
                      type="button"
                      onClick={salvarRastreio}
                      disabled={salvandoRastreio || codigoRastreio === (solicitacao.codigo_rastreio ?? '')}
                      className="w-full sm:w-auto px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors min-h-[38px]"
                    >
                      {salvandoRastreio ? 'Salvando...' : 'Salvar Código'}
                    </button>
                  )}
                  {podeSalvarRastreio && temCodigo && (
                    <button
                      type="button"
                      onClick={() => setConfirmacaoOperacao('rastreio')}
                      disabled={salvandoRastreio}
                      title="Apagar código de rastreio"
                      className="p-2 rounded-lg border border-red-200 text-red-500 hover:bg-red-50 hover:border-red-300 disabled:opacity-40 disabled:cursor-not-allowed transition-colors min-h-[38px] min-w-[38px] flex items-center justify-center"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
                {codigoRastreioLido && codigoRastreio === codigoRastreioLido && (
                  <p className="mt-2 text-xs text-blue-700" role="status">
                    Código identificado na nota. Confira o valor{podeSalvarRastreio ? ' e clique em “Salvar Código”.' : '.'}
                  </p>
                )}
                {buscandoDuplicidadeRastreio && (
                  <p className="mt-2 text-xs text-slate-500" role="status">Verificando se este código já está associado a outro pedido...</p>
                )}
                {erroBuscaDuplicidadeRastreio && (
                  <p className="mt-2 text-xs text-amber-800" role="status">Não foi possível consultar outros pedidos agora; a validação de duplicidade continua ativa ao salvar.</p>
                )}
                {outrosPedidosMesmoRastreio.length > 0 && (
                  <div className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-3" role="alert">
                    <p className="text-sm font-semibold text-amber-950">Este código de rastreio já está vinculado a outro pedido.</p>
                    <ul className="mt-2 space-y-1 text-xs text-amber-900">
                      {outrosPedidosMesmoRastreio.map((item) => (
                        <li key={item.id}>
                          {codigoPedido(item.id)} · {item.empresa} · {item.nome_cliente} · {STATUS_LABEL[statusEfetivo(item)]} · {new Date(`${item.data_solicitacao}T00:00:00`).toLocaleDateString('pt-BR')}
                        </li>
                      ))}
                    </ul>
                    <p className="mt-2 text-xs text-amber-900">O sistema não permite salvar o mesmo código em dois pedidos.</p>
                  </div>
                )}

                {/* Resumo processado + colapsável "Mais detalhes" do retorno da API */}
                {retornoApi && <RetornoResumo retorno={retornoApi} onUpdate={atualizarRastreio} />}

                <div className="mt-4 pt-4 border-t border-slate-200" aria-label="Andamento">
                  {!temCodigo ? (
                    <p className="text-sm text-slate-600">
                      Sem código de rastreamento. O andamento dos Correios só aparece depois que o código for informado.
                    </p>
                  ) : (
                    <>
                      {solicitacao.status === 'concluido' && (
                        <div className="mb-3 flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-50 border border-emerald-100">
                          <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                          <span className="text-xs text-emerald-700 font-medium">Entrega informada pelos Correios</span>
                        </div>
                      )}
                      {carregandoRastreio ? (
                        <p className="text-xs text-slate-400" aria-live="polite">Carregando…</p>
                      ) : rastreio?.ultimo_evento_descricao ? (
                        <div>
                          <p className="text-sm font-medium text-slate-900">{rastreio.ultimo_evento_descricao}</p>
                          <p className="text-xs text-slate-500">
                            {[rastreio.unidade_cidade && rastreio.unidade_uf ? `${rastreio.unidade_cidade}/${rastreio.unidade_uf}` : null,
                              rastreio.ultimo_check_em ? `Atualizado em ${formatDateTime(rastreio.ultimo_check_em)}` : null].filter(Boolean).join(' · ')}
                          </p>
                        </div>
                      ) : (
                        <p className="text-xs text-slate-500" aria-live="polite">Ainda sem atualização dos Correios.</p>
                      )}
                    </>
                  )}

                  {podeReceber && (solicitacao.status === 'em_transito' || (solicitacao.status === 'concluido' && recebimentoFisicoPendente)) && (
                    <div className="mt-4 flex flex-col gap-2 rounded-lg border border-blue-100 bg-blue-50/70 p-3 sm:flex-row sm:items-center sm:justify-between">
                      <p className="text-sm text-slate-700">
                        {solicitacao.status === 'concluido'
                          ? 'Os Correios informaram a entrega. A empresa ainda não confirmou o recebimento.'
                          : 'Confirme quando a mercadoria chegar à empresa.'}
                      </p>
                      <button type="button" onClick={() => setConfirmacaoOperacao('recebimento')} disabled={salvandoRecebimento}
                        className="inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50">
                        <PackageCheck size={16} /> Confirmar recebimento
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Seção 5: Histórico de alterações (colapsável) */}
          <div className="mb-6">
            <details className="group">
              <summary className="flex items-center gap-2 text-sm font-semibold text-slate-800 cursor-pointer select-none list-none mb-1 min-h-[32px]">
                <History className="w-4 h-4 text-slate-400" /> Histórico
                <ChevronDown className="w-3.5 h-3.5 text-slate-400 transition-transform group-open:rotate-180" />
                <span className="text-xs font-normal text-slate-400">({historico.length})</span>
              </summary>
              {erroHistorico ? (
                <p className="text-xs text-amber-700 mt-2" role="alert">
                  Não foi possível carregar o histórico.{' '}
                  <button type="button" className="font-semibold underline" onClick={() => setTentativaHistorico((n) => n + 1)}>Tentar de novo</button>
                </p>
              ) : carregandoHist ? (
                <p className="text-xs text-slate-400 mt-2">Carregando histórico...</p>
              ) : historico.length === 0 ? (
                <p className="text-xs text-slate-400 mt-2">Nenhum movimento registrado.</p>
              ) : (
                <ol className="ml-2 mt-3 max-h-64 overflow-y-auto pr-1">
                  {historico.map((h) => (
                    <li key={h.id} className="relative pl-8 pb-5 before:absolute before:left-[7px] before:top-4 before:bottom-0 before:w-[2px] before:bg-slate-200 before:content-[''] last:before:hidden">
                      <span className="absolute left-0 top-1.5 w-4 h-4 rounded-full bg-slate-300 border-2 border-white z-10" />
                      <p className="text-sm text-slate-800">
                        <span className="font-medium">{h.user_nome}</span> — {h.acao}
                      </p>
                      <p className="text-xs text-slate-400">
                        {new Date(h.created_at).toLocaleString('pt-BR', {
                          dateStyle: 'short',
                          timeStyle: 'short',
                        })}
                      </p>
                    </li>
                  ))}
                </ol>
              )}
            </details>
          </div>

          {/* Seção 6: Anotações internas */}
          <div className="mb-6">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-800 mb-3">
              <StickyNote className="w-4 h-4 text-slate-400" /> Anotações
            </h3>
            <textarea
              rows={3}
              value={anotacoes}
              onChange={(e) => setAnotacoes(e.target.value)}
              placeholder="Anotações internas sobre esta solicitação..."
              readOnly={!podeOperar}
              className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-sm text-slate-900
                placeholder:text-slate-400 resize-none transition-colors duration-150
                focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-transparent"
            />
            {podeOperar && (
              <div className="flex justify-end mt-2">
                <button
                  type="button"
                  onClick={salvarAnotacoes}
                  disabled={salvandoAnot || anotacoes === (solicitacao.anotacoes ?? '')}
                  className="px-4 py-1.5 rounded-lg bg-slate-900 text-white text-xs font-medium
                    hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  {salvandoAnot ? 'Salvando...' : 'Salvar anotações'}
                </button>
              </div>
            )}
          </div>

          {/* Footer stats */}
          <div className="flex items-center justify-between pt-6 border-t border-slate-100">
            <div className="flex items-center gap-1.5 text-xs text-slate-500">
              <Calendar className="w-3.5 h-3.5" />
              Data ref: <span className="font-semibold text-slate-700">{formatDate(solicitacao.data_solicitacao)}</span>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-slate-500">
              <Timer className="w-3.5 h-3.5" />
              Criado em: <span className="font-semibold text-slate-700">{formatDateTime(solicitacao.created_at)}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
    <ConfirmDialog
      open={!!confirmacaoOperacao}
      title={confirmacaoOperacao === 'recebimento' ? 'Confirmar recebimento?' : 'Apagar código de rastreio?'}
      message={confirmacaoOperacao === 'recebimento'
        ? (solicitacao.status === 'concluido'
          ? 'Confirma que a mercadoria chegou à empresa? O pedido continua Concluído.'
          : 'Confirma que a mercadoria chegou à empresa? O pedido será concluído.')
        : 'O código será apagado e desvinculado deste pacote.'}
      confirmLabel={confirmacaoOperacao === 'recebimento' ? 'Confirmar recebimento' : 'Apagar código'}
      tone={confirmacaoOperacao === 'recebimento' ? 'primary' : 'danger'}
      busy={confirmacaoOperacao === 'recebimento' ? salvandoRecebimento : salvandoRastreio}
      onCancel={() => setConfirmacaoOperacao(null)}
      onConfirm={() => {
        if (confirmacaoOperacao === 'recebimento') void confirmarRecebimento();
        if (confirmacaoOperacao === 'rastreio') void apagarRastreio();
      }}
    />
    </>
  );
}
