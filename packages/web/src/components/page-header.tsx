import type { ReactNode } from "react";

interface PageHeaderProps {
  /** Buttons for the page's main actions, on the right from `sm` up and below the title on phones. */
  actions?: ReactNode;
  description?: ReactNode;
  title: ReactNode;
}

/** The page's `h1`; every screen in the shell starts with one. */
export function PageHeader({ title, description, actions }: PageHeaderProps) {
  return (
    <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="flex min-w-0 flex-col gap-1">
        <h1 className="font-heading text-2xl font-semibold tracking-tight">
          {title}
        </h1>
        {description ? (
          <p className="text-muted-foreground text-sm">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex shrink-0 gap-2">{actions}</div> : null}
    </header>
  );
}
