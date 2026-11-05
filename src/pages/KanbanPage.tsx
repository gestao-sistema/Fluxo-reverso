import { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import apiService from '../services/apiService';
import type { Solicitacao, StatusSolicitacao } from '../types';
import { STATUS_SOLICITACAO, STATUS_LABEL, statusAnterior, movimentoValido, isAdmin } from '../types';
import { useSearchParams } from 'react-router-dom';
import {
  Clock,
  CheckCircle2,
  Tag,
  PackageCheck,
  Filter,
  StickyNote,
  Truck,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { podeConfirmarRecebimentoMercadoria } from '../lib/perfil';
import PageHeading from '../components/ui/PageHeading';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import RecordDetailModal from '../components/admin/RecordDetailModal';
import { buscarPedidosComEtiquetaDuplicada } from '../lib/duplicidadeEtiqueta';
import {
  DndContext,
  useDroppable,
  useDraggable,
  PointerSensor,
  useSensor,
  useSensors,
  DragOverlay,
} from '@dnd-kit/core';
import type { DragEndEvent } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';

const POLLING_MS = 15_000;

const STATUS_VISUAL: Record<
  StatusSolicitacao,
  { bg: string; headerBg: string; text: string; border: string; icon: typeof Clock }
> = {
  aguardando_aprovacao: { bg: 'bg-amber-50/50', headerBg: 'bg-amber-100', text: 'text-amber-700', border: 'border-amber-200', icon: Clock },
  reprovado: { bg: 'bg-rose-50/50', headerBg: 'bg-rose-100', text: 'text-rose-700', border: 'border-rose-200', icon: CheckCircle2 },
  pendente: { bg: 'bg-amber-50/50', headerBg: 'bg-amber-100', text: 'text-amber-700', border: 'border-amber-200', icon: Clock },
  etiqueta_gerada: { bg: 'bg-blue-50/50', headerBg: 'bg-blue-100', text: 'text-blue-700', border: 'border-blue-200', icon: Tag },
  postado: { bg: 'bg-violet-50/50', headerBg: 'bg-violet-100', text: 'text-violet-700', border: 'border-violet-200', icon: PackageCheck },
  em_transito: { bg: 'bg-orange-50/50', headerBg: 'bg-orange-100', text: 'text-orange-700', border: 'border-orange-200', icon: Truck },
  concluido: { bg: 'bg-emerald-50/50', headerBg: 'bg-emerald-100', text: 'text-emerald-700', border: 'border-emerald-200', icon: CheckCircle2 },
};

function KanbanCard({
  item,
  onClick,
  onConfirmarRecebimento,
  podeConfirmarRecebimento = false,
}: {
  item: Solicitacao;
  onClick?: () => void;
  onConfirmarRecebimento?: (item: Solicitacao) => void;
  podeConfirmarRecebimento?: boolean;
}) {
  return (
    <div
      onClick={onClick}
      className="kanban-ticket bg-white rounded-lg border border-slate-200 p-3 shadow-sm space-y-2
        cursor-pointer hover:border-slate-300 hover:shadow transition-all"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-medium text-sm text-slate-900 truncate">
          {item.nome_cliente}
        </span>
        <span className="text-xs px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 font-mono shrink-0">
          #{item.codigo_cliente}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <span
          className={`record-empresa-pill ${item.empresa === 'Alinare' ? 'is-alinare' : 'is-novitah'} inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold`}
        >
          {item.empresa}
        </span>
        <span className="text-xs text-slate-500 truncate">{item.motivo}</span>
      </div>
      <div className="flex items-center justify-between text-xs text-slate-400">
        <span>
          {new Date(item.data_solicitacao).toLocaleDateString('pt-BR', { timeZone: 'UTC' })}
        </span>
        {item.anotacoes && (
          <span className="inline-flex items-center gap-1 text-amber-500" title="Possui anotações">
            <StickyNote className="w-3 h-3" />
          </span>
        )}
      </div>
      {item.status === 'em_transito' && item.ultima_cidade_rastreio && (
        <div className="flex items-center gap-1 text-xs text-orange-600">
          <Truck className="w-3 h-3" />
          <span className="truncate">{item.ultima_cidade_rastreio}</span>
        </div>
      )}
      {item.status === 'concluido' && podeConfirmarRecebimento && (
        <p className="text-xs text-emerald-700">
          Entrega informada pelos Correios. Recebimento físico ainda não confirmado.
        </p>
      )}
      {(item.status === 'em_transito' || item.status === 'concluido') && podeConfirmarRecebimento && (
        <button
          type="button"
          className="kanban-receipt-confirm"
          aria-label={`Confirmar recebimento da mercadoria para ${item.nome_cliente}`}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation();
            onConfirmarRecebimento?.(item);
          }}
        >
          <PackageCheck className="h-3.5 w-3.5" aria-hidden="true" />
          Confirmar recebimento
        </button>
      )}
    </div>
  );
}

function DraggableKanbanCard({
  item,
  onClick,
  disabled,
  onConfirmarRecebimento,
  podeConfirmarRecebimento,
}: {
  item: Solicitacao;
  onClick: () => void;
  disabled: boolean;
  onConfirmarRecebimento: (item: Solicitacao) => void;
  podeConfirmarRecebimento: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: item.id,
    data: { item },
    disabled,
  });

  const style = {
    transform: CSS.Translate.toString(transform),
    opacity: isDragging ? 0.4 : 1,
    zIndex: isDragging ? 50 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <KanbanCard
        item={item}
        onClick={onClick}
        onConfirmarRecebimento={onConfirmarRecebimento}
        podeConfirmarRecebimento={podeConfirmarRecebimento}
      />
    </div>
  );
}

function KanbanColumn({
  status,
  items,
  onCardClick,
  podeArraste,
  onConfirmarRecebimento,
  podeConfirmarRecebimento,
}: {
  status: StatusSolicitacao;
  items: Solicitacao[];
  onCardClick: (item: Solicitacao) => void;
  podeArraste: boolean;
  onConfirmarRecebimento: (item: Solicitacao) => void;
  podeConfirmarRecebimento: (item: Solicitacao) => boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: status,
  });

  const vis = STATUS_VISUAL[status];
  const Icon = vis.icon;

  return (
    <div
      ref={setNodeRef}
      className={`kanban-lane min-w-[220px] flex-1 basis-0 shrink-0 rounded-xl border flex flex-col h-full min-h-0 transition-colors
        ${vis.border} ${isOver ? 'bg-slate-200/50 ring-2 ring-blue-400/30' : vis.bg}
      `}
    >
      <div className={`kanban-lane-head px-4 py-3 rounded-t-xl flex items-center justify-between shrink-0`}>
        <div className={`kanban-lane-title ${vis.text}`}>
          <Icon className="w-4 h-4" />
          <span>{STATUS_LABEL[status]}</span>
        </div>
        <span className={`kanban-lane-count text-xs font-bold px-2 py-0.5 rounded-full ${vis.text} bg-white/60`}>
          {items.length}
        </span>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-3 min-h-0">
        {items.length === 0 && !isOver && (
          <p className="text-xs text-slate-400 text-center py-4">Nenhuma solicitação</p>
        )}
        {items.map((item) => (
          <DraggableKanbanCard
            key={item.id}
            item={item}
            onClick={() => onCardClick(item)}
            disabled={!podeArraste}
            onConfirmarRecebimento={onConfirmarRecebimento}
            podeConfirmarRecebimento={podeConfirmarRecebimento(item)}
          />
        ))}
      </div>
    </div>
  );
}

export default function KanbanPage() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const queryEmpresa = searchParams.get('empresa') as 'Alinare' | 'Novitah' | null;
  const [solicitacoes, setSolicitacoes] = useState<Solicitacao[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selected, setSelected] = useState<Solicitacao | null>(null);
  const [draggedItem, setDraggedItem] = useState<Solicitacao | null>(null);
  const [recebimentoPendente, setRecebimentoPendente] = useState<Solicitacao | null>(null);
  const [salvandoRecebimento, setSalvandoRecebimento] = useState(false);
  // Pedidos concluídos pela entrega dos Correios que ainda esperam a confirmação física da empresa.
  const [fisicoPendente, setFisicoPendente] = useState<Set<string>>(new Set());
  const mountedRef = useRef(true);

  // Requer pressionar por um pequeno tempo/distância para não conflitar com click de abrir modal
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    })
  );

  const temGeral =
    user?.telas.includes('lista-geral') ||
    user?.telas.includes('dashboard-geral') ||
    user?.telas.includes('usuarios');
  const temAlinare = user?.telas.some((t) => t.includes('alinare'));
  const temNovitah = user?.telas.some((t) => t.includes('novitah'));

  let empresaFixa: 'Alinare' | 'Novitah' | null = null;
  if (!temGeral) {
    if (temAlinare && !temNovitah) empresaFixa = 'Alinare';
    if (temNovitah && !temAlinare) empresaFixa = 'Novitah';
  } else if (queryEmpresa && (queryEmpresa === 'Alinare' || queryEmpresa === 'Novitah')) {
    empresaFixa = queryEmpresa;
  }

  const carregar = useCallback(async (isPoll = false) => {
    if (!mountedRef.current) return;
    if (!isPoll) setIsLoading(true);
    try {
      const dados = await apiService.getSolicitacoes({ empresa: empresaFixa ?? 'Ambas', limiteConcluidos: 50 });
      if (mountedRef.current) setSolicitacoes(dados);
      // A pendência de confirmação física é complementar: se a consulta falhar, o quadro segue
      // funcionando e só deixa de oferecer a confirmação nos pedidos já concluídos.
      apiService.listarRecebimentosFisicosPendentes()
        .then((ids) => { if (mountedRef.current) setFisicoPendente(new Set(ids)); })
        .catch(() => { if (mountedRef.current) setFisicoPendente(new Set()); });
    } catch (err) {
      console.error(err);
    } finally {
      if (mountedRef.current) setIsLoading(false);
    }
  }, [empresaFixa]);

  // Efeito principal: carrega dados locais, sincroniza com Correios e recarrega
  useEffect(() => {
    mountedRef.current = true;

    // 1. Carrega dados rápidos do BD local
    carregar(false);

    // 2. Dispara sync em lote com os Correios e recarrega Kanban ao terminar
    apiService.atualizarRastreioLote()
      .then(() => { if (mountedRef.current) carregar(true); })
      .catch(console.error);

    // 3. Polling a cada 15s para manter Kanban vivo
    const id = setInterval(() => carregar(true), POLLING_MS);
    return () => { mountedRef.current = false; clearInterval(id); };
  }, [carregar]);

  const admin = user ? isAdmin(user) : false;
  const podeEditarKanban = admin || user?.telas.includes('kanban-edit') || false;

  const confirmarRecebimentoMercadoria = async () => {
    const pedido = recebimentoPendente;
    const concluidoPelosCorreios = pedido?.status === 'concluido' && fisicoPendente.has(pedido.id);
    if (!pedido || !user || (pedido.status !== 'em_transito' && !concluidoPelosCorreios)) return;
    if (!podeConfirmarRecebimentoMercadoria(user, pedido.empresa)) {
      toast.error('Seu perfil não pode confirmar o recebimento desta empresa.');
      setRecebimentoPendente(null);
      return;
    }

    setSalvandoRecebimento(true);
    try {
      const atualizado = await apiService.confirmarRecebimentoMercadoria(pedido.id, user);
      setSolicitacoes((anteriores) => anteriores.map((item) => item.id === atualizado.id ? atualizado : item));
      setRecebimentoPendente(null);
      if (concluidoPelosCorreios) {
        setFisicoPendente((anteriores) => { const proximo = new Set(anteriores); proximo.delete(pedido.id); return proximo; });
        toast.success('Recebimento físico registrado. O pedido continua Concluído.');
      } else {
        toast.success('Recebimento confirmado. Pedido movido para Concluído.');
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Não foi possível confirmar o recebimento.');
      await carregar(true);
    } finally {
      setSalvandoRecebimento(false);
    }
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    setDraggedItem(null);
    const { active, over } = event;
    if (!over) return; // soltou fora de qualquer coluna

    const draggedCard = active.data.current?.item as Solicitacao;
    if (!draggedCard) return;

    const sourceStatus = draggedCard.status || 'pendente';
    const destStatus = over.id as StatusSolicitacao;

    if (sourceStatus === destStatus) return; // não mudou

    if (destStatus === 'concluido') {
      toast.error('Concluído só pelo rastreamento dos Correios ou pela confirmação de recebimento no card.');
      return;
    }

    // Validações: movimento válido (uma etapa pra frente OU pra trás)
    if (!movimentoValido(sourceStatus, destStatus)) {
      toast.error(`Movimento inválido. Só pode mover uma etapa por vez.`);
      return;
    }

    const ordemComEtiqueta: Partial<Record<StatusSolicitacao, number>> = {
      etiqueta_gerada: 1,
      postado: 2,
      em_transito: 3,
      concluido: 4,
    };
    const avancandoAposEtiqueta = ordemComEtiqueta[sourceStatus] !== undefined
      && ordemComEtiqueta[destStatus] !== undefined
      && ordemComEtiqueta[destStatus]! > ordemComEtiqueta[sourceStatus]!;
    if (avancandoAposEtiqueta && (draggedCard.etiqueta_path || draggedCard.codigo_rastreio)) {
      try {
        const pedidosAtivos = await apiService.getSolicitacoes({
          status: ['pendente', 'etiqueta_gerada', 'postado', 'em_transito'],
        });
        const duplicados = await buscarPedidosComEtiquetaDuplicada(
          draggedCard,
          pedidosAtivos,
          (path) => apiService.urlEtiqueta(path),
        );
        if (duplicados.length) {
          toast.error(`Movimento bloqueado: esta etiqueta também está em ${duplicados.length} outro(s) pedido(s).`);
          return;
        }
      } catch {
        toast.error('Não foi possível conferir as etiquetas. O pedido permaneceu na etapa atual.');
        return;
      }
    }

    try {
      // Optimistic update
      setSolicitacoes((prev) =>
        prev.map((s) => (s.id === draggedCard.id ? { ...s, status: destStatus } : s))
      );

      const payload: Partial<Solicitacao> = { status: destStatus };

      // Limpa timestamp ao voltar etapa
      if (destStatus === statusAnterior('etiqueta_gerada')) {
        payload.etiqueta_gerada_em = null; // voltou de etiqueta_gerada para pendente
      }
      if (destStatus === statusAnterior('postado')) {
        payload.postado_em = null; // voltou de postado para etiqueta_gerada
      }
      if (destStatus === statusAnterior('em_transito')) {
        payload.em_transito_em = null; // voltou de em_transito para postado
      }
      if (destStatus === statusAnterior('concluido')) {
        payload.concluido_em = null; // voltou de concluido para em_transito
      }

      // Seta timestamp ao avançar
      if (destStatus === 'etiqueta_gerada') payload.etiqueta_gerada_em = new Date().toISOString();
      if (destStatus === 'postado') payload.postado_em = new Date().toISOString();
      if (destStatus === 'em_transito') payload.em_transito_em = new Date().toISOString();

      await apiService.updateSolicitacao(draggedCard.id, payload, user);
      toast.success(`Movido para ${STATUS_LABEL[destStatus]}`);
    } catch (err) {
      console.error(err);
      toast.error('Erro ao atualizar status.');
      await carregar(true); // rollback
    }
  };

  const colunas = useMemo(() => {
    const map: Record<StatusSolicitacao, Solicitacao[]> = {
      aguardando_aprovacao: [],
      reprovado: [],
      pendente: [],
      etiqueta_gerada: [],
      postado: [],
      em_transito: [],
      concluido: [],
    };
    solicitacoes.forEach((s) => {
      const resolvidoAntigo = (s as any).resolvido;
      const statusReal = s.status || (resolvidoAntigo ? 'concluido' : 'pendente');
      if (map[statusReal]) map[statusReal].push(s);
    });
    return map;
  }, [solicitacoes]);

  return (
    <div className="kanban-board flex flex-col h-[calc(100dvh-11rem)] min-h-[530px] gap-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0">
        <PageHeading icon={Truck} title="Acompanhamento" />
        {temGeral && (
          <div className="relative sm:min-w-[160px]">
            <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <select
              value={empresaFixa ?? 'Ambas'}
              onChange={(e) => {
                const val = e.target.value;
                setSearchParams(val === 'Ambas' ? {} : { empresa: val });
              }}
              className="w-full pl-9 pr-8 h-10 rounded-lg border border-slate-300 text-sm appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-transparent"
            >
              <option value="Ambas">Todas empresas</option>
              <option value="Alinare">Alinare</option>
              <option value="Novitah">Novitah</option>
            </select>
          </div>
        )}
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-slate-400">Carregando...</div>
      ) : (
        <DndContext
          sensors={sensors}
          onDragStart={(e) => setDraggedItem(e.active.data.current?.item)}
          onDragEnd={handleDragEnd}
          onDragCancel={() => setDraggedItem(null)}
        >
          <div className="flex flex-row gap-3 overflow-x-auto pb-4 flex-1 min-h-0">
            {STATUS_SOLICITACAO.map((status) => (
              <KanbanColumn
                key={status}
                status={status}
                items={colunas[status]}
                onCardClick={setSelected}
                podeArraste={podeEditarKanban}
                onConfirmarRecebimento={setRecebimentoPendente}
                podeConfirmarRecebimento={(item) => !!user && podeConfirmarRecebimentoMercadoria(user, item.empresa)
                  && (item.status !== 'concluido' || fisicoPendente.has(item.id))}
              />
            ))}
          </div>
          <DragOverlay>
            {draggedItem ? <KanbanCard item={draggedItem} /> : null}
          </DragOverlay>
        </DndContext>
      )}

      <RecordDetailModal
        isOpen={!!selected}
        solicitacao={selected}
        onClose={() => {
          setSelected(null);
          carregar(true);
        }}
      />
      <ConfirmDialog
        open={!!recebimentoPendente}
        title="Confirmar recebimento da mercadoria?"
        message={recebimentoPendente?.status === 'concluido'
          ? 'Os Correios informaram a entrega. Confirma que a mercadoria foi recebida fisicamente? O pedido continua Concluído; a confirmação ficará registrada no histórico com seu nome e o horário.'
          : 'Confirma que a mercadoria foi recebida? O pedido será movido para Concluído e a confirmação ficará registrada no histórico.'}
        confirmLabel="Confirmar recebimento"
        tone="primary"
        busy={salvandoRecebimento}
        onCancel={() => setRecebimentoPendente(null)}
        onConfirm={() => void confirmarRecebimentoMercadoria()}
      />
    </div>
  );
}
