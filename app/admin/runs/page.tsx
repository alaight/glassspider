import { redirect } from "next/navigation";

export default function LegacyAdminRunsRedirect() {
  redirect("/runs");
}
