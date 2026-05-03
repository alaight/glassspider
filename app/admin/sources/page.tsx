import { redirect } from "next/navigation";

export default function LegacyAdminSourcesRedirect() {
  redirect("/sources");
}
