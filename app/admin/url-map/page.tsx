import { AccessPanel } from "@/components/access-panel";
import { Shell } from "@/components/shell";
import { requireAdminAccess } from "@/lib/auth";
import { listDiscoveredUrls } from "@/lib/db";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function UrlMapPage() {
  const access = await requireAdminAccess();

  if (access.status !== "granted") {
    return <AccessPanel access={access} />;
  }

  const supabase = await createSupabaseServerClient();

  if (!supabase) {
    return <AccessPanel access={{ status: "configuration_required" }} />;
  }

  const urls = await listDiscoveredUrls(supabase);

  return (
    <Shell
      eyebrow="Admin"
      title="URL map"
      description="Inspect discovered URLs before detail scraping. This is the visibility layer for crawler behaviour and source structure changes."
      navItems={[
        { href: "/admin", label: "Overview" },
        { href: "/admin/sources", label: "Sources" },
        { href: "/admin/runs", label: "Runs" },
      ]}
    >
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        {urls.error ? (
          <p className="mb-4 rounded-xl bg-amber-50 p-4 text-sm text-amber-900">{urls.error}</p>
        ) : null}
        <div className="overflow-hidden rounded-xl border border-slate-200">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <th className="px-4 py-3">URL</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">HTTP</th>
                <th className="px-4 py-3">Last seen</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {urls.data.map((url) => (
                <tr key={url.id}>
                  <td className="max-w-xl px-4 py-3">
                    <a href={url.url} target="_blank" rel="noreferrer" className="break-all text-teal-700">
                      {url.url}
                    </a>
                    {url.matched_rule ? (
                      <p className="mt-1 font-mono text-xs text-slate-400">{url.matched_rule}</p>
                    ) : null}
                  </td>
                  <td className="px-4 py-3">{url.url_type}</td>
                  <td className="px-4 py-3">{url.status}</td>
                  <td className="px-4 py-3">{url.http_status ?? "-"}</td>
                  <td className="px-4 py-3">{new Date(url.last_seen_at).toLocaleString()}</td>
                </tr>
              ))}
              {urls.data.length === 0 ? (
                <tr>
                  <td className="px-4 py-6 text-slate-500" colSpan={5}>
                    No URLs mapped yet.
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
