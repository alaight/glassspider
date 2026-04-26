import { AccessPanel } from "@/components/access-panel";
import { Shell } from "@/components/shell";
import { StatusCard } from "@/components/status-card";
import { requireAdminAccess } from "@/lib/auth";
import { listDiscoveredUrls, listRuns, listSources } from "@/lib/db";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const access = await requireAdminAccess();

  if (access.status !== "granted") {
    return <AccessPanel access={access} />;
  }

  const supabase = await createSupabaseServerClient();

  if (!supabase) {
    return <AccessPanel access={{ status: "configuration_required" }} />;
  }

  const [sources, runs, urls] = await Promise.all([
    listSources(supabase),
    listRuns(supabase),
    listDiscoveredUrls(supabase),
  ]);

  const latestRun = runs.data[0];

  return (
    <Shell
      eyebrow="Admin"
      title="Source control room"
      description="Configure procurement sources, inspect crawler output, and monitor scraping runs before records reach the viewer dashboard."
      navItems={[
        { href: "/admin/sources", label: "Sources" },
        { href: "/admin/runs", label: "Runs" },
        { href: "/admin/url-map", label: "URL map" },
      ]}
    >
      <div className="grid gap-4 md:grid-cols-4">
        <StatusCard title="Sources" value={sources.data.length} caption="Configured source definitions" />
        <StatusCard title="Runs" value={runs.data.length} caption="Recent crawl/scrape attempts" />
        <StatusCard title="Mapped URLs" value={urls.data.length} caption="Latest discovered URLs" />
        <StatusCard
          title="Latest status"
          value={latestRun?.status ?? "none"}
          caption={latestRun ? `${latestRun.run_type} run` : "No runs yet"}
        />
      </div>

      {[sources.error, runs.error, urls.error].filter(Boolean).length > 0 ? (
        <section className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
          <p className="font-semibold">Database setup is not complete.</p>
          <p className="mt-2">
            Run the initial migration before using the admin dashboard. Query errors:
            {" "}
            {[sources.error, runs.error, urls.error].filter(Boolean).join(" | ")}
          </p>
        </section>
      ) : null}

      <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-950">Recent runs</h2>
        <div className="mt-4 overflow-hidden rounded-xl border border-slate-200">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Visited</th>
                <th className="px-4 py-3">Discovered</th>
                <th className="px-4 py-3">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {runs.data.slice(0, 8).map((run) => (
                <tr key={run.id}>
                  <td className="px-4 py-3">{run.run_type}</td>
                  <td className="px-4 py-3">{run.status}</td>
                  <td className="px-4 py-3">{run.pages_visited}</td>
                  <td className="px-4 py-3">{run.urls_discovered}</td>
                  <td className="px-4 py-3">{new Date(run.created_at).toLocaleString()}</td>
                </tr>
              ))}
              {runs.data.length === 0 ? (
                <tr>
                  <td className="px-4 py-6 text-slate-500" colSpan={5}>
                    No runs recorded yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </Shell>
  );
}
