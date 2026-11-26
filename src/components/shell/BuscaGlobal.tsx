// ── Busca global do cabeçalho (padrão visual, seção 10.1) ────────────────────
// Procura entre as telas que o perfil já pode abrir (as mesmas do menu); não consulta dados
// nem amplia acesso. Resultados só a partir de dois caracteres, agrupados por seção do menu.
// Setas mudam a seleção, Enter abre, Ctrl ou Command + K foca, Esc e clique fora fecham.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search } from 'lucide-react';
import type { NavItem } from '../../lib/perfil';
import { agruparMenu } from '../../lib/menu';

interface Resultado {
  item: NavItem;
  grupo: string;
}

function normalizar(texto: string): string {
  return texto.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim();
}

export default function BuscaGlobal({ itens }: { itens: NavItem[] }) {
  const navigate = useNavigate();
  const idLista = useId();
  const raiz = useRef<HTMLDivElement>(null);
  const campo = useRef<HTMLInputElement>(null);
  const [termo, setTermo] = useState('');
  const [aberto, setAberto] = useState(false);
  const [ativo, setAtivo] = useState(0);

  const grupos = useMemo(() => {
    const encontrados = new Map<string, Resultado[]>();
    const consulta = normalizar(termo);
    if (consulta.length < 2) return [];
    for (const grupo of agruparMenu(itens)) {
      for (const no of grupo.nos) {
        for (const item of [no.item, ...no.filhos]) {
          if (!normalizar(`${item.label} ${grupo.titulo}`).includes(consulta)) continue;
          encontrados.set(grupo.titulo, [...(encontrados.get(grupo.titulo) ?? []), { item, grupo: grupo.titulo }]);
        }
      }
    }
    return [...encontrados.entries()].map(([titulo, resultados]) => ({ titulo, resultados }));
  }, [itens, termo]);
  const planos = useMemo(() => grupos.flatMap((grupo) => grupo.resultados), [grupos]);
  const consultaValida = normalizar(termo).length >= 2;

  useEffect(() => {
    const atalho = (evento: KeyboardEvent) => {
      if ((evento.ctrlKey || evento.metaKey) && evento.key.toLowerCase() === 'k') {
        evento.preventDefault();
        campo.current?.focus();
        campo.current?.select();
      }
    };
    const fora = (evento: MouseEvent) => {
      if (raiz.current && !raiz.current.contains(evento.target as Node)) setAberto(false);
    };
    document.addEventListener('keydown', atalho);
    document.addEventListener('mousedown', fora);
    return () => {
      document.removeEventListener('keydown', atalho);
      document.removeEventListener('mousedown', fora);
    };
  }, []);

  const abrir = (resultado: Resultado) => {
    setAberto(false);
    setTermo('');
    campo.current?.blur();
    navigate(resultado.item.to);
  };

  const aoTeclar = (evento: React.KeyboardEvent<HTMLInputElement>) => {
    if (evento.key === 'Escape') {
      setAberto(false);
      return;
    }
    if (planos.length === 0) return;
    if (evento.key === 'ArrowDown') {
      evento.preventDefault();
      setAberto(true);
      setAtivo((atual) => (atual + 1) % planos.length);
    } else if (evento.key === 'ArrowUp') {
      evento.preventDefault();
      setAtivo((atual) => (atual - 1 + planos.length) % planos.length);
    } else if (evento.key === 'Enter' && aberto) {
      evento.preventDefault();
      abrir(planos[Math.min(ativo, planos.length - 1)]);
    }
  };

  const mostrarResultados = aberto && consultaValida;
  let posicao = -1;

  return (
    <div className="search" ref={raiz} role="search">
      <div className="input-icon">
        <Search size={17} aria-hidden="true" />
        <input
          ref={campo}
          className="input"
          type="search"
          role="combobox"
          aria-label="Buscar telas do sistema"
          aria-expanded={mostrarResultados}
          aria-controls={idLista}
          aria-autocomplete="list"
          placeholder="Buscar telas do sistema"
          autoComplete="off"
          value={termo}
          onChange={(evento) => { setTermo(evento.target.value); setAtivo(0); setAberto(true); }}
          onFocus={() => setAberto(true)}
          onKeyDown={aoTeclar}
        />
        <span className="trail hide-mobile"><kbd className="kbd">Ctrl K</kbd></span>
      </div>
      {mostrarResultados && (
        <div id={idLista} className="search-results glass-strong" role="listbox" aria-label="Resultados da busca">
          {grupos.length === 0 && <p className="small muted" style={{ padding: '12px 16px' }}>Nenhuma tela encontrada para “{termo.trim()}”.</p>}
          {grupos.map((grupo) => (
            <div className="search-group" key={grupo.titulo}>
              <div className="search-group-label">{grupo.titulo}</div>
              {grupo.resultados.map((resultado) => {
                posicao += 1;
                const Icone = resultado.item.icon;
                const indice = posicao;
                return (
                  <button
                    key={resultado.item.to}
                    type="button"
                    role="option"
                    aria-selected={indice === ativo}
                    data-active={indice === ativo}
                    className="menu-item"
                    onMouseEnter={() => setAtivo(indice)}
                    onClick={() => abrir(resultado)}
                  >
                    <Icone size={16} aria-hidden="true" />
                    {resultado.item.label}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
