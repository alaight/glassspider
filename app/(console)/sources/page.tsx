import Link from "next/link";

import { AccessPanel } from "@/components/access-panel";
import { Panel } from "@/components/ui/panel";
import { ConsoleButton } from "@/components/ui/button-group";
import { createSource, seedBidStatsSource } from "@/app/actions/console";
import { requireAdminAccess } from "@/lib/auth";
import { listSources } from "@/lib/db";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type SourcesPageProps = {
  searchParams: Promise<{ prefillUrl?: string; prefillTitle?: string; suggestRuleType?: string; suggestPattern?: string }>;
};

export default async function SourcesPage({ searchParams }: SourcesPageProps) {
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

  const [sources, search] = await Promise.all([listSources(supabase), searchParams]);

  const defaultName =
    search.prefillTitle ??
    (() => {
      try {
        return search.prefillUrl ? `Source ${new URL(search.prefillUrl).hostname}` : "";
      } catch {
        return "";
      }
    })();

  let defaultSlug = "";
  try {
    if (search.prefillUrl) {
      defaultSlug = `${new URL(search.prefillUrl).hostname.replace(/^www\./, "").replace(/\./g, "-").replace(/[^\w-]+/g, "")}-sandbox`;
      if (defaultSlug.length < 4) defaultSlug += "-src";
      defaultSlug = defaultSlug.slice(0, 64);
    }
  } catch {
    defaultSlug = "";
  }

  return (
    <div className="space-y-4 p-4">
      {(search.prefillUrl || search.suggestPattern) && (
        <Panel eyebrow="From Explore" title="Suggested draft">
          <dl className="grid gap-2 text-xs md:grid-cols-2">
            {search.prefillUrl ? (
              <>
                <dt className="text-[var(--muted)]">Suggested base</dt>
                <dd className="font-mono break-all">{search.prefillUrl}</dd>
              </>
            ) : null}
            {search.suggestPattern ? (
              <>
                <dt className="text-[var(--muted)]">Suggested {search.suggestRuleType ?? "rule"}</dt>
                <dd className="font-mono break-all">{search.suggestPattern}</dd>
              </>
            ) : null}
          </dl>
        </Panel>
      )}

      <div className="grid gap-4 lg:grid-cols-[1.1fr_0.85fr]">
        <Panel title="Configured sources">
          <div className="space-y-2">
            {sources.error ? <p className="text-xs text-amber-800">{sources.error}</p> : null}
            {sources.data.map((source) => (
              <Link
                key={source.id}
                href={`/sources/${source.id}`}
                className="block rounded border border-[var(--panel-border)] bg-white px-3 py-2 text-sm hover:bg-slate-50"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold">{source.name}</span>
                  <span className="text-[11px] uppercase text-[var(--muted)]">{source.status}</span>
                </div>
                <p className="text-xs text-[var(--muted)]">{source.base_url}</p>
              </Link>
            ))}
            {sources.data.length === 0 ? <p className="text-xs text-[var(--muted)]">Nothing configured yet.</p> : null}
          </div>
        </Panel>

        <Panel title="Create source">
          <form action={createSource} className="space-y-3 text-xs">
            <label className="block font-medium">
              Name
              <input defaultValue={defaultName} name="name" className="mt-1 w-full rounded border border-[var(--panel-border)] px-2 py-1.5" required />
            </label>
            <label className="block font-medium">
              Slug
              <input defaultValue={defaultSlug} name="slug" className="mt-1 w-full rounded border border-[var(--panel-border)] px-2 py-1.5 font-mono" required />
            </label>
            <label className="block font-medium">
              Base URL
              <input
                defaultValue={search.prefillUrl ? new URL(search.prefillUrl).origin + "/" : ""}
                name="base_url"
                type="url"
                className="mt-1 w-full rounded border border-[var(--panel-border)] px-2 py-1.5 font-mono text-[11px]"
                required
              />
            </label>
            <label className="block font-medium">
              Entry URLs <span className="text-[var(--muted)]">(one per line)</span>
              <textarea defaultValue={search.prefillUrl ?? ""} name="entry_urls" rows={4} className="mt-1 w-full rounded border border-[var(--panel-border)] px-2 py-1.5 font-mono" required />
            </label>
            <label className="block font-medium">
              Status
              <select defaultValue="draft" name="status" className="mt-1 w-full rounded border border-[var(--panel-border)] bg-white px-2 py-1.5">
                <option value="draft">draft</option>
                <option value="active">active</option>
                <option value="paused">paused</option>
              </select>
            </label>
            <label className="block font-medium">
              Compliance notes
              <textarea name="compliance_notes" rows={3} className="mt-1 w-full rounded border border-[var(--panel-border)] px-2 py-1.5" />
            </label>
            <ConsoleButton variant="primary" type="submit" className="w-full">
              Save source
            </ConsoleButton>
          </form>
          <div className="mt-4 border-t border-[var(--panel-border)] pt-4">
            <form action={seedBidStatsSource} className="flex justify-between gap-3 text-xs">
              <p className="text-[var(--muted)]">Need a turnkey reference configuration?</p>
              <ConsoleButton variant="secondary" type="submit">
                Seed BidStats blueprint
              </ConsoleButton>
            </form>
          </div>
        </Panel>
      </div>
    </div>
  );
}
