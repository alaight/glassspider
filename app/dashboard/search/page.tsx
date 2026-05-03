import { redirect } from "next/navigation";

export default function LegacyDashboardSearchRedirect() {
  redirect("/data");
}
