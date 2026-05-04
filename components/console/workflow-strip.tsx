"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type WorkflowStage = {
  label: string;
  href: string;
  match: (pathname: string) => boolean;
};

const STAGES: WorkflowStage[] = [
  { label: "Discover", href: "/explore", match: (pathname) => pathname === "/explore" },
  { label: "Define", href: "/sources", match: (pathname) => pathname.startsWith("/sources") },
  { label: "Scope", href: "/url-map", match: (pathname) => pathname === "/url-map" },
  { label: "Run", href: "/runs", match: (pathname) => pathname === "/runs" },
  {
    label: "Results",
    href: "/data",
    match: (pathname) => pathname === "/data" || pathname.startsWith("/records/"),
  },
];

export function WorkflowStrip() {
  const pathname = usePathname();
  const activeIndex = STAGES.findIndex((stage) => stage.match(pathname));

  return (
    <div className="sticky top-0 z-10 border-b border-[var(--panel-border)] bg-white/95 px-4 py-3 backdrop-blur">
      <div className="flex flex-wrap items-center gap-2">
        {STAGES.map((stage, index) => {
          const active = index === activeIndex;
          const complete = activeIndex > index;
          return (
            <div key={stage.label} className="flex items-center gap-2">
              <Link
                href={stage.href}
                className={`rounded-full px-3 py-1 text-xs font-semibold ${
                  active
                    ? "bg-slate-900 text-white"
                    : complete
                      ? "bg-emerald-100 text-emerald-900"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
                aria-current={active ? "step" : undefined}
              >
                {stage.label}
              </Link>
              {index < STAGES.length - 1 ? <span className="text-xs text-slate-400">→</span> : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
