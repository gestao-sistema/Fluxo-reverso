// ── Cabeçalho de página (padrão visual, seção 11) ────────────────────────────
// Trilha opcional (breadcrumbs), título de 30 px, descrição e ações à direita. As ações passam
// a ocupar a linha inteira no celular. O ícone recebido por compatibilidade não é desenhado:
// o padrão não usa ícone no título de página.
import { Fragment, type ReactNode } from 'react';
import { ChevronRight } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

interface PageHeadingProps {
  /** Trilha separada por "/" (ex.: "QUALIDADE / NÃO CONFORMIDADES"). Só quando acrescenta algo que o título não diz. */
  eyebrow?: string;
  title: string;
  /** Só quando há uma informação que a tela não mostra por si. */
  description?: string;
  /** Mantido por compatibilidade com as telas; não é exibido. */
  icon?: LucideIcon;
  action?: ReactNode;
}

function emFrase(texto: string): string {
  const minusculo = texto.trim().toLocaleLowerCase('pt-BR');
  return minusculo.charAt(0).toLocaleUpperCase('pt-BR') + minusculo.slice(1);
}

export default function PageHeading({ eyebrow, title, description, action }: PageHeadingProps) {
  const trilha = eyebrow ? eyebrow.split('/').map(emFrase).filter(Boolean) : [];
  return (
    <div className="page-heading">
      {trilha.length > 0 && (
        <nav className="crumbs" aria-label="Trilha de navegação">
          {trilha.map((parte, indice) => (
            <Fragment key={`${parte}-${indice}`}>
              {indice > 0 && <ChevronRight size={14} aria-hidden="true" />}
              <span aria-current={indice === trilha.length - 1 ? 'page' : undefined}>{parte}</span>
            </Fragment>
          ))}
        </nav>
      )}
      <div className="page-head">
        <div style={{ minWidth: 0 }}>
          <h1 className="page-title">{title}</h1>
          {description && <p className="page-sub">{description}</p>}
        </div>
        {action && <div className="page-actions">{action}</div>}
      </div>
    </div>
  );
}
