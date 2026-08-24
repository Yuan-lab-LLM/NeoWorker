import type { ReactNode } from "react";

interface PersonalityTabHeaderProps {
  title: string;
  description: string;
  aside?: ReactNode;
}

export function PersonalityTabHeader({
  title,
  description,
  aside,
}: PersonalityTabHeaderProps) {
  return (
    <header className="personality-tab-header">
      <div className="personality-tab-heading">
        <h3>{title}</h3>
        <p className="settings-description">{description}</p>
      </div>
      {aside ? <div className="personality-tab-meta">{aside}</div> : null}
    </header>
  );
}
