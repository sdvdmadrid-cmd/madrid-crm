import AdminAiMonitoringClient from '@/components/admin/AdminAiMonitoringClient';
import AdminBillPaymentsOpsClient from '@/components/admin/AdminBillPaymentsOpsClient';

export default function OwnerMonitoringPage() {
  return (
    <section className="space-y-6">
      <div
        className="rounded-2xl border border-white/10 p-5 text-white"
        style={{
          background:
            "linear-gradient(135deg, rgba(99,102,241,0.18) 0%, rgba(15,118,110,0.2) 100%)",
        }}
      >
        <h2 className="text-xl font-semibold">Platform monitoring</h2>
        <p className="mt-2 text-sm text-slate-300">
          AI usage and Bill Payments operations across all tenants (remittance
          queue, processors, global KPIs). Tenant users do not see this panel.
        </p>
      </div>
      <AdminAiMonitoringClient />
      <AdminBillPaymentsOpsClient mode="platform-owner" />
    </section>
  );
}
