import { AccessPanel } from "@/components/access-panel";
import { ExploreWorkspace } from "@/components/explore/explore-workspace";
import { Panel } from "@/components/ui/panel";
import { requireAdminAccess } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function ExplorePage() {
  const access = await requireAdminAccess();

  if (access.status !== "granted") {
    return (
      <div className="p-6">
        <AccessPanel access={access} />
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4">
      <Panel title="Explore" eyebrow="Reconnaissance sandbox">
        <div className="space-y-3 text-xs leading-relaxed text-slate-700">
          <p>
            Use Explore to <strong className="font-semibold text-slate-900">probe a single HTTPS page</strong> without running a crawl: you get a rendered preview,
            outbound links, and optional shortcuts that pre-fill{' '}
            <span className="font-medium text-slate-900">Sources</span> with draft patterns. Nothing here writes to the URL map or job queue unless you deliberately
            move work into Sources → Runs later.
          </p>
          <div>
            <p className="font-semibold text-slate-900">When to use it</p>
            <ul className="mt-1 list-disc space-y-1 pl-5 text-[var(--muted)] [&>li]:text-slate-700">
              <li>Checking whether you can reliably fetch HTML from a host before defining a scope.</li>
              <li>Harvesting anchor patterns so crawler rules stay tight (fewer noisy URLs).</li>
              <li>Sanity-testing TLS, redirects, and bot challenges on a lone URL.</li>
            </ul>
          </div>
          <div>
            <p className="font-semibold text-slate-900">Good sites to practise on</p>
            <ul className="mt-1 list-disc space-y-1 pl-5 text-[var(--muted)] [&>li]:text-slate-700">
              <li>Your own staging or a small static brochure site you control.</li>
              <li>Public listing pages whose terms allow crawling (respect robots.txt and acceptable use).</li>
              <li>Avoid authenticated portals or heavy SPA-only shells until the fetch path supports them.</li>
            </ul>
          </div>
        </div>
      </Panel>
      <ExploreWorkspace />
    </div>
  );
}
