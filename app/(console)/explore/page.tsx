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
      <Panel title="Explorer" eyebrow="Reconnaissance">
        One-off HTTPS fetch to preview HTML, enumerate links, and export draft source/rule hints. Separate from crawler quota and Postgres URL map mutations.
      </Panel>
      <ExploreWorkspace />
    </div>
  );
}
