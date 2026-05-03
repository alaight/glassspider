"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export type SidebarNavMode = "operator" | "viewer" | "minimal";

type NavEntry = {
  href: string;
  label: string;
  exact?: boolean;
  title?: string;
};

const OPERATOR_NAV: NavEntry[] = [
  { href: "/explore", label: "Explore", exact: true, title: "Fetch any URL once; inspect links without using the crawler" },
  { href: "/sources", label: "Sources", exact: false, title: "Crawl scopes and extractor rules" },
  { href: "/url-map", label: "URL map", exact: true, title: "Discovered links from crawl jobs; queue extract runs" },
  { href: "/runs", label: "Runs", exact: true, title: "Enqueue crawl · extract · classify jobs" },
  { href: "/data", label: "Data", exact: true, title: "Structured rows after extract jobs (full‑text keyword search)" },
];

const VIEWER_NAV: NavEntry[] = [{ href: "/data", label: "Data", exact: true, title: "Structured rows (full‑text keyword search)" }];

const MINIMAL_NAV: NavEntry[] = [{ href: "/", label: "Home", exact: true }];

function NavLink(entry: NavEntry) {
  const pathname = usePathname();
  const active = entry.exact ? pathname === entry.href : pathname.startsWith(entry.href);

  return (
    <Link
      href={entry.href}
      title={entry.title}
      className={`block rounded px-2 py-1.5 text-sm font-medium ${
        active ? "bg-slate-900 text-white" : "text-slate-700 hover:bg-slate-50"
      }`}
    >
      {entry.label}
    </Link>
  );
}

type ConsoleSidebarProps = {
  navMode: SidebarNavMode;
};

export function ConsoleSidebar({ navMode }: ConsoleSidebarProps) {
  const primary = navMode === "operator" ? OPERATOR_NAV : navMode === "viewer" ? VIEWER_NAV : MINIMAL_NAV;

  return (
    <aside className="sticky top-0 flex h-screen w-52 shrink-0 flex-col border-r border-[var(--panel-border)] bg-[var(--panel)] px-3 py-4">
      <div className="mb-6 px-1">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--muted)]">Crawl · extract · review</p>
        <p className="mt-0.5 truncate text-base font-semibold text-slate-900">Glassspider</p>
      </div>
      <nav className="flex flex-col gap-0.5" aria-label="Primary">
        {primary.map((entry) => (
          <NavLink key={entry.href} {...entry} />
        ))}
      </nav>
      {navMode === "operator" ? (
        <div className="mt-auto border-t border-[var(--panel-border)] pt-4 px-1 text-[10px] leading-snug text-slate-500">
          <p className="font-semibold uppercase tracking-wide text-slate-400">Typical flow</p>
          <p className="mt-1">
            Sources → Runs (crawl) → URL map → Runs (extract) → Data. Explore is optional reconnaissance before committing a crawl scope or rule.
          </p>
        </div>
      ) : navMode === "viewer" ? (
        <div className="mt-auto border-t border-[var(--panel-border)] pt-4 px-1 text-[10px] leading-snug text-slate-500">
          Operators manage crawls elsewhere. Records open full detail at <span className="font-mono">/records/…</span> from links in the grid.
        </div>
      ) : (
        <div className="mt-auto border-t border-[var(--panel-border)] pt-4 px-1 text-[10px] text-slate-500">
          Use Home for access prompts, then return with a Glassspider role.
        </div>
      )}
    </aside>
  );
}
