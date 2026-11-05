import type { ReversaEmissaoResumo } from '../../types';
import { avisoValidadeEmissao, formatarDataCalendario } from '../../lib/emissaoDatas';

interface EmissaoDatasResumoProps {
  emissao: ReversaEmissaoResumo;
  aguardandoPostagem: boolean;
}

export default function EmissaoDatasResumo({ emissao, aguardandoPostagem }: EmissaoDatasResumoProps) {
  const aviso = avisoValidadeEmissao(emissao.valida_ate, {
    aguardandoPostagem,
    substituida: !!emissao.substituida_em,
    postagemConfirmada: !!emissao.postagem_confirmada_em,
  });

  return (
    <div className="grid gap-3 rounded-lg border border-slate-200 bg-white p-3 sm:grid-cols-2" aria-label="Datas da emissão vigente">
      <div><p className="text-xs text-slate-500">Data de emissão</p><p className="text-sm font-semibold text-slate-800">{formatarDataCalendario(emissao.emitida_em) ?? 'Não informada'}</p></div>
      <div><p className="text-xs text-slate-500">Válida até</p><p className="text-sm font-semibold text-slate-800">{formatarDataCalendario(emissao.valida_ate) ?? 'Validade não informada'}</p></div>
      {aviso && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 sm:col-span-2" role="status">
          <p className="text-sm font-semibold text-amber-900">
            {aviso === 'vence_hoje' ? 'Vence hoje'
              : aviso === 'encerrado' ? 'Prazo informado encerrado — verificar postagem'
              : aviso === 'valida' ? `Válida até ${formatarDataCalendario(emissao.valida_ate)}`
              : 'Validade não informada'}
          </p>
          {aviso !== 'nao_informada' && <p className="mt-1 text-xs text-amber-800">Aviso calculado pela data informada; não confirma expiração pelos Correios nem comprova que a etiqueta não foi utilizada.</p>}
        </div>
      )}
    </div>
  );
}
