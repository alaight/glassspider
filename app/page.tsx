import { redirect } from "next/navigation";

import { AccessPanel } from "@/components/access-panel";
import { getProductAccess } from "@/lib/auth";
import { ADMIN_ROLES, LAIGHTWORKS_LOGIN_URL } from "@/lib/product";

export default async function HomePage() {
  const access = await getProductAccess();

  if (access.status === "unauthenticated") {
    redirect(LAIGHTWORKS_LOGIN_URL);
  }

  if (access.status !== "granted") {
    return <AccessPanel access={access} />;
  }

  if (access.role && ADMIN_ROLES.includes(access.role)) {
    redirect("/explore");
  }

  redirect("/data");
}
