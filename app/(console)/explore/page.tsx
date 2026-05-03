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
      <Panel title="Explorer" eyebrow="Ad-hoc">
        Fetch arbitrary HTTPS pages inside a sandbox, enumerate anchors, harvest patterns without touching your Supabase crawl budget.
      </Panel>
      <ExploreWorkspace />
    </div>
  );
}
