import type { ReactNode } from "react";

type PanelProps = {
  title?: string;
  eyebrow?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  padded?: boolean;
};

export function Panel({ title, eyebrow, actions, children, className = "", padded = true }: PanelProps) {
  return (
    <section className={`border border-[var(--panel-border)] bg-[var(--panel)] ${className}`}>
      {(title || eyebrow || actions) && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--panel-border)] px-4 py-3">
          <div className="min-w-0">
            {eyebrow ? (
              <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--muted)]">{eyebrow}</p>
            ) : null}
            {title ? <h2 className="truncate text-sm font-semibold">{title}</h2> : null}
          </div>
          {actions ? <div className="flex shrink-0 flex-wrap gap-2">{actions}</div> : null}
        </div>
      )}
      <div className={padded ? "p-4" : undefined}>{children}</div>
    </section>
  );
}
