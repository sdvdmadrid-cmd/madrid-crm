import AdminSecurityWatchClient from "@/components/admin/AdminSecurityWatchClient";
import { loadOwnerSecurityWatch } from "@/lib/owner-command-center";

export const dynamic = "force-dynamic";

export default async function OwnerSecurityPage() {
  let initialData = null;
  let loadError = "";

  try {
    initialData = await loadOwnerSecurityWatch();
  } catch (error) {
    loadError = error?.message || "Unable to load security watch";
  }

  return (
    <section className="space-y-4">
      {loadError ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {loadError} — use Refresh after fixing database connectivity.
        </div>
      ) : null}
      <AdminSecurityWatchClient initialData={initialData} />
    </section>
  );
}
