"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

import { Panel } from "@/components/ui/panel";

import { ConsoleButton } from "@/components/ui/button-group";

import type { SidebarNavMode } from "./sidebar";

type InspectorCtx = {
  content: ReactNode | null;
  open: (node: ReactNode) => void;
  close: () => void;
};

const InspectorContext = createContext<InspectorCtx | null>(null);

export function InspectorProvider({ children }: { children: ReactNode }) {
  const [content, setContent] = useState<ReactNode | null>(null);

  const open = useCallback((node: ReactNode) => {
    setContent(node);
  }, []);

  const close = useCallback(() => {
    setContent(null);
  }, []);

  const value = useMemo(() => ({ content, open, close }), [content, open, close]);

  return <InspectorContext.Provider value={value}>{children}</InspectorContext.Provider>;
}

export function useInspector() {
  const ctx = useContext(InspectorContext);
  if (!ctx) {
    throw new Error("useInspector must be used within InspectorProvider");
  }
  return ctx;
}

export function InspectorRail({ navMode }: { navMode: SidebarNavMode }) {
  const { content, close } = useInspector();

  const idleHint =
    navMode === "viewer"
      ? "Pick a row under Data—structured fields, raw capture, and classifiers appear here."
      : navMode === "minimal"
        ? "Finish sign-in above, then revisit Data with Glassspider access."
        : "Select a workspace row or open a drill-down—the inspector shows payloads, raw text, or classifier outputs.";

  return (
    <aside className="relative hidden shrink-0 border-l border-[var(--panel-border)] bg-[var(--panel)] shadow-sm lg:flex lg:w-[380px] lg:flex-col xl:w-[440px]">
      {content ? (
        <>
          <div className="flex justify-end border-b border-[var(--panel-border)] p-2">
            <ConsoleButton variant="ghost" type="button" onClick={() => close()} className="text-xs">
              Close panel
            </ConsoleButton>
          </div>
          <div className="max-h-[calc(100vh-3rem)] flex-1 overflow-y-auto p-2">{content}</div>
        </>
      ) : (
        <div className="flex flex-1 items-center justify-center p-6 text-center text-xs text-[var(--muted)]">
          <Panel title="Inspector" eyebrow="Context" padded className="w-full opacity-85">
            <p>{idleHint}</p>
          </Panel>
        </div>
      )}
    </aside>
  );
}
