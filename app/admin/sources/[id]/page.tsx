import { AccessPanel } from "@/components/access-panel";
import { Shell } from "@/components/shell";
import { createSourceRule } from "@/app/admin/actions";
import { requireAdminAccess } from "@/lib/auth";
import { getSource, listSourceRules } from "@/lib/db";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type SourceDetailPageProps = {
  params: Promise<{ id: string }>;
};

export default async function SourceDetailPage({ params }: SourceDetailPageProps) {
  const access = await requireAdminAccess();

  if (access.status !== "granted") {
    return <AccessPanel access={access} />;
  }

  const supabase = await createSupabaseServerClient();

  if (!supabase) {
    return <AccessPanel access={{ status: "configuration_required" }} />;
  }

  const { id } = await params;
  const [source, rules] = await Promise.all([getSource(supabase, id), listSourceRules(supabase, id)]);

  if (!source.data) {
    return (
      <Shell title="Source not found" eyebrow="Admin" navItems={[{ href: "/admin/sources", label: "Sources" }]}>
        <p className="rounded-2xl border border-slate-200 bg-white p-6 text-slate-600">
          The source could not be loaded. {source.error}
        </p>
      </Shell>
    );
  }

  return (
    <Shell
      eyebrow="Admin source"
      title={source.data.name}
      description={source.data.compliance_notes ?? "No compliance notes recorded yet."}
      navItems={[
        { href: "/admin/sources", label: "Sources" },
        { href: "/admin/runs", label: "Runs" },
        { href: "/admin/url-map", label: "URL map" },
      ]}
    >
      <div className="grid gap-6 lg:grid-cols-[1fr_0.8fr]">
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-950">Rules</h2>
          {rules.error ? (
            <p className="mt-3 rounded-xl bg-amber-50 p-4 text-sm text-amber-900">{rules.error}</p>
          ) : null}
          <div className="mt-5 space-y-3">
            {rules.data.map((rule) => (
              <div key={rule.id} className="rounded-2xl border border-slate-200 p-4">
                <div className="flex items-center justify-between gap-4">
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
                    {rule.rule_type}
                  </span>
                  <span className="text-xs text-slate-500">Priority {rule.priority}</span>
                </div>
                <code className="mt-3 block overflow-auto rounded-xl bg-slate-950 p-3 text-xs text-white">
                  {rule.pattern}
                </code>
                {rule.description ? <p className="mt-3 text-sm text-slate-600">{rule.description}</p> : null}
              </div>
            ))}
            {rules.data.length === 0 ? (
              <p className="rounded-2xl bg-slate-50 p-5 text-sm text-slate-500">
                No rules yet. Add include/detail rules before running the crawler.
              </p>
            ) : null}
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-950">Add rule</h2>
          <form action={createSourceRule} className="mt-5 space-y-4">
            <input type="hidden" name="source_id" value={source.data.id} />
            <label className="block text-sm font-medium text-slate-700">
              Rule type
              <select name="rule_type" className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2">
                <option value="include">Include URL</option>
                <option value="exclude">Exclude URL</option>
                <option value="detail">Detail page</option>
                <option value="listing">Listing page</option>
              </select>
            </label>
            <label className="block text-sm font-medium text-slate-700">
              Pattern
              <input name="pattern" className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2" placeholder="/contracts/.+" />
            </label>
            <label className="block text-sm font-medium text-slate-700">
              Priority
              <input name="priority" type="number" defaultValue={100} className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2" />
            </label>
            <label className="block text-sm font-medium text-slate-700">
              Description
              <textarea name="description" rows={3} className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2" />
            </label>
            <button className="w-full rounded-xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white">
              Save rule
            </button>
          </form>
        </section>
      </div>
    </Shell>
  );
}
