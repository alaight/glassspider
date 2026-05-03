"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type NavEntry = {
  href: string;
  label: string;
  exact?: boolean;
};

const nav: NavEntry[] = [
  { href: "/explore", label: "Explore", exact: true },
  { href: "/sources", label: "Sources", exact: false },
  { href: "/url-map", label: "URL map", exact: true },
  { href: "/runs", label: "Runs", exact: true },
  { href: "/data", label: "Data", exact: true },
];

function NavLink(entry: NavEntry) {
  const pathname = usePathname();
  const active = entry.exact ? pathname === entry.href : pathname.startsWith(entry.href);

  return (
    <Link
      href={entry.href}
      className={`block rounded px-2 py-1.5 text-sm font-medium ${
        active ? "bg-slate-900 text-white" : "text-slate-700 hover:bg-slate-50"
      }`}
    >
      {entry.label}
    </Link>
  );
}

export function ConsoleSidebar() {
  return (
    <aside className="sticky top-0 flex h-screen w-52 shrink-0 flex-col border-r border-[var(--panel-border)] bg-[var(--panel)] px-3 py-4">
      <div className="mb-6 px-1">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--muted)]">Control</p>
        <p className="mt-0.5 truncate text-base font-semibold text-slate-900">Glassspider</p>
      </div>
      <nav className="flex flex-col gap-0.5" aria-label="Primary">
        {nav.map((entry) => (
          <NavLink key={entry.href} {...entry} />
        ))}
      </nav>
    </aside>
  );
}
