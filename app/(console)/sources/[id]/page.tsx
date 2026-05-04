import { AccessPanel } from "@/components/access-panel";
import { Panel } from "@/components/ui/panel";
import { ConsoleButton } from "@/components/ui/button-group";
import { createSourceRule, updateSourceFetchStrategy } from "@/app/actions/console";
import { requireAdminAccess } from "@/lib/auth";
import { getSource, listSourceRules } from "@/lib/db";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type SourceDetailPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ suggestRuleType?: string; suggestPattern?: string }>;
};

export default async function SourceDetailPage({ params, searchParams }: SourceDetailPageProps) {
  const access = await requireAdminAccess();

  if (access.status !== "granted") {
    return (
      <div className="p-6">
        <AccessPanel access={access} />
      </div>
    );
  }

  const supabase = await createSupabaseServerClient();

  if (!supabase) {
    return (
      <div className="p-6">
        <AccessPanel access={{ status: "configuration_required" }} />
      </div>
    );
  }

  const [{ id }, search] = await Promise.all([params, searchParams]);
  const [source, rules] = await Promise.all([getSource(supabase, id), listSourceRules(supabase, id)]);

  if (!source.data) {
    return (
      <div className="p-6">
        <Panel title="Source missing">
          <p className="text-xs text-[var(--muted)]">{source.error ?? "Reload or return to Sources."}</p>
        </Panel>
      </div>
    );
  }

  const defaultRuleType = search.suggestRuleType === "detail" ? "detail" : search.suggestRuleType === "listing" ? "listing" : "include";

  return (
    <div className="space-y-4 p-4">
      <Panel title={source.data.name} eyebrow="Source registry">
        <p className="text-xs">{source.data.compliance_notes ?? "No operator notes logged."}</p>
        <p className="mt-2 font-mono text-[11px] text-[var(--muted)]">{source.data.base_url}</p>
        <p className="mt-2 text-xs text-slate-700">
          Fetch mode: <span className="font-semibold">{source.data.fetch_mode ?? "static_html"}</span>
        </p>
      </Panel>

      <Panel title="Fetch strategy" eyebrow="Source-level mode + interaction config">
        <form action={updateSourceFetchStrategy} className="space-y-3 text-xs">
          <input type="hidden" name="source_id" value={source.data.id} />
          <label className="block font-medium">
            Mode
            <select
              name="fetch_mode"
              defaultValue={source.data.fetch_mode ?? "static_html"}
              className="mt-1 w-full rounded border border-[var(--panel-border)] bg-white px-2 py-1.5"
            >
              <option value="static_html">static_html</option>
              <option value="rendered_html">rendered_html (Playwright)</option>
              <option value="discovered_api">discovered_api (render + endpoint capture)</option>
              <option value="declared_api">declared_api endpoint</option>
            </select>
          </label>
          <label className="block font-medium">
            Fetch config JSON
            <textarea
              name="fetch_config_json"
              rows={8}
              defaultValue={JSON.stringify(source.data.fetch_config ?? {}, null, 2)}
              className="mt-1 w-full rounded border border-[var(--panel-border)] px-2 py-1.5 font-mono text-[11px]"
            />
          </label>
          <p className="text-[11px] text-[var(--muted)]">
            Supports rendered steps: click, fill, select, wait_for_selector, wait_for_timeout, wait_for_network_idle.
          </p>
          <ConsoleButton variant="primary" type="submit">
            Save fetch strategy
          </ConsoleButton>
        </form>
      </Panel>

      <div className="grid gap-4 lg:grid-cols-[1.1fr_0.85fr]">
        <Panel title={`Rules (${rules.data.length})`}>
          <div className="space-y-2">
            {rules.error ? <p className="text-xs text-amber-900">{rules.error}</p> : null}
            {rules.data.map((rule) => (
              <div key={rule.id} className="rounded border border-[var(--panel-border)] bg-slate-50 p-3 text-xs">
                <div className="flex items-center gap-2 text-[11px] uppercase text-[var(--muted)]">
                  <span>{rule.rule_type}</span>
                  <span>prio {rule.priority}</span>
                </div>
                <pre className="mt-2 overflow-auto rounded bg-slate-950 p-2 text-[11px] text-emerald-100">{rule.pattern}</pre>
                {rule.description ? <p className="mt-2 text-[var(--muted)]">{rule.description}</p> : null}
              </div>
            ))}
          </div>
        </Panel>

        <Panel title="Add crawler rule">
          <form action={createSourceRule} className="space-y-3 text-xs">
            <input type="hidden" name="source_id" value={source.data.id} />
            <label className="block font-medium">
              Type
              <select defaultValue={defaultRuleType} name="rule_type" className="mt-1 w-full rounded border border-[var(--panel-border)] bg-white px-2 py-1.5">
                <option value="include">include URL</option>
                <option value="exclude">exclude URL</option>
                <option value="detail">detail URL</option>
                <option value="listing">listing URL</option>
              </select>
            </label>
            <label className="block font-medium">
              Pattern / regex anchor
              <input defaultValue={search.suggestPattern ?? ""} name="pattern" className="mt-1 w-full rounded border border-[var(--panel-border)] px-2 py-1.5 font-mono" placeholder="/documents/.+" required />
            </label>
            <label className="block font-medium">
              Priority
              <input defaultValue={100} name="priority" type="number" className="mt-1 w-full rounded border border-[var(--panel-border)] px-2 py-1.5" />
            </label>
            <label className="block font-medium">
              Notes
              <textarea rows={3} name="description" className="mt-1 w-full rounded border border-[var(--panel-border)] px-2 py-1.5" />
            </label>
            <ConsoleButton variant="primary" type="submit" className="w-full">
              Save rule
            </ConsoleButton>
          </form>
        </Panel>
      </div>
    </div>
  );
}
