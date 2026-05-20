import { AdminFinancialDashboardClient } from '@/components/admin/AdminFinancialDashboardClient';
import AdminAiMonitoringClient from '@/components/admin/AdminAiMonitoringClient';

export default function OwnerOverviewPage() {
  return (
    <section className="space-y-6">
      <div className="rounded-2xl border border-white/10 bg-slate-900/70 p-5 text-white">
        <h2 className="text-2xl font-semibold">Mission Control</h2>
        <p className="mt-2 text-sm text-slate-300">
          Centralized visibility for platform health, revenue, and AI usage.
        </p>
      </div>

      <AdminFinancialDashboardClient />
      <AdminAiMonitoringClient />
    </section>
  );
}
