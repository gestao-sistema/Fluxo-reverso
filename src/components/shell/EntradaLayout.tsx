// ── Entrada (padrão visual, seção 21) ────────────────────────────────────────
// Telas fora da área autenticada (login, definição de senha, sem acesso). Desktop: painel de
// marca sólido à esquerda e painel de vidro denso à direita, ambos de raio 30 px. Até 760 px o
// painel de marca some e só o de entrada aparece. O fundo de manchas fica em App.tsx.
// ─────────────────────────────────────────────────────────────────────────────
import type { ReactNode } from 'react';
import BotaoModoCor from '../ui/BotaoModoCor';
import { Monograma, Wordmark } from './Marca';

interface Props {
  /** Nome acessível do painel de entrada. */
  rotulo: string;
  children: ReactNode;
}

export default function EntradaLayout({ rotulo, children }: Props) {
  return (
    <div className="entry">
      <aside className="entry-brand" aria-label="Reverso, logística reversa das marcas Alinare e Novitah">
        <span className="art-shape art-anel-grande" aria-hidden="true" />
        <span className="art-shape art-anel-medio" aria-hidden="true" />
        <span className="art-shape art-mancha" aria-hidden="true" />
        <span className="art-shape art-circulo" aria-hidden="true" />
        <div className="art-topo"><Wordmark marca="azime" altura={26} /></div>
        <div className="art-centro">
          <p className="art-titulo">Logística reversa de ponta a ponta.</p>
          <p className="art-texto">Pedidos, aprovações, etiquetas e não conformidades da Alinare e da Novitah em um só lugar.</p>
        </div>
        <div className="art-marcas" aria-hidden="true">
          <Wordmark marca="alinare" altura={20} />
          <Wordmark marca="novitah" altura={20} />
        </div>
      </aside>
      <section className="entry-panel glass-strong" aria-label={rotulo}>
        <div className="entry-topo">
          <Monograma marca="azime" />
          <BotaoModoCor />
        </div>
        <div className="inner">{children}</div>
        <p className="xs muted entry-rodape">Reverso · Logística reversa</p>
      </section>
    </div>
  );
}
