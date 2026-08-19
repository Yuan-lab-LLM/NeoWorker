import type { ReactNode } from "react";
import "./neoworker-page-header.css";

interface NeoWorkerPageHeaderProps {
  title: ReactNode;
  description: ReactNode;
  icon?: ReactNode;
  actions?: ReactNode;
  className?: string;
}

export function NeoWorkerPageHeader({
  title,
  description,
  icon,
  actions,
  className = "",
}: NeoWorkerPageHeaderProps) {
  return (
    <header className={`neoworker-page-header ${className}`.trim()}>
      <div className="neoworker-page-header-copy">
        <div className="neoworker-page-header-title">
          {icon ? (
            <span className="neoworker-page-header-icon" aria-hidden="true">
              {icon}
            </span>
          ) : null}
          <h1>{title}</h1>
        </div>
        <p>{description}</p>
      </div>
      {actions ? (
        <div className="neoworker-page-header-actions">{actions}</div>
      ) : null}
    </header>
  );
}
