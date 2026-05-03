import type { ReactNode } from "react";

const toneClasses: Record<"neutral" | "ok" | "warn" | "bad" | "active", string> = {
  neutral: "bg-slate-100 text-slate-700 ring-slate-200",
  ok: "bg-emerald-50 text-emerald-900 ring-emerald-200",
  warn: "bg-amber-50 text-amber-900 ring-amber-200",
  bad: "bg-red-50 text-red-900 ring-red-200",
  active: "bg-blue-50 text-blue-900 ring-blue-200",
};

type StatusBadgeProps = {
  children: ReactNode;
  tone?: keyof typeof toneClasses;
  className?: string;
};

export function StatusBadge({ children, tone = "neutral", className = "" }: StatusBadgeProps) {
  return (
    <span
      className={`inline-flex max-w-full items-center truncate rounded px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${toneClasses[tone]} ${className}`}
    >
      {children}
    </span>
  );
}

export function inferJobTone(status: string): keyof typeof toneClasses {
  switch (status) {
    case "completed":
      return "ok";
    case "failed":
      return "bad";
    case "running":
      return "active";
    default:
      return "neutral";
  }
}

export function inferRunTone(status: string): keyof typeof toneClasses {
  switch (status) {
    case "succeeded":
      return "ok";
    case "failed":
    case "cancelled":
      return "bad";
    case "running":
      return "active";
    default:
      return "neutral";
  }
}
