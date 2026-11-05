// ── Listas da não conformidade (LISTAS_NC) ───────────────────────────────────
// Origens com área responsável e "evitável internamente", e as listas simples.
// Valores não são apagados: desative para tirar das opções sem afetar os
// registros antigos. Renomear uma origem atualiza as NCs que a usam.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { ListChecks, Plus, Save } from 'lucide-react';
import PageHeading from '../components/ui/PageHeading';
import ncService from '../services/ncService';
import { opcoesComAtual, valoresDaLista } from '../lib/ncCalculos';
import { EMPRESAS_REVERSA, EVITAVEL_OPCOES, LISTA_NC_LABEL, STATUS_NC } from '../types';
import type { Evitavel, ListaNc, ListasNc, NcOrigem } from '../types';
import '../styles/nc.css';

const LISTAS: ListaNc[] = ['area', 'tipo_saida', 'resolucao', 'empresa', 'como_identificada', 'reembolso'];

const NOVA_ORIGEM: NcOrigem = { nome: '', area: '', evitavel: 'A avaliar', ordem: 0, ativo: true };

export default function NcListasPage() {
  const [listas, setListas] = useState<ListasNc>({ origens: [], itens: [] });
  const [carregando, setCarregando] = useState(true);
  // Origens em edição, pela chave = nome atual no banco
  const [rascunhos, setRascunhos] = useState<Record<string, NcOrigem>>({});
  const [novaOrigem, setNovaOrigem] = useState<NcOrigem>(NOVA_ORIGEM);
  const [novosValores, setNovosValores] = useState<Partial<Record<ListaNc, string>>>({});
  const [salvando, setSalvando] = useState(false);

  const carregar = useCallback(async () => {
    try {
      setListas(await ncService.carregarListas());
      setRascunhos({});
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao carregar as listas.');
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const executar = async (acao: () => Promise<void>, sucesso: string) => {
    setSalvando(true);
    try {
      await acao();
      toast.success(sucesso);
      await carregar();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao salvar.');
    } finally {
      setSalvando(false);
    }
  };

  const origens = [...listas.origens].sort((a, b) => a.ordem - b.ordem);
  const areas = valoresDaLista(listas, 'area');
  const proximaOrdem = (ordens: number[]) => (ordens.length ? Math.max(...ordens) + 1 : 1);

  const editarOrigem = (nomeOriginal: string, campos: Partial<NcOrigem>) => {
    const base = rascunhos[nomeOriginal] ?? origens.find((o) => o.nome === nomeOriginal)!;
    setRascunhos({ ...rascunhos, [nomeOriginal]: { ...base, ...campos } });
  };

  const salvarOrigem = (nomeOriginal: string) => {
    const origem = rascunhos[nomeOriginal];
    if (!origem?.nome.trim() || !origem.area) {
      toast.error('Informe o nome e a área da origem.');
      return;
    }
    executar(() => ncService.salvarOrigem({ ...origem, nome: origem.nome.trim() }, nomeOriginal), 'Origem salva.');
  };

  const adicionarOrigem = () => {
    const nome = novaOrigem.nome.trim();
    if (!nome || !novaOrigem.area) {
      toast.error('Informe o nome e a área da nova origem.');
      return;
    }
    if (origens.some((o) => o.nome === nome)) {
      toast.error('Essa origem já existe.');
      return;
    }
    executar(async () => {
      await ncService.salvarOrigem({ ...novaOrigem, nome, ordem: proximaOrdem(origens.map((o) => o.ordem)) });
      setNovaOrigem(NOVA_ORIGEM);
    }, 'Origem adicionada.');
  };

  const adicionarValor = (lista: ListaNc) => {
    const valor = (novosValores[lista] ?? '').trim();
    if (!valor) return;
    const itens = listas.itens.filter((i) => i.lista === lista);
    if (itens.some((i) => i.valor === valor)) {
      toast.error('Esse valor já existe na lista.');
      return;
    }
    executar(async () => {
      await ncService.salvarItemLista({ lista, valor, ordem: proximaOrdem(itens.map((i) => i.ordem)), ativo: true });
      setNovosValores({ ...novosValores, [lista]: '' });
    }, 'Valor adicionado.');
  };

  return (
    <div className="nc-page">
      <PageHeading
        icon={ListChecks}
        eyebrow="QUALIDADE / NÃO CONFORMIDADES"
        title="Listas de NC"
        description="Opções de preenchimento da NC. A área responsável e o “evitável” de cada origem são propostas — ajuste conforme a validação da gestão."
      />

      {carregando ? (
        <div className="chart-skeleton" style={{ height: 260 }} />
      ) : (
        <>
          <section className="surface-panel" style={{ overflow: 'hidden' }} aria-label="Origens da não conformidade">
            <div className="panel-heading">
              <div>
                <span className="panel-kicker">ORIGENS</span>
                <h2 className="panel-title">Origem da não conformidade</h2>
                <p className="panel-desc">A área responsável e o “evitável internamente” da origem alimentam o registro e o painel.</p>
              </div>
            </div>
            <div className="data-table-wrap">
              <table className="data-table" style={{ minWidth: 760 }}>
                <thead>
                  <tr><th>Origem</th><th>Área responsável</th><th>Evitável internamente?</th><th>Ativa</th><th /></tr>
                </thead>
                <tbody>
                  {origens.map((o) => {
                    const r = rascunhos[o.nome] ?? o;
                    const alterada = !!rascunhos[o.nome];
                    return (
                      <tr key={o.nome}>
                        <td style={{ minWidth: 280 }}>
                          <input aria-label={`Nome da origem ${o.nome}`} className="field-control" value={r.nome} onChange={(e) => editarOrigem(o.nome, { nome: e.target.value })} />
                        </td>
                        <td>
                          <select aria-label={`Área de ${o.nome}`} className="field-control" value={r.area} onChange={(e) => editarOrigem(o.nome, { area: e.target.value })}>
                            {opcoesComAtual(areas, r.area).map((a) => <option key={a} value={a}>{a}</option>)}
                          </select>
                        </td>
                        <td>
                          <select aria-label={`Evitável — ${o.nome}`} className="field-control" value={r.evitavel} onChange={(e) => editarOrigem(o.nome, { evitavel: e.target.value as Evitavel })}>
                            {EVITAVEL_OPCOES.map((v) => <option key={v} value={v}>{v}</option>)}
                          </select>
                        </td>
                        <td>
                          <input type="checkbox" aria-label={`Origem ${o.nome} ativa`} checked={r.ativo} onChange={(e) => editarOrigem(o.nome, { ativo: e.target.checked })} />
                        </td>
                        <td>
                          <button type="button" className="btn-secondary" onClick={() => salvarOrigem(o.nome)} disabled={!alterada || salvando}>
                            <Save size={13} /> Salvar
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                  <tr>
                    <td>
                      <input aria-label="Nova origem" className="field-control" placeholder="Nova origem" value={novaOrigem.nome} onChange={(e) => setNovaOrigem({ ...novaOrigem, nome: e.target.value })} />
                    </td>
                    <td>
                      <select aria-label="Área da nova origem" className="field-control" value={novaOrigem.area} onChange={(e) => setNovaOrigem({ ...novaOrigem, area: e.target.value })}>
                        <option value="">Selecione</option>
                        {areas.map((a) => <option key={a} value={a}>{a}</option>)}
                      </select>
                    </td>
                    <td>
                      <select aria-label="Evitável da nova origem" className="field-control" value={novaOrigem.evitavel} onChange={(e) => setNovaOrigem({ ...novaOrigem, evitavel: e.target.value as Evitavel })}>
                        {EVITAVEL_OPCOES.map((v) => <option key={v} value={v}>{v}</option>)}
                      </select>
                    </td>
                    <td />
                    <td>
                      <button type="button" className="btn-primary" onClick={adicionarOrigem} disabled={salvando}>
                        <Plus size={13} /> Adicionar
                      </button>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          <div className="chart-grid">
            {LISTAS.map((lista) => {
              const itens = listas.itens.filter((i) => i.lista === lista).sort((a, b) => a.ordem - b.ordem);
              return (
                <section key={lista} className="chart-panel" aria-label={LISTA_NC_LABEL[lista]}>
                  <div className="panel-heading">
                    <div>
                      <h3 className="panel-title">{LISTA_NC_LABEL[lista]}</h3>
                      {lista === 'empresa' && (
                        <p className="panel-desc">A reversa está disponível para {EMPRESAS_REVERSA.join(' e ')}; as demais registram NC.</p>
                      )}
                    </div>
                  </div>
                  <div className="nc-chips">
                    {itens.map((item) => (
                      <label key={item.valor} className={`nc-chip${item.ativo ? '' : ' is-inativo'}`} title={item.ativo ? 'Desmarque para desativar' : 'Inativo: marque para reativar'}>
                        <input
                          type="checkbox"
                          checked={item.ativo}
                          disabled={salvando}
                          onChange={(e) => executar(() => ncService.salvarItemLista({ ...item, ativo: e.target.checked }), e.target.checked ? 'Valor reativado.' : 'Valor desativado.')}
                        />
                        {item.valor}
                      </label>
                    ))}
                  </div>
                  <div className="nc-add">
                    <input
                      className="field-control"
                      aria-label={`Novo valor em ${LISTA_NC_LABEL[lista]}`}
                      placeholder="Novo valor"
                      value={novosValores[lista] ?? ''}
                      onChange={(e) => setNovosValores({ ...novosValores, [lista]: e.target.value })}
                      onKeyDown={(e) => { if (e.key === 'Enter') adicionarValor(lista); }}
                    />
                    <button type="button" className="btn-secondary" onClick={() => adicionarValor(lista)} disabled={salvando}>
                      <Plus size={13} /> Adicionar
                    </button>
                  </div>
                </section>
              );
            })}
            <section className="chart-panel" aria-label="Status da NC">
              <div className="panel-heading">
                <div>
                  <h3 className="panel-title">Status da NC</h3>
                  <p className="panel-desc">Fixos: o painel conta “Aberta” e “Em tratativa” como em aberto.</p>
                </div>
              </div>
              <div className="nc-chips">
                {STATUS_NC.map((s) => <span key={s} className="nc-chip">{s}</span>)}
              </div>
            </section>
          </div>
        </>
      )}
    </div>
  );
}
