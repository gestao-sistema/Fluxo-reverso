// Botão discreto para pausar/retomar os efeitos do fundo. Preferência por usuário,
// sincronizada com o fundo pelo hook useEfeitosFundoPausados.
import { Pause, Play } from 'lucide-react';
import { useEfeitosFundoPausados } from '../../hooks/useEfeitosFundo';

export default function BotaoEfeitosFundo({ className = '' }: { className?: string }) {
  const [pausados, definir] = useEfeitosFundoPausados();

  return (
    <button
      type="button"
      className={`efeitos-fundo-toggle ${className}`}
      aria-pressed={pausados}
      onClick={() => definir(!pausados)}
    >
      {pausados ? <Play size={13} aria-hidden="true" /> : <Pause size={13} aria-hidden="true" />}
      <span>{pausados ? 'Retomar efeitos' : 'Pausar efeitos'}</span>
    </button>
  );
}
