import AdminActivityLogClient from "@/components/admin/AdminActivityLogClient";
import { loadOwnerActivityLog } from "@/lib/owner-command-center";

export const dynamic = "force-dynamic";

export default async function OwnerActivityPage() {
  let initialRows = [];
  let loadError = "";

  try {
    initialRows = await loadOwnerActivityLog();
  } catch (error) {
    loadError = error?.message || "Unable to load activity log";
  }

  return (
    <section className="space-y-4">
      {loadError ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {loadError}
        </div>
      ) : null}
      <AdminActivityLogClient initialRows={initialRows} />
    </section>
  );
}
