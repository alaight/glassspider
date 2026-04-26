import { redirect } from "next/navigation";

import { ADMIN_ROLES, LAIGHTWORKS_LOGIN_URL, PROJECT_SLUG, VIEWER_ROLES } from "@/lib/product";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type AccessStatus = "configuration_required" | "unauthenticated" | "denied" | "granted";

export type ProductAccess = {
  status: AccessStatus;
  userId?: string;
  email?: string;
  role?: string;
  message?: string;
};

export async function getProductAccess(): Promise<ProductAccess> {
  const supabase = await createSupabaseServerClient();

  if (!supabase) {
    return {
      status: "configuration_required",
      message: "Supabase env vars are not configured yet.",
    };
  }

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { status: "unauthenticated" };
  }

  const { data: project, error: projectError } = await supabase
    .from("projects")
    .select("id, slug")
    .eq("slug", PROJECT_SLUG)
    .maybeSingle();

  if (projectError || !project) {
    return {
      status: "denied",
      userId: user.id,
      email: user.email ?? undefined,
      message: projectError?.message ?? `Project '${PROJECT_SLUG}' was not found.`,
    };
  }

  const { data: access, error: accessError } = await supabase
    .from("project_access")
    .select("role")
    .eq("project_id", project.id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (accessError || !access || !VIEWER_ROLES.includes(access.role)) {
    return {
      status: "denied",
      userId: user.id,
      email: user.email ?? undefined,
      message: accessError?.message ?? "This account does not have Glassspider access.",
    };
  }

  return {
    status: "granted",
    userId: user.id,
    email: user.email ?? undefined,
    role: access.role,
  };
}

export async function requireProductAccess() {
  const access = await getProductAccess();

  if (access.status === "unauthenticated") {
    redirect(LAIGHTWORKS_LOGIN_URL);
  }

  return access;
}

export async function requireAdminAccess() {
  const access = await requireProductAccess();

  if (access.status !== "granted" || !access.role || !ADMIN_ROLES.includes(access.role)) {
    return {
      ...access,
      status: access.status === "granted" ? "denied" : access.status,
      message: access.message ?? "Admin access is required.",
    } satisfies ProductAccess;
  }

  return access;
}
