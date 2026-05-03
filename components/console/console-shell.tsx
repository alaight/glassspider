"use client";

import type { ReactNode } from "react";

import { ConsoleSidebar, type SidebarNavMode } from "@/components/console/sidebar";

import { InspectorProvider, InspectorRail } from "./inspector";

type ConsoleShellProps = {
  children: ReactNode;
  navMode: SidebarNavMode;
};

export function ConsoleShell({ children, navMode }: ConsoleShellProps) {
  return (
    <InspectorProvider>
      <div className="flex min-h-screen w-full bg-slate-100 text-slate-900">
        <ConsoleSidebar navMode={navMode} />
        <div className="flex min-w-0 flex-1 flex-row">
          <main className="min-w-0 flex-1 overflow-x-auto">{children}</main>
          <InspectorRail navMode={navMode} />
        </div>
      </div>
    </InspectorProvider>
  );
}
