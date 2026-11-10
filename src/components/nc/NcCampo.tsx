// ── Blocos de layout dos formulários de NC (abertura e registro completo) ────
// Mesma aparência de antes; extraídos de NcFormPage para a abertura simplificada
// usar os mesmos componentes.
// ─────────────────────────────────────────────────────────────────────────────

import type { ReactNode } from 'react';

export function Secao({ kicker, titulo, children }: { kicker: string; titulo: string; children: ReactNode }) {
  return (
    <section className="surface-panel" aria-label={titulo}>
      <div className="panel-heading">
        <div>
          <span className="panel-kicker">{kicker}</span>
          <h2 className="panel-title">{titulo}</h2>
        </div>
      </div>
      <div className="nc-grid">{children}</div>
    </section>
  );
}

export function Campo({ id, rotulo, obrigatorio, erro, largo, ajuda, children }: {
  id: string;
  rotulo: string;
  obrigatorio?: boolean;
  erro?: string;
  largo?: boolean;
  ajuda?: string;
  children: ReactNode;
}) {
  return (
    <div className={`filter-field${largo ? ' nc-field-wide' : ''}`}>
      <label className="field-label" htmlFor={id}>
        {rotulo}
        {obrigatorio && <span className="nc-required"> *</span>}
      </label>
      {children}
      {ajuda && <p className="nc-dica">{ajuda}</p>}
      {erro && <p id={`erro-${id}`} className="nc-erro" role="alert">{erro}</p>}
    </div>
  );
}

export function Calculado({ rotulo, valor, ajuda }: { rotulo: string; valor: string; ajuda?: string }) {
  return (
    <div className="filter-field">
      <span className="field-label">{rotulo}<span className="nc-calc-tag">calculado</span></span>
      <div className="nc-calc">{valor}</div>
      {ajuda && <p className="nc-dica">{ajuda}</p>}
    </div>
  );
}
