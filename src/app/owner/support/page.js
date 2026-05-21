import AdminFeedbackInboxClient from "@/components/admin/AdminFeedbackInboxClient";
import { loadOwnerSupportQueue } from "@/lib/owner-command-center";

export const dynamic = "force-dynamic";

export default async function OwnerSupportPage() {
  let initialRows = [];
  let tenants = [];
  let loadError = "";

  try {
    const payload = await loadOwnerSupportQueue();
    initialRows = payload.initialRows;
    tenants = payload.tenants;
  } catch (error) {
    loadError = error?.message || "Unable to load support queue";
  }

  return (
    <section className="space-y-4">
      {loadError ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {loadError}
        </div>
      ) : null}
      <AdminFeedbackInboxClient initialRows={initialRows} tenants={tenants} />
    </section>
  );
}
