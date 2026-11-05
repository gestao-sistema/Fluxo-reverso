import type { StatusNc } from '../../types';
import { SEM_STATUS } from '../../lib/ncCalculos';

const CORES: Record<StatusNc, { color: string; background: string }> = {
  Aberta: { color: 'var(--flow-warning)', background: 'var(--flow-warning-soft)' },
  'Em tratativa': { color: 'var(--flow-info)', background: 'var(--flow-info-soft)' },
  Encerrada: { color: 'var(--flow-success)', background: 'var(--flow-success-soft)' },
  Cancelada: { color: 'var(--flow-text-3)', background: 'var(--flow-surface-nested)' },
};

/** Status da NC; ocorrências antigas da planilha podem não ter status. */
export default function NcStatusBadge({ status }: { status: StatusNc | null }) {
  const cores = status ? CORES[status] : { color: 'var(--flow-text-3)', background: 'var(--flow-surface-nested)' };
  return (
    <span className="record-status" style={cores}>
      {status ?? SEM_STATUS}
    </span>
  );
}
