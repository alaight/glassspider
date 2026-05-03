import type { ReactNode } from "react";

import { ConsoleShell } from "@/components/console/console-shell";
import { getProductAccess } from "@/lib/auth";
import { ADMIN_ROLES } from "@/lib/product";

export default async function ConsoleLayout({ children }: { children: ReactNode }) {
  const access = await getProductAccess();
  const granted = access.status === "granted";
  const operator = granted && typeof access.role === "string" && ADMIN_ROLES.includes(access.role);
  const navMode: "operator" | "viewer" | "minimal" = operator ? "operator" : granted ? "viewer" : "minimal";

  return <ConsoleShell navMode={navMode}>{children}</ConsoleShell>;
}
