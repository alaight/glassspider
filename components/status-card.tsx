import type { ReactNode } from "react";

type StatusCardProps = {
  title: string;
  value: ReactNode;
  caption?: string;
};

export function StatusCard({ title, value, caption }: StatusCardProps) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-sm font-medium text-slate-500">{title}</p>
      <div className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">{value}</div>
      {caption ? <p className="mt-2 text-sm text-slate-500">{caption}</p> : null}
    </section>
  );
}
