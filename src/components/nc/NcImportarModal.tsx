// ── Importação da planilha de NC (aba REGISTRO_NC) ───────────────────────────
// O arquivo é lido no navegador e gravado direto no banco (os dados de clientes
// não passam pelo repositório). Mantém o ID da planilha (NC-0001…), pula as NCs
// já importadas e lista as linhas que não entram: problema de leitura, valor
// fora das listas ou ID já usado por uma NC registrada no sistema.
import { useState } from 'react';
import toast from 'react-hot-toast';
import { FileSpreadsheet, Loader2, Upload, X } from 'lucide-react';
import ncService from '../../services/ncService';
import { useAuth } from '../../context/AuthContext';
import { lerPlanilhaNc, resumirImportacao, validarContraListas } from '../../lib/ncPlanilha';
import type { ProblemaImportacao, ResumoImportacao } from '../../lib/ncPlanilha';
import type { ListasNc } from '../../types';

interface Props {
  listas: ListasNc;
  onFechar: () => void;
  onImportado: () => void;
}

export default function NcImportarModal({ listas, onFechar, onImportado }: Props) {
  const { user } = useAuth();
  const [arquivo, setArquivo] = useState<string | null>(null);
  const [leitura, setLeitura] = useState<{ lidas: number; resumo: ResumoImportacao; naoEntram: ProblemaImportacao[] } | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [lendo, setLendo] = useState(false);
  const [enviando, setEnviando] = useState(false);

  const ler = async (file: File | undefined) => {
    if (!file) return;
    setArquivo(file.name);
    setErro(null);
    setLeitura(null);
    setLendo(true);
    try {
      const { registros, problemas } = lerPlanilhaNc(await file.arrayBuffer());
      const todosProblemas = [...problemas, ...validarContraListas(registros, listas)];
      const gravadas = await ncService.numerosGravados([...new Set(registros.map((r) => r.numero))]);
      const resumo = resumirImportacao({ registros, problemas: todosProblemas }, gravadas);
      // Linhas já importadas não aparecem como problema: elas só são ignoradas
      const ignoradas = new Set(
        registros.filter((r) => gravadas.some((g) => g.numero === r.numero && g.importada)).map((r) => r.linha)
      );
      const naoEntram = [...resumo.conflitos, ...todosProblemas.filter((p) => !ignoradas.has(p.linha))]
        .sort((a, b) => a.linha - b.linha);
      setLeitura({ lidas: registros.length, resumo, naoEntram });
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Não foi possível ler a planilha.');
    } finally {
      setLendo(false);
    }
  };

  const importar = async () => {
    if (!leitura || leitura.resumo.novas.length === 0) return;
    setEnviando(true);
    try {
      const { inseridas } = await ncService.importar(leitura.resumo.novas, user);
      toast.success(`${inseridas} NC(s) importada(s) da planilha.`);
      onImportado();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao importar a planilha.');
    } finally {
      setEnviando(false);
    }
  };

  const resumo = leitura?.resumo;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 px-4 pt-[5vh]" role="dialog" aria-modal="true" aria-label="Importar planilha de NC">
      <div className="w-full max-w-2xl bg-white rounded-2xl shadow-xl border border-slate-200 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 sticky top-0 bg-white rounded-t-2xl">
          <h2 className="text-lg font-semibold text-slate-900">Importar planilha de NC</h2>
          <button type="button" onClick={onFechar} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600" aria-label="Fechar">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4 text-sm text-slate-700">
          <p>
            Selecione a planilha “Análise de não conformidades — Expedição”. A aba <strong>REGISTRO_NC</strong> é lida no
            seu navegador; cada NC mantém o ID da planilha (NC-0001…). NCs já importadas são ignoradas.
          </p>

          <label className="btn btn-secondary cursor-pointer" style={{ width: 'fit-content' }}>
            {lendo ? <Loader2 className="animate-spin" size={15} /> : <FileSpreadsheet size={15} />} {arquivo ?? 'Escolher arquivo .xlsx'}
            <input type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="hidden" disabled={lendo || enviando} onChange={(e) => ler(e.target.files?.[0])} />
          </label>

          {erro && <div className="login-error" role="alert">{erro}</div>}

          {leitura && resumo && (
            <>
              <ul className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <li className="rounded-lg border border-slate-200 p-3"><strong className="block text-lg text-slate-900">{leitura.lidas}</strong>lidas</li>
                <li className="rounded-lg border border-emerald-200 bg-emerald-50 p-3"><strong className="block text-lg text-emerald-800">{resumo.novas.length}</strong>serão importadas</li>
                <li className="rounded-lg border border-slate-200 p-3"><strong className="block text-lg text-slate-900">{resumo.jaImportadas}</strong>já importadas</li>
                <li className="rounded-lg border border-amber-200 bg-amber-50 p-3"><strong className="block text-lg text-amber-800">{resumo.comProblema + resumo.conflitos.length}</strong>não entram</li>
              </ul>

              {resumo.semOrigem > 0 && (
                <p className="text-xs text-slate-500">
                  {resumo.semOrigem} NC(s) sem origem entram no registro, mas não no painel — como na planilha.
                </p>
              )}

              {resumo.conflitos.length > 0 && (
                <p className="text-xs text-amber-800">
                  IDs já usados por NCs registradas no sistema são outra ocorrência: registre essas linhas como NC nova
                  (pelo botão “Nova NC”) em vez de importar.
                </p>
              )}

              {leitura.naoEntram.length > 0 && (
                <div>
                  <p className="font-medium text-slate-800 mb-2">Linhas que não serão importadas (corrija na planilha ou nas listas e importe de novo):</p>
                  <div className="max-h-56 overflow-y-auto rounded-lg border border-slate-200">
                    <table className="data-table">
                      <thead><tr><th>Linha</th><th>Campo</th><th>Problema</th></tr></thead>
                      <tbody>
                        {leitura.naoEntram.map((p, i) => (
                          <tr key={`${p.linha}-${p.campo}-${i}`}><td>{p.linha}</td><td>{p.campo}</td><td>{p.mensagem}</td></tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-slate-200">
          <button type="button" onClick={onFechar} className="btn btn-secondary">Cancelar</button>
          <button type="button" onClick={importar} className="btn btn-primary" disabled={!resumo || resumo.novas.length === 0 || enviando || lendo}>
            {enviando ? <Loader2 className="animate-spin" size={15} /> : <Upload size={15} />}
            Importar {resumo ? resumo.novas.length : ''} NC(s)
          </button>
        </div>
      </div>
    </div>
  );
}
