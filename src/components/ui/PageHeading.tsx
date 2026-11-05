import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';

interface PageHeadingProps {
  /** Só quando acrescenta algo que o título não diz. */
  eyebrow?: string;
  title: string;
  /** Só quando há uma informação que a tela não mostra por si. */
  description?: string;
  icon?: LucideIcon;
  action?: ReactNode;
}

export default function PageHeading({ eyebrow, title, description, icon: Icon, action }: PageHeadingProps) {
  return (
    <div className="page-heading">
      <div className="page-heading-copy">
        {eyebrow && <p className="page-eyebrow">{Icon && <Icon size={13} aria-hidden="true" />}{eyebrow}</p>}
        <h1 className="page-title">{title}</h1>
        {description && <p className="page-description">{description}</p>}
      </div>
      {action && <div className="page-heading-action">{action}</div>}
    </div>
  );
}
