import { redirect } from "next/navigation";

export default function LegacyAdminOverviewRedirect() {
  redirect("/sources");
}
