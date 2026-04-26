import Link from "next/link";
import type { ReactNode } from "react";

type ShellProps = {
  title: string;
  eyebrow?: string;
  description?: string;
  children: ReactNode;
  navItems?: Array<{ href: string; label: string }>;
};

export function Shell({ title, eyebrow, description, children, navItems = [] }: ShellProps) {
  return (
    <main className="mx-auto max-w-7xl px-6 py-10">
      <div className="flex flex-col gap-6 border-b border-slate-200 pb-8 lg:flex-row lg:items-end lg:justify-between">
        <div>
          {eyebrow ? (
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-teal-700">
              {eyebrow}
            </p>
          ) : null}
          <h1 className="mt-2 text-4xl font-semibold tracking-tight text-slate-950">{title}</h1>
          {description ? <p className="mt-3 max-w-3xl text-slate-600">{description}</p> : null}
        </div>
        {navItems.length > 0 ? (
          <nav className="flex flex-wrap gap-2">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700"
              >
                {item.label}
              </Link>
            ))}
          </nav>
        ) : null}
      </div>
      <div className="py-8">{children}</div>
    </main>
  );
}
