// ── Avisos da edição de NC: conflito de versão e correção de valor já registrado ──
// Os dados ficam no formulário: nada aqui grava. A digitação é mantida em qualquer caso.
// ─────────────────────────────────────────────────────────────────────────────

import { descreverCorrecao, MENSAGEM_CONFLITO_EDICAO } from '../../lib/ncEdicao';
import type { Correcao } from '../../lib/ncEdicao';

/** Campo que difere entre a versão em que a NC foi aberta, a versão atual e a digitação. */
export interface DiferencaVersao {
  campo: string;
  rotulo: string;
  aberta: string;
  atual: string;
  digitada: string;
}

interface NcConflitoEdicaoProps {
  consultando: boolean;
  /** null enquanto a versão atual não foi consultada. */
  diferencas: DiferencaVersao[] | null;
  onConsultar: () => void;
  onReaplicar: () => void;
}

/** Outra pessoa gravou a NC: explica, mantém a digitação e permite consultar antes de reaplicar. */
export function NcConflitoEdicao({ consultando, diferencas, onConsultar, onReaplicar }: NcConflitoEdicaoProps) {
  return (
    <section className="nc-aviso nc-field-wide" role="alert" aria-label="Conflito de edição">
      <p><strong>Esta não conformidade foi alterada por outra pessoa.</strong> {MENSAGEM_CONFLITO_EDICAO}</p>
      <div className="flex items-center gap-2 flex-wrap">
        <button type="button" className="btn btn-secondary" onClick={onConsultar} disabled={consultando}>
          Consultar versão atual
        </button>
        {diferencas && (
          <button type="button" className="btn btn-primary" onClick={onReaplicar}>
            Reaplicar minhas alterações sobre esta versão
          </button>
        )}
      </div>
      {diferencas && (
        diferencas.length === 0 ? (
          <p className="nc-dica">A versão atual não tem diferenças em relação ao que você abriu. Você pode salvar de novo.</p>
        ) : (
          <div className="data-table-wrap">
            <table className="data-table" aria-label="Diferenças para a versão atual">
              <thead>
                <tr><th>Campo</th><th>Você abriu</th><th>Versão atual</th><th>Sua digitação</th></tr>
              </thead>
              <tbody>
                {diferencas.map((d) => (
                  <tr key={d.campo}>
                    <td>{d.rotulo}</td>
                    <td>{d.aberta}</td>
                    <td>{d.atual}</td>
                    <td>{d.digitada}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}
    </section>
  );
}

interface NcConfirmarCorrecaoProps {
  correcoes: Correcao[];
  motivo: string;
  disabled: boolean;
  onMotivo: (texto: string) => void;
  onConfirmar: () => void;
  onCancelar: () => void;
}

/** Correção de valor já registrado: mostra o que muda e pede a justificativa curta antes de gravar. */
export function NcConfirmarCorrecao({ correcoes, motivo, disabled, onMotivo, onConfirmar, onCancelar }: NcConfirmarCorrecaoProps) {
  const pronto = motivo.trim().length > 0;
  return (
    <section className="nc-aviso nc-field-wide" aria-label="Confirmar correção de valor registrado">
      <p>
        <strong>Correção de valor já registrado.</strong> Confira as alterações antes de gravar. O valor anterior fica no histórico
        financeiro, com autor e data. Nada é apagado automaticamente.
      </p>
      <ul className="nc-correcoes">
        {correcoes.map((c) => {
          const d = descreverCorrecao(c);
          return <li key={c.campo}>{d.rotulo}: {d.antes} → {d.depois}</li>;
        })}
      </ul>
      <label className="field-label" htmlFor="nc-motivo-correcao">Justificativa da correção (obrigatória, até 300 caracteres)</label>
      <textarea
        id="nc-motivo-correcao"
        className="field-control"
        rows={2}
        maxLength={300}
        value={motivo}
        disabled={disabled}
        onChange={(e) => onMotivo(e.target.value)}
      />
      <div className="flex items-center gap-2 flex-wrap">
        <button type="button" className="btn btn-primary" onClick={onConfirmar} disabled={disabled || !pronto}>
          Confirmar correção
        </button>
        <button type="button" className="btn btn-secondary" onClick={onCancelar} disabled={disabled}>
          Voltar sem gravar
        </button>
      </div>
    </section>
  );
}
