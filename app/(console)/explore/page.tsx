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
      <Panel title="Discover a data source" eyebrow="Discover">
        <div className="space-y-3 text-xs leading-relaxed text-slate-700">
          <p>
            Enter a public page URL and Glassspider will inspect it, reveal links, detect hidden JSON/API data sources, and suggest the fastest extraction route.
          </p>
          <div>
            <p className="font-semibold text-slate-900">What happens here</p>
            <ul className="mt-1 list-disc space-y-1 pl-5 text-[var(--muted)] [&>li]:text-slate-700">
              <li>Find whether records come from static HTML, rendered HTML, or a hidden API endpoint.</li>
              <li>Preview candidate data endpoints and promote one into a source draft.</li>
              <li>Keep technical diagnostics available without making them the primary UI.</li>
            </ul>
          </div>
        </div>
      </Panel>
      <ExploreWorkspace />
    </div>
  );
}
