import type { ReactNode } from "react";

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="flex flex-col gap-5 border-b border-ink-950/20 pb-7 sm:flex-row sm:items-end sm:justify-between">
      <div>
        {eyebrow ? (
          <p className="mb-2 font-mono text-[0.64rem] uppercase tracking-[0.22em] text-vermilion-400">
            {eyebrow}
          </p>
        ) : null}
        <h1 className="font-serif text-3xl font-normal tracking-tight text-ink-950 sm:text-4xl">
          {title}
          <span aria-hidden="true" className="text-vermilion-500">
            .
          </span>
        </h1>
        {description ? (
          <p className="mt-2 max-w-2xl text-sm leading-6 text-ink-600">
            {description}
          </p>
        ) : null}
      </div>
      {actions ? (
        <div className="flex flex-wrap items-center gap-2">{actions}</div>
      ) : null}
    </header>
  );
}
