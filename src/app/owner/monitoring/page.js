import AdminAiMonitoringClient from '@/components/admin/AdminAiMonitoringClient';
import AdminBillPaymentsOpsClient from '@/components/admin/AdminBillPaymentsOpsClient';

export default function OwnerMonitoringPage() {
  return (
    <section className="space-y-6">
      <AdminAiMonitoringClient />
      <AdminBillPaymentsOpsClient mode="platform-owner" />
    </section>
  );
}
