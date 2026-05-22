import AdminCapacitySnapshotClient from "@/components/admin/AdminCapacitySnapshotClient";
import AdminDashboardTableClient from "@/components/admin/AdminDashboardTableClient";
import { buildOwnerTenantCommandRows } from "@/lib/owner-command-center";

export const dynamic = "force-dynamic";

export default async function OwnerTenantsPage() {
  let rows = [];
  let loadError = "";

  try {
    rows = await buildOwnerTenantCommandRows();
  } catch (error) {
    loadError = error?.message || "Unable to load tenant command center";
  }

  return (
    <section className="space-y-6">
      <div
        className="rounded-2xl border border-white/10 p-5 text-white"
        style={{
          background:
            "linear-gradient(135deg, rgba(99,102,241,0.18) 0%, rgba(15,118,110,0.2) 100%)",
        }}
      >
        <h2 className="text-xl font-semibold">Tenant command center</h2>
        <p className="mt-2 text-sm text-slate-300">
          Every contractor account: extend trials, reset passwords, export CSV, and inspect workload.
        </p>
      </div>

      <AdminCapacitySnapshotClient />

      {loadError ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {loadError}
        </div>
      ) : (
        <AdminDashboardTableClient rows={rows} />
      )}
    </section>
  );
}
