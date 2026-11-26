// ── Linha do tempo da NC ─────────────────────────────────────────────────────
// Eventos gravados pelo banco (registro, status, campos alterados, reversas)
// e anotações dos usuários — substitui a coluna "Linha do tempo" da planilha.
import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { History, MessageSquarePlus } from 'lucide-react';
import ncService from '../../services/ncService';
import { useAuth } from '../../context/AuthContext';
import type { NcHistorico } from '../../types';

interface Props {
  ncId: string;
  podeAnotar: boolean;
  /** Muda quando a NC é salva, para recarregar os eventos */
  versao: string;
}

export default function NcLinhaDoTempo({ ncId, podeAnotar, versao }: Props) {
  const { user } = useAuth();
  const [itens, setItens] = useState<NcHistorico[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [nota, setNota] = useState('');
  const [salvando, setSalvando] = useState(false);

  const carregar = useCallback(async () => {
    try {
      setItens(await ncService.historico(ncId));
    } catch {
      setItens([]);
    } finally {
      setCarregando(false);
    }
  }, [ncId]);

  useEffect(() => {
    carregar();
  }, [carregar, versao]);

  const anotar = async () => {
    if (!user || !nota.trim()) return;
    setSalvando(true);
    try {
      await ncService.adicionarNota(ncId, nota, user);
      setNota('');
      await carregar();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao salvar a anotação.');
    } finally {
      setSalvando(false);
    }
  };

  return (
    <section className="surface-panel" aria-label="Linha do tempo">
      <div className="panel-heading">
        <div>
          <span className="panel-kicker"><History size={12} /> ESFORÇO E STATUS</span>
          <h2 className="panel-title">Linha do tempo</h2>
          <p className="panel-desc">Tudo o que aconteceu com a NC e com as reversas geradas a partir dela.</p>
        </div>
      </div>

      {podeAnotar && (
        <div className="nc-nota-form">
          <label className="field-label" htmlFor="nc-nota">Nova anotação</label>
          <textarea
            id="nc-nota"
            className="field-control nc-textarea"
            rows={2}
            maxLength={1000}
            value={nota}
            onChange={(e) => setNota(e.target.value)}
            placeholder="Ex.: cliente avisada; pedido de indenização aberto…"
          />
          <div>
            <button type="button" className="btn btn-secondary" onClick={anotar} disabled={salvando || !nota.trim()}>
              <MessageSquarePlus size={14} /> {salvando ? 'Salvando…' : 'Adicionar anotação'}
            </button>
          </div>
        </div>
      )}

      {carregando ? (
        <div className="chart-skeleton" style={{ height: 90, margin: '0 23px 20px' }} />
      ) : itens.length === 0 ? (
        <div className="chart-empty" style={{ height: 90 }}>Nenhum evento registrado.</div>
      ) : (
        <ol className="nc-timeline">
          {itens.map((h) => (
            <li key={h.id} className={h.tipo === 'nota' ? 'is-nota' : undefined}>
              <span className="nc-timeline-dot" aria-hidden="true" />
              <p className="nc-timeline-text">
                <strong>{h.user_nome || 'Sistema'}</strong> — {h.tipo === 'nota' ? `Anotação: ${h.acao}` : h.acao}
              </p>
              <div className="nc-timeline-meta">
                {new Date(h.created_at).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
