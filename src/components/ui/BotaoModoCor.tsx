// Alterna entre modo claro e escuro. Preferência por navegador (useModoCor).
import { Moon, Sun } from 'lucide-react';
import { useModoCor } from '../../hooks/useModoCor';

export default function BotaoModoCor({ className = '' }: { className?: string }) {
  const [modo, definir] = useModoCor();
  const claro = modo === 'claro';
  const rotulo = claro ? 'Usar modo escuro' : 'Usar modo claro';

  return (
    <button
      type="button"
      className={`modo-cor-toggle ${className}`}
      onClick={() => definir(claro ? 'escuro' : 'claro')}
      aria-label={rotulo}
      title={rotulo}
    >
      {claro ? <Moon size={19} aria-hidden="true" /> : <Sun size={19} aria-hidden="true" />}
    </button>
  );
}
